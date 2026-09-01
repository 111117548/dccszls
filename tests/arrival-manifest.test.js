var assert = require('assert');
var parser = require('../cloudfunctions/arrival-manifest/parser.js');
var foundation = require('../utils/v4-foundation.js');

var matrix = [
  ['箱号', '序号', '图号', '名称', '单位', '数量', '毛重', '净重'],
  ['A-001', 0, 'DG142.2', '灰斗组件包装箱', '箱', 1, 800, 720],
  ['A-001', 1, 'DG142.2.1', '灰斗壁板', '件', 8, 0, 0],
  ['A-002', 0, 'DG142.6', '进口烟道包装箱', '箱', 1, 600, 520],
  ['A-002', 1, 'DG142.6.1', '进口喇叭', '件', 2, 0, 0],
  ['A-003', 0, 'OTHER', '专用备件包装箱', '箱', 1, 100, 80]
];

var parsed = parser.parseMatrix(matrix, '需求清单');
assert.strictEqual(parsed.packageCount, 3, 'should group detail rows into three unique boxes');
assert.strictEqual(parsed.detailLineCount, 2, 'should retain detail line totals');
assert.strictEqual(parsed.packages[0].stageIndex, 4, 'ash hopper should map to stage 4');
assert.strictEqual(parsed.packages[1].stageIndex, 6, 'inlet duct should map to stage 6');
assert.strictEqual(parsed.packages[2].stageIndex, 0, 'unknown items must stay unclassified');

var state = foundation.createInitialState();
var actor = { name: '测试用户' };
var demand = foundation.applyArrivalDemandManifest(state, Object.assign({ fileName: '需求总清单.xls' }, parsed), actor);
assert.strictEqual(demand.totalPackages, 3);
assert.strictEqual(demand.arrivedPackages, 0);
assert.strictEqual(demand.unmatchedPackages, 1);

var receipt = foundation.applyArrivalReceiptManifest(state, {
  fileName: '第一批到货.xls',
  packages: [
    { boxNo: 'A-001', name: '灰斗组件包装箱' },
    { boxNo: 'A-001', name: '重复行' },
    { boxNo: 'OUTSIDE-01', name: '清单外箱件' }
  ]
}, actor);
assert.strictEqual(receipt.arrivedPackages, 1, 'one known box should be marked arrived');
assert.strictEqual(receipt.lastImport.addedPackages, 1);
assert.strictEqual(receipt.lastImport.unmatchedPackages, 1);

var repeated = foundation.applyArrivalReceiptManifest(state, {
  fileName: '第一批到货-重复导入.xls',
  packages: [{ boxNo: 'A-001', name: '灰斗组件包装箱' }]
}, actor);
assert.strictEqual(repeated.arrivedPackages, 1, 'repeat import must not increase arrival total');
assert.strictEqual(repeated.lastImport.duplicatePackages, 1);
assert.strictEqual(repeated.lastImport.addedPackages, 0);

var stage4 = foundation.getStageProgressDetail(state, 4);
assert.strictEqual(stage4.metric.manifestPlannedPackages, 1);
assert.strictEqual(stage4.metric.manifestArrivedPackages, 1);
assert.strictEqual(stage4.analytics.arrivalCompletionRate, 100);
assert.strictEqual(stage4.analytics.arrivalPackageDriven, true);

console.log(JSON.stringify({
  packages: parsed.packageCount,
  details: parsed.detailLineCount,
  arrived: repeated.arrivedPackages,
  unmatched: repeated.unmatchedReceipts.length,
  stage4ArrivalRate: stage4.analytics.arrivalCompletionRate
}, null, 2));
