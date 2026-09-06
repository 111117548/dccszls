var catalog = require('./stage-catalog');
var STAGES = [
  { index: 9, pattern: /纳米|涂层/ },
  { index: 8, pattern: /保温箱/ },
  { index: 12, pattern: /顶部起吊|起吊|电动葫芦/ },
  { index: 10, pattern: /振打|砧梁|砧板|振打杆|振打轴|振打锤/ },
  { index: 2, pattern: /地脚螺栓|底座|支座|柱脚/ },
  { index: 1, pattern: /基础梁|基础底梁/ },
  { index: 11, pattern: /高压|整流|变压器|导电杆|护套管|排油|电气|仪表|电缆|控制柜|接线箱/ },
  { index: 3, pattern: /灰斗|卸灰|出灰|仓泵/ },
  { index: 7, pattern: /进口|出口|进出口|喇叭|烟道|导流|均流|孔板|槽型板|阻流/ },
  { index: 6, pattern: /阳极|收尘极|悬吊杆|阴极|电晕|针刺线|绝缘子/ },
  { index: 5, pattern: /平台|扶梯|楼梯|走道|踏步|栏杆|雨棚/ },
  { index: 1, pattern: /钢支架|立柱|横梁|纵向梁|支撑|斜梁|框架|角钢|C型钢|节点板/ },
  { index: 4, pattern: /壳体|墙板|顶板|端板|圈梁|承压|人孔门/ }
].map(function (rule) {
  return Object.assign({ name: catalog.STAGES[rule.index - 1].shortName }, rule);
});

var HEADER_ALIASES = {
  boxNo: ['XJH', '箱号', '包装箱号', '箱件号', '构件号/箱件号', '构件号／箱件号'],
  sequence: ['XH', '序号', '项号'],
  drawingNo: ['XJTH', '图号', '箱件图号', '物料编码'],
  name: ['MC', '名称', '物料名称', '物资名称', '部件名称'],
  unit: ['D', '单位'],
  quantity: ['SL', '数量', '需求数量'],
  packageType: ['FS', '包装方式'],
  grossWeight: ['MZ', '毛重', '毛重(kg)', '毛重（kg）'],
  netWeight: ['JZ', '净重', '净重(kg)', '净重（kg）'],
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
    if (!best || score > best.score) best = { rowIndex: rowIndex, columns: columns, score: score, values: row || [] };
  });
  if (!best || best.score < 4 || best.columns.boxNo === undefined || best.columns.name === undefined) {
    throw new Error('未识别到箱号、名称等到货清单表头');
  }
  return best;
}

function metadataValue(matrix, aliases) {
  aliases = (aliases || []).map(normalizeHeader);
  var rows = (matrix || []).slice(0, 15);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];
    for (var j = 0; j < row.length; j++) {
      if (aliases.indexOf(normalizeHeader(row[j])) < 0) continue;
      for (var offset = 1; offset <= 3; offset++) {
        if (text(row[j + offset])) return text(row[j + offset]);
      }
    }
  }
  return '';
}

function drawingFamilyCategory(pkg) {
  var drawing = text(pkg.drawingNo) + ' ' + (pkg.items || []).slice(0, 20).map(function (item) { return text(item.drawingNo); }).join(' ');
  var match = drawing.match(/(?:^|[^0-9])(?:[A-Z]+)?\d+[.．](\d+)(?:[A-Z]+)?(?:[.．-]|\b)/i);
  if (!match) return null;
  var family = Number(match[1]);
  var familyMap = {
    0: 2, 28: 2, 12: 1, 2: 3,
    1: 4, 11: 4, 20: 4,
    6: 7, 7: 7, 27: 7, 36: 7, 84: 7,
    4: 6, 5: 6, 10: 11,
    8: 5, 9: 5, 16: 5, 19: 5
  };
  return familyMap[family] ? { stageIndex: familyMap[family], stageName: catalog.STAGES[familyMap[family] - 1].shortName } : null;
}
function rowValue(row, header, key) {
  var index = header.columns[key];
  return index === undefined ? '' : row[index];
}
function classifyPackage(pkg) {
  var sample = [pkg.name, pkg.drawingNo].concat((pkg.items || []).slice(0, 30).map(function (item) {
    return item.name + ' ' + item.drawingNo;
  })).join(' ');
  // Names such as “横梁、框架、支撑” occur in several assemblies. For these
  // generic names the drawing family is a more reliable classifier.
  var familyCategory = drawingFamilyCategory(pkg);
  if (familyCategory && /^(?:立柱|横梁|纵向梁|支撑|斜梁|框架|角钢|节点板|顶梁)$/.test(text(pkg.name))) return familyCategory;
  for (var i = 0; i < STAGES.length; i++) {
    if (STAGES[i].pattern.test(sample)) return { stageIndex: STAGES[i].index, stageName: STAGES[i].name };
  }
  // Most ESP drawing numbers use the first section after the project code to
  // indicate the assembly family. This fallback is intentionally applied only
  // after name matching so a clear item name (for example 阳极振打) wins.
  if (familyCategory) return familyCategory;
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
  var shippingFormat = (header.values || []).some(function (value) { return /构件号[\/／]箱件号/.test(text(value)); });
  var documentProjectName = metadataValue(matrix, ['项目名称']);
  var documentDeviceNo = metadataValue(matrix, ['机组号', '设备号']);
  var grouped = {};
  var order = [];
  var dataRows = 0;
  var rows = (matrix || []).slice(header.rowIndex + 1);
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    var row = rows[rowIndex] || [];
    if (shippingFormat && /总件数/.test((row || []).map(text).join(' '))) break;
    var boxNo = text(rowValue(row, header, 'boxNo'));
    if (!boxNo) continue;
    if (shippingFormat && !/^\d+$/.test(text(rowValue(row, header, 'sequence')))) continue;
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
      projectName: text(rowValue(row, header, 'projectName')) || documentProjectName
    };
    item.deviceNo = item.deviceNo || documentDeviceNo;
    if (shippingFormat || number(item.sequence) === 0) grouped[boxNo].summary = item;
    else grouped[boxNo].items.push(item);
  }
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

function vehicleNumber(value) {
  var match = text(value).match(/第\s*(\d+)\s*车/);
  return match ? Number(match[1]) : 0;
}

function compactArrivalPackage(item, sheetName) {
  return {
    boxNo: item.boxNo,
    drawingNo: item.drawingNo,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    packageType: item.packageType,
    grossWeight: item.grossWeight,
    netWeight: item.netWeight,
    contractNo: item.contractNo,
    deviceNo: item.deviceNo,
    projectName: item.projectName,
    itemLineCount: item.itemLineCount,
    itemQuantity: item.itemQuantity,
    stageIndex: item.stageIndex,
    stageName: item.stageName,
    sourceSheetName: text(sheetName),
    vehicleNumber: vehicleNumber(sheetName)
  };
}

function combineArrivalSheets(parsedSheets, fileName) {
  var numbered = (parsedSheets || []).filter(function (item) { return vehicleNumber(item.sheetName) > 0; });
  var preferredVehicle = vehicleNumber(fileName);
  if (preferredVehicle) numbered = numbered.filter(function (item) { return vehicleNumber(item.sheetName) <= preferredVehicle; });
  if (!numbered.length) return null;
  numbered.sort(function (a, b) { return vehicleNumber(a.sheetName) - vehicleNumber(b.sheetName); });
  var packages = [];
  var seen = {};
  var duplicatePackageCount = 0;
  numbered.forEach(function (sheet) {
    (sheet.packages || []).forEach(function (item) {
      var key = text(item.boxNo).replace(/\s+/g, '').toUpperCase();
      if (!key || seen[key]) { duplicatePackageCount += 1; return; }
      seen[key] = true;
      packages.push(compactArrivalPackage(item, sheet.sheetName));
    });
  });
  var firstVehicle = vehicleNumber(numbered[0].sheetName);
  var lastVehicle = vehicleNumber(numbered[numbered.length - 1].sheetName);
  return {
    sheetName: firstVehicle === lastVehicle ? text(numbered[0].sheetName) : '第' + firstVehicle + '车—第' + lastVehicle + '车',
    sheetNames: numbered.map(function (item) { return text(item.sheetName); }),
    vehicleCount: numbered.length,
    firstVehicleNumber: firstVehicle,
    lastVehicleNumber: lastVehicle,
    duplicatePackageCount: duplicatePackageCount,
    headerRow: 0,
    rowCount: numbered.reduce(function (sum, item) { return sum + Number(item.rowCount || 0); }, 0),
    packageCount: packages.length,
    detailLineCount: numbered.reduce(function (sum, item) { return sum + Number(item.detailLineCount || 0); }, 0),
    classifiedCount: packages.filter(function (item) { return item.stageIndex > 0; }).length,
    unmatchedCount: packages.filter(function (item) { return !item.stageIndex; }).length,
    stageSummaries: packageSummary(packages),
    packages: packages
  };
}

function selectParsedSheet(parsedSheets, fileName, importType) {
  var candidates = (parsedSheets || []).filter(function (item) { return item && item.packageCount > 0; });
  if (!candidates.length) throw new Error('工作簿中没有可识别的到货清单');
  if (importType === 'arrival') {
    // Shipping workbooks are cumulative: “第41车” commonly contains sheets
    // 1—41. Import every populated vehicle sheet, not only the latest tab.
    var combined = combineArrivalSheets(candidates, fileName);
    if (combined) return combined;
    var numbered = candidates.filter(function (item) { return vehicleNumber(item.sheetName) > 0; });
    if (numbered.length) return numbered.sort(function (a, b) { return vehicleNumber(b.sheetName) - vehicleNumber(a.sheetName); })[0];
  }
  return candidates.sort(function (a, b) { return b.packageCount - a.packageCount; })[0];
}

module.exports = { STAGES: STAGES, parseMatrix: parseMatrix, classifyPackage: classifyPackage, selectParsedSheet: selectParsedSheet, combineArrivalSheets: combineArrivalSheets };
