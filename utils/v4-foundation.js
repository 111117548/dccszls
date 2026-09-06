// V4.1 common project/device/construction-stage foundation.
// The real GLB/WebGL model is intentionally outside this module.

var STORAGE_KEY = 'esp_v4_foundation';
var SCHEMA_VERSION = '8.0-stage-catalog';
var stageCatalog = require('./stage-catalog');

var STAGES = stageCatalog.STAGES;

// Upstream installation progress drives downstream dispatch preparation.
// A source component may trigger more than one downstream component.
var STAGE_DEPENDENCIES = stageCatalog.DEPENDENCIES;

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
    var manifestArrival = Number(metric.manifestPlannedPackages || 0) > 0;
    var status = progress >= 100 ? 'completed' : (progress > 0 || stage.index === actualStageIndex) ? 'working' : 'pending';
    return Object.assign({}, stage, {
      status: status,
      statusName: status === 'completed' ? '已完成' : status === 'working' ? '当前阶段' : '待施工',
      progress: progress,
      installedProgress: progress,
      arrivedProgress: manifestArrival
        ? progressOf(metric.manifestArrivedPackages, metric.manifestPlannedPackages)
        : progressOf(metric.arrivedQuantity, metric.plannedQuantity),
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
function arrivalSplitBoxRoot(value) {
  var key = arrivalBoxKey(value);
  // Actual shipping may split one planned box into A/B loads (B410A,
  // B410B or B494(A)). Exact demand ids always win; this root is fallback.
  return key.replace(/\(([A-Z])\)$/i, '').replace(/(\d)[A-Z]$/i, '$1');
}
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
      pkg.arrivalSource = old.arrivalSource || (old.arrivalFileName === '手工填报' ? 'manual' : 'manifest');
      pkg.arrivalReceiptBoxNos = clone(old.arrivalReceiptBoxNos || []);
      pkg.arrivalReceiptName = old.arrivalReceiptName || '';
      pkg.arrivalReceiptDrawingNo = old.arrivalReceiptDrawingNo || '';
      pkg.arrivalSheetName = old.arrivalSheetName || '';
      pkg.arrivalVehicleNumber = Number(old.arrivalVehicleNumber || 0);
      pkg.arrivalMatchMethod = old.arrivalMatchMethod || '';
      pkg.arrivalImportId = old.arrivalImportId || '';
    }
    if (old && old.arrivalManualExcludedAt) {
      pkg.arrivalManualExcludedAt = old.arrivalManualExcludedAt;
      pkg.arrivalManualExcludedBy = old.arrivalManualExcludedBy || '';
      pkg.arrivalReceiptBoxNos = clone(old.arrivalReceiptBoxNos || []);
      pkg.arrivalReceiptName = old.arrivalReceiptName || '';
      pkg.arrivalReceiptDrawingNo = old.arrivalReceiptDrawingNo || '';
      pkg.arrivalSheetName = old.arrivalSheetName || '';
      pkg.arrivalVehicleNumber = Number(old.arrivalVehicleNumber || 0);
      pkg.arrivalMatchMethod = old.arrivalMatchMethod || '';
      pkg.arrivalImportId = old.arrivalImportId || '';
      pkg.arrivalFileName = old.arrivalFileName || '';
      pkg.arrivalSource = old.arrivalSource || 'manifest';
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
  var importId = createId('ARRIVAL');
  var matched = 0;
  var matchedDemand = {};
  var added = 0;
  var duplicates = 0;
  var aliasMatched = 0;
  var consolidated = 0;
  var verifiedManual = 0;
  var manualExcluded = 0;
  var unmatched = [];
  var seen = {};
  var stageMap = {};
  function stageStat(target) {
    var stageIndex = Math.max(0, Math.min(13, Number(target && target.stageIndex) || 0));
    var stage = stageIndex > 0 ? STAGES[stageIndex - 1] : null;
    if (!stageMap[stageIndex]) {
      stageMap[stageIndex] = {
        stageIndex: stageIndex,
        stageName: stage ? (stage.shortName || stage.name) : '待归类',
        receiptPackages: 0,
        matchedPackages: 0,
        addedPackages: 0,
        duplicatePackages: 0,
        consolidatedPackages: 0,
        manualExcludedPackages: 0
      };
    }
    return stageMap[stageIndex];
  }
  receiptPackages.forEach(function (item) {
    var key = arrivalBoxKey(item.boxNo);
    if (!key || seen[key]) return;
    seen[key] = true;
    var target = demandMap[key];
    var matchMethod = 'box_exact';
    if (!target) {
      var rootKey = arrivalSplitBoxRoot(key);
      if (rootKey !== key && demandMap[rootKey]) {
        target = demandMap[rootKey];
        matchMethod = 'split_box';
        aliasMatched += 1;
      }
    }
    if (!target) {
      unmatched.push({
        boxNo: normalizeText(item.boxNo), name: normalizeText(item.name), drawingNo: normalizeText(item.drawingNo),
        stageIndex: Number(item.stageIndex || 0), stageName: normalizeText(item.stageName),
        sourceSheetName: normalizeText(item.sourceSheetName), vehicleNumber: Number(item.vehicleNumber || 0),
        fileName: normalizeText(payload.fileName), importedAt: now
      });
      return;
    }
    matched += 1;
    var targetKey = arrivalBoxKey(target.boxNo);
    var stat = stageStat(target);
    stat.receiptPackages += 1;
    if (!matchedDemand[targetKey]) stat.matchedPackages += 1;
    matchedDemand[targetKey] = true;
    target.arrivalReceiptBoxNos = Array.isArray(target.arrivalReceiptBoxNos) ? target.arrivalReceiptBoxNos : [];
    if (target.arrivalReceiptBoxNos.indexOf(normalizeText(item.boxNo)) < 0) target.arrivalReceiptBoxNos.push(normalizeText(item.boxNo));
    target.arrivalReceiptName = normalizeText(item.name);
    target.arrivalReceiptDrawingNo = normalizeText(item.drawingNo);
    target.arrivalSheetName = normalizeText(item.sourceSheetName || payload.sheetName);
    target.arrivalVehicleNumber = Number(item.vehicleNumber || 0);
    target.arrivalMatchMethod = matchMethod;
    if (target.arrivalManualExcludedAt) {
      manualExcluded += 1;
      stat.manualExcludedPackages += 1;
      target.arrivalFileName = normalizeText(payload.fileName) || '到货清单';
      target.arrivalSource = 'manifest';
      target.arrivalImportId = importId;
      return;
    }
    if (target.arrivedAt) {
      if (target.arrivalSource === 'manual') verifiedManual += 1;
      else if (target.arrivalImportId === importId) {
        consolidated += 1;
        stat.consolidatedPackages += 1;
      } else {
        duplicates += 1;
        stat.duplicatePackages += 1;
      }
      target.arrivalSource = 'manifest';
      target.arrivalFileName = normalizeText(payload.fileName) || '到货清单';
      target.arrivalImportId = importId;
    } else {
      // Manual reporting records a stage total rather than a known box number.
      // When a later manifest identifies a different box in the same stage,
      // transfer one manual marker so the cumulative total is not doubled.
      var manualProxy = ledger.packages.find(function (pkg) {
        return pkg !== target && Number(pkg.stageIndex) === Number(target.stageIndex) && pkg.arrivedAt && pkg.arrivalSource === 'manual';
      });
      if (manualProxy) {
        delete manualProxy.arrivedAt;
        delete manualProxy.arrivalSource;
        delete manualProxy.arrivalFileName;
        verifiedManual += 1;
      } else {
        added += 1;
        stat.addedPackages += 1;
      }
      target.arrivedAt = now;
      target.arrivalFileName = normalizeText(payload.fileName) || '到货清单';
      target.arrivalSource = 'manifest';
      target.arrivalImportId = importId;
    }
  });
  ledger.unmatchedReceipts = unmatched.concat(ledger.unmatchedReceipts || []).slice(0, 200);
  var stageBreakdown = Object.keys(stageMap).map(function (key) { return stageMap[key]; }).sort(function (a, b) {
    return Number(a.stageIndex) - Number(b.stageIndex);
  });
  ledger.receiptImports.unshift({
    id: importId, fileID: normalizeText(payload.fileID), fileName: normalizeText(payload.fileName) || '到货清单',
    sheetName: normalizeText(payload.sheetName), vehicleCount: Number(payload.vehicleCount || 0),
    firstVehicleNumber: Number(payload.firstVehicleNumber || 0), lastVehicleNumber: Number(payload.lastVehicleNumber || 0),
    packageCount: receiptPackages.length, matchedPackages: matched, matchedDemandPackages: Object.keys(matchedDemand).length,
    aliasMatchedPackages: aliasMatched, consolidatedPackages: consolidated, addedPackages: added,
    duplicatePackages: duplicates, verifiedManualPackages: verifiedManual, manualExcludedPackages: manualExcluded,
    unmatchedPackages: unmatched.length, stageBreakdown: stageBreakdown,
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
function applyStageArrivalQuantity(state, stageIndex, quantity, actor) {
  var deviceState = getCurrentDeviceState(state);
  var ledger = normalizeArrivalLedger(deviceState.arrivalLedger);
  if (!ledger.demand || !ledger.packages.length) throw new Error('请先在设备到货台账导入需求总清单');
  var targetStage = Math.max(1, Math.min(13, Number(stageIndex) || 1));
  var stagePackages = ledger.packages.filter(function (item) { return Number(item.stageIndex) === targetStage; });
  if (!stagePackages.length) throw new Error('需求总清单中没有识别到该部件的箱件');
  var requested = Number(quantity);
  if (!isFinite(requested) || requested < 0 || requested > stagePackages.length || Math.floor(requested) !== requested) {
    throw new Error('到货数量应为 0—' + stagePackages.length + ' 的整数箱');
  }
  var now = Date.now();
  var orderedPackages = stagePackages.slice().sort(function (a, b) {
    var aReceipt = a.arrivalImportId || (a.arrivalReceiptBoxNos && a.arrivalReceiptBoxNos.length) ? 1 : 0;
    var bReceipt = b.arrivalImportId || (b.arrivalReceiptBoxNos && b.arrivalReceiptBoxNos.length) ? 1 : 0;
    if (aReceipt !== bReceipt) return bReceipt - aReceipt;
    return arrivalBoxKey(a.boxNo).localeCompare(arrivalBoxKey(b.boxNo));
  });
  orderedPackages.forEach(function (item, index) {
    var hasReceiptEvidence = !!(item.arrivalImportId || (item.arrivalReceiptBoxNos && item.arrivalReceiptBoxNos.length));
    if (index < requested) {
      item.arrivedAt = item.arrivedAt || now;
      item.arrivalSource = hasReceiptEvidence ? 'manifest' : 'manual';
      item.arrivalFileName = hasReceiptEvidence ? (item.arrivalFileName || '到货清单') : '手工填报';
      delete item.arrivalManualExcludedAt;
      delete item.arrivalManualExcludedBy;
    } else {
      delete item.arrivedAt;
      if (hasReceiptEvidence) {
        item.arrivalManualExcludedAt = now;
        item.arrivalManualExcludedBy = actor && actor.name || '现场用户';
        item.arrivalSource = 'manifest';
      } else {
        delete item.arrivalSource;
        delete item.arrivalFileName;
        delete item.arrivalManualExcludedAt;
        delete item.arrivalManualExcludedBy;
      }
    }
  });
  var stage = STAGES[targetStage - 1];
  deviceState.stageMetrics = normalizeStageMetrics(deviceState.stageMetrics, deviceState.actualStageIndex || 1);
  var metric = deviceState.stageMetrics[stage.id];
  metric.summaryOverrideEnabled = false;
  metric.manualArrivalUpdatedAt = now;
  metric.manualArrivalUpdatedBy = actor && actor.name || '现场用户';
  metric.manualArrivalQuantity = requested;
  ledger.updatedAt = now;
  deviceState.arrivalLedger = ledger;
  syncArrivalMetrics(deviceState);
  refreshDeviceProgress(deviceState);
  evaluateDispatchAlerts(deviceState, new Date());
  state.updatedAt = now;
  return getStageProgressDetail(state, targetStage);
}
function createDeviceState(stageIndex, qualityScore) {
  var safeStage = Math.max(1, Math.min(13, Number(stageIndex) || 1));
  return refreshDeviceProgress({
    stageSchemaVersion: stageCatalog.VERSION,
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
// Migrate once per device, including states later restored from the cloud.
// Keep raw quantities: old foundation beams (榀) and steel (件) cannot be added.
function migrateLegacyDeviceStages(deviceState) {
  if (deviceState.stageSchemaVersion === stageCatalog.VERSION) return deviceState;
  var oldMetrics = clone(deviceState.stageMetrics || {});
  deviceState.legacyStageBackup = deviceState.legacyStageBackup || {
    stageMetrics: oldMetrics,
    actualStageIndex: deviceState.actualStageIndex,
    dispatchAlerts: clone(deviceState.dispatchAlerts || [])
  };
  var mergedIds = {
    'stage-03': ['stage-02', 'stage-03'],
    'stage-07': ['stage-07', 'stage-08'],
    'stage-12': ['stage-10', 'stage-12']
  };
  var metrics = {};
  STAGES.forEach(function (stage) {
    var metric = Object.assign(createStageMetric(stage, 'pending'), oldMetrics[stage.id] || {});
    if (mergedIds[stage.id]) {
      var members = mergedIds[stage.id].map(function (id) { return oldMetrics[id] || {}; });
      metric = createStageMetric(stage, 'pending');
      metric.plannedQuantity = 100;
      metric.unit = '%';
      ['productionQuantity', 'shippedQuantity', 'arrivedQuantity', 'installedQuantity'].forEach(function (key) {
        metric[key] = Math.min.apply(Math, members.map(function (item) { return progressOf(item[key], item.plannedQuantity); }));
      });
      ['plannedLoads', 'shippedLoads', 'arrivedLoads'].forEach(function (key) {
        metric[key] = members.reduce(function (sum, item) { return sum + (Number(item[key]) || 0); }, 0);
      });
      // Manual box summaries can be added only when both source units agree.
      if (members.every(function (item) { return item.summaryOverrideEnabled && item.summaryUnit === members[0].summaryUnit; })) {
        metric.summaryOverrideEnabled = true;
        metric.summaryUnit = members[0].summaryUnit || '箱';
        metric.summaryDemandQuantity = members.reduce(function (sum, item) { return sum + (Number(item.summaryDemandQuantity) || 0); }, 0);
        metric.summaryArrivalQuantity = members.reduce(function (sum, item) { return sum + (Number(item.summaryArrivalQuantity) || 0); }, 0);
      }
      metric.forecastBasePercent = metric.installedQuantity;
      metric.migrationNote = '合并前原始记录已保留；合并进度取子项较低值，可按现场实际重新填报';
      metric.mergedFromStageIds = mergedIds[stage.id].slice();
    }
    metric.stageId = stage.id;
    metrics[stage.id] = metric;
  });
  deviceState.stageMetrics = metrics;
  deviceState.actualStageIndex = stageCatalog.legacyIndex(deviceState.actualStageIndex) || 1;
  var ledger = normalizeArrivalLedger(deviceState.arrivalLedger);
  function migrateReference(item, allowSpecial) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) { item.forEach(function (child) { migrateReference(child, allowSpecial); }); return; }
    if (item.stageIndex !== undefined) {
      item.legacyStageIndex = item.stageIndex;
      item.legacyStageName = item.stageName || '';
      item.stageIndex = (allowSpecial ? stageCatalog.specialIndex(item.name) : 0) || stageCatalog.legacyIndex(item.stageIndex);
      item.stageName = item.stageIndex ? STAGES[item.stageIndex - 1].shortName : '待归类';
    }
    if (item.previousStageIndex !== undefined) item.previousStageIndex = stageCatalog.legacyIndex(item.previousStageIndex);
    if (item.stageId) item.stageId = stageCatalog.canonicalId(item.stageId);
    Object.keys(item).forEach(function (key) {
      if (item[key] && typeof item[key] === 'object') migrateReference(item[key], allowSpecial);
    });
  }
  migrateReference(ledger.packages, true);
  migrateReference(ledger.unmatchedReceipts, true);
  migrateReference(ledger.receiptImports, false);
  migrateReference(deviceState.progressLogs, false);
  deviceState.arrivalLedger = ledger;
  // Old alerts describe the old dependency graph; preserve them in the backup.
  deviceState.dispatchAlerts = [];
  deviceState.stageSchemaVersion = stageCatalog.VERSION;
  syncArrivalMetrics(deviceState);
  return deviceState;
}
function normalizeState(saved) {
  var initial = createInitialState();
  if (!saved) return initial;
  saved = clone(saved);
  var state = Object.assign({}, initial, saved);
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
    migrateLegacyDeviceStages(deviceState);
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
  var arrivedProgress = Number(metric.manifestPlannedPackages || 0) > 0
    ? progressOf(metric.manifestArrivedPackages, metric.manifestPlannedPackages)
    : progressOf(metric.arrivedQuantity, metric.plannedQuantity);
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
    delete metric.migrationNote;
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

// A construction daily report follows the real installation sequence. Any
// unfinished component at or before the current stage remains active work;
// later stages are intentionally excluded until the site advances to them.
function getDailyReportSuggestions(state) {
  var context = getContext(state);
  refreshDeviceProgress(context.deviceState);
  var currentStageIndex = Math.max(1, Math.min(STAGES.length, Number(context.deviceState.actualStageIndex) || 1));
  var linkedStages = (context.deviceState.stageProgress || []).filter(function (item) {
    var progress = Number(item.installedProgress === undefined ? item.progress : item.installedProgress) || 0;
    return Number(item.index) <= currentStageIndex && progress < 100;
  }).map(function (item) {
    var progress = Number(item.installedProgress === undefined ? item.progress : item.installedProgress) || 0;
    return {
      stageIndex: Number(item.index),
      stageName: item.name,
      shortName: item.shortName || item.name,
      installedProgress: round1(progress)
    };
  });
  var items = linkedStages.map(function (item) { return item.stageName; });
  return {
    currentStageIndex: currentStageIndex,
    currentStageName: (STAGES[currentStageIndex - 1] || STAGES[0]).name,
    linkedStages: clone(linkedStages),
    todayItems: items.slice(),
    tomorrowItems: items.slice()
  };
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY, SCHEMA_VERSION: SCHEMA_VERSION, STAGES: STAGES,
  STAGE_DEPENDENCIES: STAGE_DEPENDENCIES,
  MODEL_TEMPLATES: MODEL_TEMPLATES, PROJECTS: PROJECTS, DEVICES: DEVICES,
  clone: clone, createInitialState: createInitialState, normalizeState: normalizeState,
  getDevicesByProject: getDevicesByProject, getCurrentProject: getCurrentProject,
  getCurrentDevice: getCurrentDevice, getCurrentDeviceState: getCurrentDeviceState,
  getModelTemplate: getModelTemplate, getContext: getContext,
  getDailyReportSuggestions: getDailyReportSuggestions,
  switchProject: switchProject, switchDevice: switchDevice, setActualStage: setActualStage,
  getStageProgressDetail: getStageProgressDetail, updateStageProgress: updateStageProgress,
  getProgressProjection: getProgressProjection,
  recordDailyStageProgress: recordDailyStageProgress,
  getArrivalLedgerDetail: getArrivalLedgerDetail,
  applyArrivalDemandManifest: applyArrivalDemandManifest,
  applyArrivalReceiptManifest: applyArrivalReceiptManifest,
  applyStageArrivalQuantity: applyStageArrivalQuantity,
  acknowledgeDispatchAlert: acknowledgeDispatchAlert,
  evaluateDispatchAlerts: evaluateDispatchAlerts,
  upsertProject: upsertProject, removeProject: removeProject,
  upsertDevice: upsertDevice, removeDevice: removeDevice
};
