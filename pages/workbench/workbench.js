var app = getApp();

Page({
  data: {
    projectName: '',
    deviceName: '',
    stageIndex: 1,
    tools: [
      { action: 'arrival', name: '到货管理', caption: '清单与预警', icon: '/assets/icon-review-v1/12-crane-lifting.svg' },
      { action: 'progress', name: '安装进度', caption: '现场进度', icon: '/assets/icon-review-v1/10-construction-helmet.svg' },
      { action: 'ai', name: 'AI质量检查', caption: '拍照识别', icon: '/assets/icon-review-v1/09-engineering-inspection.svg' },
      { action: 'rectification', name: '整改闭环', caption: '跟踪复验', icon: '/assets/icon-review-v1/11-welding.svg' },
      { action: 'records', name: '检验记录', caption: '填写与归档', icon: '/assets/icon-review-v1/05-collecting-plate.svg' },
      { action: 'feishu', name: '飞书协同', caption: '同步整改', icon: '/assets/icon-review-v1/01-esp-unit.svg' }
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
      arrival: '/pages/arrival-srm/arrival-srm',
      progress: '/pages/construction-progress/construction-progress?stageIndex=' + this.data.stageIndex + '&source=workbench',
      ai: '/pages/inspect/inspect',
      rectification: '/pages/history/history?tab=rectification',
      records: '/pages/process-records/process-records',
      feishu: '/pages/history/history?tab=rectification&source=feishu'
    };
    if (routes[action]) wx.navigateTo({ url: routes[action] });
  }
});
