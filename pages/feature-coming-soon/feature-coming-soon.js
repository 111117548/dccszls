Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    featureKey: 'frameAssembly',
    featureName: '功能开发中',
    icon: '/assets/icon-review-v1/09-engineering-inspection.svg'
  },

  onLoad: function (options) {
    var feature = options && options.feature;
    if (feature === 'frameAssembly') {
      this.setData({ featureKey: feature, featureName: '拼框管理', icon: '/assets/icon-review-v1/02-electric-field.svg' });
    } else if (feature === 'nanoCoating') {
      this.setData({ featureKey: feature, featureName: '纳米涂层检验', icon: '/assets/icon-review-v1/03-ash-hopper.svg' });
    }
  },

  onReady: function () {
    wx.setNavigationBarTitle({ title: this.data.featureName });
  },

  backToWorkbench: function () {
    wx.switchTab({ url: '/pages/workbench/workbench' });
  },

  openFeatureGuide: function () {
    wx.navigateTo({ url: '/pages/feature-guide/feature-guide?feature=' + this.data.featureKey });
  }
});
