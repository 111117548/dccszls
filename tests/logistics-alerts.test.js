var assert = require('assert');
var memory = {};
global.wx = {
  getStorageSync: function (key) { return memory[key] || ''; },
  setStorageSync: function (key, value) { memory[key] = value; }
};

var foundation = require('../utils/v4-foundation.js');

function dateKey(date) {
  var value = date || new Date();
  function pad(value) { return value < 10 ? '0' + value : String(value); }
  return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate());
}

function addDays(date, days) {
  var value = new Date(date.getTime());
  value.setDate(value.getDate() + days);
  return dateKey(value);
}

function resetStage(state, stageIndex, plannedQuantity) {
  return foundation.updateStageProgress(state, stageIndex, {
    plannedQuantity: plannedQuantity,
    productionQuantity: 0,
    shippedQuantity: 0,
    arrivedQuantity: 0,
    installedQuantity: 0,
    transportLeadDays: 7,
    safetyBufferDays: 3,
    plannedInstallDate: '',
    estimatedArrivalDate: ''
  }, { id: 'qa-user', name: '规则测试' });
}

var state = foundation.createInitialState();
var today = new Date();

resetStage(state, 1, 40);
resetStage(state, 2, 24);
resetStage(state, 3, 100);
resetStage(state, 4, 20);
resetStage(state, 5, 4);
resetStage(state, 6, 8);
resetStage(state, 7, 20);
resetStage(state, 8, 20);

var firstDaily = foundation.recordDailyStageProgress(state, 1, {
  date: dateKey(today),
  arrivedAdded: 10,
  installedAdded: 5,
  note: '首次日填报'
}, { id: 'site-user', name: '现场人员' });
assert.strictEqual(firstDaily.metric.arrivedQuantity, 10);
assert.strictEqual(firstDaily.metric.installedQuantity, 5);

var updatedDaily = foundation.recordDailyStageProgress(state, 1, {
  date: dateKey(today),
  arrivedAdded: 12,
  installedAdded: 6,
  note: '同日修正'
}, { id: 'site-user', name: '现场人员' });
assert.strictEqual(updatedDaily.metric.arrivedQuantity, 12);
assert.strictEqual(updatedDaily.metric.installedQuantity, 6);
assert.strictEqual(updatedDaily.dailyEntries.length, 1);
assert.strictEqual(updatedDaily.analytics.inventoryQuantity, 6);
assert.strictEqual(updatedDaily.analytics.averageInstallSpeed, 6);
assert.strictEqual(updatedDaily.analytics.inventorySupportDays, 1);
assert.strictEqual(updatedDaily.analytics.installationCompletionRate, 15);
assert.strictEqual(updatedDaily.analytics.arrivalCompletionRate, 30);
assert.ok(updatedDaily.analytics.estimatedInstallCompletionDate);

assert.strictEqual(updatedDaily.allActiveAlerts.filter(function (item) { return item.type === 'inventory'; }).length, 0);

foundation.setActualStage(state, 3, { name: '现场人员' }, '切换到钢支架');
var prepareDetail = foundation.updateStageProgress(state, 3, {
  productionQuantity: 100,
  shippedQuantity: 80,
  arrivedQuantity: 80,
  installedQuantity: 75
}, { id: 'site-user', name: '现场人员' });
var prepareAlert = prepareDetail.allActiveAlerts.filter(function (item) {
  return item.type === 'ratio' && item.sourceIndex === 3 && item.targetIndex === 4;
})[0];
assert.ok(prepareAlert);
assert.strictEqual(prepareAlert.level, 'yellow');
assert.strictEqual(prepareAlert.threshold, 75);

var ratioDetail = foundation.updateStageProgress(state, 3, { installedQuantity: 80 }, { id: 'site-user', name: '现场人员' });
var ratioAlert = ratioDetail.allActiveAlerts.filter(function (item) {
  return item.type === 'ratio' && item.sourceIndex === 3 && item.targetIndex === 4;
})[0];
assert.ok(ratioAlert);
assert.strictEqual(ratioAlert.level, 'orange');
assert.strictEqual(ratioAlert.threshold, 80);

var occurrenceCount = ratioAlert.occurrenceCount;
var firstRead = foundation.getStageProgressDetail(state, 3);
var secondRead = foundation.getStageProgressDetail(state, 3);
var repeatedRatio = secondRead.allActiveAlerts.filter(function (item) {
  return item.key === ratioAlert.key;
})[0];
assert.ok(firstRead.allActiveAlerts.some(function (item) { return item.id === ratioAlert.id; }));
assert.strictEqual(repeatedRatio.id, ratioAlert.id);
assert.strictEqual(repeatedRatio.occurrenceCount, occurrenceCount);

foundation.setActualStage(state, 5, { name: '现场人员' }, '切换到壳体');
foundation.updateStageProgress(state, 5, {
  productionQuantity: 3,
  shippedQuantity: 3,
  arrivedQuantity: 3,
  installedQuantity: 3
}, { id: 'planner', name: '计划人员' });

var shellTriggeredTargets = foundation.getStageProgressDetail(state, 5).alerts.filter(function (item) {
  return item.type === 'ratio';
}).map(function (item) {
  return item.targetIndex;
}).sort();
assert.deepStrictEqual(shellTriggeredTargets, [6, 7, 8]);

var deviceState = foundation.getCurrentDeviceState(state);
var activeKeys = deviceState.dispatchAlerts.filter(function (item) { return item.status === 'active'; }).map(function (item) { return item.key; });
assert.strictEqual(new Set(activeKeys).size, activeKeys.length);

assert.strictEqual(foundation.acknowledgeDispatchAlert(state, ratioAlert.id, { name: '项目经理' }, '已安排车辆'), true);
foundation.getStageProgressDetail(state, 3);
var handledRatio = deviceState.dispatchAlerts.filter(function (item) { return item.id === ratioAlert.id; })[0];
assert.strictEqual(handledRatio.status, 'handled');
assert.strictEqual(handledRatio.handleNote, '已安排车辆');

console.log(JSON.stringify({
  success: true,
  dailyEntryCount: updatedDaily.dailyEntries.length,
  inventorySupportDays: updatedDaily.analytics.inventorySupportDays,
  ratioAlert: ratioAlert.title,
  uniqueActiveAlerts: activeKeys.length
}, null, 2));
