var app = getApp();

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
    wx.showShareMenu({ menus: ['shareAppMessage'] });
    this.loadOrder();
  },

  onShow: function () {
    if (this.data.orderId && !this.data.loading) this.loadOrder();
  },

  loadOrder: function () {
    var order = app.getRectificationOrder(this.data.orderId);
    if (!order) {
      this.setData({ loading: false, errorMessage: '未找到整改单，请返回AI识别结果或整改台账重新进入。' });
      return;
    }
    if (!order.shareToken) {
      this.setData({ loading: false, errorMessage: '该整改单尚未生成开放协作令牌，请重新生成整改单。' });
      return;
    }
    var item = (order.items || [])[0] || {};
    var decorated = Object.assign({}, order, {
      primaryItem: item,
      defectName: item.name || order.title || 'AI缺陷整改任务',
      severityName: item.level || (item.severity === 'major' ? 'Ⅲ级' : item.severity === 'minor' ? 'Ⅰ级' : 'Ⅱ级'),
      sourceImageUrl: order.sourceImageFileID || order.sourceImageLocal || '',
      positionLabel: order.positionCode || item.positionCode || '现场指定位置',
      statusName: order.statusName || '待整改'
    });
    var path = this.buildRecipientPath(decorated);
    this.setData({
      loading: false,
      errorMessage: '',
      order: decorated,
      recipientPath: path,
      shareTitle: '整改任务：' + decorated.defectName + '｜请上传整改照片并提交复验',
      cloudReady: false,
      cloudStatus: '正在同步云端协作任务…'
    });
    this.prepareCloudShare();
  },

  prepareCloudShare: function () {
    var self = this;
    app.prepareRectificationShare(this.data.orderId).then(function () {
      self.setData({ cloudReady: true, cloudStatus: '云端协作已就绪，可以转发或预览' });
    }).catch(function (err) {
      self.setData({
        cloudReady: false,
        cloudStatus: '云端同步失败：' + ((err && (err.message || err.errMsg)) || '请检查网络和 quality-ledger 云函数')
      });
    });
  },

  retryCloudShare: function () {
    this.setData({ cloudReady: false, cloudStatus: '正在重新同步云端协作任务…' });
    this.prepareCloudShare();
  },

  buildRecipientPath: function (order) {
    return '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(order.id || '') +
      '&projectId=' + encodeURIComponent(order.projectId || '') +
      '&token=' + encodeURIComponent(order.shareToken || '') + '&from=share';
  },

  previewRecipient: function () {
    if (!this.data.recipientPath) return;
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
    if (!this.data.cloudReady) wx.showToast({ title: '请等待云端协作就绪', icon: 'none' });
    return {
      title: this.data.shareTitle || '电除尘安装质量整改任务',
      path: this.data.recipientPath || '/pages/index/index',
      imageUrl: (this.data.order && this.data.order.sourceImageUrl) || ''
    };
  }
});
