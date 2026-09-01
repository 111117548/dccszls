const cloud = require('wx-server-sdk');
const XLSX = require('xlsx');
const parser = require('./parser');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function chooseSheet(workbook) {
  var best = null;
  (workbook.SheetNames || []).forEach(function (name) {
    var sheet = workbook.Sheets[name];
    var matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false });
    try {
      var parsed = parser.parseMatrix(matrix, name);
      if (!best || parsed.packageCount > best.packageCount) best = parsed;
    } catch (error) {}
  });
  if (!best) throw new Error('工作簿中没有可识别的到货清单');
  return best;
}

exports.main = async function (event) {
  try {
    if (!event || event.action !== 'parse' || !event.fileID) throw new Error('缺少待解析的清单文件');
    var download = await cloud.downloadFile({ fileID: String(event.fileID) });
    var buffer = download.fileContent;
    if (!buffer || !buffer.length) throw new Error('清单文件为空');
    if (buffer.length > 15 * 1024 * 1024) throw new Error('单个清单不能超过15MB');
    var workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });
    var result = chooseSheet(workbook);
    result.success = true;
    result.fileID = String(event.fileID);
    result.fileName = String(event.fileName || '到货清单');
    result.importType = event.importType === 'arrival' ? 'arrival' : 'demand';
    return result;
  } catch (error) {
    console.error('[arrival-manifest]', error);
    return { success: false, error: error && error.message || String(error), code: 'ARRIVAL_MANIFEST_PARSE_FAILED' };
  }
};
