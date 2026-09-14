const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');

function loadPage(route, wx, app = {}) {
  let definition;
  const filename = path.join(root, route + '.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page(value) { definition = value; }, getApp: () => app, wx,
    require: createRequire(filename)
  });
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(value) { Object.assign(this.data, value); }
  });
}

test('workbench merges arrival and installation while retaining other tools and placeholders', () => {
  const navigations = [];
  const page = loadPage('pages/workbench/workbench', { navigateTo: options => navigations.push(options.url) });
  assert.equal(page.data.tools.length, 7);
  assert.deepEqual(page.data.tools.slice(0, 5).map(item => item.action),
    ['progress', 'smartInspection', 'qualityLedger', 'records', 'daily']);
  assert.equal(page.data.tools[0].name, '到货与安装');
  assert.equal(page.data.tools[0].caption, '到货登记、安装进度与预警');
  assert.equal(page.data.tools.some(item => item.action === 'arrival'), false);
  for (const [feature, title] of [['frameAssembly', '拼框管理'], ['nanoCoating', '纳米涂层检验']]) {
    const item = page.data.tools.find(tool => tool.action === feature);
    assert.equal(item.name, title);
    assert.equal(item.caption, '正在开发中');
    assert.ok(fs.existsSync(path.join(root, item.icon)));
    page.openTool({ currentTarget: { dataset: { action: feature } } });
    assert.equal(navigations[navigations.length - 1], '/pages/feature-coming-soon/feature-coming-soon?feature=' + feature);
  }
});

test('the unified workbench entry follows the current construction component on every visit', () => {
  let stageIndex = 1;
  let badgeUpdates = 0;
  const navigations = [];
  const page = loadPage('pages/workbench/workbench', {
    navigateTo: options => navigations.push(options.url)
  }, {
    getFoundationContext: () => ({
      project: { name: '测试项目' }, device: { unitNo: '2#' }, stage: { index: stageIndex }
    }),
    updateTabBarReminderBadges: () => { badgeUpdates += 1; }
  });
  for (const index of [1, 5, 13]) {
    stageIndex = index;
    page.onShow();
    assert.equal(page.data.projectName, '测试项目');
    assert.equal(page.data.deviceName, '2#');
    page.openTool({ currentTarget: { dataset: { action: 'progress' } } });
    assert.equal(navigations.at(-1), '/pages/construction-progress/construction-progress?stageIndex=' + index + '&source=workbench');
  }
  assert.equal(badgeUpdates, 3);
});

test('arrival ledger remains reachable inside the unified page without removing either management form', () => {
  const route = 'pages/construction-progress/construction-progress';
  let target;
  const page = loadPage(route, { navigateTo: options => { target = options.url; } });
  page.openArrivalLedger();
  assert.equal(target, '/pages/arrival-srm/arrival-srm');
  const config = JSON.parse(fs.readFileSync(path.join(root, route + '.json'), 'utf8'));
  assert.equal(config.navigationBarTitleText, '到货与安装');
  const view = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
  assert.match(view, /bindtap="openArrivalLedger">查看总体到货台账/);
  assert.match(view, /bindtap="saveArrivalQuantity"/);
  assert.match(view, /bindtap="importArrivalFile"/);
  assert.match(view, /bindtap="saveProgressMode"/);
  const registeredPages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages;
  assert.ok(registeredPages.includes('pages/arrival-srm/arrival-srm'));
});

test('both placeholders show their own title, retain the logo, and return to the workbench', () => {
  const route = 'pages/feature-coming-soon/feature-coming-soon';
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages;
  assert.ok(pages.includes(route));
  const view = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
  assert.match(view, /正在开发中，敬请期待/);
  assert.match(view, /zijin-longking-horizontal.png/);
  for (const [feature, title] of [['frameAssembly', '拼框管理'], ['nanoCoating', '纳米涂层检验']]) {
    let navTitle, target;
    const page = loadPage(route, {
      setNavigationBarTitle: options => { navTitle = options.title; },
      switchTab: options => { target = options.url; }
    });
    page.onLoad({ feature });
    page.onReady();
    assert.equal(page.data.featureName, title);
    assert.equal(navTitle, title);
    page.backToWorkbench();
    assert.equal(target, '/pages/workbench/workbench');
    assert.equal(page.onShareAppMessage().path, '/pages/index/index');
  }
});

test('unknown feature parameters do not become arbitrary page text or routes', () => {
  const page = loadPage('pages/feature-coming-soon/feature-coming-soon', {});
  page.onLoad({ feature: 'unknown' });
  assert.equal(page.data.featureName, '功能开发中');
});
