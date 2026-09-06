const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const share = require('../utils/share');
const order = { id: '任务&1', projectId: '项目#1', shareToken: 'token+=&', sourceImageLocal: '', status: 'pending' };

test('every registered page declares sharing; ordinary shares use a safe homepage and bundled cover', () => {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages;
  const ignores = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')).packOptions.ignore;
  let ordinary = 0;
  pages.forEach(route => {
    const source = fs.readFileSync(path.join(root, route + '.js'), 'utf8');
    assert.equal((source.match(/onShareAppMessage\s*:/g) || []).length, 1, route);
    if (/rectification-(share|detail)/.test(route)) return;
    const match = source.match(/onShareAppMessage:\s*(function\s*\([^)]*\)\s*\{[\s\S]*?\n?\s*\})/);
    assert.ok(match, route);
    const handler = vm.runInNewContext('(' + match[1] + ')', { require: () => share });
    const result = handler.call({ data: { projectId: 'private', rectificationShareToken: 'secret', identity: { name: 'private' } } });
    assert.equal(result.path, '/pages/index/index', route);
    assert.ok(fs.existsSync(path.join(root, result.imageUrl)), route);
    const asset = result.imageUrl.replace(/^\//, '');
    assert.ok(!ignores.some(item => item.type === 'file' ? item.value === asset :
      item.type === 'folder' && asset.startsWith(item.value.replace(/\/$/, '') + '/')), 'Share cover must be included in the uploaded package');
    assert.ok(!JSON.stringify(result).includes('secret'));
    assert.ok(!JSON.stringify(result).includes('private'));
    ordinary++;
  });
  assert.equal(ordinary, pages.length - 2);
  const profile = fs.readFileSync(path.join(root, 'pages/profile/profile.wxml'), 'utf8');
  assert.doesNotMatch(profile, /分享小程序|open-type="share"/, 'profile should rely on the native top-right share entry');
});

test('task links encode identifiers and reject incomplete capabilities', () => {
  const result = share.task(order);
  const link = new URL(result.path, 'https://example.invalid');
  assert.equal(link.searchParams.get('id'), order.id);
  assert.equal(link.searchParams.get('projectId'), order.projectId);
  assert.equal(link.searchParams.get('token'), order.shareToken);
  assert.equal(link.searchParams.get('from'), 'share');
  for (const missing of ['id', 'projectId', 'shareToken']) {
    assert.equal(share.recipientPath(Object.assign({}, order, { [missing]: '' })), '');
    assert.equal(share.task(Object.assign({}, order, { [missing]: '' })).path, '/pages/index/index');
  }
});

function appHarness(ledger, options = {}) {
  let app;
  const local = Object.assign({}, order, options.order);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
    App(value) { app = value; },
    require: name => name.includes('cloud-ledger') ? ledger : {},
    wx: options.wx || {}, console
  });
  app.canEditCurrentProject = () => options.canEdit !== false;
  app.getRectificationOrder = () => local;
  app.saveV3State = () => {};
  return { app, local };
}

test('share preparation requires a direct cloud write and token-authenticated read, never an offline enqueue', async () => {
  const calls = [];
  const { app } = appHarness({
    createRectificationOrder() { throw new Error('Must not use offline queue'); },
    async ensureRectificationOrder(projectId, task) { calls.push('write'); assert.equal(task.id, order.id); },
    async getOpenRectification(projectId, id, token) {
      calls.push('read'); assert.equal(token, order.shareToken); return { order: { id, projectId } };
    }
  });
  const result = await app.prepareRectificationShare(order.id);
  assert.deepEqual(calls, ['write', 'read']);
  assert.equal(result.ready, true);
  assert.equal(result.order.shareToken, order.shareToken);
});

test('offline, denied or mismatched cloud tasks cannot become share-ready', async () => {
  const denied = appHarness({}, { canEdit: false });
  await assert.rejects(denied.app.prepareRectificationShare(order.id), /仅可查看/);
  const offline = appHarness({ async ensureRectificationOrder() { throw new Error('network down'); } });
  await assert.rejects(offline.app.prepareRectificationShare(order.id), /network down/);
  for (const remote of [null, { id: 'wrong', projectId: order.projectId }, { id: order.id, projectId: 'wrong' }]) {
    const { app } = appHarness({ async ensureRectificationOrder() {}, async getOpenRectification() { return { order: remote }; } });
    await assert.rejects(app.prepareRectificationShare(order.id), /尚未就绪/);
  }
});

test('local problem photo is uploaded before the shared task is persisted', async () => {
  const sequence = [];
  const { app } = appHarness({
    async ensureRectificationOrder(projectId, task) {
      sequence.push('write'); assert.equal(task.sourceImageFileID, 'cloud://problem');
      assert.equal(task.sourceImageLocal, undefined);
    },
    async getOpenRectification(projectId, id) { sequence.push('read'); return { order: { id, projectId } }; }
  }, { order: { sourceImageLocal: 'wxfile://local.jpg' }, wx: { cloud: { uploadFile(options) {
    sequence.push('upload'); options.success({ fileID: 'cloud://problem' });
  } } } });
  await app.prepareRectificationShare(order.id);
  assert.deepEqual(sequence, ['upload', 'write', 'read']);
});

function sharePageHarness(prepare) {
  const menu = [];
  global.wx = { showShareMenu: () => menu.push('show'), hideShareMenu: () => menu.push('hide') };
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/rectification-share/rectification-share.js'), 'utf8'), {
    Page(value) { definition = value; }, require: () => share,
    getApp: () => ({ getRectificationOrder: () => order, prepareRectificationShare: prepare }),
    wx: { navigateTo() { throw new Error('Preview must not navigate until ready'); } }
  });
  const page = Object.assign({}, definition, { data: Object.assign({}, definition.data, { orderId: order.id, order }),
    setData(values) { Object.assign(this.data, values); } });
  return { page, menu };
}

test('share page hides forwarding and preview until confirmed, and deduplicates preparation', async () => {
  let finish, calls = 0;
  const { page, menu } = sharePageHarness(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = page.prepareCloudShare();
  page.prepareCloudShare();
  assert.equal(calls, 1);
  assert.equal(page.onShareAppMessage().path, '/pages/index/index');
  page.previewRecipient();
  assert.equal(menu[0], 'hide');
  finish({ ready: true, order });
  await pending;
  assert.equal(page.data.cloudReady, true);
  assert.equal(page.onShareAppMessage().path, share.recipientPath(order));
  assert.equal(menu[menu.length - 1], 'show');
});

test('failed preparation cannot expose a task link or a broken temporary cover', async () => {
  const { page, menu } = sharePageHarness(async () => { throw new Error('connection failed'); });
  await page.prepareCloudShare();
  assert.equal(page.data.cloudReady, false);
  assert.equal(page.data.recipientPath, '');
  assert.match(page.data.cloudStatus, /connection failed/);
  assert.equal(page.onShareAppMessage().path, '/pages/index/index');
  assert.equal(menu.includes('show'), false);
});

test('leaving the sharing page prevents a late response from enabling its menu', async () => {
  let finish;
  const { page, menu } = sharePageHarness(() => new Promise(resolve => { finish = resolve; }));
  const pending = page.prepareCloudShare();
  page.onUnload();
  finish({ ready: true, order });
  await pending;
  assert.equal(page.data.cloudReady, false);
  assert.equal(menu.includes('show'), false);
});

test('detail forwards only a verified received task; local, creator and failed links fall back safely', () => {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/rectification-detail/rectification-detail.js'), 'utf8'), {
    Page(value) { definition = value; }, getApp: () => ({}),
    require: name => name.includes('/share.js') ? share : {}
  });
  const page = Object.assign({}, definition, { data: { fromShare: false, order, shareToken: order.shareToken } });
  assert.equal(page.onShareAppMessage().path, '/pages/index/index');
  page.data.fromShare = true;
  assert.equal(page.onShareAppMessage().path, '/pages/index/index');
  page._verifiedSharedOrder = order;
  assert.equal(page.onShareAppMessage().path, share.recipientPath(order));
});
