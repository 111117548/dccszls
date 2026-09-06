var app = getApp();
var foundation = require('../../utils/v4-foundation.js');

function emptyProject() {
  return { id: '', name: '', shortName: '', code: '', unit: '', location: '', manager: '', drawingNo: 'G793.0', status: 'construction' };
}
function emptyDevice(projectId) {
  return { id: '', projectId: projectId || '', name: '', code: '', unitNo: '', ordinal: 1, status: 'construction', stageIndex: 1 };
}

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    projects: [], currentProjectId: '', devices: [], currentDeviceId: '',
    showProjectForm: false, showDeviceForm: false,
    projectForm: emptyProject(), deviceForm: emptyDevice(''),
    canEdit: false, canCreateProject: false,
    statusOptions: ['施工中', '已完工', '已归档'],
    statusValues: ['construction', 'completed', 'archived'],
    projectStatusIndex: 0, deviceStageNames: foundation.STAGES.map(function (item) { return item.name; })
  },
  onShow: function () { this.refresh(); },
  refresh: function () {
    var state = app.getFoundationState();
    var context = app.getFoundationContext();
    this.setData({
      projects: state.projects || [], currentProjectId: context.project.id || '',
      devices: foundation.getDevicesByProject(state, context.project.id), currentDeviceId: context.device.id || '',
      canEdit: app.canEditCurrentProject(),
      canCreateProject: app.getFeishuIdentity().role === 'platform_admin'
    });
  },
  selectProject: function (e) {
    if (app.switchProject(e.currentTarget.dataset.id)) this.refresh();
  },
  selectDevice: function (e) {
    if (app.switchDevice(e.currentTarget.dataset.id)) this.refresh();
  },
  addProject: function () {
    if (!this.data.canCreateProject) { wx.showToast({ title: '仅平台管理员可新增项目', icon: 'none' }); return; }
    this.setData({ showProjectForm: true, projectForm: emptyProject(), projectStatusIndex: 0 });
  },
  editProject: function (e) {
    if (!this.data.canEdit) { wx.showToast({ title: '该项目仅可查看', icon: 'none' }); return; }
    var id = e.currentTarget.dataset.id;
    var project = (this.data.projects || []).filter(function (item) { return item.id === id; })[0];
    if (!project) return;
    var index = this.data.statusValues.indexOf(project.status || 'construction');
    this.setData({ showProjectForm: true, projectForm: Object.assign({}, project), projectStatusIndex: Math.max(0, index) });
  },
  closeProjectForm: function () { this.setData({ showProjectForm: false }); },
  onProjectInput: function (e) {
    var update = {}; update['projectForm.' + e.currentTarget.dataset.field] = e.detail.value; this.setData(update);
  },
  onProjectStatusChange: function (e) {
    var index = Number(e.detail.value) || 0;
    this.setData({ projectStatusIndex: index, 'projectForm.status': this.data.statusValues[index] });
  },
  saveProject: function () {
    if (!this.data.canEdit && this.data.projectForm.id) { wx.showToast({ title: '该项目仅可查看', icon: 'none' }); return; }
    var form = this.data.projectForm;
    if (!String(form.name || '').trim()) { wx.showToast({ title: '请填写项目名称', icon: 'none' }); return; }
    app.saveProjectProfile(form);
    this.setData({ showProjectForm: false });
    this.refresh();
    wx.showToast({ title: '项目已保存', icon: 'success' });
  },
  addDevice: function () {
    if (!this.data.canEdit) { wx.showToast({ title: '该项目仅可查看', icon: 'none' }); return; }
    var state = app.getFoundationState();
    var projectId = state.currentProjectId;
    if (!projectId) { wx.showToast({ title: '请先创建项目', icon: 'none' }); return; }
    var count = foundation.getDevicesByProject(state, projectId).length;
    this.setData({ showDeviceForm: true, deviceForm: emptyDevice(projectId) });
    this.setData({ 'deviceForm.ordinal': count + 1, 'deviceForm.name': '#' + (count + 1) + '机组电除尘器', 'deviceForm.unitNo': '#' + (count + 1) + '机组' });
  },
  editDevice: function (e) {
    if (!this.data.canEdit) { wx.showToast({ title: '该项目仅可查看', icon: 'none' }); return; }
    var id = e.currentTarget.dataset.id;
    var device = (this.data.devices || []).filter(function (item) { return item.id === id; })[0];
    if (!device) return;
    var state = app.getFoundationState();
    var ds = state.deviceStates[id] || {};
    this.setData({ showDeviceForm: true, deviceForm: Object.assign({}, device, { stageIndex: ds.actualStageIndex || 1 }) });
  },
  closeDeviceForm: function () { this.setData({ showDeviceForm: false }); },
  onDeviceInput: function (e) {
    var update = {}; update['deviceForm.' + e.currentTarget.dataset.field] = e.detail.value; this.setData(update);
  },
  onDeviceStageChange: function (e) {
    this.setData({ 'deviceForm.stageIndex': (Number(e.detail.value) || 0) + 1 });
  },
  saveDevice: function () {
    if (!this.data.canEdit) { wx.showToast({ title: '该项目仅可查看', icon: 'none' }); return; }
    var form = this.data.deviceForm;
    if (!String(form.name || '').trim()) { wx.showToast({ title: '请填写设备名称', icon: 'none' }); return; }
    var saved = app.saveManagedDevice(form);
    if (form.stageIndex) app.setCurrentConstructionStage(form.stageIndex, '在设备管理中更新施工阶段');
    this.setData({ showDeviceForm: false });
    this.refresh();
    wx.showToast({ title: saved.id ? '设备已保存' : '保存失败', icon: saved.id ? 'success' : 'none' });
  },
  removeDevice: function (e) {
    if (!this.data.canEdit) { wx.showToast({ title: '该项目仅可查看', icon: 'none' }); return; }
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '移除设备', content: '仅建议删除误建且没有业务记录的设备。确认继续？',
      success: function (res) {
        if (res.confirm && app.removeManagedDevice(id)) {
          self.refresh(); wx.showToast({ title: '设备已移除', icon: 'success' });
        }
      }
    });
  }
});
