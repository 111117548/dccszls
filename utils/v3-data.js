// Legacy-compatible quality domain model used by V4.1.
// Equipment hierarchy is aligned to G793.0: four chambers, five fields each.

var stageCatalog = require('./stage-catalog');

var PROJECT = {
  id: 'project-pengyang',
  name: '彭阳项目',
  shortName: '彭阳',
  unit: '电厂机组工程',
  deviceName: '低低温电除尘器',
  stage: '安装施工阶段',
  location: '宁夏彭阳',
  manager: '项目工程部',
  drawingNo: 'G793.0',
  layout: '两列双室 · 四室五电场',
  twinPurpose: '工程建设期安装质量检查',
  updatedAt: '2026-07-14 09:30'
};

var CONSTRUCTION_STAGES = stageCatalog.STAGES.map(function (stage) {
  return Object.assign({}, stage, { status: 'pending', statusName: '待施工', progress: 0, sourceAreas: stage.areaKeys.slice() });
});

var STANDARD_SOURCES = {
  shell: { document: '壳体.pdf', stageId: 'stage-05', scope: '壳体、阻流板、顶梁、承压件及内部走道' },
  ashopper: { document: '灰斗.pdf', stageId: 'stage-04', scope: '灰斗组合、密封焊、加强筋、管撑及附件' },
  anode: { document: '阳极系统.pdf', stageId: 'stage-07', scope: '阳极板、悬挂、振打砧梁、定位耙及异极距' },
  cathode: { document: '阴极框架组合.pdf / 阴极系统.pdf', stageId: 'stage-07', scope: '阴极框架制作、吊杆、桅杆、接地及防摆' },
  rapping: { document: '振打系统.pdf', stageId: 'stage-09', scope: '振打棒、振打器底座、同心度及密封' },
  support: { document: '支座.pdf / 钢支架.pdf', stageId: 'stage-01', scope: '固定/活动支座、钢支架、柱脚、标高与垂直度' },
  horn: { document: '进出口喇叭.pdf', stageId: 'stage-06', scope: '喇叭管撑、分布板、防冲刷角钢及过渡板' },
  hoist: { document: '顶部起吊.pdf', stageId: 'stage-top-hoist', scope: '顶部起吊支座、斜管撑及电动葫芦限位' },
  hvline: { document: '高压进线.pdf', stageId: 'stage-12', scope: '高压导线、母排预紧、绝缘子及设备接地' }
};

var AREA_STAGE_MAP = { support: 'stage-03', shell: 'stage-05', ashopper: 'stage-04', horn: 'stage-06', anode: 'stage-07', cathode: 'stage-07', rapping: 'stage-09', hoist: 'stage-top-hoist', hvline: 'stage-12', platform: 'stage-11', instrument: 'stage-12' };

function qualityNode(id, name, type, score, areaKey, extra) {
  return Object.assign({
    id: id, name: name, type: type, qualityScore: score, healthScore: score,
    areaKey: areaKey || '', stageId: AREA_STAGE_MAP[areaKey] || '', constructionStatus: 'working', constructionStatusName: '施工中'
  }, extra || {});
}

function buildField(chamberCode, number, score) {
  var prefix = chamberCode.toLowerCase() + '-field-' + number;
  return qualityNode(prefix, chamberCode + '室 第' + number + '电场', 'electric-field', score, '', {
    fieldNo: number, chamber: chamberCode + '室',
    children: [
      qualityNode(prefix + '-anode', '阳极系统', 'anode', score - 2, 'anode'),
      qualityNode(prefix + '-cathode', '阴极系统', 'cathode', score, 'cathode', {
        children: [
          qualityNode(prefix + '-cathode-frame', '阴极框架组合', 'cathode-frame', score, 'cathode'),
          qualityNode(prefix + '-cathode-install', '阴极系统安装', 'cathode-install', score, 'cathode')
        ]
      }),
      qualityNode(prefix + '-rapping', '振打系统', 'rapping', score + 1, 'rapping')
    ]
  });
}

function buildHoppers(chamberCode) {
  var result = [];
  for (var i = 1; i <= 5; i++) {
    result.push(qualityNode(chamberCode.toLowerCase() + '-hopper-' + i, chamberCode + '室 ' + i + '号灰斗', 'hopper', i === 1 ? 88 : 94, 'ashopper', { chamber: chamberCode + '室', fieldNo: i }));
  }
  return result;
}

function buildChamber(chamberCode, scores) {
  var prefix = chamberCode.toLowerCase();
  var children = [
    qualityNode(prefix + '-inlet', chamberCode + '室 进口喇叭', 'inlet-horn', 96, 'horn'),
    qualityNode(prefix + '-shell', chamberCode + '室 壳体', 'shell', 93, 'shell')
  ];
  for (var i = 1; i <= 5; i++) children.push(buildField(chamberCode, i, scores[i - 1]));
  children.push(qualityNode(prefix + '-outlet', chamberCode + '室 出口喇叭', 'outlet-horn', 95, 'horn'));
  children.push(qualityNode(prefix + '-ash', chamberCode + '室 灰斗系统', 'ash-system', 92, 'ashopper', { children: buildHoppers(chamberCode) }));
  return qualityNode(prefix + '-chamber', chamberCode + '室', 'chamber', 92, '', { chamber: chamberCode + '室', children: children });
}

var DEVICE_TREE = qualityNode('esp', 'G793低低温电除尘器', 'esp-construction', 92, '', {
  constructionStatus: 'working', constructionStatusName: '安装施工中',
  children: [
    qualityNode('foundation-support', '基础与支承系统', 'construction-package', 98, 'support', {
      constructionStatus: 'accepted', constructionStatusName: '已验收',
      children: [
        qualityNode('support-bearing', '固定/活动支座', 'bearing', 98, 'support', { stageId: 'stage-01', constructionStatus: 'accepted', constructionStatusName: '已验收' }),
        qualityNode('foundation-beam', '基础梁', 'foundation-beam', 98, 'support', { stageId: 'stage-03', constructionStatus: 'accepted', constructionStatusName: '已验收' }),
        qualityNode('steel-support', '钢支架', 'steel-support', 97, 'support', { stageId: 'stage-03', constructionStatus: 'accepted', constructionStatusName: '已验收' })
      ]
    }),
    buildChamber('A1', [82, 96, 91, 94, 89]),
    buildChamber('A2', [95, 94, 93, 92, 91]),
    buildChamber('B1', [94, 93, 94, 92, 90]),
    buildChamber('B2', [96, 95, 94, 93, 92]),
    qualityNode('roof-hv-system', '顶部与高压系统', 'construction-package', 88, '', {
      children: [
        qualityNode('top-hoist', '顶部起吊装置', 'hoist', 91, 'hoist'),
        qualityNode('a1-hvline', 'A1室 高压进线', 'hvline', 87, 'hvline', { chamber: 'A1室' }),
        qualityNode('a2-hvline', 'A2室 高压进线', 'hvline', 90, 'hvline', { chamber: 'A2室' }),
        qualityNode('b1-hvline', 'B1室 高压进线', 'hvline', 90, 'hvline', { chamber: 'B1室' }),
        qualityNode('b2-hvline', 'B2室 高压进线', 'hvline', 92, 'hvline', { chamber: 'B2室' })
      ]
    }),
    qualityNode('maintenance-platform', '平台扶梯系统', 'platform', 92, 'platform'),
    qualityNode('electrical-instrument', '电气仪表系统', 'instrument', 91, 'instrument')
  ]
});

var QUALITY_METRICS = [
  { key: 'coverage', name: '检查覆盖率', score: 94 },
  { key: 'firstPass', name: '一次验收合格率', score: 90 },
  { key: 'closure', name: '整改闭环率', score: 93 },
  { key: 'evidence', name: '质量资料完整率', score: 91 }
];

function buildBaseRegions(chamberCode, scores) {
  var code = chamberCode.toLowerCase();
  var rows = [{ id: code + '-inlet', chamber: chamberCode, name: chamberCode + '室 进口喇叭', shortName: '进口', qualityScore: 96, healthScore: 96, status: 'normal', defectCount: 0, kind: 'horn' }];
  for (var i = 1; i <= 5; i++) {
    rows.push({ id: code + '-field-' + i, chamber: chamberCode, name: chamberCode + '室 第' + i + '电场', shortName: String(i), qualityScore: scores[i - 1], healthScore: scores[i - 1], status: 'normal', defectCount: 0, kind: 'field' });
  }
  rows.push({ id: code + '-outlet', chamber: chamberCode, name: chamberCode + '室 出口喇叭', shortName: '出口', qualityScore: 95, healthScore: 95, status: 'normal', defectCount: 0, kind: 'horn' });
  return rows;
}

var MODEL_REGIONS = []
  .concat(buildBaseRegions('A1', [82, 96, 91, 94, 89]))
  .concat(buildBaseRegions('A2', [95, 94, 93, 92, 91]))
  .concat(buildBaseRegions('B1', [94, 93, 94, 92, 90]))
  .concat(buildBaseRegions('B2', [96, 95, 94, 93, 92]));

var INITIAL_DEFECTS = [
  {
    id: 'DF-20260714-001', projectId: PROJECT.id,
    deviceNodeId: 'a1-field-1-anode', fieldId: 'a1-field-1', systemId: 'a1-field-1-anode', chamber: 'A1室', fieldNo: 1,
    deviceName: 'A1室 第1电场', systemName: '阳极系统', positionCode: 'A1室/第1电场/A列3排',
    name: '阳极板铅垂度偏差', type: 'alignment', severity: 'major', level: 'Ⅱ级', confidence: 0.94,
    status: 'pending', statusName: '待整改', description: '阳极板局部偏斜，铅垂度超出安装控制要求。',
    suggestion: '保持自由铅垂状态，按同通道两排同步调整后复测。', standard: '阳极系统.pdf · 第1/3/4项',
    sourceDocument: '阳极系统.pdf', constructionStageId: 'stage-07', inspectionItemId: 'an1', image: '', imageFileID: '',
    imageBBox: { x: 0.42, y: 0.28, w: 0.16, h: 0.24 }, modelMarker: { regionId: 'a1-field-1', x: 44, y: 36 },
    inspector: '智能检测', createdAt: '2026-07-14 09:18', deadline: '2026-07-16', rectification: null, review: null
  },
  {
    id: 'DF-20260714-002', projectId: PROJECT.id,
    deviceNodeId: 'a1-field-1-cathode', fieldId: 'a1-field-1', systemId: 'a1-field-1-cathode', chamber: 'A1室', fieldNo: 1,
    deviceName: 'A1室 第1电场', systemName: '阴极系统', positionCode: 'A1室/第1电场/B列2排',
    name: '阴极吊杆焊缝高度不足', type: 'weld', severity: 'moderate', level: 'Ⅲ级', confidence: 0.88,
    status: 'rectifying', statusName: '整改中', description: '吊杆与吊梁圆周焊局部高度不足。', suggestion: '补焊至8mm并复核焊缝饱满度。',
    standard: '阴极系统.pdf · 第1项', sourceDocument: '阴极系统.pdf', constructionStageId: 'stage-07', inspectionItemId: 'c1', image: '', imageFileID: '',
    imageBBox: { x: 0.28, y: 0.36, w: 0.18, h: 0.15 }, modelMarker: { regionId: 'a1-field-1', x: 68, y: 56 },
    inspector: '张工', createdAt: '2026-07-14 10:26', deadline: '2026-07-17', rectification: { owner: '安装一班', updatedAt: '2026-07-14 14:10', note: '已安排补焊' }, review: null
  },
  {
    id: 'DF-20260714-003', projectId: PROJECT.id,
    deviceNodeId: 'a1-field-5-rapping', fieldId: 'a1-field-5', systemId: 'a1-field-5-rapping', chamber: 'A1室', fieldNo: 5,
    deviceName: 'A1室 第5电场', systemName: '振打系统', positionCode: 'A1室/第5电场/C列1排',
    name: '振打棒露出长度偏差', type: 'dimension', severity: 'moderate', level: 'Ⅲ级', confidence: 0.91,
    status: 'pending', statusName: '待整改', description: '振打棒露出长度超出60±2mm允许范围。', suggestion: '按图重新调整并复测。',
    standard: '振打系统.pdf · 第2项', sourceDocument: '振打系统.pdf', constructionStageId: 'stage-09', inspectionItemId: 'r2', image: '', imageFileID: '',
    imageBBox: { x: 0.55, y: 0.41, w: 0.14, h: 0.16 }, modelMarker: { regionId: 'a1-field-5', x: 56, y: 45 },
    inspector: '智能检测', createdAt: '2026-07-14 11:42', deadline: '2026-07-18', rectification: null, review: null
  },
  {
    id: 'DF-20260713-004', projectId: PROJECT.id,
    deviceNodeId: 'a1-hopper-1', fieldId: 'a1-field-1', systemId: 'a1-ash', chamber: 'A1室', fieldNo: 1,
    deviceName: 'A1室 1号灰斗', systemName: '灰斗系统', positionCode: 'A1室/1号灰斗/出灰口法兰',
    name: '灰斗焊缝密封不良', type: 'seal', severity: 'major', level: 'Ⅱ级', confidence: 0.9,
    status: 'closed', statusName: '已闭环', description: '煤油渗油检查发现焊缝漏点。', suggestion: '漏点补焊后重新进行渗油检验。',
    standard: '灰斗.pdf · 第3/4项', sourceDocument: '灰斗.pdf', constructionStageId: 'stage-04', inspectionItemId: 'a3', image: '', imageFileID: '',
    imageBBox: { x: 0.32, y: 0.48, w: 0.2, h: 0.12 }, modelMarker: { regionId: 'a1-field-1', x: 32, y: 74 },
    inspector: '李工', createdAt: '2026-07-13 15:20', deadline: '2026-07-14', rectification: { owner: '安装二班', updatedAt: '2026-07-14 09:00', note: '补焊完成' }, review: { reviewer: '监理王工', result: '通过', updatedAt: '2026-07-14 13:30' }
  }
];

var INSPECTION_TASKS = [
  { id: 'INSP-0714-01', name: 'A1室第1电场阳极安装质量检查', deviceNodeId: 'a1-field-1-anode', stageId: 'stage-07', inspector: '张工', photoCount: 8, itemCount: 16, defectCount: 2, status: 'completed', time: '09:00-10:30' },
  { id: 'INSP-0714-02', name: 'A1室第5电场振打系统安装检查', deviceNodeId: 'a1-field-5-rapping', stageId: 'stage-09', inspector: '李工', photoCount: 5, itemCount: 6, defectCount: 1, status: 'completed', time: '11:10-11:55' },
  { id: 'INSP-0714-03', name: '顶部高压进线专项安装检查', deviceNodeId: 'a1-hvline', stageId: 'stage-12', inspector: '王工', photoCount: 3, itemCount: 5, defectCount: 0, status: 'in_progress', time: '14:00-进行中' }
];

var STATUS_NAMES = { pending: '待整改', rectifying: '整改中', review: '待复验', closed: '已闭环' };
var RECTIFICATION_STATUS_NAMES = { pending: '待整改', rectifying: '整改中', closed: '已闭环' };

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function flattenDeviceTree(root, level, parentId, rows) {
  rows = rows || []; level = level || 0;
  if (!root) return rows;
  var item = Object.assign({}, root, { level: level, parentId: parentId || '', hasChildren: !!(root.children && root.children.length) });
  delete item.children; rows.push(item);
  (root.children || []).forEach(function (child) { flattenDeviceTree(child, level + 1, root.id, rows); });
  return rows;
}

function getNodeById(id, root) {
  root = root || DEVICE_TREE;
  if (!root) return null;
  if (root.id === id) return root;
  for (var i = 0; i < (root.children || []).length; i++) {
    var found = getNodeById(id, root.children[i]); if (found) return found;
  }
  return null;
}

function getDescendantIds(id) {
  var node = getNodeById(id); if (!node) return [id];
  return flattenDeviceTree(node).map(function (row) { return row.id; });
}

function getNodeDefects(defects, nodeId) {
  var ids = getDescendantIds(nodeId);
  return (defects || []).filter(function (d) { return ids.indexOf(d.deviceNodeId) !== -1 || ids.indexOf(d.fieldId) !== -1 || ids.indexOf(d.systemId) !== -1; });
}

function deriveStatus(defects) {
  var active = (defects || []).filter(function (d) { return d.status !== 'closed'; });
  if (active.some(function (d) { return d.severity === 'major' || d.level === 'Ⅰ级' || d.level === 'Ⅱ级'; })) return 'danger';
  if (active.length) return 'warning';
  return 'normal';
}

function buildDeviceRows(defects) {
  return flattenDeviceTree(DEVICE_TREE).map(function (row) {
    var nodeDefects = getNodeDefects(defects, row.id);
    return Object.assign({}, row, { status: deriveStatus(nodeDefects), defectCount: nodeDefects.filter(function (d) { return d.status !== 'closed'; }).length, indent: row.level * 28 });
  });
}

function buildModelRegions(defects) {
  return MODEL_REGIONS.map(function (region) {
    var list = getNodeDefects(defects, region.id);
    return Object.assign({}, region, { status: deriveStatus(list), defectCount: list.filter(function (d) { return d.status !== 'closed'; }).length });
  });
}

function getModelMarkers(defects) {
  return (defects || []).filter(function (d) { return d.status !== 'closed' && d.modelMarker && d.modelMarker.regionId; }).map(function (d) {
    return Object.assign({}, d, { markerX: d.modelMarker.x, markerY: d.modelMarker.y, markerRegionId: d.modelMarker.regionId });
  });
}

function getAreaForDevice(nodeId) {
  var node = getNodeById(nodeId); if (node && node.areaKey) return node.areaKey;
  if ((nodeId || '').indexOf('-field-') !== -1) return 'anode';
  return 'shell';
}

function getFieldContext(nodeId) {
  var match = /^(a1|a2|b1|b2)-field-([1-5])/.exec(nodeId || '');
  if (!match) return { fieldId: '', chamber: '', fieldNo: 0, deviceName: '' };
  var chamber = match[1].toUpperCase() + '室'; var fieldNo = Number(match[2]);
  return { fieldId: match[1] + '-field-' + match[2], chamber: chamber, fieldNo: fieldNo, deviceName: chamber + ' 第' + fieldNo + '电场' };
}

function getInspectionDeviceOptions() {
  var rows = flattenDeviceTree(DEVICE_TREE);
  return rows.filter(function (node) { return !!node.areaKey && node.type !== 'construction-package'; }).map(function (node) {
    return { id: node.id, name: node.name, type: node.type, areaKey: node.areaKey, stageId: node.stageId || '', chamber: node.chamber || '', fieldNo: node.fieldNo || 0 };
  });
}

function createInitialState(historyRecords) {
  var legacyDefects = []; var legacyInspections = [];
  var areaDeviceMap = { shell: 'a1-shell', ashopper: 'a1-ash', anode: 'a1-field-1-anode', cathode: 'a1-field-1-cathode', rapping: 'a1-field-1-rapping', support: 'steel-support', horn: 'a1-inlet', hoist: 'top-hoist', hvline: 'a1-hvline', batch: 'esp' };
  (historyRecords || []).forEach(function (record, recordIndex) {
    if (record.type !== 'inspection' && record.type !== 'batch') return;
    var deviceNodeId = getNodeById(record.deviceNodeId) ? record.deviceNodeId : (areaDeviceMap[record.area] || 'esp');
    legacyInspections.push({ id: 'LEGACY-INSP-' + (record.id || recordIndex), name: (record.areaName || '历史') + '安装检查', deviceNodeId: deviceNodeId, inspector: '历史记录', photoCount: record.totalPhotos || 1, itemCount: 0, defectCount: (record.defects || []).length, status: 'completed', time: record.time || '' });
    (record.defects || []).forEach(function (d, defectIndex) {
      var context = getFieldContext(d.deviceNodeId || deviceNodeId); var node = getNodeById(d.deviceNodeId || deviceNodeId);
      legacyDefects.push({
        id: 'LEGACY-DF-' + (record.id || recordIndex) + '-' + defectIndex, projectId: PROJECT.id, deviceNodeId: node ? node.id : deviceNodeId,
        fieldId: context.fieldId, chamber: context.chamber, fieldNo: context.fieldNo, systemId: node ? node.id : deviceNodeId,
        deviceName: context.deviceName || (node ? node.name : record.areaName || '历史构件'), systemName: record.areaName || '', positionCode: d.positionCode || record.positionCode || d.location_hint || '历史记录待定位',
        name: d.name || '历史缺陷', type: d.type || 'other', severity: d.severity || 'moderate', level: d.severity === 'major' ? 'Ⅱ级' : d.severity === 'minor' ? 'Ⅳ级' : 'Ⅲ级',
        confidence: d.confidence || 0, status: d.status || 'pending', statusName: getStatusName(d.status || 'pending'), description: d.description || '', suggestion: d.suggestion || '', standard: d.standard || '',
        sourceDocument: (STANDARD_SOURCES[record.area] || {}).document || '', constructionStageId: (STANDARD_SOURCES[record.area] || {}).stageId || '', inspectionItemId: d.itemId || '', image: record.image || '', imageFileID: '', imageBBox: d.bbox || null,
        modelMarker: null, inspector: '历史迁移', createdAt: record.time || '', deadline: '', rectification: null, review: null, legacyRecordId: record.id
      });
    });
  });
  return {
    stageSchemaVersion: stageCatalog.VERSION,
    schemaVersion: '4.1-domain', project: clone(PROJECT), deviceTree: clone(DEVICE_TREE),
    qualityScore: 92, healthScore: 92, qualityStatus: 'warning', qualityStatusName: '重点工序施工中',
    qualityMetrics: clone(QUALITY_METRICS), healthMetrics: clone(QUALITY_METRICS), constructionStages: clone(CONSTRUCTION_STAGES),
    defects: clone(INITIAL_DEFECTS).concat(legacyDefects), inspections: clone(INSPECTION_TASKS).concat(legacyInspections), reports: [], rectificationOrders: [],
    migratedLegacyHistory: true, updatedAt: Date.now()
  };
}

function migrateNodeId(id) {
  if (!id) return id || '';
  if (/^[ab][12]-/.test(id)) return id;
  return id.replace(/^a-/, 'a1-').replace(/^b-/, 'b1-');
}

function migrateDefectLocation(defect) {
  var item = Object.assign({}, defect);
  item.deviceNodeId = migrateNodeId(item.deviceNodeId);
  item.fieldId = migrateNodeId(item.fieldId);
  item.systemId = migrateNodeId(item.systemId);
  if (item.modelMarker && item.modelMarker.regionId) {
    item.modelMarker = Object.assign({}, item.modelMarker, { regionId: migrateNodeId(item.modelMarker.regionId) });
  }
  var context = getFieldContext(item.deviceNodeId || item.fieldId);
  if (context.chamber && (!item.chamber || item.chamber === 'A室' || item.chamber === 'B室')) {
    item.chamber = context.chamber;
    item.fieldNo = context.fieldNo;
    item.deviceName = context.deviceName || item.deviceName;
  }
  var node = getNodeById(item.deviceNodeId);
  if (node && node.stageId) item.constructionStageId = node.stageId;
  item.constructionStageId = stageCatalog.canonicalId(item.constructionStageId);
  return item;
}

function normalizeState(saved, historyRecords) {
  var initial = createInitialState(historyRecords);
  if (!saved || (saved.schemaVersion !== '3.1-construction' && saved.schemaVersion !== '4.1-domain')) return initial;
  saved = clone(saved);
  function migrateIds(value) {
    if (!value || typeof value !== 'object') return;
    if (value.stageId) value.stageId = stageCatalog.canonicalId(value.stageId);
    if (value.constructionStageId) value.constructionStageId = stageCatalog.canonicalId(value.constructionStageId);
    Object.keys(value).forEach(function (key) { if (value[key] && typeof value[key] === 'object') migrateIds(value[key]); });
  }
  migrateIds(saved);
  return Object.assign(initial, saved, {
    stageSchemaVersion: stageCatalog.VERSION,
    schemaVersion: '4.1-domain',
    project: Object.assign(initial.project, saved.project || {}), deviceTree: clone(DEVICE_TREE),
    constructionStages: clone(CONSTRUCTION_STAGES), qualityMetrics: clone(QUALITY_METRICS), healthMetrics: clone(QUALITY_METRICS),
    defects: Array.isArray(saved.defects) ? saved.defects.map(migrateDefectLocation) : initial.defects,
    inspections: Array.isArray(saved.inspections) ? saved.inspections.map(function (item) {
      return Object.assign({}, item, { deviceNodeId: migrateNodeId(item.deviceNodeId) });
    }) : initial.inspections,
    reports: Array.isArray(saved.reports) ? saved.reports : [],
    rectificationOrders: Array.isArray(saved.rectificationOrders) ? saved.rectificationOrders : []
  });
}

function createDefectId() {
  var d = new Date(); var date = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'DF-' + date + '-' + String(Date.now()).slice(-5);
}

function createRectificationOrderId() {
  var d = new Date();
  var date = String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'ZG-' + date + '-' + String(Date.now()).slice(-5);
}

function createShareToken() {
  return [Date.now().toString(36), Math.random().toString(36).substr(2, 12), Math.random().toString(36).substr(2, 12)].join('-');
}

function getStatusName(status) { return STATUS_NAMES[status] || status || '待整改'; }

function getDashboardStats(state) {
  var defects = state.defects || []; var inspections = state.inspections || []; var open = defects.filter(function (d) { return d.status !== 'closed'; });
  var photos = inspections.reduce(function (sum, item) { return sum + (item.photoCount || 0); }, 0);
  var items = inspections.reduce(function (sum, item) { return sum + (item.itemCount || 0); }, 0);
  return { photoCount: photos, itemCount: items, defectCount: defects.length, pendingCount: open.length, closedCount: defects.length - open.length, inspectionCount: inspections.length };
}

module.exports = {
  PROJECT: PROJECT, CONSTRUCTION_STAGES: CONSTRUCTION_STAGES, STANDARD_SOURCES: STANDARD_SOURCES,
  DEVICE_TREE: DEVICE_TREE, QUALITY_METRICS: QUALITY_METRICS, HEALTH_METRICS: QUALITY_METRICS,
  MODEL_REGIONS: MODEL_REGIONS, INITIAL_DEFECTS: INITIAL_DEFECTS, INSPECTION_TASKS: INSPECTION_TASKS, STATUS_NAMES: STATUS_NAMES, RECTIFICATION_STATUS_NAMES: RECTIFICATION_STATUS_NAMES,
  clone: clone, flattenDeviceTree: flattenDeviceTree, getNodeById: getNodeById, getNodeDefects: getNodeDefects,
  deriveStatus: deriveStatus, buildDeviceRows: buildDeviceRows, buildModelRegions: buildModelRegions, getModelMarkers: getModelMarkers,
  getAreaForDevice: getAreaForDevice, getFieldContext: getFieldContext, getInspectionDeviceOptions: getInspectionDeviceOptions,
  createInitialState: createInitialState, normalizeState: normalizeState, createDefectId: createDefectId,
  createRectificationOrderId: createRectificationOrderId, createShareToken: createShareToken,
  getStatusName: getStatusName, getDashboardStats: getDashboardStats
};
