var FUNCTION_NAME = 'notification-center';

function call(action, payload) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error('云能力不可用'));
      return;
    }
    wx.cloud.callFunction({
      name: FUNCTION_NAME,
      data: { action: action, payload: payload || {} },
      success: function (res) {
        var result = res.result || {};
        if (result.success === false) {
          var error = new Error(result.error || '提醒服务暂不可用');
          error.code = result.code || '';
          reject(error);
          return;
        }
        resolve(result);
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '提醒服务连接失败'));
      }
    });
  });
}

function getSettings(projectId) {
  return call('getSettings', { projectId: projectId });
}

function register(projectId, type, templateId, options) {
  return call('register', {
    projectId: projectId,
    type: type,
    templateId: templateId,
    options: options || {}
  });
}

function disable(projectId, type) {
  return call('disable', { projectId: projectId, type: type });
}

module.exports = {
  getSettings: getSettings,
  register: register,
  disable: disable
};
