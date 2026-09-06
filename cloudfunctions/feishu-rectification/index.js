/*
 * Feishu Bitable bridge.  All credentials remain in cloud-function variables:
 * FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_BITABLE_APP_TOKEN, FEISHU_TABLE_ID.
 * Never put a Feishu secret in Mini Program source code.
 */
const cloud = require('wx-server-sdk');
const https = require('https');
const path = require('path');
const { attachmentUrls, resolveEvidence } = require('./evidence');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 2026-08-23: current engineering-department rectification Bitable.
// Environment variables still have priority so that production can switch tables
// without publishing Mini Program source again.
const DEFAULT_APP_TOKEN = 'UHjvbqHtrak96Usb1ItcwI8pnNe';
const DEFAULT_TABLE_ID = 'tbl8MwNtgzsHjG0A';
const API_HOST = 'open.feishu.cn';
// Keep a complete cold-start request inside CloudBase's 30-second function
// limit. Multiple 15-second HTTP retries previously guaranteed a platform
// timeout before our code could return a useful Feishu error.
const HTTP_TIMEOUT = 7000;
const RECORD_CACHE_TTL = 2 * 60 * 1000;
const CATALOG_CACHE_TTL = 5 * 60 * 1000;
const TASK_CACHE_TTL = 60 * 1000;
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const FIELD_ALIASES = {
  project: ['项目名称', '项目', '项目归属', '项目关联'],
  // Keep the existing Feishu template unchanged.  The production table uses
  // “现场经理及处长” as its project-owner people field.
  manager: ['现场经理及处长', '项目负责人', '负责人', '项目经理', '责任人'],
  projectCode: ['小程序项目编码', '项目编码', '项目代码', '小程序项目代码'],
  device: ['炉号', '机组', '机组号', '设备编号', '设备名称'],
  location: ['缺陷部位', '问题部位', '设备部位', '部位', '具体位置'],
  category: ['缺陷类型', '缺陷类别', '问题类型', '问题类别'],
  level: ['缺陷等级', '问题等级', '等级'],
  description: ['存在质量问题', '问题描述', '缺陷描述', '整改内容', '问题内容', '质量问题'],
  deadline: ['要求闭环时间', '整改期限', '闭环期限', '要求整改时间'],
  status: ['整改状态', '闭环状态', '状态'],
  sourceImages: ['问题', '问题照片', '整改前照片', '缺陷照片', '现场照片'],
  closureImages: ['闭环', '闭环照片', '整改后照片', '消缺照片'],
  closureNote: ['小程序整改说明', '整改说明', '闭环说明'],
  closureTime: ['小程序提交时间', '整改提交时间', '闭环时间']
};
let schemaCache = null;
let tokenCache = null;
// Cloud Function instances are reused. Keep short-lived snapshots in memory so
// opening a picker and then pulling tasks does not scan the same Bitable twice.
const recordCache = {};
const recordInFlight = {};
const catalogCache = {};
const catalogInFlight = {};
const taskCache = {};
const taskInFlight = {};

function tableCacheKey(c) {
  return c.appToken + '/' + c.tableId;
}

function identityCacheSegment(identity) {
  return safeId(identity && (identity.feishuOpenId || identity.feishuUserId || identity.wxOpenId) || 'bound-user');
}

function userTableCacheKey(c, identity) {
  return tableCacheKey(c) + '|user:' + identityCacheSegment(identity);
}

function fresh(cache, key, ttl) {
  const item = cache[key];
  return item && Date.now() - item.at < ttl ? item.value : null;
}

function clearTableCaches(c) {
  const prefix = tableCacheKey(c);
  [recordCache, recordInFlight, catalogCache, catalogInFlight, taskCache, taskInFlight].forEach(cache => {
    Object.keys(cache).forEach(key => {
      if (key === prefix || key.indexOf(prefix + '|') === 0) delete cache[key];
    });
  });
}

function config() {
  return {
    appId: String(process.env.FEISHU_APP_ID || ''),
    appSecret: String(process.env.FEISHU_APP_SECRET || ''),
    encryptionKey: String(process.env.FEISHU_TOKEN_ENCRYPTION_KEY || process.env.FEISHU_APP_SECRET || ''),
    appToken: String(process.env.FEISHU_BITABLE_APP_TOKEN || DEFAULT_APP_TOKEN),
    tableId: String(process.env.FEISHU_TABLE_ID || DEFAULT_TABLE_ID),
    fields: {
      project: String(process.env.FEISHU_FIELD_PROJECT || '项目名称'),
      manager: String(process.env.FEISHU_FIELD_PROJECT_MANAGER || '现场经理及处长'),
      projectCode: String(process.env.FEISHU_FIELD_PROJECT_CODE || '小程序项目编码'),
      device: String(process.env.FEISHU_FIELD_DEVICE || '炉号'),
      location: String(process.env.FEISHU_FIELD_LOCATION || '缺陷部位'),
      category: String(process.env.FEISHU_FIELD_CATEGORY || '缺陷类型'),
      level: String(process.env.FEISHU_FIELD_LEVEL || '缺陷等级'),
      description: String(process.env.FEISHU_FIELD_DESCRIPTION || '存在质量问题'),
      deadline: String(process.env.FEISHU_FIELD_DEADLINE || '要求闭环时间'),
      status: String(process.env.FEISHU_FIELD_STATUS || '整改状态'),
      sourceImages: String(process.env.FEISHU_FIELD_SOURCE_IMAGES || '问题'),
      closureImages: String(process.env.FEISHU_FIELD_CLOSURE_IMAGES || '闭环'),
      // Optional: leave them unset until these columns have been added to the existing Bitable.
      closureNote: String(process.env.FEISHU_FIELD_CLOSURE_NOTE || ''),
      closureTime: String(process.env.FEISHU_FIELD_CLOSURE_TIME || '')
    }
  };
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
}

function tokenEncryptionKey(c) {
  if (!c.encryptionKey) throw new Error('缺少 FEISHU_TOKEN_ENCRYPTION_KEY');
  return require('crypto').createHash('sha256').update(c.encryptionKey).digest();
}

function reauthRequiredError() {
  const error = new Error('飞书授权凭证无法解密。请确认 feishu-auth 与 feishu-rectification 使用完全相同的 FEISHU_TOKEN_ENCRYPTION_KEY，然后重新绑定飞书账号');
  error.code = 'FEISHU_REAUTH_REQUIRED';
  return error;
}

function decryptToken(value, c) {
  if (!value) return '';
  try {
    const parts = String(value).split('.');
    if (parts.length !== 3) throw new Error('invalid encrypted token');
    const decipher = require('crypto').createDecipheriv('aes-256-gcm', tokenEncryptionKey(c), Buffer.from(parts[0], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (/缺少 FEISHU_TOKEN_ENCRYPTION_KEY/.test(String(error && error.message || ''))) throw error;
    throw reauthRequiredError();
  }
}

function encryptToken(value, c) {
  if (!value) return '';
  const crypto = require('crypto');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenEncryptionKey(c), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

function platformAdminIds() {
  return String(process.env.FEISHU_PLATFORM_ADMIN_IDS || '').split(',').map(item => item.trim()).filter(Boolean);
}

async function requireBoundIdentity() {
  const wxOpenId = String(cloud.getWXContext().OPENID || '');
  let binding = null;
  try { binding = (await db.collection('feishu-user-bindings').doc(safeId(wxOpenId)).get()).data; } catch (error) {}
  if (!binding || !binding.enabled) {
    const error = new Error('请先绑定飞书账号');
    error.code = 'FEISHU_ACCOUNT_NOT_BOUND';
    throw error;
  }
  const identifiers = [binding.feishuOpenId, binding.feishuUserId, binding.feishuUnionId, binding.email]
    .filter(Boolean).map(value => String(value).trim());
  const admin = platformAdminIds().some(id => identifiers.indexOf(id) >= 0);
  return Object.assign({}, binding, { identifiers, isPlatformAdmin: admin });
}

async function userAccessToken(identity, c) {
  if (Number(identity.accessTokenExpiresAt || 0) > Date.now() + 60000) {
    return decryptToken(identity.accessTokenEncrypted, c);
  }
  const refreshToken = decryptToken(identity.refreshTokenEncrypted, c);
  if (!refreshToken) {
    const error = new Error('飞书授权已过期，请重新绑定飞书账号');
    error.code = 'FEISHU_REAUTH_REQUIRED';
    throw error;
  }
  const result = await request('POST', '/open-apis/authen/v2/oauth/token', {}, {
    grant_type: 'refresh_token',
    client_id: c.appId,
    client_secret: c.appSecret,
    refresh_token: refreshToken
  });
  const token = result.data || result;
  if (!token.access_token) throw new Error('刷新飞书用户凭证失败，请重新绑定账号');
  const now = Date.now();
  const update = {
    accessTokenEncrypted: encryptToken(token.access_token, c),
    accessTokenExpiresAt: now + Number(token.expires_in || 7200) * 1000,
    tokenRefreshedAt: db.serverDate()
  };
  if (token.refresh_token) {
    update.refreshTokenEncrypted = encryptToken(token.refresh_token, c);
    update.refreshTokenExpiresAt = now + Number(token.refresh_token_expires_in || 2592000) * 1000;
  }
  await db.collection('feishu-user-bindings').doc(safeId(identity.wxOpenId)).update({ data: update });
  return token.access_token;
}

async function dataAccessToken(identity, c, applicationToken) {
  // Phone binding proves the WeChat-to-Feishu employee mapping but does not
  // mint a Feishu user_access_token. In that mode the app token performs the
  // I/O only after projectPermission/requireProjectEdit has checked the bound
  // employee's Feishu identifiers against the trusted people field.
  if (identity && identity.authMode === 'phone') return applicationToken;
  return userAccessToken(identity, c);
}

function people(value) {
  const items = Array.isArray(value) ? value : (value ? [value] : []);
  const identifiers = [];
  const names = [];
  items.forEach(item => {
    if (typeof item === 'string') {
      if (item.trim()) { identifiers.push(item.trim()); names.push(item.trim()); }
      return;
    }
    if (!item || typeof item !== 'object') return;
    [item.id, item.open_id, item.openId, item.user_id, item.userId, item.union_id, item.unionId, item.email]
      .filter(Boolean).forEach(id => identifiers.push(String(id).trim()));
    const name = String(item.name || item.en_name || item.display_name || '').trim();
    if (name) names.push(name);
  });
  return { identifiers: Array.from(new Set(identifiers)), names: Array.from(new Set(names)) };
}

function identityMatches(identity, managerInfo) {
  if (identity && identity.isPlatformAdmin) return true;
  const allowed = (managerInfo && managerInfo.identifiers) || [];
  return (identity.identifiers || []).some(id => allowed.indexOf(id) >= 0);
}

function projectPermission(records, projectName, fieldMap, identity) {
  if (identity.isPlatformAdmin) return { canEdit: true, managerNames: [], managerIds: [], reason: 'platform_admin' };
  if (!fieldMap.manager) return { canEdit: false, managerNames: [], managerIds: [], reason: 'manager_field_missing' };
  const managerIds = [];
  const managerNames = [];
  (records || []).forEach(record => {
    const fields = record.fields || {};
    if (text(fields[fieldMap.project]).trim() !== String(projectName || '').trim()) return;
    const info = people(fields[fieldMap.manager]);
    info.identifiers.forEach(id => { if (managerIds.indexOf(id) < 0) managerIds.push(id); });
    info.names.forEach(name => { if (managerNames.indexOf(name) < 0) managerNames.push(name); });
  });
  return {
    canEdit: identityMatches(identity, { identifiers: managerIds }),
    managerNames,
    managerIds,
    reason: managerIds.length ? 'project_manager_field' : 'manager_not_configured'
  };
}

function requireProjectEdit(records, projectName, fieldMap, identity) {
  const permission = projectPermission(records, projectName, fieldMap, identity);
  if (!permission.canEdit) {
    const suffix = permission.reason === 'manager_field_missing'
      ? '飞书表未识别到“现场经理及处长”人员字段'
      : '当前飞书账号不是该项目负责人';
    const error = new Error('您可以查看该项目，但不能编辑：' + suffix);
    error.code = 'PROJECT_READ_ONLY';
    throw error;
  }
  return permission;
}

function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('、');
  if (typeof value === 'object') return String(value.text || value.name || value.value || value.record_id || '');
  return '';
}

function timestampText(value) {
  if (!value) return '';
  const n = Number(value);
  if (Number.isFinite(n) && n > 100000000000) return new Date(n).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  return text(value);
}

function feishuRequestId(headers) {
  headers = headers || {};
  return String(headers['x-tt-logid'] || headers['x-request-id'] || headers['x-lark-request-id'] || '');
}

function makeFeishuError(res, data, requestPath) {
  const message = String((data && (data.msg || data.message)) || '飞书接口请求失败');
  const error = new Error(message + '（HTTP ' + res.statusCode + (data && data.code !== undefined ? ' / ' + data.code : '') + '）');
  error.httpStatus = Number(res.statusCode || 0);
  error.feishuCode = data && data.code !== undefined ? Number(data.code) : 0;
  error.feishuMessage = message;
  error.requestId = feishuRequestId(res.headers);
  error.requestPath = requestPath;
  return error;
}

function wrapStageError(stage, label, error) {
  const status = Number(error && error.httpStatus || 0);
  const code = Number(error && error.feishuCode || 0);
  let guidance = '';
  if (stage === 'upload' && (status === 403 || code === 1061004 || code === 1061073)) {
    guidance = '请在飞书中把当前自建应用添加为该多维表格的“文档应用”，授予可编辑/可管理权限；同时确认应用已开通并发布 bitable:app 或 docs:document.media:upload 权限。若表格开启高级权限，还需把应用加入具有读写权限的角色或群组。';
  } else if (stage === 'update' && (status === 403 || code === 1254302 || code === 1254304)) {
    guidance = '请确认当前飞书应用对该多维表格拥有编辑记录权限（base:record:update 或 bitable:app），并在高级权限中具有可编辑/可管理权限。';
  } else if (stage === 'update' && code === 1254027) {
    guidance = '飞书拒绝挂载附件，请确认图片先上传到当前这一个多维表格，且“闭环”列是附件字段。';
  }
  const detail = error && (error.feishuMessage || error.message) || '未知错误';
  const codeText = [status ? 'HTTP ' + status : '', code ? '飞书错误码 ' + code : ''].filter(Boolean).join(' / ');
  const wrapped = new Error(label + '失败：' + detail + (codeText ? '（' + codeText + '）' : '') + (guidance ? '。' + guidance : ''));
  wrapped.stage = stage;
  wrapped.httpStatus = status;
  wrapped.feishuCode = code;
  wrapped.requestId = String(error && error.requestId || '');
  wrapped.cause = error;
  return wrapped;
}

async function atStage(stage, label, operation) {
  try {
    return await operation();
  } catch (error) {
    throw wrapStageError(stage, label, error);
  }
}

function request(method, requestPath, headers, body, requestOptions) {
  return new Promise((resolve, reject) => {
    requestOptions = requestOptions || {};
    let payload = body || null;
    if (payload && typeof payload === 'object' && !Buffer.isBuffer(payload)) {
      payload = JSON.stringify(payload);
      headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {});
    }
    const options = {
      hostname: API_HOST, port: 443, path: requestPath, method,
      headers: Object.assign({ Connection: 'keep-alive' }, headers || {}),
      agent: httpsAgent
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(options, res => {
      const buffers = [];
      res.on('data', chunk => buffers.push(Buffer.from(chunk)));
      res.on('end', () => {
        const raw = Buffer.concat(buffers).toString('utf8');
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (error) { return reject(new Error('飞书返回了无法解析的数据：' + raw.slice(0, 160))); }
        if (res.statusCode < 200 || res.statusCode >= 300 || (data.code !== undefined && data.code !== 0)) {
          return reject(makeFeishuError(res, data, requestPath));
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(Number(requestOptions.timeoutMs || HTTP_TIMEOUT), () => {
      const error = new Error('飞书接口请求超时，请稍后重试');
      error.code = 'FEISHU_HTTP_TIMEOUT';
      error.requestPath = requestPath;
      req.destroy(error);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function transientReadError(error) {
  const status = Number(error && error.httpStatus || 0);
  const code = String(error && error.code || '');
  const message = String(error && error.message || '');
  return status === 429 || status >= 500 ||
    code === 'FEISHU_HTTP_TIMEOUT' ||
    /ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|接口请求超时/i.test(message);
}

async function requestReadWithRetry(requestPath, headers, options) {
  options = options || {};
  const method = String(options.method || 'GET').toUpperCase();
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 2));
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await request(method, requestPath, headers, options.body || null, { timeoutMs: Number(options.timeoutMs || 8000) });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !transientReadError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

async function searchProjectRecords(token, c, project, fieldMap) {
  const projectName = String(project.feishuProjectName || '').trim();
  const deviceName = String(project.feishuDeviceName || '').trim();
  const fieldNames = [
    fieldMap.project,
    fieldMap.manager,
    fieldMap.projectCode,
    fieldMap.device,
    fieldMap.location,
    fieldMap.category,
    fieldMap.level,
    fieldMap.description,
    fieldMap.deadline,
    fieldMap.status,
    fieldMap.sourceImages,
    fieldMap.closureImages,
    fieldMap.closureNote,
    fieldMap.closureTime
  ].filter((name, index, all) => name && all.indexOf(name) === index);
  const conditions = [
    { field_name: fieldMap.project, operator: 'is', value: [projectName] },
    { field_name: fieldMap.device, operator: 'is', value: [deviceName] }
  ];
  let pageToken = '';
  const all = [];
  const seenPageTokens = {};
  do {
    const params = ['page_size=200'];
    if (pageToken) params.push('page_token=' + encodeURIComponent(pageToken));
    const requestPath = '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records/search?' + params.join('&');
    const result = await requestReadWithRetry(requestPath, {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json; charset=utf-8'
    }, {
      method: 'POST',
      body: { field_names: fieldNames, filter: { conjunction: 'and', conditions } },
      timeoutMs: 7000,
      maxAttempts: 1
    });
    const data = result.data || {};
    all.push.apply(all, data.items || []);
    const nextPageToken = data.has_more ? String(data.page_token || '') : '';
    if (nextPageToken && seenPageTokens[nextPageToken]) throw new Error('飞书分页游标重复，已停止读取以避免重复数据');
    if (nextPageToken) seenPageTokens[nextPageToken] = true;
    pageToken = nextPageToken;
  } while (pageToken);
  return all;
}

async function searchProjectPermissionRecords(token, c, projectName, fieldMap) {
  const requestPath = '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records/search?page_size=100';
  const result = await requestReadWithRetry(requestPath, {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json; charset=utf-8'
  }, {
    method: 'POST',
    body: {
      field_names: [fieldMap.project, fieldMap.manager].filter(Boolean),
      filter: {
        conjunction: 'and',
        conditions: [{ field_name: fieldMap.project, operator: 'is', value: [String(projectName || '').trim()] }]
      }
    },
    timeoutMs: 6000,
    maxAttempts: 1
  });
  return (result.data && result.data.items) || [];
}

async function tenantToken(c) {
  if (!c.appId || !c.appSecret) throw new Error('尚未配置飞书凭证：请在 feishu-rectification 云函数环境变量填写 FEISHU_APP_ID 与 FEISHU_APP_SECRET');
  if (tokenCache && tokenCache.token && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const response = await request('POST', '/open-apis/auth/v3/tenant_access_token/internal', { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ app_id: c.appId, app_secret: c.appSecret }), { timeoutMs: 6000 });
  if (!response.tenant_access_token) throw new Error('未获取到飞书 tenant_access_token');
  const validSeconds = Math.max(60, Number(response.expire || 7200) - 300);
  tokenCache = { token: response.tenant_access_token, expiresAt: Date.now() + validSeconds * 1000 };
  return tokenCache.token;
}

async function listAdvancedPermissionRoles(token, c) {
  let pageToken = ''; const roles = [];
  do {
    const suffix = '?page_size=100' + (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
    const result = await request('GET', '/open-apis/base/v2/apps/' + encodeURIComponent(c.appToken) + '/roles' + suffix, { Authorization: 'Bearer ' + token });
    const data = result.data || {};
    roles.push.apply(roles, data.items || []);
    pageToken = data.has_more ? String(data.page_token || '') : '';
  } while (pageToken && roles.length < 300);
  return roles;
}

async function listAdvancedPermissionMembers(token, c, roleId) {
  let pageToken = ''; const members = [];
  do {
    const suffix = '?page_size=100' + (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
    const result = await request('GET', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/roles/' + encodeURIComponent(roleId) + '/members' + suffix, { Authorization: 'Bearer ' + token });
    const data = result.data || {};
    members.push.apply(members, data.items || []);
    pageToken = data.has_more ? String(data.page_token || '') : '';
  } while (pageToken && members.length < 1000);
  return members;
}

function permissionRoleDiagnostic(role, c, members) {
  const tableRoles = (role.table_roles || []).filter(item => String(item.table_id || '') === String(c.tableId));
  return {
    roleId: String(role.role_id || ''),
    roleName: String(role.role_name || ''),
    tableRoles: tableRoles.map(item => ({
      tableId: String(item.table_id || ''),
      tableName: String(item.table_name || ''),
      tablePerm: Number(item.table_perm || 0),
      recordRule: item.rec_rule || null,
      fieldPerm: item.field_perm || null
    })),
    members: (members || []).map(item => ({
      name: String(item.member_name || item.member_en_name || ''),
      type: String(item.member_type || ''),
      openIdSuffix: String(item.open_id || '').slice(-8),
      userIdSuffix: String(item.user_id || '').slice(-8),
      departmentIdSuffix: String(item.department_id || item.open_department_id || '').slice(-8),
      chatIdSuffix: String(item.chat_id || '').slice(-8)
    }))
  };
}

async function inspectAdvancedPermission(token, c) {
  const result = { success: true, advancedPermissionReadable: false, roles: [] };
  try {
    const roles = await listAdvancedPermissionRoles(token, c);
    const diagnostics = [];
    for (const role of roles) {
      let members = [];
      try { members = await listAdvancedPermissionMembers(token, c, role.role_id); } catch (memberError) {
        members = [{ member_name: '协作者读取失败：' + (memberError.feishuMessage || memberError.message || '未知错误'), member_type: 'diagnostic_error' }];
      }
      diagnostics.push(permissionRoleDiagnostic(role, c, members));
    }
    result.advancedPermissionReadable = true;
    result.roles = diagnostics;
    return result;
  } catch (error) {
    result.success = false;
    result.error = error.feishuMessage || error.message || '无法读取飞书高级权限';
    result.httpStatus = Number(error.httpStatus || 0);
    result.feishuCode = Number(error.feishuCode || 0);
    return result;
  }
}

async function listRecords(token, c, forceRefresh, visibilityKey, options) {
  options = options || {};
  // OAuth bindings can expose a per-user record set. Phone bindings use the
  // application record set and are still partitioned by bound identity so
  // permission-decorated results never leak across users.
  const cacheScope = String(options.cacheScope || 'full');
  const key = (visibilityKey || tableCacheKey(c)) + '|records:' + cacheScope;
  const cached = !forceRefresh && fresh(recordCache, key, RECORD_CACHE_TTL);
  if (cached) return { records: cached, fromCache: true };
  if (recordInFlight[key]) return recordInFlight[key];
  recordInFlight[key] = (async () => {
    let pageToken = ''; const all = []; const seenPageTokens = {};
    do {
      const params = ['page_size=' + Math.max(20, Math.min(500, Number(options.pageSize || 500)))];
      if (pageToken) params.push('page_token=' + encodeURIComponent(pageToken));
      const fieldNames = (options.fieldNames || []).filter(Boolean);
      if (fieldNames.length) params.push('field_names=' + encodeURIComponent(JSON.stringify(fieldNames)));
      const requestPath = '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records?' + params.join('&');
      const result = options.retryTransient
        ? await requestReadWithRetry(requestPath, { Authorization: 'Bearer ' + token }, { timeoutMs: options.timeoutMs, maxAttempts: Number(options.maxAttempts || 1) })
        : await request('GET', requestPath, { Authorization: 'Bearer ' + token });
      const data = result.data || {};
      all.push.apply(all, data.items || []);
      const nextPageToken = data.has_more ? String(data.page_token || '') : '';
      if (nextPageToken && seenPageTokens[nextPageToken]) throw new Error('飞书分页游标重复，已停止读取以避免重复数据');
      if (nextPageToken) seenPageTokens[nextPageToken] = true;
      pageToken = nextPageToken;
    } while (pageToken);
    recordCache[key] = { at: Date.now(), value: all };
    return { records: all, fromCache: false };
  })();
  try {
    return await recordInFlight[key];
  } finally {
    delete recordInFlight[key];
  }
}

async function listFields(token, c) {
  let pageToken = ''; const all = [];
  do {
    const suffix = '?page_size=500' + (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
    const requestPath = '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/fields' + suffix;
    const result = await requestReadWithRetry(requestPath, { Authorization: 'Bearer ' + token }, { timeoutMs: 6000, maxAttempts: 1 });
    const data = result.data || {};
    all.push.apply(all, data.items || []);
    pageToken = data.has_more ? data.page_token : '';
  } while (pageToken && all.length < 300);
  return all;
}

function fieldDisplayName(item) {
  return String((item && (item.field_name || item.name)) || '').trim();
}

function resolveFieldMap(schemaItems, configured) {
  const names = (schemaItems || []).map(fieldDisplayName).filter(Boolean);
  const nameSet = {};
  names.forEach(name => { nameSet[name] = true; });
  const resolved = {};
  Object.keys(FIELD_ALIASES).forEach(key => {
    const preferred = String((configured && configured[key]) || '').trim();
    const candidates = [preferred].concat(FIELD_ALIASES[key] || []).filter(Boolean);
    resolved[key] = candidates.find(name => nameSet[name]) || '';
  });
  return { fields: resolved, availableFields: names };
}

async function resolvedSchema(token, c) {
  const key = c.appToken + '/' + c.tableId;
  if (schemaCache && schemaCache.key === key && Date.now() - schemaCache.at < 5 * 60 * 1000) return schemaCache.value;
  const items = await listFields(token, c);
  const value = resolveFieldMap(items, c.fields);
  schemaCache = { key, at: Date.now(), value };
  return value;
}

function mapStatus(value) {
  const raw = text(value);
  if (/已整改|已闭环|已完成|关闭/.test(raw)) return { code: 'closed', name: raw || '已闭环' };
  if (/待复验|待验收|待确认/.test(raw)) return { code: 'review', name: raw || '待复验' };
  if (/整改中|处理中/.test(raw)) return { code: 'rectifying', name: raw || '整改中' };
  return { code: 'pending', name: raw || '待整改' };
}

function recordMatchResult(record, project, fieldMap) {
  const fields = record.fields || {};
  const name = fieldMap.project ? text(fields[fieldMap.project]).trim() : '';
  const targetName = String(project.feishuProjectName || project.projectName || '').trim();
  if (!targetName) return { matched: false, reason: 'bindingProject' };
  // The project selector is populated by this same Bitable.  Compare the selected
  // source values exactly; project-code aliases and fuzzy matching are intentionally disabled.
  if (!name || name !== targetName) return { matched: false, reason: 'projectName' };
  const device = fieldMap.device ? text(fields[fieldMap.device]).trim() : '';
  const targetDevice = String(project.feishuDeviceName || project.unitNo || '').trim();
  if (!targetDevice) return { matched: false, reason: 'bindingDevice' };
  if (!device || device !== targetDevice) return { matched: false, reason: 'device' };
  return { matched: true, reason: 'projectAndDevice' };
}

function buildProjectOptions(records, fieldMap) {
  const projects = {};
  (records || []).forEach(record => {
    const fields = record.fields || {};
    const projectName = fieldMap.project ? text(fields[fieldMap.project]).trim() : '';
    if (!projectName) return;
    const projectKey = projectName;
    if (!projects[projectKey]) {
      projects[projectKey] = { name: projectName, taskCount: 0, recordCount: 0, devices: {}, managerIds: [], managerNames: [] };
    }
    const project = projects[projectKey];
    project.recordCount++;
    if (fieldMap.manager) {
      const managerInfo = people(fields[fieldMap.manager]);
      managerInfo.identifiers.forEach(id => { if (project.managerIds.indexOf(id) < 0) project.managerIds.push(id); });
      managerInfo.names.forEach(name => { if (project.managerNames.indexOf(name) < 0) project.managerNames.push(name); });
    }
    // Project/device catalogs do not need to map every attachment and status.
    // Avoiding mapRecord here is significant on tables containing many photos.
    const hasTaskContent = recordHasTaskContent(record, fieldMap);
    if (hasTaskContent) project.taskCount++;
    const deviceName = fieldMap.device ? text(fields[fieldMap.device]).trim() : '';
    const deviceKey = deviceName;
    if (!deviceName) return;
    if (!project.devices[deviceKey]) {
      project.devices[deviceKey] = { name: deviceName, taskCount: 0, recordCount: 0 };
    }
    project.devices[deviceKey].recordCount++;
    if (hasTaskContent) project.devices[deviceKey].taskCount++;
  });
  return Object.keys(projects).map(projectKey => {
    const project = projects[projectKey];
    const devices = Object.keys(project.devices).map(deviceKey => project.devices[deviceKey]);
    devices.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    return {
      name: project.name,
      taskCount: project.taskCount,
      recordCount: project.recordCount,
      deviceCount: devices.length,
      managerIds: project.managerIds,
      managerNames: project.managerNames,
      devices
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
}

function recordHasTaskContent(record, fieldMap) {
  const fields = (record && record.fields) || {};
  const value = key => fieldMap[key] ? fields[fieldMap[key]] : '';
  const photos = value('sourceImages');
  return !!(
    text(value('description')).trim() ||
    text(value('location')).trim() ||
    text(value('category')).trim() ||
    (Array.isArray(photos) && photos.length)
  );
}

function mapRecord(record, fieldMap) {
  const f = record.fields || {};
  const value = key => fieldMap[key] ? f[fieldMap[key]] : '';
  const state = mapStatus(value('status'));
  const description = text(value('description'));
  const location = text(value('location'));
  const category = text(value('category'));
  const sourceImages = attachmentUrls(value('sourceImages'));
  return {
    recordId: record.record_id,
    title: description || [location, category].filter(Boolean).join(' · ') || '飞书下发整改任务',
    projectName: text(value('project')), projectCode: text(value('projectCode')), deviceName: text(value('device')),
    location, category, level: text(value('level')), description, qualityIssue: description,
    deadline: timestampText(value('deadline')), feishuStatus: state.code, feishuStatusName: state.name,
    sourceImages, problemPhotos: sourceImages, closureImages: attachmentUrls(value('closureImages')),
    closureNote: text(value('closureNote')), closureTime: timestampText(value('closureTime')),
    hasTaskContent: !!(description || location || category || sourceImages.length)
  };
}

function multipartBody(fields, file) {
  const boundary = '----ESPFeishu' + Date.now().toString(16);
  const parts = [];
  Object.keys(fields).forEach(key => {
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"\r\n\r\n' + String(fields[key]) + '\r\n'));
  });
  parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + String(file.name).replace(/["\\]/g, '_') + '"\r\nContent-Type: ' + String(file.contentType || 'application/octet-stream') + '\r\n\r\n'));
  parts.push(file.content);
  parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
  return { boundary, body: Buffer.concat(parts) };
}

function imageContentType(extension) {
  const value = String(extension || '').toLowerCase();
  if (value === '.png') return 'image/png';
  if (value === '.gif') return 'image/gif';
  if (value === '.webp') return 'image/webp';
  if (value === '.heic' || value === '.heif') return 'image/heic';
  return 'image/jpeg';
}

function safeFilenamePart(value) {
  return String(value || 'task').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || 'task';
}

function taskAttachmentPrefix(orderId) {
  return 'ESP整改闭环-' + safeFilenamePart(orderId) + '-';
}

async function uploadAttachment(token, c, fileId, index, orderId) {
  const downloaded = await cloud.downloadFile({ fileID: fileId });
  const extension = (path.extname(String(fileId).split('?')[0]) || '.jpg').toLowerCase();
  const filename = taskAttachmentPrefix(orderId) + (index + 1) + extension;
  const multipart = multipartBody({
    file_name: filename,
    parent_type: 'bitable_image',
    parent_node: c.appToken,
    size: downloaded.fileContent.length,
    extra: JSON.stringify({ drive_route_token: c.appToken })
  }, { name: filename, content: downloaded.fileContent, contentType: imageContentType(extension) });
  const result = await request('POST', '/open-apis/drive/v1/medias/upload_all', { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + multipart.boundary }, multipart.body);
  const fileToken = result.data && result.data.file_token;
  if (!fileToken) throw new Error('飞书附件上传未返回 file_token');
  return { file_token: fileToken };
}

async function updateRecord(token, c, recordId, fields) {
  return request('PUT', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records/' + encodeURIComponent(recordId), { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ fields }));
}

async function getRecord(token, c, recordId) {
  try {
    const result = await request('GET', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records/' + encodeURIComponent(recordId), { Authorization: 'Bearer ' + token });
    const record = result.data && result.data.record;
    if (!record || record.record_id !== recordId) {
      throw Object.assign(new Error('飞书未返回指定记录'), { feishuCode: 1254043 });
    }
    return record;
  } catch (error) {
    if (Number(error.feishuCode) === 1254043) {
      error.code = 'FEISHU_RECORD_NOT_FOUND';
      error.message = '当前飞书数据表中找不到这条质量问题，暂时无法读取说明和图片。请项目负责人核对原记录是否删除或迁移，并核对同步的数据表；确认后从质量检查台账重新同步任务。';
      error.recordId = recordId;
      error.tableId = c.tableId;
    }
    throw error;
  }
}

function assertEvidenceSource(source, c) {
  if (!source) return; // Older tasks have no provenance; keep their exact-ID lookup.
  if (source.appToken !== c.appToken || source.tableId !== c.tableId) {
    throw Object.assign(new Error('这条任务的来源数据表与当前飞书配置不一致，请项目负责人核对数据表配置并重新同步任务。'), { code: 'FEISHU_SOURCE_MISMATCH' });
  }
}

function attachmentTokens(record, fieldName) {
  const values = record && record.fields && record.fields[fieldName];
  if (!Array.isArray(values)) return [];
  return values.map(item => String(item && (item.file_token || item.fileToken) || '')).filter(Boolean);
}

async function verifyAttachmentWrite(token, c, recordId, fieldName, expectedTokens) {
  const expected = (expectedTokens || []).map(String).filter(Boolean);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 500));
    const record = await getRecord(token, c, recordId);
    const actual = attachmentTokens(record, fieldName);
    if (expected.every(item => actual.indexOf(item) >= 0)) return actual;
  }
  throw new Error('飞书更新接口已返回成功，但再次读取记录时未找到本次上传的附件，请稍后重试核验');
}

const API_VERSION = 'feishu-user-visible-projects-v14-evidence-source';

function taskCacheKey(c, project) {
  return [
    tableCacheKey(c),
    String(project.feishuProjectName || '').trim(),
    String(project.feishuDeviceName || '').trim()
  ].join('|');
}

function withTiming(value, startedAt, fromCache) {
  return Object.assign({}, value, {
    fromCache: !!fromCache,
    durationMs: Math.max(0, Date.now() - startedAt)
  });
}

function decorateCatalog(value, identity) {
  const output = Object.assign({}, value || {});
  output.identity = {
    name: identity.name || '',
    role: identity.isPlatformAdmin ? 'platform_admin' : 'project_manager',
    roleName: identity.isPlatformAdmin ? '平台管理员' : '项目经理'
  };
  output.projects = (output.projects || []).map(project => {
    const managerIds = Array.isArray(project.managerIds) ? project.managerIds : [];
    const canEdit = identity.isPlatformAdmin || (identity.identifiers || []).some(id => managerIds.indexOf(id) >= 0);
    const decorated = Object.assign({}, project, {
      canEdit,
      permissionLabel: canEdit ? '我负责' : '仅查看',
      permissionReason: identity.isPlatformAdmin ? 'platform_admin' : (managerIds.length ? 'project_manager_field' : 'manager_not_configured')
    });
    delete decorated.managerIds;
    return decorated;
  });
  return output;
}

exports.main = async function (event) {
  event = event || {};
  const action = String(event.action || 'status'); const c = config();
  const startedAt = Date.now();
  const forceRefresh = event.forceRefresh === true;
  try {
    if (action === 'status') {
      return { success: true, apiVersion: API_VERSION, configured: !!(c.appId && c.appSecret), fields: c.fields };
    }
    if (action === 'inspectAdvancedPermission') {
      const diagnosticToken = await tenantToken(c);
      return inspectAdvancedPermission(diagnosticToken, c);
    }
    if (action === 'getTaskEvidence' && event.shareToken) {
      // The share capability grants read access to ONE stored task only. Never
      // use a caller-supplied record ID or attachment token with the tenant token.
      if (!event.projectId || !event.orderId) throw new Error('缺少整改任务信息');
      const stored = (await db.collection('quality-rectification-orders')
        .doc(safeId(event.projectId) + '__' + safeId(event.orderId)).get()).data;
      const hash = require('crypto').createHash('sha256').update(String(event.shareToken)).digest('hex');
      if (!stored || !stored.shareTokenHash || hash !== stored.shareTokenHash ||
          stored.projectId !== event.projectId || stored.id !== event.orderId) {
        throw new Error('整改协作链接无效或已失效');
      }
      if (!stored.feishuRecordId) throw new Error('该任务未关联飞书记录');
      assertEvidenceSource(stored.feishuSource, c);
      const token = await tenantToken(c);
      const schema = await resolvedSchema(token, c);
      const record = await getRecord(token, c, stored.feishuRecordId);
      if (!record.record_id) throw new Error('飞书记录不存在或无权读取');
      const result = await resolveEvidence(mapRecord(record, schema.fields), token, request, startedAt + 24000);
      return Object.assign({ success: true, apiVersion: API_VERSION }, result);
    }
    const identity = await requireBoundIdentity();
    // OAuth-bound users read with their user token and do not need a tenant
    // token first. Removing that unnecessary network hop saves several seconds
    // on every cold start. Phone-bound users still use the application token.
    const applicationToken = identity.authMode === 'phone' ? await tenantToken(c) : '';
    const readToken = await dataAccessToken(identity, c, applicationToken);
    if (action === 'getTaskEvidence') {
      if (!event.recordId) throw new Error('缺少飞书记录编号');
      assertEvidenceSource(event.source, c);
      const schema = await resolvedSchema(readToken, c);
      const record = await getRecord(readToken, c, String(event.recordId));
      if (!record.record_id || !recordMatchResult(record, event.project || {}, schema.fields).matched) {
        throw new Error('该飞书任务不属于当前项目和炉号，或无权读取');
      }
      const result = await resolveEvidence(mapRecord(record, schema.fields), readToken, request, startedAt + 24000);
      return Object.assign({ success: true, apiVersion: API_VERSION }, result);
    }
    const visibilitySource = identity.authMode === 'phone' ? 'phone_identity_app_token' : 'user_access_token';
    const visibilityKey = userTableCacheKey(c, identity);
    if (action === 'listProjectOptions') {
      const cacheKey = visibilityKey;
      const cached = !forceRefresh && fresh(catalogCache, cacheKey, CATALOG_CACHE_TTL);
      if (cached) return withTiming(decorateCatalog(cached, identity), startedAt, true);
      if (catalogInFlight[cacheKey]) {
        const shared = await catalogInFlight[cacheKey];
        return withTiming(decorateCatalog(shared, identity), startedAt, true);
      }
      catalogInFlight[cacheKey] = (async () => {
        // The picker only needs catalog text. Pulling every column also downloads
        // large attachment metadata and was the main cause of the 15-second timeout.
        const schema = await resolvedSchema(readToken, c);
        const fieldMap = schema.fields;
        if (!fieldMap.project) throw new Error('飞书表缺少“项目名称”列，无法生成项目选择列表');
        if (!fieldMap.device) throw new Error('飞书表缺少“炉号”列，无法生成设备选择列表');
        const catalogFields = [
          fieldMap.project,
          fieldMap.manager,
          fieldMap.device,
          fieldMap.description,
          fieldMap.location,
          fieldMap.category
        ].filter((name, index, all) => name && all.indexOf(name) === index);
        const snapshot = await listRecords(readToken, c, forceRefresh, visibilityKey, {
          cacheScope: 'catalog',
          fieldNames: catalogFields,
          pageSize: 200,
          retryTransient: true,
          timeoutMs: 6000,
          maxAttempts: 1
        });
        const records = snapshot.records;
        const projects = buildProjectOptions(records, fieldMap);
        const value = {
          success: true,
          apiVersion: API_VERSION,
          projects,
          count: projects.length,
          totalRecords: records.length,
          appToken: c.appToken,
          tableId: c.tableId,
          visibilitySource: visibilitySource,
          resolvedFields: fieldMap,
          syncedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
        };
        catalogCache[cacheKey] = { at: Date.now(), value };
        return value;
      })();
      try {
        const value = await catalogInFlight[cacheKey];
        return withTiming(decorateCatalog(value, identity), startedAt, false);
      } finally {
        delete catalogInFlight[cacheKey];
      }
    }
    if (action === 'pullTasks') {
      const project = event.project || {};
      if (!String(project.feishuProjectName || '').trim()) throw new Error('请先从飞书项目列表选择项目');
      if (!String(project.feishuDeviceName || '').trim()) throw new Error('请先选择该项目在飞书中的炉号');
      const cacheKey = taskCacheKey(c, project) + '|' + String(identity.feishuOpenId || identity.feishuUserId || identity.wxOpenId || 'bound-user');
      const cached = !forceRefresh && fresh(taskCache, cacheKey, TASK_CACHE_TTL);
      if (cached) return withTiming(cached, startedAt, true);
      if (taskInFlight[cacheKey]) {
        const shared = await taskInFlight[cacheKey];
        return withTiming(shared, startedAt, true);
      }
      taskInFlight[cacheKey] = (async () => {
        const schema = await resolvedSchema(readToken, c);
        const fieldMap = schema.fields;
        if (!fieldMap.project) throw new Error('飞书表缺少“项目名称”列');
        if (!fieldMap.device) throw new Error('飞书表缺少“炉号”列');
        // Filter on Feishu before attachments are returned. The previous full-table
        // scan repeatedly exceeded the Cloud Function's 30-second execution limit.
        const records = await searchProjectRecords(readToken, c, project, fieldMap);
        const diagnostics = {
          totalRecords: records.length,
          projectName: String(project.feishuProjectName || ''),
          deviceName: String(project.feishuDeviceName || ''),
          appToken: c.appToken,
          tableId: c.tableId,
          visibilitySource: visibilitySource,
          resolvedFields: fieldMap,
          availableFields: schema.availableFields,
          projectMatched: 0,
          matched: 0,
          skippedEmpty: 0,
          skippedProjectName: 0,
          skippedDevice: 0,
          mismatchedDevices: []
        };
        const permission = projectPermission(records, project.feishuProjectName, fieldMap, identity);
        const tasks = [];
        records.forEach(item => {
          const result = recordMatchResult(item, project, fieldMap);
          if (!result.matched) {
            if (result.reason === 'projectName' || result.reason === 'bindingProject') diagnostics.skippedProjectName++;
            else if (result.reason === 'device') {
              diagnostics.skippedDevice++;
              const actualDevice = fieldMap.device ? text((item.fields || {})[fieldMap.device]).trim() : '';
              if (actualDevice && diagnostics.mismatchedDevices.indexOf(actualDevice) < 0 && diagnostics.mismatchedDevices.length < 3) {
                diagnostics.mismatchedDevices.push(actualDevice);
              }
            }
            return;
          }
          diagnostics.projectMatched++;
          const task = mapRecord(item, fieldMap);
          if (!task.hasTaskContent) { diagnostics.skippedEmpty++; return; }
          delete task.hasTaskContent;
          diagnostics.matched++;
          tasks.push(task);
        });
        const value = {
          success: true,
          tasks,
          count: tasks.length,
          diagnostics,
          canEditProject: permission.canEdit,
          permissionLabel: permission.canEdit ? '我负责' : '仅查看',
          permissionReason: permission.reason,
          managerNames: permission.managerNames,
          syncedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
        };
        taskCache[cacheKey] = { at: Date.now(), value };
        return value;
      })();
      try {
        const value = await taskInFlight[cacheKey];
        return withTiming(value, startedAt, false);
      } finally {
        delete taskInFlight[cacheKey];
      }
    }
    if (action === 'syncClosure') {
      const payload = event.payload || {};
      if (!payload.recordId) throw new Error('缺少飞书记录 ID');
      const schema = await resolvedSchema(readToken, c);
      const fieldMap = schema.fields;
      if (!fieldMap.closureImages) throw new Error('飞书表缺少附件列“闭环”（也可命名为“闭环照片”或“整改后照片”）');
      // Keep every attachment that was already maintained manually in Feishu.
      const currentRecord = await atStage('read', '读取飞书原记录', () => getRecord(readToken, c, payload.recordId));
      const recordProjectName = fieldMap.project ? text((currentRecord.fields || {})[fieldMap.project]).trim() : '';
      if (!recordProjectName) throw new Error('目标飞书记录缺少项目名称，不能核验编辑权限');
      const permissionRecords = await searchProjectPermissionRecords(readToken, c, recordProjectName, fieldMap);
      requireProjectEdit(permissionRecords, recordProjectName, fieldMap, identity);
      let trustedOrder = null;
      if (payload.orderId) {
        try {
          const orderResult = await db.collection('quality-rectification-orders').where({ entityId: payload.orderId }).limit(10).get();
          trustedOrder = (orderResult.data || []).find(item => String(item.feishuRecordId || '') === String(payload.recordId || '')) || null;
        } catch (error) {}
      }
      if (!trustedOrder) throw new Error('未找到与飞书记录匹配的云端整改单，不能回传附件');
      if (trustedOrder.status !== 'closed') throw new Error('整改单尚未复验通过，不能回传飞书附件');
      payload.evidencePhotos = trustedOrder.evidencePhotos || [];
      payload.rectificationNote = trustedOrder.rectificationNote || '';
      const photos = Array.isArray(payload.evidencePhotos) ? payload.evidencePhotos.filter(id => String(id).indexOf('cloud://') === 0).slice(0, 9) : [];
      if (!photos.length) throw new Error('没有可回传的整改照片');
      const writeToken = readToken;
      const existing = Array.isArray(currentRecord.fields && currentRecord.fields[fieldMap.closureImages])
        ? currentRecord.fields[fieldMap.closureImages].map(item => ({ file_token: item.file_token || item.fileToken })).filter(item => item.file_token)
        : [];
      const files = [];
      for (let i = 0; i < photos.length; i++) {
        files.push(await atStage('upload', '上传第 ' + (i + 1) + ' 张整改图片到飞书', () => uploadAttachment(writeToken, c, photos[i], i, payload.orderId)));
      }
      const fields = {};
      const mergedTokens = {};
      fields[fieldMap.closureImages] = existing.concat(files).filter(item => {
        const fileToken = String(item && item.file_token || '');
        if (!fileToken || mergedTokens[fileToken]) return false;
        mergedTokens[fileToken] = true;
        return true;
      });
      // These two optional fields are only written when the table has been configured with them.
      if (fieldMap.closureNote) fields[fieldMap.closureNote] = String(payload.rectificationNote || '').slice(0, 1000);
      if (fieldMap.closureTime) fields[fieldMap.closureTime] = Date.now();
      await atStage('update', '写入飞书“' + fieldMap.closureImages + '”附件列', () => updateRecord(writeToken, c, payload.recordId, fields));
      const uploadedTokens = files.map(item => item.file_token);
      const verifiedTokens = await atStage('verify', '核验飞书附件写入结果', () => verifyAttachmentWrite(writeToken, c, payload.recordId, fieldMap.closureImages, uploadedTokens));
      clearTableCaches(c);
      return { success: true, recordId: payload.recordId, fileCount: files.length, closureImageCount: verifiedTokens.length, syncedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) };
    }
    if (action === 'verifyClosure') {
      const payload = event.payload || {};
      if (!payload.recordId) throw new Error('缺少飞书记录 ID');
      const schema = await resolvedSchema(readToken, c);
      const fieldMap = schema.fields;
      if (!fieldMap.closureImages) throw new Error('飞书表缺少附件列“闭环”');
      const currentRecord = await getRecord(readToken, c, payload.recordId);
      const attachments = Array.isArray(currentRecord.fields && currentRecord.fields[fieldMap.closureImages])
        ? currentRecord.fields[fieldMap.closureImages] : [];
      const expectedPhotoCount = Math.max(0, Math.min(9, Number(payload.expectedPhotoCount || 0)));
      const prefix = payload.orderId ? taskAttachmentPrefix(payload.orderId) : '';
      const matchedAttachments = prefix
        ? attachments.filter(item => item && String(item.name || '').indexOf(prefix) === 0 && (item.file_token || item.fileToken))
        : attachments.filter(item => item && (item.file_token || item.fileToken));
      return {
        success: true,
        recordId: payload.recordId,
        hasClosureImages: expectedPhotoCount > 0 ? matchedAttachments.length >= expectedPhotoCount : matchedAttachments.length > 0,
        closureImageCount: attachments.length,
        matchedClosureImageCount: matchedAttachments.length,
        syncedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
      };
    }
    throw new Error('不支持的飞书同步操作：' + action);
  } catch (error) {
    console.error('[feishu-rectification]', action, error);
    return {
      success: false,
      apiVersion: API_VERSION,
      error: error.message || String(error),
      stage: String(error.stage || ''),
      httpStatus: Number(error.httpStatus || 0),
      feishuCode: Number(error.feishuCode || 0),
      requestId: String(error.requestId || ''),
      recordId: String(error.recordId || ''),
      tableId: String(error.tableId || ''),
      code: String(error.code || ''),
      durationMs: Math.max(0, Date.now() - startedAt)
    };
  }
};
