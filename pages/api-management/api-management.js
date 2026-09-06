var app = getApp();
var notificationCenter = require('../../utils/notification-center.js');

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    services: [], summary: { total: 0, normal: 0, warning: 0 },
    isAdmin: false, checking: false, showDetail: false, selectedService: {}
  },

  onShow: function () { this.loadServices(); },

  loadServices: function () {
    var identity = app.getFeishuIdentity();
    var cloudReady = !!(wx.cloud && wx.cloud.callFunction);
    var services = [
      { id: 'feishu', icon: '飞', name: '飞书开放平台', purpose: '项目、整改与通讯录同步', status: identity.bound ? 'normal' : 'warning', statusText: identity.bound ? '正常' : '未绑定', lastText: identity.bound ? '账号授权有效' : '需要完成飞书授权', environment: '生产环境', secretText: '云端加密保存' },
      { id: 'wechat', icon: '微', name: '微信订阅消息', purpose: '到货预警与整改催办', status: typeof wx.requestSubscribeMessage === 'function' ? 'normal' : 'warning', statusText: typeof wx.requestSubscribeMessage === 'function' ? '正常' : '不支持', lastText: '模板由云函数环境变量管理', environment: '生产环境', secretText: '模板ID已脱敏' },
      { id: 'ai', icon: '智', name: '智能图像识别服务', purpose: '施工照片质量分析', status: cloudReady ? 'checking' : 'warning', statusText: cloudReady ? '检测中' : '不可用', lastText: '正在检查云端配置', environment: '生产环境', secretText: '接口密钥仅云端可见' },
      { id: 'manifest', icon: '表', name: '到货清单解析服务', purpose: 'Excel需求与到货清单解析', status: cloudReady ? 'normal' : 'warning', statusText: cloudReady ? '可调用' : '不可用', lastText: 'arrival-manifest 云函数', environment: '生产环境', secretText: '无需客户端密钥' },
      { id: 'storage', icon: '云', name: '云存储服务', purpose: '整改照片与报告文件', status: wx.cloud ? 'normal' : 'warning', statusText: wx.cloud ? '正常' : '不可用', lastText: wx.cloud ? '云环境已初始化' : '当前基础库不支持', environment: '生产环境', secretText: '平台托管' }
    ];
    this.setData({ services: services, isAdmin: identity.role === 'platform_admin' });
    this.refreshSummary();
    this.checkAI();
    this.checkNotification();
  },

  setService: function (id, updates) {
    var list = this.data.services.map(function (item) { return item.id === id ? Object.assign({}, item, updates) : item; });
    var selected = this.data.selectedService && this.data.selectedService.id === id
      ? Object.assign({}, this.data.selectedService, updates) : this.data.selectedService;
    this.setData({ services: list, selectedService: selected });
    this.refreshSummary();
  },

  refreshSummary: function () {
    var list = this.data.services || [];
    this.setData({ summary: {
      total: list.length,
      normal: list.filter(function (item) { return item.status === 'normal'; }).length,
      warning: list.filter(function (item) { return item.status === 'warning'; }).length
    } });
  },

  checkAI: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) return;
    wx.cloud.callFunction({ name: 'ai-analyze', data: { action: 'status' } }).then(function (res) {
      var result = res.result || {};
      self.setService('ai', {
        status: result.success && result.configured ? 'normal' : 'warning',
        statusText: result.success && result.configured ? '正常' : '待配置',
        lastText: result.success && result.configured ? '云端智能服务已就绪' : '请管理员配置云函数环境变量'
      });
    }).catch(function () { self.setService('ai', { status: 'warning', statusText: '异常', lastText: '状态检测失败，请查看云函数日志' }); });
  },

  checkNotification: function () {
    var self = this;
    var context = app.getFoundationContext();
    if (!context.project || !context.project.id) return;
    notificationCenter.getSettings(context.project.id).then(function () {
      self.setService('wechat', { status: 'normal', statusText: '正常', lastText: '提醒云函数连接正常' });
    }).catch(function (error) {
      self.setService('wechat', { status: 'warning', statusText: '需检查', lastText: error.message || '提醒服务连接失败' });
    });
  },

  refreshAll: function () {
    this.setData({ checking: true });
    this.loadServices();
    var self = this;
    setTimeout(function () { self.setData({ checking: false }); wx.showToast({ title: '状态已刷新', icon: 'none' }); }, 800);
  },

  openService: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    var service = this.data.services[index];
    if (service) this.setData({ selectedService: service, showDetail: true });
  },
  closeDetail: function () { this.setData({ showDetail: false }); },
  testSelected: function () {
    var id = this.data.selectedService.id;
    this.setData({ showDetail: false });
    if (id === 'feishu') {
      var self = this;
      app.refreshFeishuIdentity().then(function (profile) {
        wx.showToast({ title: profile && profile.bound ? '连接正常' : '需要绑定飞书', icon: 'none' }); self.loadServices();
      }).catch(function (error) { wx.showModal({ title: '连接失败', content: error.message || '请检查飞书接口配置', showCancel: false }); });
    } else if (id === 'wechat') this.checkNotification();
    else if (id === 'ai') this.checkAI();
    else wx.showToast({ title: '接口已注册', icon: 'none' });
  },
  showConfigHelp: function () {
    wx.showModal({
      title: this.data.isAdmin ? '云端安全配置' : '仅管理员可配置',
      content: 'App Secret、API Key、模板ID等敏感参数只允许配置在对应云函数的环境变量中，小程序端不会读取或显示明文。',
      showCancel: false
    });
  }
});
