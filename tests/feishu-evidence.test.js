const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const evidence = require('../cloudfunctions/feishu-rectification/evidence');
const root = path.resolve(__dirname, '..');

test('attachment endpoints are never treated as images; signed links are preferred', () => {
  const extra = JSON.stringify({ bitablePerm: { tableId: 'tbl', attachments: {} } });
  const result = evidence.attachmentUrls([{ file_token: 'one', name: '问题.jpg',
    tmp_url: 'https://open.feishu.cn/open-apis/drive/v1/medias/batch_get_tmp_download_url?extra=' + encodeURIComponent(extra),
    url: 'https://open.feishu.cn/open-apis/drive/v1/medias/one/download' },
  { file_token: 'two', tmp_download_url: 'https://images.example.com/two.jpg' }]);
  assert.equal(result[0].url, '');
  assert.equal(result[0].extra, extra);
  assert.equal(result[1].url, 'https://images.example.com/two.jpg');
});

test('resolves every attachment in bounded batches and keeps problem/closure groups separate', async () => {
  const task = { sourceImages: evidence.attachmentUrls(Array.from({ length: 7 }, (_, i) => ({ file_token: 'p' + i }))),
    closureImages: evidence.attachmentUrls([{ file_token: 'closed' }]) };
  let calls = 0;
  const result = await evidence.resolveEvidence(task, 'test-token', async (method, endpoint, headers) => {
    calls++;
    assert.equal(method, 'GET');
    assert.equal(headers.Authorization, 'Bearer test-token');
    const tokens = new URL(endpoint, 'https://open.feishu.cn').searchParams.getAll('file_tokens');
    assert.ok(tokens.length <= 5);
    return { data: { tmp_download_urls: tokens.map(file_token => ({ file_token, tmp_download_url: 'https://images.example.com/' + file_token })) } };
  }, Date.now() + 20000);
  assert.equal(calls, 2);
  assert.equal(result.unavailable, 0);
  assert.equal(result.task.problemPhotos.length, 7);
  assert.ok(!result.task.problemPhotos.some(item => item.fileToken === 'closed'));
  assert.equal(result.task.closureImages[0].url, 'https://images.example.com/closed');
});

test('permission failure or time budget preserves text and attachment count, not stale URLs', async () => {
  for (const expired of [true, false]) {
    const task = { description: '灰斗漏焊', sourceImages: [{ fileToken: 'p', url: 'https://expired.example.com/p' }], closureImages: [] };
    let calls = 0;
    const result = await evidence.resolveEvidence(task, 'token', async () => {
      calls++; throw Object.assign(new Error('denied'), { feishuCode: 99991672 });
    }, expired ? Date.now() - 1 : Date.now() + 20000);
    assert.equal(calls, expired ? 0 : 1);
    assert.equal(result.task.description, '灰斗漏焊');
    assert.equal(result.task.sourceImages.length, 1);
    assert.equal(result.task.sourceImages[0].url, '');
    assert.equal(result.unavailable, 1);
    assert.ok(result.warning);
  }
});

function cloudHarness(stored) {
  const reads = [];
  const context = {
    exports: {}, process: { env: {} }, Buffer, URL, console: { error() {}, log() {} },
    require(name) {
      if (name === './evidence') return evidence;
      if (name === 'wx-server-sdk') return { init() {}, database() { return { collection(name) {
        assert.equal(name, 'quality-rectification-orders');
        return { doc(id) { reads.push(id); return { async get() { return { data: stored }; } }; } };
      } }; } };
      return require(name);
    },
    record: { record_id: 'trusted-record', fields: { '存在质量问题': '壳体漏焊', '项目名称': '项目甲', '炉号': '1#', '问题': [] } },
    readRecordIds: [], boundCalls: 0
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'cloudfunctions/feishu-rectification/index.js'), 'utf8') + `
    const realGetRecord = getRecord;
    tenantToken = async () => 'tenant-token';
    requireBoundIdentity = async () => { boundCalls++; return { authMode: 'oauth' }; };
    dataAccessToken = async () => 'user-token';
    resolvedSchema = async () => ({ fields: { description: '存在质量问题', sourceImages: '问题', project: '项目名称', device: '炉号' } });
    getRecord = async (token, c, id) => { readRecordIds.push(id); return record; };
  `, context);
  return { context, reads };
}

test('share evidence is scoped to the stored task and rejects invalid capabilities before Feishu access', async () => {
  const stored = { projectId: 'p', id: 'o', shareTokenHash: crypto.createHash('sha256').update('valid').digest('hex'), feishuRecordId: 'trusted-record' };
  const { context } = cloudHarness(stored);
  let result = await context.exports.main({ action: 'getTaskEvidence', projectId: 'p', orderId: 'o', shareToken: 'invalid' });
  assert.equal(result.success, false);
  assert.equal(context.readRecordIds.length, 0);
  result = await context.exports.main({ action: 'getTaskEvidence', projectId: 'p', orderId: 'o', shareToken: 'valid', recordId: 'attacker-record' });
  assert.equal(result.success, true);
  assert.equal(context.readRecordIds[0], 'trusted-record');
  assert.equal(result.task.description, '壳体漏焊');
  assert.equal(context.boundCalls, 0);
  result = await context.exports.main({ action: 'getTaskEvidence', projectId: 'wrong', orderId: 'o', shareToken: 'valid' });
  assert.equal(result.success, false);
});

test('bound evidence rejects a mismatched project or furnace', async () => {
  const { context } = cloudHarness(null);
  for (const project of [{ projectName: '其他项目', unitNo: '1#' }, { projectName: '项目甲', unitNo: '2#' }]) {
    const result = await context.exports.main({ action: 'getTaskEvidence', recordId: 'trusted-record', project });
    assert.equal(result.success, false);
  }
  const result = await context.exports.main({ action: 'getTaskEvidence', recordId: 'trusted-record', project: { projectName: '项目甲', unitNo: '1#' } });
  assert.equal(result.success, true);
  assert.equal(context.boundCalls, 3);
});

function pageHarness(response) {
  let definition;
  const requests = [];
  const local = { id: 'o', projectId: 'p', feishuRecordId: 'trusted-record', shareToken: 'valid', status: 'pending',
    items: [{ name: '钢支架 · 无匹配类别', description: '旧说明' }],
    sourceImages: [{ url: 'https://old.example.com/p' }],
    evidencePhotos: ['cloud://submitted'], feishuSnapshot: { sourceImages: [{ url: 'https://old.example.com/p2' }] } };
  const app = { getRectificationOrder: () => local, getV3State: () => ({ project: { id: 'p' } }),
    loadOpenRectification: async () => local, canEditCurrentProject: () => true,
    getFeishuProjectContext: () => ({ projectName: '项目甲', unitNo: '1#' }),
    mergeRectificationOrder: incoming => Object.assign(local, incoming),
    saveV3State() {}, _syncOpenRectificationOrder: async () => local };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/rectification-detail/rectification-detail.js'), 'utf8'), {
    getApp: () => app, Page: value => { definition = value; }, console,
    require: name => name.includes('feishu-rectification') ? { getTaskEvidence: payload => { requests.push(payload); return response(); } } : {},
    wx: { cloud: {}, showModal() {}, showToast() {} }
  });
  const page = Object.assign({}, definition, { data: Object.assign({}, definition.data, { orderId: 'o', projectId: 'p', shareToken: 'valid', fromShare: true }),
    setData(values) { Object.assign(this.data, values); } });
  return { page, requests };
}

test('shared detail refreshes full issue text and photos without changing status or discarding submitted evidence', async () => {
  const { page, requests } = pageHarness(async () => ({ task: { recordId: 'trusted-record', description: '灰斗固定阻流板加强筋与管撑漏焊\n请补焊',
    sourceImages: [{ url: 'https://new.example.com/p' }, { url: 'https://new.example.com/p2' }], closureImages: [] } }));
  await page.loadOrder();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].shareToken, 'valid');
  assert.ok(page.data.order.taskDescription.includes('\n请补焊'));
  assert.deepEqual(Array.from(page.data.order.beforePhotos), ['https://new.example.com/p', 'https://new.example.com/p2']);
  assert.equal(page.data.order.sourceAttachmentCount, 2);
  assert.equal(page.data.order.status, 'pending');
  assert.deepEqual(Array.from(page.data.order.afterPhotos), ['cloud://submitted']);
});

test('detail accepts a unique server-verified replacement record and displays its problem photos', async () => {
  const { page } = pageHarness(async () => ({
    relinkedFromRecordId: 'trusted-record',
    source: { appToken: 'app', tableId: 'table' },
    task: { recordId: 'replacement-record', description: '钢支架连接处漏焊',
      sourceImages: [{ url: 'https://new.example.com/problem.jpg' }], closureImages: [] }
  }));
  page.data.fromShare = false;
  await page.loadOrder();
  assert.equal(page.data.order.feishuRecordId, 'replacement-record');
  assert.equal(page.data.order.taskDescription, '钢支架连接处漏焊');
  assert.deepEqual(Array.from(page.data.order.beforePhotos), ['https://new.example.com/problem.jpg']);
});

test('missing record relinks only when one current Feishu row is a strong unique match', async () => {
  const { context } = cloudHarness(null);
  context.replacement = { record_id: 'replacement-record', fields: {
    '存在质量问题': '钢支架连接处漏焊', '项目名称': '项目甲', '炉号': '1#', '问题': []
  } };
  vm.runInContext(`
    getRecord = async () => { throw Object.assign(new Error('missing'), { code: 'FEISHU_RECORD_NOT_FOUND', feishuCode: 1254043 }); };
    searchProjectRecords = async () => [replacement];
  `, context);
  const result = await context.exports.main({ action: 'getTaskEvidence', recordId: 'old-record',
    project: { feishuProjectName: '项目甲', feishuDeviceName: '1#' },
    locator: { description: '钢支架连接处漏焊' } });
  assert.equal(result.success, true);
  assert.equal(result.relinkedFromRecordId, 'old-record');
  assert.equal(result.task.recordId, 'replacement-record');

  context.secondReplacement = { record_id: 'another-record', fields: Object.assign({}, context.replacement.fields) };
  vm.runInContext('searchProjectRecords = async () => [replacement, secondReplacement];', context);
  const ambiguous = await context.exports.main({ action: 'getTaskEvidence', recordId: 'old-record',
    project: { feishuProjectName: '项目甲', feishuDeviceName: '1#' },
    locator: { description: '钢支架连接处漏焊' } });
  assert.equal(ambiguous.success, false);
  assert.equal(ambiguous.code, 'FEISHU_RECORD_NOT_FOUND');
});

test('empty refreshed attachments remove stale photos; failure is visible without breaking task', async () => {
  const { page } = pageHarness(async () => ({ task: { recordId: 'trusted-record', description: '', sourceImages: [], closureImages: [] } }));
  await page.loadOrder();
  assert.equal(page.data.order.beforePhotos.length, 0);
  assert.equal(page.data.order.sourceAttachmentCount, 0);
  assert.equal(page.data.order.taskDescription, '');
  const failed = pageHarness(async () => { throw new Error('素材读取失败'); });
  await failed.page.loadOrder();
  assert.equal(failed.page.data.order.id, 'o');
  assert.equal(failed.page.data.feishuEvidenceError, '素材读取失败');
  assert.equal(failed.page.data.feishuRefreshing, false);
});

test('internal detail uses bound read access even when a local order has an unpersisted share token', async () => {
  const { page, requests } = pageHarness(async () => ({ task: { recordId: 'trusted-record', description: '问题', sourceImages: [], closureImages: [] } }));
  page.data.fromShare = false;
  await page.loadOrder();
  assert.equal(requests[0].shareToken, undefined);
  assert.equal(requests[0].recordId, 'trusted-record');
  assert.equal(requests[0].project.unitNo, '1#');
});

test('late evidence response cannot update an unloaded page', async () => {
  let finish;
  const { page } = pageHarness(() => new Promise(resolve => { finish = resolve; }));
  const loading = page.loadOrder();
  await Promise.resolve();
  page.onUnload();
  finish({ task: { recordId: 'trusted-record', description: 'late', sourceImages: [], closureImages: [] } });
  await loading;
  assert.notEqual(page.data.order.taskDescription, 'late');
});

test('missing record reports a linkage error and retains identifiers for diagnosis', async () => {
  const { context } = cloudHarness(null);
  vm.runInContext(`
    getRecord = realGetRecord;
    request = async () => { throw Object.assign(new Error('RecordIdNotFound'), {
      feishuCode: 1254043, httpStatus: 200, requestId: 'test-request'
    }); };
  `, context);
  const result = await context.exports.main({ action: 'getTaskEvidence', recordId: 'missing-record' });
  assert.equal(result.success, false);
  assert.equal(result.code, 'FEISHU_RECORD_NOT_FOUND');
  assert.equal(result.feishuCode, 1254043);
  assert.equal(result.recordId, 'missing-record');
  assert.equal(result.requestId, 'test-request');
  assert.ok(result.tableId);
  assert.match(result.error, /删除或迁移/);
  assert.equal(result.task, undefined);
});

test('a different record or empty successful response cannot supply task images', async () => {
  for (const body of [{ data: {} }, { data: { record: { record_id: 'other', fields: {} } } }]) {
    const { context } = cloudHarness(null);
    context.responseBody = body;
    vm.runInContext('getRecord = realGetRecord; request = async () => responseBody;', context);
    const result = await context.exports.main({ action: 'getTaskEvidence', recordId: 'requested' });
    assert.equal(result.success, false);
    assert.equal(result.code, 'FEISHU_RECORD_NOT_FOUND');
  }
});

test('a changed source table is rejected before reading evidence for bound and shared tasks', async () => {
  const source = { appToken: 'previous-app', tableId: 'previous-table' };
  const stored = { projectId: 'p', id: 'o', shareTokenHash: crypto.createHash('sha256').update('valid').digest('hex'),
    feishuRecordId: 'trusted-record', feishuSource: source };
  const { context } = cloudHarness(stored);
  for (const payload of [{ recordId: 'trusted-record', source }, { projectId: 'p', orderId: 'o', shareToken: 'valid' }]) {
    const result = await context.exports.main(Object.assign({ action: 'getTaskEvidence' }, payload));
    assert.equal(result.success, false);
    assert.equal(result.code, 'FEISHU_SOURCE_MISMATCH');
  }
  assert.equal(context.readRecordIds.length, 0);
});
