const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  SHEET_COUNT,
  TEMPLATE_VERSION,
  fillOriginalWorkbook
} = require('./template-fill');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TEMPLATE_PATH = path.join(__dirname, 'templates', '电除尘器本体安装检查记录-原表.xlsx');

function safeText(value, max) {
  return String(value == null ? '' : value).slice(0, max || 1000);
}

function safeName(value) {
  return safeText(value, 80).replace(/[\\/:*?"<>|]/g, '_');
}

// Cloud storage signatures are calculated from the object path. Some older
// wx-server-sdk versions fail to sign paths containing CJK characters
// consistently, so storage object names must stay ASCII-only. The Chinese
// workbook name is still returned separately to the mini program.
function storageToken(value, fallback) {
  const source = safeText(value, 160);
  const ascii = source
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (ascii) return ascii;
  return (fallback || 'item') + '-' + crypto.createHash('sha1').update(source || fallback || 'item').digest('hex').slice(0, 12);
}

function normalizeEntries(event) {
  if (event.batch) return (event.entries || []).filter((entry) => entry && entry.record && entry.record.id);
  const form = event.form || {};
  const record = event.record || {};
  if (!form.id || !record.id) throw new Error('缺少检验附表数据');
  return [{ formId: form.id, form: form, record: record }];
}

function contextFrom(event, entries) {
  if (event.batch) return { project: event.project || {}, device: event.device || {} };
  const record = entries[0].record || {};
  return {
    project: { id: record.projectId || '', name: record.projectName || '' },
    device: { id: record.deviceId || '', name: record.deviceName || '' }
  };
}

exports.main = async function (event) {
  try {
    const templateReady = fs.existsSync(TEMPLATE_PATH);
    if (event.action === 'status') {
      return {
        success: true,
        ready: templateReady,
        templateReady: templateReady,
        templateVersion: TEMPLATE_VERSION,
        sheetCount: SHEET_COUNT,
        fileType: 'xlsx'
      };
    }
    if (!templateReady) throw new Error('原始检查记录模板未随云函数部署，请重新上传并部署云端依赖');

    const entries = normalizeEntries(event);
    if (!entries.length) throw new Error('没有可回填的检验记录');
    const context = contextFrom(event, entries);
    const template = fs.readFileSync(TEMPLATE_PATH);
    const buffer = await fillOriginalWorkbook(template, {
      entries: entries,
      project: context.project,
      device: context.device,
      exportDate: new Date().toISOString().slice(0, 10)
    });

    const baseName = safeName(
      (context.project.name || '项目') + '_' +
      (context.device.name || '设备') + '_电除尘器本体安装检查记录'
    );
    const fileName = baseName + '.xlsx';
    const cloudPath = [
      'process-inspection',
      storageToken(context.project.id || context.project.name, 'project'),
      storageToken(context.device.id || context.device.name, 'device'),
      Date.now() + '-inspection-workbook.xlsx'
    ].join('/');
    try {
      const upload = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: buffer });
      return {
        success: true,
        fileID: upload.fileID,
        fileName: fileName,
        fileType: 'xlsx',
        sheetCount: SHEET_COUNT,
        templateVersion: TEMPLATE_VERSION
      };
    } catch (uploadError) {
      // A generated workbook is small enough to return directly. This keeps
      // field exports usable when Cloud Storage is unavailable or its request
      // signature is rejected by the current environment.
      console.warn('[generate-inspection-workbook] cloud upload failed, using direct payload', uploadError);
      return {
        success: true,
        fileID: '',
        fileBase64: buffer.toString('base64'),
        storageFallback: true,
        fileName: fileName,
        fileType: 'xlsx',
        sheetCount: SHEET_COUNT,
        templateVersion: TEMPLATE_VERSION
      };
    }
  } catch (error) {
    console.error('[generate-inspection-workbook]', error);
    return { success: false, error: error.message || String(error) };
  }
};
