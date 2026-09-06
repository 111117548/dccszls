var assert = require('assert');
var memory = {};
global.wx = {
  getStorageSync: function (key) { return memory[key] || ''; },
  setStorageSync: function (key, value) { memory[key] = value; }
};

var foundation = require('../utils/v4-foundation.js');
var forms = require('../utils/process-forms.js');

var state = foundation.createInitialState();
assert.strictEqual(foundation.STAGES.length, 13);
var project = foundation.upsertProject(state, {
  name: '测试电厂一期工程',
  code: 'TEST-PROJECT',
  status: 'construction'
});
assert.ok(project.id);
var device = foundation.upsertDevice(state, {
  projectId: project.id,
  name: '#1机组电除尘器',
  code: 'TEST-ESP-01',
  stageIndex: 1
});
assert.ok(device.id);
foundation.switchProject(state, project.id);
foundation.switchDevice(state, device.id);
foundation.setActualStage(state, 7, '测试工程师', '进出口喇叭安装完成');
var context = foundation.getContext(state);
assert.strictEqual(context.stage.index, 7);
assert.strictEqual(context.deviceState.progressLogs[0].stageIndex, 7);

var steelProgress = foundation.getStageProgressDetail(state, 1);
assert.strictEqual(steelProgress.stage.shortName, '钢支架');
assert.strictEqual(steelProgress.metric.plannedLoads, 58);
foundation.updateStageProgress(state, 3, {
  productionQuantity: 0,
  shippedQuantity: 0,
  arrivedQuantity: 0,
  installedQuantity: 0
}, { id: 'test-user', name: '测试工程师' });
foundation.setActualStage(state, 1, { id: 'test-user', name: '测试工程师' }, '测试钢支架预警');
var updatedProgress = foundation.updateStageProgress(state, 1, {
  plannedQuantity: 960,
  plannedLoads: 50,
  productionQuantity: 800,
  shippedQuantity: 800,
  shippedLoads: 42,
  arrivedQuantity: 800,
  arrivedLoads: 42,
  installedQuantity: 768,
  dispatchThreshold: 80,
  note: '钢支架达到下一部件发货节点'
}, { id: 'test-user', name: '测试工程师' });
assert.strictEqual(updatedProgress.installedProgress, 80);
var hopperAlert = updatedProgress.allActiveAlerts.filter(function (item) {
  return item.type === 'ratio' && item.sourceIndex === 1 && item.targetIndex === 3;
})[0];
assert.ok(hopperAlert);
assert.strictEqual(hopperAlert.level, 'orange');
assert.strictEqual(foundation.STAGES[hopperAlert.targetIndex - 1].shortName, '灰斗');

assert.strictEqual(forms.FORMS.length, 7);
forms.FORMS.forEach(function (form) {
  var record = forms.createRecord(form.id, {
    projectId: project.id,
    projectName: project.name,
    deviceId: device.id,
    deviceName: device.name
  });
  assert.strictEqual(record.formId, form.id);
  forms.upsertRecord(record);
});
assert.strictEqual(forms.loadRecords().length, 7);
var annex7 = forms.createRecord('annex-7', {});
assert.strictEqual(Object.keys(annex7.matrixValues).length, 4);
assert.strictEqual(annex7.matrixValues.field1.length, 30);
assert.strictEqual(Object.keys(annex7.matrixValues.field1[0]).length, 13);

console.log(JSON.stringify({
  success: true,
  project: project.name,
  device: device.name,
  currentStage: context.stage.name,
  steelSupportProgress: updatedProgress.installedProgress,
  nextDispatchStage: foundation.STAGES[hopperAlert.targetIndex - 1].shortName,
  processForms: forms.FORMS.length,
  annex7Measurements: 4 * 30 * 12
}, null, 2));
