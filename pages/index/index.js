// pages/index/index.js — V4.1 construction quality cockpit
var app = getApp();
var v3Data = require('../../utils/v3-data.js');
var v4Foundation = require('../../utils/v4-foundation.js');
var engineeringIcons = require('../../utils/engineering-icons.js');

var PROVIDER_PRESETS = {
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
  deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-vl2' },
  qwen: { endpoint: 'https://ws-smrlevmcvvild23g.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-max' },
  custom: { endpoint: '', model: '' }
};

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    project: {},
    device: {},
    projects: [],
    projectNames: [],
    projectIndex: 0,
    devices: [],
    deviceNames: [],
    deviceIndex: 0,
    overallProgress: 0,
    healthScore: 0,
    healthMetrics: [],
    qualityStatusName: '正常',
    qualityStatus: 'normal',
    modelRegions: [],
    dashboardStats: {},
    reminderCount: 0,
    inspections: [],
    constructionStages: [],
    completedStageCount: 0,
    actualStageIndex: 1,
    actualStageName: '钢支架安装',
    actualStageIcon: engineeringIcons.forStage(1),
    actualStageProgress: 0,
    logisticsAlertCount: 0,
    logisticsAlertLevel: 'green',
    logisticsAlertLevelName: '正常',
    logisticsAlertText: '库存与运输时间充足',
    logisticsAlertStageIndex: 1,
    modelPartSelected: false,
    selectedPartName: '',
    selectedMetricLabel: '施工进度',
    selectedMetricProgress: 0,
    selectedStatusText: '待安装',
    selectedStatusClass: 'pending',
    arrivalOverallProgress: 0,
    installationOverallProgress: 0,
    modelStageIndex: 1,
    modelStageName: '钢支架安装',
    modelStageIcon: engineeringIcons.forStage(1),
    selectedStageProgress: {
      index: 1,
      name: '支座安装',
      shortName: '支座',
      statusName: '当前阶段',
      installedProgress: 0,
      arrivedProgress: 0,
      plannedQuantity: 0,
      installedQuantity: 0,
      arrivedQuantity: 0,
      unit: '件',
      plannedLoads: 0,
      arrivedLoads: 0
      , iconPath: engineeringIcons.forStage(1)
    },
    stageScrollLeft: 0,
    openDefects: [],
    projectCards: [],
    feishuProjects: [],
    displayFeishuProjects: [],
    projectSearchKeyword: '',
    projectFilter: 'all',
    ownedProjectCount: 0,
    defectProjectCount: 0,
    feishuCatalogLoading: false,
    feishuCatalogError: '',
    feishuCatalogSyncedAt: '',
    showProjectSheet: false,
    showDeviceSheet: false,
    showArrivalSheet: false,
    showSettings: false,
    modelCanvasVisible: true,
    modelReplayToken: 0,
    modelViewportHeightPx: 340,
    modelProjectName: '',
    modelDeviceName: '',
    config: { provider: 'qwen', endpoint: '', model: '', demoMode: true },
    featureSettings: { autoAreaDetect: true, qualityCheck: true },
    aiServiceStatus: 'unknown',
    aiServiceStatusText: '尚未检测云端智能服务',
    currentTime: ''
    , feishuIdentity: { bound: false }
    , currentProjectCanEdit: false
  },

  onLoad: function () {
    this.updateModelViewportHeight();
  },

  onShow: function () {
    this.updateModelViewportHeight();
    this.refreshDashboard();
    this.refreshAccountStatus();
    this.setData({ modelReplayToken: Number(this.data.modelReplayToken || 0) + 1 });
  },

  onResize: function (event) {
    this.updateModelViewportHeight(event && event.size);
  },

  updateModelViewportHeight: function (size) {
    var info = size || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
    var width = Math.max(320, Number(info.windowWidth || 375));
    var height = Math.max(480, Number(info.windowHeight || 667));
    var rpx = width / 750;
    var landscape = width > height;
    var minHeight = (landscape ? 300 : 455) * rpx;
    var maxHeight = (landscape ? 430 : 680) * rpx;
    var reservedHeight = (landscape ? 330 : 560) * rpx;
    var desiredHeight = height - reservedHeight;
    var modelHeight = Math.round(Math.max(minHeight, Math.min(maxHeight, desiredHeight)));
    if (modelHeight !== Number(this.data.modelViewportHeightPx || 0)) this.setData({ modelViewportHeightPx: modelHeight });
  },

  refreshAccountStatus: function () {
    var self = this;
    app.refreshFeishuIdentity().then(function (profile) {
      self.setData({ feishuIdentity: profile || { bound: false }, currentProjectCanEdit: app.canEditCurrentProject() });
    }).catch(function () {});
  },

  goFeishuAccount: function () { app.openFeishuAccount(); },

  refreshDashboard: function () {
    var state = app.getV3State();
    var foundationState = app.getFoundationState();
    var context = app.getFoundationContext();
    var projects = foundationState.projects || [];
    var devices = v4Foundation.getDevicesByProject(foundationState, context.project.id);
    if (context.project.feishuManaged) {
      var activeFeishuDevices = Array.isArray(context.project.feishuDeviceNames) ? context.project.feishuDeviceNames : [];
      devices = devices.filter(function (item) {
        return !!item.feishuManaged && (!activeFeishuDevices.length || activeFeishuDevices.indexOf(item.feishuDeviceName) >= 0);
      });
    }
    var deviceCards = devices.map(function (item) {
      var stageState = foundationState.deviceStates && foundationState.deviceStates[item.id] || {};
      return Object.assign({}, item, { currentStage: stageState.actualStageIndex || 1 });
    });
    var projectIndex = Math.max(0, projects.findIndex(function (item) { return item.id === context.project.id; }));
    var deviceIndex = Math.max(0, devices.findIndex(function (item) { return item.id === context.device.id; }));
    var scopedDefects = (state.defects || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    var scopedInspections = (state.inspections || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    var dashboardState = Object.assign({}, state, { defects: scopedDefects, inspections: scopedInspections });
    var now = new Date();
    var allDefects = state.defects || [];
    var projectCards = projects.map(function (item) {
      var projectDevices = v4Foundation.getDevicesByProject(foundationState, item.id);
      var progressTotal = projectDevices.reduce(function (sum, device) {
        var deviceState = foundationState.deviceStates && foundationState.deviceStates[device.id];
        return sum + Number(deviceState && deviceState.overallProgress || 0);
      }, 0);
      return Object.assign({}, item, {
        deviceCount: projectDevices.length,
        progress: projectDevices.length ? Math.round(progressTotal / projectDevices.length) : 0,
        pendingCount: allDefects.filter(function (defect) {
          return defect.projectId === item.id && defect.status !== 'closed';
        }).length
      });
    });
    var time = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var reminders = app.updateTabBarReminderBadges();
    var constructionStages = (context.deviceState.stageProgress || []).map(engineeringIcons.withStageIcon);
    var actualStageProgress = constructionStages.find(function (item) {
      return Number(item.index) === Number(context.stage.index);
    }) || constructionStages[0] || {};
    var actualStageDetail = app.getConstructionProgress(context.stage.index);
    var activeLogisticsAlerts = actualStageDetail && Array.isArray(actualStageDetail.allActiveAlerts)
      ? actualStageDetail.allActiveAlerts : [];
    var topLogisticsAlert = activeLogisticsAlerts[0] || null;
    var arrivalOverallProgress = constructionStages.length
      ? Math.round(constructionStages.reduce(function (sum, item) { return sum + Number(item.arrivedProgress || 0); }, 0) / constructionStages.length)
      : 0;
    var installationOverallProgress = Math.round(Number(context.deviceState.overallProgress || 0));
    this.setData({
      project: Object.assign({}, context.project, {
        drawingNo: context.project.drawingNo || context.template.drawingNo,
        layout: context.template.layout,
        deviceName: context.device.name,
        stage: context.stage.name
      }),
      device: context.device,
      modelProjectName: String(context.project && (context.project.shortName || context.project.name) || ''),
      modelDeviceName: String(context.device && context.device.name || ''),
      projects: projects,
      projectNames: projects.map(function (item) { return item.name; }),
      projectCards: projectCards,
      projectIndex: projectIndex,
      devices: deviceCards,
      deviceNames: devices.map(function (item) { return item.name; }),
      deviceIndex: deviceIndex,
      actualStageIndex: context.stage.index,
      actualStageName: context.stage.name,
      actualStageIcon: engineeringIcons.forStage(context.stage.index),
      actualStageProgress: Number(actualStageProgress.installedProgress || actualStageProgress.progress || 0),
      logisticsAlertCount: activeLogisticsAlerts.length,
      logisticsAlertLevel: topLogisticsAlert ? topLogisticsAlert.level : 'green',
      logisticsAlertLevelName: topLogisticsAlert ? topLogisticsAlert.levelName : '正常',
      logisticsAlertText: topLogisticsAlert ? topLogisticsAlert.title : '库存与运输时间充足',
      logisticsAlertStageIndex: topLogisticsAlert
        ? Number(topLogisticsAlert.targetIndex || topLogisticsAlert.sourceIndex || context.stage.index)
        : context.stage.index,
      modelPartSelected: false,
      selectedPartName: actualStageProgress.shortName || context.stage.shortName || context.stage.name,
      selectedMetricLabel: '施工进度',
      selectedMetricProgress: Number(actualStageProgress.installedProgress || actualStageProgress.progress || 0),
      arrivalOverallProgress: arrivalOverallProgress,
      installationOverallProgress: installationOverallProgress,
      modelStageIndex: context.stage.index,
      modelStageName: context.stage.name,
      modelStageIcon: engineeringIcons.forStage(context.stage.index),
      selectedStageProgress: actualStageProgress,
      stageScrollLeft: Math.max(0, (context.stage.index - 5) * 105),
      overallProgress: context.deviceState.overallProgress,
      healthScore: context.deviceState.qualityScore || state.qualityScore || state.healthScore,
      healthMetrics: state.qualityMetrics || state.healthMetrics,
      qualityStatusName: context.deviceState.qualityStatusName,
      qualityStatus: context.deviceState.qualityStatus,
      modelRegions: v3Data.buildModelRegions(scopedDefects),
      dashboardStats: v3Data.getDashboardStats(dashboardState),
      reminderCount: reminders.rectification,
      inspections: scopedInspections.slice(0, 3),
      constructionStages: constructionStages,
      completedStageCount: constructionStages.filter(function (item) { return item.status === 'completed'; }).length,
      openDefects: scopedDefects.filter(function (d) { return d.status !== 'closed'; }).slice(0, 3),
      currentTime: time
      , feishuIdentity: app.getFeishuIdentity()
      , currentProjectCanEdit: app.canEditCurrentProject()
    });
  },

  onProjectChange: function (e) {
    var index = Number(e.detail.value) || 0;
    var project = this.data.projects[index];
    if (project && app.switchProject(project.id)) this.refreshDashboard();
  },

  onDeviceChange: function (e) {
    var index = Number(e.detail.value) || 0;
    var device = this.data.devices[index];
    if (device && app.switchDevice(device.id)) this.refreshDashboard();
  },

  setOverlayState: function (updates) {
    var next = Object.assign({}, updates || {});
    var overlayKeys = ['showProjectSheet', 'showDeviceSheet', 'showArrivalSheet', 'showSettings'];
    var overlayOpen = overlayKeys.some(function (key) {
      return Object.prototype.hasOwnProperty.call(next, key) ? !!next[key] : !!this.data[key];
    }, this);
    next.modelCanvasVisible = !overlayOpen;
    this.setData(next);
  },

  openProjectSheet: function () {
    if (!app.getFeishuIdentity().bound) {
      wx.showModal({
        title: '请先绑定飞书账号',
        content: '绑定后可以查看全部项目，并按飞书“项目负责人”权限编辑自己负责的项目。',
        confirmText: '去绑定',
        success: function (res) { if (res.confirm) app.openFeishuAccount(); }
      });
      return;
    }
    this.setData({ projectSearchKeyword: '', projectFilter: 'all' });
    this.setOverlayState({ showProjectSheet: true });
    this.loadFeishuProjectCatalog(false);
  },
  closeProjectSheet: function () { this.setOverlayState({ showProjectSheet: false }); },
  openDeviceSheet: function () {
    if (!this.data.project.feishuProjectName) {
      this.setOverlayState({ showProjectSheet: true, showDeviceSheet: false });
      this.loadFeishuProjectCatalog(false);
      wx.showToast({ title: '请先选择飞书项目', icon: 'none' });
      return;
    }
    this.setOverlayState({ showDeviceSheet: true });
  },
  closeDeviceSheet: function () { this.setOverlayState({ showDeviceSheet: false }); },
  openArrivalSheet: function () { wx.navigateTo({ url: '/pages/arrival-srm/arrival-srm' }); },
  closeArrivalSheet: function () { this.setOverlayState({ showArrivalSheet: false }); },
  loadFeishuProjectCatalog: function (showError, forceRefresh) {
    var self = this;
    if (this.data.feishuCatalogLoading) return;
    this.setData({ feishuCatalogLoading: true, feishuCatalogError: '' });
    app.loadFeishuProjectOptions({ forceRefresh: !!forceRefresh }).then(function (result) {
      var projects = result.projects || [];
      // A permission refresh must also update the project that is already
      // selected. Otherwise the picker can show the new permission while the
      // dashboard keeps an old cached “仅查看” flag until the user reselects it.
      var context = app.getFoundationContext();
      var selectedName = String(context.project && context.project.feishuProjectName || '').trim();
      var selectedOption = projects.find(function (item) {
        return String(item && item.name || '').trim() === selectedName;
      });
      if (selectedOption && context.project) {
        context.project.canEdit = selectedOption.canEdit === true;
        context.project.permissionLabel = context.project.canEdit ? '我负责' : '仅查看';
        context.project.feishuManagerNames = Array.isArray(selectedOption.managerNames) ? selectedOption.managerNames : [];
        app.saveFoundationState();
      }
      self.setData({
        feishuCatalogLoading: false,
        feishuProjects: projects,
        ownedProjectCount: projects.filter(function (item) { return item.canEdit === true; }).length,
        defectProjectCount: projects.filter(function (item) { return Number(item.taskCount || 0) > 0; }).length,
        feishuCatalogSyncedAt: result.syncedAt || '',
        feishuCatalogError: result.staleClientCache
          ? '当前显示上次成功读取的项目；' + (result.refreshError || '本次刷新暂未成功，请稍后重试')
          : (projects.length ? '' : '飞书表中暂未读取到已填写项目名称的记录')
      }, function () { self.applyProjectFilter(); });
      if (showError && result.staleClientCache) wx.showToast({ title: '已保留上次项目列表', icon: 'none' });
      if (selectedOption) self.refreshDashboard();
    }).catch(function (error) {
      var message = error && error.message || '无法读取飞书项目列表';
      self.setData({ feishuCatalogLoading: false, feishuCatalogError: message });
      if (error && (error.code === 'FEISHU_ACCOUNT_NOT_BOUND' || error.code === 'FEISHU_REAUTH_REQUIRED')) {
        self.setOverlayState({ showProjectSheet: false });
        wx.showModal({
          title: error.code === 'FEISHU_REAUTH_REQUIRED' ? '需要重新绑定飞书' : '请先绑定飞书账号',
          content: message,
          showCancel: false,
          success: function () { app.openFeishuAccount(); }
        });
        return;
      }
      if (showError) wx.showModal({ title: '读取飞书项目失败', content: message, showCancel: false });
    });
  },
  applyProjectFilter: function () {
    var keyword = String(this.data.projectSearchKeyword || '').trim().toLowerCase();
    var filter = this.data.projectFilter || 'all';
    var list = (this.data.feishuProjects || []).map(function (item, index) {
      return Object.assign({}, item, { _sourceIndex: index });
    }).filter(function (item) {
      if (keyword && String(item.name || '').toLowerCase().indexOf(keyword) < 0) return false;
      if (filter === 'owned' && item.canEdit !== true) return false;
      if (filter === 'defect' && Number(item.taskCount || 0) <= 0) return false;
      return true;
    });
    this.setData({ displayFeishuProjects: list });
  },
  onProjectSearchInput: function (event) {
    var self = this;
    this.setData({ projectSearchKeyword: event.detail.value || '' }, function () { self.applyProjectFilter(); });
  },
  setProjectFilter: function (event) {
    var self = this;
    this.setData({ projectFilter: event.currentTarget.dataset.filter || 'all' }, function () { self.applyProjectFilter(); });
  },
  refreshFeishuProjectCatalog: function () { this.loadFeishuProjectCatalog(true, true); },
  selectFeishuProject: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var option = this.data.feishuProjects[index];
    if (!option) return;
    try {
      var result = app.bindFeishuProjectSelection(option, '');
      this.setOverlayState({ showProjectSheet: false, showDeviceSheet: !!(result.devices && result.devices.length > 1) });
      this.refreshDashboard();
      if (result.devices && result.devices.length === 1) this.syncSelectedFeishuTasks();
      else wx.showToast({ title: '请选择炉号', icon: 'none' });
    } catch (error) {
      wx.showModal({ title: '无法选择项目', content: error.message || '该项目缺少炉号', showCancel: false });
    }
  },
  selectDevice: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id && app.switchDevice(id)) {
      this.setOverlayState({ showDeviceSheet: false });
      this.refreshDashboard();
      this.syncSelectedFeishuTasks();
    }
  },
  syncSelectedFeishuTasks: function (forceRefresh) {
    var self = this;
    wx.showLoading({ title: '同步飞书缺陷', mask: true });
    app.refreshFeishuRectificationTasks({ forceRefresh: !!forceRefresh }).then(function (result) {
      wx.hideLoading();
      var context = app.getFoundationContext();
      if (context.project) {
        context.project.canEdit = result.canEditProject === true;
        context.project.permissionLabel = result.canEditProject === true ? '我负责' : '仅查看';
        app.saveFoundationState();
      }
      self.refreshDashboard();
      wx.showToast({ title: '已同步 ' + Number(result.count || 0) + ' 项缺陷', icon: 'none' });
    }).catch(function (error) {
      wx.hideLoading();
      wx.showModal({ title: '项目已选择，同步失败', content: error.message || '请检查飞书云函数配置', showCancel: false });
    });
  },

  onStageTap: function (e) {
    var index = Number(e.currentTarget.dataset.index) || 1;
    this.selectStagePreview(index);
  },

  selectStagePreview: function (stageIndex) {
    var index = Math.max(1, Math.min(13, Number(stageIndex) || 1));
    var stage = (this.data.constructionStages || []).find(function (item) {
      return Number(item.index) === index;
    });
    if (!stage) return;
    var progress = Number(stage.installedProgress || stage.progress || 0);
    this.setData({
      modelStageIndex: stage.index,
      modelStageName: stage.name,
      modelStageIcon: stage.iconPath || engineeringIcons.forStage(stage.index),
      selectedStageProgress: stage,
      stageScrollLeft: Math.max(0, (stage.index - 5) * 105),
      modelPartSelected: true,
      selectedPartName: stage.shortName || stage.name || '当前部件',
      selectedMetricLabel: '施工进度',
      selectedMetricProgress: Math.round(progress),
      selectedStatusText: progress >= 100 ? '安装完成' : progress > 0 ? '安装中' : '待安装',
      selectedStatusClass: progress >= 100 ? 'complete' : progress > 0 ? 'working' : 'pending'
    });
  },

  openSelectedStageProgress: function () {
    this.openConstructionProgress(this.data.modelStageIndex, 'stage-management');
  },

  openLogisticsAlert: function () {
    this.openConstructionProgress(this.data.logisticsAlertStageIndex, 'logistics-alert');
  },

  onModelNodeTap: function (e) {
    var detail = e.detail || {};
    var id = String(detail.id || '').toLowerCase();
    var region = detail.region || {};
    var areaKey = String(region.areaKey || region.key || '').toLowerCase();
    var index = this.resolveConstructionStage(id, areaKey);
    this.selectStagePreview(index);
    this.openConstructionProgress(index, 'model');
  },

  onTwinPartTap: function (e) {
    var detail = e.detail || {};
    var stage = this.data.selectedStageProgress || {};
    var progress = Number(stage.installedProgress || stage.progress || 0);
    var statusText = progress >= 100 ? '安装完成' : progress > 0 ? '安装中' : '待安装';
    this.setData({
      modelPartSelected: true,
      selectedPartName: (stage.shortName || this.data.modelStageName || '当前部件') + (detail.name ? ' · ' + detail.name : ''),
      selectedMetricLabel: '施工进度',
      selectedMetricProgress: Math.round(progress),
      selectedStatusText: statusText,
      selectedStatusClass: progress >= 100 ? 'complete' : progress > 0 ? 'working' : 'pending'
    });
  },

  openSelectedPart: function () {
    this.openConstructionProgress(this.data.modelStageIndex, 'model-part');
  },

  openModelOverview: function () {
    this.openConstructionProgress(this.data.modelStageIndex, 'model-overview');
  },

  openConstructionProgress: function (stageIndex, source) {
    var index = Math.max(1, Math.min(13, Number(stageIndex) || Number(this.data.modelStageIndex) || 1));
    wx.navigateTo({
      url: '/pages/construction-progress/construction-progress?stageIndex=' + index + '&source=' + encodeURIComponent(source || 'model')
    });
  },

  resolveConstructionStage: function (id, areaKey) {
    var text = String(id || '') + ' ' + String(areaKey || '');
    if (/support|seat|支座/.test(text)) return 1;
    if (/foundation|beam|基础/.test(text)) return 2;
    if (/steel|frame|钢支架/.test(text)) return 3;
    if (/hopper|ash|灰斗/.test(text)) return 4;
    if (/shell|casing|壳体|chamber/.test(text)) return 5;
    if (/inlet|outlet|horn|喇叭/.test(text)) return 6;
    if (/anode|阳极/.test(text)) return 7;
    if (/cathode|阴极/.test(text)) return 8;
    if (/rapping|振打/.test(text)) return 9;
    if (/high-voltage|hv|高压/.test(text)) return 10;
    if (/platform|stair|hoist|平台|扶梯|起吊/.test(text)) return 11;
    if (/electric|instrument|meter|电气|仪表/.test(text)) return 12;
    return Number(this.data.modelStageIndex) || 1;
  },

  goAI: function () { wx.navigateTo({ url: '/pages/inspect/inspect' }); },
  goProcessRecords: function () { wx.navigateTo({ url: '/pages/process-records/process-records' }); },
  goArrival: function () { wx.navigateTo({ url: '/pages/arrival-srm/arrival-srm' }); },
  goProjects: function () { wx.navigateTo({ url: '/pages/project-management/project-management' }); },
  goModel: function () { wx.navigateTo({ url: '/pages/device-model/device-model' }); },
  goDefects: function () { wx.navigateTo({ url: '/pages/defect-management/defect-management' }); },
  goReports: function () { wx.navigateTo({ url: '/pages/report-center/report-center' }); },
  goRectificationCenter: function () { wx.navigateTo({ url: '/pages/history/history' }); },
  goReminderSettings: function () { wx.navigateTo({ url: '/pages/reminder-settings/reminder-settings' }); },

  openSettings: function () {
    var cfg = app.globalData.aiConfig || {};
    this.setOverlayState({
      showSettings: true,
      showProjectSheet: false,
      config: {
        provider: cfg.provider || 'qwen', endpoint: cfg.endpoint || '',
        model: cfg.model || '', demoMode: !!cfg.demoMode
      },
      featureSettings: Object.assign({}, app.globalData.featureSettings || {}),
      aiServiceStatus: 'checking',
      aiServiceStatusText: '正在检测云端智能配置...'
    });
    this.checkAIServiceStatus();
  },
  checkAIServiceStatus: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      self.setData({ aiServiceStatus: 'offline', aiServiceStatusText: '当前环境不支持微信云开发' });
      return;
    }
    wx.cloud.callFunction({
      name: 'ai-analyze',
      data: {
        action: 'status',
        endpoint: self.data.config.endpoint,
        model: self.data.config.model
      },
      success: function (res) {
        var result = res.result || {};
        if (result.success && result.configured) {
          self.setData({ aiServiceStatus: 'ready', aiServiceStatusText: '智能服务已就绪（密钥保存在云端）' });
        } else {
          self.setData({ aiServiceStatus: 'missing', aiServiceStatusText: '云端API Key尚未配置，可先开启演示模式' });
        }
      },
      fail: function () {
        self.setData({ aiServiceStatus: 'offline', aiServiceStatusText: '无法检测云函数，请确认ai-analyze已部署' });
      }
    });
  },
  closeSettings: function () { this.setOverlayState({ showSettings: false }); },
  selectProvider: function (e) {
    var provider = e.currentTarget.dataset.provider;
    var preset = PROVIDER_PRESETS[provider];
    this.setData({ 'config.provider': provider, 'config.endpoint': preset.endpoint, 'config.model': preset.model });
  },
  onConfigInput: function (e) {
    var field = e.currentTarget.dataset.field;
    var update = {}; update['config.' + field] = e.detail.value; this.setData(update);
  },
  toggleDemo: function () { this.setData({ 'config.demoMode': !this.data.config.demoMode }); },
  enableDemoMode: function () {
    this.setData({ 'config.demoMode': true });
    wx.showToast({ title: '已开启演示模式', icon: 'success' });
  },
  toggleQuality: function () { this.setData({ 'featureSettings.qualityCheck': !this.data.featureSettings.qualityCheck }); },
  toggleAreaDetect: function () { this.setData({ 'featureSettings.autoAreaDetect': !this.data.featureSettings.autoAreaDetect }); },
  saveSettings: function () {
    if (!this.data.config.demoMode && !this.data.config.endpoint) {
      wx.showToast({ title: '请完善智能服务配置', icon: 'none' }); return;
    }
    app.globalData.aiConfig = Object.assign({}, this.data.config);
    app.globalData.featureSettings = Object.assign({}, this.data.featureSettings);
    app.saveConfig(); app.saveFeatureSettings();
    this.setOverlayState({ showSettings: false });
    wx.showToast({ title: '配置已保存', icon: 'success' });
  }
});
