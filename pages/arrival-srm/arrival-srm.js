var app = getApp();
var arrivalImport = require('../../utils/arrival-import.js');

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    project: {}, device: {}, ledger: {}, demandReady: false,
    importing: false, progressText: '', canEdit: false
  },

  onShow: function () { this.loadLedger(); },

  loadLedger: function () {
    var context = app.getFoundationContext();
    var ledger = app.getArrivalLedger();
    ledger.stageSummaries = (ledger.stageSummaries || []).map(function (item) {
      return Object.assign({}, item, { completionLabel: Number(item.completionRate || 0).toFixed(1).replace('.0', '') + '%' });
    });
    ledger.receiptImports = (ledger.receiptImports || []).map(function (item) {
      var date = item.importedAt ? new Date(item.importedAt) : null;
      var stageSummaryText = (item.stageBreakdown || []).filter(function (stage) {
        return Number(stage.matchedPackages || 0) > 0;
      }).map(function (stage) {
        return stage.stageName + ' ' + Number(stage.matchedPackages || 0) + '箱';
      }).join(' · ');
      return Object.assign({}, item, {
        importedAtLabel: date ? (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') : '',
        importScopeLabel: Number(item.vehicleCount || 0) > 1 ? Number(item.vehicleCount) + '车累计清单' : (item.sheetName || '单次到货清单'),
        stageSummaryText: stageSummaryText
      });
    });
    ledger.completionLabel = Number(ledger.completionRate || 0).toFixed(1).replace('.0', '') + '%';
    this.setData({
      project: context.project || {}, device: context.device || {}, ledger: ledger,
      demandReady: !!(ledger.demand && ledger.totalPackages), canEdit: !!(context.project && context.project.canEdit)
    });
  },

  chooseDemandFile: function () {
    var self = this;
    if (!this.data.canEdit) return wx.showToast({ title: '当前项目仅可查看', icon: 'none' });
    if (this.data.importing) return;
    if (this.data.demandReady) {
      wx.showModal({
        title: '替换需求总清单',
        content: '新清单会替换当前需求基准；箱号相同且已经到货的记录会保留。是否继续？',
        confirmText: '继续选择',
        success: function (result) { if (result.confirm) self.importDemand(); }
      });
      return;
    }
    this.importDemand();
  },

  importDemand: function () {
    var self = this;
    this.setData({ importing: true, progressText: '请选择需求总清单…' });
    arrivalImport.chooseAndParse({
      type: 'demand', context: app.getFoundationContext(),
      onProgress: function (text) { self.setData({ progressText: text }); }
    }).then(function (parsed) {
      var detail = app.importArrivalDemandManifest(parsed);
      if (!detail) throw new Error('当前账号没有编辑该项目的权限');
      self.setData({ importing: false, progressText: '' });
      self.loadLedger();
      wx.showModal({
        title: '需求总清单已建立',
        content: '识别 ' + detail.totalPackages + ' 个箱件、' + detail.detailLineCount + ' 条部件明细；其中 ' + detail.unmatchedPackages + ' 个箱件暂待归类。',
        showCancel: false
      });
    }).catch(function (error) {
      self.setData({ importing: false, progressText: '' });
      arrivalImport.showPickerError(error, '需求总清单');
    });
  },

  openStage: function (event) {
    wx.navigateTo({ url: '/pages/construction-progress/construction-progress?stageIndex=' + Number(event.currentTarget.dataset.index || 1) + '&source=arrival-ledger' });
  },

  openFeatureGuide: function () {
    wx.navigateTo({ url: '/pages/feature-guide/feature-guide?feature=progress' });
  }
});
