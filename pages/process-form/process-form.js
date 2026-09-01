var app = getApp();
var forms = require('../../utils/process-forms.js');

Page({
  data: {
    form: {}, record: {}, groups: [], chamberOptions: ['A1','A2','B1','B2'],
    chamberIndex: 0, resultOptions: ['请选择','符合','不符合'], resultIndex: 0,
    matrixFieldIndex: 0, matrixFieldNames: ['一电场','二电场','三电场','四电场'],
    matrixRows: [], exporting: false, completion: 0
  },
  onLoad: function (options) {
    var record = null;
    if (options.recordId) {
      var records = app.getProcessRecords();
      for (var i = 0; i < records.length; i++) if (records[i].id === decodeURIComponent(options.recordId)) record = records[i];
    }
    var context = app.getFoundationContext();
    var formId = record ? record.formId : decodeURIComponent(options.formId || 'annex-1');
    var form = forms.getForm(formId);
    if (!record) record = forms.createRecord(formId, {
      projectId: context.project.id, projectName: context.project.name,
      deviceId: context.device.id, deviceName: context.device.name
    });
    var groups = this.buildGroups(form, record);
    var chamberIndex = Math.max(0, this.data.chamberOptions.indexOf(record.chamber || 'A1'));
    var resultIndex = Math.max(0, this.data.resultOptions.indexOf(record.result || ''));
    this.setData({ form: form, record: record, groups: groups, chamberIndex: chamberIndex, resultIndex: resultIndex });
    this.refreshMatrix();
    this.updateCompletion();
  },
  buildGroups: function (form, record) {
    return (form.groups || []).map(function (group) {
      return Object.assign({}, group, {
        items: group.codes.map(function (code) {
          return { code: code, value: record.values && record.values[group.id] ? record.values[group.id][code] || '' : '' };
        })
      });
    });
  },
  onMetaInput: function (e) {
    var update = {}; update['record.' + e.currentTarget.dataset.field] = e.detail.value; this.setData(update);
  },
  onDateChange: function (e) { this.setData({ 'record.inspectionDate': e.detail.value }); },
  onChamberChange: function (e) {
    var index = Number(e.detail.value) || 0;
    this.setData({ chamberIndex: index, 'record.chamber': this.data.chamberOptions[index] });
  },
  onResultChange: function (e) {
    var index = Number(e.detail.value) || 0;
    this.setData({ resultIndex: index, 'record.result': index ? this.data.resultOptions[index] : '' });
    this.updateCompletion();
  },
  onMetricInput: function (e) {
    var groupId = e.currentTarget.dataset.group;
    var code = e.currentTarget.dataset.code;
    var value = e.detail.value;
    var record = this.data.record;
    record.values = record.values || {}; record.values[groupId] = record.values[groupId] || {}; record.values[groupId][code] = value;
    var groups = this.data.groups;
    groups.forEach(function (group) {
      if (group.id === groupId) group.items.forEach(function (item) { if (item.code === code) item.value = value; });
    });
    this.setData({ record: record, groups: groups });
    this.updateCompletion();
  },
  onMatrixFieldChange: function (e) {
    this.setData({ matrixFieldIndex: Number(e.detail.value) || 0 });
    this.refreshMatrix();
  },
  refreshMatrix: function () {
    if (!this.data.form.matrix) return;
    var key = 'field' + (this.data.matrixFieldIndex + 1);
    var rows = this.data.record.matrixValues && this.data.record.matrixValues[key] || [];
    var columns = this.data.form.matrix.columns || [];
    this.setData({
      matrixRows: rows.map(function (row) {
        return {
          channel: row.channel,
          cells: columns.map(function (column) {
            return { id: column.id, value: row[column.id] || '' };
          })
        };
      })
    });
  },
  onMatrixInput: function (e) {
    var rowIndex = Number(e.currentTarget.dataset.row);
    var column = e.currentTarget.dataset.column;
    var value = e.detail.value;
    var key = 'field' + (this.data.matrixFieldIndex + 1);
    var record = this.data.record;
    record.matrixValues[key][rowIndex][column] = value;
    this.setData({ record: record });
    this.refreshMatrix();
    this.updateCompletion();
  },
  countFields: function () {
    var form = this.data.form; var record = this.data.record; var total = 0; var filled = 0;
    (form.groups || []).forEach(function (group) {
      group.codes.forEach(function (code) {
        total++; if (String(record.values && record.values[group.id] && record.values[group.id][code] || '').trim()) filled++;
      });
    });
    if (form.matrix) {
      for (var field = 1; field <= form.matrix.fieldCount; field++) {
        (record.matrixValues['field' + field] || []).forEach(function (row) {
          form.matrix.columns.forEach(function (col) { total++; if (String(row[col.id] || '').trim()) filled++; });
        });
      }
    }
    return { total: total, filled: filled };
  },
  updateCompletion: function () {
    var counts = this.countFields();
    var completion = counts.total ? Math.round(counts.filled / counts.total * 100) : 0;
    this.setData({ completion: completion });
  },
  saveDraft: function () { this.persist('draft'); },
  completeRecord: function () {
    var counts = this.countFields();
    if (!this.data.record.result) { wx.showToast({ title: '请选择检查结果', icon: 'none' }); return; }
    if (counts.filled < counts.total) {
      wx.showModal({
        title: '记录尚未填满',
        content: '已填写 ' + counts.filled + '/' + counts.total + ' 个实测项。可以先保存草稿，全部测量后再完成。',
        showCancel: false
      });
      return;
    }
    this.persist('completed');
  },
  persist: function (status) {
    var record = this.data.record;
    record.status = status; record.statusName = status === 'completed' ? '已完成' : '草稿';
    record.updatedAtText = new Date().toLocaleString('zh-CN');
    app.saveProcessRecord(record);
    this.setData({ record: record });
    wx.showToast({ title: status === 'completed' ? '记录已完成' : '草稿已保存', icon: 'success' });
  },
  exportExcel: function () {
    var self = this;
    if (!wx.cloud || !wx.cloud.callFunction) { wx.showToast({ title: '当前环境不支持云端导出', icon: 'none' }); return; }
    this.persist(this.data.record.status || 'draft');
    this.setData({ exporting: true });
    wx.cloud.callFunction({
      name: 'generate-inspection-workbook',
      data: { form: this.data.form, record: this.data.record },
      success: function (res) {
        var result = res.result || {};
        if (!result.success || !result.fileID) { wx.showModal({ title: '导出失败', content: result.error || '未生成Excel文件', showCancel: false }); return; }
        wx.cloud.downloadFile({
          fileID: result.fileID,
          success: function (download) {
            wx.openDocument({ filePath: download.tempFilePath, fileType: result.fileType || 'xlsx', showMenu: true });
          },
          fail: function (err) { wx.showModal({ title: '下载失败', content: err.errMsg || '请稍后重试', showCancel: false }); }
        });
      },
      fail: function (err) { wx.showModal({ title: '导出失败', content: err.errMsg || '请部署Excel导出云函数', showCancel: false }); },
      complete: function () { self.setData({ exporting: false }); }
    });
  },
  showOriginalTemplate: function () {
    wx.showModal({
      title: '原表模板',
      content: '保存的数据会写入《电除尘器本体安装检查记录》的对应附表；请在导出页生成Excel后查看完整原表、打印并手写签字。',
      confirmText: '前往导出',
      success: function (res) {
        if (res.confirm) wx.navigateTo({ url: '/pages/process-export/process-export' });
      }
    });
  }
});
