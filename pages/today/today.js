var app = getApp();

function todayLabel() {
  var date = new Date();
  return '今天 ' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

Page({
  data: {
    dateLabel: '', total: 0,
    logisticsCount: 0, logisticsStageIndex: 1, logisticsText: '',
    aiCount: 0, processCount: 0, rectificationCount: 0,
    rectificationText: ''
  },

  onShow: function () { this.loadReminders(); },

  loadReminders: function () {
    var context = app.getFoundationContext();
    var state = app.getV3State();
    var detail = app.getConstructionProgress(context.stage.index);
    var alerts = detail.allActiveAlerts || [];
    var firstAlert = alerts[0] || {};
    var inspections = (state.inspections || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id && item.status === 'draft';
    });
    var processDrafts = app.getProcessRecords().filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id && item.status === 'draft';
    });
    var actionable = { pending: true, rectifying: true, rejected: true, review: true };
    var orders = (state.rectificationOrders || []).filter(function (item) {
      return (!item.projectId || item.projectId === context.project.id) &&
        (!item.deviceId || item.deviceId === context.device.id) && actionable[item.status];
    });
    var now = Date.now();
    var overdue = orders.filter(function (item) { return item.deadlineTimestamp && item.deadlineTimestamp < now; }).length;
    var total = alerts.length + inspections.length + processDrafts.length + orders.length;
    this.setData({
      dateLabel: todayLabel(), total: total,
      logisticsCount: alerts.length,
      logisticsStageIndex: Number(firstAlert.targetIndex || firstAlert.sourceIndex || context.stage.index),
      logisticsText: firstAlert.message || firstAlert.title || '',
      aiCount: inspections.length,
      processCount: processDrafts.length,
      rectificationCount: orders.length,
      rectificationText: overdue ? overdue + '项已逾期，需要尽快处理' : '需要跟进整改或复验进度'
    });
    app.updateTabBarReminderBadges();
  },

  openItem: function (event) {
    var type = event.currentTarget.dataset.type;
    if (type === 'logistics') wx.navigateTo({ url: '/pages/construction-progress/construction-progress?stageIndex=' + this.data.logisticsStageIndex + '&source=today-alert' });
    else if (type === 'ai') wx.navigateTo({ url: '/pages/inspect/inspect' });
    else if (type === 'process') wx.navigateTo({ url: '/pages/process-records/process-records?filter=pending' });
    else if (type === 'rectification') wx.navigateTo({ url: '/pages/history/history?tab=rectification' });
  },

  openHistory: function () { wx.navigateTo({ url: '/pages/history/history?tab=all' }); }
});
