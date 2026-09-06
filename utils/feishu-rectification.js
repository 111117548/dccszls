var FUNCTION_NAME = 'feishu-rectification';
var EXPECTED_API_VERSION = 'feishu-user-visible-projects-v14-evidence-source';
// Permission labels are part of this cache. Bump the key whenever the
// server-side permission source changes so an old “仅查看” result cannot
// survive a newly deployed permission fix.
var PROJECT_CACHE_KEY = 'esp_feishu_project_catalog_v6';
var TASK_CACHE_KEY = 'esp_feishu_task_cache_v6';
var PROJECT_CACHE_TTL = 10 * 60 * 1000;
var PROJECT_STALE_TTL = 24 * 60 * 60 * 1000;
var TASK_CACHE_TTL = 2 * 60 * 1000;
var TASK_STALE_TTL = 24 * 60 * 60 * 1000;
var TASK_CACHE_LIMIT = 6;
var projectInFlight = null;
var taskInFlight = {};
var taskCache = {};

function now() { return Date.now(); }

function cloneWithCacheFlag(value) {
  return Object.assign({}, value || {}, { fromClientCache: true, durationMs: 0 });
}

function readProjectCache(maxAge) {
  try {
    var item = wx.getStorageSync(PROJECT_CACHE_KEY);
    return item && item.at && now() - item.at < maxAge ? item : null;
  } catch (error) {
    return null;
  }
}

function writeProjectCache(value) {
  try { wx.setStorageSync(PROJECT_CACHE_KEY, { at: now(), value: value }); } catch (error) {}
}

function projectTaskKey(project) {
  project = project || {};
  return [
    String(project.feishuProjectName || '').trim(),
    String(project.feishuDeviceName || '').trim()
  ].join('|');
}

function readTaskCache(key) {
  try {
    var stored = wx.getStorageSync(TASK_CACHE_KEY) || {};
    return stored[key] || null;
  } catch (error) {
    return null;
  }
}

function writeTaskCache(key, item) {
  try {
    var stored = wx.getStorageSync(TASK_CACHE_KEY) || {};
    stored[key] = item;
    var keys = Object.keys(stored).sort(function (a, b) {
      return Number(stored[b] && stored[b].at || 0) - Number(stored[a] && stored[a].at || 0);
    });
    keys.slice(TASK_CACHE_LIMIT).forEach(function (oldKey) { delete stored[oldKey]; });
    wx.setStorageSync(TASK_CACHE_KEY, stored);
  } catch (error) {}
}

function clearTaskCaches() {
  taskCache = {};
  try { wx.removeStorageSync(TASK_CACHE_KEY); } catch (error) {}
}

function clearCaches() {
  projectInFlight = null;
  clearTaskCaches();
  try { wx.removeStorageSync(PROJECT_CACHE_KEY); } catch (error) {}
}

function deploymentMessage(action, message, detail) {
  var text = String(message || '');
  if (Number(detail && detail.feishuCode) === 1254043 || /RecordIdNotFound/.test(text)) {
    return '当前飞书数据表中找不到这条质量问题，暂时无法读取说明和图片。请项目负责人核对原记录是否删除或迁移，并核对同步的数据表；确认后从质量检查台账重新同步任务。';
  }
  if ((detail && detail.code === 'FEISHU_REAUTH_REQUIRED') ||
      /Unsupported state or unable to authenticate data|授权凭证无法解密|密文格式无效/i.test(text)) {
    return '飞书登录凭证已失效或无法解密。请让管理员确认 feishu-auth 与 feishu-rectification 使用相同的 FEISHU_TOKEN_ENCRYPTION_KEY，然后进入“飞书账号认证”重新绑定。';
  }
  if (/-504003|FUNCTIONS_TIME_LIMIT_EXCEEDED|timed out after 3 seconds|task timed out/i.test(text)) {
    return '读取飞书超时，请稍后重试；若持续出现，请重新部署 feishu-rectification 云函数。';
  }
  if (action === 'listProjectOptions' && /不支持的飞书同步操作|listProjectOptions/i.test(text)) {
    return '云端 feishu-rectification 仍是旧版本。请在微信开发者工具中右键 cloudfunctions/feishu-rectification，选择“上传并部署：云端安装依赖”，部署完成后重新编译小程序。';
  }
  if ((action === 'listProjectOptions' || action === 'pullTasks') && detail &&
      (Number(detail.httpStatus) === 403 || Number(detail.feishuCode) === 99991672 || /Access denied|scope/i.test(text))) {
    return '当前飞书账号授权缺少多维表格读取权限。请确认 FEISHU_OAUTH_SCOPE 已包含多维表格读取权限，然后在小程序“飞书账号认证”页面重新绑定一次。';
  }
  if (detail && detail.stage === 'upload' && Number(detail.httpStatus) === 403) {
    return '当前绑定的飞书账号无权上传该项目的整改图片（HTTP 403）。请确认您是该项目负责人，且在多维表格中具有编辑权限。';
  }
  if (detail && detail.stage === 'update' && Number(detail.httpStatus) === 403) {
    return '当前绑定的飞书账号无权写入该项目的“闭环”附件列（HTTP 403）。请检查项目负责人与多维表格高级权限。';
  }
  return text || '飞书同步失败';
}

function call(action, data) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud || !wx.cloud.callFunction) { reject(new Error('云能力不可用')); return; }
    wx.cloud.callFunction({
      name: FUNCTION_NAME,
      data: Object.assign({ action: action }, data || {}),
      success: function (res) {
        var result = res.result || {};
        if (result.success === false) {
          var error = new Error(deploymentMessage(action, result.error, result));
          error.code = result.code || '';
          error.feishuCode = Number(result.feishuCode || 0);
          error.requestId = result.requestId || '';
          error.recordId = result.recordId || '';
          error.tableId = result.tableId || '';
          if (!error.code && error.feishuCode === 1254043) error.code = 'FEISHU_RECORD_NOT_FOUND';
          if (!error.code && /Unsupported state or unable to authenticate data|授权凭证无法解密|密文格式无效/i.test(String(result.error || ''))) {
            error.code = 'FEISHU_REAUTH_REQUIRED';
          }
          reject(error);
        } else resolve(result);
      },
      fail: function (err) {
        var rawMessage = (err && err.errMsg) || '飞书云函数连接失败';
        var isPlatformTimeout = /-504003|FUNCTIONS_TIME_LIMIT_EXCEEDED|timed out|task timed out/i.test(String(rawMessage));
        if ((action === 'pullTasks' || action === 'listProjectOptions') && isPlatformTimeout) {
          // A status call does not contact Feishu and can distinguish an old
          // deployment from a genuinely slow upstream request.
          wx.cloud.callFunction({
            name: FUNCTION_NAME,
            data: { action: 'status' },
            success: function (statusResponse) {
              var status = statusResponse && statusResponse.result || {};
              var message = status.apiVersion && status.apiVersion !== EXPECTED_API_VERSION
                ? '云端飞书同步函数仍是旧版本（' + status.apiVersion + '）。请重新上传并部署 feishu-rectification，选择“云端安装依赖”。'
                : '飞书接口本次响应超时。同步已与本地台账解耦，请稍后重试；若仍出现，请检查云函数执行超时是否至少为30秒。';
              var diagnosed = new Error(message);
              diagnosed.code = status.apiVersion === EXPECTED_API_VERSION ? 'FEISHU_UPSTREAM_TIMEOUT' : 'FEISHU_DEPLOYMENT_OUTDATED';
              reject(diagnosed);
            },
            fail: function () { reject(new Error(deploymentMessage(action, rawMessage))); }
          });
          return;
        }
        var error = new Error(deploymentMessage(action, rawMessage));
        if (/Unsupported state or unable to authenticate data/i.test(String(err && err.errMsg || ''))) {
          error.code = 'FEISHU_REAUTH_REQUIRED';
        }
        reject(error);
      }
    });
  });
}

function status() { return call('status'); }
function requestProjectOptions(forceRefresh) {
  var request = call('listProjectOptions', { forceRefresh: forceRefresh === true }).then(function (result) {
    writeProjectCache(result);
    return result;
  }).catch(function (error) {
    // A transient Feishu outage must not erase a catalog that was previously
    // loaded successfully. The UI can continue in read mode and retry later.
    var stale = readProjectCache(PROJECT_STALE_TTL);
    if (!stale) throw error;
    return Object.assign(cloneWithCacheFlag(stale.value), {
      staleClientCache: true,
      refreshError: String(error && error.message || '飞书项目列表刷新失败')
    });
  });
  projectInFlight = request.then(function (result) {
    projectInFlight = null;
    return result;
  }, function (error) {
    projectInFlight = null;
    throw error;
  });
  return projectInFlight;
}

function listProjectOptions(options) {
  options = options || {};
  if (!options.forceRefresh) {
    var cached = readProjectCache(PROJECT_CACHE_TTL);
    if (cached) return Promise.resolve(cloneWithCacheFlag(cached.value));
    if (projectInFlight) return projectInFlight;
    var stale = readProjectCache(PROJECT_STALE_TTL);
    if (stale) {
      requestProjectOptions(false).catch(function () {});
      return Promise.resolve(Object.assign(cloneWithCacheFlag(stale.value), {
        staleClientCache: true
      }));
    }
  }
  return requestProjectOptions(options.forceRefresh === true);
}

function pullTasks(project, options) {
  project = project || {};
  options = options || {};
  var key = projectTaskKey(project);
  var cached = taskCache[key];
  if (!cached) {
    cached = readTaskCache(key);
    if (cached) taskCache[key] = cached;
  }
  if (!options.forceRefresh && cached && now() - cached.at < TASK_CACHE_TTL) {
    return Promise.resolve(cloneWithCacheFlag(cached.value));
  }
  if (!options.forceRefresh && taskInFlight[key]) return taskInFlight[key];
  var request = call('pullTasks', { project: project, forceRefresh: options.forceRefresh === true }).then(function (result) {
    taskCache[key] = { at: now(), value: result };
    writeTaskCache(key, taskCache[key]);
    return result;
  }).catch(function (error) {
    var message = String(error && error.message || '');
    var canUseStale = cached && now() - Number(cached.at || 0) < TASK_STALE_TTL &&
      /-504003|FUNCTIONS_TIME_LIMIT_EXCEEDED|timed out|超时|network|socket|云函数连接失败/i.test(message);
    if (!canUseStale) throw error;
    return Object.assign(cloneWithCacheFlag(cached.value), {
      staleClientCache: true,
      refreshError: '飞书连接较慢，当前显示上次成功同步的整改台账'
    });
  });
  taskInFlight[key] = request.then(function (result) {
    delete taskInFlight[key];
    return result;
  }, function (error) {
    delete taskInFlight[key];
    throw error;
  });
  return taskInFlight[key];
}

function syncClosure(payload) {
  return call('syncClosure', { payload: payload || {} }).then(function (result) {
    clearTaskCaches();
    return result;
  });
}
function verifyClosure(payload) { return call('verifyClosure', { payload: payload || {} }); }
function getTaskEvidence(payload) {
  return call('getTaskEvidence', payload || {}).then(function (result) {
    if (!result.task || !result.task.recordId) {
      throw new Error('请重新上传并部署 feishu-rectification 云函数后，再刷新飞书内容');
    }
    return result;
  }).catch(function (error) {
    if (/不支持的飞书同步操作/.test(error.message || '')) {
      throw new Error('请重新上传并部署 feishu-rectification 云函数后，再刷新飞书内容');
    }
    throw error;
  });
}

module.exports = {
  status: status,
  listProjectOptions: listProjectOptions,
  pullTasks: pullTasks,
  syncClosure: syncClosure,
  verifyClosure: verifyClosure,
  getTaskEvidence: getTaskEvidence,
  clearCaches: clearCaches,
  EXPECTED_API_VERSION: EXPECTED_API_VERSION
};
