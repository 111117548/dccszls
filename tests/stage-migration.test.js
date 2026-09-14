const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('../utils/stage-catalog');
const foundation = require('../utils/v4-foundation');
const domain = require('../utils/v3-data');
const parser = require('../cloudfunctions/arrival-manifest/parser');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function legacyState(currentIndex = 4) {
  const state = foundation.createInitialState();
  const metrics = {};
  for (let i = 1; i <= 13; i++) {
    const id = 'stage-' + String(i).padStart(2, '0');
    metrics[id] = { stageId: id, plannedQuantity: 100, installedQuantity: 0, arrivedQuantity: 0, unit: '件', dailyEntries: [] };
  }
  metrics['stage-01'].installedQuantity = 80;
  metrics['stage-02'] = { stageId: 'stage-02', plannedQuantity: 24, installedQuantity: 12, arrivedQuantity: 20, unit: '榀', dailyEntries: [{ date: '2026-09-01', installedAdded: 2 }] };
  metrics['stage-03'] = { stageId: 'stage-03', plannedQuantity: 960, installedQuantity: 768, arrivedQuantity: 900, unit: '件', dailyEntries: [{ date: '2026-09-01', installedAdded: 100 }] };
  metrics['stage-04'].installedQuantity = 20;
  metrics['stage-07'].installedQuantity = 70;
  metrics['stage-08'].installedQuantity = 30;
  metrics['stage-10'].installedQuantity = 90;
  metrics['stage-12'].installedQuantity = 25;
  const packages = [
    { boxNo: 'BEAM', name: '基础梁', stageIndex: 2, arrivedAt: 100, arrivalSource: 'manifest', arrivalReceiptBoxNos: ['BEAMA','BEAMB'] },
    { boxNo: 'STEEL', name: '钢支架', stageIndex: 3, arrivalManualExcludedAt: 200, arrivalManualExcludedBy: '现场', arrivalImportId: 'IMPORT' },
    { boxNo: 'HV', name: '高压设备', stageIndex: 10, arrivedAt: 100 },
    { boxNo: 'CABLE', name: '电气接线', stageIndex: 12 },
    { boxNo: 'INS', name: '保温箱', stageIndex: 8, arrivedAt: 100 },
    { boxNo: 'NANO', name: '灰斗纳米涂层', stageIndex: 4 },
    { boxNo: 'HOIST', name: '顶部起吊支座', stageIndex: 11 },
    { boxNo: 'UNKNOWN', name: '其他', stageIndex: 0 }
  ];
  state.deviceStates[state.currentDeviceId] = {
    actualStageIndex: currentIndex, stageMetrics: metrics,
    progressLogs: [{ id: 'LOG', stageIndex: 2, previousStageIndex: 1, stageName: '基础梁安装', note: '原始说明' }],
    dispatchAlerts: [{ id: 'ALERT', sourceIndex: 3, targetIndex: 4, status: 'handled', handleNote: '已安排' }],
    arrivalLedger: { packages, demand: { fileName: '原始总单.xls' }, receiptImports: [], unmatchedReceipts: [] }
  };
  return state;
}
test('exact 13-node order and stable identities are shared by client and both cloud functions', () => {
  assert.deepEqual(catalog.STAGES.map(s => s.shortName), ['钢支架','支座','灰斗','壳体','楼梯平台','阴阳极系统','进出口喇叭','保温箱','灰斗纳米涂层','振打系统','电气安装','顶部起吊系统','调试']);
  assert.equal(new Set(catalog.STAGES.map(s => s.id)).size, 13);
  assert.deepEqual(catalog.STAGES.map(s => s.index), Array.from({length:13}, (_,i) => i+1));
  for (const cloud of ['arrival-manifest','notification-center']) {
    const remote = require('../cloudfunctions/' + cloud + '/stage-catalog');
    assert.deepEqual(remote.STAGES, catalog.STAGES);
    assert.deepEqual(remote.DEPENDENCIES, catalog.DEPENDENCIES);
    assert.equal(remote.VERSION, catalog.VERSION);
  }
  assert.deepEqual(domain.CONSTRUCTION_STAGES.map(s=>s.id), catalog.STAGES.map(s=>s.id));
});
test('legacy quantities, manual corrections and unique boxes survive; category migration is idempotent', () => {
  const old = legacyState(), untouched = plain(old);
  const next = foundation.normalizeState(old);
  assert.deepEqual(old, untouched, 'migration must not mutate the source/backup');
  const device = foundation.getCurrentDeviceState(next);
  assert.equal(device.actualStageIndex, 3);
  assert.equal(device.stageMetrics['stage-03'].installedQuantity, 50);
  assert.equal(device.stageMetrics['stage-03'].plannedQuantity, 100);
  assert.equal(device.stageMetrics['stage-03'].unit, '%');
  assert.equal(device.stageMetrics['stage-07'].installedQuantity, 30);
  assert.equal(device.stageMetrics['stage-12'].installedQuantity, 25);
  assert.equal(device.stageMetrics['stage-04'].installedQuantity, 20);
  assert.deepEqual(device.legacyStageBackup.stageMetrics, untouched.deviceStates[old.currentDeviceId].stageMetrics);
  assert.deepEqual(device.legacyStageBackup.dispatchAlerts, untouched.deviceStates[old.currentDeviceId].dispatchAlerts);
  assert.equal(device.stageMetrics['stage-03'].dailyEntries.length, 0, 'incompatible historical units must not mix in new daily entries');
  for (const id of ['stage-insulation','stage-nano-coating','stage-top-hoist']) assert.equal(device.stageMetrics[id].installedQuantity, 0);
  const ledger = foundation.getArrivalLedgerDetail(next);
  assert.equal(ledger.totalPackages, 8);
  assert.equal(ledger.arrivedPackages, 3);
  assert.deepEqual(device.arrivalLedger.packages.map(p=>p.stageIndex), [1,1,11,11,8,9,12,0]);
  assert.deepEqual(device.arrivalLedger.packages[0].arrivalReceiptBoxNos, ['BEAMA','BEAMB']);
  assert.equal(device.arrivalLedger.packages[1].arrivalManualExcludedAt, 200);
  assert.equal(device.progressLogs[0].stageIndex, 1);
  assert.equal(device.progressLogs[0].legacyStageIndex, 2);
  assert.equal(device.progressLogs[0].note, '原始说明');
  const twice = foundation.getCurrentDeviceState(foundation.normalizeState(next));
  assert.deepEqual(twice.stageMetrics, device.stageMetrics);
  assert.deepEqual(twice.arrivalLedger, device.arrivalLedger);
  assert.deepEqual(twice.legacyStageBackup, device.legacyStageBackup);
  assert.equal(twice.actualStageIndex, 3);
});
test('every old current-stage position maps by identity, never by the new display position', () => {
  for (let oldIndex = 1; oldIndex <= 13; oldIndex++) {
    const next = foundation.normalizeState(legacyState(oldIndex));
    assert.equal(foundation.getCurrentDeviceState(next).actualStageIndex, catalog.LEGACY_INDEX_MAP[oldIndex]);
  }
});
test('manual arrival correction and repeat receipt import still work after merging', () => {
  const next = foundation.normalizeState(legacyState());
  const corrected = foundation.applyStageArrivalQuantity(next, 1, 0, { name: '现场' });
  assert.equal(corrected.metric.manifestArrivedPackages, 0);
  assert.equal(foundation.getArrivalLedgerDetail(next).arrivedPackages, 2);
  const receipt = foundation.applyArrivalReceiptManifest(next, { fileName:'再次上传.xls', packages:[{boxNo:'BEAMA',name:'基础梁'}] }, {name:'现场'});
  assert.equal(receipt.arrivedPackages, 2, 'manual exclusion survives repeated split-box receipt');
  const restored = foundation.applyStageArrivalQuantity(next, 1, 2, {name:'现场'});
  assert.equal(restored.metric.manifestArrivedPackages, 2);
  assert.equal(foundation.getArrivalLedgerDetail(next).arrivedPackages, 4);
});
test('explicit on-site progress replaces conservative merged progress while retaining original evidence', () => {
  const next = foundation.normalizeState(legacyState());
  const detail = foundation.updateStageProgress(next, 1, {actualProgressPercent:85}, {name:'负责人'});
  assert.equal(detail.installedProgress, 85);
  assert.equal(detail.metric.migrationNote, undefined);
  assert.equal(foundation.getCurrentDeviceState(next).legacyStageBackup.stageMetrics['stage-02'].installedQuantity, 12);
  const suggestions = foundation.getDailyReportSuggestions(next);
  assert.deepEqual(suggestions.todayItems, ['钢支架安装','支座安装','灰斗安装']);
});
test('comparable manual arrival summaries merge without adding incompatible installation quantities', () => {
  const old = legacyState();
  const metrics = old.deviceStates[old.currentDeviceId].stageMetrics;
  metrics['stage-02'] = Object.assign(metrics['stage-02'], {summaryOverrideEnabled:true,summaryUnit:'箱',summaryDemandQuantity:10,summaryArrivalQuantity:8});
  metrics['stage-03'] = Object.assign(metrics['stage-03'], {summaryOverrideEnabled:true,summaryUnit:'箱',summaryDemandQuantity:20,summaryArrivalQuantity:15});
  old.deviceStates[old.currentDeviceId].arrivalLedger.packages = [];
  const detail = foundation.getStageProgressDetail(foundation.normalizeState(old), 1);
  assert.equal(detail.metric.summaryDemandQuantity, 30);
  assert.equal(detail.metric.summaryArrivalQuantity, 23);
  assert.equal(detail.installedProgress, 50);
});
test('import classifier routes merged and new nodes with specific component names taking priority', () => {
  const cases = [['基础梁',1],['钢支架',1],['高压设备',11],['电气控制柜',11],['阴极框架',6],['阳极板',6],['阳极振打底座',10],['保温箱顶板',8],['灰斗纳米涂层',9],['顶部起吊支座',12],['电动葫芦',12],['楼梯平台',5],['进口喇叭',7],['灰斗',3],['支座',2]];
  cases.forEach(([name,index]) => {
    const actual = parser.classifyPackage({name});
    assert.equal(actual.stageIndex,index,name);
    assert.equal(actual.stageName,catalog.STAGES[index-1].shortName,name);
  });
});
test('legacy quality references remain connected to merged nodes without changing original report prose', () => {
  const old = {schemaVersion:'4.1-domain', defects:[{id:'d',constructionStageId:'stage-10'}], inspections:[{id:'i',constructionStageId:'stage-02'}], reports:[{id:'r',stageId:'stage-08',todayItems:['基础梁安装']}], rectificationOrders:[{id:'o',constructionStageId:'stage-10'}]};
  const next = domain.normalizeState(old);
  assert.equal(next.defects[0].constructionStageId,'stage-12');
  assert.equal(next.inspections[0].constructionStageId,'stage-03');
  assert.equal(next.reports[0].stageId,'stage-07');
  assert.deepEqual(next.reports[0].todayItems,['基础梁安装']);
  assert.equal(old.defects[0].constructionStageId,'stage-10');
  assert.equal(domain.getNodeById('foundation-beam').stageId,'stage-03');
});
test('native WebGL scene keeps all 13 component categories and clips later assembly geometry', () => {
  const Scene = require('../components/construction-twin-3d/diorama/diorama');
  const scene = new Scene('low');
  for (let index = 1; index <= 13; index += 1) {
    const id = 'COMP-' + String(index).padStart(2,'0');
    assert.ok(scene.objects.some(object => object.componentId === id), id + ' must own real geometry');
  }
  const records = {};
  for (let index = 1; index <= 13; index += 1) records['COMP-' + String(index).padStart(2,'0')] = 100;
  scene.applyProgress(records,3,false);
  scene.visibleBatches(5.1,false,0,null,{});
  const visible = [...new Set(scene.currentObjects.map(item => item.object.componentId).filter(Boolean))].sort();
  assert.deepEqual(visible,['COMP-01','COMP-02','COMP-03']);
});
test('notification forecast uses stable IDs for both old and new foundation snapshots', () => {
  const source = fs.readFileSync(path.join(root,'cloudfunctions/notification-center/index.js'),'utf8');
  const context = {require:()=>catalog};
  vm.runInNewContext(source.slice(source.indexOf('const stageCatalog ='), source.indexOf('async function processDispatch('))+'\nthis.forecast = projectedDispatchAlerts;',context);
  const newer = {stageSchemaVersion:catalog.VERSION, actualStageIndex:1, stageMetrics:{'stage-03':{plannedQuantity:100,installedQuantity:80},'stage-04':{plannedQuantity:20,shippedQuantity:0}}};
  const older = {actualStageIndex:3,stageMetrics:newer.stageMetrics};
  for (const device of [newer,older]) {
    const alerts = context.forecast({deviceStates:{device}}, {date:'2026-09-06'}, {device:'1#'});
    assert.equal(alerts.length,1);
    assert.equal(alerts[0].targetStageId,'stage-04');
    assert.equal(alerts[0].title,'请安排灰斗发货');
    assert.equal(alerts[0].key,'ratio-dispatch:stage-03:stage-04');
  }
});
