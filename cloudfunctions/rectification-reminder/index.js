const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const REMINDER_COLLECTION = 'quality-rectification-reminders';
const ORDER_COLLECTION = 'quality-rectification-orders';

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
}

function orderDocId(projectId, orderId) {
  return safeId(projectId) + '__' + safeId(orderId);
}

function chinaDateKey() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function chinaTimeText() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function chinaClock() {
  var date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(11, 16);
}

function normalizeTime(value) {
  var text = String(value || process.env.RECTIFICATION_REMINDER_SEND_TIME || '09:00');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : '09:00';
}

function fitThing(value, fallback) {
  return String(value || fallback || '待整改').replace(/[\n\r]/g, ' ').slice(0, 20);
}

function fitName(value, fallback) {
  return String(value || fallback || '施工负责人').replace(/[\n\r]/g, ' ').slice(0, 10);
}

function chinaDateTime() {
  var value = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  return value.slice(0, 10) + ' ' + value.slice(11, 19);
}

async function loadActiveSubscriptions() {
  var all = [];
  var offset = 0;
  while (true) {
    var result = await db.collection(REMINDER_COLLECTION).where({ enabled: true }).skip(offset).limit(100).get();
    var rows = result.data || [];
    all = all.concat(rows);
    if (rows.length < 100) break;
    offset += rows.length;
  }
  return all;
}

async function disableSubscription(subscription, detail) {
  await db.collection(REMINDER_COLLECTION).doc(subscription._id).update({ data: Object.assign({
    enabled: false, updatedAt: db.serverDate()
  }, detail || {}) });
}

async function sendOne(subscription, templateId, today, currentTime) {
  if (!subscription || !subscription._id || subscription.lastAttemptDate === today) return { skipped: true };
  if (currentTime < normalizeTime(subscription.sendTime)) return { skipped: true };
  if (!subscription.recipientOpenId || !subscription.projectId || !subscription.orderId || !subscription.shareToken) {
    await disableSubscription(subscription, { lastError: '提醒记录字段不完整', lastAttemptDate: today });
    return { disabled: true };
  }

  var order = null;
  try {
    order = (await db.collection(ORDER_COLLECTION).doc(orderDocId(subscription.projectId, subscription.orderId)).get()).data;
  } catch (e) {}
    if (!order || order.status === 'closed' || order.status === 'review') {
    await disableSubscription(subscription, { needsRenewal: false, lastAttemptDate: today, lastError: order ? '整改单已闭环' : '整改单不存在' });
    return { closed: true };
  }

  await db.collection(REMINDER_COLLECTION).doc(subscription._id).update({ data: {
    lastAttemptDate: today, lastAttemptAtText: chinaTimeText(), updatedAt: db.serverDate()
  }});

  var page = 'pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(subscription.orderId) +
    '&projectId=' + encodeURIComponent(subscription.projectId) + '&token=' + encodeURIComponent(subscription.shareToken) + '&from=share';

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: subscription.recipientOpenId,
      templateId: templateId,
      page: page,
      lang: 'zh_CN',
      data: {
        thing24: { value: fitThing(order.projectName || subscription.projectName, '施工项目') },
        thing12: { value: fitThing((order.positionCode || order.deviceName || '现场') + '整改', '整改任务') },
        name3: { value: fitName(subscription.recipientName, '施工负责人') },
        thing36: { value: fitThing('请上传整改照片并提交复验') },
        time33: { value: chinaDateTime() }
      }
    });
    var isLongTerm = subscription.mode === 'long_term';
    await db.collection(REMINDER_COLLECTION).doc(subscription._id).update({ data: {
      enabled: isLongTerm,
      needsRenewal: !isLongTerm,
      sentCount: db.command.inc(1),
      lastSentDate: today,
      lastSentAtText: chinaTimeText(),
      lastError: '',
      updatedAt: db.serverDate()
    }});
    return { sent: true };
  } catch (err) {
    await disableSubscription(subscription, {
      needsRenewal: true,
      lastErrorCode: err.errCode || err.code || 0,
      lastError: String(err.errMsg || err.message || err).slice(0, 300),
      updatedAtText: chinaTimeText()
    });
    return { failed: true, error: err.errMsg || err.message || String(err) };
  }
}

exports.main = async function () {
  var templateId = String(process.env.RECTIFICATION_REMINDER_TEMPLATE_ID || '');
  if (!templateId) return { success: false, error: '未配置 RECTIFICATION_REMINDER_TEMPLATE_ID' };

  var today = chinaDateKey();
  var subscriptions = await loadActiveSubscriptions();
  var summary = { success: true, date: today, total: subscriptions.length, sent: 0, skipped: 0, closed: 0, failed: 0 };
  for (var i = 0; i < subscriptions.length; i++) {
    try {
      var result = await sendOne(subscriptions[i], templateId, today, chinaClock());
      if (result.sent) summary.sent++;
      else if (result.closed || result.disabled) summary.closed++;
      else if (result.failed) summary.failed++;
      else summary.skipped++;
    } catch (err) {
      summary.failed++;
      console.error('[rectification-reminder]', subscriptions[i] && subscriptions[i]._id, err);
    }
  }
  return summary;
};
