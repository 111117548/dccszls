// Offline SpreadsheetML exporter used only when the exact-template cloud
// function is unavailable. Excel/WPS can open the generated .xls workbook.
function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeFileName(value) {
  return String(value || '施工检验记录').replace(/[\\/:*?"<>|]/g, '_').slice(0, 90);
}

function safeSheetName(value, index) {
  return String(value || ('附表' + (index + 1))).replace(/[\\/:*?\[\]]/g, '_').slice(0, 31);
}

function cell(value, style, mergeAcross) {
  var merge = mergeAcross > 0 ? ' ss:MergeAcross="' + mergeAcross + '"' : '';
  return '<Cell ss:StyleID="' + (style || 'Body') + '"' + merge + '><Data ss:Type="String">' +
    escapeXml(value) + '</Data></Cell>';
}

function row(cells, height) {
  return '<Row' + (height ? ' ss:Height="' + height + '"' : '') + '>' + cells.join('') + '</Row>';
}

function getGroupValue(record, groupId, code) {
  return record.values && record.values[groupId] ? record.values[groupId][code] || '' : '';
}

function getMatrixValue(record, field, channel, columnId) {
  var rows = record.matrixValues && record.matrixValues['field' + field] || [];
  for (var i = 0; i < rows.length; i++) {
    if (Number(rows[i].channel) === Number(channel)) return rows[i][columnId] || '';
  }
  return '';
}

function buildCommonHeader(form, record, columnCount) {
  var rows = [];
  rows.push(row([cell(form.title || form.sheetName, 'Title', columnCount - 1)], 34));
  rows.push(row([cell('项目名称：' + (record.projectName || ''), 'Meta', columnCount - 1)]));
  rows.push(row([cell('设备名称：' + (record.deviceName || ''), 'Meta', columnCount - 1)]));
  rows.push(row([cell('检验日期：' + (record.inspectionDate || '') + '　检验室：' + (record.chamber || '') + '　记录编号：' + (record.id || ''), 'Meta', columnCount - 1)]));
  rows.push(row([cell('检验项目：' + (form.inspectionItem || ''), 'Wrap', columnCount - 1)], 36));
  rows.push(row([cell('质量标准：' + (form.qualityStandard || ''), 'Wrap', columnCount - 1)], 48));
  return rows;
}

function buildGroupSheet(form, record) {
  var columnCount = 8;
  var rows = buildCommonHeader(form, record, columnCount);
  (form.groups || []).forEach(function (group) {
    rows.push(row([cell(group.name + '（单位：' + (group.unit || 'mm') + '）', 'Section', columnCount - 1)]));
    var codes = group.codes || [];
    for (var offset = 0; offset < codes.length; offset += 4) {
      var cells = [];
      codes.slice(offset, offset + 4).forEach(function (code) {
        cells.push(cell(code, 'Label'));
        cells.push(cell(getGroupValue(record, group.id, code), 'Input'));
      });
      while (cells.length < columnCount) cells.push(cell('', 'Body'));
      rows.push(row(cells, 24));
    }
  });
  rows.push(row([cell('检查结果：' + (record.result || '未填写'), 'Meta', 3), cell('备注：' + (record.remarks || ''), 'Wrap', 3)], 38));
  rows.push(row([cell('安装负责人签字：________________', 'Signature', 3), cell('检查人员签字：________________', 'Signature', 3)], 32));
  var columns = '';
  for (var i = 0; i < 4; i++) columns += '<Column ss:Width="58"/><Column ss:Width="82"/>';
  return { columns: columns, rows: rows.join('') };
}

function buildMatrixSheet(form, record) {
  var matrix = form.matrix || { fieldCount: 4, channelCount: 30, columns: [] };
  var columnCount = 1 + matrix.columns.length;
  var rows = buildCommonHeader(form, record, columnCount);
  for (var field = 1; field <= matrix.fieldCount; field++) {
    rows.push(row([cell('第' + field + '电场极距检查记录', 'Section', columnCount - 1)]));
    var headerCells = [cell('通道', 'Header')];
    matrix.columns.forEach(function (column) { headerCells.push(cell(column.name, 'Header')); });
    rows.push(row(headerCells, 52));
    for (var channel = 1; channel <= matrix.channelCount; channel++) {
      var dataCells = [cell(channel, 'Label')];
      matrix.columns.forEach(function (column) {
        dataCells.push(cell(getMatrixValue(record, field, channel, column.id), 'Input'));
      });
      rows.push(row(dataCells, 22));
    }
  }
  rows.push(row([cell('检查结果：' + (record.result || '未填写'), 'Meta', 5), cell('备注：' + (record.remarks || ''), 'Wrap', Math.max(0, columnCount - 7))], 38));
  rows.push(row([cell('安装负责人签字：________________', 'Signature', 5), cell('检查人员签字：________________', 'Signature', Math.max(0, columnCount - 7))], 32));
  var columns = '<Column ss:Width="46"/>';
  matrix.columns.forEach(function () { columns += '<Column ss:Width="72"/>'; });
  return { columns: columns, rows: rows.join('') };
}

function buildWorkbook(entries) {
  var styles =
    '<Styles>' +
      '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="宋体" ss:Size="10"/></Style>' +
      '<Style ss:ID="Body"><Alignment ss:Vertical="Center" ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>' +
      '<Style ss:ID="Title" ss:Parent="Body"><Alignment ss:Vertical="Center" ss:Horizontal="Center"/><Font ss:FontName="宋体" ss:Size="16" ss:Bold="1"/></Style>' +
      '<Style ss:ID="Meta" ss:Parent="Body"><Alignment ss:Vertical="Center" ss:Horizontal="Left"/></Style>' +
      '<Style ss:ID="Wrap" ss:Parent="Meta"><Alignment ss:Vertical="Center" ss:Horizontal="Left" ss:WrapText="1"/></Style>' +
      '<Style ss:ID="Section" ss:Parent="Body"><Font ss:FontName="宋体" ss:Size="11" ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="Header" ss:Parent="Body"><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1"/><Font ss:FontName="宋体" ss:Bold="1"/><Interior ss:Color="#E7E6E6" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="Label" ss:Parent="Body"><Interior ss:Color="#F2F6F9" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="Input" ss:Parent="Body"><Font ss:FontName="宋体" ss:Color="#0066CC"/></Style>' +
      '<Style ss:ID="Signature" ss:Parent="Meta"><Font ss:FontName="宋体" ss:Size="10"/></Style>' +
    '</Styles>';
  var worksheets = (entries || []).map(function (entry, index) {
    var form = entry.form || {};
    var record = entry.record || {};
    var content = form.matrix ? buildMatrixSheet(form, record) : buildGroupSheet(form, record);
    return '<Worksheet ss:Name="' + escapeXml(safeSheetName(form.sheetName, index)) + '"><Table>' +
      content.columns + content.rows +
      '</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Selected/><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>';
  }).join('');
  return '\ufeff<?xml version="1.0" encoding="UTF-8"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    styles + worksheets + '</Workbook>';
}

function exportWorkbook(entries, project, device) {
  return new Promise(function (resolve, reject) {
    try {
      var fileName = safeFileName((project && project.name || '项目') + '_' + (device && device.name || '设备') + '_施工检验记录_兼容版') + '.xls';
      var filePath = wx.env.USER_DATA_PATH + '/' + fileName;
      wx.getFileSystemManager().writeFile({
        filePath: filePath,
        data: buildWorkbook(entries),
        encoding: 'utf8',
        success: function () { resolve({ filePath: filePath, fileName: fileName, fileType: 'xls' }); },
        fail: function (err) { reject(new Error(err.errMsg || '本地Excel文件写入失败')); }
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildWorkbook: buildWorkbook, exportWorkbook: exportWorkbook };
