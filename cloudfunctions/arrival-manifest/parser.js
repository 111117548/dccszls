var STAGES = [
  { index: 1, name: '支座', pattern: /地脚螺栓|底座|支座|柱脚/ },
  { index: 2, name: '基础梁', pattern: /基础梁|基础底梁/ },
  { index: 9, name: '振打系统', pattern: /振打|砧梁|砧板|振打杆|振打轴|振打锤/ },
  { index: 10, name: '高压设备', pattern: /高压|整流|变压器|导电杆|护套管|排油/ },
  { index: 4, name: '灰斗', pattern: /灰斗|卸灰|出灰|仓泵/ },
  { index: 6, name: '进出口', pattern: /进口|出口|进出口|喇叭|烟道|导流|均流|孔板|槽型板|阻流/ },
  { index: 7, name: '阳极系统', pattern: /阳极|收尘极|阳极板|阳极吊|悬吊杆/ },
  { index: 8, name: '阴极系统', pattern: /阴极|电晕|针刺线|保温箱|绝缘子|阴极吊/ },
  { index: 11, name: '平台扶梯', pattern: /平台|扶梯|楼梯|走道|踏步|栏杆|雨棚|起吊/ },
  { index: 12, name: '电气仪表', pattern: /电气|仪表|电缆|控制柜|接线箱/ },
  { index: 3, name: '钢支架', pattern: /钢支架|立柱|横梁|纵向梁|支撑|斜梁|框架|角钢|C型钢|节点板/ },
  { index: 5, name: '壳体', pattern: /壳体|墙板|顶板|端板|圈梁|承压|人孔门/ }
];

var HEADER_ALIASES = {
  boxNo: ['XJH', '箱号', '包装箱号', '箱件号'],
  sequence: ['XH', '序号', '项号'],
  drawingNo: ['XJTH', '图号', '箱件图号', '物料编码'],
  name: ['MC', '名称', '物料名称', '部件名称'],
  unit: ['D', '单位'],
  quantity: ['SL', '数量', '需求数量'],
  packageType: ['FS', '包装方式'],
  grossWeight: ['MZ', '毛重'],
  netWeight: ['JZ', '净重'],
  remark: ['BZ', '备注'],
  contractNo: ['HTH', '合同号'],
  deviceNo: ['SB', '设备号', '设备编号'],
  projectName: ['DW', '项目', '项目名称', '单位工程']
};

function text(value) { return String(value == null ? '' : value).trim(); }
function number(value) {
  var parsed = Number(String(value == null ? '' : value).replace(/,/g, '').trim());
  return isFinite(parsed) ? parsed : 0;
}
function normalizeHeader(value) { return text(value).replace(/[\s_\-（）()]/g, '').toUpperCase(); }
function aliases() {
  var map = {};
  Object.keys(HEADER_ALIASES).forEach(function (key) {
    HEADER_ALIASES[key].forEach(function (name) { map[normalizeHeader(name)] = key; });
  });
  return map;
}
function findHeader(matrix) {
  var aliasMap = aliases();
  var best = null;
  (matrix || []).slice(0, 20).forEach(function (row, rowIndex) {
    var columns = {};
    (row || []).forEach(function (value, columnIndex) {
      var key = aliasMap[normalizeHeader(value)];
      if (key && columns[key] === undefined) columns[key] = columnIndex;
    });
    var score = Object.keys(columns).length;
    if (!best || score > best.score) best = { rowIndex: rowIndex, columns: columns, score: score };
  });
  if (!best || best.score < 4 || best.columns.boxNo === undefined || best.columns.name === undefined) {
    throw new Error('未识别到箱号、名称等到货清单表头');
  }
  return best;
}
function rowValue(row, header, key) {
  var index = header.columns[key];
  return index === undefined ? '' : row[index];
}
function classifyPackage(pkg) {
  var sample = [pkg.name, pkg.drawingNo].concat((pkg.items || []).slice(0, 30).map(function (item) {
    return item.name + ' ' + item.drawingNo;
  })).join(' ');
  for (var i = 0; i < STAGES.length; i++) {
    if (STAGES[i].pattern.test(sample)) return { stageIndex: STAGES[i].index, stageName: STAGES[i].name };
  }
  // Most ESP drawing numbers use the first section after the project code to
  // indicate the assembly family. This fallback is intentionally applied only
  // after name matching so a clear item name (for example 阳极振打) wins.
  var drawing = text(pkg.drawingNo) + ' ' + (pkg.items || []).slice(0, 20).map(function (item) { return text(item.drawingNo); }).join(' ');
  var match = drawing.match(/(?:^|[^0-9])(?:[A-Z]+)?\d+[.．](\d+)(?:[A-Z]+)?(?:[.．-]|\b)/i);
  if (match) {
    var family = Number(match[1]);
    var familyMap = {
      0: [1, '支座'], 28: [1, '支座'],
      12: [3, '钢支架'], 2: [4, '灰斗'],
      1: [5, '壳体'], 11: [5, '壳体'], 20: [5, '壳体'],
      6: [6, '进出口'], 7: [6, '进出口'], 27: [6, '进出口'], 36: [6, '进出口'], 84: [6, '进出口'],
      4: [7, '阳极系统'], 5: [8, '阴极系统'], 10: [10, '高压设备'],
      8: [11, '平台扶梯'], 9: [11, '平台扶梯'], 16: [11, '平台扶梯'], 19: [11, '平台扶梯']
    };
    if (familyMap[family]) return { stageIndex: familyMap[family][0], stageName: familyMap[family][1] };
  }
  return { stageIndex: 0, stageName: '待归类' };
}
function packageSummary(packages) {
  var result = {};
  for (var i = 1; i <= 13; i++) result[i] = { stageIndex: i, stageName: '', plannedPackages: 0 };
  packages.forEach(function (pkg) {
    if (!pkg.stageIndex) return;
    result[pkg.stageIndex].stageName = pkg.stageName;
    result[pkg.stageIndex].plannedPackages += 1;
  });
  return Object.keys(result).map(function (key) { return result[key]; }).filter(function (item) { return item.plannedPackages > 0; });
}
function parseMatrix(matrix, sheetName) {
  var header = findHeader(matrix);
  var grouped = {};
  var order = [];
  var dataRows = 0;
  (matrix || []).slice(header.rowIndex + 1).forEach(function (row) {
    var boxNo = text(rowValue(row, header, 'boxNo'));
    if (!boxNo) return;
    dataRows += 1;
    if (!grouped[boxNo]) {
      grouped[boxNo] = { boxNo: boxNo, summary: null, items: [] };
      order.push(boxNo);
    }
    var item = {
      sequence: text(rowValue(row, header, 'sequence')),
      drawingNo: text(rowValue(row, header, 'drawingNo')),
      name: text(rowValue(row, header, 'name')),
      unit: text(rowValue(row, header, 'unit')),
      quantity: number(rowValue(row, header, 'quantity')),
      packageType: text(rowValue(row, header, 'packageType')),
      grossWeight: number(rowValue(row, header, 'grossWeight')),
      netWeight: number(rowValue(row, header, 'netWeight')),
      remark: text(rowValue(row, header, 'remark')),
      contractNo: text(rowValue(row, header, 'contractNo')),
      deviceNo: text(rowValue(row, header, 'deviceNo')),
      projectName: text(rowValue(row, header, 'projectName'))
    };
    if (number(item.sequence) === 0) grouped[boxNo].summary = item;
    else grouped[boxNo].items.push(item);
  });
  var packages = order.map(function (boxNo) {
    var group = grouped[boxNo];
    var summary = group.summary || group.items[0] || {};
    var pkg = {
      boxNo: boxNo,
      drawingNo: summary.drawingNo || '',
      name: summary.name || '未命名包装箱',
      unit: summary.unit || '箱',
      quantity: summary.quantity || 1,
      packageType: summary.packageType || '',
      grossWeight: summary.grossWeight || 0,
      netWeight: summary.netWeight || 0,
      contractNo: summary.contractNo || '',
      deviceNo: summary.deviceNo || '',
      projectName: summary.projectName || '',
      itemLineCount: group.items.length,
      itemQuantity: group.items.reduce(function (sum, item) { return sum + number(item.quantity); }, 0),
      items: group.items.slice(0, 80).map(function (item) {
        return { drawingNo: item.drawingNo, name: item.name, unit: item.unit, quantity: item.quantity };
      })
    };
    var category = classifyPackage(pkg);
    pkg.stageIndex = category.stageIndex;
    pkg.stageName = category.stageName;
    return pkg;
  });
  return {
    sheetName: sheetName || '',
    headerRow: header.rowIndex + 1,
    rowCount: dataRows,
    packageCount: packages.length,
    detailLineCount: packages.reduce(function (sum, item) { return sum + item.itemLineCount; }, 0),
    classifiedCount: packages.filter(function (item) { return item.stageIndex > 0; }).length,
    unmatchedCount: packages.filter(function (item) { return !item.stageIndex; }).length,
    stageSummaries: packageSummary(packages),
    packages: packages
  };
}

module.exports = { STAGES: STAGES, parseMatrix: parseMatrix, classifyPackage: classifyPackage };
