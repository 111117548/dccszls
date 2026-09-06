var EXPECTED_API_VERSION = 'arrival-manifest-cumulative-v3-stages';

function friendlyError(error) {
  var message = error && (error.errMsg || error.message) || '清单处理失败，请稍后重试';
  if (/FUNCTIONS_TIME_LIMIT|timed out|timeout/i.test(message)) return '清单解析超时，请确认 arrival-manifest 云函数已部署，并将执行超时设置为 60 秒。';
  if (/not found|-501000/i.test(message)) return '未找到清单解析云函数，请先部署 arrival-manifest。';
  return message;
}

function chooseFile() {
  return new Promise(function (resolve, reject) {
    if (typeof wx.chooseMessageFile !== 'function') {
      var unsupported = new Error('当前环境不能选择聊天文件，请使用微信真机打开小程序。');
      unsupported.code = 'UNSUPPORTED';
      reject(unsupported);
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xls', 'xlsx'],
      success: function (result) {
        var file = result.tempFiles && result.tempFiles[0];
        if (!file) return reject(new Error('没有选择文件'));
        if (!/\.xlsx?$/i.test(file.name || '')) return reject(new Error('请选择 xls 或 xlsx 文件'));
        if (Number(file.size || 0) > 15 * 1024 * 1024) return reject(new Error('清单不能超过 15MB'));
        file.path = file.path || file.tempFilePath;
        if (!file.path) return reject(new Error('无法读取所选文件，请重新选择'));
        resolve(file);
      },
      fail: function (error) {
        var message = error && error.errMsg || '';
        var wrapped = new Error(message || '未能打开文件选择器');
        if (/cancel/i.test(message)) wrapped.code = 'CANCEL';
        else if (/privacy|agreement|scope is not declared/i.test(message)) wrapped.code = 'PRIVACY';
        else if (/devtools|not support|unsupported/i.test(message)) wrapped.code = 'UNSUPPORTED';
        reject(wrapped);
      }
    });
  });
}

function chooseAndParse(options) {
  options = options || {};
  var type = options.type === 'arrival' ? 'arrival' : 'demand';
  var context = options.context || {};
  var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
  return chooseFile().then(function (file) {
    var safeName = String(file.name || 'manifest.xls').replace(/[^a-zA-Z0-9._-]/g, '_');
    var projectId = context.project && context.project.id || 'project';
    var deviceId = context.device && context.device.id || 'device';
    var cloudPath = ['arrival-imports', projectId, deviceId, type + '-' + Date.now() + '-' + safeName].join('/');
    onProgress('正在上传清单…');
    return wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: file.path }).then(function (uploaded) {
      onProgress(type === 'arrival' ? '正在识别箱号并归入部件…' : '正在识别箱号与部件明细…');
      return wx.cloud.callFunction({
        name: 'arrival-manifest',
        data: { action: 'parse', fileID: uploaded.fileID, fileName: file.name, importType: type }
      });
    });
  }).then(function (response) {
    var parsed = response && response.result || {};
    if (parsed.apiVersion !== EXPECTED_API_VERSION) {
      var outdated = new Error('云端到货清单解析函数仍是旧版本。请重新上传并部署 arrival-manifest，选择“云端安装依赖”，再重新导入。');
      outdated.code = 'ARRIVAL_DEPLOYMENT_OUTDATED';
      throw outdated;
    }
    if (!parsed.success) throw new Error(parsed.error || '清单解析失败');
    return parsed;
  });
}

function showPickerError(error, purpose) {
  if (error && error.code === 'CANCEL') {
    wx.showToast({ title: '已取消选择', icon: 'none' });
    return;
  }
  if (error && error.code === 'PRIVACY') {
    wx.showModal({
      title: '需要补充隐私保护指引',
      content: '请小程序管理员登录微信公众平台，在“设置 → 服务内容声明 → 用户隐私保护指引”中新增“选择聊天中的文件”，用途填写“用于导入项目设备需求清单和实际到货清单”。提交并生效后即可选择 Excel 文件。',
      showCancel: false
    });
    return;
  }
  if (error && error.code === 'UNSUPPORTED') {
    wx.showModal({
      title: '未能打开文件选择器',
      content: '请使用微信真机预览，并先把 Excel ' + (purpose || '清单') + '发送到微信聊天或文件传输助手，再重新选择。',
      showCancel: false
    });
    return;
  }
  wx.showModal({ title: '导入失败', content: friendlyError(error), showCancel: false });
}

module.exports = {
  EXPECTED_API_VERSION: EXPECTED_API_VERSION,
  chooseAndParse: chooseAndParse,
  friendlyError: friendlyError,
  showPickerError: showPickerError
};
