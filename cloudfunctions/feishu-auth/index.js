const cloud = require('wx-server-sdk');
const https = require('https');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const BINDINGS = 'feishu-user-bindings';
const STATES = 'feishu-oauth-states';
const API_HOST = 'open.feishu.cn';
const AUTHORIZE_HOST = 'accounts.feishu.cn';
const STATE_TTL = 10 * 60 * 1000;
const HTTP_TIMEOUT = 15000;
let tenantTokenCache = null;

function config() {
  return {
    appId: String(process.env.FEISHU_APP_ID || ''),
    appSecret: String(process.env.FEISHU_APP_SECRET || ''),
    redirectUri: String(process.env.FEISHU_OAUTH_REDIRECT_URI || ''),
    scope: String(process.env.FEISHU_OAUTH_SCOPE || 'offline_access'),
    adminIds: String(process.env.FEISHU_PLATFORM_ADMIN_IDS || '').split(',').map(item => item.trim()).filter(Boolean),
    encryptionKey: String(process.env.FEISHU_TOKEN_ENCRYPTION_KEY || process.env.FEISHU_APP_SECRET || '')
  };
}

function safeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 120);
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get();
  } catch (readError) {
    if (typeof db.createCollection !== 'function') throw readError;
    try { await db.createCollection(name); } catch (createError) {
      try { await db.collection(name).limit(1).get(); } catch (verifyError) { throw createError; }
    }
  }
}

function request(method, requestPath, headers, body) {
  return new Promise((resolve, reject) => {
    const raw = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const requestHeaders = Object.assign({}, headers || {});
    if (raw) {
      requestHeaders['Content-Type'] = 'application/json; charset=utf-8';
      requestHeaders['Content-Length'] = raw.length;
    }
    const req = https.request({ hostname: API_HOST, path: requestPath, method, headers: requestHeaders, timeout: HTTP_TIMEOUT }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (error) { data = { msg: text }; }
        if (res.statusCode >= 200 && res.statusCode < 300 && (data.code === undefined || Number(data.code) === 0)) resolve(data);
        else reject(new Error((data && (data.msg || data.message)) || ('飞书接口请求失败（HTTP ' + res.statusCode + '）')));
      });
    });
    req.on('timeout', () => req.destroy(new Error('飞书授权接口请求超时')));
    req.on('error', reject);
    if (raw) req.write(raw);
    req.end();
  });
}

function encryptionKey(c) {
  if (!c.encryptionKey) throw new Error('缺少 FEISHU_TOKEN_ENCRYPTION_KEY');
  return crypto.createHash('sha256').update(c.encryptionKey).digest();
}

function encrypt(value, c) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(c), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

function publicProfile(binding, c) {
  binding = binding || {};
  const liveAdmin = !!binding.enabled && isAdmin({
    open_id: binding.feishuOpenId,
    user_id: binding.feishuUserId,
    union_id: binding.feishuUnionId,
    email: binding.email
  }, c || { adminIds: [] });
  return {
    bound: !!binding.enabled,
    feishuOpenId: binding.feishuOpenId || '',
    feishuUserId: binding.feishuUserId || '',
    feishuUnionId: binding.feishuUnionId || '',
    name: binding.name || '',
    avatarUrl: binding.avatarUrl || '',
    email: binding.email || '',
    role: liveAdmin ? 'platform_admin' : 'project_manager',
    roleName: liveAdmin ? '平台管理员' : '项目经理',
    authMode: binding.authMode || 'oauth',
    authModeName: binding.authMode === 'phone' ? '微信手机号认证' : '飞书账号授权',
    phoneSuffix: binding.phoneSuffix || '',
    boundAtText: binding.boundAtText || ''
  };
}

function isAdmin(user, c) {
  const values = [user.open_id, user.user_id, user.union_id, user.email].filter(Boolean).map(String);
  return c.adminIds.some(id => values.indexOf(id) >= 0);
}

async function tenantToken(c) {
  if (tenantTokenCache && tenantTokenCache.token && tenantTokenCache.expiresAt > Date.now() + 60000) {
    return tenantTokenCache.token;
  }
  const result = await request('POST', '/open-apis/auth/v3/tenant_access_token/internal', {}, {
    app_id: c.appId,
    app_secret: c.appSecret
  });
  if (!result.tenant_access_token) throw new Error('飞书未返回 tenant_access_token');
  tenantTokenCache = {
    token: result.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, Number(result.expire || 7200) - 300) * 1000
  };
  return tenantTokenCache.token;
}

function phoneInfoFromResponse(result) {
  const data = result && result.data || {};
  return result && (result.phoneInfo || result.phone_info) || data.phoneInfo || data.phone_info || {};
}

async function wechatPhoneNumber(code) {
  if (!code) {
    const error = new Error('未获得微信手机号授权，请点击允许后重试');
    error.code = 'WECHAT_PHONE_DENIED';
    throw error;
  }
  if (!cloud.openapi || !cloud.openapi.phonenumber || typeof cloud.openapi.phonenumber.getPhoneNumber !== 'function') {
    const error = new Error('当前云端 SDK 不支持手机号快速验证，请重新部署 feishu-auth 云函数并选择云端安装依赖');
    error.code = 'WECHAT_PHONE_API_UNAVAILABLE';
    throw error;
  }
  const result = await cloud.openapi.phonenumber.getPhoneNumber({ code: String(code) });
  const info = phoneInfoFromResponse(result);
  const number = String(info.purePhoneNumber || info.pure_phone_number || info.phoneNumber || info.phone_number || '').replace(/\s+/g, '');
  if (!number) {
    const error = new Error('微信未返回手机号，请确认小程序已认证并开通手机号快速验证能力');
    error.code = 'WECHAT_PHONE_EMPTY';
    throw error;
  }
  return number.replace(/^\+?86/, '');
}

function mobileCandidates(number) {
  const pure = String(number || '').replace(/[^0-9]/g, '');
  return Array.from(new Set([pure, pure ? '+86' + pure : ''].filter(Boolean)));
}

async function feishuUserByMobile(number, c) {
  const token = await tenantToken(c);
  const lookup = await request('POST', '/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id', {
    Authorization: 'Bearer ' + token
  }, {
    mobiles: mobileCandidates(number),
    include_resigned: false
  });
  const list = lookup && lookup.data && (lookup.data.user_list || lookup.data.userList) || [];
  const matched = list.find(item => item && (item.user_id || item.open_id || item.openId));
  if (!matched) {
    const error = new Error('该微信手机号未匹配到飞书员工。请确认微信与飞书登记手机号一致，或使用备用飞书授权');
    error.code = 'FEISHU_USER_NOT_FOUND_BY_PHONE';
    throw error;
  }
  const openId = String(matched.open_id || matched.openId || matched.user_id || '');
  let detail = {};
  try {
    const detailResult = await request('GET', '/open-apis/contact/v3/users/' + encodeURIComponent(openId) + '?user_id_type=open_id', {
      Authorization: 'Bearer ' + token
    });
    detail = detailResult && detailResult.data && (detailResult.data.user || detailResult.data) || {};
  } catch (error) {
    // Identity matching only requires the open_id returned by batch_get_id.
    // Profile details are optional and depend on the app's contact scope.
  }
  return {
    open_id: String(detail.open_id || detail.openId || openId),
    user_id: String(detail.user_id || detail.userId || ''),
    union_id: String(detail.union_id || detail.unionId || ''),
    name: String(detail.name || detail.en_name || matched.name || '飞书员工'),
    avatar_url: String(detail.avatar_url || detail.avatar && (detail.avatar.avatar_72 || detail.avatar.avatar_240) || ''),
    email: String(detail.email || ''),
    mobile: String(number || '')
  };
}

async function bindByPhone(code, wxOpenId, c) {
  await ensureCollection(BINDINGS);
  const phone = await wechatPhoneNumber(code);
  const user = await feishuUserByMobile(phone, c);
  const binding = {
    wxOpenId: wxOpenId,
    feishuOpenId: user.open_id,
    feishuUserId: user.user_id,
    feishuUnionId: user.union_id,
    name: user.name,
    avatarUrl: user.avatar_url,
    email: user.email,
    mobileHash: crypto.createHash('sha256').update(phone).digest('hex'),
    phoneSuffix: phone.slice(-4),
    authMode: 'phone',
    systemRole: isAdmin(user, c) ? 'platform_admin' : 'project_manager',
    enabled: true,
    accessTokenEncrypted: '',
    refreshTokenEncrypted: '',
    accessTokenExpiresAt: 0,
    refreshTokenExpiresAt: 0,
    grantedScope: 'phone_identity',
    boundAt: db.serverDate(),
    boundAtText: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  };
  await db.collection(BINDINGS).doc(safeId(wxOpenId)).set({ data: binding });
  return publicProfile(binding, c);
}

async function exchangeAuthorizationCode(code, c) {
  const tokenResult = await request('POST', '/open-apis/authen/v2/oauth/token', {}, {
    grant_type: 'authorization_code',
    client_id: c.appId,
    client_secret: c.appSecret,
    code: String(code || ''),
    redirect_uri: c.redirectUri
  });
  const token = tokenResult.data || tokenResult;
  if (!token.access_token) throw new Error('飞书未返回 user_access_token');
  const userResult = await request('GET', '/open-apis/authen/v1/user_info', { Authorization: 'Bearer ' + token.access_token });
  const user = userResult.data || userResult;
  if (!user.open_id && !user.user_id) throw new Error('飞书未返回用户身份');
  return { token, user };
}

async function completeBinding(code, state, c) {
  if (!code || !state) throw new Error('飞书授权回调缺少 code 或 state');
  await Promise.all([ensureCollection(BINDINGS), ensureCollection(STATES)]);
  let stateDoc;
  try { stateDoc = (await db.collection(STATES).doc(safeId(state)).get()).data; } catch (error) {}
  if (!stateDoc || stateDoc.used || Number(stateDoc.expiresAt || 0) < Date.now()) throw new Error('授权请求已失效，请返回小程序重新发起');
  const result = await exchangeAuthorizationCode(code, c);
  const token = result.token;
  const user = result.user;
  const now = Date.now();
  const binding = {
    wxOpenId: stateDoc.wxOpenId,
    feishuOpenId: String(user.open_id || ''),
    feishuUserId: String(user.user_id || ''),
    feishuUnionId: String(user.union_id || ''),
    name: String(user.name || user.en_name || '飞书用户'),
    avatarUrl: String(user.avatar_url || user.avatar_thumb || ''),
    email: String(user.email || ''),
    mobile: String(user.mobile || ''),
    systemRole: isAdmin(user, c) ? 'platform_admin' : 'project_manager',
    authMode: 'oauth',
    enabled: true,
    accessTokenEncrypted: encrypt(token.access_token, c),
    refreshTokenEncrypted: encrypt(token.refresh_token || '', c),
    accessTokenExpiresAt: now + Number(token.expires_in || 7200) * 1000,
    refreshTokenExpiresAt: now + Number(token.refresh_token_expires_in || 2592000) * 1000,
    grantedScope: String(token.scope || ''),
    boundAt: db.serverDate(),
    boundAtText: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  };
  await db.collection(BINDINGS).doc(safeId(stateDoc.wxOpenId)).set({ data: binding });
  await db.collection(STATES).doc(safeId(state)).update({ data: { used: true, usedAt: db.serverDate() } });
  return publicProfile(binding, c);
}

function callbackHtml(ok, message) {
  const title = ok ? '飞书账号绑定成功' : '飞书账号绑定失败';
  const color = ok ? '#087f5b' : '#c92a2a';
  const safeMessage = String(message || '').replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>' +
    '<body style="margin:0;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><main style="margin:18vh 20px;padding:28px;background:#fff;border-radius:12px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08)"><h2 style="color:' + color + '">' + title + '</h2><p style="color:#586575;line-height:1.7">' + safeMessage + '</p><p style="color:#87909c">请返回微信小程序，页面会自动确认绑定状态。</p></main></body></html>';
}

function isHttpEvent(event) {
  return !!(event && (event.httpMethod || event.requestContext || event.queryStringParameters));
}

exports.main = async function (event) {
  event = event || {};
  const c = config();
  if (!c.appId || !c.appSecret) {
    const error = '未配置 FEISHU_APP_ID 或 FEISHU_APP_SECRET';
    if (isHttpEvent(event)) return { statusCode: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: callbackHtml(false, error) };
    return { success: false, error, code: 'FEISHU_AUTH_NOT_CONFIGURED' };
  }

  if (isHttpEvent(event)) {
    const query = event.queryStringParameters || {};
    try {
      await completeBinding(query.code, query.state, c);
      return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: callbackHtml(true, '身份已安全绑定。') };
    } catch (error) {
      return { statusCode: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: callbackHtml(false, error.message || String(error)) };
    }
  }

  const action = String(event.action || 'status');
  const wxContext = cloud.getWXContext();
  const wxOpenId = String(wxContext.OPENID || '');
  try {
    await ensureCollection(BINDINGS);
    if (action === 'status') {
      let binding = null;
      try { binding = (await db.collection(BINDINGS).doc(safeId(wxOpenId)).get()).data; } catch (error) {}
      return { success: true, profile: publicProfile(binding, c), oauthConfigured: !!c.redirectUri };
    }
    if (action === 'getAuthUrl') {
      if (!c.redirectUri) throw new Error('未配置 FEISHU_OAUTH_REDIRECT_URI');
      await ensureCollection(STATES);
      const state = crypto.randomBytes(24).toString('hex');
      await db.collection(STATES).doc(safeId(state)).set({ data: {
        wxOpenId,
        used: false,
        expiresAt: Date.now() + STATE_TTL,
        createdAt: db.serverDate()
      }});
      const query = [
        'app_id=' + encodeURIComponent(c.appId),
        'redirect_uri=' + encodeURIComponent(c.redirectUri),
        'state=' + encodeURIComponent(state),
        c.scope ? 'scope=' + encodeURIComponent(c.scope) : ''
      ].filter(Boolean).join('&');
      return { success: true, authUrl: 'https://' + AUTHORIZE_HOST + '/open-apis/authen/v1/authorize?' + query, expiresIn: STATE_TTL / 1000 };
    }
    if (action === 'bindByPhone') {
      const profile = await bindByPhone(event.phoneCode, wxOpenId, c);
      return { success: true, profile };
    }
    if (action === 'exchangeCode') {
      const profile = await completeBinding(event.code, event.state, c);
      return { success: true, profile };
    }
    if (action === 'unbind') {
      await db.collection(BINDINGS).doc(safeId(wxOpenId)).update({ data: { enabled: false, unboundAt: db.serverDate() } });
      return { success: true, profile: publicProfile(null, c) };
    }
    throw new Error('不支持的飞书身份操作：' + action);
  } catch (error) {
    console.error('[feishu-auth]', action, error);
    return { success: false, error: error.message || String(error), code: error.code || '' };
  }
};
