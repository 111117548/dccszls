var app = getApp();

function dateText(value) {
  if (!value) return '';
  var date = new Date(Number(value));
  if (isNaN(date.getTime())) return '';
  function pad(number) { return number < 10 ? '0' + number : String(number); }
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function errorMessage(error) {
  var message = error && (error.errMsg || error.message) || '清单处理失败，请稍后重试';
  if (/FUNCTIONS_TIME_LIMIT|timed out|timeout/i.test(message)) return '清单解析超时，请确认 arrival-manifest 云函数已部署并将执行超时设置为 30 秒。';
  if (/not found|-501000/i.test(message)) return '未找到清单解析云函数，请先部署 arrival-manifest。';
  return message;
}

Page({
  data: {
    project: {}, device: {}, ledger: {}, demandReady: false,
    importingType: '', progressText: '', canEdit: false
  },

  onShow: function () { this.loadLedger(); },

  loadLedger: function () {
    var context = app.getFoundationContext();
    var ledger = app.getArrivalLedger();
    ledger.stageSummaries = (ledger.stageSummaries || []).map(function (item) {
      return Object.assign({}, item, { completionLabel: Number(item.completionRate || 0).toFixed(1).replace('.0', '') + '%' });
    });
    ledger.receiptImports = (ledger.receiptImports || []).map(function (item) {
      return Object.assign({}, item, { timeLabel: dateText(item.importedAt) });
    });
    ledger.completionLabel = Number(ledger.completionRate || 0).toFixed(1).replace('.0', '') + '%';
    this.setData({
      project: context.project || {}, device: context.device || {}, ledger: ledger,
      demandReady: !!(ledger.demand && ledger.totalPackages), canEdit: !!(context.project && context.project.canEdit)
    });
  },

  chooseDemandFile: function () {
    var self = this;
    if (this.data.demandReady) {
      wx.showModal({
        title: '替换需求总清单',
        content: '新清单会替换当前需求基准；箱号相同且已经到货的记录会保留。是否继续？',
        confirmText: '继续选择',
        success: function (result) { if (result.confirm) self.chooseManifest('demand'); }
      });
      return;
    }
    this.chooseManifest('demand');
  },

  chooseArrivalFile: function () { this.chooseManifest('arrival'); },

  chooseManifest: function (type) {
    var self = this;
    if (this.data.importingType) return;
    if (!this.data.canEdit) {
      wx.showToast({ title: '当前项目仅可查看', icon: 'none' });
      return;
    }
    if (type === 'arrival' && !this.data.demandReady) {
      wx.showToast({ title: '请先导入需求总清单', icon: 'none' });
      return;
    }

    if (typeof wx.chooseMessageFile !== 'function') {
      wx.showModal({
        title: '当前环境不能选择文件',
        content: '请使用微信真机打开小程序，并先把 Excel 清单发送到微信聊天或文件传输助手，再从聊天文件中选择。',
        showCancel: false
      });
      return;
    }

    wx.showToast({ title: '请从微信聊天中选择清单', icon: 'none', duration: 1200 });
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xls', 'xlsx'],
      success: function (result) {
        var file = result.tempFiles && result.tempFiles[0];
        if (!file) {
          wx.showToast({ title: '没有选择文件', icon: 'none' });
          return;
        }
        if (!/\.xlsx?$/i.test(file.name || '')) {
          wx.showToast({ title: '请选择 xls 或 xlsx 文件', icon: 'none' });
          return;
        }
        if (Number(file.size || 0) > 15 * 1024 * 1024) {
          wx.showToast({ title: '清单不能超过 15MB', icon: 'none' });
          return;
        }
        file.path = file.path || file.tempFilePath;
        if (!file.path) {
          wx.showToast({ title: '无法读取所选文件，请重新选择', icon: 'none' });
          return;
        }
        self.uploadAndParse(type, file);
      },
      fail: function (error) {
        var message = error && error.errMsg || '';
        if (/cancel/i.test(message)) {
          wx.showToast({ title: '已取消选择', icon: 'none' });
          return;
        }
        if (/privacy|agreement|scope is not declared/i.test(message)) {
          wx.showModal({
            title: '需要补充隐私保护指引',
            content: '请小程序管理员登录微信公众平台，在“设置 → 服务内容声明 → 用户隐私保护指引”中新增“选择聊天中的文件”，用途填写“用于导入项目设备需求清单和实际到货清单”。提交并生效后即可选择 Excel 文件。',
            showCancel: false
          });
          return;
        }
        var isDevtools = /devtools|not support|unsupported/i.test(message);
        wx.showModal({
          title: '未能打开文件选择器',
          content: isDevtools
            ? '微信开发者工具可能无法选择聊天文件。请使用真机预览，并先把 Excel 清单发送到文件传输助手。'
            : '请先把 Excel 清单发送到微信聊天或文件传输助手，再重新选择。' + (message ? '\n\n' + message : ''),
          showCancel: false
        });
      }
    });
  },

  uploadAndParse: function (type, file) {
    var self = this;
    var context = app.getFoundationContext();
    var safeName = String(file.name || 'manifest.xls').replace(/[^a-zA-Z0-9._-]/g, '_');
    var cloudPath = ['arrival-imports', context.project.id, context.device.id, type + '-' + Date.now() + '-' + safeName].join('/');
    this.setData({ importingType: type, progressText: '正在上传清单…' });
    wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: file.path }).then(function (uploaded) {
      self.setData({ progressText: '正在识别箱号与部件明细…' });
      return wx.cloud.callFunction({
        name: 'arrival-manifest',
        data: { action: 'parse', fileID: uploaded.fileID, fileName: file.name, importType: type }
      });
    }).then(function (response) {
      var parsed = response && response.result || {};
      if (!parsed.success) throw new Error(parsed.error || '清单解析失败');
      var detail = type === 'demand' ? app.importArrivalDemandManifest(parsed) : app.importArrivalReceiptManifest(parsed);
      if (!detail) throw new Error('当前账号没有编辑该项目的权限');
      self.setData({ importingType: '', progressText: '' });
      self.loadLedger();
      if (type === 'demand') {
        wx.showModal({
          title: '需求总清单已建立',
          content: '识别 ' + detail.totalPackages + ' 个箱件、' + detail.detailLineCount + ' 条部件明细；其中 ' + detail.unmatchedPackages + ' 个箱件暂待归类。',
          showCancel: false
        });
      } else {
        var imported = detail.lastImport || {};
        wx.showModal({
          title: '到货清单已计入台账',
          content: '新增到货 ' + Number(imported.addedPackages || 0) + ' 箱；重复 ' + Number(imported.duplicatePackages || 0) + ' 箱；未匹配 ' + Number(imported.unmatchedPackages || 0) + ' 箱。',
          showCancel: false
        });
      }
    }).catch(function (error) {
      self.setData({ importingType: '', progressText: '' });
      wx.showModal({ title: '导入失败', content: errorMessage(error), showCancel: false });
    });
  }
});
