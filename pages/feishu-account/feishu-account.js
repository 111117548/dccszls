var app = getApp();
var feishuAuth = require('../../utils/feishu-auth.js');

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    loading: true,
    binding: false,
    checking: false,
    authUrl: '',
    profile: { bound: false },
    oauthConfigured: false,
    serviceAvailable: true,
    error: '',
    errorCode: '',
    phoneError: ''
  },

  onLoad: function () { this.refreshStatus(); },
  onShow: function () {
    if (this.data.loading) return;
    if (this.data.authUrl) this.checkBinding(true);
    else this.refreshStatus();
  },
  onHide: function () { this.stopPolling(); },
  onUnload: function () { this.stopPolling(); },

  refreshStatus: function () {
    var self = this;
    this.setData({ loading: true, error: '', errorCode: '' });
    return feishuAuth.status().then(function (result) {
      var profile = result.profile || { bound: false };
      self.setData({ loading: false, serviceAvailable: true, profile: profile, oauthConfigured: !!result.oauthConfigured, errorCode: '' });
      app.applyFeishuIdentity(profile);
      return profile;
    }).catch(function (error) {
      self.setData({
        loading: false,
        serviceAvailable: error.code !== 'FUNCTION_NOT_FOUND',
        oauthConfigured: false,
        error: error.message || '无法读取绑定状态',
        errorCode: error.code || ''
      });
      throw error;
    });
  },

  bindByPhone: function (event) {
    var self = this;
    if (this.data.binding) return;
    var detail = event && event.detail || {};
    var phoneCode = detail.code || '';
    if (!phoneCode) {
      var rawMessage = String(detail.errMsg || '');
      var errno = Number(detail.errno || detail.errCode || 0);
      var denied = /deny|cancel/i.test(rawMessage);
      var noPermission = /no permission|permission denied|not authorized|unauthorized/i.test(rawMessage);
      var unsupported = /not support|unsupported/i.test(rawMessage);
      var privacyMissing = /privacy|agreement|scope is not declared/i.test(rawMessage);
      var quotaExhausted = errno === 1400001;
      var message = '';
      if (denied) message = '你已取消手机号授权，可重新点击按钮授权。';
      else if (quotaExhausted) message = '微信手机号验证额度已用完，请管理员在微信公众平台“付费管理”购买或补充手机号资源包。';
      else if (privacyMissing) message = '小程序隐私保护指引尚未声明手机号用途，请管理员补充并重新发布隐私指引。';
      else if (noPermission) message = '当前小程序账号尚未开通手机号能力，请先完成非个人主体认证及手机号组件配置。';
      else if (unsupported) message = '当前微信版本或调试环境不支持手机号授权，请使用最新版微信真机测试。';
      else message = '微信未返回手机号凭证，请管理员根据下方微信错误信息检查小程序账号配置。';
      var diagnostic = [];
      if (errno) diagnostic.push('错误码 ' + errno);
      if (rawMessage) diagnostic.push(rawMessage);
      if (!denied && diagnostic.length) message += '（' + diagnostic.join('；') + '）';
      console.warn('[feishu-phone-binding] getPhoneNumber did not return code', detail);
      this.setData({ phoneError: message });
      if (denied) {
        wx.showToast({ title: '已取消手机号授权', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '手机号一键绑定暂不可用',
        content: message + (this.data.oauthConfigured ? ' 你也可以先使用飞书账号授权。' : ''),
        showCancel: !!this.data.oauthConfigured,
        cancelText: '关闭',
        confirmText: this.data.oauthConfigured ? '飞书授权' : '我知道了',
        success: function (result) {
          if (self.data.oauthConfigured && result.confirm) self.startBinding();
        }
      });
      return;
    }
    this.setData({ binding: true, error: '', errorCode: '', phoneError: '' });
    feishuAuth.bindByPhone(phoneCode).then(function (result) {
      var profile = result.profile || { bound: false };
      app.applyFeishuIdentity(profile);
      self.setData({ binding: false, profile: profile, authUrl: '', loading: false, phoneError: '' });
      wx.showToast({ title: '飞书身份已绑定', icon: 'success' });
    }).catch(function (error) {
      self.setData({ binding: false, error: error.message || '手机号匹配飞书身份失败', errorCode: error.code || '' });
      wx.showModal({
        title: '一键绑定未完成',
        content: error.message || '请确认微信与飞书登记手机号一致，或改用备用飞书授权。',
        showCancel: false
      });
    });
  },

  startBinding: function () {
    var self = this;
    if (this.data.binding) return;
    this.setData({ binding: true, error: '', errorCode: '' });
    feishuAuth.getAuthUrl().then(function (result) {
      self.setData({ binding: false, authUrl: result.authUrl || '' });
      self.copyAuthUrl();
      self.startPolling();
    }).catch(function (error) {
      self.setData({ binding: false, error: error.message || '无法发起飞书授权', errorCode: error.code || '' });
    });
  },

  startPolling: function () {
    var self = this;
    this.stopPolling();
    this.pollTimer = setInterval(function () {
      self.checkBinding(true);
    }, 1800);
  },

  stopPolling: function () {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  closeAuth: function () {
    this.stopPolling();
    this.setData({ authUrl: '' });
    this.refreshStatus();
  },

  copyAuthUrl: function () {
    var url = this.data.authUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showModal({
          title: '授权链接已复制',
          content: '请切换到手机浏览器或飞书，将链接粘贴打开，并使用你本人的飞书账号完成授权。完成后返回本小程序。',
          showCancel: false,
          confirmText: '我知道了'
        });
      }
    });
  },

  checkBinding: function (silent) {
    var self = this;
    silent = silent === true;
    if (!silent) this.setData({ checking: true, error: '', errorCode: '' });
    return feishuAuth.status().then(function (result) {
      var profile = result.profile || {};
      if (!profile.bound) {
        if (!silent) {
          self.setData({ checking: false });
          wx.showToast({ title: '尚未完成飞书授权', icon: 'none' });
        }
        return profile;
      }
      self.stopPolling();
      app.applyFeishuIdentity(profile);
      self.setData({ profile: profile, authUrl: '', loading: false, checking: false });
      wx.showToast({ title: '飞书账号已绑定', icon: 'success' });
      return profile;
    }).catch(function (error) {
      if (!silent) {
        self.setData({ checking: false, error: error.message || '无法确认绑定状态', errorCode: error.code || '' });
      }
    });
  },

  unbind: function () {
    var self = this;
    wx.showModal({
      title: '解除飞书绑定',
      content: '解除后将无法进入项目管理功能，整改分享链接不受影响。',
      success: function (res) {
        if (!res.confirm) return;
        feishuAuth.unbind().then(function (result) {
          var profile = result.profile || { bound: false };
          app.applyFeishuIdentity(profile);
          self.setData({ profile: profile });
          wx.showToast({ title: '已解除绑定', icon: 'none' });
        }).catch(function (error) {
          wx.showModal({ title: '解除失败', content: error.message || '请稍后重试', showCancel: false });
        });
      }
    });
  }
});
