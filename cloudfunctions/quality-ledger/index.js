const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = {
  projects: 'quality-projects', members: 'project-members', inspections: 'quality-inspections',
  defects: 'quality-defects', reports: 'quality-reports', audits: 'quality-audit-logs',
  rectifications: 'quality-rectification-orders', reminders: 'quality-rectification-reminders',
  foundations: 'quality-project-foundations', processRecords: 'quality-process-records'
};
const ROLE_NAMES = { platform_admin: '平台管理员', project_manager: '项目经理' };
const STATUS_NAMES = { pending: '待整改', rectifying: '整改中', review: '待复验', closed: '已闭环', rejected: '已驳回' };

// A newly created CloudBase environment may not contain any collections yet.
// Provision the ledger collections lazily in the trusted cloud function so that
// open-link rectification and reminder flows do not fail on first use.
var collectionsReady = false;
async function ensureLedgerCollections() {
  if (collectionsReady) return;
  var names = Object.keys(COLLECTIONS).map(function (key) { return COLLECTIONS[key]; });
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    try {
      await db.collection(name).limit(1).get();
    } catch (readError) {
      if (typeof db.createCollection !== 'function') throw readError;
      try {
        await db.createCollection(name);
      } catch (createError) {
        // Parallel cold starts can try to create the same collection. Verify it
        // exists after the create attempt before treating it as a real failure.
        try { await db.collection(name).limit(1).get(); } catch (verifyError) { throw createError; }
      }
    }
  }
  collectionsReady = true;
}

function safeId(value) { return String(value || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120); }
function entityDocId(projectId, entityId) { return safeId(projectId) + '__' + safeId(entityId); }
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function cleanEntity(value) {
  var item = clone(value); delete item._id; delete item._openid;
  ['image', 'imagePath'].forEach(function (key) {
    if (item[key] && String(item[key]).indexOf('cloud://') !== 0) { item.localImagePending = true; item[key] = ''; }
  });
  return item;
}
function requireField(value, name) { if (!value) throw new Error('缺少字段：' + name); }
function tokenHash(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex'); }
function chinaTimeText() { return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }
function sanitizeOpenOrder(value) {
  var item = cleanEntity(value); delete item.shareTokenHash; delete item.createdByOpenId; delete item.updatedBy;
  return item;
}
function verifyOpenToken(order, rawToken) {
  if (!order || !rawToken || !order.shareTokenHash || tokenHash(rawToken) !== order.shareTokenHash) throw new Error('整改协作链接无效或已失效');
}
function reminderDocId(projectId, orderId, openId) {
  return safeId(projectId) + '__' + safeId(orderId) + '__' + safeId(openId);
}
function getReminderConfig() {
  var mode = process.env.RECTIFICATION_REMINDER_MODE === 'long_term' ? 'long_term' : 'one_time';
  var configuredTime = String(process.env.RECTIFICATION_REMINDER_SEND_TIME || '09:00');
  var sendTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(configuredTime) ? configuredTime : '09:00';
  return {
    templateId: String(process.env.RECTIFICATION_REMINDER_TEMPLATE_ID || ''),
    templateConfigured: !!process.env.RECTIFICATION_REMINDER_TEMPLATE_ID,
    mode: mode,
    modeName: mode === 'long_term' ? '长期订阅' : '一次性订阅',
    sendTime: sendTime
  };
}
function sanitizeReminder(value, config) {
  var item = value || {};
  return {
    enabled: !!item.enabled,
    needsRenewal: !!item.needsRenewal,
    mode: (config && config.mode) || item.mode || 'one_time',
    sentCount: Number(item.sentCount || 0),
    lastSentAtText: item.lastSentAtText || '',
    lastAuthorizedAtText: item.lastAuthorizedAtText || '',
    sendTime: item.sendTime || (config && config.sendTime) || '09:00'
  };
}
async function getReminderState(projectId, orderId, openId, config) {
  try {
    var result = await db.collection(COLLECTIONS.reminders).doc(reminderDocId(projectId, orderId, openId)).get();
    return sanitizeReminder(result.data, config);
  } catch (e) {
    return sanitizeReminder(null, config);
  }
}

async function ensureProject(project, openId) {
  requireField(project && project.id, 'project.id');
  var projectData = cleanEntity(project);
  await db.collection(COLLECTIONS.projects).doc(safeId(project.id)).set({ data: Object.assign({}, projectData, { projectId: project.id, updatedAt: db.serverDate(), updatedBy: openId }) });
}

async function resolveActor(openId) {
  var binding = null;
  try { binding = (await db.collection('feishu-user-bindings').doc(safeId(openId)).get()).data; } catch (e) {}
  if (!binding || !binding.enabled) {
    var bindingError = new Error('请先绑定飞书账号');
    bindingError.code = 'FEISHU_ACCOUNT_NOT_BOUND';
    throw bindingError;
  }
  var identifiers = [binding.feishuOpenId, binding.feishuUserId, binding.feishuUnionId, binding.email].filter(Boolean).map(String);
  var adminIds = String(process.env.FEISHU_PLATFORM_ADMIN_IDS || '').split(',').map(function (id) { return id.trim(); }).filter(Boolean);
  var role = adminIds.some(function (id) { return identifiers.indexOf(id) >= 0; }) ? 'platform_admin' : 'project_manager';
  return {
    openId: openId,
    feishuOpenId: binding.feishuOpenId || '',
    feishuUserId: binding.feishuUserId || '',
    feishuUnionId: binding.feishuUnionId || '',
    email: binding.email || '',
    name: binding.name || '飞书用户',
    role: role,
    roleName: ROLE_NAMES[role],
    enabled: true
  };
}

var feishuTokenCache = null;
var feishuSchemaCache = null;
var feishuRecordCache = null;

function feishuConfig() {
  return {
    appId: String(process.env.FEISHU_APP_ID || ''),
    appSecret: String(process.env.FEISHU_APP_SECRET || ''),
    appToken: String(process.env.FEISHU_BITABLE_APP_TOKEN || ''),
    tableId: String(process.env.FEISHU_TABLE_ID || ''),
    projectField: String(process.env.FEISHU_FIELD_PROJECT || '项目名称'),
    managerField: String(process.env.FEISHU_FIELD_PROJECT_MANAGER || '现场经理及处长')
  };
}

function missingFeishuConfigKeys(config) {
  var missing = [];
  if (!config.appId) missing.push('FEISHU_APP_ID');
  if (!config.appSecret) missing.push('FEISHU_APP_SECRET');
  if (!config.appToken) missing.push('FEISHU_BITABLE_APP_TOKEN');
  if (!config.tableId) missing.push('FEISHU_TABLE_ID');
  return missing;
}

function feishuRequest(method, requestPath, headers, body) {
  return new Promise(function (resolve, reject) {
    var raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
    var requestHeaders = Object.assign({}, headers || {});
    if (raw) {
      requestHeaders['Content-Type'] = 'application/json; charset=utf-8';
      requestHeaders['Content-Length'] = raw.length;
    }
    var req = https.request({ hostname: 'open.feishu.cn', path: requestPath, method: method, headers: requestHeaders, timeout: 15000 }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        var rawText = Buffer.concat(chunks).toString('utf8');
        var data = {};
        try { data = rawText ? JSON.parse(rawText) : {}; } catch (parseError) { data = { msg: rawText }; }
        if (res.statusCode >= 200 && res.statusCode < 300 && (data.code === undefined || Number(data.code) === 0)) resolve(data);
        else reject(new Error((data && (data.msg || data.message)) || ('飞书权限核验失败（HTTP ' + res.statusCode + '）')));
      });
    });
    req.on('timeout', function () { req.destroy(new Error('飞书权限核验超时')); });
    req.on('error', reject);
    if (raw) req.write(raw);
    req.end();
  });
}

async function feishuTenantToken(c) {
  var missing = missingFeishuConfigKeys(c);
  if (missing.length) {
    var configError = new Error('quality-ledger 缺少环境变量：' + missing.join('、'));
    configError.code = 'FEISHU_CONFIG_MISSING';
    throw configError;
  }
  if (feishuTokenCache && feishuTokenCache.expiresAt > Date.now() + 60000) return feishuTokenCache.token;
  var result = await feishuRequest('POST', '/open-apis/auth/v3/tenant_access_token/internal', {}, { app_id: c.appId, app_secret: c.appSecret });
  if (!result.tenant_access_token) throw new Error('未获取到飞书 tenant_access_token');
  feishuTokenCache = { token: result.tenant_access_token, expiresAt: Date.now() + Number(result.expire || 7200) * 1000 };
  return feishuTokenCache.token;
}

function fieldName(item) { return String(item && (item.field_name || item.name) || '').trim(); }

async function feishuSchema(token, c) {
  if (feishuSchemaCache && feishuSchemaCache.at > Date.now() - 5 * 60 * 1000) return feishuSchemaCache.value;
  var result = await feishuRequest('GET', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/fields?page_size=500', { Authorization: 'Bearer ' + token });
  var names = (((result || {}).data || {}).items || []).map(fieldName);
  function resolve(preferred, aliases) {
    return [preferred].concat(aliases).filter(Boolean).find(function (name) { return names.indexOf(name) >= 0; }) || '';
  }
  var value = {
    project: resolve(c.projectField, ['项目名称', '项目', '项目归属', '项目关联']),
    manager: resolve(c.managerField, ['现场经理及处长', '项目负责人', '负责人', '项目经理', '责任人'])
  };
  feishuSchemaCache = { at: Date.now(), value: value };
  return value;
}

async function feishuRecords(token, c) {
  if (feishuRecordCache && feishuRecordCache.at > Date.now() - 60 * 1000) return feishuRecordCache.value;
  var pageToken = '';
  var records = [];
  do {
    var suffix = '?page_size=500' + (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
    var result = await feishuRequest('GET', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records' + suffix, { Authorization: 'Bearer ' + token });
    var data = (result || {}).data || {};
    records = records.concat(data.items || []);
    pageToken = data.has_more ? String(data.page_token || '') : '';
  } while (pageToken);
  feishuRecordCache = { at: Date.now(), value: records };
  return records;
}

function fieldText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join('、');
  return String(value.text || value.name || value.value || '');
}

function managerIdentifiers(value) {
  var items = Array.isArray(value) ? value : (value ? [value] : []);
  var output = [];
  items.forEach(function (item) {
    if (typeof item === 'string') { if (item.trim()) output.push(item.trim()); return; }
    if (!item || typeof item !== 'object') return;
    [item.id, item.open_id, item.openId, item.user_id, item.userId, item.union_id, item.unionId, item.email]
      .filter(Boolean).forEach(function (id) { output.push(String(id).trim()); });
  });
  return output;
}

async function canEditFeishuProject(project, actor) {
  if (actor.role === 'platform_admin') return true;
  var projectName = String(project && (project.feishuProjectName || project.name) || '').trim();
  if (!projectName) return false;
  var c = feishuConfig();
  var token = await feishuTenantToken(c);
  var results = await Promise.all([feishuSchema(token, c), feishuRecords(token, c)]);
  var schema = results[0];
  if (!schema.project) throw new Error('飞书表缺少“项目名称”字段');
  if (!schema.manager) throw new Error('飞书表缺少权限人员字段“' + c.managerField + '”');
  var actorIds = [actor.feishuOpenId, actor.feishuUserId, actor.feishuUnionId, actor.email].filter(Boolean).map(String);
  var allowedIds = [];
  results[1].forEach(function (record) {
    var fields = record.fields || {};
    if (fieldText(fields[schema.project]).trim() !== projectName) return;
    allowedIds = allowedIds.concat(managerIdentifiers(fields[schema.manager]));
  });
  return actorIds.some(function (id) { return allowedIds.indexOf(id) >= 0; });
}

async function loadProject(projectId) {
  try { return (await db.collection(COLLECTIONS.projects).doc(safeId(projectId)).get()).data; } catch (error) { return null; }
}

async function requireProjectEdit(projectId, actor) {
  // Never authorize from payload.project. Client payloads are untrusted and a
  // forged feishuProjectName must not be able to grant access to another id.
  var project = await loadProject(projectId);
  if (!project) {
    var missingError = new Error('项目尚未建立可信云端档案，请先重新选择飞书项目');
    missingError.code = 'PROJECT_NOT_LINKED';
    throw missingError;
  }
  var allowed = await canEditFeishuProject(project, actor);
  if (!allowed) {
    var permissionError = new Error('您可以查看该项目，但当前飞书账号不是项目负责人，不能编辑');
    permissionError.code = 'PROJECT_READ_ONLY';
    throw permissionError;
  }
  actor.canEditProject = true;
  return project;
}

function preserveProjectLinkage(storedProject, payloadProject, projectId) {
  var stored = cleanEntity(storedProject || {});
  var incoming = cleanEntity(payloadProject || {});
  return Object.assign({}, stored, incoming, {
    id: stored.id || projectId,
    projectId: projectId,
    // These fields form the trusted permission boundary and can only be created
    // during an authorized bootstrap, never changed by a later client payload.
    feishuProjectName: stored.feishuProjectName || stored.name || '',
    feishuRecordId: stored.feishuRecordId || ''
  });
}

async function writeAudit(operationId, actor, projectId, entityType, entityId, action, detail) {
  var auditId = safeId(operationId || ('AUDIT-' + Date.now()));
  await db.collection(COLLECTIONS.audits).doc(auditId).set({ data: {
    operationId: operationId, projectId: projectId, entityType: entityType, entityId: entityId,
    action: action, detail: cleanEntity(detail || {}), actorId: actor.openId, actorName: actor.name,
    actorRole: actor.role, actorRoleName: actor.roleName, createdAt: db.serverDate()
  }});
}

async function upsertInspection(projectId, inspection, actor, historyRecord) {
  requireField(inspection && inspection.id, 'inspection.id');
  var item = cleanEntity(inspection);
  item.projectId = projectId; item.entityId = inspection.id; item.historyRecord = cleanEntity(historyRecord || {});
  item.cloudStatus = 'synced'; item.updatedAt = db.serverDate(); item.updatedBy = actor.openId;
  if (!item.createdBy) { item.createdBy = actor.openId; item.createdByName = actor.name; item.createdAtCloud = db.serverDate(); }
  await db.collection(COLLECTIONS.inspections).doc(entityDocId(projectId, inspection.id)).set({ data: item });
}

async function upsertDefect(projectId, defect, actor) {
  requireField(defect && defect.id, 'defect.id');
  var item = cleanEntity(defect); item.projectId = projectId; item.entityId = defect.id;
  item.status = item.status || 'pending'; item.statusName = STATUS_NAMES[item.status] || item.status;
  item.cloudStatus = 'synced'; item.updatedAtCloud = db.serverDate(); item.updatedBy = actor.openId;
  await db.collection(COLLECTIONS.defects).doc(entityDocId(projectId, defect.id)).set({ data: item });
}

async function pullProjectState(projectId) {
  requireField(projectId, 'projectId');
  var results = await Promise.all([
    db.collection(COLLECTIONS.inspections).where({ projectId: projectId }).orderBy('updatedAt', 'desc').limit(100).get(),
    db.collection(COLLECTIONS.defects).where({ projectId: projectId }).orderBy('updatedAtCloud', 'desc').limit(100).get(),
    db.collection(COLLECTIONS.reports).where({ projectId: projectId }).orderBy('updatedAt', 'desc').limit(50).get(),
    db.collection(COLLECTIONS.rectifications).where({ projectId: projectId }).limit(100).get(),
    db.collection(COLLECTIONS.processRecords).where({ projectId: projectId }).orderBy('updatedAt', 'desc').limit(100).get()
  ]);
  return {
    inspections: (results[0].data || []).map(cleanEntity),
    defects: (results[1].data || []).filter(function (d) { return d.status !== 'rejected'; }).map(cleanEntity),
    reports: (results[2].data || []).map(cleanEntity),
    rectificationOrders: (results[3].data || []).map(sanitizeOpenOrder),
    processRecords: (results[4].data || []).map(cleanEntity)
  };
}

exports.main = async function (event, context) {
  var action = event.action || '';
  var payload = event.payload || {};
  var operationId = event.operationId || ('OP-' + Date.now());
  var wxContext = cloud.getWXContext();
  var openId = wxContext.OPENID;
  try {
    await ensureLedgerCollections();
    if (action === 'checkFeishuConfig') {
      var checkedConfig = feishuConfig();
      var missingConfig = missingFeishuConfigKeys(checkedConfig);
      return {
        success: missingConfig.length === 0,
        configured: missingConfig.length === 0,
        missing: missingConfig,
        fields: {
          project: checkedConfig.projectField,
          manager: checkedConfig.managerField
        }
      };
    }
    if (action === 'bootstrap') {
      requireField(payload.project && payload.project.id, 'project.id');
      var bootstrapActor = await resolveActor(openId);
      var storedBootstrapProject = await loadProject(payload.project.id);
      var bootstrapPermissionProject = storedBootstrapProject || cleanEntity(payload.project);
      var bootstrapCanEdit = await canEditFeishuProject(bootstrapPermissionProject, bootstrapActor);
      var cloudState = await pullProjectState(payload.project.id);
      bootstrapActor.canEditProject = bootstrapCanEdit;
      // Only the first authorized bootstrap establishes the Feishu-to-local
      // project link. Existing links are never replaced from client input.
      if (bootstrapCanEdit && !storedBootstrapProject) await ensureProject(payload.project, openId);
      return { success: true, actor: cleanEntity(bootstrapActor), state: cloudState };
    }

    var projectId = payload.projectId || (payload.project && payload.project.id) || (payload.inspection && payload.inspection.projectId) || (payload.historyRecord && payload.historyRecord.projectId);
    requireField(projectId, 'projectId');

    // Open-link collaboration actions deliberately do not resolve or bind a business member identity.
    // Reminder subscriptions only retain the recipient OpenID for message delivery.
    if (['getOpenRectification', 'submitOpenRectification', 'registerRectificationReminder', 'disableRectificationReminder'].indexOf(action) !== -1) {
      requireField(payload.orderId, 'orderId'); requireField(payload.shareToken, 'shareToken');
      var openDocId = entityDocId(projectId, payload.orderId);
      var openOrder = (await db.collection(COLLECTIONS.rectifications).doc(openDocId).get()).data;
      verifyOpenToken(openOrder, payload.shareToken);
      var reminderConfig = getReminderConfig();
      var currentReminder = await getReminderState(projectId, payload.orderId, openId, reminderConfig);
      if (action === 'getOpenRectification') return { success: true, order: sanitizeOpenOrder(openOrder), reminderConfig: reminderConfig, reminderState: currentReminder };

      if (action === 'registerRectificationReminder') {
        if (openOrder.status === 'closed') throw new Error('整改单已闭环，无需开启提醒');
        if (!reminderConfig.templateConfigured) throw new Error('管理员尚未配置整改提醒模板');
        if (payload.templateId !== reminderConfig.templateId) throw new Error('提醒模板配置不一致，请重新打开页面');
        var reminderId = reminderDocId(projectId, payload.orderId, openId);
        var previousReminder = null;
        try { previousReminder = (await db.collection(COLLECTIONS.reminders).doc(reminderId).get()).data; } catch (reminderReadError) {}
        var authorizedAtText = chinaTimeText();
        var requestedSendTime = String(payload.sendTime || reminderConfig.sendTime || '09:00');
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(requestedSendTime)) requestedSendTime = reminderConfig.sendTime || '09:00';
        var reminderRecord = Object.assign({}, cleanEntity(previousReminder || {}), {
          projectId: projectId, orderId: payload.orderId, recipientOpenId: openId,
          projectName: openOrder.projectName || '', recipientName: '施工负责人',
          shareToken: String(payload.shareToken), templateId: reminderConfig.templateId,
          mode: reminderConfig.mode, enabled: true, needsRenewal: false,
          sendTime: requestedSendTime,
          lastAuthorizedAtText: authorizedAtText, updatedAt: db.serverDate()
        });
        await db.collection(COLLECTIONS.reminders).doc(reminderId).set({ data: reminderRecord });
        return { success: true, order: sanitizeOpenOrder(openOrder), reminderConfig: reminderConfig, reminderState: sanitizeReminder(reminderRecord, reminderConfig) };
      }

      if (action === 'disableRectificationReminder') {
        try {
          await db.collection(COLLECTIONS.reminders).doc(reminderDocId(projectId, payload.orderId, openId)).update({ data: {
            enabled: false, needsRenewal: false, disabledAtText: chinaTimeText(), updatedAt: db.serverDate()
          }});
        } catch (disableReminderError) {}
        return { success: true, order: sanitizeOpenOrder(openOrder), reminderConfig: reminderConfig, reminderState: sanitizeReminder(null, reminderConfig) };
      }

      if (openOrder.status === 'closed') return { success: true, order: sanitizeOpenOrder(openOrder), alreadyClosed: true };
      var evidence = cleanEntity(payload.evidence || {});
      var photos = Array.isArray(evidence.evidencePhotos) ? evidence.evidencePhotos.filter(function (fileID) { return String(fileID || '').indexOf('cloud://') === 0; }).slice(0, 9) : [];
      var rectificationNote = String(evidence.rectificationNote || '').trim().slice(0, 1000);
      if (!rectificationNote) throw new Error('请填写整改情况说明');
      if (!photos.length) throw new Error('请至少上传一张整改照片');
      var submittedAtText = chinaTimeText();
      var timeline = Array.isArray(openOrder.timeline) ? openOrder.timeline.slice() : [];
      timeline.push({ action: 'submitted', name: '整改证据已提交，等待复验', time: submittedAtText });
      var submission = {
        status: 'review', statusName: '待复验', evidencePhotos: photos,
        measurement: String(evidence.measurement || '').slice(0, 120), rectificationNote: rectificationNote,
        submittedSource: 'SHARE_LINK', submittedAtText: submittedAtText, updatedAtText: submittedAtText, timeline: timeline,
        feishuClosureSyncState: '', feishuClosureSyncError: '', feishuClosureSyncedAt: '', feishuClosureSubmissionAt: '',
        updatedAt: db.serverDate()
      };
      await db.collection(COLLECTIONS.rectifications).doc(openDocId).update({ data: submission });
      try {
        await db.collection(COLLECTIONS.reminders).where({ projectId: projectId, orderId: payload.orderId }).update({ data: {
          enabled: false, needsRenewal: false, submittedAtText: submittedAtText, updatedAt: db.serverDate()
        }});
      } catch (submitReminderError) {}
      for (var defectIndex = 0; defectIndex < (openOrder.defectIds || []).length; defectIndex++) {
        try {
          await db.collection(COLLECTIONS.defects).doc(entityDocId(projectId, openOrder.defectIds[defectIndex])).update({ data: {
            status: 'review', statusName: '待复验', rectification: { collaborationMode: 'OPEN_LINK', evidencePhotos: photos, measurement: submission.measurement, note: submission.rectificationNote, updatedAt: submittedAtText }, updatedAtCloud: db.serverDate()
          }});
        } catch (defectUpdateError) {}
      }
      await db.collection(COLLECTIONS.audits).add({ data: { projectId: projectId, entityType: 'rectification', entityId: payload.orderId, action: 'open_link_submitted', detail: { photoCount: photos.length }, actorType: 'open_link', createdAt: db.serverDate() } });
      return { success: true, order: sanitizeOpenOrder(Object.assign({}, openOrder, submission)), reminderConfig: reminderConfig, reminderState: sanitizeReminder(null, reminderConfig) };
    }

    var actor = await resolveActor(openId);
    if (!actor.enabled) throw new Error('当前用户已被停用');

    if (action === 'pullProjectState') {
      var readProject = await loadProject(projectId);
      actor.canEditProject = readProject ? await canEditFeishuProject(readProject, actor) : false;
      return { success: true, actor: cleanEntity(actor), state: await pullProjectState(projectId) };
    }
    if (action === 'pullProcessRecords') {
      var processCondition = { projectId: projectId };
      if (payload.deviceId) processCondition.deviceId = payload.deviceId;
      var processQuery = db.collection(COLLECTIONS.processRecords).where(processCondition);
      var processResult = await processQuery.orderBy('updatedAt', 'desc').limit(100).get();
      return { success: true, records: (processResult.data || []).map(cleanEntity) };
    }

    var trustedProject = await requireProjectEdit(projectId, actor);
    if (payload.project) await ensureProject(preserveProjectLinkage(trustedProject, payload.project, projectId), openId);

    if (action === 'syncFoundation') {
      var foundation = cleanEntity(payload.foundation || {});
      foundation.projectId = projectId;
      foundation.updatedAt = db.serverDate();
      foundation.updatedBy = openId;
      await db.collection(COLLECTIONS.foundations).doc(safeId(projectId)).set({ data: foundation });
      await writeAudit(operationId, actor, projectId, 'foundation', projectId, 'foundation_synced', {
        projectCount: (foundation.projects || []).length,
        deviceCount: (foundation.devices || []).length
      });
    } else if (action === 'syncProcessRecord') {
      var processRecord = cleanEntity(payload.record || {});
      requireField(processRecord.id, 'record.id');
      processRecord.projectId = projectId;
      processRecord.entityId = processRecord.id;
      processRecord.updatedAt = db.serverDate();
      processRecord.updatedBy = openId;
      if (!processRecord.createdBy) {
        processRecord.createdBy = openId;
        processRecord.createdByName = actor.name;
        processRecord.createdAtCloud = db.serverDate();
      }
      await db.collection(COLLECTIONS.processRecords).doc(entityDocId(projectId, processRecord.id)).set({ data: processRecord });
      await writeAudit(operationId, actor, projectId, 'process_record', processRecord.id, 'process_record_saved', {
        formId: processRecord.formId, status: processRecord.status
      });
    } else if (action === 'syncInspection') {
      await upsertInspection(projectId, payload.inspection, actor, payload.historyRecord);
      for (var i = 0; i < (payload.defects || []).length; i++) await upsertDefect(projectId, payload.defects[i], actor);
      await writeAudit(operationId, actor, projectId, 'inspection', payload.inspection.id, 'inspection_confirmed', { defectCount: (payload.defects || []).length });
    } else if (action === 'syncBatch') {
      var batchRecord = cleanEntity(payload.historyRecord); batchRecord.projectId = projectId; batchRecord.entityId = batchRecord.id; batchRecord.cloudStatus = 'synced'; batchRecord.updatedAt = db.serverDate(); batchRecord.updatedBy = actor.openId;
      await db.collection(COLLECTIONS.inspections).doc(entityDocId(projectId, batchRecord.id)).set({ data: batchRecord });
      await writeAudit(operationId, actor, projectId, 'inspection', batchRecord.id, 'batch_inspection_confirmed', { defectCount: batchRecord.totalDefects || 0 });
    } else if (action === 'updateDefect') {
      var defect = cleanEntity(payload.defect); requireField(defect.id, 'defect.id');
      var docId = entityDocId(projectId, defect.id); var current = null;
      try { current = (await db.collection(COLLECTIONS.defects).doc(docId).get()).data; } catch (e) {}
      var fromStatus = current ? current.status : (defect.previousStatus || 'pending'); var toStatus = defect.status;
      var allowed = { pending: ['pending','rectifying'], rectifying: ['rectifying','review'], review: ['review','closed'], closed: ['closed'] };
      if (!allowed[fromStatus] || allowed[fromStatus].indexOf(toStatus) === -1) throw new Error('不允许的缺陷状态流转：' + fromStatus + ' → ' + toStatus);
      if (toStatus === 'closed' && ['platform_admin','project_manager'].indexOf(actor.role) === -1) throw new Error('仅项目经理可以复验闭环');
      defect.previousStatus = fromStatus; defect.statusName = STATUS_NAMES[toStatus] || toStatus;
      await upsertDefect(projectId, defect, actor);
      await writeAudit(operationId, actor, projectId, 'defect', defect.id, 'defect_status_changed', { from: fromStatus, to: toStatus, note: payload.transitionNote || '' });
    } else if (action === 'rejectDefect') {
      var rejectId = payload.defectId; requireField(rejectId, 'defectId');
      await db.collection(COLLECTIONS.defects).doc(entityDocId(projectId, rejectId)).update({ data: { status: 'rejected', statusName: STATUS_NAMES.rejected, rejectedReason: payload.reason || '人工判定为误报', rejectedAt: db.serverDate(), rejectedBy: openId } });
      await writeAudit(operationId, actor, projectId, 'defect', rejectId, 'defect_rejected', { reason: payload.reason || '' });
    } else if (action === 'syncReport') {
      var report = cleanEntity(payload.report); requireField(report.id, 'report.id'); report.projectId = projectId; report.entityId = report.id; report.updatedAt = db.serverDate(); report.updatedBy = openId;
      await db.collection(COLLECTIONS.reports).doc(entityDocId(projectId, report.id)).set({ data: report });
      await writeAudit(operationId, actor, projectId, 'report', report.id, 'report_generated', { fileID: report.fileID || '' });
    } else if (action === 'createRectificationOrder') {
      var order = cleanEntity(payload.order); requireField(order.id, 'order.id'); requireField(order.shareToken, 'order.shareToken');
      var orderDocId = entityDocId(projectId, order.id); var previousOrder = null;
      try { previousOrder = (await db.collection(COLLECTIONS.rectifications).doc(orderDocId).get()).data; } catch (orderReadError) {}
      order.projectId = projectId; order.entityId = order.id; order.collaborationMode = 'OPEN_LINK';
      order.shareTokenHash = tokenHash(order.shareToken); delete order.shareToken;
      order.createdByOpenId = previousOrder ? previousOrder.createdByOpenId : openId;
      order.createdByName = previousOrder ? previousOrder.createdByName : actor.name;
      order.status = (previousOrder && previousOrder.status === 'closed') ? 'closed' : (order.status || 'pending');
      if (previousOrder && previousOrder.status === 'closed') {
        order.evidencePhotos = previousOrder.evidencePhotos || [];
        order.measurement = previousOrder.measurement || '';
        order.rectificationNote = previousOrder.rectificationNote || '';
        order.closedSource = previousOrder.closedSource || 'SHARE_LINK';
        order.closedAtText = previousOrder.closedAtText || '';
        order.timeline = previousOrder.timeline || order.timeline || [];
      }
      order.statusName = STATUS_NAMES[order.status] || '待整改';
      order.updatedAt = db.serverDate();
      await db.collection(COLLECTIONS.rectifications).doc(orderDocId).set({ data: Object.assign({}, cleanEntity(previousOrder || {}), order) });
      await writeAudit(operationId, actor, projectId, 'rectification', order.id, 'open_rectification_created', { defectCount: (order.defectIds || []).length });
    } else if (action === 'reviewRectification') {
      var reviewId = payload.orderId; requireField(reviewId, 'orderId');
      var reviewDocId = entityDocId(projectId, reviewId);
      var reviewOrder = (await db.collection(COLLECTIONS.rectifications).doc(reviewDocId).get()).data;
      if (reviewOrder.status !== 'review') throw new Error('当前整改单不是待复验状态');
      if (['platform_admin','project_manager'].indexOf(actor.role) === -1) throw new Error('仅项目经理可以复验');
      var reviewAtText = chinaTimeText();
      var reviewTimeline = Array.isArray(reviewOrder.timeline) ? reviewOrder.timeline.slice() : [];
      reviewTimeline.push({ action: 'closed', name: '复验通过，整改闭环', time: reviewAtText });
      var reviewData = {
        status: 'closed', statusName: '已闭环', reviewNote: String(payload.reviewNote || '').slice(0, 500),
        reviewedByName: actor.name, reviewedByRoleName: actor.roleName,
        closedSource: 'QUALITY_REVIEW', closedAtText: reviewAtText, updatedAtText: reviewAtText,
        timeline: reviewTimeline, updatedAt: db.serverDate()
      };
      await db.collection(COLLECTIONS.rectifications).doc(reviewDocId).update({ data: reviewData });
      for (var reviewIndex = 0; reviewIndex < (reviewOrder.defectIds || []).length; reviewIndex++) {
        try { await db.collection(COLLECTIONS.defects).doc(entityDocId(projectId, reviewOrder.defectIds[reviewIndex])).update({ data: {
          status: 'closed', statusName: '已闭环', review: { note: reviewData.reviewNote, reviewer: actor.name, reviewedAt: reviewAtText }, updatedAtCloud: db.serverDate()
        }}); } catch (reviewDefectError) {}
      }
      await writeAudit(operationId, actor, projectId, 'rectification', reviewId, 'rectification_review_passed', { note: reviewData.reviewNote });
      return { success: true, order: sanitizeOpenOrder(Object.assign({}, reviewOrder, reviewData)) };
    } else if (action === 'rejectRectificationReview') {
      var rejectReviewId = payload.orderId; requireField(rejectReviewId, 'orderId');
      var rejectReviewDocId = entityDocId(projectId, rejectReviewId);
      var rejectReviewOrder = (await db.collection(COLLECTIONS.rectifications).doc(rejectReviewDocId).get()).data;
      if (rejectReviewOrder.status !== 'review') throw new Error('当前整改单不是待复验状态');
      if (['platform_admin','project_manager'].indexOf(actor.role) === -1) throw new Error('仅项目经理可以驳回复验');
      var rejectedAtText = chinaTimeText();
      var rejectTimeline = Array.isArray(rejectReviewOrder.timeline) ? rejectReviewOrder.timeline.slice() : [];
      rejectTimeline.push({ action: 'review_rejected', name: '复验未通过，退回继续整改', time: rejectedAtText });
      var rejectReviewData = {
        status: 'rectifying', statusName: '整改中', reviewNote: String(payload.reviewNote || '整改证据未通过复验').slice(0, 500),
        reviewedByName: actor.name, reviewedByRoleName: actor.roleName,
        updatedAtText: rejectedAtText, timeline: rejectTimeline, updatedAt: db.serverDate()
      };
      await db.collection(COLLECTIONS.rectifications).doc(rejectReviewDocId).update({ data: rejectReviewData });
      for (var rejectReviewIndex = 0; rejectReviewIndex < (rejectReviewOrder.defectIds || []).length; rejectReviewIndex++) {
        try { await db.collection(COLLECTIONS.defects).doc(entityDocId(projectId, rejectReviewOrder.defectIds[rejectReviewIndex])).update({ data: {
          status: 'rectifying', statusName: '整改中', review: { note: rejectReviewData.reviewNote, reviewer: actor.name, reviewedAt: rejectedAtText }, updatedAtCloud: db.serverDate()
        }}); } catch (rejectReviewDefectError) {}
      }
      await writeAudit(operationId, actor, projectId, 'rectification', rejectReviewId, 'rectification_review_rejected', { note: rejectReviewData.reviewNote });
      return { success: true, order: sanitizeOpenOrder(Object.assign({}, rejectReviewOrder, rejectReviewData)) };
    } else if (action === 'reopenRectification') {
      var reopenId = payload.orderId; requireField(reopenId, 'orderId'); var reopenDocId = entityDocId(projectId, reopenId);
      var reopenOrder = (await db.collection(COLLECTIONS.rectifications).doc(reopenDocId).get()).data;
      var reopenedAtText = chinaTimeText(); var reopenTimeline = Array.isArray(reopenOrder.timeline) ? reopenOrder.timeline.slice() : [];
      reopenTimeline.push({ action: 'reopened', name: '创建人重新打开整改', time: reopenedAtText });
      var reopenData = {
        status: 'pending', statusName: '待整改', evidencePhotos: [], measurement: '', rectificationNote: '',
        closedSource: '', closedAtText: '', reviewNote: '', reviewedByName: '', reviewedByRoleName: '',
        feishuClosureSyncState: '', feishuClosureSyncError: '', feishuClosureSyncedAt: '', feishuClosureSubmissionAt: '',
        updatedAtText: reopenedAtText, timeline: reopenTimeline, updatedAt: db.serverDate()
      };
      await db.collection(COLLECTIONS.rectifications).doc(reopenDocId).update({ data: reopenData });
      for (var reopenIndex = 0; reopenIndex < (reopenOrder.defectIds || []).length; reopenIndex++) {
        try { await db.collection(COLLECTIONS.defects).doc(entityDocId(projectId, reopenOrder.defectIds[reopenIndex])).update({ data: { status: 'pending', statusName: '待整改', updatedAtCloud: db.serverDate() } }); } catch (reopenDefectError) {}
      }
      await writeAudit(operationId, actor, projectId, 'rectification', reopenId, 'rectification_reopened', {});
      return { success: true, order: sanitizeOpenOrder(Object.assign({}, reopenOrder, reopenData)) };
    } else if (action === 'appendAudit') {
      await writeAudit(operationId, actor, projectId, payload.entityType, payload.entityId, payload.auditAction, payload.detail);
    } else {
      throw new Error('不支持的台账操作：' + action);
    }
    return { success: true, operationId: operationId, actor: cleanEntity(actor) };
  } catch (err) {
    console.error('[quality-ledger]', action, err);
    return { success: false, error: err.message || String(err), code: String(err.code || ''), operationId: operationId };
  }
};
