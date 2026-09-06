// Canonical construction stages. IDs are stable identities, not display order.
var VERSION = 'stages-v2-20260906';
var STAGES = [
  {"index":1,"id":"stage-03","code":"S01","shortName":"钢支架","name":"钢支架安装","areaKeys":["steel-support","foundation-beam","support"],"plannedQuantity":100,"unit":"%","plannedLoads":58,"dispatchThreshold":80},
  {"index":2,"id":"stage-01","code":"S02","shortName":"支座","name":"支座安装","areaKeys":["support-bearing"],"plannedQuantity":40,"unit":"套","plannedLoads":5,"dispatchThreshold":65},
  {"index":3,"id":"stage-04","code":"S03","shortName":"灰斗","name":"灰斗安装","areaKeys":["ashopper"],"plannedQuantity":20,"unit":"台","plannedLoads":10,"dispatchThreshold":60},
  {"index":4,"id":"stage-05","code":"S04","shortName":"壳体","name":"壳体安装","areaKeys":["shell"],"plannedQuantity":4,"unit":"室","plannedLoads":18,"dispatchThreshold":50},
  {"index":5,"id":"stage-11","code":"S05","shortName":"楼梯平台","name":"楼梯平台安装","areaKeys":["platform"],"plannedQuantity":1,"unit":"项","plannedLoads":8,"dispatchThreshold":65},
  {"index":6,"id":"stage-07","code":"S06","shortName":"阴阳极系统","name":"阴阳极系统安装","areaKeys":["anode","cathode"],"plannedQuantity":100,"unit":"%","plannedLoads":60,"dispatchThreshold":65},
  {"index":7,"id":"stage-06","code":"S07","shortName":"进出口喇叭","name":"进出口喇叭安装","areaKeys":["horn"],"plannedQuantity":8,"unit":"套","plannedLoads":12,"dispatchThreshold":65},
  {"index":8,"id":"stage-insulation","code":"S08","shortName":"保温箱","name":"保温箱安装","areaKeys":["insulation"],"plannedQuantity":1,"unit":"项","plannedLoads":1,"dispatchThreshold":65},
  {"index":9,"id":"stage-nano-coating","code":"S09","shortName":"灰斗纳米涂层","name":"灰斗纳米涂层施工","areaKeys":["nano-coating"],"plannedQuantity":100,"unit":"%","plannedLoads":0,"dispatchThreshold":65},
  {"index":10,"id":"stage-09","code":"S10","shortName":"振打系统","name":"振打系统安装","areaKeys":["rapping"],"plannedQuantity":20,"unit":"套","plannedLoads":12,"dispatchThreshold":65},
  {"index":11,"id":"stage-12","code":"S11","shortName":"电气安装","name":"电气安装","areaKeys":["hvline","instrument"],"plannedQuantity":100,"unit":"%","plannedLoads":14,"dispatchThreshold":65},
  {"index":12,"id":"stage-top-hoist","code":"S12","shortName":"顶部起吊系统","name":"顶部起吊系统安装","areaKeys":["hoist"],"plannedQuantity":1,"unit":"项","plannedLoads":1,"dispatchThreshold":65},
  {"index":13,"id":"stage-13","code":"S13","shortName":"调试","name":"调试","areaKeys":["commissioning"],"plannedQuantity":100,"unit":"%","plannedLoads":0,"dispatchThreshold":65}
];
// Preserve established dispatch relationships after the category merge;
// display order is not itself a shipping dependency.
var DEPENDENCIES = [
  { sourceIndex: 2, targetIndex: 1, threshold: 65 },
  { sourceIndex: 1, targetIndex: 3, threshold: 80 },
  { sourceIndex: 3, targetIndex: 4, threshold: 60 },
  { sourceIndex: 4, targetIndex: 5, threshold: 50 },
  { sourceIndex: 4, targetIndex: 6, threshold: 50 },
  { sourceIndex: 4, targetIndex: 7, threshold: 50 },
  { sourceIndex: 6, targetIndex: 10, threshold: 65 },
  { sourceIndex: 10, targetIndex: 11, threshold: 65 },
  { sourceIndex: 11, targetIndex: 13, threshold: 65 }
];
var LEGACY_INDEX_MAP = { 1: 2, 2: 1, 3: 1, 4: 3, 5: 4, 6: 7, 7: 6, 8: 6, 9: 10, 10: 11, 11: 5, 12: 11, 13: 13 };
function legacyIndex(value) { return LEGACY_INDEX_MAP[Number(value)] || 0; }
function canonicalId(value) { return { 'stage-02': 'stage-03', 'stage-08': 'stage-07', 'stage-10': 'stage-12' }[value] || value; }
// Split only when the saved description explicitly identifies the new category.
function specialIndex(name) {
  name = String(name || '');
  if (/纳米|涂层/.test(name)) return 9;
  if (/保温箱/.test(name)) return 8;
  if (/顶部起吊|起吊|电动葫芦/.test(name)) return 12;
  return 0;
}
module.exports = { VERSION: VERSION, STAGES: STAGES, DEPENDENCIES: DEPENDENCIES, LEGACY_INDEX_MAP: LEGACY_INDEX_MAP, legacyIndex: legacyIndex, canonicalId: canonicalId, specialIndex: specialIndex };
