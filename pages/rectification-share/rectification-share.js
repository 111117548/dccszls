var app = getApp();
var share = require('../../utils/share.js');

Page({
  data: {
    loading: true,
    errorMessage: '',
    order: null,
    orderId: '',
    recipientPath: '',
    shareTitle: '',
    cloudReady: false,
    cloudStatus: '正在同步云端协作任务…'
  },

  onLoad: function (options) {
    var orderId = decodeURIComponent((options && options.id) || '');
    this.setData({ orderId: orderId });
    share.setMenu(false);
    this.loadOrder();
  },

  onShow: function () {
    if (this.data.orderId && !this.data.loading && !this.data.cloudReady && !this._preparing) this.loadOrder();
  },

  onUnload: function () { this._disposed = true; },

  loadOrder: function () {
    share.setMenu(false);
    var order = app.getRectificationOrder(this.data.orderId);
    if (!order) {
      this.setData({ loading: false, errorMessage: '未找到整改单，请返回智能识别结果或整改台账重新进入。' });
      return;
    }
    if (!order.shareToken) {
      this.setData({ loading: false, errorMessage: '该整改单尚未生成开放协作令牌，请重新生成整改单。' });
      return;
    }
    var item = (order.items || [])[0] || {};
    var decorated = Object.assign({}, order, {
      primaryItem: item,
      defectName: item.name || order.title || '智能缺陷整改任务',
      severityName: item.level || (item.severity === 'major' ? 'Ⅲ级' : item.severity === 'minor' ? 'Ⅰ级' : 'Ⅱ级'),
      sourceImageUrl: order.sourceImageFileID || order.sourceImageLocal || '',
      positionLabel: order.positionCode || item.positionCode || '现场指定位置',
      statusName: order.statusName || '待整改'
    });
    this.setData({
      loading: false,
      errorMessage: '',
      order: decorated,
      recipientPath: '',
      shareTitle: '整改任务：' + decorated.defectName + '｜请上传整改照片并提交复验',
      cloudReady: false,
      cloudStatus: '正在同步云端协作任务…'
    });
    this.prepareCloudShare();
  },

  prepareCloudShare: function () {
    if (this._preparing) return this._preparing;
    var self = this;
    var orderId = this.data.orderId;
    share.setMenu(false);
    this.setData({ cloudReady: false, recipientPath: '' });
    this._preparing = app.prepareRectificationShare(orderId).then(function (result) {
      if (self._disposed || self.data.orderId !== orderId) return;
      var order = result && result.order;
      var recipientPath = result && result.ready && self.buildRecipientPath(order);
      if (!recipientPath || !order || order.id !== orderId) throw new Error('云端任务未就绪，请重试');
      self.setData({ order: Object.assign({}, self.data.order, order), recipientPath: recipientPath,
        cloudReady: true, cloudStatus: '云端协作已就绪，可以转发或预览' });
      share.setMenu(true);
    }).catch(function (err) {
      if (self._disposed || self.data.orderId !== orderId) return;
      share.setMenu(false);
      self.setData({
        cloudReady: false,
        cloudStatus: '云端同步失败：' + ((err && (err.message || err.errMsg)) || '请检查网络和 quality-ledger 云函数')
      });
    }).then(function () {
      self._preparing = null;
    });
    return this._preparing;
  },

  retryCloudShare: function () {
    this.setData({ cloudReady: false, cloudStatus: '正在重新同步云端协作任务…' });
    this.prepareCloudShare();
  },

  buildRecipientPath: function (order) {
    return share.recipientPath(order);
  },

  previewRecipient: function () {
    if (!this.data.cloudReady || !this.data.recipientPath) return;
    wx.navigateTo({ url: this.data.recipientPath });
  },

  openTask: function () {
    if (!this.data.orderId) return;
    wx.navigateTo({
      url: '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(this.data.orderId) + '&from=creator'
    });
  },

  copyTaskInfo: function () {
    var order = this.data.order;
    if (!order) return;
    var text = [
      '电除尘安装质量整改任务',
      '编号：' + (order.id || ''),
      '缺陷：' + order.defectName,
      '位置：' + order.positionLabel,
      '等级：' + order.severityName,
      '整改期限：' + (order.deadline || '待确定'),
      '处理要求：打开小程序整改任务，填写整改说明并上传整改后照片，提交复验。'
    ].join('\n');
    wx.setClipboardData({
      data: text,
      success: function () { wx.showToast({ title: '任务信息已复制', icon: 'success' }); }
    });
  },

  previewSource: function () {
    var url = this.data.order && this.data.order.sourceImageUrl;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  onShareAppMessage: function () {
    if (!this.data.cloudReady || !this.data.recipientPath) return share.home();
    return share.task(this.data.order);
  }
});
