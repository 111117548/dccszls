var app = getApp();

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    projectName: '',
    deviceName: '',
    stageIndex: 1,
    tools: [
      { action: 'progress', name: '到货与安装', caption: '到货登记、安装进度与预警', icon: '/assets/icon-review-v1/10-construction-helmet.svg' },
      { action: 'smartInspection', name: '智能检测', caption: '拍照识别与缺陷确认', icon: '/assets/icon-review-v1/09-engineering-inspection.svg' },
      { action: 'qualityLedger', name: '质量检查台账', caption: '整改任务与复验闭环', icon: '/assets/icon-review-v1/07-rapping-system.svg' },
      { action: 'records', name: '检验记录', caption: '填写与归档', icon: '/assets/icon-review-v1/05-collecting-plate.svg' },
      { action: 'daily', name: '施工日报', caption: '今日施工与明日计划', icon: '/assets/icon-review-v1/11-welding.svg' },
      { action: 'frameAssembly', name: '拼框管理', caption: '正在开发中', icon: '/assets/icon-review-v1/02-electric-field.svg' },
      { action: 'nanoCoating', name: '纳米涂层检验', caption: '正在开发中', icon: '/assets/icon-review-v1/03-ash-hopper.svg' }
    ]
  },

  onShow: function () {
    var context = app.getFoundationContext();
    this.setData({
      projectName: context.project && (context.project.shortName || context.project.name) || '当前项目',
      deviceName: context.device && (context.device.unitNo || context.device.name) || '当前机组',
      stageIndex: context.stage && context.stage.index || 1
    });
    app.updateTabBarReminderBadges();
  },

  openTool: function (event) {
    var action = event.currentTarget.dataset.action;
    var routes = {
      progress: '/pages/construction-progress/construction-progress?stageIndex=' + this.data.stageIndex + '&source=workbench',
      smartInspection: '/pages/inspect/inspect',
      qualityLedger: '/pages/history/history?tab=rectification',
      records: '/pages/process-records/process-records',
      daily: '/pages/report-center/report-center',
      frameAssembly: '/pages/feature-coming-soon/feature-coming-soon?feature=frameAssembly',
      nanoCoating: '/pages/feature-coming-soon/feature-coming-soon?feature=nanoCoating'
    };
    if (routes[action]) wx.navigateTo({ url: routes[action] });
  }
});
