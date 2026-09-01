// 云端质量台账客户端：云端权威、本地离线队列兜底。
var QUEUE_KEY = 'esp_cloud_sync_queue_v1';
var FUNCTION_NAME = 'quality-ledger';
var flushing = false;

function nowId(prefix) {
  return (prefix || 'OP') + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
}

function loadQueue() {
  try { return JSON.parse(wx.getStorageSync(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}

function saveQueue(queue) {
  try { wx.setStorageSync(QUEUE_KEY, JSON.stringify(queue || [])); } catch (e) {}
}

function call(action, payload, operationId) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud || !wx.cloud.callFunction) { reject(new Error('云能力不可用')); return; }
    wx.cloud.callFunction({
      name: FUNCTION_NAME,
      data: { action: action, payload: payload || {}, operationId: operationId || nowId('OP') },
      success: function (res) {
        var result = res.result || {};
        if (result.success === false) {
          var error = new Error(result.error || '云端台账操作失败');
          error.code = result.code || '';
          reject(error);
        } else resolve(result);
      },
      fail: function (err) { reject(new Error((err && err.errMsg) || '云端台账连接失败')); }
    });
  });
}

function enqueue(action, payload) {
  var queue = loadQueue();
  var op = { operationId: nowId(action), action: action, payload: payload || {}, createdAt: Date.now(), retryCount: 0 };
  queue.push(op);
  saveQueue(queue);
  return flushQueue().then(function () { return op.operationId; }).catch(function (error) {
    if (error && ['PROJECT_READ_ONLY', 'PROJECT_NOT_LINKED', 'FEISHU_ACCOUNT_NOT_BOUND', 'FEISHU_REAUTH_REQUIRED'].indexOf(error.code) >= 0) throw error;
    return op.operationId;
  });
}

function flushQueue() {
  if (flushing) return Promise.resolve({ pending: loadQueue().length });
  flushing = true;
  var queue = loadQueue();

  function next() {
    if (!queue.length) { saveQueue(queue); flushing = false; return Promise.resolve({ pending: 0 }); }
    var op = queue[0];
    return call(op.action, op.payload, op.operationId).then(function () {
      queue.shift(); saveQueue(queue); return next();
    }).catch(function (err) {
      if (err && ['PROJECT_READ_ONLY', 'PROJECT_NOT_LINKED', 'FEISHU_ACCOUNT_NOT_BOUND', 'FEISHU_REAUTH_REQUIRED'].indexOf(err.code) >= 0) {
        queue.shift();
        saveQueue(queue);
        flushing = false;
        throw err;
      }
      op.retryCount = (op.retryCount || 0) + 1;
      op.lastError = err.message || String(err);
      op.lastAttemptAt = Date.now();
      queue[0] = op; saveQueue(queue); flushing = false;
      return { pending: queue.length, error: op.lastError };
    });
  }
  return next();
}

function bootstrap(project) { return call('bootstrap', { project: project || {} }, nowId('BOOT')); }
function pullProjectState(projectId) { return call('pullProjectState', { projectId: projectId }, nowId('PULL')); }
function syncInspection(project, inspection, defects, historyRecord) {
  return enqueue('syncInspection', { project: project, inspection: inspection, defects: defects || [], historyRecord: historyRecord || null });
}
function syncBatch(project, historyRecord) { return enqueue('syncBatch', { project: project, historyRecord: historyRecord }); }
function updateDefect(projectId, defect, transitionNote) {
  return enqueue('updateDefect', { projectId: projectId, defect: defect, transitionNote: transitionNote || '' });
}
function rejectDefect(projectId, defectId, reason) {
  return enqueue('rejectDefect', { projectId: projectId, defectId: defectId, reason: reason || '人工判定为误报' });
}
function syncReport(projectId, report) { return enqueue('syncReport', { projectId: projectId, report: report }); }
function syncFoundation(projectId, foundation) {
  return enqueue('syncFoundation', { projectId: projectId, foundation: foundation || {} });
}
function syncProcessRecord(projectId, record) {
  return enqueue('syncProcessRecord', { projectId: projectId, record: record || {} });
}
function pullProcessRecords(projectId, deviceId) {
  return call('pullProcessRecords', { projectId: projectId, deviceId: deviceId || '' }, nowId('PROCESS-PULL'));
}
function createRectificationOrder(projectId, order) {
  return enqueue('createRectificationOrder', { projectId: projectId, order: order });
}
// Used immediately before an open-link submission.  Unlike the background
// queue, this confirms that the order document exists before evidence is sent.
function ensureRectificationOrder(projectId, order) {
  return call('createRectificationOrder', { projectId: projectId, order: order }, nowId('RECT-ENSURE'));
}
function getOpenRectification(projectId, orderId, shareToken) {
  return call('getOpenRectification', { projectId: projectId, orderId: orderId, shareToken: shareToken }, nowId('RECT-PULL'));
}
function submitOpenRectification(projectId, orderId, shareToken, evidence) {
  return call('submitOpenRectification', { projectId: projectId, orderId: orderId, shareToken: shareToken, evidence: evidence || {} }, nowId('RECT-SUBMIT'));
}
function registerRectificationReminder(projectId, orderId, shareToken, templateId, sendTime) {
  return call('registerRectificationReminder', { projectId: projectId, orderId: orderId, shareToken: shareToken, templateId: templateId, sendTime: sendTime || '09:00' }, nowId('RECT-REMIND-ON'));
}
function disableRectificationReminder(projectId, orderId, shareToken) {
  return call('disableRectificationReminder', { projectId: projectId, orderId: orderId, shareToken: shareToken }, nowId('RECT-REMIND-OFF'));
}
function reopenRectification(projectId, orderId) {
  return call('reopenRectification', { projectId: projectId, orderId: orderId }, nowId('RECT-REOPEN'));
}
function reviewRectification(projectId, orderId, reviewNote) {
  return call('reviewRectification', { projectId: projectId, orderId: orderId, reviewNote: reviewNote || '' }, nowId('RECT-REVIEW'));
}
function rejectRectificationReview(projectId, orderId, reviewNote) {
  return call('rejectRectificationReview', { projectId: projectId, orderId: orderId, reviewNote: reviewNote || '' }, nowId('RECT-REJECT'));
}
function appendAudit(projectId, entityType, entityId, action, detail) {
  return enqueue('appendAudit', { projectId: projectId, entityType: entityType, entityId: entityId, auditAction: action, detail: detail || {} });
}
function getStatus() { var queue = loadQueue(); return { pending: queue.length, online: queue.length === 0 }; }

module.exports = {
  bootstrap: bootstrap, pullProjectState: pullProjectState, flushQueue: flushQueue, getStatus: getStatus,
  syncInspection: syncInspection, syncBatch: syncBatch, updateDefect: updateDefect, rejectDefect: rejectDefect,
  syncReport: syncReport, syncFoundation: syncFoundation,
  syncProcessRecord: syncProcessRecord, pullProcessRecords: pullProcessRecords,
  createRectificationOrder: createRectificationOrder,
  ensureRectificationOrder: ensureRectificationOrder,
  getOpenRectification: getOpenRectification, submitOpenRectification: submitOpenRectification,
  registerRectificationReminder: registerRectificationReminder, disableRectificationReminder: disableRectificationReminder,
  reopenRectification: reopenRectification, reviewRectification: reviewRectification,
  rejectRectificationReview: rejectRectificationReview, appendAudit: appendAudit
};
