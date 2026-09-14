var app = getApp();
var arrivalImport = require('../../utils/arrival-import.js');

function numberValue(value) {
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : 0;
}

function fixed(value, digits) {
  var number = Number(value);
  if (!isFinite(number)) return '0';
  return number.toFixed(digits == null ? 1 : digits).replace(/\.0+$/, '');
}

function todayText() {
  var date = new Date();
  function pad(value) { return value < 10 ? '0' + value : String(value); }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function dateAfter(days) {
  var date = new Date();
  date.setDate(date.getDate() + Math.max(0, Math.ceil(Number(days) || 0)));
  function pad(value) { return value < 10 ? '0' + value : String(value); }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    stageIndex: 1,
    projectName: '', deviceName: '', stage: {}, metric: {},
    isCurrentStage: true, canManage: false, hasManifest: false,
    demandValue: 0, arrivalValue: 0, arrivalProgress: 0, installedValue: 0, summaryUnit: '箱', summarySource: '',
    actualProgress: 0, displayProgress: 0, progressKind: '实际', mode: 'actual',
    form: { actualProgress: 0, dailyPercent: 5, preparePercent: 75, dispatchPercent: 80 },
    projection: {}, nextStageName: '', warning: {}, activeRatioAlert: null,
    arrivalMode: 'manual', arrivalForm: { quantity: '' }, arrivalImporting: false, arrivalProgressText: '',
    saving: false, arrivalSaving: false, handlingAlert: false
  },

  onLoad: function (options) {
    options = options || {};
    var catalog = require('../../utils/stage-catalog');
    var stage = catalog.STAGES.find(function (item) { return item.id === catalog.canonicalId(options.stageId); });
    this.setData({ stageIndex: stage ? stage.index : Math.max(1, Math.min(13, Number(options.stageIndex) || 1)) });
  },

  onShow: function () { this.loadProgress(); },

  loadProgress: function () {
    var context = app.getFoundationContext();
    var detail = app.getConstructionProgress(this.data.stageIndex);
    var metric = detail.metric || {};
    var projection = detail.analytics && detail.analytics.projection || {};
    var manifest = Number(metric.manifestPlannedPackages || 0) > 0;
    var override = !manifest && metric.summaryOverrideEnabled && Number(metric.summaryDemandQuantity || 0) > 0;
    var demand = override ? Number(metric.summaryDemandQuantity || 0) : manifest ? Number(metric.manifestPlannedPackages || 0) : Number(metric.plannedQuantity || 0);
    var arrival = override ? Number(metric.summaryArrivalQuantity || 0) : manifest ? Number(metric.manifestArrivedPackages || 0) : Number(metric.arrivedQuantity || 0);
    var arrivalProgress = demand > 0 ? Math.round(arrival / demand * 1000) / 10 : 0;
    var unit = override ? (metric.summaryUnit || '箱') : manifest ? '箱' : (metric.unit || detail.stage.unit || '件');
    var actualProgress = Number(projection.actualProgress || detail.installedProgress || 0);
    var displayProgress = projection.mode === 'forecast' ? Number(projection.projectedProgress || actualProgress) : actualProgress;
    var installedValue = Math.round(demand * actualProgress) / 100;
    var dependencies = detail.dependencies || [];
    var nextStageName = dependencies.map(function (item) { return item.targetStage.shortName || item.targetStage.name; }).join('、');
    var ratioAlerts = (detail.allActiveAlerts || []).filter(function (item) {
      return item.type === 'ratio' && Number(item.sourceIndex) === Number(detail.stage.index);
    });
    var activeRatioAlert = ratioAlerts[0] || null;
    var warning = this.buildWarning(projection, nextStageName, activeRatioAlert);
    this.setData({
      projectName: context.project && context.project.name || '当前项目',
      deviceName: context.device && context.device.name || '当前设备',
      stage: detail.stage || {}, metric: metric,
      isCurrentStage: Number(context.stage.index) === Number(this.data.stageIndex),
      canManage: app.canEditCurrentProject(), hasManifest: manifest,
      demandValue: fixed(demand, 1), arrivalValue: fixed(arrival, 1), arrivalProgress: arrivalProgress, installedValue: fixed(installedValue, 1),
      summaryUnit: unit, summarySource: override ? '人工校正' : manifest ? '需求总清单' : '阶段计划',
      actualProgress: actualProgress, displayProgress: displayProgress,
      progressKind: projection.mode === 'forecast' ? '预测' : '实际', mode: projection.mode || 'actual',
      projection: projection, nextStageName: nextStageName, warning: warning, activeRatioAlert: activeRatioAlert,
      form: {
        actualProgress: fixed(actualProgress, 1),
        dailyPercent: fixed(metric.forecastDailyPercent == null ? 5 : metric.forecastDailyPercent, 1),
        preparePercent: fixed(metric.warningPreparePercent == null ? 75 : metric.warningPreparePercent, 0),
        dispatchPercent: fixed(metric.warningDispatchPercent == null ? 80 : metric.warningDispatchPercent, 0)
      },
      arrivalForm: { quantity: fixed(arrival, 0) }
    });
  },

  buildWarning: function (projection, nextStageName, activeAlert) {
    if (activeAlert) return { level: activeAlert.level || 'yellow', title: activeAlert.title, message: activeAlert.message };
    if (!nextStageName) return { level: 'normal', title: '当前阶段无需触发后续发货', message: '完成后进入调试验收或项目收尾。' };
    var prepare = Number(projection.prepareThreshold || 75);
    var dispatch = Number(projection.dispatchThreshold || 80);
    var progress = Number(projection.effectiveProgress || projection.actualProgress || 0);
    if (progress >= dispatch) return { level: 'orange', title: '请安排' + nextStageName + '发货', message: '当前进度已达到' + fixed(dispatch, 0) + '%发货预警值。' };
    if (progress >= prepare) return { level: 'yellow', title: '提前准备' + nextStageName + '发货', message: '当前进度已达到' + fixed(prepare, 0) + '%提前预警值。' };
    if (projection.mode === 'forecast' && projection.daysToPrepare != null) {
      return { level: 'yellow', title: '预计' + projection.daysToPrepare + '天后达到' + fixed(prepare, 0) + '%', message: '请提前准备' + nextStageName + '发货，预计触发日期 ' + projection.prepareDate + '。' };
    }
    return { level: 'normal', title: '尚未达到发货预警值', message: '实际进度达到' + fixed(prepare, 0) + '%时提醒准备' + nextStageName + '发货。' };
  },

  switchMode: function (event) {
    if (!this.data.isCurrentStage || !this.data.canManage) return;
    var self = this;
    this.setData({ mode: event.currentTarget.dataset.mode === 'forecast' ? 'forecast' : 'actual' }, function () {
      if (self.data.mode === 'forecast') self.refreshForecastPreview();
    });
  },

  onFormInput: function (event) {
    var changes = {};
    changes['form.' + event.currentTarget.dataset.field] = event.detail.value;
    var self = this;
    this.setData(changes, function () {
      if (self.data.mode === 'forecast') self.refreshForecastPreview();
    });
  },

  refreshForecastPreview: function () {
    var daily = numberValue(this.data.form.dailyPercent);
    var prepare = numberValue(this.data.form.preparePercent);
    var dispatch = numberValue(this.data.form.dispatchPercent);
    var actual = Number(this.data.actualProgress || 0);
    var prepareDays = daily > 0 ? Math.max(0, Math.ceil((prepare - actual) / daily)) : null;
    var dispatchDays = daily > 0 ? Math.max(0, Math.ceil((dispatch - actual) / daily)) : null;
    this.setData({
      'projection.daysToPrepare': prepareDays,
      'projection.daysToDispatch': dispatchDays,
      'projection.prepareDate': prepareDays == null ? '' : dateAfter(prepareDays),
      'projection.dispatchDate': dispatchDays == null ? '' : dateAfter(dispatchDays),
      'projection.dailyPercent': daily
    });
  },

  saveProgressMode: function () {
    if (this.data.saving || !this.data.isCurrentStage || !this.data.canManage) return;
    var form = this.data.form;
    var prepare = numberValue(form.preparePercent);
    var dispatch = numberValue(form.dispatchPercent);
    if (prepare < 50 || prepare > 95 || dispatch < prepare || dispatch > 100) {
      wx.showToast({ title: '请检查75%和80%预警值', icon: 'none' });
      return;
    }
    var payload = { progressMode: this.data.mode, warningPreparePercent: prepare, warningDispatchPercent: dispatch };
    if (this.data.mode === 'actual') {
      var actual = numberValue(form.actualProgress);
      if (actual < 0 || actual > 100) { wx.showToast({ title: '安装进度应为0—100%', icon: 'none' }); return; }
      payload.actualProgressPercent = actual;
      payload.note = '更新当前阶段实际安装进度';
    } else {
      var daily = numberValue(form.dailyPercent);
      if (daily < 0.1 || daily > 30) { wx.showToast({ title: '每日速度应为0.1%—30%', icon: 'none' }); return; }
      payload.forecastDailyPercent = daily;
      payload.forecastBasePercent = this.data.actualProgress;
      payload.forecastBaseDate = todayText();
      payload.note = '启用安装速度推演';
    }
    this.setData({ saving: true });
    try {
      var saved = app.updateConstructionProgress(this.data.stageIndex, payload);
      this.setData({ saving: false });
      if (!saved) return;
      this.loadProgress();
      wx.showToast({ title: this.data.mode === 'actual' ? '实际进度已保存' : '速度推演已启用', icon: 'success' });
    } catch (error) {
      this.setData({ saving: false });
      wx.showModal({ title: '保存失败', content: error.message || '请检查填写内容', showCancel: false });
    }
  },

  switchArrivalMode: function (event) {
    if (!this.data.canManage || !this.data.hasManifest) return;
    this.setData({ arrivalMode: event.currentTarget.dataset.mode === 'import' ? 'import' : 'manual' });
  },

  onArrivalInput: function (event) {
    var quantity = Number(event.detail.value);
    var demand = Number(this.data.demandValue || 0);
    this.setData({
      'arrivalForm.quantity': event.detail.value,
      arrivalProgress: isFinite(quantity) && demand > 0 ? Math.max(0, Math.min(100, Math.round(quantity / demand * 1000) / 10)) : 0
    });
  },

  saveArrivalQuantity: function () {
    if (this.data.arrivalSaving || !this.data.canManage || !this.data.hasManifest) return;
    var quantity = Number(this.data.arrivalForm.quantity);
    var demand = Number(this.data.demandValue || 0);
    if (!isFinite(quantity) || quantity < 0 || Math.floor(quantity) !== quantity || quantity > demand) {
      wx.showToast({ title: '到货数量应为0—' + demand + '箱的整数', icon: 'none' });
      return;
    }
    this.setData({ arrivalSaving: true });
    try {
      var saved = app.updateStageArrivalQuantity(this.data.stageIndex, quantity);
      this.setData({ arrivalSaving: false });
      if (!saved) return;
      this.loadProgress();
      wx.showToast({ title: '到货数量已汇总', icon: 'success' });
    } catch (error) {
      this.setData({ arrivalSaving: false });
      this.loadProgress();
      wx.showModal({ title: '保存失败', content: error.message || '请检查到货数量', showCancel: false });
    }
  },

  importArrivalFile: function () {
    var self = this;
    if (this.data.arrivalImporting || !this.data.canManage || !this.data.hasManifest) return;
    this.setData({ arrivalImporting: true, arrivalProgressText: '请选择实际到货清单…' });
    arrivalImport.chooseAndParse({
      type: 'arrival', context: app.getFoundationContext(),
      onProgress: function (text) { self.setData({ arrivalProgressText: text }); }
    }).then(function (parsed) {
      var detail = app.importArrivalReceiptManifest(parsed);
      if (!detail) throw new Error('当前账号没有编辑该项目的权限');
      self.setData({ arrivalImporting: false, arrivalProgressText: '' });
      self.loadProgress();
      var imported = detail.lastImport || {};
      var vehicleText = Number(imported.vehicleCount || 0) > 1 ? '识别 ' + Number(imported.vehicleCount) + ' 车、' : '';
      var breakdown = (imported.stageBreakdown || []).filter(function (item) { return Number(item.matchedPackages || 0) > 0; });
      var breakdownText = breakdown.length ? '\n\n部件归类：\n' + breakdown.map(function (item) {
        return item.stageName + ' ' + Number(item.matchedPackages || 0) + '箱';
      }).join('；') : '';
      wx.showModal({
        title: '到货清单已计入台账',
        content: vehicleText + '读取 ' + Number(imported.packageCount || 0) + ' 个实际箱件；匹配需求 ' + Number(imported.matchedDemandPackages || imported.matchedPackages || 0) + ' 箱，新增到货 ' + Number(imported.addedPackages || 0) + ' 箱；拆分箱归并 ' + Number(imported.consolidatedPackages || 0) + ' 个，重复 ' + Number(imported.duplicatePackages || 0) + ' 个，未匹配 ' + Number(imported.unmatchedPackages || 0) + ' 个。' + breakdownText,
        showCancel: false
      });
    }).catch(function (error) {
      self.setData({ arrivalImporting: false, arrivalProgressText: '' });
      arrivalImport.showPickerError(error, '实际到货清单');
    });
  },

  setAsCurrentStage: function () {
    var saved = app.setCurrentConstructionStage(this.data.stageIndex, '设为当前施工部件');
    if (!saved) return;
    this.loadProgress();
    wx.showToast({ title: '已设为当前部件', icon: 'success' });
  },

  openArrivalLedger: function () { wx.navigateTo({ url: '/pages/arrival-srm/arrival-srm' }); },

  openFeatureGuide: function () { wx.navigateTo({ url: '/pages/feature-guide/feature-guide?feature=progress' }); },

  handleAlert: function () {
    if (!this.data.activeRatioAlert || this.data.handlingAlert) return;
    var self = this;
    wx.showModal({
      title: '确认已安排发货', content: '确认后本次预警不再重复提醒。', confirmText: '已安排',
      success: function (result) {
        if (!result.confirm) return;
        self.setData({ handlingAlert: true });
        app.acknowledgeConstructionAlert(self.data.activeRatioAlert.id, '项目经理已安排发货');
        self.setData({ handlingAlert: false });
        self.loadProgress();
      }
    });
  }
});
