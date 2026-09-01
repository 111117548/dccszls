// V4.1 common project/device/construction-stage foundation.
// The real GLB/WebGL model is intentionally outside this module.

var STORAGE_KEY = 'esp_v4_foundation';
var SCHEMA_VERSION = '7.0-logistics-alerts';

var STAGES = [
  { index: 1, id: 'stage-01', code: 'S01', name: '支座安装', shortName: '支座', areaKeys: ['support-bearing'], plannedQuantity: 40, unit: '套', plannedLoads: 5, dispatchThreshold: 65 },
  { index: 2, id: 'stage-02', code: 'S02', name: '基础梁安装', shortName: '基础梁', areaKeys: ['foundation-beam'], plannedQuantity: 24, unit: '榀', plannedLoads: 8, dispatchThreshold: 65 },
  { index: 3, id: 'stage-03', code: 'S03', name: '钢支架安装', shortName: '钢支架', areaKeys: ['steel-support'], plannedQuantity: 960, unit: '件', plannedLoads: 50, dispatchThreshold: 80 },
  { index: 4, id: 'stage-04', code: 'S04', name: '灰斗安装', shortName: '灰斗', areaKeys: ['ashopper'], plannedQuantity: 20, unit: '台', plannedLoads: 10, dispatchThreshold: 60 },
  { index: 5, id: 'stage-05', code: 'S05', name: '壳体安装', shortName: '壳体', areaKeys: ['shell'], plannedQuantity: 4, unit: '室', plannedLoads: 18, dispatchThreshold: 50 },
  { index: 6, id: 'stage-06', code: 'S06', name: '进出口安装', shortName: '进出口', areaKeys: ['horn'], plannedQuantity: 8, unit: '套', plannedLoads: 12, dispatchThreshold: 65 },
  { index: 7, id: 'stage-07', code: 'S07', name: '阳极系统安装', shortName: '阳极系统', areaKeys: ['anode'], plannedQuantity: 20, unit: '电场', plannedLoads: 30, dispatchThreshold: 65 },
  { index: 8, id: 'stage-08', code: 'S08', name: '阴极系统安装', shortName: '阴极系统', areaKeys: ['cathode'], plannedQuantity: 20, unit: '电场', plannedLoads: 30, dispatchThreshold: 65 },
  { index: 9, id: 'stage-09', code: 'S09', name: '振打系统安装', shortName: '振打系统', areaKeys: ['rapping'], plannedQuantity: 20, unit: '套', plannedLoads: 12, dispatchThreshold: 65 },
  { index: 10, id: 'stage-10', code: 'S10', name: '高压设备安装', shortName: '高压设备', areaKeys: ['hvline'], plannedQuantity: 20, unit: '套', plannedLoads: 8, dispatchThreshold: 65 },
  { index: 11, id: 'stage-11', code: 'S11', name: '平台扶梯安装', shortName: '平台扶梯', areaKeys: ['platform'], plannedQuantity: 1, unit: '项', plannedLoads: 8, dispatchThreshold: 65 },
  { index: 12, id: 'stage-12', code: 'S12', name: '电气仪表安装', shortName: '电气仪表', areaKeys: ['instrument'], plannedQuantity: 1, unit: '项', plannedLoads: 6, dispatchThreshold: 65 },
  { index: 13, id: 'stage-13', code: 'S13', name: '调试验收', shortName: '调试验收', areaKeys: ['commissioning'], plannedQuantity: 1, unit: '项', plannedLoads: 1, dispatchThreshold: 65 }
];

// Upstream installation progress drives downstream dispatch preparation.
// A source component may trigger more than one downstream component.
var STAGE_DEPENDENCIES = [
  { sourceIndex: 1, targetIndex: 2, threshold: 65 },
  { sourceIndex: 2, targetIndex: 3, threshold: 65 },
  { sourceIndex: 3, targetIndex: 4, threshold: 80 },
  { sourceIndex: 4, targetIndex: 5, threshold: 60 },
  { sourceIndex: 5, targetIndex: 6, threshold: 50 },
  { sourceIndex: 5, targetIndex: 7, threshold: 50 },
  { sourceIndex: 5, targetIndex: 8, threshold: 50 },
  { sourceIndex: 8, targetIndex: 9, threshold: 65 },
  { sourceIndex: 9, targetIndex: 10, threshold: 65 },
  { sourceIndex: 10, targetIndex: 11, threshold: 65 },
  { sourceIndex: 11, targetIndex: 12, threshold: 65 },
  { sourceIndex: 12, targetIndex: 13, threshold: 65 }
];

var MODEL_TEMPLATES = [{
  id: 'g793-esp-four-chamber', drawingNo: 'G793.0', name: 'G793四室五电场低低温电除尘器',
  layout: '两列双室 · 四室五电场', chamberCount: 4, fieldCountPerChamber: 5,
  hopperCount: 20, inletCount: 4, outletCount: 4, modelStatus: 'reserved', modelAsset: ''
}];

var PROJECTS = [
  { id: 'project-pengyang', code: 'PY-ESP', name: '彭阳项目', shortName: '彭阳', unit: '电厂机组工程', location: '宁夏彭阳', manager: '项目工程部', status: 'construction', statusName: '施工中', drawingNo: 'G793.0', modelTemplateId: 'g793-esp-four-chamber' },
  { id: 'project-zhongwei', code: 'ZW-ESP', name: '中卫电厂二期项目', shortName: '中卫二期', unit: '2×660MW机组', location: '宁夏中卫', manager: '项目工程部', status: 'construction', statusName: '施工中', drawingNo: 'G760.0', modelTemplateId: 'g793-esp-four-chamber' }
];

var DEVICES = [
  { id: 'pengyang-esp-01', projectId: 'project-pengyang', code: 'ESP-01', name: '#1机组电除尘器', unitNo: '#1机组', ordinal: 1, modelTemplateId: 'g793-esp-four-chamber' },
  { id: 'pengyang-esp-02', projectId: 'project-pengyang', code: 'ESP-02', name: '#2机组电除尘器', unitNo: '#2机组', ordinal: 2, modelTemplateId: 'g793-esp-four-chamber' },
  { id: 'pengyang-esp-03', projectId: 'project-pengyang', code: 'ESP-03', name: '#3机组电除尘器', unitNo: '#3机组', ordinal: 3, modelTemplateId: 'g793-esp-four-chamber' },
  { id: 'pengyang-esp-04', projectId: 'project-pengyang', code: 'ESP-04', name: '#4机组电除尘器', unitNo: '#4机组', ordinal: 4, modelTemplateId: 'g793-esp-four-chamber' },
  { id: 'zhongwei-esp-01', projectId: 'project-zhongwei', code: 'ESP-01', name: '#1机组电除尘器', unitNo: '#1机组', ordinal: 1, modelTemplateId: 'g793-esp-four-chamber' },
  { id: 'zhongwei-esp-02', projectId: 'project-zhongwei', code: 'ESP-02', name: '#2机组电除尘器', unitNo: '#2机组', ordinal: 2, modelTemplateId: 'g793-esp-four-chamber' }
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function findById(list, id) {
  for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
  return null;
}
function getDevicesByProject(state, projectId) {
  return (state.devices || []).filter(function (device) { return device.projectId === projectId; });
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function round1(value) { return Number((Number(value) || 0).toFixed(1)); }
function progressOf(value, total) { return total > 0 ? round1(clamp(value / total * 100, 0, 100)) : 0; }
function quantityAt(total, ratio) { return round1(Number(total || 0) * ratio); }
function pad2(value) { return String(value).padStart(2, '0'); }
function dateKey(value) {
  var date = value ? new Date(value) : new Date();
  if (isNaN(date.getTime())) date = new Date();
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}
function parseDate(value) {
  if (!value) return null;
  var date = new Date(String(value).replace(/-/g, '/'));
  return isNaN(date.getTime()) ? null : date;
}
function addDays(value, days) {
  var date = value instanceof Date ? new Date(value.getTime()) : (parseDate(value) || new Date());
  date.setDate(date.getDate() + Math.max(0, Math.ceil(Number(days) || 0)));
  return dateKey(date);
}
function daysBetween(start, end) {
  var startDate = parseDate(start);
  var endDate = parseDate(end);
  if (!startDate || !endDate) return null;
  return Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
}
function elapsedDays(start, end) {
  var startDate = parseDate(start);
  var endDate = end instanceof Date ? new Date(end.getTime()) : (parseDate(end) || new Date());
  if (!startDate || isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.floor((parseDate(dateKey(endDate)).getTime() - startDate.getTime()) / 86400000));
}
function getProgressProjection(metric, now) {
  metric = metric || {};
  var actualProgress = progressOf(metric.installedQuantity, metric.plannedQuantity);
  var mode = metric.progressMode === 'forecast' ? 'forecast' : 'actual';
  var dailyPercent = clamp(metric.forecastDailyPercent === undefined ? 5 : metric.forecastDailyPercent, 0.1, 30);
  var basePercent = clamp(metric.forecastBasePercent === undefined ? actualProgress : metric.forecastBasePercent, 0, 100);
  var baseDate = metric.forecastBaseDate || dateKey(now || new Date());
  var days = mode === 'forecast' ? elapsedDays(baseDate, now || new Date()) : 0;
  var projectedProgress = mode === 'forecast' ? clamp(basePercent + days * dailyPercent, 0, 100) : actualProgress;
  var effectiveProgress = Math.max(actualProgress, projectedProgress);
  var prepareThreshold = clamp(metric.warningPreparePercent === undefined ? 75 : metric.warningPreparePercent, 50, 95);
  var dispatchThreshold = clamp(metric.warningDispatchPercent === undefined ? 80 : metric.warningDispatchPercent, prepareThreshold, 100);
  function daysTo(threshold) {
    if (effectiveProgress >= threshold) return 0;
    return mode === 'forecast' && dailyPercent > 0 ? Math.ceil((threshold - effectiveProgress) / dailyPercent) : null;
  }
  var daysToPrepare = daysTo(prepareThreshold);
  var daysToDispatch = daysTo(dispatchThreshold);
  return {
    mode: mode, actualProgress: actualProgress, projectedProgress: round1(projectedProgress), effectiveProgress: round1(effectiveProgress),
    dailyPercent: dailyPercent, basePercent: basePercent, baseDate: baseDate, elapsedDays: days,
    prepareThreshold: prepareThreshold, dispatchThreshold: dispatchThreshold,
    daysToPrepare: daysToPrepare, daysToDispatch: daysToDispatch,
    prepareDate: daysToPrepare == null ? '' : addDays(now || new Date(), daysToPrepare),
    dispatchDate: daysToDispatch == null ? '' : addDays(now || new Date(), daysToDispatch)
  };
}
function alertRank(level) {
  return { normal: 0, yellow: 1, orange: 2, red: 3 }[level] || 0;
}
function alertLevelName(level) {
  return { normal: '正常', yellow: '关注', orange: '预警', red: '紧急' }[level] || '正常';
}
function getDependenciesForStage(stageIndex) {
  return STAGE_DEPENDENCIES.filter(function (item) { return item.sourceIndex === Number(stageIndex); });
}
function getDailyAnalytics(metric, now) {
  var entries = Array.isArray(metric.dailyEntries) ? metric.dailyEntries.slice() : [];
  var today = parseDate(dateKey(now));
  var start = new Date(today.getTime());
  start.setDate(start.getDate() - 6);
  var recent = entries.filter(function (entry) {
    var day = parseDate(entry.date);
    return day && day >= start && day <= today && Number(entry.installedAdded) > 0;
  });
  var installedIn7Days = recent.reduce(function (sum, entry) { return sum + Math.max(0, Number(entry.installedAdded) || 0); }, 0);
  var validConstructionDays = recent.length;
  var averageInstallSpeed = validConstructionDays ? round1(installedIn7Days / validConstructionDays) : 0;
  var inventoryQuantity = round1(Math.max(0, Number(metric.arrivedQuantity || 0) - Number(metric.installedQuantity || 0)));
  var remainingQuantity = round1(Math.max(0, Number(metric.plannedQuantity || 0) - Number(metric.installedQuantity || 0)));
  var inventorySupportDays = averageInstallSpeed > 0 ? round1(inventoryQuantity / averageInstallSpeed) : null;
  var estimatedInstallCompletionDate = averageInstallSpeed > 0 ? addDays(today, remainingQuantity / averageInstallSpeed) : '';
  var manifestPlanned = Number(metric.manifestPlannedPackages || 0);
  var manifestArrived = Number(metric.manifestArrivedPackages || 0);
  if (metric.summaryOverrideEnabled && Number(metric.summaryDemandQuantity || 0) > 0) {
    manifestPlanned = Number(metric.summaryDemandQuantity || 0);
    manifestArrived = Number(metric.summaryArrivalQuantity || 0);
  }
  return {
    inventoryQuantity: inventoryQuantity,
    remainingQuantity: remainingQuantity,
    installedIn7Days: round1(installedIn7Days),
    validConstructionDays: validConstructionDays,
    averageInstallSpeed: averageInstallSpeed,
    inventorySupportDays: inventorySupportDays,
    estimatedInstallCompletionDate: estimatedInstallCompletionDate,
    installationCompletionRate: progressOf(metric.installedQuantity, metric.plannedQuantity),
    arrivalCompletionRate: manifestPlanned > 0 ? progressOf(manifestArrived, manifestPlanned) : progressOf(metric.arrivedQuantity, metric.plannedQuantity),
    arrivalPackageDriven: manifestPlanned > 0
  };
}
function getLifecycle(metric) {
  var plan = Number(metric.plannedQuantity) || 0;
  var produced = Number(metric.productionQuantity) || 0;
  var shipped = Number(metric.shippedQuantity) || 0;
  var arrived = Number(metric.arrivedQuantity) || 0;
  var installed = Number(metric.installedQuantity) || 0;
  var manifestPlan = Number(metric.manifestPlannedPackages || 0);
  var manifestArrived = Number(metric.manifestArrivedPackages || 0);
  var arrivalProgress = manifestPlan > 0 ? progressOf(manifestArrived, manifestPlan) : progressOf(arrived, plan);
  var current = installed >= plan && plan > 0 ? 6 : installed > 0 ? 5 : arrived > 0 ? 4 : shipped > arrived ? 3 : shipped > 0 ? 2 : 1;
  return [
    { key: 'production', name: '计划生产', progress: progressOf(produced, plan), active: current === 1, completed: produced >= plan && plan > 0 },
    { key: 'dispatch', name: '发货', progress: progressOf(shipped, plan), active: current === 2, completed: shipped >= plan && plan > 0 },
    { key: 'transport', name: '运输', progress: shipped > 0 ? progressOf(arrived, shipped) : 0, active: current === 3, completed: arrived >= shipped && shipped > 0 },
    { key: 'arrival', name: '到货签收', progress: arrivalProgress, active: current === 4, completed: arrivalProgress >= 100 },
    { key: 'installation', name: '安装', progress: progressOf(installed, plan), active: current === 5, completed: installed >= plan && plan > 0 },
    { key: 'complete', name: '完成', progress: installed >= plan && plan > 0 ? 100 : 0, active: current === 6, completed: installed >= plan && plan > 0 }
  ];
}
function createStageMetric(stage, stateName) {
  var shippedRatio = stateName === 'completed' ? 1 : stateName === 'working' ? 0.84 : stateName === 'next' ? 0.08 : 0;
  var arrivedRatio = stateName === 'completed' ? 1 : stateName === 'working' ? 0.72 : 0;
  var installedRatio = stateName === 'completed' ? 1 : stateName === 'working' ? 0.58 : 0;
  return {
    stageId: stage.id,
    plannedQuantity: stage.plannedQuantity,
    unit: stage.unit,
    plannedLoads: stage.plannedLoads,
    productionQuantity: quantityAt(stage.plannedQuantity, Math.max(shippedRatio, stateName === 'next' ? 0.35 : 0)),
    shippedQuantity: quantityAt(stage.plannedQuantity, shippedRatio),
    arrivedQuantity: quantityAt(stage.plannedQuantity, arrivedRatio),
    installedQuantity: quantityAt(stage.plannedQuantity, installedRatio),
    shippedLoads: Math.round(stage.plannedLoads * shippedRatio),
    arrivedLoads: Math.round(stage.plannedLoads * arrivedRatio),
    dispatchThreshold: stage.dispatchThreshold || 65,
    transportLeadDays: 7,
    safetyBufferDays: 3,
    plannedInstallDate: '',
    estimatedArrivalDate: '',
    progressMode: 'actual',
    forecastDailyPercent: 5,
    forecastBasePercent: round1(installedRatio * 100),
    forecastBaseDate: dateKey(new Date()),
    warningPreparePercent: 75,
    warningDispatchPercent: 80,
    summaryOverrideEnabled: false,
    summaryDemandQuantity: 0,
    summaryArrivalQuantity: 0,
    summaryUnit: '箱',
    dailyEntries: [],
    updatedAt: Date.now()
  };
}
function makeInitialStageMetrics(actualStageIndex) {
  var result = {};
  STAGES.forEach(function (stage) {
    var stateName = stage.index < actualStageIndex ? 'completed' : stage.index === actualStageIndex ? 'working' : stage.index === actualStageIndex + 1 ? 'next' : 'pending';
    result[stage.id] = createStageMetric(stage, stateName);
  });
  return result;
}
function normalizeStageMetrics(savedMetrics, actualStageIndex) {
  var defaults = makeInitialStageMetrics(actualStageIndex);
  STAGES.forEach(function (stage) {
    var saved = savedMetrics && savedMetrics[stage.id] || {};
    var metric = Object.assign({}, defaults[stage.id], saved);
    metric.plannedQuantity = Math.max(0, Number(metric.plannedQuantity) || stage.plannedQuantity);
    metric.unit = metric.unit || stage.unit;
    metric.plannedLoads = Math.max(0, Number(metric.plannedLoads) || stage.plannedLoads);
    metric.installedQuantity = clamp(metric.installedQuantity, 0, metric.plannedQuantity);
    metric.arrivedQuantity = clamp(Math.max(metric.arrivedQuantity || 0, metric.installedQuantity), 0, metric.plannedQuantity);
    metric.shippedQuantity = clamp(Math.max(metric.shippedQuantity || 0, metric.arrivedQuantity), 0, metric.plannedQuantity);
    metric.productionQuantity = clamp(Math.max(metric.productionQuantity || 0, metric.shippedQuantity), 0, metric.plannedQuantity);
    metric.shippedLoads = clamp(metric.shippedLoads, 0, metric.plannedLoads);
    metric.arrivedLoads = clamp(metric.arrivedLoads, 0, metric.plannedLoads);
    metric.dispatchThreshold = clamp(metric.dispatchThreshold || stage.dispatchThreshold || 65, 30, 95);
    metric.transportLeadDays = clamp(metric.transportLeadDays === undefined ? 7 : metric.transportLeadDays, 0, 180);
    metric.safetyBufferDays = clamp(metric.safetyBufferDays === undefined ? 3 : metric.safetyBufferDays, 0, 60);
    metric.plannedInstallDate = metric.plannedInstallDate || '';
    metric.estimatedArrivalDate = metric.estimatedArrivalDate || '';
    metric.progressMode = metric.progressMode === 'forecast' ? 'forecast' : 'actual';
    metric.forecastDailyPercent = clamp(metric.forecastDailyPercent === undefined ? 5 : metric.forecastDailyPercent, 0.1, 30);
    metric.forecastBasePercent = clamp(metric.forecastBasePercent === undefined ? progressOf(metric.installedQuantity, metric.plannedQuantity) : metric.forecastBasePercent, 0, 100);
    metric.forecastBaseDate = metric.forecastBaseDate || dateKey(new Date());
    metric.warningPreparePercent = clamp(metric.warningPreparePercent === undefined ? 75 : metric.warningPreparePercent, 50, 95);
    metric.warningDispatchPercent = clamp(metric.warningDispatchPercent === undefined ? 80 : metric.warningDispatchPercent, metric.warningPreparePercent, 100);
    metric.summaryOverrideEnabled = metric.summaryOverrideEnabled === true;
    metric.summaryDemandQuantity = Math.max(0, Number(metric.summaryDemandQuantity) || 0);
    metric.summaryArrivalQuantity = clamp(metric.summaryArrivalQuantity, 0, metric.summaryDemandQuantity || Number.MAX_SAFE_INTEGER);
    metric.summaryUnit = normalizeText(metric.summaryUnit) || '箱';
    metric.dailyEntries = Array.isArray(metric.dailyEntries) ? metric.dailyEntries.filter(function (entry) { return entry && entry.date; }).slice(0, 180) : [];
    defaults[stage.id] = metric;
  });
  return defaults;
}
function makeStageProgress(actualStageIndex, stageMetrics) {
  return STAGES.map(function (stage) {
    var metric = stageMetrics && stageMetrics[stage.id] || createStageMetric(stage, stage.index < actualStageIndex ? 'completed' : stage.index === actualStageIndex ? 'working' : 'pending');
    var progress = progressOf(metric.installedQuantity, metric.plannedQuantity);
    var status = progress >= 100 ? 'completed' : (progress > 0 || stage.index === actualStageIndex) ? 'working' : 'pending';
    return Object.assign({}, stage, {
      status: status,
      statusName: status === 'completed' ? '已完成' : status === 'working' ? '当前阶段' : '待施工',
      progress: progress,
      installedProgress: progress,
      arrivedProgress: progressOf(metric.arrivedQuantity, metric.plannedQuantity),
      shippedProgress: progressOf(metric.shippedQuantity, metric.plannedQuantity),
      plannedQuantity: metric.plannedQuantity,
      productionQuantity: metric.productionQuantity,
      shippedQuantity: metric.shippedQuantity,
      arrivedQuantity: metric.arrivedQuantity,
      installedQuantity: metric.installedQuantity,
      unit: metric.unit,
      plannedLoads: metric.plannedLoads,
      shippedLoads: metric.shippedLoads,
      arrivedLoads: metric.arrivedLoads,
      dispatchThreshold: metric.dispatchThreshold
    });
  });
}
function refreshDeviceProgress(deviceState) {
  deviceState.stageMetrics = normalizeStageMetrics(deviceState.stageMetrics, deviceState.actualStageIndex || 1);
  deviceState.stageProgress = makeStageProgress(deviceState.actualStageIndex || 1, deviceState.stageMetrics);
  var sum = deviceState.stageProgress.reduce(function (total, item) { return total + item.progress; }, 0);
  deviceState.overallProgress = round1(sum / STAGES.length);
  deviceState.updatedAt = Date.now();
  return deviceState;
}
function createArrivalLedger() {
  return {
    demand: null,
    packages: [],
    receiptImports: [],
    unmatchedReceipts: [],
    updatedAt: 0
  };
}
function normalizeArrivalLedger(value) {
  var ledger = Object.assign(createArrivalLedger(), value || {});
  ledger.packages = Array.isArray(ledger.packages) ? ledger.packages : [];
  ledger.receiptImports = Array.isArray(ledger.receiptImports) ? ledger.receiptImports.slice(0, 30) : [];
  ledger.unmatchedReceipts = Array.isArray(ledger.unmatchedReceipts) ? ledger.unmatchedReceipts.slice(0, 200) : [];
  return ledger;
}
function arrivalBoxKey(value) { return normalizeText(value).replace(/\s+/g, '').toUpperCase(); }
function sanitizeArrivalPackage(item) {
  item = item || {};
  return {
    boxNo: normalizeText(item.boxNo),
    drawingNo: normalizeText(item.drawingNo),
    name: normalizeText(item.name) || '未命名包装箱',
    unit: normalizeText(item.unit) || '箱',
    quantity: Math.max(0, Number(item.quantity) || 1),
    packageType: normalizeText(item.packageType),
    grossWeight: Math.max(0, Number(item.grossWeight) || 0),
    netWeight: Math.max(0, Number(item.netWeight) || 0),
    contractNo: normalizeText(item.contractNo),
    deviceNo: normalizeText(item.deviceNo),
    projectName: normalizeText(item.projectName),
    itemLineCount: Math.max(0, Number(item.itemLineCount) || 0),
    itemQuantity: Math.max(0, Number(item.itemQuantity) || 0),
    stageIndex: Math.max(0, Math.min(13, Number(item.stageIndex) || 0)),
    stageName: normalizeText(item.stageName) || '待归类'
  };
}
function syncArrivalMetrics(deviceState) {
  var ledger = normalizeArrivalLedger(deviceState.arrivalLedger);
  deviceState.arrivalLedger = ledger;
  deviceState.stageMetrics = normalizeStageMetrics(deviceState.stageMetrics, deviceState.actualStageIndex || 1);
  STAGES.forEach(function (stage) {
    var planned = ledger.packages.filter(function (item) { return Number(item.stageIndex) === stage.index; }).length;
    var arrived = ledger.packages.filter(function (item) { return Number(item.stageIndex) === stage.index && item.arrivedAt; }).length;
    var metric = deviceState.stageMetrics[stage.id];
    metric.manifestPlannedPackages = planned;
    metric.manifestArrivedPackages = arrived;
    metric.arrivalManifestUpdatedAt = ledger.updatedAt || 0;
    if (planned > 0) {
      metric.plannedLoads = planned;
      metric.arrivedLoads = arrived;
      metric.shippedLoads = Math.max(Number(metric.shippedLoads || 0), arrived);
    }
  });
}
function getArrivalLedgerDetail(state) {
  var deviceState = getCurrentDeviceState(state);
  syncArrivalMetrics(deviceState);
  var ledger = deviceState.arrivalLedger;
  var packages = ledger.packages || [];
  var stageSummaries = [];
  for (var index = 0; index <= STAGES.length; index++) {
    var stageIndex = index;
    var planned = packages.filter(function (item) { return Number(item.stageIndex) === stageIndex; }).length;
    if (!planned) continue;
    var arrived = packages.filter(function (item) { return Number(item.stageIndex) === stageIndex && item.arrivedAt; }).length;
    var stage = stageIndex > 0 ? STAGES[stageIndex - 1] : { name: '待归类', shortName: '待归类' };
    stageSummaries.push({
      stageIndex: stageIndex,
      stageName: stage.shortName || stage.name,
      plannedPackages: planned,
      arrivedPackages: arrived,
      remainingPackages: Math.max(0, planned - arrived),
      completionRate: progressOf(arrived, planned)
    });
  }
  var arrivedPackages = packages.filter(function (item) { return item.arrivedAt; }).length;
  return {
    demand: clone(ledger.demand),
    totalPackages: packages.length,
    arrivedPackages: arrivedPackages,
    remainingPackages: Math.max(0, packages.length - arrivedPackages),
    completionRate: progressOf(arrivedPackages, packages.length),
    classifiedPackages: packages.filter(function (item) { return Number(item.stageIndex) > 0; }).length,
    unmatchedPackages: packages.filter(function (item) { return !Number(item.stageIndex); }).length,
    detailLineCount: packages.reduce(function (sum, item) { return sum + Number(item.itemLineCount || 0); }, 0),
    stageSummaries: stageSummaries,
    receiptImports: clone(ledger.receiptImports.slice(0, 10)),
    unmatchedReceipts: clone(ledger.unmatchedReceipts.slice(0, 30)),
    unmatchedDemandPackages: clone(packages.filter(function (item) { return !Number(item.stageIndex); }).slice(0, 30)),
    updatedAt: ledger.updatedAt || 0
  };
}
function applyArrivalDemandManifest(state, payload, actor) {
  payload = payload || {};
  var packages = Array.isArray(payload.packages) ? payload.packages : [];
  if (!packages.length) throw new Error('需求总清单中未识别到包装箱');
  if (packages.length > 5000) throw new Error('单份需求总清单最多支持5000个包装箱');
  var deviceState = getCurrentDeviceState(state);
  var previous = normalizeArrivalLedger(deviceState.arrivalLedger);
  var previousMap = {};
  previous.packages.forEach(function (item) { previousMap[arrivalBoxKey(item.boxNo)] = item; });
  var seen = {};
  var normalized = [];
  packages.forEach(function (item) {
    var pkg = sanitizeArrivalPackage(item);
    var key = arrivalBoxKey(pkg.boxNo);
    if (!key || seen[key]) return;
    seen[key] = true;
    var old = previousMap[key];
    if (old && old.arrivedAt) {
      pkg.arrivedAt = old.arrivedAt;
      pkg.arrivalFileName = old.arrivalFileName || '';
    }
    normalized.push(pkg);
  });
  var importedAt = Date.now();
  deviceState.arrivalLedger = {
    demand: {
      fileID: normalizeText(payload.fileID), fileName: normalizeText(payload.fileName) || '需求总清单',
      sheetName: normalizeText(payload.sheetName), rowCount: Number(payload.rowCount || 0),
      packageCount: normalized.length, detailLineCount: Number(payload.detailLineCount || 0),
      importedAt: importedAt, importedBy: actor && actor.name || '现场用户'
    },
    packages: normalized,
    receiptImports: previous.receiptImports,
    unmatchedReceipts: previous.unmatchedReceipts,
    updatedAt: importedAt
  };
  syncArrivalMetrics(deviceState);
  refreshDeviceProgress(deviceState);
  evaluateDispatchAlerts(deviceState, new Date());
  state.updatedAt = importedAt;
  return getArrivalLedgerDetail(state);
}
function applyArrivalReceiptManifest(state, payload, actor) {
  payload = payload || {};
  var receiptPackages = Array.isArray(payload.packages) ? payload.packages : [];
  if (!receiptPackages.length) throw new Error('到货清单中未识别到包装箱');
  var deviceState = getCurrentDeviceState(state);
  var ledger = normalizeArrivalLedger(deviceState.arrivalLedger);
  if (!ledger.demand || !ledger.packages.length) throw new Error('请先导入需求总清单');
  var demandMap = {};
  ledger.packages.forEach(function (item) { demandMap[arrivalBoxKey(item.boxNo)] = item; });
  var now = Date.now();
  var matched = 0;
  var added = 0;
  var duplicates = 0;
  var unmatched = [];
  var seen = {};
  receiptPackages.forEach(function (item) {
    var key = arrivalBoxKey(item.boxNo);
    if (!key || seen[key]) return;
    seen[key] = true;
    var target = demandMap[key];
    if (!target) { unmatched.push({ boxNo: normalizeText(item.boxNo), name: normalizeText(item.name), fileName: normalizeText(payload.fileName), importedAt: now }); return; }
    matched += 1;
    if (target.arrivedAt) duplicates += 1;
    else {
      target.arrivedAt = now;
      target.arrivalFileName = normalizeText(payload.fileName) || '到货清单';
      added += 1;
    }
  });
  ledger.unmatchedReceipts = unmatched.concat(ledger.unmatchedReceipts || []).slice(0, 200);
  ledger.receiptImports.unshift({
    id: createId('ARRIVAL'), fileID: normalizeText(payload.fileID), fileName: normalizeText(payload.fileName) || '到货清单',
    packageCount: receiptPackages.length, matchedPackages: matched, addedPackages: added,
    duplicatePackages: duplicates, unmatchedPackages: unmatched.length,
    importedAt: now, importedBy: actor && actor.name || '现场用户'
  });
  ledger.receiptImports = ledger.receiptImports.slice(0, 30);
  ledger.updatedAt = now;
  deviceState.arrivalLedger = ledger;
  syncArrivalMetrics(deviceState);
  refreshDeviceProgress(deviceState);
  evaluateDispatchAlerts(deviceState, new Date());
  state.updatedAt = now;
  var detail = getArrivalLedgerDetail(state);
  detail.lastImport = clone(ledger.receiptImports[0]);
  return detail;
}
function createDeviceState(stageIndex, qualityScore) {
  var safeStage = Math.max(1, Math.min(13, Number(stageIndex) || 1));
  return refreshDeviceProgress({
    actualStageIndex: safeStage,
    qualityScore: Number(qualityScore) || 92,
    qualityStatus: 'warning',
    qualityStatusName: '重点工序施工中',
    stageMetrics: makeInitialStageMetrics(safeStage),
    arrivalLedger: createArrivalLedger(),
    progressLogs: [],
    dispatchAlerts: [],
    updatedAt: Date.now()
  });
}
function createInitialState() {
  var deviceStates = {};
  DEVICES.forEach(function (device, index) {
    deviceStates[device.id] = createDeviceState(index === 0 ? 6 : Math.max(1, 5 - index), 92 - index);
  });
  return {
    schemaVersion: SCHEMA_VERSION, projects: clone(PROJECTS), devices: clone(DEVICES),
    modelTemplates: clone(MODEL_TEMPLATES), currentProjectId: 'project-pengyang',
    currentDeviceId: 'pengyang-esp-01', deviceStates: deviceStates, updatedAt: Date.now()
  };
}
function normalizeState(saved) {
  var initial = createInitialState();
  if (!saved) return initial;
  var state = Object.assign(initial, saved);
  state.schemaVersion = SCHEMA_VERSION;
  state.projects = Array.isArray(saved.projects) && saved.projects.length ? saved.projects : initial.projects;
  state.devices = Array.isArray(saved.devices) && saved.devices.length ? saved.devices : initial.devices;
  state.modelTemplates = clone(MODEL_TEMPLATES);
  state.deviceStates = Object.assign({}, initial.deviceStates, saved.deviceStates || {});
  Object.keys(state.deviceStates).forEach(function (deviceId) {
    var deviceState = state.deviceStates[deviceId] || {};
    deviceState.progressLogs = Array.isArray(deviceState.progressLogs) ? deviceState.progressLogs : [];
    deviceState.dispatchAlerts = Array.isArray(deviceState.dispatchAlerts) ? deviceState.dispatchAlerts : [];
    deviceState.arrivalLedger = normalizeArrivalLedger(deviceState.arrivalLedger);
    state.deviceStates[deviceId] = refreshDeviceProgress(deviceState);
  });
  if (!findById(state.projects, state.currentProjectId)) state.currentProjectId = state.projects[0].id;
  var projectDevices = getDevicesByProject(state, state.currentProjectId);
  if (!findById(projectDevices, state.currentDeviceId)) state.currentDeviceId = projectDevices.length ? projectDevices[0].id : '';
  return state;
}
function getCurrentProject(state) { return findById(state.projects || [], state.currentProjectId) || (state.projects || [])[0] || {}; }
function getCurrentDevice(state) { return findById(state.devices || [], state.currentDeviceId) || {}; }
function getModelTemplate(state, templateId) { return findById(state.modelTemplates || [], templateId) || {}; }
function getCurrentDeviceState(state) {
  var device = getCurrentDevice(state);
  if (!device.id) return createDeviceState(1, 92);
  if (!state.deviceStates[device.id]) state.deviceStates[device.id] = createDeviceState(1, 92);
  return state.deviceStates[device.id];
}
function switchProject(state, projectId) {
  if (!findById(state.projects, projectId)) return false;
  state.currentProjectId = projectId;
  var devices = getDevicesByProject(state, projectId);
  state.currentDeviceId = devices.length ? devices[0].id : '';
  state.updatedAt = Date.now();
  return true;
}
function switchDevice(state, deviceId) {
  var device = findById(state.devices, deviceId);
  if (!device || device.projectId !== state.currentProjectId) return false;
  state.currentDeviceId = deviceId; state.updatedAt = Date.now(); return true;
}
function setActualStage(state, stageIndex, actor, note) {
  var deviceState = getCurrentDeviceState(state);
  var previousIndex = deviceState.actualStageIndex || 1;
  var safeStage = Math.max(1, Math.min(13, Number(stageIndex) || 1));
  var logs = Array.isArray(deviceState.progressLogs) ? deviceState.progressLogs.slice() : [];
  var alerts = Array.isArray(deviceState.dispatchAlerts) ? deviceState.dispatchAlerts.slice() : [];
  var arrivalLedger = normalizeArrivalLedger(deviceState.arrivalLedger);
  var stageMetrics = normalizeStageMetrics(deviceState.stageMetrics, previousIndex);
  var qualityScore = deviceState.qualityScore;
  Object.assign(deviceState, createDeviceState(safeStage, qualityScore));
  deviceState.stageMetrics = stageMetrics;
  deviceState.progressLogs = logs;
  deviceState.dispatchAlerts = alerts;
  deviceState.arrivalLedger = arrivalLedger;
  if (previousIndex !== safeStage) {
    deviceState.progressLogs.unshift({
      id: 'PLOG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      deviceId: state.currentDeviceId,
      previousStageIndex: previousIndex,
      stageIndex: safeStage,
      stageName: STAGES[safeStage - 1].name,
      actorId: actor && actor.id || 'offline-user',
      actorName: actor && actor.name || '现场用户',
      note: note || '更新现场施工阶段',
      createdAt: new Date().toLocaleString('zh-CN')
    });
    deviceState.progressLogs = deviceState.progressLogs.slice(0, 100);
  }
  refreshDeviceProgress(deviceState);
  state.updatedAt = Date.now();
  return deviceState;
}
function upsertDispatchAlert(deviceState, candidate, activeKeys) {
  var alerts = Array.isArray(deviceState.dispatchAlerts) ? deviceState.dispatchAlerts : [];
  var existing = null;
  for (var i = 0; i < alerts.length; i++) if (alerts[i].key === candidate.key) { existing = alerts[i]; break; }
  activeKeys[candidate.key] = true;
  if (existing) {
    if (existing.status === 'handled') return existing;
    var wasActive = existing.status === 'active';
    var changed = !wasActive || ['level', 'levelName', 'title', 'message', 'threshold', 'calculatedValue', 'plannedDate', 'estimatedDate'].some(function (key) {
      return String(existing[key] == null ? '' : existing[key]) !== String(candidate[key] == null ? '' : candidate[key]);
    });
    Object.assign(existing, candidate, { status: 'active' });
    if (changed) {
      existing.updatedAt = Date.now();
      existing.occurrenceCount = Number(existing.occurrenceCount || 1) + (wasActive ? 1 : 0);
    }
    delete existing.resolvedAt;
    return existing;
  }
  candidate.id = 'ALERT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  candidate.status = 'active';
  candidate.createdAt = Date.now();
  candidate.updatedAt = Date.now();
  candidate.occurrenceCount = 1;
  alerts.unshift(candidate);
  deviceState.dispatchAlerts = alerts;
  return candidate;
}
function evaluateDispatchAlerts(deviceState, now) {
  now = now || new Date();
  deviceState.stageMetrics = normalizeStageMetrics(deviceState.stageMetrics, deviceState.actualStageIndex || 1);
  deviceState.dispatchAlerts = Array.isArray(deviceState.dispatchAlerts) ? deviceState.dispatchAlerts : [];
  var activeKeys = {};
  STAGE_DEPENDENCIES.forEach(function (dependency) {
    if (Number(dependency.sourceIndex) !== Number(deviceState.actualStageIndex || 1)) return;
    var source = STAGES[dependency.sourceIndex - 1];
    var target = STAGES[dependency.targetIndex - 1];
    var sourceMetric = deviceState.stageMetrics[source.id];
    var targetMetric = deviceState.stageMetrics[target.id];
    var projection = getProgressProjection(sourceMetric, now);
    var sourceProgress = projection.effectiveProgress;
    var targetManifestPlan = targetMetric.summaryOverrideEnabled ? Number(targetMetric.summaryDemandQuantity || 0) : Number(targetMetric.manifestPlannedPackages || 0);
    var targetManifestArrived = targetMetric.summaryOverrideEnabled ? Number(targetMetric.summaryArrivalQuantity || 0) : Number(targetMetric.manifestArrivedPackages || 0);
    var targetSupplyProgress = targetManifestPlan > 0
      ? progressOf(targetManifestArrived, targetManifestPlan)
      : progressOf(targetMetric.shippedQuantity, targetMetric.plannedQuantity);
    if (sourceProgress >= projection.prepareThreshold && sourceProgress < projection.dispatchThreshold && targetSupplyProgress < 100) {
      upsertDispatchAlert(deviceState, {
        key: 'ratio-prepare:' + source.id + ':' + target.id,
        type: 'ratio', level: 'yellow', levelName: '关注', sourceIndex: source.index, targetIndex: target.index,
        title: '提前准备' + target.shortName + '发货',
        message: source.shortName + (projection.mode === 'forecast' ? '预测' : '实际') + '进度' + sourceProgress + '%，已达到' + projection.prepareThreshold + '%提前预警值；' + target.shortName + (targetManifestPlan > 0 ? '到货覆盖率' : '发货完成率') + targetSupplyProgress + '%。',
        threshold: projection.prepareThreshold, calculatedValue: sourceProgress
      }, activeKeys);
    }
    if (sourceProgress >= projection.dispatchThreshold && targetSupplyProgress < 100) {
      upsertDispatchAlert(deviceState, {
        key: 'ratio-dispatch:' + source.id + ':' + target.id,
        type: 'ratio', level: 'orange', levelName: '预警', sourceIndex: source.index, targetIndex: target.index,
        title: '请安排' + target.shortName + '发货',
        message: source.shortName + (projection.mode === 'forecast' ? '预测' : '实际') + '进度' + sourceProgress + '%，已达到' + projection.dispatchThreshold + '%发货预警值；' + target.shortName + (targetManifestPlan > 0 ? '到货覆盖率' : '发货完成率') + targetSupplyProgress + '%。',
        threshold: projection.dispatchThreshold, calculatedValue: sourceProgress
      }, activeKeys);
    }
  });
  deviceState.dispatchAlerts.forEach(function (alert) {
    if (alert.status === 'active' && !activeKeys[alert.key]) {
      alert.status = 'resolved';
      alert.resolvedAt = Date.now();
      alert.updatedAt = Date.now();
    }
  });
  deviceState.dispatchAlerts = deviceState.dispatchAlerts.slice(0, 120);
  return deviceState.dispatchAlerts.filter(function (alert) { return alert.status === 'active'; }).sort(function (a, b) { return alertRank(b.level) - alertRank(a.level) || b.updatedAt - a.updatedAt; });
}
function getStageProgressDetail(state, stageIndex) {
  var deviceState = getCurrentDeviceState(state);
  refreshDeviceProgress(deviceState);
  var safeStage = Math.max(1, Math.min(STAGES.length, Number(stageIndex) || deviceState.actualStageIndex || 1));
  var stage = STAGES[safeStage - 1];
  var metric = deviceState.stageMetrics[stage.id];
  var installedProgress = progressOf(metric.installedQuantity, metric.plannedQuantity);
  var arrivedProgress = progressOf(metric.arrivedQuantity, metric.plannedQuantity);
  var shippedProgress = progressOf(metric.shippedQuantity, metric.plannedQuantity);
  var analytics = getDailyAnalytics(metric, new Date());
  analytics.projection = getProgressProjection(metric, new Date());
  var allActiveAlerts = evaluateDispatchAlerts(deviceState, new Date());
  var alerts = allActiveAlerts.filter(function (alert) { return alert.sourceIndex === safeStage || alert.targetIndex === safeStage; });
  var dependencies = getDependenciesForStage(safeStage).map(function (dependency) {
    var targetStage = STAGES[dependency.targetIndex - 1];
    return { sourceIndex: dependency.sourceIndex, targetIndex: dependency.targetIndex, threshold: dependency.threshold, targetStage: clone(targetStage) };
  });
  var topAlert = alerts[0] || {
    level: 'normal', levelName: '正常', title: '发货条件正常',
    message: dependencies.length ? '尚未触发后续部件发货条件，库存和运输时间处于正常范围。' : '当前部件暂无未处理的物流或工期预警。'
  };
  return {
    stage: clone(stage), metric: clone(metric), lifecycle: getLifecycle(metric), analytics: analytics,
    status: installedProgress >= 100 ? 'completed' : installedProgress > 0 ? 'working' : 'pending',
    statusName: installedProgress >= 100 ? '已完成' : installedProgress > 0 ? '安装中' : '待施工',
    shippedProgress: shippedProgress, arrivedProgress: arrivedProgress, installedProgress: installedProgress,
    remainingQuantity: analytics.remainingQuantity,
    dispatchAlert: topAlert, alerts: clone(alerts), allActiveAlerts: clone(allActiveAlerts), dependencies: dependencies,
    alertSummary: {
      yellow: allActiveAlerts.filter(function (item) { return item.level === 'yellow'; }).length,
      orange: allActiveAlerts.filter(function (item) { return item.level === 'orange'; }).length,
      red: allActiveAlerts.filter(function (item) { return item.level === 'red'; }).length
    },
    logs: (deviceState.progressLogs || []).filter(function (item) { return Number(item.stageIndex) === safeStage; }).slice(0, 12),
    dailyEntries: clone((metric.dailyEntries || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 14))
  };
}
function updateStageProgress(state, stageIndex, payload, actor) {
  payload = payload || {};
  var deviceState = getCurrentDeviceState(state);
  var safeStage = Math.max(1, Math.min(STAGES.length, Number(stageIndex) || deviceState.actualStageIndex || 1));
  var stage = STAGES[safeStage - 1];
  deviceState.stageMetrics = normalizeStageMetrics(deviceState.stageMetrics, deviceState.actualStageIndex || 1);
  var metric = deviceState.stageMetrics[stage.id];
  ['plannedQuantity', 'plannedLoads', 'productionQuantity', 'shippedQuantity', 'arrivedQuantity', 'installedQuantity', 'shippedLoads', 'arrivedLoads', 'dispatchThreshold', 'transportLeadDays', 'safetyBufferDays'].forEach(function (key) {
    if (payload[key] !== undefined && payload[key] !== '') metric[key] = Number(payload[key]);
  });
  ['plannedInstallDate', 'estimatedArrivalDate'].forEach(function (key) {
    if (payload[key] !== undefined) metric[key] = payload[key] || '';
  });
  if (payload.progressMode !== undefined) metric.progressMode = payload.progressMode === 'forecast' ? 'forecast' : 'actual';
  ['forecastDailyPercent', 'forecastBasePercent', 'warningPreparePercent', 'warningDispatchPercent'].forEach(function (key) {
    if (payload[key] !== undefined && payload[key] !== '') metric[key] = Number(payload[key]);
  });
  if (payload.forecastBaseDate !== undefined) metric.forecastBaseDate = payload.forecastBaseDate || dateKey(new Date());
  if (payload.summaryOverrideEnabled !== undefined) metric.summaryOverrideEnabled = payload.summaryOverrideEnabled === true;
  ['summaryDemandQuantity', 'summaryArrivalQuantity'].forEach(function (key) {
    if (payload[key] !== undefined && payload[key] !== '') metric[key] = Number(payload[key]);
  });
  if (payload.summaryUnit !== undefined) metric.summaryUnit = normalizeText(payload.summaryUnit) || '箱';
  if (payload.actualProgressPercent !== undefined && payload.actualProgressPercent !== '') {
    var actualPercent = clamp(payload.actualProgressPercent, 0, 100);
    metric.installedQuantity = quantityAt(metric.plannedQuantity, actualPercent / 100);
    metric.arrivedQuantity = Math.max(Number(metric.arrivedQuantity || 0), metric.installedQuantity);
    metric.forecastBasePercent = actualPercent;
    metric.forecastBaseDate = dateKey(new Date());
  }
  metric.plannedQuantity = Math.max(0, metric.plannedQuantity || stage.plannedQuantity);
  metric.plannedLoads = Math.max(0, metric.plannedLoads || stage.plannedLoads);
  metric.installedQuantity = clamp(metric.installedQuantity, 0, metric.plannedQuantity);
  metric.arrivedQuantity = clamp(Math.max(metric.arrivedQuantity || 0, metric.installedQuantity), 0, metric.plannedQuantity);
  metric.shippedQuantity = clamp(Math.max(metric.shippedQuantity || 0, metric.arrivedQuantity), 0, metric.plannedQuantity);
  metric.productionQuantity = clamp(Math.max(metric.productionQuantity || 0, metric.shippedQuantity), 0, metric.plannedQuantity);
  metric.shippedLoads = clamp(metric.shippedLoads, 0, metric.plannedLoads);
  metric.arrivedLoads = clamp(metric.arrivedLoads, 0, metric.plannedLoads);
  metric.dispatchThreshold = clamp(metric.dispatchThreshold || stage.dispatchThreshold || 65, 30, 95);
  metric.transportLeadDays = clamp(metric.transportLeadDays, 0, 180);
  metric.safetyBufferDays = clamp(metric.safetyBufferDays, 0, 60);
  metric.progressMode = metric.progressMode === 'forecast' ? 'forecast' : 'actual';
  metric.forecastDailyPercent = clamp(metric.forecastDailyPercent === undefined ? 5 : metric.forecastDailyPercent, 0.1, 30);
  metric.warningPreparePercent = clamp(metric.warningPreparePercent === undefined ? 75 : metric.warningPreparePercent, 50, 95);
  metric.warningDispatchPercent = clamp(metric.warningDispatchPercent === undefined ? 80 : metric.warningDispatchPercent, metric.warningPreparePercent, 100);
  metric.forecastBasePercent = clamp(metric.forecastBasePercent === undefined ? progressOf(metric.installedQuantity, metric.plannedQuantity) : metric.forecastBasePercent, 0, 100);
  metric.forecastBaseDate = metric.forecastBaseDate || dateKey(new Date());
  metric.summaryDemandQuantity = Math.max(0, Number(metric.summaryDemandQuantity) || 0);
  metric.summaryArrivalQuantity = clamp(metric.summaryArrivalQuantity, 0, metric.summaryDemandQuantity || Number.MAX_SAFE_INTEGER);
  metric.summaryUnit = normalizeText(metric.summaryUnit) || '箱';
  metric.updatedAt = Date.now();
  if (safeStage > deviceState.actualStageIndex && metric.installedQuantity > 0) deviceState.actualStageIndex = safeStage;
  deviceState.progressLogs = Array.isArray(deviceState.progressLogs) ? deviceState.progressLogs : [];
  deviceState.progressLogs.unshift({
    id: 'PLOG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5), deviceId: state.currentDeviceId,
    stageIndex: safeStage, stageName: stage.name, actorId: actor && actor.id || 'offline-user',
    actorName: actor && actor.name || '现场用户', note: payload.note || '修正计划、物流或累计进度', createdAt: new Date().toLocaleString('zh-CN')
  });
  deviceState.progressLogs = deviceState.progressLogs.slice(0, 100);
  refreshDeviceProgress(deviceState);
  evaluateDispatchAlerts(deviceState, new Date());
  state.updatedAt = Date.now();
  return getStageProgressDetail(state, safeStage);
}
function recordDailyStageProgress(state, stageIndex, payload, actor) {
  payload = payload || {};
  var deviceState = getCurrentDeviceState(state);
  var safeStage = Math.max(1, Math.min(STAGES.length, Number(stageIndex) || deviceState.actualStageIndex || 1));
  var stage = STAGES[safeStage - 1];
  deviceState.stageMetrics = normalizeStageMetrics(deviceState.stageMetrics, deviceState.actualStageIndex || 1);
  var metric = deviceState.stageMetrics[stage.id];
  var day = dateKey(payload.date);
  var arrivedAdded = Math.max(0, Number(payload.arrivedAdded) || 0);
  var installedAdded = Math.max(0, Number(payload.installedAdded) || 0);
  var entries = Array.isArray(metric.dailyEntries) ? metric.dailyEntries : [];
  var existing = null;
  for (var i = 0; i < entries.length; i++) if (entries[i].date === day) { existing = entries[i]; break; }
  var previousArrived = existing ? Number(existing.arrivedAdded) || 0 : 0;
  var previousInstalled = existing ? Number(existing.installedAdded) || 0 : 0;
  var nextArrived = round1(Number(metric.arrivedQuantity || 0) - previousArrived + arrivedAdded);
  var nextInstalled = round1(Number(metric.installedQuantity || 0) - previousInstalled + installedAdded);
  if (nextArrived > Number(metric.plannedQuantity || 0)) throw new Error('累计到货量不能超过计划总量');
  if (nextInstalled > nextArrived) throw new Error('累计安装量不能超过累计到货量');
  var entry = existing || { id: 'DAY-' + day + '-' + stage.code, date: day, createdAt: Date.now() };
  Object.assign(entry, {
    arrivedAdded: arrivedAdded, installedAdded: installedAdded, note: payload.note || '',
    actorId: actor && actor.id || 'offline-user', actorName: actor && actor.name || '现场用户', updatedAt: Date.now()
  });
  if (!existing) entries.unshift(entry);
  metric.dailyEntries = entries.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 180);
  metric.arrivedQuantity = nextArrived;
  metric.installedQuantity = nextInstalled;
  metric.forecastBasePercent = progressOf(nextInstalled, metric.plannedQuantity);
  metric.forecastBaseDate = day;
  metric.shippedQuantity = Math.max(Number(metric.shippedQuantity || 0), nextArrived);
  metric.productionQuantity = Math.max(Number(metric.productionQuantity || 0), metric.shippedQuantity);
  metric.updatedAt = Date.now();
  if (safeStage > deviceState.actualStageIndex && installedAdded > 0) deviceState.actualStageIndex = safeStage;
  deviceState.progressLogs = Array.isArray(deviceState.progressLogs) ? deviceState.progressLogs : [];
  deviceState.progressLogs.unshift({
    id: 'PLOG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5), deviceId: state.currentDeviceId,
    stageIndex: safeStage, stageName: stage.name, actorId: entry.actorId, actorName: entry.actorName,
    note: day + ' 到货+' + arrivedAdded + metric.unit + '，安装+' + installedAdded + metric.unit + (payload.note ? '；' + payload.note : ''), createdAt: new Date().toLocaleString('zh-CN')
  });
  deviceState.progressLogs = deviceState.progressLogs.slice(0, 100);
  refreshDeviceProgress(deviceState);
  evaluateDispatchAlerts(deviceState, parseDate(day) || new Date());
  state.updatedAt = Date.now();
  return getStageProgressDetail(state, safeStage);
}
function acknowledgeDispatchAlert(state, alertId, actor, note) {
  var deviceState = getCurrentDeviceState(state);
  var alerts = Array.isArray(deviceState.dispatchAlerts) ? deviceState.dispatchAlerts : [];
  var alert = null;
  for (var i = 0; i < alerts.length; i++) if (alerts[i].id === alertId) { alert = alerts[i]; break; }
  if (!alert) return false;
  alert.status = 'handled';
  alert.handledAt = Date.now();
  alert.handledBy = actor && actor.name || '现场用户';
  alert.handleNote = note || '已安排处理';
  alert.updatedAt = Date.now();
  state.updatedAt = Date.now();
  return true;
}
function normalizeText(value) { return String(value == null ? '' : value).trim(); }
function createId(prefix) {
  return (prefix || 'ID') + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}
function upsertProject(state, payload) {
  payload = payload || {};
  var id = payload.id || createId('project');
  var existing = findById(state.projects, id);
  var project = Object.assign({
    id: id, code: normalizeText(payload.code) || ('PRJ-' + Date.now()),
    name: normalizeText(payload.name) || '未命名项目',
    shortName: normalizeText(payload.shortName) || normalizeText(payload.name) || '项目',
    unit: normalizeText(payload.unit), location: normalizeText(payload.location),
    manager: normalizeText(payload.manager), drawingNo: normalizeText(payload.drawingNo),
    status: payload.status || 'construction',
    statusName: payload.status === 'completed' ? '已完工' : payload.status === 'archived' ? '已归档' : '施工中',
    modelTemplateId: payload.modelTemplateId || 'g793-esp-four-chamber',
    createdAt: new Date().toLocaleString('zh-CN')
  }, existing || {}, payload, { id: id, updatedAt: Date.now() });
  project.statusName = project.status === 'completed' ? '已完工' : project.status === 'archived' ? '已归档' : '施工中';
  if (existing) Object.assign(existing, project); else state.projects.push(project);
  state.updatedAt = Date.now();
  return project;
}
function removeProject(state, projectId) {
  var devices = getDevicesByProject(state, projectId);
  if (devices.length) return { success: false, message: '项目下仍有设备，请先归档项目或移除设备' };
  state.projects = (state.projects || []).filter(function (item) { return item.id !== projectId; });
  if (state.currentProjectId === projectId && state.projects.length) switchProject(state, state.projects[0].id);
  state.updatedAt = Date.now();
  return { success: true };
}
function upsertDevice(state, payload) {
  payload = payload || {};
  var projectId = payload.projectId || state.currentProjectId;
  if (!findById(state.projects, projectId)) throw new Error('项目不存在');
  var id = payload.id || createId('device');
  var existing = findById(state.devices, id);
  var ordinal = Number(payload.ordinal) || getDevicesByProject(state, projectId).length + 1;
  var device = Object.assign({
    id: id, projectId: projectId, code: normalizeText(payload.code) || ('ESP-' + String(ordinal).padStart(2, '0')),
    name: normalizeText(payload.name) || ('#' + ordinal + '机组电除尘器'),
    unitNo: normalizeText(payload.unitNo) || ('#' + ordinal + '机组'),
    ordinal: ordinal, status: payload.status || 'construction',
    modelTemplateId: payload.modelTemplateId || 'g793-esp-four-chamber',
    createdAt: new Date().toLocaleString('zh-CN')
  }, existing || {}, payload, { id: id, projectId: projectId, updatedAt: Date.now() });
  if (existing) Object.assign(existing, device); else state.devices.push(device);
  if (!state.deviceStates[id]) state.deviceStates[id] = createDeviceState(Number(payload.stageIndex) || 1, Number(payload.qualityScore) || 92);
  state.updatedAt = Date.now();
  return device;
}
function removeDevice(state, deviceId) {
  var device = findById(state.devices, deviceId);
  if (!device) return false;
  state.devices = state.devices.filter(function (item) { return item.id !== deviceId; });
  delete state.deviceStates[deviceId];
  if (state.currentDeviceId === deviceId) {
    var devices = getDevicesByProject(state, state.currentProjectId);
    state.currentDeviceId = devices.length ? devices[0].id : '';
  }
  state.updatedAt = Date.now();
  return true;
}
function getContext(state) {
  var project = getCurrentProject(state);
  var device = getCurrentDevice(state);
  var deviceState = getCurrentDeviceState(state);
  var stage = STAGES[deviceState.actualStageIndex - 1] || STAGES[0];
  return { project: project, device: device, deviceState: deviceState, stage: stage, template: getModelTemplate(state, device.modelTemplateId || project.modelTemplateId) };
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY, SCHEMA_VERSION: SCHEMA_VERSION, STAGES: STAGES,
  STAGE_DEPENDENCIES: STAGE_DEPENDENCIES,
  MODEL_TEMPLATES: MODEL_TEMPLATES, PROJECTS: PROJECTS, DEVICES: DEVICES,
  clone: clone, createInitialState: createInitialState, normalizeState: normalizeState,
  getDevicesByProject: getDevicesByProject, getCurrentProject: getCurrentProject,
  getCurrentDevice: getCurrentDevice, getCurrentDeviceState: getCurrentDeviceState,
  getModelTemplate: getModelTemplate, getContext: getContext,
  switchProject: switchProject, switchDevice: switchDevice, setActualStage: setActualStage,
  getStageProgressDetail: getStageProgressDetail, updateStageProgress: updateStageProgress,
  getProgressProjection: getProgressProjection,
  recordDailyStageProgress: recordDailyStageProgress,
  getArrivalLedgerDetail: getArrivalLedgerDetail,
  applyArrivalDemandManifest: applyArrivalDemandManifest,
  applyArrivalReceiptManifest: applyArrivalReceiptManifest,
  acknowledgeDispatchAlert: acknowledgeDispatchAlert,
  evaluateDispatchAlerts: evaluateDispatchAlerts,
  upsertProject: upsertProject, removeProject: removeProject,
  upsertDevice: upsertDevice, removeDevice: removeDevice
};
