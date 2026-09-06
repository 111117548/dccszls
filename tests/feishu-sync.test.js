var assert = require('assert');

var calls = [];
global.wx = {
  getStorageSync: function () { return null; },
  setStorageSync: function () {},
  removeStorageSync: function () {},
  cloud: {
    callFunction: function (options) {
      calls.push(options.data.action);
      if (options.data.action === 'status') {
        options.success({ result: { success: true, apiVersion: 'feishu-user-visible-projects-v11' } });
      } else {
        options.fail({ errMsg: 'cloud.callFunction:fail errCode: -504003 Invoking task timed out after 30 seconds' });
      }
    }
  }
};

var client = require('../utils/feishu-rectification.js');

client.pullTasks({ feishuProjectName: '固原项目', feishuDeviceName: '1#' }, { forceRefresh: true }).then(function () {
  throw new Error('timeout should reject');
}).catch(function (error) {
  assert.strictEqual(error.code, 'FEISHU_DEPLOYMENT_OUTDATED');
  assert.ok(/旧版本/.test(error.message));
  assert.deepStrictEqual(calls, ['pullTasks', 'status']);
  console.log(JSON.stringify({ diagnosed: error.code, calls: calls }, null, 2));
});
