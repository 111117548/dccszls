var app = getApp();

Page({
  data: {
    identity: { bound: false },
    userName: '未绑定飞书账号', roleName: '项目经理', projectName: '未选择项目',
    isAdmin: false, apiStatusText: '等待检测', apiStatusClass: 'unknown'
  },

  onShow: function () {
    this.loadProfile();
    var self = this;
    app.refreshFeishuIdentity().then(function () { self.loadProfile(); }).catch(function () {});
    app.updateTabBarReminderBadges();
  },

  loadProfile: function () {
    var identity = app.getFeishuIdentity();
    var context = app.getFoundationContext();
    var cloudReady = !!(wx.cloud && wx.cloud.callFunction);
    this.setData({
      identity: identity,
      userName: identity.bound ? (identity.name || '已绑定用户') : '未绑定飞书账号',
      roleName: identity.roleName || (identity.role === 'platform_admin' ? '平台管理员' : '项目经理'),
      projectName: context.project && (context.project.shortName || context.project.name) || '未选择项目',
      isAdmin: identity.role === 'platform_admin',
      apiStatusText: cloudReady ? '运行中' : '需检查',
      apiStatusClass: cloudReady ? 'normal' : 'warning'
    });
  },

  goFeishu: function () { app.openFeishuAccount(); },
  goReminder: function () { wx.navigateTo({ url: '/pages/reminder-settings/reminder-settings' }); },
  goApi: function () { wx.navigateTo({ url: '/pages/api-management/api-management' }); },
  goProjects: function () { wx.navigateTo({ url: '/pages/project-management/project-management' }); },
  goLogs: function () { wx.navigateTo({ url: '/pages/report-center/report-center' }); },
  showPermissions: function () {
    wx.showModal({
      title: '权限与角色',
      content: this.data.isAdmin ? '平台管理员可以查看接口状态并管理全部项目。敏感密钥仍只在云端环境变量中配置。' : '项目经理可以管理自己负责的项目。API接口页面提供只读状态，敏感配置仅平台管理员可维护。',
      showCancel: false
    });
  },
  showAbout: function () {
    wx.showModal({ title: '工程施工数字孪生', content: '面向电除尘施工现场的到货、安装、质量与检验协同平台。', showCancel: false });
  }
});
