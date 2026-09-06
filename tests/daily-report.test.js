var assert = require('assert');

function pad(value) { return value < 10 ? '0' + value : String(value); }
function dateText(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }

var today = new Date();
var yesterday = new Date(today.getTime());
yesterday.setDate(yesterday.getDate() - 1);
var state = {
  reports: [{
    id: 'previous', type: 'construction_daily', projectId: 'p1', deviceId: 'd1', date: dateText(yesterday),
    todayItems: ['昨日施工'], tomorrowItems: ['阳极振打底座安装', '阳极传力板焊接']
  }]
};
var synced = null;
var copied = '';
var app = {
  getV3State: function () { return state; },
  getFoundationContext: function () { return { project: { id: 'p1', name: '固原项目' }, device: { id: 'd1', name: '1#' } }; },
  getConstructionDailySuggestions: function () {
    return {
      currentStageIndex: 4, currentStageName: '灰斗安装',
      linkedStages: [
        { stageIndex: 1, stageName: '支座安装', installedProgress: 80 },
        { stageIndex: 4, stageName: '灰斗安装', installedProgress: 30 }
      ],
      todayItems: ['支座安装', '灰斗安装'], tomorrowItems: ['支座安装', '灰斗安装']
    };
  },
  canEditCurrentProject: function () { return true; },
  saveV3State: function () {},
  syncReportToCloud: function (report) { synced = report; return Promise.resolve(); }
};

global.getApp = function () { return app; };
global.wx = {
  showToast: function () {},
  setClipboardData: function (options) { copied = options.data; if (options.success) options.success(); }
};
var definition;
global.Page = function (value) { definition = value; };
require('../pages/report-center/report-center.js');

var page = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
page.setData = function (updates) {
  var self = this;
  Object.keys(updates).forEach(function (key) {
    var parts = key.split('.');
    var target = self.data;
    for (var i = 0; i < parts.length - 1; i++) target = target[parts[i]];
    target[parts[parts.length - 1]] = updates[key];
  });
};

page.loadDraft();
assert.strictEqual(page.data.inherited, true, 'new daily report should inherit the previous plan');
assert.deepStrictEqual(page.data.todayItems, ['阳极振打底座安装', '阳极传力板焊接', '支座安装', '灰斗安装']);
assert.strictEqual(page.data.linkedStages.length, 2, 'daily report must retain its linked progress snapshot');
page.onItemInput({ currentTarget: { dataset: { section: 'tomorrow', index: 0 } }, detail: { value: 'A列侧部平台楼梯吊装' } });
page.saveDraft();
assert.ok(synced && synced.type === 'construction_daily', 'daily report should be saved and synced as a draft');
assert.strictEqual(synced.tomorrowItems[0], 'A列侧部平台楼梯吊装');
page.copyReport();
assert.ok(copied.indexOf('今日施工：\n1、阳极振打底座安装') === 0, 'copied text must use the requested concise numbering format');
assert.ok(copied.indexOf('明日计划：\n1、A列侧部平台楼梯吊装') > 0);

console.log(JSON.stringify({ inherited: page.data.inherited, saved: synced.date, copiedLines: copied.split('\n').length }, null, 2));
