var app = getApp();
var formData = require('../../utils/process-forms.js');

Page({
  data: {
    entries: [], project: {}, device: {}, exporting: false,
    fileID: '', fileName: '', tempFilePath: '', fileType: 'xlsx',
    cloudExportStatus: 'checking', templateVersion: '', sheetCount: 0
  },
  onShow: function () {
    this.load();
    this.checkCloudExporter();
  },
  checkCloudExporter: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) {
      this.setData({ cloudExportStatus: 'unavailable' });
      return;
    }
    wx.cloud.callFunction({
      name: 'generate-inspection-workbook',
      data: { action: 'status' },
      success: function (res) {
        var result = res.result || {};
        var ready = !!(result.success && result.ready && result.templateReady && Number(result.sheetCount) === 9);
        self.setData({
          cloudExportStatus: ready ? 'ready' : 'unavailable',
          templateVersion: result.templateVersion || '',
          sheetCount: Number(result.sheetCount) || 0
        });
      },
      fail: function () { self.setData({ cloudExportStatus: 'unavailable' }); }
    });
  },
  load: function () {
    var context = app.getFoundationContext();
    var records = app.getProcessRecords().filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    var latest = {};
    records.forEach(function (record) {
      if (!latest[record.formId] || String(record.updatedAtText) > String(latest[record.formId].updatedAtText)) latest[record.formId] = record;
    });
    this.setData({
      project: context.project,
      device: context.device,
      entries: formData.FORMS.map(function (form) {
        return {
          formId: form.id,
          sheetName: form.sheetName,
          form: form,
          record: latest[form.id] || {
            projectName: context.project.name,
            deviceName: context.device.name,
            inspectionDate: '', chamber: '', id: '', result: '', remarks: '', values: {}, matrixValues: {}
          },
          hasRecord: !!latest[form.id]
        };
      })
    });
  },
  exportWorkbook: function () {
    var self = this;
    if (this.data.cloudExportStatus === 'unavailable' || !wx.cloud || !wx.cloud.callFunction) {
      this._showDeploymentError('-501000 FUNCTION_NOT_FOUND');
      return;
    }
    this.setData({ exporting: true });
    wx.cloud.callFunction({
      name: 'generate-inspection-workbook',
      data: { batch: true, project: this.data.project, device: this.data.device, entries: this.data.entries },
      success: function (res) {
        var result = res.result || {};
        if (!result.success || (!result.fileID && !result.fileBase64)) {
          self._showDeploymentError(result.error || '云函数未生成Excel文件');
          return;
        }
        var exportData = {
          fileID: result.fileID || '',
          fileName: result.fileName || '电除尘器本体安装检查记录.xlsx',
          tempFilePath: '',
          fileType: result.fileType || 'xlsx',
          templateVersion: result.templateVersion || self.data.templateVersion,
          sheetCount: Number(result.sheetCount) || 9
        };
        self.setData(exportData);
        if (result.fileBase64) {
          self._saveBase64Workbook(result.fileBase64, exportData.fileName);
        } else {
          wx.showToast({ title: 'Excel已生成', icon: 'success' });
        }
      },
      fail: function (err) { self._showDeploymentError(err.errMsg || '导出云函数调用失败'); },
      complete: function () { self.setData({ exporting: false }); }
    });
  },
  _showDeploymentError: function (message) {
    var notFound = /-501000|FUNCTION_NOT_FOUND|could not be found/i.test(message || '');
    wx.showModal({
      title: notFound ? '原表导出云函数未部署' : '原表导出失败',
      content: notFound
        ? '请右键 cloudfunctions/generate-inspection-workbook，选择“上传并部署：云端安装依赖”。部署成功后重新进入本页。'
        : (message || '未能按原表生成Excel，请检查云函数日志后重试。'),
      showCancel: false
    });
  },
  _saveBase64Workbook: function (base64, fileName) {
    var self = this;
    var safeFileName = String(fileName || '电除尘器本体安装检查记录.xlsx').replace(/[\\/:*?"<>|]/g, '_');
    var filePath = wx.env.USER_DATA_PATH + '/' + safeFileName;
    wx.getFileSystemManager().writeFile({
      filePath: filePath,
      data: base64,
      encoding: 'base64',
      success: function () {
        self.setData({ tempFilePath: filePath, fileID: '' });
        wx.showToast({ title: 'Excel已生成', icon: 'success' });
      },
      fail: function (err) {
        self._showDeploymentError(err.errMsg || '生成成功，但写入本地文件失败');
      }
    });
  },
  openExcel: function () {
    var self = this;
    if (this.data.tempFilePath) {
      wx.openDocument({
        filePath: this.data.tempFilePath,
        fileType: this.data.fileType || 'xlsx',
        showMenu: true,
        fail: function (err) { wx.showModal({ title: '打开失败', content: err.errMsg || '请通过右上角菜单保存后使用Excel/WPS打开', showCancel: false }); }
      });
      return;
    }
    if (!this.data.fileID) return;
    wx.showLoading({ title: '正在下载...' });
    wx.cloud.downloadFile({
      fileID: this.data.fileID,
      success: function (res) {
        self.setData({ tempFilePath: res.tempFilePath });
        wx.openDocument({ filePath: res.tempFilePath, fileType: self.data.fileType || 'xlsx', showMenu: true });
      },
      fail: function (err) { wx.showModal({ title: '下载失败', content: err.errMsg || '请稍后重试', showCancel: false }); },
      complete: function () { wx.hideLoading(); }
    });
  }
});
