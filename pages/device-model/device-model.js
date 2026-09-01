var app = getApp();
var v3Data = require('../../utils/v3-data.js');

Page({
  data: { project: {}, regions: [], markers: [], rows: [], selectedId: 'esp', selectedNode: {}, selectedDefects: [] },
  onShow: function () { this.loadModel(); },
  loadModel: function () {
    var state = app.getV3State();
    var context = app.getFoundationContext();
    var defects = (state.defects || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    this.setData({
      project: Object.assign({}, context.project, {
        drawingNo: context.project.drawingNo || context.template.drawingNo,
        layout: context.template.layout,
        deviceName: context.device.name,
        stageIndex: context.stage.index,
        stage: context.stage.name
      }),
      regions: v3Data.buildModelRegions(defects),
      markers: v3Data.getModelMarkers(defects),
      rows: v3Data.buildDeviceRows(defects)
    });
    this.selectNode(this.data.selectedId || 'esp');
  },
  selectNode: function (id) {
    var state = app.getV3State();
    var context = app.getFoundationContext();
    var node = v3Data.getNodeById(id) || state.deviceTree;
    var scopedDefects = (state.defects || []).filter(function (item) {
      return item.projectId === context.project.id && item.deviceId === context.device.id;
    });
    var defects = v3Data.getNodeDefects(scopedDefects, id).filter(function (d) { return d.status !== 'closed'; });
    this.setData({ selectedId: id, selectedNode: Object.assign({}, node, { status: v3Data.deriveStatus(defects), defectCount: defects.length }), selectedDefects: defects });
  },
  onNodeTap: function (e) { this.selectNode(e.detail.id || 'esp'); },
  onTwinPartTap: function () {
    var context = app.getFoundationContext();
    this.openProgressByIndex(context.stage.index, 'device-model');
  },
  onDefectTap: function (e) { wx.navigateTo({ url: '/pages/defect-management/defect-management?id=' + e.detail.defect.id }); },
  openDefect: function (e) { wx.navigateTo({ url: '/pages/defect-management/defect-management?id=' + e.currentTarget.dataset.id }); },
  resolveStageIndex: function (id) {
    var text = String(id || '').toLowerCase();
    if (/support-bearing|bearing|seat|支座/.test(text)) return 1;
    if (/foundation|beam|基础梁/.test(text)) return 2;
    if (/steel-support|steel|frame|钢支架/.test(text)) return 3;
    if (/hopper|ash|灰斗/.test(text)) return 4;
    if (/shell|casing|chamber|壳体/.test(text)) return 5;
    if (/inlet|outlet|horn|喇叭/.test(text)) return 6;
    if (/anode|阳极/.test(text)) return 7;
    if (/cathode|阴极/.test(text)) return 8;
    if (/rapping|振打/.test(text)) return 9;
    if (/high-voltage|hv|高压/.test(text)) return 10;
    if (/platform|stair|hoist|平台|扶梯|起吊/.test(text)) return 11;
    if (/electric|instrument|meter|电气|仪表/.test(text)) return 12;
    return Number(app.getFoundationContext().stage.index) || 1;
  },
  openProgressByIndex: function (stageIndex, source) {
    var index = Math.max(1, Math.min(13, Number(stageIndex) || 1));
    wx.navigateTo({
      url: '/pages/construction-progress/construction-progress?stageIndex=' + index + '&source=' + encodeURIComponent(source || 'device-model')
    });
  },
  openProgress: function () {
    this.openProgressByIndex(this.resolveStageIndex(this.data.selectedId), 'device-tree');
  }
});
