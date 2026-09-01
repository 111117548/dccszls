var app = getApp();

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
  data: {
    stageIndex: 1,
    projectName: '', deviceName: '', stage: {}, metric: {},
    isCurrentStage: true, canManage: false, hasManifest: false,
    demandValue: 0, arrivalValue: 0, installedValue: 0, summaryUnit: '箱', summarySource: '',
    actualProgress: 0, displayProgress: 0, progressKind: '实际', mode: 'actual',
    form: { actualProgress: 0, dailyPercent: 5, preparePercent: 75, dispatchPercent: 80 },
    projection: {}, nextStageName: '', warning: {}, activeRatioAlert: null,
    correctionOpen: false, correctionForm: { demand: '', arrival: '', unit: '箱' },
    saving: false, handlingAlert: false
  },

  onLoad: function (options) {
    this.setData({ stageIndex: Math.max(1, Math.min(13, Number(options.stageIndex) || 1)) });
  },

  onShow: function () { this.loadProgress(); },

  loadProgress: function () {
    var context = app.getFoundationContext();
    var detail = app.getConstructionProgress(this.data.stageIndex);
    var metric = detail.metric || {};
    var projection = detail.analytics && detail.analytics.projection || {};
    var override = metric.summaryOverrideEnabled && Number(metric.summaryDemandQuantity || 0) > 0;
    var manifest = !override && Number(metric.manifestPlannedPackages || 0) > 0;
    var demand = override ? Number(metric.summaryDemandQuantity || 0) : manifest ? Number(metric.manifestPlannedPackages || 0) : Number(metric.plannedQuantity || 0);
    var arrival = override ? Number(metric.summaryArrivalQuantity || 0) : manifest ? Number(metric.manifestArrivedPackages || 0) : Number(metric.arrivedQuantity || 0);
    var unit = override ? (metric.summaryUnit || '箱') : manifest ? '箱' : (detail.stage.unit || '件');
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
      demandValue: fixed(demand, 1), arrivalValue: fixed(arrival, 1), installedValue: fixed(installedValue, 1),
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
      correctionForm: { demand: fixed(demand, 1), arrival: fixed(arrival, 1), unit: unit }
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

  toggleCorrection: function () {
    if (!this.data.isCurrentStage || !this.data.canManage) {
      wx.showToast({ title: this.data.isCurrentStage ? '当前项目仅可查看' : '只能调整当前施工部件', icon: 'none' });
      return;
    }
    this.setData({ correctionOpen: !this.data.correctionOpen });
  },

  onCorrectionInput: function (event) {
    var changes = {};
    changes['correctionForm.' + event.currentTarget.dataset.field] = event.detail.value;
    this.setData(changes);
  },

  saveCorrection: function () {
    var demand = numberValue(this.data.correctionForm.demand);
    var arrival = numberValue(this.data.correctionForm.arrival);
    if (demand <= 0 || arrival < 0 || arrival > demand) {
      wx.showToast({ title: '请检查需求和到货数量', icon: 'none' });
      return;
    }
    var saved = app.updateConstructionProgress(this.data.stageIndex, {
      summaryOverrideEnabled: true, summaryDemandQuantity: demand, summaryArrivalQuantity: arrival,
      summaryUnit: this.data.correctionForm.unit || '箱', note: '人工校正需求与到货汇总'
    });
    if (!saved) return;
    this.setData({ correctionOpen: false });
    this.loadProgress();
    wx.showToast({ title: '汇总数量已校正', icon: 'success' });
  },

  restoreManifest: function () {
    var saved = app.updateConstructionProgress(this.data.stageIndex, { summaryOverrideEnabled: false, note: '恢复使用需求总清单汇总' });
    if (!saved) return;
    this.setData({ correctionOpen: false });
    this.loadProgress();
    wx.showToast({ title: '已恢复清单数据', icon: 'success' });
  },

  setAsCurrentStage: function () {
    var saved = app.setCurrentConstructionStage(this.data.stageIndex, '设为当前施工部件');
    if (!saved) return;
    this.loadProgress();
    wx.showToast({ title: '已设为当前部件', icon: 'success' });
  },

  openArrivalLedger: function () { wx.navigateTo({ url: '/pages/arrival-srm/arrival-srm' }); },

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
