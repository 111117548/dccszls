var app = getApp();
var forms = require('../../utils/process-forms.js');

Page({
  data: {
    project: {}, device: {}, stage: {}, forms: forms.FORMS, displayForms: forms.FORMS,
    records: [], recordMap: {}, completedCount: 0, pendingCount: forms.FORMS.length,
    issueCount: 0, completionRate: 0, formFilter: 'all'
  },
  onLoad: function (options) {
    if (options && (options.filter === 'pending' || options.filter === 'issue')) {
      this.setData({ formFilter: options.filter });
    }
  },
  onShow: function () {
    this.load();
    var self = this;
    app.refreshProcessRecords().then(function () { self.load(); }).catch(function () {});
  },
  load: function () {
    var context = app.getFoundationContext();
    var records = app.getProcessRecords().filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    var recordMap = {};
    records.forEach(function (item) {
      if (!recordMap[item.formId] || String(item.updatedAtText) > String(recordMap[item.formId].updatedAtText)) recordMap[item.formId] = item;
    });
    var list = forms.FORMS.map(function (form, index) {
      var latest = recordMap[form.id] || {};
      var totalItems = 0;
      var completedItems = 0;
      (form.groups || []).forEach(function (group) {
        totalItems += (group.codes || []).length;
        (group.codes || []).forEach(function (code) {
          if (latest.values && latest.values[group.id] && String(latest.values[group.id][code] || '').trim()) completedItems++;
        });
      });
      if (form.matrix) {
        totalItems = form.matrix.fieldCount * form.matrix.channelCount * form.matrix.columns.length;
        Object.keys(latest.matrixValues || {}).forEach(function (field) {
          (latest.matrixValues[field] || []).forEach(function (row) {
            form.matrix.columns.forEach(function (column) {
              if (String(row[column.id] || '').trim()) completedItems++;
            });
          });
        });
      }
      var hasIssue = latest.result === '不符合';
      var state = hasIssue ? 'issue' : (latest.status || 'empty');
      return Object.assign({}, form, {
        latestRecordId: latest.id || '', latestStatus: latest.status || 'empty',
        latestStatusName: hasIssue ? '有异常' : (latest.status === 'completed' ? '已完成' : (latest.status === 'draft' ? '填写中' : '待填写')), latestUpdatedAt: latest.updatedAtText || '',
        displayState: state, hasIssue: hasIssue, completedItems: completedItems, totalItems: totalItems,
        icon: index === 1 ? '/assets/icon-review-v1/03-ash-hopper.svg' :
          (index === 6 ? '/assets/icon-review-v1/02-electric-field.svg' :
            (index >= 4 ? '/assets/icon-review-v1/04-discharge-electrode.svg' : '/assets/icon-review-v1/05-collecting-plate.svg'))
      });
    });
    var completedCount = list.filter(function (item) { return item.latestStatus === 'completed'; }).length;
    var issueCount = list.filter(function (item) { return item.hasIssue; }).length;
    var pendingCount = list.filter(function (item) { return item.latestStatus !== 'completed'; }).length;
    this.setData({
      project: context.project, device: context.device, stage: context.stage || {}, forms: list,
      records: records, recordMap: recordMap, completedCount: completedCount, pendingCount: pendingCount,
      issueCount: issueCount, completionRate: Math.round(completedCount / list.length * 100)
    });
    this.applyFormFilter();
    app.updateTabBarReminderBadges();
  },
  applyFormFilter: function () {
    var filter = this.data.formFilter;
    var list = (this.data.forms || []).filter(function (item) {
      if (filter === 'pending') return item.latestStatus !== 'completed';
      if (filter === 'issue') return item.hasIssue;
      return true;
    });
    this.setData({ displayForms: list });
  },
  setFormFilter: function (e) {
    this.setData({ formFilter: e.currentTarget.dataset.filter || 'all' });
    this.applyFormFilter();
  },
  openForm: function (e) {
    var formId = e.currentTarget.dataset.formid;
    wx.navigateTo({ url: '/pages/process-form/process-form?formId=' + encodeURIComponent(formId) });
  },
  openFormRow: function (e) {
    var recordId = e.currentTarget.dataset.recordid;
    var formId = e.currentTarget.dataset.formid;
    if (recordId) {
      wx.navigateTo({ url: '/pages/process-form/process-form?recordId=' + encodeURIComponent(recordId) });
    } else {
      wx.navigateTo({ url: '/pages/process-form/process-form?formId=' + encodeURIComponent(formId) });
    }
  },
  openLatest: function (e) {
    var recordId = e.currentTarget.dataset.recordid;
    if (!recordId) return;
    wx.navigateTo({ url: '/pages/process-form/process-form?recordId=' + encodeURIComponent(recordId) });
  },
  continueForm: function () {
    var target = (this.data.forms || []).find(function (item) { return item.latestStatus !== 'completed'; }) || this.data.forms[0];
    if (!target) return;
    var url = target.latestRecordId ? '/pages/process-form/process-form?recordId=' + encodeURIComponent(target.latestRecordId) : '/pages/process-form/process-form?formId=' + encodeURIComponent(target.id);
    wx.navigateTo({ url: url });
  },
  goExport: function () {
    wx.navigateTo({ url: '/pages/process-export/process-export' });
  }
});
