var app = getApp();
var v3Data = require('../../utils/v3-data.js');
Page({
  data: { nodeId: 'esp', node: {}, status: 'normal', defects: [], records: [], childRows: [], photos: [] },
  onLoad: function (options) { this.setData({ nodeId: options.id || 'esp' }); },
  onShow: function () { this.loadDetail(); },
  loadDetail: function () {
    var state = app.getV3State(); var context = app.getFoundationContext(); var node = v3Data.getNodeById(this.data.nodeId) || state.deviceTree;
    var scopedDefects = (state.defects || []).filter(function (item) { return item.projectId === context.project.id && item.deviceId === context.device.id; });
    var scopedInspections = (state.inspections || []).filter(function (item) { return item.projectId === context.project.id && item.deviceId === context.device.id; });
    var defects = v3Data.getNodeDefects(scopedDefects, node.id);
    var ids = v3Data.flattenDeviceTree(node).map(function (n) { return n.id; });
    var records = scopedInspections.filter(function (r) { return ids.indexOf(r.deviceNodeId) !== -1; });
    var rows = v3Data.flattenDeviceTree(node).map(function (r) { var ds=v3Data.getNodeDefects(scopedDefects,r.id).filter(function(d){return d.status!=='closed'}); return Object.assign({},r,{indent:r.level*28,status:v3Data.deriveStatus(ds),defectCount:ds.length}); });
    this.setData({ node: node, status: v3Data.deriveStatus(defects), defects: defects, records: records, childRows: rows, photos: defects.filter(function (d) { return d.image || d.imageFileID; }) });
    wx.setNavigationBarTitle({ title: node.name + ' · 安装质量档案' });
  },
  onNodeTap: function (e) { this.setData({ nodeId: e.detail.id }); this.loadDetail(); },
  openDefect: function (e) { wx.navigateTo({ url: '/pages/defect-management/defect-management?id=' + e.currentTarget.dataset.id }); },
  startInspection: function () {
    app.globalData.selectedDeviceNodeId = this.data.node.id;
    app.globalData.selectedArea = { key: this.data.node.areaKey || v3Data.getAreaForDevice(this.data.node.id), name: this.data.node.name };
    wx.navigateTo({ url: '/pages/inspect/inspect' });
  }
});
