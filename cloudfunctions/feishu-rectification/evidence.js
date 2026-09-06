// Bitable tmp_url is an authenticated API endpoint, not an image URL.
const MEDIA_PATH = '/open-apis/drive/v1/medias/batch_get_tmp_download_url';

function displayUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.pathname.indexOf('/open-apis/') === 0) return '';
    return url.href;
  } catch (error) { return ''; }
}

function attachmentUrls(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map(item => {
    let extra = '';
    try {
      const endpoint = new URL(item.tmp_url || '');
      if (endpoint.hostname === 'open.feishu.cn' && endpoint.pathname === MEDIA_PATH) {
        extra = endpoint.searchParams.get('extra') || '';
      }
    } catch (error) {}
    return {
      name: item.name || '', fileToken: item.file_token || item.fileToken || '', extra,
      url: [item.tmp_download_url, item.temp_url, item.preview_url, item.download_url, item.url, item.tmp_url]
        .map(displayUrl).find(Boolean) || ''
    };
  });
}

async function resolveEvidence(task, token, request, deadline) {
  const all = task.sourceImages.concat(task.closureImages);
  const groups = new Map();
  all.forEach(item => {
    if (!item.fileToken) return;
    // Never keep an expired URL if refreshing its token fails.
    item.url = '';
    const extra = item.extra || '';
    if (!groups.has(extra)) groups.set(extra, []);
    const tokens = groups.get(extra);
    if (tokens.indexOf(item.fileToken) < 0) tokens.push(item.fileToken);
  });
  const batches = [];
  groups.forEach((tokens, extra) => {
    for (let i = 0; i < tokens.length; i += 5) batches.push({ tokens: tokens.slice(i, i + 5), extra });
  });
  const urls = new Map();
  let next = 0;
  let failureCode = '';
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      const remaining = deadline - Date.now();
      if (remaining < 500) { failureCode = failureCode || 'TIME_BUDGET'; continue; }
      const query = batch.tokens.map(value => 'file_tokens=' + encodeURIComponent(value));
      if (batch.extra) query.push('extra=' + encodeURIComponent(batch.extra));
      try {
        const result = await request('GET', MEDIA_PATH + '?' + query.join('&'),
          { Authorization: 'Bearer ' + token }, undefined, { timeoutMs: Math.min(5000, remaining) });
        ((result.data && result.data.tmp_download_urls) || []).forEach(item => {
          if (batch.tokens.indexOf(item.file_token) >= 0 && displayUrl(item.tmp_download_url)) {
            urls.set(batch.extra + '\n' + item.file_token, displayUrl(item.tmp_download_url));
          }
        });
      } catch (error) {
        failureCode = String(error.feishuCode || error.httpStatus || error.code || 'MEDIA_UNAVAILABLE');
      }
    }
  }
  await Promise.all([worker(), worker()]);
  all.forEach(item => {
    if (item.fileToken) item.url = urls.get((item.extra || '') + '\n' + item.fileToken) || '';
    delete item.extra;
  });
  task.problemPhotos = task.sourceImages;
  const unavailable = all.filter(item => !item.url).length;
  return {
    task, unavailable,
    warning: unavailable ? '有 ' + unavailable + ' 个附件暂未取得图片链接，请重试；如持续失败，请管理员检查飞书素材读取权限。' : '',
    mediaErrorCode: unavailable ? failureCode || 'MISSING_URL' : ''
  };
}

module.exports = { attachmentUrls, resolveEvidence };
