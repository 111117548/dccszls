const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = {
  subscriptions: 'quality-notification-subscriptions',
  logs: 'quality-notification-logs',
  projects: 'quality-projects',
  foundations: 'quality-project-foundations',
  rectifications: 'quality-rectification-orders',
  bindings: 'feishu-user-bindings'
};

let collectionsReady = false;

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
}

function subscriptionId(projectId, type, openId) {
  return safeId(projectId) + '__' + safeId(type) + '__' + safeId(openId);
}

function chinaNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

function chinaParts() {
  const now = chinaNow();
  const iso = now.toISOString();
  const jsDay = now.getUTCDay();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    dateTime: iso.slice(0, 10) + ' ' + iso.slice(11, 19),
    weekDay: jsDay === 0 ? 7 : jsDay,
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
    weekKey: weekKey(now)
  };
}

function weekKey(date) {
  const value = new Date(date.getTime());
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return value.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function fitThing(value, fallback) {
  return String(value || fallback || '待处理').replace(/[\n\r]/g, ' ').slice(0, 20);
}

function fitName(value, fallback) {
  return String(value || fallback || '项目负责人').replace(/[\n\r]/g, ' ').slice(0, 10);
}

function normalizeTime(value, fallback) {
  const text = String(value || fallback || '09:00');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : (fallback || '09:00');
}

function templateConfig(type) {
  const isDispatch = type === 'dispatch';
  const templateId = String(process.env[isDispatch ? 'DISPATCH_REMINDER_TEMPLATE_ID' : 'WEEKLY_RECTIFICATION_TEMPLATE_ID'] || '');
  const mode = String(process.env[isDispatch ? 'DISPATCH_REMINDER_MODE' : 'WEEKLY_RECTIFICATION_REMINDER_MODE'] || '') === 'long_term' ? 'long_term' : 'one_time';
  return {
    templateId: templateId,
    templateConfigured: !!templateId,
    mode: mode,
    modeName: mode === 'long_term' ? '长期订阅' : '一次性订阅'
  };
}

function fullConfig() {
  const contractorId = String(process.env.RECTIFICATION_REMINDER_TEMPLATE_ID || '');
  const contractorMode = String(process.env.RECTIFICATION_REMINDER_MODE || '') === 'long_term' ? 'long_term' : 'one_time';
  return {
    dispatch: templateConfig('dispatch'),
    weekly: templateConfig('weekly'),
    contractor: {
      templateConfigured: !!contractorId,
      mode: contractorMode,
      modeName: contractorMode === 'long_term' ? '长期订阅' : '一次性订阅',
      sendTime: normalizeTime(process.env.RECTIFICATION_REMINDER_SEND_TIME, '09:00')
    }
  };
}

function sanitizeSubscription(value) {
  const item = value || {};
  return {
    enabled: !!item.enabled,
    needsRenewal: !!item.needsRenewal,
    mode: item.mode || 'one_time',
    weekDay: Number(item.weekDay || 1),
    sendTime: item.sendTime || '09:00',
    sentCount: Number(item.sentCount || 0),
    lastSentAtText: item.lastSentAtText || '',
    lastError: item.lastError || ''
  };
}

async function ensureCollections() {
  if (collectionsReady) return;
  const names = [COLLECTIONS.subscriptions, COLLECTIONS.logs];
  for (let i = 0; i < names.length; i++) {
    try {
      await db.collection(names[i]).limit(1).get();
    } catch (error) {
      if (typeof db.createCollection !== 'function') throw error;
      try { await db.createCollection(names[i]); } catch (createError) {
        try { await db.collection(names[i]).limit(1).get(); } catch (verifyError) { throw createError; }
      }
    }
  }
  collectionsReady = true;
}

async function loadProject(projectId) {
  try { return (await db.collection(COLLECTIONS.projects).doc(safeId(projectId)).get()).data; } catch (error) { return null; }
}

async function requireBoundUser(openId) {
  let binding = null;
  try { binding = (await db.collection(COLLECTIONS.bindings).doc(safeId(openId)).get()).data; } catch (error) {}
  if (!binding || !binding.enabled) {
    const error = new Error('请先绑定飞书账号后再开启项目提醒');
    error.code = 'FEISHU_ACCOUNT_NOT_BOUND';
    throw error;
  }
  return binding;
}

async function loadSubscription(projectId, type, openId) {
  try {
    return (await db.collection(COLLECTIONS.subscriptions).doc(subscriptionId(projectId, type, openId)).get()).data;
  } catch (error) {
    return null;
  }
}

async function loadAll(collectionName, condition) {
  const all = [];
  let offset = 0;
  while (true) {
    const result = await db.collection(collectionName).where(condition || {}).skip(offset).limit(100).get();
    const rows = result.data || [];
    Array.prototype.push.apply(all, rows);
    if (rows.length < 100) break;
    offset += rows.length;
  }
  return all;
}

async function getSettings(projectId, openId) {
  await requireBoundUser(openId);
  const project = await loadProject(projectId);
  if (!project) {
    const error = new Error('项目尚未建立云端档案，请先在首页重新选择项目');
    error.code = 'PROJECT_NOT_LINKED';
    throw error;
  }
  const values = await Promise.all([
    loadSubscription(projectId, 'dispatch', openId),
    loadSubscription(projectId, 'weekly', openId)
  ]);
  return {
    success: true,
    config: fullConfig(),
    subscriptions: {
      dispatch: sanitizeSubscription(values[0]),
      weekly: sanitizeSubscription(values[1])
    }
  };
}

async function register(projectId, type, openId, payload) {
  const binding = await requireBoundUser(openId);
  if (['dispatch', 'weekly'].indexOf(type) === -1) throw new Error('不支持的提醒类型');
  const project = await loadProject(projectId);
  if (!project) throw new Error('项目尚未建立云端档案');
  const config = templateConfig(type);
  if (!config.templateConfigured) throw new Error('管理员尚未配置该提醒模板');
  if (String(payload.templateId || '') !== config.templateId) throw new Error('提醒模板配置不一致，请重新打开页面');
  const options = payload.options || {};
  const id = subscriptionId(projectId, type, openId);
  let previous = null;
  try { previous = (await db.collection(COLLECTIONS.subscriptions).doc(id).get()).data; } catch (error) {}
  const record = Object.assign({}, previous || {}, {
    projectId: projectId,
    projectName: project.feishuProjectName || project.name || '',
    recipientOpenId: openId,
    recipientName: binding.name || '项目负责人',
    type: type,
    templateId: config.templateId,
    mode: config.mode,
    enabled: true,
    needsRenewal: false,
    weekDay: type === 'weekly' ? Math.max(1, Math.min(7, Number(options.weekDay) || 1)) : 0,
    sendTime: type === 'weekly' ? normalizeTime(options.sendTime, '09:00') : '',
    lastAuthorizedAtText: chinaParts().dateTime,
    updatedAt: db.serverDate()
  });
  await db.collection(COLLECTIONS.subscriptions).doc(id).set({ data: record });
  return getSettings(projectId, openId);
}

async function disable(projectId, type, openId) {
  await requireBoundUser(openId);
  try {
    await db.collection(COLLECTIONS.subscriptions).doc(subscriptionId(projectId, type, openId)).update({ data: {
      enabled: false,
      needsRenewal: false,
      disabledAtText: chinaParts().dateTime,
      updatedAt: db.serverDate()
    }});
  } catch (error) {}
  return getSettings(projectId, openId);
}

async function logSend(subscription, result, detail) {
  const parts = chinaParts();
  await db.collection(COLLECTIONS.logs).add({ data: {
    projectId: subscription.projectId,
    recipientOpenId: subscription.recipientOpenId,
    type: subscription.type,
    result: result,
    detail: detail || {},
    createdAtText: parts.dateTime,
    createdAt: db.serverDate()
  }});
}

async function sendMessage(subscription, data, page, successUpdate) {
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: subscription.recipientOpenId,
      templateId: subscription.templateId,
      page: page,
      lang: 'zh_CN',
      data: data
    });
    const isLongTerm = subscription.mode === 'long_term';
    await db.collection(COLLECTIONS.subscriptions).doc(subscription._id).update({ data: Object.assign({
      enabled: isLongTerm,
      needsRenewal: !isLongTerm,
      sentCount: db.command.inc(1),
      lastSentAtText: chinaParts().dateTime,
      lastError: '',
      retryAfterTimestamp: 0,
      updatedAt: db.serverDate()
    }, successUpdate || {}) });
    await logSend(subscription, 'sent', successUpdate || {});
    return { sent: true };
  } catch (error) {
    const message = String(error.errMsg || error.message || error).slice(0, 300);
    await db.collection(COLLECTIONS.subscriptions).doc(subscription._id).update({ data: {
      lastError: message,
      lastAttemptAtText: chinaParts().dateTime,
      retryAfterTimestamp: Date.now() + 60 * 60 * 1000,
      updatedAt: db.serverDate()
    }});
    await logSend(subscription, 'failed', { error: message });
    return { failed: true, error: message };
  }
}

function deviceNameMap(foundation) {
  const map = {};
  (foundation.devices || []).forEach(function (item) { map[item.id] = item.feishuDeviceName || item.name || item.id; });
  return map;
}

const FORECAST_DEPENDENCIES = [
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [5, 8],
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13]
];
const FORECAST_STAGE_NAMES = ['支座', '基础梁', '钢支架', '灰斗', '壳体', '进出口', '阳极系统', '阴极系统', '振打系统', '高压设备', '平台扶梯', '电气仪表', '调试验收'];

function percent(value, total) {
  total = Number(total || 0);
  return total > 0 ? Math.max(0, Math.min(100, Number((Number(value || 0) / total * 100).toFixed(1)))) : 0;
}

function forecastElapsedDays(baseDate, currentDate) {
  if (!baseDate || !currentDate) return 0;
  const start = Date.parse(String(baseDate).slice(0, 10) + 'T00:00:00Z');
  const end = Date.parse(String(currentDate).slice(0, 10) + 'T00:00:00Z');
  return isNaN(start) || isNaN(end) ? 0 : Math.max(0, Math.floor((end - start) / 86400000));
}

function projectedInstallProgress(metric, currentDate) {
  const actual = percent(metric.installedQuantity, metric.plannedQuantity);
  if (metric.progressMode !== 'forecast') return actual;
  const base = Number(metric.forecastBasePercent == null ? actual : metric.forecastBasePercent);
  const daily = Math.max(0.1, Math.min(30, Number(metric.forecastDailyPercent || 5)));
  return Math.max(actual, Math.min(100, Number((base + forecastElapsedDays(metric.forecastBaseDate, currentDate) * daily).toFixed(1))));
}

function projectedDispatchAlerts(foundation, parts, names) {
  const results = [];
  Object.keys(foundation.deviceStates || {}).forEach(function (deviceId) {
    const state = foundation.deviceStates[deviceId] || {};
    const metrics = state.stageMetrics || {};
    FORECAST_DEPENDENCIES.forEach(function (pair) {
      const sourceIndex = pair[0];
      const targetIndex = pair[1];
      if (Number(state.actualStageIndex || 1) !== sourceIndex) return;
      const source = metrics['stage-' + String(sourceIndex).padStart(2, '0')] || {};
      const target = metrics['stage-' + String(targetIndex).padStart(2, '0')] || {};
      const progress = projectedInstallProgress(source, parts.date);
      const prepare = Math.max(50, Math.min(95, Number(source.warningPreparePercent == null ? 75 : source.warningPreparePercent)));
      const dispatch = Math.max(prepare, Math.min(100, Number(source.warningDispatchPercent == null ? 80 : source.warningDispatchPercent)));
      const targetPlan = target.summaryOverrideEnabled ? Number(target.summaryDemandQuantity || 0) : Number(target.manifestPlannedPackages || 0);
      const targetArrived = target.summaryOverrideEnabled ? Number(target.summaryArrivalQuantity || 0) : Number(target.manifestArrivedPackages || 0);
      const supply = targetPlan > 0 ? percent(targetArrived, targetPlan) : percent(target.shippedQuantity, target.plannedQuantity);
      if (supply >= 100 || progress < prepare) return;
      const urgent = progress >= dispatch;
      results.push({
        key: (urgent ? 'ratio-dispatch:' : 'ratio-prepare:') + 'stage-' + String(sourceIndex).padStart(2, '0') + ':stage-' + String(targetIndex).padStart(2, '0'),
        type: 'ratio', level: urgent ? 'orange' : 'yellow', levelName: urgent ? '预警' : '关注',
        sourceIndex: sourceIndex, targetIndex: targetIndex,
        title: (urgent ? '请安排' : '提前准备') + FORECAST_STAGE_NAMES[targetIndex - 1] + '发货',
        message: FORECAST_STAGE_NAMES[sourceIndex - 1] + (source.progressMode === 'forecast' ? '预测' : '实际') + '进度' + progress + '%，' + FORECAST_STAGE_NAMES[targetIndex - 1] + (targetPlan > 0 ? '到货覆盖率' : '发货完成率') + supply + '%。',
        threshold: urgent ? dispatch : prepare, calculatedValue: progress,
        occurrenceCount: 1, updatedAt: Date.now(), deviceId: deviceId, deviceName: names[deviceId] || deviceId
      });
    });
  });
  return results;
}

async function processDispatch(subscription, parts) {
  if (Number(subscription.retryAfterTimestamp || 0) > Date.now()) return { skipped: true };
  let foundation = null;
  try { foundation = (await db.collection(COLLECTIONS.foundations).doc(safeId(subscription.projectId)).get()).data; } catch (error) {}
  if (!foundation) return { skipped: true };
  const names = deviceNameMap(foundation);
  const sentKeys = Array.isArray(subscription.sentDispatchKeys) ? subscription.sentDispatchKeys : [];
  const alerts = [];
  const queuedKeys = {};
  Object.keys(foundation.deviceStates || {}).forEach(function (deviceId) {
    const state = foundation.deviceStates[deviceId] || {};
    (state.dispatchAlerts || []).forEach(function (alert) {
      if (alert.status !== 'active') return;
      const key = deviceId + ':' + (alert.key || alert.id || alert.title) + ':' + Number(alert.occurrenceCount || 1);
      if (sentKeys.indexOf(key) !== -1) return;
      queuedKeys[key] = true;
      alerts.push(Object.assign({}, alert, { notificationKey: key, deviceId: deviceId, deviceName: names[deviceId] || deviceId }));
    });
  });
  projectedDispatchAlerts(foundation, parts, names).forEach(function (alert) {
    const key = alert.deviceId + ':' + alert.key + ':' + Number(alert.occurrenceCount || 1);
    if (sentKeys.indexOf(key) !== -1 || queuedKeys[key]) return;
    queuedKeys[key] = true;
    alerts.push(Object.assign({}, alert, { notificationKey: key }));
  });
  if (!alerts.length) return { skipped: true };
  alerts.sort(function (a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0); });
  const alert = alerts[0];
  const nextKeys = sentKeys.concat(alerts.map(function (item) { return item.notificationKey; })).slice(-120);
  return sendMessage(subscription, {
    thing24: { value: fitThing(subscription.projectName, '施工项目') },
    thing12: { value: fitThing(alert.title || (alert.deviceName + '发货预警'), '发货节点预警') },
    name3: { value: fitName(subscription.recipientName, '项目负责人') },
    thing36: { value: fitThing(alerts.length > 1 ? (alert.deviceName + '等' + alerts.length + '项需催发货') : (alert.message || '请及时安排发货'), '请及时安排发货') },
    time33: { value: parts.dateTime }
  }, 'pages/construction-progress/construction-progress?stageIndex=' + encodeURIComponent(alert.targetIndex || alert.sourceIndex || 1) + '&source=notification', {
    sentDispatchKeys: nextKeys,
    lastDispatchKey: alert.notificationKey,
    lastDispatchDate: parts.date
  });
}

function deadlineTimestamp(order) {
  if (Number(order.deadlineTimestamp || 0)) return Number(order.deadlineTimestamp);
  const text = String(order.deadline || '').replace(/-/g, '/');
  const date = text ? new Date(text) : null;
  return date && !isNaN(date.getTime()) ? date.getTime() : 0;
}

async function processWeekly(subscription, parts) {
  if (Number(subscription.retryAfterTimestamp || 0) > Date.now()) return { skipped: true };
  if (Number(subscription.weekDay || 1) !== parts.weekDay) return { skipped: true };
  if (parts.time < normalizeTime(subscription.sendTime, '09:00')) return { skipped: true };
  if (subscription.lastWeeklyKey === parts.weekKey) return { skipped: true };
  const orders = await loadAll(COLLECTIONS.rectifications, { projectId: subscription.projectId });
  const ongoing = orders.filter(function (item) { return item.status !== 'closed'; });
  const review = ongoing.filter(function (item) { return item.status === 'review'; }).length;
  const pending = ongoing.length - review;
  const now = Date.now();
  const overdue = ongoing.filter(function (item) {
    const timestamp = deadlineTimestamp(item);
    return timestamp > 0 && timestamp < now;
  }).length;
  if (!ongoing.length) {
    await db.collection(COLLECTIONS.subscriptions).doc(subscription._id).update({ data: {
      lastWeeklyKey: parts.weekKey,
      lastWeeklyNoopAtText: parts.dateTime,
      updatedAt: db.serverDate()
    }});
    return { noop: true };
  }
  return sendMessage(subscription, {
    thing24: { value: fitThing(subscription.projectName, '施工项目') },
    thing12: { value: '未闭环整改周报' },
    name3: { value: fitName(subscription.recipientName, '项目负责人') },
    thing36: { value: fitThing('待整改' + pending + ' 待复验' + review + ' 逾期' + overdue, '请及时处理') },
    time33: { value: parts.dateTime }
  }, 'pages/history/history?tab=rectification', {
    lastWeeklyKey: parts.weekKey,
    lastWeeklyDate: parts.date,
    lastWeeklyPending: pending,
    lastWeeklyReview: review,
    lastWeeklyOverdue: overdue
  });
}

async function runDispatcher() {
  const parts = chinaParts();
  const list = await loadAll(COLLECTIONS.subscriptions, { enabled: true });
  const summary = { success: true, checked: list.length, sent: 0, failed: 0, skipped: 0 };
  for (let i = 0; i < list.length; i++) {
    const subscription = list[i];
    let outcome = null;
    try {
      if (subscription.type === 'dispatch') outcome = await processDispatch(subscription, parts);
      else if (subscription.type === 'weekly') outcome = await processWeekly(subscription, parts);
      else outcome = { skipped: true };
    } catch (error) {
      outcome = { failed: true, error: error.message || String(error) };
      await logSend(subscription, 'failed', { error: outcome.error });
    }
    if (outcome && outcome.sent) summary.sent++;
    else if (outcome && outcome.failed) summary.failed++;
    else summary.skipped++;
  }
  return summary;
}

exports.main = async function (event) {
  await ensureCollections();
  const action = event && event.action || 'run';
  const payload = event && event.payload || {};
  const openId = String(cloud.getWXContext().OPENID || '');
  try {
    if (action === 'run') return runDispatcher();
    const projectId = String(payload.projectId || '');
    if (!projectId) throw new Error('缺少项目 ID');
    if (action === 'getSettings') return getSettings(projectId, openId);
    if (action === 'register') return register(projectId, String(payload.type || ''), openId, payload);
    if (action === 'disable') return disable(projectId, String(payload.type || ''), openId);
    throw new Error('不支持的提醒操作');
  } catch (error) {
    return { success: false, error: error.message || String(error), code: error.code || '' };
  }
};
