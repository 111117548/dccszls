var app = getApp();

function pad(value) { return value < 10 ? '0' + value : String(value); }
function dateText(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
function compactItems(items) {
  return (items || []).map(function (item) { return String(item || '').trim(); }).filter(Boolean);
}
function copyItems(items) { return (items || []).map(function (item) { return String(item || ''); }); }
function mergeItems() {
  var result = [];
  Array.prototype.slice.call(arguments).forEach(function (items) {
    compactItems(items).forEach(function (item) {
      if (result.indexOf(item) < 0) result.push(item);
    });
  });
  return result;
}
function suggestionFromProgress() {
  if (!app.getConstructionDailySuggestions) return { todayItems: [], tomorrowItems: [], linkedStages: [], currentStageIndex: 0, currentStageName: '' };
  try { return app.getConstructionDailySuggestions() || {}; } catch (error) {
    console.warn('施工日报读取安装进度失败', error);
    return { todayItems: [], tomorrowItems: [], linkedStages: [], currentStageIndex: 0, currentStageName: '' };
  }
}
function progressSummary(suggestion) {
  var stages = suggestion.linkedStages || [];
  if (!stages.length) return '当前阶段及前序部件均已完成';
  return '当前' + (suggestion.currentStageName || '施工阶段') + '，已带入' + stages.length + '项未完工内容';
}

Page({
  onShareAppMessage: function () { return require('../../utils/share.js').home(); },

  data: {
    project: {}, device: {}, reportDate: '', dateLabel: '',
    todayItems: [''], tomorrowItems: [''], inherited: false,
    linkedStages: [], progressSummary: '', generatedFromProgress: false,
    savedAtLabel: '', dirty: false, saving: false, canEdit: false
  },

  onShow: function () { this.loadDraft(); },
  onHide: function () { if (this.data.dirty && this.data.canEdit) this.persistDraft(true); },

  loadDraft: function () {
    var state = app.getV3State();
    var context = app.getFoundationContext();
    var now = new Date();
    var currentDate = dateText(now);
    var reports = (state.reports || []).filter(function (item) {
      return item.type === 'construction_daily' && item.projectId === context.project.id && item.deviceId === context.device.id;
    }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var current = reports.filter(function (item) { return item.date === currentDate; })[0];
    var previous = reports.filter(function (item) { return item.date < currentDate; })[0];
    var suggestion = suggestionFromProgress();
    var suggestedToday = compactItems(suggestion.todayItems);
    var suggestedTomorrow = compactItems(suggestion.tomorrowItems);
    var inherited = false;
    var todayItems;
    var tomorrowItems;
    if (current) {
      todayItems = copyItems(current.todayItems);
      tomorrowItems = copyItems(current.tomorrowItems);
    } else if (previous && compactItems(previous.tomorrowItems).length) {
      todayItems = mergeItems(previous.tomorrowItems, suggestedToday);
      tomorrowItems = mergeItems(previous.tomorrowItems, suggestedTomorrow);
      inherited = true;
    } else {
      todayItems = suggestedToday;
      tomorrowItems = suggestedTomorrow;
    }
    this.setData({
      project: context.project || {}, device: context.device || {}, reportDate: currentDate,
      dateLabel: (now.getMonth() + 1) + '月' + now.getDate() + '日',
      todayItems: todayItems.length ? todayItems : [''], tomorrowItems: tomorrowItems.length ? tomorrowItems : [''],
      inherited: inherited, linkedStages: suggestion.linkedStages || [], progressSummary: progressSummary(suggestion),
      generatedFromProgress: suggestedToday.length > 0, savedAtLabel: current && current.savedAtLabel || '', dirty: false,
      canEdit: app.canEditCurrentProject()
    });
  },

  mergeLatestProgress: function () {
    if (!this.data.canEdit) return;
    var suggestion = suggestionFromProgress();
    var todayItems = mergeItems(this.data.todayItems, suggestion.todayItems);
    var tomorrowItems = mergeItems(this.data.tomorrowItems, suggestion.tomorrowItems);
    this.setData({
      todayItems: todayItems.length ? todayItems : [''],
      tomorrowItems: tomorrowItems.length ? tomorrowItems : [''],
      linkedStages: suggestion.linkedStages || [],
      progressSummary: progressSummary(suggestion),
      generatedFromProgress: compactItems(suggestion.todayItems).length > 0,
      dirty: true
    });
    wx.showToast({ title: compactItems(suggestion.todayItems).length ? '已同步最新进度' : '前序工作均已完成', icon: 'none' });
  },

  onItemInput: function (event) {
    var section = event.currentTarget.dataset.section;
    var index = Number(event.currentTarget.dataset.index || 0);
    var field = section === 'tomorrow' ? 'tomorrowItems' : 'todayItems';
    var items = copyItems(this.data[field]);
    items[index] = event.detail.value;
    var changes = { dirty: true };
    changes[field] = items;
    this.setData(changes);
  },

  addItem: function (event) {
    var field = event.currentTarget.dataset.section === 'tomorrow' ? 'tomorrowItems' : 'todayItems';
    var items = copyItems(this.data[field]);
    items.push('');
    var changes = { dirty: true };
    changes[field] = items;
    this.setData(changes);
  },

  removeItem: function (event) {
    var field = event.currentTarget.dataset.section === 'tomorrow' ? 'tomorrowItems' : 'todayItems';
    var index = Number(event.currentTarget.dataset.index || 0);
    var items = copyItems(this.data[field]);
    items.splice(index, 1);
    if (!items.length) items.push('');
    var changes = { dirty: true };
    changes[field] = items;
    this.setData(changes);
  },

  saveDraft: function () { this.persistDraft(false); },

  persistDraft: function (silent) {
    if (this.data.saving || !this.data.canEdit) {
      if (!silent && !this.data.canEdit) wx.showToast({ title: '当前项目仅可查看', icon: 'none' });
      return;
    }
    var state = app.getV3State();
    var context = app.getFoundationContext();
    var todayItems = compactItems(this.data.todayItems);
    var tomorrowItems = compactItems(this.data.tomorrowItems);
    var now = new Date();
    var timeLabel = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var id = ['DAILY', context.project.id, context.device.id, this.data.reportDate].join('-');
    var report = {
      id: id, type: 'construction_daily', name: '施工日报', status: 'draft',
      projectId: context.project.id, projectName: context.project.name,
      deviceId: context.device.id, deviceName: context.device.name,
      date: this.data.reportDate, todayItems: todayItems, tomorrowItems: tomorrowItems,
      generationSource: 'construction_progress',
      currentStageIndex: Number((suggestionFromProgress()).currentStageIndex || 0),
      linkedStages: (this.data.linkedStages || []).map(function (item) { return Object.assign({}, item); }),
      savedAt: Date.now(), savedAtLabel: timeLabel
    };
    state.reports = state.reports || [];
    var index = state.reports.findIndex(function (item) { return item.id === id; });
    if (index >= 0) state.reports[index] = report;
    else state.reports.unshift(report);
    this.setData({ saving: true });
    app.saveV3State();
    app.syncReportToCloud(report).catch(function (error) { console.warn('施工日报云端暂存失败', error); });
    this.setData({ saving: false, dirty: false, savedAtLabel: timeLabel, todayItems: todayItems.length ? todayItems : [''], tomorrowItems: tomorrowItems.length ? tomorrowItems : [''] });
    if (!silent) wx.showToast({ title: '日报已暂存', icon: 'success' });
  },

  openFeatureGuide: function () {
    wx.navigateTo({ url: '/pages/feature-guide/feature-guide?feature=daily' });
  },

  copyReport: function () {
    var todayItems = compactItems(this.data.todayItems);
    var tomorrowItems = compactItems(this.data.tomorrowItems);
    var lines = ['今日施工：'];
    todayItems.forEach(function (item, index) { lines.push((index + 1) + '、' + item); });
    lines.push('明日计划：');
    tomorrowItems.forEach(function (item, index) { lines.push((index + 1) + '、' + item); });
    wx.setClipboardData({ data: lines.join('\n'), success: function () { wx.showToast({ title: '日报内容已复制', icon: 'success' }); } });
  }
});
