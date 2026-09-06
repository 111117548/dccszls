var app = getApp();
var notificationCenter = require('../../utils/notification-center.js');

var WEEK_DAYS = [
  { value: 1, label: '每周一' }, { value: 2, label: '每周二' },
  { value: 3, label: '每周三' }, { value: 4, label: '每周四' },
  { value: 5, label: '每周五' }, { value: 6, label: '每周六' },
  { value: 7, label: '每周日' }
];

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    project: {}, device: {}, loading: true, savingType: '', errorText: '',
    config: { dispatch: {}, weekly: {}, contractor: {} },
    subscriptions: { dispatch: {}, weekly: {} },
    weekDays: WEEK_DAYS, weekDayIndex: 0, weeklyTime: '09:00'
  },

  onShow: function () {
    var context = app.getFoundationContext();
    this.setData({ project: context.project || {}, device: context.device || {} });
    this.loadSettings();
  },

  loadSettings: function () {
    var self = this;
    var projectId = this.data.project.id;
    if (!projectId) {
      this.setData({ loading: false, errorText: '请先在首页选择项目' });
      return;
    }
    this.setData({ loading: true, errorText: '' });
    notificationCenter.getSettings(projectId).then(function (result) {
      var weekly = result.subscriptions && result.subscriptions.weekly || {};
      var weekDay = Number(weekly.weekDay || 1);
      var weekDayIndex = Math.max(0, WEEK_DAYS.findIndex(function (item) { return item.value === weekDay; }));
      self.setData({
        loading: false,
        config: result.config || self.data.config,
        subscriptions: result.subscriptions || self.data.subscriptions,
        weekDayIndex: weekDayIndex,
        weeklyTime: weekly.sendTime || '09:00'
      });
    }).catch(function (error) {
      self.setData({ loading: false, errorText: error.message || '提醒设置读取失败' });
    });
  },

  onWeekDayChange: function (event) {
    this.setData({ weekDayIndex: Number(event.detail.value) || 0 });
  },

  onWeeklyTimeChange: function (event) {
    this.setData({ weeklyTime: event.detail.value || '09:00' });
  },

  enableReminder: function (event) {
    var self = this;
    var type = event.currentTarget.dataset.type;
    var config = this.data.config[type] || {};
    var templateId = config.templateId || '';
    if (!templateId || !config.templateConfigured) {
      wx.showModal({
        title: '提醒模板待配置',
        content: '请管理员先在微信公众平台配置该提醒模板，并将模板 ID 填入云函数环境变量。',
        showCancel: false
      });
      return;
    }
    if (!wx.requestSubscribeMessage) {
      wx.showModal({ title: '当前微信版本不支持', content: '请升级微信后重试。', showCancel: false });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: function (res) {
        if (res[templateId] !== 'accept') {
          wx.showToast({ title: '未同意接收提醒', icon: 'none' });
          return;
        }
        self.registerReminder(type, templateId);
      },
      fail: function (error) {
        wx.showModal({ title: '无法申请提醒权限', content: (error && error.errMsg) || '请检查订阅消息设置', showCancel: false });
      }
    });
  },

  registerReminder: function (type, templateId) {
    var self = this;
    var selectedDay = WEEK_DAYS[this.data.weekDayIndex] || WEEK_DAYS[0];
    var options = type === 'weekly' ? { weekDay: selectedDay.value, sendTime: this.data.weeklyTime } : {};
    this.setData({ savingType: type });
    notificationCenter.register(this.data.project.id, type, templateId, options).then(function (result) {
      self.setData({ savingType: '' });
      if (result.subscriptions) self.setData({ subscriptions: result.subscriptions });
      wx.showToast({ title: '提醒已开启', icon: 'success' });
      self.loadSettings();
    }).catch(function (error) {
      self.setData({ savingType: '' });
      wx.showModal({ title: '开启提醒失败', content: error.message || '请稍后重试', showCancel: false });
    });
  },

  disableReminder: function (event) {
    var self = this;
    var type = event.currentTarget.dataset.type;
    this.setData({ savingType: type });
    notificationCenter.disable(this.data.project.id, type).then(function () {
      self.setData({ savingType: '' });
      wx.showToast({ title: '提醒已关闭', icon: 'success' });
      self.loadSettings();
    }).catch(function (error) {
      self.setData({ savingType: '' });
      wx.showModal({ title: '关闭提醒失败', content: error.message || '请稍后重试', showCancel: false });
    });
  },

  goRectification: function () {
    wx.navigateTo({ url: '/pages/history/history' });
  }
});
