// pages/history/history.js — V2.0 with edit/delete
var util = require('../../utils/util.js');
var app = getApp();

Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'inspection', label: '检查记录' },
      { key: 'rectification', label: '整改闭环' },
      { key: 'samples', label: '样本库' }
    ],
    activeTab: 'rectification',
    records: [],
    contextProject: {},
    contextDevice: {},
    rectificationView: 'ongoing',
    rectificationRows: [],
    rectificationStats: { pending: 0, review: 0, overdue: 0 },
    reminderCount: 0,
    searchKeyword: '',
    feishuSyncing: false,
    feishuSyncText: '',
    lastFeishuAutoSyncAt: 0,
    showDetail: false,
    detailRecord: null,
    // Sample library
    sampleSubTab: 'samples',
    samples: [],
    sampleCount: 0,
    samplesLoading: false,
    falsePositives: [],
    falsePositiveCount: 0,
    falsePositivesLoading: false,
    missedDefects: [],
    missedDefectCount: 0,
    missedDefectsLoading: false,
    // Edit modal
    showEditModal: false,
    editingRecord: null,
    editDefects: [],
    editDefectIndex: -1,
    editDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
  },

  onLoad: function (options) {
    var tab = options && options.tab;
    if (['all', 'inspection', 'rectification', 'samples'].indexOf(tab) !== -1) this.setData({ activeTab: tab });
  },

  onShow: function () {
    if (this.data.activeTab === 'samples') {
      this._loadCurrentSubTab();
    } else {
      this.loadRecords();
      var self = this;
      app.refreshProjectCloudState().then(function () { self.loadRecords(); }).catch(function () {});
      if (this.data.activeTab === 'rectification') this._autoSyncFeishuTasks();
    }
  },

  _autoSyncFeishuTasks: function () {
    var self = this;
    var now = Date.now();
    if (this.data.feishuSyncing || now - Number(this.data.lastFeishuAutoSyncAt || 0) < 60 * 1000) return;
    this.setData({ feishuSyncing: true, lastFeishuAutoSyncAt: now, feishuSyncText: '正在同步本项目飞书整改项…' });
    app.refreshFeishuRectificationTasks({ forceRefresh: false }).then(function (result) {
      self.setData({
        feishuSyncing: false,
        feishuSyncText: '飞书已同步：本项目 ' + Number(result.count || 0) + ' 项'
      });
      self.loadRecords();
    }).catch(function (error) {
      self.setData({
        feishuSyncing: false,
        feishuSyncText: '飞书自动同步未完成：' + ((error && error.message) || '请点击同步重试')
      });
    });
  },

  loadRecords: function () {
    var context = app.getFoundationContext();
    var raw = (app.globalData.historyRecords || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    var filter = this.data.activeTab;
    var orders = (app.getV3State().rectificationOrders || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    var orderMap = {};
    orders.forEach(function (order) { if (order && order.id) orderMap[order.id] = order; });

    var records = raw.map(function (r) {
      var enriched = Object.assign({}, r);
      if (r.type === 'inspection' || r.type === 'batch') {
        enriched.scoreClass = (r.qualityScore >= 80) ? 'good' : (r.qualityScore >= 60) ? 'warn' : 'bad';
        if (r.type === 'batch') {
          enriched.isBatch = true;
        }
        // Enrich defects with display names
        if (r.defects) {
          enriched.defects = r.defects.map(function (d) {
            return Object.assign({}, d, {
              typeName: util.getTypeName(d.type),
              severityName: util.getSeverityCN(d.severity)
            });
          });
        }
        var order = orderMap[r.rectificationOrderId];
        if (order) {
          enriched.rectificationOrderId = order.id;
          enriched.rectificationStatus = order.status;
          enriched.rectificationStatusName = order.statusName || (order.status === 'closed' ? '已闭环' : '待整改');
          enriched.rectificationIsClosed = order.status === 'closed';
          enriched.rectificationIsReview = order.status === 'review';
          enriched.rectificationCanShare = !!order.shareToken && order.status !== 'closed';
          enriched.rectificationOrder = order;
        }
        enriched.canCreateBatchRectification = r.type === 'batch'
          && Number(r.totalDefects || (r.defects || []).length) > 0
          && !enriched.rectificationOrderId;
      } else if (r.type === 'issue') {
        // Backward compat: old individual records
        enriched.severityName = util.getSeverityName(r.severity);
        enriched.severityColor = util.getSeverityColor(r.severity);
        enriched.typeName = util.getTypeName(r.issueType);
      }
      return enriched;
    });

    if (filter === 'inspection') {
      records = records.filter(function (r) { return r.type === 'inspection' || r.type === 'batch'; });
    } else if (filter === 'rectification') {
      records = records.filter(function (r) { return !!r.rectificationOrderId; });
    }

    records.sort(function (a, b) {
      return (b.timestamp || b.time || '').toString().localeCompare((a.timestamp || a.time || '').toString());
    });

    this.setData({ records: records, contextProject: context.project, contextDevice: context.device });
    this._refreshRectificationDashboard(orders);
  },

  _refreshRectificationDashboard: function (orders) {
    var view = this.data.rectificationView;
    var keyword = String(this.data.searchKeyword || '').trim().toLowerCase();
    var now = Date.now();
    var ongoing = orders.filter(function (item) { return item.status !== 'closed'; });
    var closed = orders.filter(function (item) { return item.status === 'closed'; });
    var rows = (view === 'closed' ? closed : ongoing).filter(function (item) {
      if (!keyword) return true;
      return String(item.title || item.id || '').toLowerCase().indexOf(keyword) !== -1;
    }).map(function (item) {
      var first = item.items && item.items[0] || {};
      var dateText = item.closedAtText || item.updatedAtText || item.createdAtText || '';
      var systemName = String(first.systemName || item.deviceName || '').trim();
      var positionCode = String(item.positionCode || '').trim();
      var positionParts = [];
      if (systemName) positionParts.push(systemName);
      if (positionCode && positionCode !== systemName) positionParts.push(positionCode);
      return Object.assign({}, item, {
        title: item.title || first.name || 'AI缺陷整改任务',
        positionLabel: positionParts.join(' · '),
        statusName: item.statusName || (item.status === 'closed' ? '已闭环' : item.status === 'review' ? '待复验' : item.status === 'rejected' ? '复验退回' : '待整改'),
        shortDate: dateText ? String(dateText).slice(5, 10) : ''
      });
    });
    var pendingCount = ongoing.filter(function (item) { return item.status !== 'review'; }).length;
    var reviewCount = ongoing.filter(function (item) { return item.status === 'review'; }).length;
    this.setData({
      rectificationRows: rows,
      reminderCount: pendingCount + reviewCount,
      rectificationStats: {
        pending: pendingCount,
        review: reviewCount,
        overdue: ongoing.filter(function (item) { return item.deadlineTimestamp && item.deadlineTimestamp < now; }).length
      }
    });
    app.updateTabBarReminderBadges();
  },

  switchRectificationView: function (e) {
    this.setData({ rectificationView: e.currentTarget.dataset.view || 'ongoing' });
    this.loadRecords();
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.loadRecords();
  },

  goAI: function () { wx.navigateTo({ url: '/pages/inspect/inspect' }); },

  syncFeishuTasks: function () {
    var self = this;
    if (this.data.feishuSyncing) return;
    this.setData({ feishuSyncing: true, feishuSyncText: '正在从飞书拉取本项目整改项…' });
    app.refreshFeishuRectificationTasks({ forceRefresh: true }).then(function (result) {
      self.setData({ feishuSyncing: false, feishuSyncText: '飞书同步完成：读取 ' + (result.count || 0) + ' 项，新增 ' + (result.imported || 0) + ' 项' });
      self.loadRecords();
      // When no row is imported, expose server-side matching diagnostics instead of
      // leaving users with an unexplained "0 items" result.
      var diagnostic = result.diagnostics || {};
      if (!(result.count || 0) && diagnostic.totalRecords) {
        wx.showModal({
          title: '\u98de\u4e66\u6682\u65e0\u5339\u914d\u4efb\u52a1',
          content: '\u5df2\u8bfb\u53d6 ' + diagnostic.totalRecords + '\u6761\u8bb0\u5f55\uff0c\u5f53\u524d\u98de\u4e66\u9879\u76ee\uff1a' + (diagnostic.projectName || '\u7a7a') +
            '\uff0c\u7089\u53f7\uff1a' + (diagnostic.deviceName || '\u7a7a') +
            '\u3002\u5176\u4e2d\u9879\u76ee\u540d\u79f0\u4e0d\u5339\u914d ' + (diagnostic.skippedProjectName || 0) + '\u6761\uff0c\u7089\u53f7\u4e0d\u5339\u914d ' + (diagnostic.skippedDevice || 0) + '\u6761' +
            ((diagnostic.mismatchedDevices || []).length ? '\uff08\u98de\u4e66\u586b\u5199\uff1a' + diagnostic.mismatchedDevices.join('\u3001') + '\uff09' : '') + '\u3002',
          showCancel: false
        });
      }
      wx.showToast({ title: '飞书整改项已同步', icon: 'success' });
    }).catch(function (err) {
      self.setData({ feishuSyncing: false, feishuSyncText: '飞书同步失败：' + ((err && err.message) || '请检查云函数配置') });
      wx.showModal({ title: '飞书同步失败', content: (err && err.message) || '请检查飞书应用授权和云函数环境变量。', showCancel: false });
    });
  },

  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'samples') {
      this._loadCurrentSubTab();
    } else {
      this.loadRecords();
      if (tab === 'rectification') this._autoSyncFeishuTasks();
    }
  },

  // ===== Record Detail =====
  showRecordDetail: function (e) {
    var idx = e.currentTarget.dataset.index;
    var record = this.data.records[idx];
    if (!record) return;

    if (record.type === 'inspection' || record.type === 'batch') {
      this.setData({ showDetail: true, detailRecord: record });
    } else if (record.url) {
      wx.navigateTo({ url: record.url });
    }
  },

  openRectification: function (e) {
    var orderId = e.currentTarget.dataset.orderid;
    if (!orderId) return;
    this.setData({ showDetail: false, detailRecord: null });
    wx.navigateTo({ url: '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(orderId) + '&from=creator' });
  },

  openRectificationShare: function (e) {
    var orderId = e.currentTarget.dataset.orderid;
    if (!orderId) return;
    wx.navigateTo({
      url: '/pages/rectification-share/rectification-share?id=' + encodeURIComponent(orderId)
    });
  },

  createBatchRectification: function (e) {
    var recordId = e.currentTarget.dataset.recordid;
    var records = app.globalData.historyRecords || [];
    var record = null;
    for (var i = 0; i < records.length; i++) {
      if (String(records[i].id) === String(recordId)) {
        record = records[i];
        break;
      }
    }
    if (!record || record.type !== 'batch') return;

    if (record.rectificationOrderId && app.getRectificationOrder(record.rectificationOrderId)) {
      this.loadRecords();
      wx.showToast({ title: '整改单已存在', icon: 'none' });
      return;
    }

    var defects = (record.defects || []).map(function (defect, index) {
      var photoNumber = Number(defect.photoIdx || 0) + 1;
      return Object.assign({}, defect, {
        id: String(record.id) + '-BATCH-D' + (index + 1),
        sourceDefectId: defect.sourceDefectId || defect.id,
        level: defect.level || (defect.severity === 'major' ? 'III' : defect.severity === 'moderate' ? 'II' : 'I'),
        deviceName: defect.deviceName || record.areaName || '批量巡检',
        positionCode: defect.positionCode || ('批量照片 ' + photoNumber)
      });
    });

    if (defects.length === 0) {
      wx.showToast({ title: '该记录没有待整改缺陷', icon: 'none' });
      return;
    }

    record.defects = defects;
    var order = app.createOpenRectificationOrder(record, record, defects, record.image || '');
    if (!order) {
      wx.showToast({ title: '整改单生成失败', icon: 'none' });
      return;
    }

    app.syncBatchToCloud(record);
    this.loadRecords();
    if (this.data.showDetail) {
      var current = null;
      for (var j = 0; j < this.data.records.length; j++) {
        if (String(this.data.records[j].id) === String(record.id)) current = this.data.records[j];
      }
      this.setData({ detailRecord: current || this.data.detailRecord });
    }
    wx.showToast({ title: '已生成，请点击微信转发', icon: 'none', duration: 2200 });
  },

  onShareAppMessage: function (res) {
    var orderId = res && res.target && res.target.dataset ? res.target.dataset.orderid : '';
    var order = app.getRectificationOrder(orderId);
    if (!order || !order.shareToken) return { title: 'ESP AI质检整改记录', path: '/pages/history/history' };
    return {
      title: '整改协作单 ' + order.id + '｜点击上传整改照片并闭环',
      path: '/pages/rectification-detail/rectification-detail?id=' + encodeURIComponent(order.id) + '&projectId=' + encodeURIComponent(order.projectId) + '&token=' + encodeURIComponent(order.shareToken) + '&from=share'
    };
  },

  closeDetail: function () {
    this.setData({ showDetail: false, detailRecord: null });
  },

  // ===== Delete Record =====
  deleteRecord: function (e) {
    var idx = e.currentTarget.dataset.index;
    var record = this.data.records[idx];
    if (!record) return;
    var self = this;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      confirmColor: '#ef4444',
      success: function (res) {
        if (res.confirm) {
          var records = app.globalData.historyRecords;
          var realIdx = -1;
          for (var i = 0; i < records.length; i++) {
            if (records[i].id === record.id) {
              realIdx = i;
              break;
            }
          }
          if (realIdx >= 0) {
            records.splice(realIdx, 1);
            app.saveHistory();
          }
          self.setData({ showDetail: false, detailRecord: null });
          self.loadRecords();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  deleteRecordFromDetail: function () {
    if (!this.data.detailRecord) return;
    var self = this;
    var record = this.data.detailRecord;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      confirmColor: '#ef4444',
      success: function (res) {
        if (res.confirm) {
          var records = app.globalData.historyRecords;
          var realIdx = -1;
          for (var i = 0; i < records.length; i++) {
            if (records[i].id === record.id) {
              realIdx = i;
              break;
            }
          }
          if (realIdx >= 0) {
            records.splice(realIdx, 1);
            app.saveHistory();
          }
          self.setData({ showDetail: false, detailRecord: null });
          self.loadRecords();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // ===== Edit Record =====
  showEditModal: function (e) {
    var idx = e.currentTarget.dataset.index;
    var record = this.data.records[idx];
    if (!record || (record.type !== 'inspection' && record.type !== 'batch')) return;

    this.setData({
      showEditModal: true,
      editingRecord: record,
      editDefects: (record.defects || []).map(function (d) { return Object.assign({}, d); }),
      editDefectIndex: -1,
      editDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
    });
  },

  showEditModalFromDetail: function () {
    var record = this.data.detailRecord;
    if (!record || (record.type !== 'inspection' && record.type !== 'batch')) return;

    this.setData({
      showEditModal: true,
      editingRecord: record,
      editDefects: (record.defects || []).map(function (d) { return Object.assign({}, d); }),
      editDefectIndex: -1,
      editDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
    });
  },

  closeEditModal: function () {
    this.setData({
      showEditModal: false,
      editingRecord: null,
      editDefects: [],
      editDefectIndex: -1
    });
  },

  saveEditModal: function () {
    var record = this.data.editingRecord;
    if (!record) return;

    var editDefects = this.data.editDefects;

    // Update the record in globalData
    var records = app.globalData.historyRecords;
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === record.id) {
        records[i].defects = editDefects;
        records[i].totalDefects = editDefects.length;
        // Recount
        var mc = 0, modc = 0, mic = 0;
        editDefects.forEach(function (d) {
          if (d.severity === 'major') mc++;
          else if (d.severity === 'moderate') modc++;
          else mic++;
        });
        records[i].majorCount = mc;
        records[i].moderateCount = modc;
        records[i].minorCount = mic;
        break;
      }
    }
    app.saveHistory();

    this.setData({ showEditModal: false, editingRecord: null, showDetail: false, detailRecord: null });
    this.loadRecords();
    wx.showToast({ title: '已保存修改', icon: 'success' });
  },

  // Edit individual defect in modal
  editDefectInModal: function (e) {
    var idx = e.currentTarget.dataset.index;
    var defects = this.data.editDefects;
    if (!defects || !defects[idx]) return;
    var d = defects[idx];

    this.setData({
      editDefectIndex: idx,
      editDefectForm: {
        name: d.name || '',
        severity: d.severity || 'moderate',
        description: d.description || '',
        suggestion: d.suggestion || ''
      }
    });
  },

  onEditDefectInput: function (e) {
    var field = e.currentTarget.dataset.field;
    if (!field) return;
    var updateData = {};
    updateData['editDefectForm.' + field] = e.detail.value;
    this.setData(updateData);
  },

  onEditSeverityChange: function (e) {
    var idx = parseInt(e.detail.value);
    var severityMap = ['major', 'moderate', 'minor'];
    this.setData({ 'editDefectForm.severity': severityMap[idx] || 'moderate' });
  },

  saveDefectEdit: function () {
    var idx = this.data.editDefectIndex;
    if (idx < 0) return;
    var form = this.data.editDefectForm;
    var defects = this.data.editDefects;
    if (!defects[idx]) return;

    defects[idx].name = form.name || defects[idx].name;
    defects[idx].severity = form.severity || defects[idx].severity;
    defects[idx].description = form.description || defects[idx].description;
    defects[idx].suggestion = form.suggestion || defects[idx].suggestion;
    defects[idx].severityName = util.getSeverityCN(defects[idx].severity);

    this.setData({
      editDefects: defects,
      editDefectIndex: -1,
      editDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
    });
  },

  cancelDefectEdit: function () {
    this.setData({
      editDefectIndex: -1,
      editDefectForm: { name: '', severity: 'moderate', description: '', suggestion: '' }
    });
  },

  deleteDefectInModal: function (e) {
    var idx = e.currentTarget.dataset.index;
    var defects = this.data.editDefects;
    if (!defects || !defects[idx]) return;

    defects.splice(idx, 1);
    this.setData({ editDefects: defects, editDefectIndex: -1 });
  },

  addDefectInModal: function () {
    var defects = this.data.editDefects || [];
    var newId = defects.length > 0 ? defects[defects.length - 1].id + 1 : 1;

    defects.push({
      id: newId,
      name: '新缺陷',
      type: 'other',
      severity: 'moderate',
      description: '',
      suggestion: '',
      confidence: 1.0,
      _userAdded: true,
      typeName: '其他',
      severityName: '一般'
    });

    this.setData({
      editDefects: defects,
      editDefectIndex: defects.length - 1,
      editDefectForm: { name: '新缺陷', severity: 'moderate', description: '', suggestion: '' }
    });
  },

  // ===== Old compat: delete/clear for individual records =====
  deleteIssue: function (e) {
    var idx = e.currentTarget.dataset.index;
    var record = this.data.records[idx];
    if (!record) return;
    var self = this;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      confirmColor: '#ef4444',
      success: function (res) {
        if (res.confirm) {
          var records = app.globalData.historyRecords;
          var realIdx = -1;
          for (var i = 0; i < records.length; i++) {
            if (records[i].id === record.id) {
              realIdx = i;
              break;
            }
          }
          if (realIdx >= 0) {
            records.splice(realIdx, 1);
            app.saveHistory();
          }
          self.loadRecords();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  clearAll: function () {
    var self = this;
    wx.showModal({
      title: '清空记录',
      content: '将清除所有检查历史记录，此操作不可恢复。',
      confirmColor: '#ef4444',
      success: function (res) {
        if (res.confirm) {
          app.globalData.historyRecords = [];
          app.saveHistory();
          self.loadRecords();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  // ===== Sample Library =====
  switchSampleTab: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: 'samples', sampleSubTab: tab });
    this._loadCurrentSubTab();
  },

  _loadCurrentSubTab: function () {
    var tab = this.data.sampleSubTab;
    if (tab === 'samples') this.loadSamples();
    else if (tab === 'false-positives') this.loadFalsePositives();
    else if (tab === 'missed-defects') this.loadMissedDefects();
  },

  loadSamples: function () {
    var self = this;
    self.setData({ samplesLoading: true });
    try {
      var db = wx.cloud.database();
      db.collection('defect-samples').orderBy('createTime', 'desc').limit(50).get({
        success: function (res) {
          var list = (res.data || []).map(function (item) {
            item.severityCN = util.getSeverityCN(item.severity);
            item.typeCN = util.getTypeName(item.type);
            return item;
          });
          self.setData({ samples: list, sampleCount: list.length, samplesLoading: false });
        },
        fail: function () { self.setData({ samples: [], samplesLoading: false }); }
      });
    } catch (e) {
      self.setData({ samples: [], samplesLoading: false });
    }
  },

  loadFalsePositives: function () {
    var self = this;
    self.setData({ falsePositivesLoading: true });
    try {
      var db = wx.cloud.database();
      db.collection('false-positives').orderBy('createTime', 'desc').limit(50).get({
        success: function (res) {
          var list = (res.data || []).map(function (item) {
            item.severityCN = util.getSeverityCN(item.severity);
            item.typeCN = util.getTypeName(item.type);
            return item;
          });
          self.setData({ falsePositives: list, falsePositiveCount: list.length, falsePositivesLoading: false });
        },
        fail: function () { self.setData({ falsePositives: [], falsePositivesLoading: false }); }
      });
    } catch (e) {
      self.setData({ falsePositives: [], falsePositivesLoading: false });
    }
  },

  loadMissedDefects: function () {
    var self = this;
    self.setData({ missedDefectsLoading: true });
    try {
      var db = wx.cloud.database();
      db.collection('missed-defects').orderBy('createTime', 'desc').limit(50).get({
        success: function (res) {
          var list = (res.data || []).map(function (item) {
            item.severityCN = util.getSeverityCN(item.severity);
            return item;
          });
          self.setData({ missedDefects: list, missedDefectCount: list.length, missedDefectsLoading: false });
        },
        fail: function () { self.setData({ missedDefects: [], missedDefectsLoading: false }); }
      });
    } catch (e) {
      self.setData({ missedDefects: [], missedDefectsLoading: false });
    }
  },

  previewSampleImage: function (e) {
    var fileID = e.currentTarget.dataset.fileid;
    if (!fileID) return;
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: function (res) {
        var url = res.fileList[0] && res.fileList[0].tempFileURL;
        if (url) wx.previewImage({ urls: [url], current: url });
      }
    });
  },

  deleteSample: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '删除样本', content: '确定删除此样本？',
      success: function (res) {
        if (res.confirm) {
          try {
            var db = wx.cloud.database();
            db.collection('defect-samples').doc(id).remove({
              success: function () {
                wx.showToast({ title: '已删除', icon: 'success' });
                self.loadSamples();
              }
            });
          } catch (err) {}
        }
      }
    });
  },

  deleteFalsePositive: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '删除误报记录', content: '确定删除？',
      success: function (res) {
        if (res.confirm) {
          try {
            var db = wx.cloud.database();
            db.collection('false-positives').doc(id).remove({
              success: function () {
                wx.showToast({ title: '已删除', icon: 'success' });
                self.loadFalsePositives();
              }
            });
          } catch (err) {}
        }
      }
    });
  },

  deleteMissedDefect: function (e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '删除漏检记录', content: '确定删除？',
      success: function (res) {
        if (res.confirm) {
          try {
            var db = wx.cloud.database();
            db.collection('missed-defects').doc(id).remove({
              success: function () {
                wx.showToast({ title: '已删除', icon: 'success' });
                self.loadMissedDefects();
              }
            });
          } catch (err) {}
        }
      }
    });
  },

  exportHistory: function () {
    var records = this.data.records;
    if (!records || records.length === 0) {
      wx.showToast({ title: '没有可导出的记录', icon: 'none' });
      return;
    }
    wx.showToast({ title: '导出功能开发中', icon: 'none' });
  }
});
