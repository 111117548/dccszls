var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var foundation = require('../utils/v4-foundation.js');
var domain = require('../utils/v3-data.js');
global.wx = { getStorageSync: function () { return ''; }, setStorageSync: function () {} };
var processForms = require('../utils/process-forms.js');

var root = path.resolve(__dirname, '..');
var failures = [];
var counts = { js: 0, json: 0, wxml: 0, wxss: 0 };

function checkFile(filename) {
  var ext = path.extname(filename).toLowerCase();
  var source = fs.readFileSync(filename, 'utf8');
  if (ext === '.js') {
    counts.js++;
    var result = childProcess.spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(filename + ': ' + result.stderr);
  } else if (ext === '.json') {
    counts.json++;
    try { JSON.parse(source); } catch (error) { failures.push(filename + ': ' + error.message); }
  } else if (ext === '.wxml') {
    counts.wxml++;
    var clean = source.replace(/<!--[\s\S]*?-->/g, '');
    var pattern = /<\/?([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/g;
    var stack = []; var match;
    while ((match = pattern.exec(clean))) {
      var raw = match[0]; var name = match[1];
      if (/\/>$/.test(raw)) continue;
      if (raw.indexOf('</') === 0) {
        if (stack.pop() !== name) { failures.push(filename + ': WXML tag mismatch at ' + name); break; }
      } else stack.push(name);
    }
    if (stack.length) failures.push(filename + ': unclosed WXML tag ' + stack[stack.length - 1]);
  } else if (ext === '.wxss') {
    counts.wxss++;
    var css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    if ((css.match(/{/g) || []).length !== (css.match(/}/g) || []).length) failures.push(filename + ': WXSS brace mismatch');
  }
}

function walk(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name === 'node_modules') return;
    var full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full); else checkFile(full);
  });
}

walk(root);
var state = foundation.createInitialState();
var rows = domain.flattenDeviceTree(domain.DEVICE_TREE);
var validation = {
  projectCount: state.projects.length,
  deviceCount: state.devices.length,
  stageCount: foundation.STAGES.length,
  chamberCount: rows.filter(function (item) { return item.type === 'chamber'; }).length,
  inletCount: rows.filter(function (item) { return item.type === 'inlet-horn'; }).length,
  outletCount: rows.filter(function (item) { return item.type === 'outlet-horn'; }).length,
  fieldCount: rows.filter(function (item) { return item.type === 'electric-field'; }).length,
  hopperCount: rows.filter(function (item) { return item.type === 'hopper'; }).length
};
if (validation.stageCount !== 13) failures.push('Construction stage count must be 13');
if (validation.chamberCount !== 4) failures.push('Chamber count must be 4');
if (validation.inletCount !== 4 || validation.outletCount !== 4) failures.push('Four chambers require 4 inlets and 4 outlets');
if (validation.fieldCount !== 20 || validation.hopperCount !== 20) failures.push('Four chambers require 20 fields and 20 hoppers');
if (processForms.FORMS.length !== 7) failures.push('Process inspection must keep seven independent annexes');
var annex7 = processForms.getForm('annex-7');
if (!annex7.matrix || annex7.matrix.fieldCount !== 4 || annex7.matrix.channelCount !== 30 || annex7.matrix.columns.length !== 12) {
  failures.push('Annex 7 must keep 4 fields x 30 channels x 12 checks');
}
[
  'pages/project-management/project-management',
  'pages/process-records/process-records',
  'pages/process-form/process-form',
  'pages/process-export/process-export',
  'pages/arrival-srm/arrival-srm'
].forEach(function (route) {
  if (!fs.existsSync(path.join(root, route + '.js'))) failures.push('Missing route: ' + route);
});
if (!fs.existsSync(path.join(root, 'components/construction-twin-3d/construction-twin-3d.js'))) failures.push('Missing lightweight 3D twin component');
var originalTemplatePath = path.join(root, 'cloudfunctions/generate-inspection-workbook/templates/电除尘器本体安装检查记录-原表.xlsx');
if (!fs.existsSync(originalTemplatePath)) failures.push('Missing original nine-sheet Excel export template');
else if (fs.statSync(originalTemplatePath).size < 100000) failures.push('Original Excel template appears to be a reconstructed lightweight workbook');
var appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
var utilSource = fs.readFileSync(path.join(root, 'utils/util.js'), 'utf8');
var ledgerSource = fs.readFileSync(path.join(root, 'cloudfunctions/quality-ledger/index.js'), 'utf8');
var aiCloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/ai-analyze/index.js'), 'utf8');
var excelCloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/generate-inspection-workbook/index.js'), 'utf8');
var excelFillSource = fs.readFileSync(path.join(root, 'cloudfunctions/generate-inspection-workbook/template-fill.js'), 'utf8');
var excelPageSource = fs.readFileSync(path.join(root, 'pages/process-export/process-export.js'), 'utf8');
var feishuCloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/feishu-rectification/index.js'), 'utf8');
var feishuClientSource = fs.readFileSync(path.join(root, 'utils/feishu-rectification.js'), 'utf8');
var feishuAuthSource = fs.readFileSync(path.join(root, 'cloudfunctions/feishu-auth/index.js'), 'utf8');
var feishuAccountSource = fs.readFileSync(path.join(root, 'pages/feishu-account/feishu-account.wxml'), 'utf8');
var arrivalCloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/arrival-manifest/index.js'), 'utf8');
var arrivalPageSource = fs.readFileSync(path.join(root, 'pages/arrival-srm/arrival-srm.js'), 'utf8');
var foundationSource = fs.readFileSync(path.join(root, 'utils/v4-foundation.js'), 'utf8');
var progressPageSource = fs.readFileSync(path.join(root, 'pages/construction-progress/construction-progress.js'), 'utf8');
var progressPageView = fs.readFileSync(path.join(root, 'pages/construction-progress/construction-progress.wxml'), 'utf8');
if (/cloud1-[a-z0-9]+/i.test(appSource)) failures.push('Cloud environment must not be hard-coded');
if (/apiKey\s*:/.test(appSource + utilSource)) failures.push('Client source must not store or transmit an API key');
if (aiCloudSource.indexOf("action === 'status'") < 0) failures.push('AI cloud function must expose a read-only readiness probe');
if (aiCloudSource.indexOf('ESP_AI_API_KEY') < 0) failures.push('AI key must be sourced from cloud-function environment variables');
if (excelCloudSource.indexOf("event.action === 'status'") < 0) failures.push('Excel cloud function must expose a read-only readiness probe');
if (excelCloudSource.indexOf('电除尘器本体安装检查记录-原表.xlsx') < 0) failures.push('Excel cloud function must use the original workbook template');
if (excelFillSource.indexOf("SHEET_COUNT = 9") < 0 || excelFillSource.indexOf("'封面'") < 0) failures.push('Original Excel backfill must retain all nine sheets');
if (excelPageSource.indexOf('exportLocalWorkbook') >= 0 || excelPageSource.indexOf('本地兼容') >= 0) failures.push('Excel page must not offer a reconstructed local fallback');
if (!fs.existsSync(path.join(root, 'cloudfunctions/feishu-rectification/package.json'))) failures.push('Missing Feishu rectification bridge cloud function');
if (feishuCloudSource.indexOf("action === 'pullTasks'") < 0 || feishuCloudSource.indexOf("action === 'syncClosure'") < 0) failures.push('Feishu bridge must import tasks and upload closure evidence');
if (feishuCloudSource.indexOf("action === 'listProjectOptions'") < 0) failures.push('Feishu bridge must expose the source project and furnace selector');
if (feishuCloudSource.indexOf("parent_type: 'bitable_image'") < 0 || feishuCloudSource.indexOf('drive_route_token: c.appToken') < 0) failures.push('Feishu closure photos must be uploaded as images routed to the current Bitable');
if (feishuCloudSource.indexOf("atStage('upload'") < 0 || feishuCloudSource.indexOf('verifyAttachmentWrite') < 0) failures.push('Feishu closure sync must identify the failed stage and verify the attachment write');
if (feishuCloudSource.indexOf('taskAttachmentPrefix') < 0 || feishuCloudSource.indexOf('matchedClosureImageCount') < 0) failures.push('Feishu retry verification must only accept attachments created for the current order');
if (feishuCloudSource.indexOf('1061004') < 0 || feishuCloudSource.indexOf('1254302') < 0) failures.push('Feishu permission failures must retain actionable error diagnostics');
if (feishuCloudSource.indexOf('project.feishuProjectName') < 0 || feishuCloudSource.indexOf('project.feishuDeviceName') < 0) failures.push('Feishu task matching must use the selected source project and furnace values');
if (feishuCloudSource.indexOf('namesMatch(') >= 0 || feishuCloudSource.indexOf('candidateValues(') >= 0) failures.push('Feishu task matching must not retain fuzzy-name or project-code alias matching');
if (feishuCloudSource.indexOf('FEISHU_APP_SECRET') < 0 || /FEISHU_APP_SECRET\s*[:=]\s*['\"][^'\"]+/.test(feishuCloudSource + feishuClientSource)) failures.push('Feishu secret must only be read from cloud function environment variables');
if (feishuAuthSource.indexOf('/open-apis/authen/v2/oauth/token') < 0 || feishuAuthSource.indexOf('/open-apis/authen/v1/user_info') < 0) failures.push('Feishu OAuth binding must exchange the authorization code and resolve the real user identity');
if (feishuAuthSource.indexOf('aes-256-gcm') < 0 || feishuAuthSource.indexOf('FEISHU_TOKEN_ENCRYPTION_KEY') < 0) failures.push('Feishu user tokens must be encrypted at rest');
if (feishuAuthSource.indexOf('getPhoneNumber') < 0 || feishuAuthSource.indexOf('/open-apis/contact/v3/users/batch_get_id') < 0 || feishuAuthSource.indexOf("authMode: 'phone'") < 0) failures.push('Feishu identity binding must support verified WeChat-phone matching');
if (feishuAuthSource.indexOf('mobileHash') < 0 || /mobile:\s*phone/.test(feishuAuthSource)) failures.push('Phone binding must not persist the plaintext mobile number');
if (feishuAccountSource.indexOf('open-type="getPhoneNumber"') < 0 || feishuAccountSource.indexOf('手机号无法匹配？使用飞书授权') < 0) failures.push('Account page must offer native phone binding with OAuth fallback');
if (arrivalCloudSource.indexOf("XLSX.read(buffer") < 0 || arrivalCloudSource.indexOf("action !== 'parse'") < 0) failures.push('Arrival manifest cloud function must parse uploaded XLS/XLSX workbooks');
if (arrivalPageSource.indexOf('chooseMessageFile') < 0 || arrivalPageSource.indexOf("extension: ['xls', 'xlsx']") < 0) failures.push('Arrival page must accept both legacy XLS and XLSX files');
if (arrivalPageSource.indexOf('importArrivalDemandManifest') < 0 || arrivalPageSource.indexOf('importArrivalReceiptManifest') < 0) failures.push('Arrival page must separate demand baseline and actual receipts');
if (foundationSource.indexOf('getProgressProjection') < 0 || foundationSource.indexOf("progressMode === 'forecast'") < 0) failures.push('Construction progress must keep forecast progress separate from actual progress');
if (foundationSource.indexOf('ratio-prepare:') < 0 || foundationSource.indexOf('ratio-dispatch:') < 0) failures.push('Dispatch warnings must retain separate 75% preparation and 80% dispatch levels');
if (progressPageView.indexOf('需求') < 0 || progressPageView.indexOf('到货') < 0 || progressPageView.indexOf('安装') < 0 || progressPageView.indexOf('速度推演') < 0) failures.push('Progress workbench must focus on demand, arrival, installation and forecast mode');
if (progressPageSource.indexOf('summaryOverrideEnabled') < 0 || progressPageSource.indexOf('actualProgressPercent') < 0) failures.push('Progress workbench must support aggregate correction and actual-progress recalibration');
if (fs.readFileSync(path.join(root, 'pages', 'feishu-account', 'feishu-account.js'), 'utf8').indexOf('1400001') < 0) failures.push('Phone binding must surface WeChat quota and callback diagnostics');
if (feishuCloudSource.indexOf('requireBoundIdentity') < 0 || feishuCloudSource.indexOf('requireProjectEdit') < 0) failures.push('Feishu writes must require a bound identity and project-manager match');
if (feishuCloudSource.indexOf('listRecords(readToken, c, forceRefresh, visibilityKey)') < 0 || feishuCloudSource.indexOf('userTableCacheKey(c, identity)') < 0) failures.push('Feishu project and task reads must use the bound user token with a per-user cache');
if (feishuCloudSource.indexOf("manager: ['现场经理及处长'") < 0 || feishuCloudSource.indexOf("FEISHU_FIELD_PROJECT_MANAGER || '现场经理及处长'") < 0) failures.push('Feishu project permissions must use the existing 现场经理及处长 people field');
if (feishuCloudSource.indexOf("binding.systemRole === 'platform_admin'") >= 0 || ledgerSource.indexOf("binding.systemRole === 'platform_admin'") >= 0) failures.push('Platform-admin authority must be evaluated from the live environment allowlist');
if (feishuCloudSource.indexOf('dataAccessToken(identity, c, token)') < 0 || feishuCloudSource.indexOf("identity.authMode === 'phone'") < 0 || feishuCloudSource.indexOf('uploadAttachment(writeToken') < 0 || feishuCloudSource.indexOf('updateRecord(writeToken') < 0) failures.push('Feishu closure writes must support phone-bound app tokens behind project permission checks');
if (feishuCloudSource.indexOf("trustedOrder.status !== 'closed'") < 0) failures.push('Feishu closure writes must only use a trusted, reviewed cloud order');
if (ledgerSource.indexOf("'feishu-user-bindings'") < 0 || ledgerSource.indexOf('canEditFeishuProject') < 0 || ledgerSource.indexOf('PROJECT_READ_ONLY') < 0) failures.push('Quality ledger writes must independently enforce Feishu project ownership');
if (ledgerSource.indexOf('async function loadProject(projectId, payloadProject)') >= 0 || ledgerSource.indexOf('requireProjectEdit(projectId, payload.project') >= 0) failures.push('Quality ledger must never authorize a write from the client-supplied project payload');
if (ledgerSource.indexOf('preserveProjectLinkage') < 0 || ledgerSource.indexOf('storedBootstrapProject || cleanEntity(payload.project)') < 0) failures.push('Existing Feishu-to-local project links must be immutable from client payloads');
if (ledgerSource.indexOf('countResult.total === 0') >= 0) failures.push('The first visitor must never be auto-promoted to project manager');
['reviewRectification', 'rejectRectificationReview', "status: 'review'", "status: 'closed'"].forEach(function (token) {
  if (ledgerSource.indexOf(token) < 0) failures.push('Missing rectification review capability: ' + token);
});

console.log(JSON.stringify({
  files: counts,
  foundation: validation,
  processForms: { formCount: processForms.FORMS.length, annex7Checks: annex7.matrix.fieldCount * annex7.matrix.channelCount * annex7.matrix.columns.length },
  failures: failures
}, null, 2));
if (failures.length) process.exit(1);
