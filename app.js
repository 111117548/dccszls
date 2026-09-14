// app.js — ESP digital twin quality platform V3.0
var v3Data = require('./utils/v3-data.js');
var v4Foundation = require('./utils/v4-foundation.js');
var cloudLedger = require('./utils/cloud-ledger.js');
var feishuRectification = require('./utils/feishu-rectification.js');
var feishuAuth = require('./utils/feishu-auth.js');
var processForms = require('./utils/process-forms.js');

function sameFeishuValue(left, right) {
  return String(left == null ? '' : left).trim() === String(right == null ? '' : right).trim();
}

// A Feishu task is authoritative for its own basic fields.  The quality-ledger
// copy only carries the collaboration state (share token, evidence and review).
// Keeping a compact snapshot prevents an older local/cloud task from replacing
// a Feishu task's title, location or level after a later bootstrap.
function makeFeishuSnapshot(task, context) {
  var description = task.qualityIssue || task.description || '';
  var sourceImages = task.problemPhotos || task.sourceImages || [];
  var title = task.title || description || [task.location, task.category].filter(Boolean).join(' · ') || '飞书下发整改任务';
  return {
    title: title,
    description: description,
    qualityIssue: description,
    projectName: task.projectName || context.feishuProjectName || context.projectName || '',
    deviceName: task.deviceName || context.deviceName || '',
    location: task.location || '',
    category: task.category || '',
    level: task.level || '',
    positionCode: task.location || '',
    inspectionMethodName: '飞书整改通知',
    deadline: task.deadline || '',
    sourceImageFileID: (sourceImages[0] && sourceImages[0].url) || '',
    sourceImageLocal: '',
    sourceImages: sourceImages,
    problemPhotos: sourceImages,
    closureImages: task.closureImages || [],
    item: {
      defectId: 'FEISHU-' + task.recordId + '-ITEM-01',
      name: title,
      systemName: task.location || '',
      severity: task.level || '',
      level: task.level || '',
      description: description,
      suggestion: '',
      positionCode: task.location || ''
    }
  };
}

function applyFeishuSnapshot(order) {
  if (!order || !order.feishuRecordId || !order.feishuSnapshot) return order;
  var snapshot = order.feishuSnapshot;
  var normalized = Object.assign({}, order, {
    title: snapshot.title || order.title,
    deviceName: snapshot.deviceName || order.deviceName,
    positionCode: snapshot.positionCode || order.positionCode,
    inspectionMethodName: snapshot.inspectionMethodName || order.inspectionMethodName,
    deadline: snapshot.deadline || order.deadline,
    sourceImageFileID: snapshot.sourceImageFileID || '',
    sourceImageLocal: '',
    sourceImages: snapshot.sourceImages || snapshot.problemPhotos || order.sourceImages || [],
    problemPhotos: snapshot.problemPhotos || snapshot.sourceImages || order.problemPhotos || [],
    items: snapshot.item ? [Object.assign({}, snapshot.item)] : (order.items || []),
    defectIds: []
  });
  return normalized;
}

function isFeishuInvocationTimeout(error) {
  var message = String((error && (error.message || error.errMsg)) || error || '');
  return message.indexOf('-504003') !== -1 || /timed out|timeout/i.test(message);
}

App({
  globalData: {
    aiConfig: {
      provider: 'qwen',
      endpoint: 'https://ws-smrlevmcvvild23g.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      // Production credentials must be configured on the cloud side.
      model: 'qwen-vl-max',
      demoMode: true
    },
    historyRecords: [],
    checkStates: {},
    aiAnalysisCount: 0,
    selectedArea: null,
    // V2.0: Case library local caches
    falsePositives: [],
    missedDefects: [],
    // V2.0: Feature settings
    featureSettings: {
      autoAreaDetect: true,   // 自动识别照片部位
      qualityCheck: true       // 照片质量检测
    },
    // SRM is an external system. Configure either its Mini Program AppID or approved web URL.
    srmConfig: { miniProgramAppId: '', path: '', envVersion: 'release', webUrl: '' },
    // V3.0: unified project / device / defect / inspection state
    v3State: null,
    // V4.1: multi-project, multi-device and 13-stage construction context
    foundationState: null,
    currentUser: { id: '', name: '未绑定飞书账号', role: 'project_manager', roleName: '项目经理', bound: false },
    feishuIdentity: { bound: false },
    cloudSyncStatus: { online: false, pending: 0, message: '等待云端连接' }
  },

  onLaunch: function (options) {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        traceUser: true
      });
    }

    // Load saved AI config
    try {
      var saved = wx.getStorageSync('esp_ai_config');
      if (saved) {
        var parsed = JSON.parse(saved);
        delete parsed.apiKey;
        var keys = Object.keys(parsed);
        for (var i = 0; i < keys.length; i++) {
          this.globalData.aiConfig[keys[i]] = parsed[keys[i]];
        }
      }
    } catch (e) {}

    // Load history records
    try {
      var records = wx.getStorageSync('esp_history');
      if (records) {
        this.globalData.historyRecords = JSON.parse(records);
      }
    } catch (e) {}

    // Load check states
    try {
      var states = wx.getStorageSync('esp_check_states');
      if (states) {
        this.globalData.checkStates = JSON.parse(states);
      }
    } catch (e) {}

    // V2.0: Load false positives cache
    try {
      var fp = wx.getStorageSync('esp_false_positives');
      if (fp) {
        this.globalData.falsePositives = JSON.parse(fp);
      }
    } catch (e) {}

    // V2.0: Load missed defects cache
    try {
      var md = wx.getStorageSync('esp_missed_defects');
      if (md) {
        this.globalData.missedDefects = JSON.parse(md);
      }
    } catch (e) {}

    // V2.0: Load feature settings
    try {
      var fs = wx.getStorageSync('esp_feature_settings');
      if (fs) {
        var parsedFs = JSON.parse(fs);
        var fsKeys = Object.keys(parsedFs);
        for (var j = 0; j < fsKeys.length; j++) {
          this.globalData.featureSettings[fsKeys[j]] = parsedFs[fsKeys[j]];
        }
      }
    } catch (e) {}

    // V3.0 domain state. Existing V2 history remains readable and untouched.
    try {
      var v3Saved = wx.getStorageSync('esp_v3_state');
      var parsedV3 = v3Saved ? JSON.parse(v3Saved) : null;
      this.globalData.v3State = v3Data.normalizeState(parsedV3, this.globalData.historyRecords);
    } catch (e) {
      this.globalData.v3State = v3Data.createInitialState(this.globalData.historyRecords);
    }
    try {
      var foundationSaved = wx.getStorageSync(v4Foundation.STORAGE_KEY);
      var parsedFoundation = foundationSaved ? JSON.parse(foundationSaved) : null;
      this.globalData.foundationState = v4Foundation.normalizeState(parsedFoundation, this.globalData.v3State.project);
    } catch (e) {
      this.globalData.foundationState = v4Foundation.createInitialState(this.globalData.v3State.project);
    }
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    this.saveHistory();
    var isOpenRectificationEntry = options && options.path === 'pages/rectification-detail/rectification-detail' && options.query && options.query.from === 'share';
    if (isOpenRectificationEntry) {
      // 分享协作者只使用工单令牌，不进入项目成员体系，也不绑定业务身份。
      this.globalData.cloudSyncStatus = { online: true, pending: 0, message: '开放整改协作模式' };
    } else {
      var self = this;
      this.refreshFeishuIdentity().then(function (profile) {
        if (profile && profile.bound) self._initCloudLedger();
      }).catch(function () {});
    }
  },

  applyFeishuIdentity: function (profile) {
    profile = profile || { bound: false };
    var previous = this.globalData.feishuIdentity || {};
    var previousId = previous.feishuOpenId || previous.feishuUserId || '';
    var nextId = profile.feishuOpenId || profile.feishuUserId || '';
    if (previousId !== nextId && feishuRectification.clearCaches) feishuRectification.clearCaches();
    this.globalData.feishuIdentity = Object.assign({}, profile);
    this.globalData.currentUser = {
      id: profile.feishuOpenId || profile.feishuUserId || '',
      name: profile.name || '未绑定飞书账号',
      role: profile.role || 'project_manager',
      roleName: profile.roleName || '项目经理',
      bound: !!profile.bound
    };
    return this.globalData.feishuIdentity;
  },

  refreshFeishuIdentity: function () {
    var self = this;
    return feishuAuth.status().then(function (result) {
      return self.applyFeishuIdentity(result.profile || { bound: false });
    });
  },

  getFeishuIdentity: function () {
    return this.globalData.feishuIdentity || { bound: false };
  },

  canEditCurrentProject: function () {
    var identity = this.getFeishuIdentity();
    if (!identity.bound) return false;
    if (identity.role === 'platform_admin') return true;
    var context = this.getFoundationContext();
    return !!(context.project && context.project.canEdit);
  },

  requireCurrentProjectEdit: function () {
    if (this.canEditCurrentProject()) return true;
    wx.showToast({ title: '该项目仅可查看', icon: 'none' });
    return false;
  },

  openFeishuAccount: function () {
    wx.navigateTo({ url: '/pages/feishu-account/feishu-account' });
  },

  _initCloudLedger: function () {
    var self = this;
    var state = this.getV3State();
    cloudLedger.bootstrap(state.project).then(function (result) {
      if (result.actor) {
        self.globalData.currentUser = {
          id: result.actor.openId || 'cloud-user', name: result.actor.name || '现场质量人员',
          role: result.actor.role || 'project_manager', roleName: result.actor.roleName || '项目经理', bound: true
        };
        var context = self.getFoundationContext();
        if (context.project && context.project.id) {
          context.project.canEdit = result.actor.canEditProject === true;
          context.project.permissionLabel = context.project.canEdit ? '我负责' : '仅查看';
          self.saveFoundationState();
        }
      }
      self._mergeCloudState(result.state || {});
      return cloudLedger.flushQueue();
    }).then(function (sync) {
      self.globalData.cloudSyncStatus = { online: !sync.error, pending: sync.pending || 0, message: sync.error || '云端台账已同步' };
    }).catch(function (err) {
      var status = cloudLedger.getStatus();
      self.globalData.cloudSyncStatus = { online: false, pending: status.pending, message: err.message || '当前使用离线台账' };
    });
  },

  _mergeCloudState: function (cloudState) {
    var state = this.getV3State();
    function merge(local, remote) {
      var map = {}; var output = [];
      (remote || []).forEach(function (item) { if (item && item.id) { map[item.id] = true; output.push(item); } });
      (local || []).forEach(function (item) { if (item && item.id && !map[item.id]) output.push(item); });
      return output;
    }
    // Old cloud records may still reference a merged stage ID.
    var catalog = require('./utils/stage-catalog');
    function canonicalReferences(value) {
      if (!value || typeof value !== 'object') return;
      if (value.stageId) value.stageId = catalog.canonicalId(value.stageId);
      if (value.constructionStageId) value.constructionStageId = catalog.canonicalId(value.constructionStageId);
      Object.keys(value).forEach(function (key) { if (value[key] && typeof value[key] === 'object') canonicalReferences(value[key]); });
    }
    canonicalReferences(cloudState);
    state.defects = merge(state.defects, cloudState.defects);
    state.inspections = merge(state.inspections, cloudState.inspections);
    state.reports = merge(state.reports, cloudState.reports);
    var localOrders = state.rectificationOrders || [];
    var localOrderMap = {};
    localOrders.forEach(function (item) { if (item && item.id) localOrderMap[item.id] = item; });
    state.rectificationOrders = merge(localOrders, cloudState.rectificationOrders).map(function (item) {
      var local = localOrderMap[item.id] || {};
      var merged = Object.assign({}, local, item, { shareToken: local.shareToken || item.shareToken || '' });
      // A Feishu-originated task remains "waiting for Feishu closure" after project review.
      // The Bitable pull is the only thing that may turn it into a final closed record.
      if (local.feishuRecordId && local.feishuClosureSyncState === 'synced' && item.status === 'closed') {
        merged.status = local.status;
        merged.statusName = local.statusName;
        merged.feishuClosureSyncState = local.feishuClosureSyncState;
        merged.feishuClosureSyncedAt = local.feishuClosureSyncedAt;
      }
      // Cloud ledger may still contain an older copy from before the Feishu
      // bridge was corrected. Basic task information always comes from the
      // latest Feishu snapshot; the cloud copy only provides collaboration state.
      return applyFeishuSnapshot(merged);
    });
    var historyChanged = false;
    var historyRecords = this.globalData.historyRecords || [];
    state.rectificationOrders.forEach(function (order) {
      historyRecords.forEach(function (record) {
        if (record.rectificationOrderId === order.id || record.id === order.sourceHistoryRecordId) {
          record.rectificationOrderId = order.id;
          record.rectificationStatus = order.status;
          record.rectificationStatusName = order.statusName || (order.status === 'closed' ? '已闭环' : '待整改');
          historyChanged = true;
        }
      });
    });
    if (historyChanged) this.saveHistory();
    this.saveV3State();
  },

  saveConfig: function () {
    try {
      wx.setStorageSync('esp_ai_config', JSON.stringify(this.globalData.aiConfig));
    } catch (e) {}
  },

  saveHistory: function () {
    try {
      wx.setStorageSync('esp_history', JSON.stringify(this.globalData.historyRecords));
    } catch (e) {}
  },

  saveCheckStates: function () {
    try {
      wx.setStorageSync('esp_check_states', JSON.stringify(this.globalData.checkStates));
    } catch (e) {}
  },

  // V2.0: Save false positives
  saveFalsePositives: function () {
    try {
      wx.setStorageSync('esp_false_positives', JSON.stringify(this.globalData.falsePositives));
    } catch (e) {}
  },

  // V2.0: Save missed defects
  saveMissedDefects: function () {
    try {
      wx.setStorageSync('esp_missed_defects', JSON.stringify(this.globalData.missedDefects));
    } catch (e) {}
  },

  // V2.0: Save feature settings
  saveFeatureSettings: function () {
    try {
      wx.setStorageSync('esp_feature_settings', JSON.stringify(this.globalData.featureSettings));
    } catch (e) {}
  },

  saveV3State: function () {
    try {
      if (!this.globalData.v3State) {
        this.globalData.v3State = v3Data.createInitialState(this.globalData.historyRecords);
      }
      this.globalData.v3State.updatedAt = Date.now();
      wx.setStorageSync('esp_v3_state', JSON.stringify(this.globalData.v3State));
    } catch (e) {
      console.error('V3状态保存失败:', e);
    }
  },

  saveFoundationState: function () {
    try {
      if (!this.globalData.foundationState) {
        this.globalData.foundationState = v4Foundation.createInitialState(this.getV3State().project);
      }
      this.globalData.foundationState.updatedAt = Date.now();
      wx.setStorageSync(v4Foundation.STORAGE_KEY, JSON.stringify(this.globalData.foundationState));
    } catch (e) {
      console.error('V4.1项目设备状态保存失败', e);
    }
  },

  getFoundationState: function () {
    if (!this.globalData.foundationState) {
      this.globalData.foundationState = v4Foundation.createInitialState(this.getV3State().project);
      this._syncLegacyProjectContext();
    }
    return this.globalData.foundationState;
  },

  getFoundationContext: function () {
    return v4Foundation.getContext(this.getFoundationState());
  },

  switchProject: function (projectId) {
    var self = this;
    var state = this.getFoundationState();
    if (!v4Foundation.switchProject(state, projectId)) return false;
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.bootstrap(this.getV3State().project).then(function (result) {
      if (result.actor) self.globalData.currentUser = Object.assign({}, self.globalData.currentUser, {
        id: result.actor.openId || self.globalData.currentUser.id,
        name: result.actor.name || self.globalData.currentUser.name,
        role: result.actor.role || self.globalData.currentUser.role,
        roleName: result.actor.roleName || self.globalData.currentUser.roleName,
        bound: true
      });
      var context = self.getFoundationContext();
      if (context.project && context.project.id && result.actor) {
        context.project.canEdit = result.actor.canEditProject === true;
        context.project.permissionLabel = context.project.canEdit ? '我负责' : '仅查看';
        self.saveFoundationState();
      }
      self._mergeCloudState(result.state || {});
    }).catch(function () {});
    return true;
  },

  switchDevice: function (deviceId) {
    var state = this.getFoundationState();
    if (!v4Foundation.switchDevice(state, deviceId)) return false;
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    return true;
  },

  loadFeishuProjectOptions: function (options) {
    return feishuRectification.listProjectOptions(options || {}).then(function (result) {
      return {
        projects: Array.isArray(result.projects) ? result.projects : [],
        count: Number(result.count || 0),
        totalRecords: Number(result.totalRecords || 0),
        syncedAt: result.syncedAt || '',
        fromCache: !!result.fromCache,
        fromClientCache: !!result.fromClientCache,
        staleClientCache: !!result.staleClientCache,
        refreshError: result.refreshError || '',
        durationMs: Number(result.durationMs || 0)
      };
    });
  },

  bindFeishuProjectSelection: function (projectOption, preferredDeviceName) {
    projectOption = projectOption || {};
    var projectName = String(projectOption.name || '').trim();
    var catalogDevices = Array.isArray(projectOption.devices) ? projectOption.devices : [];
    if (!projectName) throw new Error('未选择飞书项目');
    if (!catalogDevices.length) throw new Error('该项目在飞书表中尚未填写炉号');
    var state = this.getFoundationState();
    var project = (state.projects || []).find(function (item) {
      return sameFeishuValue(item.feishuProjectName, projectName);
    }) || (state.projects || []).find(function (item) {
      return !item.feishuProjectName && sameFeishuValue(item.name, projectName);
    });
    project = v4Foundation.upsertProject(state, Object.assign({}, project || {}, {
      id: project && project.id,
      name: projectName,
      shortName: projectName,
      feishuManaged: true,
      feishuProjectName: projectName,
      canEdit: projectOption.canEdit === true,
      permissionLabel: projectOption.canEdit === true ? '我负责' : '仅查看',
      feishuManagerNames: Array.isArray(projectOption.managerNames) ? projectOption.managerNames : [],
      feishuDeviceNames: catalogDevices.map(function (item) { return String(item.name || '').trim(); }).filter(Boolean),
      feishuTaskCount: Number(projectOption.taskCount || 0),
      feishuRecordCount: Number(projectOption.recordCount || 0)
    }));
    var selectedDevice = null;
    catalogDevices.forEach(function (option, index) {
      var deviceName = String(option.name || '').trim();
      if (!deviceName) return;
      var device = (state.devices || []).find(function (item) {
        return item.projectId === project.id && sameFeishuValue(item.feishuDeviceName, deviceName);
      }) || (state.devices || []).find(function (item) {
        return item.projectId === project.id && !item.feishuDeviceName && sameFeishuValue(item.unitNo, deviceName);
      });
      device = v4Foundation.upsertDevice(state, Object.assign({}, device || {}, {
        id: device && device.id,
        projectId: project.id,
        name: deviceName,
        unitNo: deviceName,
        ordinal: index + 1,
        feishuManaged: true,
        feishuDeviceName: deviceName,
        feishuTaskCount: Number(option.taskCount || 0),
        feishuRecordCount: Number(option.recordCount || 0)
      }));
      if (!selectedDevice || sameFeishuValue(deviceName, preferredDeviceName)) selectedDevice = device;
    });
    state.currentProjectId = project.id;
    state.currentDeviceId = selectedDevice && selectedDevice.id || '';
    state.updatedAt = Date.now();
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    return { project: project, device: selectedDevice, devices: catalogDevices };
  },

  setCurrentConstructionStage: function (stageIndex, note) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getFoundationState();
    var contextBefore = v4Foundation.getContext(state);
    var deviceState = v4Foundation.setActualStage(state, stageIndex, this.globalData.currentUser, note);
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.syncFoundation(contextBefore.project.id, {
      projects: state.projects,
      devices: state.devices,
      deviceStates: state.deviceStates,
      currentDeviceId: state.currentDeviceId
    }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
      console.warn('当前施工部件云端同步失败，已保存在本机', error);
    });
    return deviceState;
  },

  getConstructionProgress: function (stageIndex) {
    return v4Foundation.getStageProgressDetail(this.getFoundationState(), stageIndex);
  },

  getConstructionDailySuggestions: function () {
    return v4Foundation.getDailyReportSuggestions(this.getFoundationState());
  },

  getArrivalLedger: function () {
    return v4Foundation.getArrivalLedgerDetail(this.getFoundationState());
  },

  importArrivalDemandManifest: function (payload) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getFoundationState();
    var contextBefore = v4Foundation.getContext(state);
    var detail = v4Foundation.applyArrivalDemandManifest(state, payload || {}, this.globalData.currentUser);
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.syncFoundation(contextBefore.project.id, {
      projects: state.projects,
      devices: state.devices,
      deviceStates: state.deviceStates,
      currentDeviceId: state.currentDeviceId
    }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
      console.warn('需求总清单云端同步失败，已保存在本机', error);
    });
    return detail;
  },

  importArrivalReceiptManifest: function (payload) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getFoundationState();
    var contextBefore = v4Foundation.getContext(state);
    var detail = v4Foundation.applyArrivalReceiptManifest(state, payload || {}, this.globalData.currentUser);
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.syncFoundation(contextBefore.project.id, {
      projects: state.projects,
      devices: state.devices,
      deviceStates: state.deviceStates,
      currentDeviceId: state.currentDeviceId
    }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
      console.warn('实际到货清单云端同步失败，已保存在本机', error);
    });
    return detail;
  },

  updateStageArrivalQuantity: function (stageIndex, quantity) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getFoundationState();
    var contextBefore = v4Foundation.getContext(state);
    var detail = v4Foundation.applyStageArrivalQuantity(state, stageIndex, quantity, this.globalData.currentUser);
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.syncFoundation(contextBefore.project.id, {
      projects: state.projects,
      devices: state.devices,
      deviceStates: state.deviceStates,
      currentDeviceId: state.currentDeviceId
    }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
      console.warn('手工到货进度云端同步失败，已保存在本机', error);
    });
    return detail;
  },

  updateConstructionProgress: function (stageIndex, payload) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getFoundationState();
    var contextBefore = v4Foundation.getContext(state);
    var detail = v4Foundation.updateStageProgress(state, stageIndex, payload || {}, this.globalData.currentUser);
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.syncFoundation(contextBefore.project.id, {
      projects: state.projects,
      devices: state.devices,
      deviceStates: state.deviceStates,
      currentDeviceId: state.currentDeviceId
    }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
      console.warn('施工进度云端同步失败，已保存在本机', error);
    });
      return detail;
    },

    recordDailyConstructionProgress: function (stageIndex, payload) {
      if (!this.requireCurrentProjectEdit()) return null;
      var state = this.getFoundationState();
      var contextBefore = v4Foundation.getContext(state);
      var detail = v4Foundation.recordDailyStageProgress(state, stageIndex, payload || {}, this.globalData.currentUser);
      this._syncLegacyProjectContext();
      this.saveFoundationState();
      this.saveV3State();
      cloudLedger.syncFoundation(contextBefore.project.id, {
        projects: state.projects,
        devices: state.devices,
        deviceStates: state.deviceStates,
        currentDeviceId: state.currentDeviceId
      }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
        console.warn('每日施工进度云端同步失败，已保存在本机', error);
      });
      return detail;
    },

    acknowledgeConstructionAlert: function (alertId, note) {
      if (!this.requireCurrentProjectEdit()) return false;
      var state = this.getFoundationState();
      var contextBefore = v4Foundation.getContext(state);
      var handled = v4Foundation.acknowledgeDispatchAlert(state, alertId, this.globalData.currentUser, note || '已安排处理');
      if (!handled) return false;
      this.saveFoundationState();
      this.saveV3State();
      cloudLedger.syncFoundation(contextBefore.project.id, {
        projects: state.projects,
        devices: state.devices,
        deviceStates: state.deviceStates,
        currentDeviceId: state.currentDeviceId
      }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
        console.warn('发货预警处理状态云端同步失败，已保存在本机', error);
      });
      return true;
    },

  saveProjectProfile: function (project) {
    if (project && project.id && !this.requireCurrentProjectEdit()) return null;
    if ((!project || !project.id) && this.getFeishuIdentity().role !== 'platform_admin') {
      wx.showToast({ title: '仅平台管理员可新增项目', icon: 'none' });
      return null;
    }
    var state = this.getFoundationState();
    var saved = v4Foundation.upsertProject(state, project || {});
    state.currentProjectId = saved.id;
    var devices = v4Foundation.getDevicesByProject(state, saved.id);
    state.currentDeviceId = devices.length ? devices[0].id : '';
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    var self = this;
    var trustedProject = Object.assign({}, this.getV3State().project);
    cloudLedger.bootstrap(trustedProject).then(function () {
      return cloudLedger.syncFoundation(saved.id, { project: saved, projects: state.projects, devices: state.devices, deviceStates: state.deviceStates });
    }).then(this._refreshSyncStatus.bind(this)).catch(function (error) {
      console.warn('项目云端建档失败', error);
      self._refreshSyncStatus();
    });
    return saved;
  },

  saveManagedDevice: function (device) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getFoundationState();
    var saved = v4Foundation.upsertDevice(state, device || {});
    state.currentProjectId = saved.projectId;
    state.currentDeviceId = saved.id;
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.syncFoundation(saved.projectId, { device: saved, projects: state.projects, devices: state.devices, deviceStates: state.deviceStates }).then(this._refreshSyncStatus.bind(this));
    return saved;
  },

  removeManagedDevice: function (deviceId) {
    if (!this.requireCurrentProjectEdit()) return false;
    var state = this.getFoundationState();
    var device = (state.devices || []).filter(function (item) { return item.id === deviceId; })[0];
    if (!device || !v4Foundation.removeDevice(state, deviceId)) return false;
    this._syncLegacyProjectContext();
    this.saveFoundationState();
    this.saveV3State();
    cloudLedger.syncFoundation(device.projectId, { removedDeviceId: deviceId, projects: state.projects, devices: state.devices, deviceStates: state.deviceStates }).then(this._refreshSyncStatus.bind(this));
    return true;
  },

  _syncLegacyProjectContext: function () {
    if (!this.globalData.foundationState || !this.globalData.v3State) return;
    var context = v4Foundation.getContext(this.globalData.foundationState);
    var legacyProject = this.globalData.v3State.project || {};
    // Existing V3 records had no device dimension. Bind them once to the
    // initially selected device; later project/device switches will not move them.
    (this.globalData.v3State.defects || []).forEach(function (item) {
      if (!item.deviceId) {
        item.projectId = context.project.id;
        item.deviceId = context.device.id;
      }
    });
    (this.globalData.v3State.inspections || []).forEach(function (item) {
      if (!item.deviceId) {
        item.projectId = context.project.id;
        item.deviceId = context.device.id;
      }
    });
    (this.globalData.v3State.reports || []).forEach(function (item) {
      if (!item.deviceId) {
        item.projectId = context.project.id;
        item.deviceId = context.device.id;
      }
    });
    (this.globalData.v3State.rectificationOrders || []).forEach(function (item) {
      if (!item.deviceId) {
        item.projectId = context.project.id;
        item.deviceId = context.device.id;
      }
    });
    (this.globalData.historyRecords || []).forEach(function (item) {
      if (!item.deviceId) {
        item.projectId = context.project.id;
        item.deviceId = context.device.id;
      }
    });
    this.globalData.v3State.project = Object.assign({}, legacyProject, {
      id: context.project.id,
      name: context.project.name,
      shortName: context.project.shortName,
      unit: context.project.unit,
      location: context.project.location,
      manager: context.project.manager,
      drawingNo: context.project.drawingNo || context.template.drawingNo,
      layout: context.template.layout,
      deviceId: context.device.id,
      deviceName: context.device.name,
      unitNo: context.device.unitNo,
      stage: context.stage.name,
      stageIndex: context.stage.index,
      modelStatus: context.template.modelStatus,
      feishuManaged: !!context.project.feishuManaged,
      feishuProjectName: context.project.feishuProjectName || '',
      feishuManagerNames: context.project.feishuManagerNames || [],
      canEdit: !!context.project.canEdit,
      permissionLabel: context.project.permissionLabel || (context.project.canEdit ? '我负责' : '仅查看')
    });
  },

  getV3State: function () {
    if (!this.globalData.v3State) {
      this.globalData.v3State = v3Data.createInitialState(this.globalData.historyRecords);
    }
    return this.globalData.v3State;
  },

  updateTabBarReminderBadges: function () {
    var context;
    try {
      context = this.getFoundationContext();
    } catch (e) {
      return { ai: 0, rectification: 0, pendingConfirm: 0, processDraft: 0 };
    }
    var state = this.getV3State();
    var actionableStatuses = { pending: true, rectifying: true, rejected: true, review: true };
    var rectificationCount = (state.rectificationOrders || []).filter(function (item) {
      return (!item.projectId || item.projectId === context.project.id) &&
        (!item.deviceId || item.deviceId === context.device.id) && actionableStatuses[item.status];
    }).length;
    var pendingConfirmCount = (state.inspections || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id && item.status === 'draft';
    }).length;
    var processDraftCount = processForms.loadRecords().filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id && item.status === 'draft';
    }).length;
    var aiReminderCount = rectificationCount + pendingConfirmCount;
    var logisticsAlertCount = 0;
    try {
      var logisticsDetail = v4Foundation.getStageProgressDetail(this.getFoundationState(), context.stage.index);
      logisticsAlertCount = (logisticsDetail.allActiveAlerts || []).length;
    } catch (e) {}
    var todayCount = aiReminderCount + processDraftCount + logisticsAlertCount;

    function updateBadge(index, count) {
      try {
        if (count > 0 && wx.setTabBarBadge) {
          wx.setTabBarBadge({ index: index, text: count > 99 ? '99+' : String(count), fail: function () {} });
        } else if (wx.removeTabBarBadge) {
          wx.removeTabBarBadge({ index: index, fail: function () {} });
        }
      } catch (e) {}
    }
    updateBadge(1, 0);
    updateBadge(2, todayCount);
    updateBadge(3, 0);
    return {
      ai: aiReminderCount,
      rectification: rectificationCount,
      pendingConfirm: pendingConfirmCount,
      processDraft: processDraftCount,
      logistics: logisticsAlertCount,
      today: todayCount
    };
  },

  addSpatialDefect: function (defect) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getV3State();
    var actor = this.globalData.currentUser || {};
    var item = Object.assign({
      id: v3Data.createDefectId(),
      projectId: state.project.id,
      deviceId: state.project.deviceId || '',
      status: 'pending',
      statusName: '待整改',
      createdAt: new Date().toLocaleString('zh-CN'),
      rectification: null,
      review: null
      ,createdBy: actor.id || 'offline-user'
      ,createdByName: actor.name || '离线现场用户'
      ,createdByRole: actor.role || 'inspector'
    }, defect || {});
    state.defects.unshift(item);
    this.saveV3State();
    return item;
  },

  updateDefectStatus: function (id, status, extra) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getV3State();
    for (var i = 0; i < state.defects.length; i++) {
      if (state.defects[i].id === id) {
        var previousStatus = state.defects[i].status;
        state.defects[i].status = status;
        state.defects[i].statusName = v3Data.getStatusName(status);
        if (extra) Object.assign(state.defects[i], extra);
        this.saveV3State();
        var cloudDefect = Object.assign({}, state.defects[i], { previousStatus: previousStatus });
        cloudLedger.updateDefect(state.project.id, cloudDefect, extra && extra.note ? extra.note : '').then(this._refreshSyncStatus.bind(this));
        return state.defects[i];
      }
    }
    return null;
  },

  removeSpatialDefect: function (id) {
    if (!this.requireCurrentProjectEdit()) return false;
    var state = this.getV3State();
    for (var i = 0; i < state.defects.length; i++) {
      if (state.defects[i].id === id) {
        state.defects.splice(i, 1);
        this.saveV3State();
        cloudLedger.rejectDefect(state.project.id, id, '人工复核判定为误报').then(this._refreshSyncStatus.bind(this));
        return true;
      }
    }
    return false;
  },

  syncInspectionToCloud: function (historyRecord, inspection, defects) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看'));
    var state = this.getV3State();
    return cloudLedger.syncInspection(state.project, inspection, defects || [], historyRecord).then(this._refreshSyncStatus.bind(this));
  },

  refreshProjectCloudState: function () {
    var self = this; var state = this.getV3State();
    return cloudLedger.pullProjectState(state.project.id).then(function (result) {
      self._mergeCloudState(result.state || {});
      self._refreshSyncStatus();
      return self.getV3State();
    });
  },

  syncBatchToCloud: function (historyRecord) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看'));
    var state = this.getV3State();
    return cloudLedger.syncBatch(state.project, historyRecord).then(this._refreshSyncStatus.bind(this));
  },

  syncReportToCloud: function (report) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看'));
    var state = this.getV3State();
    return cloudLedger.syncReport(state.project.id, report).then(this._refreshSyncStatus.bind(this));
  },

  createOpenRectificationOrder: function (historyRecord, inspection, defects, sourceImagePath) {
    if (!this.requireCurrentProjectEdit()) return null;
    var state = this.getV3State();
    state.rectificationOrders = state.rectificationOrders || [];
    var now = new Date();
    var deadlineDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    var deadline = deadlineDate.getFullYear() + '-' + String(deadlineDate.getMonth() + 1).padStart(2, '0') + '-' + String(deadlineDate.getDate()).padStart(2, '0') + ' 18:00';
    var order = {
      id: v3Data.createRectificationOrderId(),
      projectId: state.project.id,
      projectName: state.project.name,
      deviceId: state.project.deviceId || '',
      managedDeviceName: state.project.deviceName || '',
      collaborationMode: 'OPEN_LINK',
      shareToken: v3Data.createShareToken(),
      sourceInspectionId: inspection.id,
      sourceHistoryRecordId: historyRecord.id,
      title: (historyRecord.areaName || '智能质检') + '整改清单',
      deviceName: (defects[0] && defects[0].deviceName) || historyRecord.areaName || '',
      positionCode: historyRecord.positionCode || '',
      inspectionItemId: historyRecord.inspectionItemId || '',
      inspectionMethodName: historyRecord.inspectionMethodName || '智能视觉',
      items: (defects || []).map(function (defect) {
        return {
          defectId: defect.id, name: defect.name, severity: defect.severity, level: defect.level,
          description: defect.description || '', suggestion: defect.suggestion || '', standard: defect.standard || '',
          positionCode: defect.positionCode || historyRecord.positionCode || ''
        };
      }),
      defectIds: (defects || []).map(function (defect) { return defect.id; }),
      sourceImageLocal: sourceImagePath || '', sourceImageFileID: '',
      deadline: deadline, status: 'pending', statusName: '待整改',
      evidencePhotos: [], measurement: '', rectificationNote: '', closedSource: '',
      createdAt: now.toLocaleString('zh-CN'), updatedAtText: now.toLocaleString('zh-CN'),
      timeline: [{ action: 'created', name: '生成开放协作整改单', time: now.toLocaleString('zh-CN') }]
    };
    state.rectificationOrders.unshift(order);
    historyRecord.rectificationOrderId = order.id;
    historyRecord.rectificationStatus = order.status;
    historyRecord.rectificationStatusName = order.statusName;
    this.saveHistory();
    this.saveV3State();
    this._syncOpenRectificationOrder(order);
    return order;
  },

  getFeishuProjectContext: function () {
    var context = this.getFoundationContext();
    return {
      projectId: context.project.id || '',
      projectName: context.project.feishuProjectName || context.project.name || '',
      feishuProjectName: context.project.feishuProjectName || '',
      deviceId: context.device.id || '',
      deviceCode: context.device.code || '',
      deviceName: context.device.name || '',
      unitNo: context.device.feishuDeviceName || context.device.unitNo || '',
      feishuDeviceName: context.device.feishuDeviceName || ''
    };
  },

  refreshFeishuRectificationTasks: function (options) {
    var self = this;
    var context = this.getFeishuProjectContext();
    if (!context.feishuProjectName || !context.feishuDeviceName) {
      return Promise.reject(new Error('请先在首页从飞书项目列表选择项目和炉号'));
    }
    // Pulling the quality ledger used to be coupled with the Feishu request via
    // Promise.all. A slow quality-ledger bootstrap therefore made a successful
    // Feishu read appear as “飞书同步失败”. The Feishu bridge validates binding
    // and permissions independently, so only its result should gate this action.
    return feishuRectification.pullTasks(context, options || {}).then(function (result) {
      var state = self.getV3State();
      var fetchedTasks = Array.isArray(result.tasks) ? result.tasks : [];
      var fetchedIds = {};
      fetchedTasks.forEach(function (task) {
        if (task && task.recordId) fetchedIds['FEISHU-' + task.recordId] = true;
      });
      // Reconcile the current project/device rather than leaving stale Feishu imports on screen.
      // This also removes the blank records that could have been imported by an older version.
      var orders = (state.rectificationOrders || []).filter(function (order) {
        var isCurrentFeishuOrder = order && order.sourceType === 'FEISHU_BITABLE' &&
          order.projectId === context.projectId && order.deviceId === context.deviceId;
        return !isCurrentFeishuOrder || !!fetchedIds[order.id];
      });
      var changed = [];
      var syncedOrders = [];
      fetchedTasks.forEach(function (task) {
        if (!task || !task.recordId) return;
        var orderId = 'FEISHU-' + task.recordId;
        var index = -1;
        for (var i = 0; i < orders.length; i++) if (orders[i].id === orderId || orders[i].feishuRecordId === task.recordId) { index = i; break; }
        var previous = index >= 0 ? orders[index] : null;
        var waitingForFeishu = previous && previous.feishuClosureSyncState === 'synced' && task.feishuStatus !== 'closed';
        var status = waitingForFeishu ? 'review' : task.feishuStatus;
        var statusName = waitingForFeishu ? '已回传飞书，待部门闭环' : task.feishuStatusName;
        var feishuSnapshot = makeFeishuSnapshot(task, context);
        var item = {
          id: orderId,
          projectId: context.projectId,
          projectName: context.projectName,
          deviceId: context.deviceId,
          managedDeviceName: context.deviceName,
          collaborationMode: 'OPEN_LINK',
          sourceType: 'FEISHU_BITABLE',
          feishuRecordId: task.recordId,
          feishuProjectName: context.feishuProjectName || '',
          feishuDeviceName: context.feishuDeviceName || '',
          feishuSource: result.diagnostics && result.diagnostics.appToken && result.diagnostics.tableId
            ? { appToken: result.diagnostics.appToken, tableId: result.diagnostics.tableId }
            : (previous && previous.feishuSource || null),
          feishuProjectCode: task.projectCode || '',
          feishuStatus: task.feishuStatus,
          feishuStatusName: task.feishuStatusName,
          feishuClosureSyncState: previous && previous.feishuClosureSyncState || '',
          feishuClosureSyncError: previous && previous.feishuClosureSyncError || '',
          feishuSnapshot: feishuSnapshot,
          shareToken: previous && previous.shareToken || v3Data.createShareToken(),
          title: feishuSnapshot.title,
          deviceName: feishuSnapshot.deviceName,
          positionCode: feishuSnapshot.positionCode,
          inspectionMethodName: feishuSnapshot.inspectionMethodName,
          deadline: feishuSnapshot.deadline,
          status: status,
          statusName: statusName,
          sourceImageLocal: feishuSnapshot.sourceImageLocal,
          sourceImageFileID: feishuSnapshot.sourceImageFileID,
          evidencePhotos: previous && previous.evidencePhotos && previous.evidencePhotos.length
            ? previous.evidencePhotos
            : (task.closureImages || []),
          measurement: previous && previous.measurement || '',
          rectificationNote: previous && previous.rectificationNote || task.closureNote || '',
          submittedAtText: previous && previous.submittedAtText || task.closureTime || '',
          updatedAtText: (result.syncedAt || new Date().toLocaleString('zh-CN')),
          createdAt: previous && previous.createdAt || (result.syncedAt || new Date().toLocaleString('zh-CN')),
          timeline: previous && previous.timeline || [{ action: 'feishu_imported', name: '飞书下发整改任务', time: result.syncedAt || new Date().toLocaleString('zh-CN') }],
          items: [Object.assign({}, feishuSnapshot.item)],
          defectIds: []
        };
        if (previous) {
          orders[index] = applyFeishuSnapshot(Object.assign({}, previous, item));
          syncedOrders.push(orders[index]);
        } else {
          orders.unshift(applyFeishuSnapshot(item));
          changed.push(item);
          syncedOrders.push(orders[0]);
        }
      });
      state.rectificationOrders = orders;
      self.saveV3State();
      if (result.canEditProject === true) {
        syncedOrders.forEach(function (item) { self._syncOpenRectificationOrder(item); });
      }
      return {
        count: fetchedTasks.length,
        imported: changed.length,
        diagnostics: result.diagnostics || {},
        canEditProject: result.canEditProject === true,
        permissionLabel: result.permissionLabel || (result.canEditProject === true ? '我负责' : '仅查看'),
        managerNames: result.managerNames || [],
        syncedAt: result.syncedAt || '',
        fromCache: !!result.fromCache,
        fromClientCache: !!result.fromClientCache,
        staleClientCache: !!result.staleClientCache,
        refreshError: result.refreshError || '',
        durationMs: Number(result.durationMs || 0)
      };
    });
  },

  syncFeishuRectificationClosure: function (order) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看，不能回传整改附件'));
    var self = this;
    if (!order || !order.feishuRecordId) return Promise.resolve(order);
    var retryingFailedSync = order.feishuClosureSyncState === 'failed' || order.feishuClosureSyncState === 'verifying';
    var markSynced = function (result, verifiedAfterTimeout) {
      order.feishuClosureSyncState = 'synced';
      order.feishuClosureSyncError = '';
      order.feishuClosureSyncedAt = result.syncedAt || new Date().toLocaleString('zh-CN');
      order.feishuClosureSubmissionAt = order.submittedAtText || '';
      order.status = 'review';
      order.statusName = '已回传飞书，待部门闭环';
      var timeline = Array.isArray(order.timeline) ? order.timeline.slice() : [];
      var hasSyncedEvent = timeline.some(function (item) { return item && item.action === 'feishu_synced'; });
      if (!hasSyncedEvent) {
        timeline.push({
          action: 'feishu_synced',
          name: verifiedAfterTimeout ? '飞书回执超时，已核验整改照片回传成功，等待相关部门闭环' : '整改照片已回传飞书，等待相关部门闭环',
          time: order.feishuClosureSyncedAt
        });
      }
      order.timeline = timeline;
      self.saveV3State();
      self._syncOpenRectificationOrder(order);
      return order;
    };
    order.feishuClosureSyncState = 'syncing';
    order.feishuClosureSyncError = '';
    this.saveV3State();
    var payload = {
      recordId: order.feishuRecordId,
      evidencePhotos: order.evidencePhotos || [],
      rectificationNote: order.rectificationNote || '',
      reviewNote: order.reviewNote || '',
      orderId: order.id,
      projectId: order.projectId
    };
    var sendClosure = function () { return feishuRectification.syncClosure(payload); };
    // A retry after a timeout must not blindly upload the same image again.  Ask Feishu
    // first; if an attachment is already there, only repair the local sync state.
    var syncRequest = retryingFailedSync
      ? feishuRectification.verifyClosure({
        recordId: order.feishuRecordId,
        orderId: order.id,
        expectedPhotoCount: (order.evidencePhotos || []).length
      }).then(function (result) {
        return result && result.hasClosureImages ? Object.assign({ verifiedExisting: true }, result) : sendClosure();
      }).catch(function () { return sendClosure(); })
      : sendClosure();
    return syncRequest.then(function (result) {
      return markSynced(result, !!result.verifiedExisting);
    }).catch(function (error) {
      // Uploading a photo involves download + Feishu media upload + Bitable update.  The
      // developer-tool gateway can time out before those side effects have finished.
      // Do not report a false failure: verify the Bitable attachment first.
      if (isFeishuInvocationTimeout(error)) {
        order.feishuClosureSyncState = 'verifying';
        order.feishuClosureSyncError = '云函数回执超时，正在核验飞书附件…';
        self.saveV3State();
        self._syncOpenRectificationOrder(order);
        return self.verifyFeishuRectificationClosure(order, 0).then(function (result) {
          return markSynced(result, true);
        }).catch(function (verifyError) {
          order.feishuClosureSyncState = 'failed';
          order.feishuClosureSyncError = (verifyError && verifyError.message) || '飞书附件核验失败';
          self.saveV3State();
          self._syncOpenRectificationOrder(order);
          throw verifyError;
        });
      }
      order.feishuClosureSyncState = 'failed';
      order.feishuClosureSyncError = (error && error.message) || '飞书回传失败';
      self.saveV3State();
      self._syncOpenRectificationOrder(order);
      throw error;
    });
  },

  verifyFeishuRectificationClosure: function (order, attempt) {
    var self = this;
    var tries = Number(attempt || 0);
    return new Promise(function (resolve) { setTimeout(resolve, tries ? 1600 : 800); }).then(function () {
      return feishuRectification.verifyClosure({
        recordId: order.feishuRecordId,
        orderId: order.id,
        expectedPhotoCount: (order.evidencePhotos || []).length
      });
    }).then(function (result) {
      if (result && result.hasClosureImages) return result;
      if (tries < 2) return self.verifyFeishuRectificationClosure(order, tries + 1);
      throw new Error('飞书尚未查到整改附件，请稍后点击“重新回传飞书”核验');
    });
  },

  _syncOpenRectificationOrder: function (order) {
    var self = this;
    var cloudOrder = Object.assign({}, order);
    delete cloudOrder.sourceImageLocal;
    var syncTask = cloudLedger.createRectificationOrder(order.projectId, cloudOrder).then(this._refreshSyncStatus.bind(this));
    if (order.sourceImageLocal && order.sourceImageLocal.indexOf('cloud://') !== 0 && wx.cloud && wx.cloud.uploadFile) {
      wx.cloud.uploadFile({
        cloudPath: 'rectifications/' + order.projectId + '/' + order.id + '/source.jpg',
        filePath: order.sourceImageLocal,
        success: function (res) {
          order.sourceImageFileID = res.fileID || '';
          order.updatedAtText = new Date().toLocaleString('zh-CN');
          self.saveV3State();
          var updatedCloudOrder = Object.assign({}, order); delete updatedCloudOrder.sourceImageLocal;
          cloudLedger.createRectificationOrder(order.projectId, updatedCloudOrder).then(self._refreshSyncStatus.bind(self));
        }
      });
    }
    return syncTask;
  },

  prepareRectificationShare: function (orderId) {
    var self = this;
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看，不能创建整改分享链接'));
    var order = this.getRectificationOrder(orderId);
    if (!order) return Promise.reject(new Error('整改单不存在'));
    if (!order.shareToken) return Promise.reject(new Error('整改单缺少开放协作令牌'));
    // Background enqueue success does NOT prove the recipient can read a task.
    // Sharing needs a confirmed write, followed by a read using the actual link.
    var upload = Promise.resolve();
    if (order.sourceImageLocal && !order.sourceImageFileID) {
      upload = new Promise(function (resolve, reject) {
        if (!wx.cloud || !wx.cloud.uploadFile) { reject(new Error('云能力不可用，无法上传问题照片')); return; }
        wx.cloud.uploadFile({
          cloudPath: 'rectifications/' + order.projectId + '/' + order.id + '/source.jpg',
          filePath: order.sourceImageLocal,
          success: function (result) {
            if (!result.fileID) { reject(new Error('问题照片上传失败，请重试')); return; }
            order.sourceImageFileID = result.fileID;
            self.saveV3State();
            resolve();
          },
          fail: function () { reject(new Error('问题照片上传失败，请检查网络后重试')); }
        });
      });
    }
    return upload.then(function () {
      var cloudOrder = Object.assign({}, order);
      delete cloudOrder.sourceImageLocal;
      return cloudLedger.ensureRectificationOrder(order.projectId, cloudOrder);
    }).then(function () {
      return cloudLedger.getOpenRectification(order.projectId, order.id, order.shareToken);
    }).then(function (result) {
      if (!result.order || result.order.id !== order.id || result.order.projectId !== order.projectId) {
        throw new Error('云端任务尚未就绪，请重新同步后分享');
      }
      return { ready: true, order: Object.assign({}, result.order, { shareToken: order.shareToken }) };
    });
  },

  getRectificationOrder: function (orderId) {
    var orders = this.getV3State().rectificationOrders || [];
    for (var i = 0; i < orders.length; i++) if (orders[i].id === orderId) return applyFeishuSnapshot(orders[i]);
    return null;
  },

  mergeRectificationOrder: function (incoming) {
    if (!incoming || !incoming.id) return null;
    var state = this.getV3State(); var orders = state.rectificationOrders || []; var found = -1;
    for (var i = 0; i < orders.length; i++) if (orders[i].id === incoming.id) { found = i; break; }
    if (found >= 0) {
      var token = orders[found].shareToken || '';
      orders[found] = applyFeishuSnapshot(Object.assign({}, orders[found], incoming));
      if (!orders[found].shareToken) orders[found].shareToken = token;
    } else orders.unshift(applyFeishuSnapshot(incoming));
    state.rectificationOrders = orders; this.saveV3State(); this.updateTabBarReminderBadges();
    return found >= 0 ? orders[found] : orders[0];
  },

  loadOpenRectification: function (projectId, orderId, shareToken) {
    var self = this;
    return cloudLedger.getOpenRectification(projectId, orderId, shareToken).then(function (result) {
      var order = self.mergeRectificationOrder(result.order || {});
      if (order) {
        order._reminderConfig = result.reminderConfig || {};
        order._reminderState = result.reminderState || {};
      }
      return order;
    });
  },

  registerRectificationReminder: function (projectId, orderId, shareToken, templateId, sendTime) {
    var self = this;
    return cloudLedger.registerRectificationReminder(projectId, orderId, shareToken, templateId, sendTime).then(function (result) {
      var order = self.mergeRectificationOrder(result.order || {});
      if (order) {
        order._reminderConfig = result.reminderConfig || {};
        order._reminderState = result.reminderState || {};
      }
      return order;
    });
  },

  disableRectificationReminder: function (projectId, orderId, shareToken) {
    var self = this;
    return cloudLedger.disableRectificationReminder(projectId, orderId, shareToken).then(function (result) {
      var order = self.mergeRectificationOrder(result.order || {});
      if (order) {
        order._reminderConfig = result.reminderConfig || {};
        order._reminderState = result.reminderState || {};
      }
      return order;
    });
  },

  submitOpenRectification: function (projectId, orderId, shareToken, evidence) {
    var self = this;
    var order = this.getRectificationOrder(orderId);
    if (!order) return Promise.reject(new Error('\u6574\u6539\u8bb0\u5f55\u4e0d\u5b58\u5728'));

    // \u98de\u4e66\u4efb\u52a1\u65e2\u53ef\u80fd\u662f\u65e9\u671f\u5df2\u5bfc\u5165\u7684\u672c\u5730\u8bb0\u5f55\uff0c\u4e5f\u53ef\u80fd\u662f\u65b0\u589e\u4efb\u52a1\uff1b\u5728\u4e0a\u4f20\u95ed\u73af\u8d44\u6599\u524d\u5148\u540c\u6b65\u521b\u5efa\u4e91\u7aef\u6574\u6539\u5355\u3002
    // \u8fd9\u4f1a\u4fee\u590d\u300c\u4efb\u52a1\u5728\u5c0f\u7a0b\u5e8f\u91cc\u5b58\u5728\uff0c\u4f46\u4e91\u7aef quality-rectification-orders \u4e2d\u7f3a\u5c11\u8bb0\u5f55\u300d\u7684\u65e7\u6570\u636e\u60c5\u51b5\u3002
    var cloudOrder = Object.assign({}, order);
    delete cloudOrder.sourceImageLocal;
    return cloudLedger.ensureRectificationOrder(projectId, cloudOrder).then(function () {
      return cloudLedger.submitOpenRectification(projectId, orderId, shareToken || order.shareToken, evidence);
    }).then(function (result) {
      return self.applyRectificationState(result.order || {});
    });
  },

  applyRectificationState: function (incoming) {
    var order = this.mergeRectificationOrder(incoming);
    if (!order) return null;
    var state = this.getV3State(); var ids = order.defectIds || [];
    (state.defects || []).forEach(function (defect) {
      if (ids.indexOf(defect.id) !== -1) {
        defect.status = order.status; defect.statusName = order.statusName;
        defect.rectification = { collaborationMode: 'OPEN_LINK', evidencePhotos: order.evidencePhotos || [], measurement: order.measurement || '', note: order.rectificationNote || '', updatedAt: order.closedAtText || order.updatedAtText || '' };
        if (order.reviewNote) defect.review = { note: order.reviewNote, reviewer: order.reviewedByName || '', reviewedAt: order.closedAtText || order.updatedAtText || '' };
      }
    });
    (this.globalData.historyRecords || []).forEach(function (record) {
      if (record.rectificationOrderId === order.id || record.id === order.sourceHistoryRecordId) {
        record.rectificationOrderId = order.id; record.rectificationStatus = order.status; record.rectificationStatusName = order.statusName;
      }
    });
    this.saveHistory(); this.saveV3State(); return order;
  },

  reviewOpenRectification: function (orderId, reviewNote) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看，不能复验整改'));
    var self = this; var order = this.getRectificationOrder(orderId);
    if (!order) return Promise.reject(new Error('整改记录不存在'));
    return cloudLedger.reviewRectification(order.projectId, order.id, reviewNote).then(function (result) {
      var reviewed = self.applyRectificationState(result.order || {});
      if (!reviewed || !reviewed.feishuRecordId) return reviewed;
      return self.syncFeishuRectificationClosure(reviewed).catch(function () {
        // The closure itself is already retained in the quality ledger. The user can retry Feishu sync later.
        return reviewed;
      });
    });
  },

  rejectOpenRectification: function (orderId, reviewNote) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看，不能驳回复验'));
    var self = this; var order = this.getRectificationOrder(orderId);
    if (!order) return Promise.reject(new Error('整改记录不存在'));
    return cloudLedger.rejectRectificationReview(order.projectId, order.id, reviewNote).then(function (result) {
      return self.applyRectificationState(result.order || {});
    });
  },

  reopenOpenRectification: function (orderId) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看，不能重新打开整改'));
    var self = this; var order = this.getRectificationOrder(orderId);
    if (!order) return Promise.reject(new Error('整改记录不存在'));
    return cloudLedger.reopenRectification(order.projectId, order.id).then(function (result) {
      var updated = self.mergeRectificationOrder(result.order || {});
      updated.feishuClosureSyncState = '';
      updated.feishuClosureSyncError = '';
      updated.feishuClosureSyncedAt = '';
      updated.feishuClosureSubmissionAt = '';
      var ids = updated.defectIds || []; var state = self.getV3State();
      (state.defects || []).forEach(function (defect) { if (ids.indexOf(defect.id) !== -1) { defect.status = 'pending'; defect.statusName = '待整改'; } });
      (self.globalData.historyRecords || []).forEach(function (record) { if (record.rectificationOrderId === updated.id) { record.rectificationStatus = 'pending'; record.rectificationStatusName = '待整改'; } });
      self.saveHistory(); self.saveV3State(); return updated;
    });
  },

  getProcessRecords: function () {
    return processForms.loadRecords();
  },

  saveProcessRecord: function (record) {
    if (!this.canEditCurrentProject()) return Promise.reject(new Error('该项目仅可查看，不能保存检验记录'));
    var context = this.getFoundationContext();
    record.projectId = context.project.id;
    record.projectName = context.project.name;
    record.deviceId = context.device.id;
    record.deviceName = context.device.name;
    processForms.upsertRecord(record);
    this.updateTabBarReminderBadges();
    cloudLedger.syncProcessRecord(context.project.id, record).then(this._refreshSyncStatus.bind(this));
    return record;
  },

  refreshProcessRecords: function () {
    var context = this.getFoundationContext();
    return cloudLedger.pullProcessRecords(context.project.id, context.device.id).then(function (result) {
      var local = processForms.loadRecords(); var map = {};
      local.forEach(function (item) { map[item.id] = item; });
      (result.records || []).forEach(function (item) { map[item.id] = Object.assign({}, map[item.id] || {}, item); });
      var merged = Object.keys(map).map(function (id) { return map[id]; }).sort(function (a, b) {
        return String(b.updatedAtText || '').localeCompare(String(a.updatedAtText || ''));
      });
      processForms.saveRecords(merged);
      return merged;
    });
  },

  appendCloudAudit: function (entityType, entityId, action, detail) {
    var state = this.getV3State();
    return cloudLedger.appendAudit(state.project.id, entityType, entityId, action, detail).then(this._refreshSyncStatus.bind(this));
  },

  _refreshSyncStatus: function () {
    var status = cloudLedger.getStatus();
    this.globalData.cloudSyncStatus = { online: status.online, pending: status.pending, message: status.pending ? ('待同步 ' + status.pending + ' 项') : '云端台账已同步' };
    return status;
  }
});
