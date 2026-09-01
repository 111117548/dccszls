var FUNCTION_NAME = 'feishu-auth';

function serviceError(message, code) {
  var error = new Error(message || '飞书身份服务请求失败');
  error.code = code || '';
  return error;
}

function normalizeCloudError(error) {
  var raw = String(error && (error.errMsg || error.message) || '');
  if (/-501000|FUNCTION_NOT_FOUND|FunctionName parameter could not be found/i.test(raw)) {
    return serviceError('云端尚未部署 feishu-auth 身份服务。请先上传并部署该云函数，然后重新检测。', 'FUNCTION_NOT_FOUND');
  }
  if (/FEISHU_OAUTH_REDIRECT_URI|未配置.*OAuth.*回调/i.test(raw)) {
    return serviceError('飞书身份服务已部署，但尚未配置 OAuth 回调地址。', 'OAUTH_NOT_CONFIGURED');
  }
  return serviceError(raw || '无法连接飞书身份服务', String(error && error.code || ''));
}

function call(action, data) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud || !wx.cloud.callFunction) { reject(new Error('云能力不可用')); return; }
    wx.cloud.callFunction({
      name: FUNCTION_NAME,
      data: Object.assign({ action: action }, data || {}),
      success: function (res) {
        var result = res.result || {};
        if (result.success === false) reject(normalizeCloudError(serviceError(result.error, result.code)));
        else resolve(result);
      },
      fail: function (error) {
        reject(normalizeCloudError(error));
      }
    });
  });
}

module.exports = {
  status: function () { return call('status'); },
  bindByPhone: function (phoneCode) { return call('bindByPhone', { phoneCode: phoneCode }); },
  getAuthUrl: function () { return call('getAuthUrl'); },
  exchangeCode: function (code, state) { return call('exchangeCode', { code: code, state: state }); },
  unbind: function () { return call('unbind'); }
};
