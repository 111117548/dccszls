var app = getApp();
var v3Data = require('../../utils/v3-data.js');
var util = require('../../utils/util.js');

Page({
  data: {
    project: {}, stats: {}, defects: [], inspections: [], reports: [], generating: false, reportDate: ''
  },

  onShow: function () {
    this.loadData();
  },

  loadData: function () {
    var state = app.getV3State();
    var context = app.getFoundationContext();
    var defects = (state.defects || []).filter(function (item) { return item.projectId === context.project.id && item.deviceId === context.device.id; });
    var inspections = (state.inspections || []).filter(function (item) { return item.projectId === context.project.id && item.deviceId === context.device.id; });
    var reports = (state.reports || []).filter(function (item) { return item.projectId === context.project.id && item.deviceId === context.device.id; });
    var scopedState = Object.assign({}, state, { defects: defects, inspections: inspections });
    this.setData({
      project: state.project,
      stats: v3Data.getDashboardStats(scopedState),
      defects: defects.filter(function (d) {
        return (d.createdAt || '').indexOf(util.formatDate()) === 0;
      }),
      inspections: inspections,
      reports: reports,
      reportDate: util.formatDate()
    });
  },

  generateDailyReport: function () {
    var self = this;
    if (this.data.generating) return;
    var defects = this.data.defects;
    if (!defects.length) {
      wx.showToast({ title: '今日暂无缺陷数据', icon: 'none' });
      return;
    }

    this.setData({ generating: true });
    wx.showLoading({ title: '生成安装质检日报...' });

    var major = 0, moderate = 0, minor = 0;
    defects.forEach(function (d) {
      if (d.severity === 'major') major++;
      else if (d.severity === 'moderate') moderate++;
      else minor++;
    });
    var fileIDs = defects.map(function (d) { return d.imageFileID || ''; }).filter(Boolean);

    wx.cloud.callFunction({
      name: 'generate-report',
      data: {
        reportType: 'daily',
        reportData: {
          project: this.data.project.name,
          date: util.formatDate(),
          inspector: '项目质量管理组',
          area: 'G793四室五电场安装区域',
          drawingNo: this.data.project.drawingNo,
          layout: this.data.project.layout,
          stage: this.data.project.stage,
          device: this.data.project.deviceName,
          inspectionCount: this.data.stats.inspectionCount,
          photoCount: this.data.stats.photoCount
        },
        defects: defects,
        majorCount: major,
        moderateCount: moderate,
        minorCount: minor,
        photoFileIDs: fileIDs
      },
      success: function (res) {
        wx.hideLoading();
        self.setData({ generating: false });
        if (res.result && res.result.success) {
          var state = app.getV3State();
          var report = {
            id: 'RP-' + Date.now(), name: '低低温电除尘AI安装质量检查日报',
            projectId: state.project.id, deviceId: state.project.deviceId || '',
            date: util.formatDate(), fileID: res.result.fileID,
            fileName: res.result.fileName, status: 'generated'
          };
          state.reports.unshift(report);
          app.saveV3State();
          app.syncReportToCloud(report);
          self.loadData();
          self.openReportFile(res.result.fileID);
        } else {
          wx.showToast({ title: '报告生成失败', icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        self.setData({ generating: false });
        wx.showToast({ title: '请部署报告云函数', icon: 'none' });
      }
    });
  },

  openReport: function (e) {
    this.openReportFile(e.currentTarget.dataset.fileid);
  },

  openReportFile: function (fileID) {
    if (!fileID) return;
    wx.showLoading({ title: '打开报告...' });
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: function (res) {
        var url = res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
        if (!url) { wx.hideLoading(); return; }
        wx.downloadFile({
          url: url,
          success: function (downloadRes) {
            wx.hideLoading();
            if (downloadRes.statusCode === 200) {
              wx.openDocument({ filePath: downloadRes.tempFilePath, fileType: 'docx', showMenu: true });
            }
          },
          fail: function () { wx.hideLoading(); }
        });
      },
      fail: function () { wx.hideLoading(); }
    });
  }
});
