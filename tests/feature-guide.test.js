const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const guideStore = require('../utils/feature-guides.js');

function loadGuidePage(wx, pages) {
  let definition;
  const filename = path.join(root, 'pages/feature-guide/feature-guide.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; },
    getCurrentPages: () => pages || [{}],
    wx,
    require: createRequire(filename)
  });
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(value) { Object.assign(this.data, value); }
  });
}

test('all seven workbench features have complete four-step guides', () => {
  const expected = ['progress', 'smartInspection', 'qualityLedger', 'records', 'daily', 'frameAssembly', 'nanoCoating'];
  assert.deepEqual(Object.keys(guideStore.GUIDES), expected);
  expected.forEach(key => {
    const guide = guideStore.getFeatureGuide(key);
    assert.equal(guide.key, key);
    assert.ok(guide.name);
    assert.ok(guide.purpose.length >= 4);
    assert.ok(guide.introduction);
    assert.ok(guide.introduction.title);
    assert.ok(guide.introduction.description);
    assert.ok(guide.introduction.problem);
    assert.equal(guide.introduction.capabilities.length, 3);
    assert.equal(guide.steps.length, 4);
    guide.steps.forEach(step => {
      assert.ok(step.title && step.summary && step.screenshot);
      assert.equal(typeof step.image, 'string');
      assert.equal(step.details.length, 3);
      assert.ok(step.details.some(detail => detail.title === '异常处理'));
    });
  });
  assert.equal(guideStore.GUIDES.frameAssembly.live, false);
  assert.equal(guideStore.GUIDES.nanoCoating.live, false);
});

test('arrival and installation guide explains value before operation steps', () => {
  const guide = guideStore.GUIDES.progress;
  assert.match(guide.introduction.description, /总清单/);
  assert.match(guide.introduction.problem, /反复找表/);
  assert.deepEqual(guide.introduction.capabilities.map(item => item.title), [
    '到货进度管理', '部件发货预警', '安装进度管理'
  ]);
  const view = fs.readFileSync(path.join(root, 'pages/feature-guide/feature-guide.wxml'), 'utf8');
  assert.ok(view.indexOf('为什么要使用') < view.indexOf('操作步骤'));
});

test('guide page opens the requested guide and keeps only one accordion step open', () => {
  let title = '';
  const page = loadGuidePage({ setNavigationBarTitle: options => { title = options.title; } });
  page.onLoad({ feature: 'daily' });
  assert.equal(page.data.guide.name, '施工日报');
  assert.equal(page.data.activeStep, -1);
  assert.equal(title, '施工日报使用说明');
  page.toggleStep({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(page.data.activeStep, 2);
  page.toggleStep({ currentTarget: { dataset: { index: 2 } } });
  assert.equal(page.data.activeStep, -1);
});

test('live guide returns to its feature while planned guide remains read-only', () => {
  let backCount = 0;
  let toast = '';
  const page = loadGuidePage({
    setNavigationBarTitle() {},
    navigateBack() { backCount += 1; },
    showToast(options) { toast = options.title; }
  }, [{}, {}]);
  page.onLoad({ feature: 'progress' });
  page.continueFeature();
  assert.equal(backCount, 1);
  page.onLoad({ feature: 'frameAssembly' });
  page.continueFeature();
  assert.equal(backCount, 1);
  assert.equal(toast, '功能正在开发中');
});

test('each feature screen exposes a guide entry with the correct feature key', () => {
  const screens = [
    ['pages/construction-progress/construction-progress', 'progress'],
    ['pages/arrival-srm/arrival-srm', 'progress'],
    ['pages/inspect/inspect', 'smartInspection'],
    ['pages/history/history', 'qualityLedger'],
    ['pages/process-records/process-records', 'records'],
    ['pages/report-center/report-center', 'daily']
  ];
  screens.forEach(([route, feature]) => {
    const wxml = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
    const js = fs.readFileSync(path.join(root, route + '.js'), 'utf8');
    assert.match(wxml, /class="feature-guide-entry/);
    assert.match(wxml, /bindtap="openFeatureGuide"/);
    assert.ok(js.includes('/pages/feature-guide/feature-guide?feature=' + feature));
  });
  const placeholderView = fs.readFileSync(path.join(root, 'pages/feature-coming-soon/feature-coming-soon.wxml'), 'utf8');
  const placeholderJs = fs.readFileSync(path.join(root, 'pages/feature-coming-soon/feature-coming-soon.js'), 'utf8');
  assert.match(placeholderView, /guide-planned/);
  assert.match(placeholderView, /bindtap="openFeatureGuide"/);
  assert.match(placeholderJs, /feature-guide\?feature=' \+ this\.data\.featureKey/);
});

test('guide page is registered, shareable and renders detailed sections', () => {
  const route = 'pages/feature-guide/feature-guide';
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages;
  assert.ok(pages.includes(route));
  const wxml = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
  assert.match(wxml, /点击每一步查看要求、操作与异常处理/);
  assert.match(wxml, /wx:for="\{\{item\.details\}\}"/);
  assert.match(wxml, /界面位置示意/);
  assert.match(wxml, /正在开发中 · 敬请期待/);
  const page = loadGuidePage({ setNavigationBarTitle() {} });
  assert.equal(page.onShareAppMessage().path, '/pages/index/index');
});
