// Seven independent annexes from "电除尘器本体安装检查记录.xls".
// They are process inspection forms, not the 13 construction-stage components.
var STORAGE_KEY = 'esp_process_records_v1';

function metricGroup(id, name, codes, standard) {
  return { id: id, name: name, codes: codes, standard: standard || '', unit: 'mm' };
}

var FORMS = [
  {
    id: 'annex-1', sheetName: '附表1', code: 'ESP-INS-01', listTitle: '钢支架立柱检验', title: '钢支架立柱设备施工检验记录',
    inspectionItem: '钢支架立柱板水平高度偏差、对角线、铅垂度',
    qualityStandard: '水平高度偏差±3mm；对角线尺寸≤20m时相互差值≤7mm，尺寸＞20m时相互差值≤9mm；铅垂度为5mm。',
    groups: [
      metricGroup('elevation', '水平高度偏差', ['a','b','c','d','e','f','g','h','i','j']),
      metricGroup('diagonal', '对角线', ['ag','fb','bh','cg','ci','dh','dj','ie']),
      metricGroup('verticality', '铅垂度', ['a','b','c','d','e','f','g','h','i','j'])
    ]
  },
  {
    id: 'annex-2', sheetName: '附表2', code: 'ESP-INS-02', listTitle: '灰斗检验', title: '灰斗施工检验记录',
    inspectionItem: '灰斗大口尺寸偏差、对角线偏差',
    qualityStandard: '大口尺寸偏差-3mm～-6mm；对角线偏差≤3mm。',
    groups: [
      metricGroup('opening', '上口偏差', ['ab','ac','bd','cd','eg','ef','fh','hg','ik','ij','lk','lj','mo','mn','pn','po','qs','qr','tr','ts']),
      metricGroup('diagonal', '对角线偏差', ['ad','cb','eh','gf','il','kj','mp','on','qt','sr','ux','wv'])
    ]
  },
  {
    id: 'annex-3', sheetName: '附表3', code: 'ESP-INS-03', listTitle: '墙板检验', title: '墙板施工检验记录',
    inspectionItem: '矩形尺寸偏差、对角线偏差、直线度',
    qualityStandard: '矩形尺寸偏差-3mm～-6mm；对角线偏差≤3mm；直线度L/1000且≤10mm。',
    groups: [
      metricGroup('straightness', '直线度偏差', ['ac','bd','eg','fh','ik','jl','mo','np','qs','rt','uw','nx']),
      metricGroup('rectangle', '矩形尺寸偏差', ['ab','ac','bd','cd','eg','ef','fh','hg','ik','ij','lk','lj','mo','mn','pn','po','qs','qr','tr','ts']),
      metricGroup('diagonal', '对角线偏差', ['ad','cb','eh','gf','il','kj','mp','on','qt','sr','ux','wv'])
    ]
  },
  {
    id: 'annex-4', sheetName: '附表4', code: 'ESP-INS-04', listTitle: '顶梁检验', title: '顶梁设备施工检验记录',
    inspectionItem: '顶梁标高、水平度、对角线（吊耳间对角线）',
    qualityStandard: '水平标高±5mm；对角线偏差5mm；水平度5mm。',
    groups: [
      metricGroup('elevation', '水平标高', ['a','b','c','d','e','f','g','h','i']),
      metricGroup('level', '水平度', ['a','b','c','d','e','f','g','h','i']),
      metricGroup('diagonal', '对角线', ["aa'-bb'","cc'-dd'","ee'-ff'","gg'-hh'","ii'-jj'","kk'-ll'","nn'-mm'","oo'-pp'"])
    ]
  },
  {
    id: 'annex-5', sheetName: '附表5', code: 'ESP-INS-05', listTitle: '承压绝缘子检验', title: '承压绝缘子设备施工检验记录',
    inspectionItem: '同一阴极吊梁上承压绝缘子水平度',
    qualityStandard: '同一阴极吊梁上各承压绝缘子水平高度相互偏差≤10mm。',
    groups: [
      metricGroup('insulator-level', '承压绝缘子水平高度相互偏差', ['A','B','C','D','E','F','G','H'])
    ]
  },
  {
    id: 'annex-6', sheetName: '附表6', code: 'ESP-INS-06', listTitle: '阴极吊梁检验', title: '阴极吊梁水平度施工检验记录',
    inspectionItem: '阴极吊梁水平度',
    qualityStandard: '水平度≤5mm。',
    groups: [
      metricGroup('cathode-beam-level', '水平度', ['a','b','c','d','e','f'])
    ]
  },
  {
    id: 'annex-7', sheetName: '附表7', code: 'ESP-INS-07', listTitle: '电场极距检查', title: '电场极距检查记录',
    inspectionItem: '阴阳极同极距、异极距',
    qualityStandard: '同极距400mm；通规尺寸185mm。通规能通过记“√”，不能通过记“×”。',
    matrix: {
      fieldCount: 4, channelCount: 30,
      columns: [
        { id: 'inletUpperSame', name: '进口上阴点·同极距' },
        { id: 'inletUpperFront', name: '进口上阴点·异极距前' },
        { id: 'inletUpperRear', name: '进口上阴点·异极距后' },
        { id: 'inletLowerSame', name: '进口下阴点·同极距' },
        { id: 'inletLowerFront', name: '进口下阴点·异极距前' },
        { id: 'inletLowerRear', name: '进口下阴点·异极距后' },
        { id: 'outletUpperSame', name: '出口上阴点·同极距' },
        { id: 'outletUpperFront', name: '出口上阴点·异极距前' },
        { id: 'outletUpperRear', name: '出口上阴点·异极距后' },
        { id: 'outletLowerSame', name: '出口下阴点·同极距' },
        { id: 'outletLowerFront', name: '出口下阴点·异极距前' },
        { id: 'outletLowerRear', name: '出口下阴点·异极距后' }
      ]
    }
  }
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function getForm(formId) {
  for (var i = 0; i < FORMS.length; i++) if (FORMS[i].id === formId) return clone(FORMS[i]);
  return clone(FORMS[0]);
}
function createRecord(formId, context) {
  var form = getForm(formId);
  context = context || {};
  var values = {};
  (form.groups || []).forEach(function (group) {
    values[group.id] = {};
    group.codes.forEach(function (code) { values[group.id][code] = ''; });
  });
  var matrixValues = {};
  if (form.matrix) {
    for (var field = 1; field <= form.matrix.fieldCount; field++) {
      matrixValues['field' + field] = [];
      for (var channel = 1; channel <= form.matrix.channelCount; channel++) {
        var row = { channel: channel };
        form.matrix.columns.forEach(function (col) { row[col.id] = ''; });
        matrixValues['field' + field].push(row);
      }
    }
  }
  return {
    id: 'PROC-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    formId: form.id, formCode: form.code, formTitle: form.title, sourceSheetName: form.sheetName,
    projectId: context.projectId || '', projectName: context.projectName || '',
    deviceId: context.deviceId || '', deviceName: context.deviceName || '',
    inspectionDate: new Date().toISOString().slice(0, 10),
    chamber: 'A1', fieldNo: 1, values: values, matrixValues: matrixValues,
    result: '', remarks: '', status: 'draft', statusName: '草稿',
    createdAt: new Date().toLocaleString('zh-CN'), updatedAtText: new Date().toLocaleString('zh-CN')
  };
}
function loadRecords() {
  try { return JSON.parse(wx.getStorageSync(STORAGE_KEY) || '[]'); } catch (e) { return []; }
}
function saveRecords(records) {
  try { wx.setStorageSync(STORAGE_KEY, JSON.stringify(records || [])); } catch (e) {}
}
function upsertRecord(record) {
  var records = loadRecords(); var found = -1;
  for (var i = 0; i < records.length; i++) if (records[i].id === record.id) { found = i; break; }
  record.updatedAtText = new Date().toLocaleString('zh-CN');
  if (found >= 0) records[found] = record; else records.unshift(record);
  saveRecords(records);
  return record;
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY, FORMS: FORMS, getForm: getForm, createRecord: createRecord,
  loadRecords: loadRecords, saveRecords: saveRecords, upsertRecord: upsertRecord
};
