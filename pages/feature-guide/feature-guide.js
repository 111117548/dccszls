var guideStore = require('../../utils/feature-guides.js');

var FEATURE_ROUTES = {
  progress: '/pages/construction-progress/construction-progress',
  smartInspection: '/pages/inspect/inspect',
  qualityLedger: '/pages/history/history?tab=rectification',
  records: '/pages/process-records/process-records',
  daily: '/pages/report-center/report-center'
};

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    featureKey: 'progress',
    guide: guideStore.getFeatureGuide('progress'),
    activeStep: -1
  },

  onLoad: function (options) {
    var featureKey = String(options && options.feature || 'progress');
    var guide = guideStore.getFeatureGuide(featureKey);
    this.setData({ featureKey: guide.key, guide: guide, activeStep: -1 });
    wx.setNavigationBarTitle({ title: guide.name + '使用说明' });
  },

  toggleStep: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    this.setData({ activeStep: this.data.activeStep === index ? -1 : index });
  },

  previewGuideImage: function (event) {
    var image = String(event.currentTarget.dataset.image || '');
    if (image) wx.previewImage({ current: image, urls: [image] });
  },

  continueFeature: function () {
    if (!this.data.guide.live) {
      wx.showToast({ title: '功能正在开发中', icon: 'none' });
      return;
    }
    var pages = getCurrentPages();
    if (pages && pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({ url: FEATURE_ROUTES[this.data.featureKey] || FEATURE_ROUTES.progress });
  }
});
