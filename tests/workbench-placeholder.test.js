const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function loadPage(route, wx) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, route + '.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => ({}), wx,
    require: () => require('../utils/share')
  });
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(value) { Object.assign(this.data, value); }
  });
}

test('workbench retains six existing tools and adds both navigable placeholders', () => {
  const navigations = [];
  const page = loadPage('pages/workbench/workbench', { navigateTo: options => navigations.push(options.url) });
  assert.equal(page.data.tools.length, 8);
  assert.deepEqual(page.data.tools.slice(0, 6).map(item => item.action),
    ['arrival', 'progress', 'smartInspection', 'qualityLedger', 'records', 'daily']);
  for (const [feature, title] of [['frameAssembly', '拼框管理'], ['nanoCoating', '纳米涂层检验']]) {
    const item = page.data.tools.find(tool => tool.action === feature);
    assert.equal(item.name, title);
    assert.equal(item.caption, '正在开发中');
    assert.ok(fs.existsSync(path.join(root, item.icon)));
    page.openTool({ currentTarget: { dataset: { action: feature } } });
    assert.equal(navigations[navigations.length - 1], '/pages/feature-coming-soon/feature-coming-soon?feature=' + feature);
  }
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
