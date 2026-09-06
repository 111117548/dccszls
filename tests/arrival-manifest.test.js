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
assert.strictEqual(parsed.packages[0].stageIndex, 3, 'ash hopper should map to stage 3');
assert.strictEqual(parsed.packages[1].stageIndex, 7, 'inlet duct should map to stage 7');
assert.strictEqual(parsed.packages[2].stageIndex, 0, 'unknown items must stay unclassified');

var shippingMatrix = [
  ['项目名称', '固原彭阳煤电联营项目2×660MW机组工程'],
  ['机组号', '1#'],
  [],
  ['序号', '构件号/箱件号', '图号', '物资名称', '数量', '单位', '毛重(kg)', '净重(kg)'],
  [1, 'B468', 'BZ(G793.1).12', '横梁', 1, '箱', 1000, 900],
  [2, 'B532', 'BZ(G793.9).1', '框架', 1, '箱', 800, 700],
  ['总件数', 2],
  [3, 'DETAIL-IGNORED', 'BZ(G793.9).9', '明细行不应计入', 1, '件', 0, 0]
];
var shipping = parser.parseMatrix(shippingMatrix, '第41车');
assert.strictEqual(shipping.packageCount, 2, 'shipping footer and following details must not become packages');
assert.strictEqual(shipping.packages[0].stageIndex, 4, 'G793.1 generic beam should belong to shell stage');
assert.strictEqual(shipping.packages[1].stageIndex, 5, 'G793.9 generic frame should belong to platform stage');
assert.strictEqual(shipping.packages[0].projectName, '固原彭阳煤电联营项目2×660MW机组工程');
var vehicle40 = Object.assign({}, shipping, {
  sheetName: '第40车', packageCount: 1, classifiedCount: 1, unmatchedCount: 0,
  packages: [Object.assign({}, shipping.packages[0], { boxNo: 'B400' })]
});
var cumulative = parser.selectParsedSheet([
  vehicle40,
  shipping
], '紫金龙净固原彭阳1#发货清单(第41车)(1).xls', 'arrival');
assert.strictEqual(cumulative.sheetName, '第40车—第41车');
assert.strictEqual(cumulative.vehicleCount, 2, 'arrival workbook must combine every numbered vehicle sheet');
assert.strictEqual(cumulative.packageCount, 3, 'cumulative import must retain boxes from earlier vehicles');
assert.strictEqual(cumulative.packages[0].sourceSheetName, '第40车');

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
assert.strictEqual(receipt.lastImport.stageBreakdown[0].stageName, '灰斗');
assert.strictEqual(receipt.lastImport.stageBreakdown[0].matchedPackages, 1, 'import should expose component-level matched totals');

var repeated = foundation.applyArrivalReceiptManifest(state, {
  fileName: '第一批到货-重复导入.xls',
  packages: [{ boxNo: 'A-001', name: '灰斗组件包装箱' }]
}, actor);
assert.strictEqual(repeated.arrivedPackages, 1, 'repeat import must not increase arrival total');
assert.strictEqual(repeated.lastImport.duplicatePackages, 1);
assert.strictEqual(repeated.lastImport.addedPackages, 0);

var manual = foundation.applyStageArrivalQuantity(state, 7, 1, actor);
assert.strictEqual(manual.metric.manifestArrivedPackages, 1, 'manual component arrival must update the stage metric');
assert.strictEqual(foundation.getArrivalLedgerDetail(state).arrivedPackages, 2, 'manual component arrival must aggregate into the overall ledger');
var verifiedManual = foundation.applyArrivalReceiptManifest(state, {
  fileName: '第二批到货.xls', packages: [{ boxNo: 'A-002', name: '进口烟道包装箱' }]
}, actor);
assert.strictEqual(verifiedManual.arrivedPackages, 2, 'receipt import must not double-count a manually reported package');
assert.strictEqual(verifiedManual.lastImport.verifiedManualPackages, 1);
assert.strictEqual(verifiedManual.lastImport.duplicatePackages, 0);
var correctedManual = foundation.applyStageArrivalQuantity(state, 7, 0, actor);
assert.strictEqual(correctedManual.metric.manifestArrivedPackages, 0, 'manual actual quantity must be able to correct a manifest count');
assert.strictEqual(correctedManual.arrivedProgress, 0, 'manual correction must immediately recalculate component arrival progress');
assert.strictEqual(foundation.getArrivalLedgerDetail(state).arrivedPackages, 1, 'manual correction must aggregate into overall arrival progress');
var correctedReimport = foundation.applyArrivalReceiptManifest(state, {
  fileName: '第二批到货-再次导入.xls', packages: [{ boxNo: 'A-002', name: '进口烟道包装箱' }]
}, actor);
assert.strictEqual(correctedReimport.arrivedPackages, 1, 'reimport must preserve the field-confirmed manual correction');
assert.strictEqual(correctedReimport.lastImport.manualExcludedPackages, 1, 'reimport should report manually excluded manifest boxes');
var restoredManual = foundation.applyStageArrivalQuantity(state, 7, 1, actor);
assert.strictEqual(restoredManual.metric.manifestArrivedPackages, 1, 'raising the field quantity should restore the corrected arrival count');

var stage4 = foundation.getStageProgressDetail(state, 3);
assert.strictEqual(stage4.metric.manifestPlannedPackages, 1);
assert.strictEqual(stage4.metric.manifestArrivedPackages, 1);
assert.strictEqual(stage4.analytics.arrivalCompletionRate, 100);
assert.strictEqual(stage4.analytics.arrivalPackageDriven, true);

var splitState = foundation.createInitialState();
foundation.applyArrivalDemandManifest(splitState, {
  fileName: '拆箱需求总清单.xls',
  packages: [
    { boxNo: 'B410', name: '立柱', stageIndex: 4, stageName: '壳体' },
    { boxNo: 'B523', name: '阻流板', stageIndex: 7, stageName: '进出口' }
  ]
}, actor);
var splitReceipt = foundation.applyArrivalReceiptManifest(splitState, {
  fileName: '累计41车.xls', sheetName: '第1车—第41车', vehicleCount: 41,
  firstVehicleNumber: 1, lastVehicleNumber: 41,
  packages: [
    { boxNo: 'B410A', name: '立柱上段', sourceSheetName: '第20车', vehicleNumber: 20 },
    { boxNo: 'B410B', name: '立柱下段', sourceSheetName: '第21车', vehicleNumber: 21 },
    { boxNo: 'B523B', name: '阻流板', sourceSheetName: '第41车', vehicleNumber: 41 }
  ]
}, actor);
assert.strictEqual(splitReceipt.arrivedPackages, 2, 'split A/B shipment boxes must consolidate to their planned box roots');
assert.strictEqual(splitReceipt.lastImport.matchedPackages, 3, 'all physical shipment boxes must be recorded');
assert.strictEqual(splitReceipt.lastImport.matchedDemandPackages, 2, 'three split shipment boxes map to two demand boxes');
assert.strictEqual(splitReceipt.lastImport.aliasMatchedPackages, 3);
assert.strictEqual(splitReceipt.lastImport.consolidatedPackages, 1);
assert.strictEqual(splitReceipt.lastImport.unmatchedPackages, 0);

console.log(JSON.stringify({
  packages: parsed.packageCount,
  details: parsed.detailLineCount,
  arrived: verifiedManual.arrivedPackages,
  unmatched: repeated.unmatchedReceipts.length,
  stage4ArrivalRate: stage4.analytics.arrivalCompletionRate,
  cumulativeVehicles: cumulative.vehicleCount,
  splitDemandMatched: splitReceipt.lastImport.matchedDemandPackages
}, null, 2));
