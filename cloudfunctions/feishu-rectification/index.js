/*
 * Feishu Bitable bridge.  All credentials remain in cloud-function variables:
 * FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_BITABLE_APP_TOKEN, FEISHU_TABLE_ID.
 * Never put a Feishu secret in Mini Program source code.
 */
const cloud = require('wx-server-sdk');
const https = require('https');
const path = require('path');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 2026-08-23: current engineering-department rectification Bitable.
// Environment variables still have priority so that production can switch tables
// without publishing Mini Program source again.
const DEFAULT_APP_TOKEN = 'UHjvbqHtrak96Usb1ItcwI8pnNe';
const DEFAULT_TABLE_ID = 'tbl8MwNtgzsHjG0A';
const API_HOST = 'open.feishu.cn';
const HTTP_TIMEOUT = 15000;
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

function request(method, requestPath, headers, body) {
  return new Promise((resolve, reject) => {
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
    req.setTimeout(HTTP_TIMEOUT, () => {
      req.destroy(new Error('飞书接口请求超时，请稍后重试'));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function tenantToken(c) {
  if (!c.appId || !c.appSecret) throw new Error('尚未配置飞书凭证：请在 feishu-rectification 云函数环境变量填写 FEISHU_APP_ID 与 FEISHU_APP_SECRET');
  if (tokenCache && tokenCache.token && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const response = await request('POST', '/open-apis/auth/v3/tenant_access_token/internal', { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ app_id: c.appId, app_secret: c.appSecret }));
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

async function listRecords(token, c, forceRefresh, visibilityKey) {
  // OAuth bindings can expose a per-user record set. Phone bindings use the
  // application record set and are still partitioned by bound identity so
  // permission-decorated results never leak across users.
  const key = visibilityKey || tableCacheKey(c);
  const cached = !forceRefresh && fresh(recordCache, key, RECORD_CACHE_TTL);
  if (cached) return { records: cached, fromCache: true };
  if (recordInFlight[key]) return recordInFlight[key];
  recordInFlight[key] = (async () => {
    let pageToken = ''; const all = []; const seenPageTokens = {};
    do {
      // Bitable supports up to 500 rows per page. The previous value of 100
      // multiplied network round trips on engineering tables with many defects.
      const suffix = '?page_size=500' + (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
      const result = await request('GET', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records' + suffix, { Authorization: 'Bearer ' + token });
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
    const result = await request('GET', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/fields' + suffix, { Authorization: 'Bearer ' + token });
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

function attachmentUrls(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map(item => ({ name: item.name || '', fileToken: item.file_token || item.fileToken || '', url: item.url || item.tmp_url || '' }));
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
    location, category, level: text(value('level')), description,
    deadline: timestampText(value('deadline')), feishuStatus: state.code, feishuStatusName: state.name,
    sourceImages, closureImages: attachmentUrls(value('closureImages')),
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
  const result = await request('GET', '/open-apis/bitable/v1/apps/' + encodeURIComponent(c.appToken) + '/tables/' + encodeURIComponent(c.tableId) + '/records/' + encodeURIComponent(recordId), { Authorization: 'Bearer ' + token });
  return (result.data && result.data.record) || {};
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

const API_VERSION = 'feishu-user-visible-projects-v9';

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
    const identity = await requireBoundIdentity();
    const token = await tenantToken(c);
    const readToken = await dataAccessToken(identity, c, token);
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
      // Field metadata and records are independent. Fetching them concurrently
      // removes one full Feishu round trip from the cold-start path.
      catalogInFlight[cacheKey] = (async () => {
        const results = await Promise.all([resolvedSchema(token, c), listRecords(readToken, c, forceRefresh, visibilityKey)]);
        const schema = results[0];
        const snapshot = results[1];
        const records = snapshot.records;
        const fieldMap = schema.fields;
        if (!fieldMap.project) throw new Error('飞书表缺少“项目名称”列，无法生成项目选择列表');
        if (!fieldMap.device) throw new Error('飞书表缺少“炉号”列，无法生成设备选择列表');
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
        const results = await Promise.all([resolvedSchema(token, c), listRecords(readToken, c, forceRefresh, visibilityKey)]);
        const schema = results[0];
        const records = results[1].records;
        const fieldMap = schema.fields;
        if (!fieldMap.project) throw new Error('飞书表缺少“项目名称”列');
        if (!fieldMap.device) throw new Error('飞书表缺少“炉号”列');
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
      const schema = await resolvedSchema(token, c);
      const fieldMap = schema.fields;
      if (!fieldMap.closureImages) throw new Error('飞书表缺少附件列“闭环”（也可命名为“闭环照片”或“整改后照片”）');
      // Keep every attachment that was already maintained manually in Feishu.
      const currentRecord = await atStage('read', '读取飞书原记录', () => getRecord(readToken, c, payload.recordId));
      const recordProjectName = fieldMap.project ? text((currentRecord.fields || {})[fieldMap.project]).trim() : '';
      if (!recordProjectName) throw new Error('目标飞书记录缺少项目名称，不能核验编辑权限');
      const permissionRecords = (await listRecords(readToken, c, false, visibilityKey)).records;
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
      const schema = await resolvedSchema(token, c);
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
      error: error.message || String(error),
      stage: String(error.stage || ''),
      httpStatus: Number(error.httpStatus || 0),
      feishuCode: Number(error.feishuCode || 0),
      requestId: String(error.requestId || ''),
      code: String(error.code || '')
    };
  }
};
