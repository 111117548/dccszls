var assert = require('assert');
var foundation = require('../utils/v4-foundation.js');

function dateBefore(days) {
  var date = new Date();
  date.setDate(date.getDate() - days);
  function pad(value) { return value < 10 ? '0' + value : String(value); }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

var state = foundation.createInitialState();
foundation.setActualStage(state, 2, { name: '预测测试' }, '测试当前阶段');
foundation.updateStageProgress(state, 1, {
  plannedQuantity: 50, productionQuantity: 0, shippedQuantity: 0, arrivedQuantity: 0, installedQuantity: 0
}, { name: '预测测试' });
foundation.updateStageProgress(state, 2, {
  plannedQuantity: 100,
  productionQuantity: 100,
  shippedQuantity: 100,
  arrivedQuantity: 100,
  installedQuantity: 20,
  progressMode: 'forecast',
  forecastBasePercent: 20,
  forecastBaseDate: dateBefore(11),
  forecastDailyPercent: 5,
  warningPreparePercent: 75,
  warningDispatchPercent: 80
}, { name: '预测测试' });

var prepared = foundation.getStageProgressDetail(state, 2);
assert.strictEqual(prepared.analytics.projection.actualProgress, 20, 'forecast must not overwrite actual progress');
assert.strictEqual(prepared.analytics.projection.projectedProgress, 75);
var prepareAlert = prepared.alerts.filter(function (item) { return item.key.indexOf('ratio-prepare:') === 0; })[0];
assert.ok(prepareAlert, '75 percent should create preparation warning');
assert.strictEqual(prepareAlert.level, 'yellow');

foundation.updateStageProgress(state, 2, { forecastBaseDate: dateBefore(12) }, { name: '预测测试' });
var dispatched = foundation.getStageProgressDetail(state, 2);
assert.strictEqual(dispatched.analytics.projection.projectedProgress, 80);
var dispatchAlert = dispatched.alerts.filter(function (item) { return item.key.indexOf('ratio-dispatch:') === 0; })[0];
assert.ok(dispatchAlert, '80 percent should create dispatch warning');
assert.strictEqual(dispatchAlert.level, 'orange');

var corrected = foundation.updateStageProgress(state, 2, {
  progressMode: 'actual', actualProgressPercent: 30
}, { name: '项目经理' });
assert.strictEqual(corrected.analytics.projection.actualProgress, 30);
assert.strictEqual(corrected.analytics.projection.projectedProgress, 30);
assert.strictEqual(corrected.metric.forecastBasePercent, 30, 'actual entry should recalibrate forecast base');

var summary = foundation.updateStageProgress(state, 1, {
  summaryOverrideEnabled: true,
  summaryDemandQuantity: 50,
  summaryArrivalQuantity: 35,
  summaryUnit: '箱'
}, { name: '项目经理' });
assert.strictEqual(summary.analytics.arrivalCompletionRate, 70, 'manual aggregate should drive arrival rate');

console.log(JSON.stringify({
  actualProgress: corrected.analytics.projection.actualProgress,
  prepareLevel: prepareAlert.level,
  dispatchLevel: dispatchAlert.level,
  correctedArrivalRate: summary.analytics.arrivalCompletionRate
}, null, 2));
