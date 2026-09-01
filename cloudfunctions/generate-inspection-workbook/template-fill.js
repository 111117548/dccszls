const JSZip = require('jszip');

const SHEET_COUNT = 9;
const TEMPLATE_VERSION = 'original-xls-9-sheets-v1';

const FORM_MAP = {
  'annex-1': {
    sheet: '附表1', dateCell: 'A2',
    groups: {
      elevation: series(['a','b','c','d','e','f','g','h','i','j'], ['C25','D25','E25','F25','G25','H25','I25','J25','K25','L25']),
      diagonal: series(['ag','fb','bh','cg','ci','dh','dj','ie'], ['C27','D27','E27','F27','G27','H27','I27','J27']),
      verticality: series(['a','b','c','d','e','f','g','h','i','j'], ['C28','D28','E28','F28','G28','H28','I28','J28','K28','L28'])
    },
    result: { pass: 'C29', fail: 'Q29' }
  },
  'annex-2': {
    sheet: '附表2', dateCell: 'A2',
    groups: {
      opening: series(['ab','ac','bd','cd','eg','ef','fh','hg','ik','ij','lk','lj','mo','mn','pn','po','qs','qr','tr','ts'], cells('C25', 20)),
      diagonal: series(['ad','cb','eh','gf','il','kj','mp','on','qt','sr','ux','wv'], cells('C27', 12))
    },
    result: { pass: 'C28', fail: 'Q28' }
  },
  'annex-3': {
    sheet: '附表3', dateCell: 'A2',
    groups: {
      straightness: series(['ac','bd','eg','fh','ik','jl','mo','np','qs','rt','uw','nx'], ['C25','D25','F25','G25','I25','J25','L25','M25','O25','P25','R25','S25']),
      rectangle: series(['ab','ac','bd','cd','eg','ef','fh','hg','ik','ij','lk','lj','mo','mn','pn','po','qs','qr','tr','ts'], cells('C27', 20)),
      diagonal: series(['ad','cb','eh','gf','il','kj','mp','on','qt','sr','ux','wv'], cells('C29', 12))
    },
    result: { pass: 'C30', fail: 'Q30' }
  },
  'annex-4': {
    sheet: '附表4', dateCell: 'AS3', dateLabel: '检查日期',
    groups: {
      elevation: series(['a','b','c','d','e','f','g','h','i'], ['F34','I34','L34','O34','R34','U34','X34','AA34','AD34']),
      level: series(['a','b','c','d','e','f','g','h','i'], ['F35','I35','L35','O35','R35','U35','X35','AA35','AD35']),
      diagonal: series(["aa'-bb'","cc'-dd'","ee'-ff'","gg'-hh'","ii'-jj'","kk'-ll'","nn'-mm'","oo'-pp'"], ['F37','K37','P37','U37','Z37','AE37','AJ37','AO37'])
    },
    result: { pass: 'F38', fail: 'AG38' }
  },
  'annex-5': {
    sheet: '附表5', dateCell: 'A3',
    groups: {
      'insulator-level': series(['A','B','C','D','E','F','G','H'], ['H29','I29','J29','K29','L29','M29','N29','O29'])
    },
    result: { pass: 'D30', fail: 'N30' }
  },
  'annex-6': {
    sheet: '附表6', dateCell: 'A3',
    groups: {
      'cathode-beam-level': series(['a','b','c','d','e','f'], ['E31','G31','I31','K31','M31','O31'])
    },
    result: { pass: 'F32', fail: 'O32' }
  },
  'annex-7': {
    sheet: '附表7',
    fields: [
      { dateCell: 'J3', startRow: 10, result: { pass: 'D40', fail: 'I40' } },
      { dateCell: 'J49', startRow: 56, result: { pass: 'D86', fail: 'I86' } },
      { dateCell: 'J98', startRow: 105, result: { pass: 'D135', fail: 'I135' } },
      { dateCell: 'J147', startRow: 154, result: { pass: 'D184', fail: 'I184' } }
    ],
    matrixColumns: ['inletUpperSame','inletUpperFront','inletUpperRear','inletLowerSame','inletLowerFront','inletLowerRear','outletUpperSame','outletUpperFront','outletUpperRear','outletLowerSame','outletLowerFront','outletLowerRear']
  }
};

function series(keys, refs) {
  const result = {};
  keys.forEach((key, index) => { result[key] = refs[index]; });
  return result;
}

function columnToNumber(column) {
  let number = 0;
  for (let index = 0; index < column.length; index += 1) number = number * 26 + column.charCodeAt(index) - 64;
  return number;
}

function numberToColumn(number) {
  let output = '';
  while (number > 0) {
    number -= 1;
    output = String.fromCharCode(65 + (number % 26)) + output;
    number = Math.floor(number / 26);
  }
  return output;
}

function cells(startRef, count) {
  const match = /^([A-Z]+)(\d+)$/.exec(startRef);
  const startColumn = columnToNumber(match[1]);
  const row = match[2];
  return Array.from({ length: count }, (_, index) => numberToColumn(startColumn + index) + row);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isEmpty(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function normalizeValue(value) {
  if (typeof value === 'number') return { type: 'number', value: value };
  const text = String(value == null ? '' : value).trim();
  if (/^-?(?:\d+|\d*\.\d+)$/.test(text) && !/^0\d+/.test(text)) return { type: 'number', value: Number(text) };
  return { type: 'string', value: text };
}

function cellXml(ref, attributes, value) {
  const cleanAttributes = String(attributes || '')
    .replace(/\s+r="[^"]*"/g, '')
    .replace(/\s+t="[^"]*"/g, '')
    .replace(/\s*\/$/, '');
  const normalized = normalizeValue(value);
  if (normalized.type === 'number') return `<c r="${ref}"${cleanAttributes} t="n"><v>${normalized.value}</v></c>`;
  const text = escapeXml(normalized.value);
  const preserve = /^\s|\s$/.test(normalized.value) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${cleanAttributes} t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
}

function setCellValue(xml, ref, value) {
  if (isEmpty(value)) return xml;
  const refPattern = escapeRegExp(ref);
  const pattern = new RegExp(`<c\\b(?=[^>]*\\br="${refPattern}")(?:[^>]*/>|[^>]*>[\\s\\S]*?<\\/c>)`);
  const match = pattern.exec(xml);
  if (match) {
    const opening = /^<c\b([^>]*)/.exec(match[0]);
    return xml.slice(0, match.index) + cellXml(ref, opening ? opening[1] : '', value) + xml.slice(match.index + match[0].length);
  }
  const rowNumber = /\d+$/.exec(ref)[0];
  const rowPattern = new RegExp(`(<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  if (!rowPattern.test(xml)) throw new Error(`模板中找不到行 ${rowNumber}，无法写入 ${ref}`);
  return xml.replace(rowPattern, function (_, open, body, close) {
    return open + body + cellXml(ref, '', value) + close;
  });
}

function formatDate(dateText, label) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(dateText || ''));
  if (!match) return '';
  return `${label || '检验日期'}：${match[1]}.${String(match[2]).padStart(2, '0')}.${String(match[3]).padStart(2, '0')}`;
}

function applyResult(updates, resultCells, result) {
  if (!resultCells || !result) return;
  updates[resultCells.pass] = result === '符合' ? '√  符合' : '符合';
  updates[resultCells.fail] = result === '不符合' ? '√  不符合' : '不符合';
}

function addFormUpdates(updatesBySheet, formId, record) {
  const mapping = FORM_MAP[formId];
  if (!mapping || !record) return;
  const updates = updatesBySheet[mapping.sheet] || (updatesBySheet[mapping.sheet] = {});

  if (mapping.dateCell) {
    const dateText = formatDate(record.inspectionDate, mapping.dateLabel);
    if (dateText) updates[mapping.dateCell] = dateText;
  }

  Object.keys(mapping.groups || {}).forEach((groupId) => {
    const groupValues = record.values && record.values[groupId] || {};
    const cellMap = mapping.groups[groupId];
    Object.keys(cellMap).forEach((code) => {
      if (!isEmpty(groupValues[code])) updates[cellMap[code]] = groupValues[code];
    });
  });

  if (mapping.fields) {
    mapping.fields.forEach((field, fieldIndex) => {
      const dateText = formatDate(record.inspectionDate, '检查日期');
      if (dateText) updates[field.dateCell] = dateText;
      const rows = record.matrixValues && record.matrixValues['field' + (fieldIndex + 1)] || [];
      rows.forEach((row, rowIndex) => {
        const targetRow = field.startRow + rowIndex;
        mapping.matrixColumns.forEach((columnId, columnIndex) => {
          if (!isEmpty(row[columnId])) updates[numberToColumn(columnIndex + 2) + targetRow] = row[columnId];
        });
      });
      applyResult(updates, field.result, record.result);
    });
  } else {
    applyResult(updates, mapping.result, record.result);
  }
}

function normalizeSheetPath(target) {
  const clean = String(target || '').replace(/^\//, '');
  if (clean.indexOf('xl/') === 0) return clean;
  return 'xl/' + clean.replace(/^\.\//, '');
}

async function sheetPaths(zip) {
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const relationships = {};
  relsXml.replace(/<Relationship\b([^>]*)\/>/g, function (_, attrs) {
    const id = /\bId="([^"]+)"/.exec(attrs);
    const target = /\bTarget="([^"]+)"/.exec(attrs);
    if (id && target) relationships[id[1]] = normalizeSheetPath(decodeXml(target[1]));
    return _;
  });
  const paths = {};
  workbookXml.replace(/<sheet\b([^>]*)\/>/g, function (_, attrs) {
    const name = /\bname="([^"]+)"/.exec(attrs);
    const relId = /\br:id="([^"]+)"/.exec(attrs);
    if (name && relId && relationships[relId[1]]) paths[decodeXml(name[1])] = relationships[relId[1]];
    return _;
  });
  return paths;
}

async function fillOriginalWorkbook(templateBuffer, payload) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const paths = await sheetPaths(zip);
  const updatesBySheet = {};
  const entries = payload.entries || [];
  entries.forEach((entry) => {
    const formId = entry.formId || entry.form && entry.form.id || entry.record && entry.record.formId;
    addFormUpdates(updatesBySheet, formId, entry.record);
  });

  const project = payload.project || {};
  const device = payload.device || {};
  const cover = updatesBySheet['封面'] || (updatesBySheet['封面'] = {});
  if (!isEmpty(project.name)) cover.F13 = project.name;
  if (!isEmpty(device.name)) cover.F14 = device.name;
  const exportDate = payload.exportDate || new Date().toISOString().slice(0, 10);
  const coverDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(exportDate);
  if (coverDate) cover.F17 = `${coverDate[1]}年${coverDate[2]}月${coverDate[3]}日`;

  for (const sheetName of Object.keys(updatesBySheet)) {
    const sheetPath = paths[sheetName];
    if (!sheetPath || !zip.file(sheetPath)) throw new Error(`原表缺少工作表：${sheetName}`);
    let xml = await zip.file(sheetPath).async('string');
    Object.keys(updatesBySheet[sheetName]).forEach((ref) => {
      xml = setCellValue(xml, ref, updatesBySheet[sheetName][ref]);
    });
    zip.file(sheetPath, xml);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

module.exports = {
  FORM_MAP,
  SHEET_COUNT,
  TEMPLATE_VERSION,
  fillOriginalWorkbook,
  setCellValue
};
