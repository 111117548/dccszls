'use strict'

const crypto = require('node:crypto')
const https = require('node:https')

const API_HOST = 'api.wsa.cloud.tencent.com'
const API_PATH = '/SearchPro'
const CACHE_TTL_MS = 30 * 60 * 1000
const NEWS_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_BODY_BYTES = 1024 * 1024
const cache = new Map()

function trimText(value, maxLength) {
  return typeof value === 'string' ? value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''
}

function contentText(value, maxLength) {
  return trimText(value, maxLength * 2)
    .replace(/<[^>]{0,300}>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function sanitizeArea(value) {
  return trimText(value, 80)
    .replace(/<[^>]{0,80}>/g, '')
    .replace(/[^\p{Script=Han}A-Za-z0-9·\-\s]/gu, '')
    .slice(0, 40)
}

function areaTokens(city, district) {
  const raw = [sanitizeArea(district), sanitizeArea(city)].filter(Boolean)
  const expanded = raw.flatMap((item) => [item, item.replace(/(特别行政区|自治州|自治县|地区|新区|市|区|县)$/u, '')])
  return [...new Set(expanded.filter((item) => item.length >= 2))]
}

function cacheKey(city, district) {
  return `${sanitizeArea(city)}|${sanitizeArea(district)}`
}

function buildQuery(city, district) {
  const area = [sanitizeArea(city), sanitizeArea(district)]
    .filter((item, index, values) => item && values.indexOf(item) === index)
    .join(' ')
  return `${area} 最新 本地 新闻 通报 民生 交通 活动`.trim()
}

function parsePublishedAt(value) {
  const text = trimText(value, 40)
  if (!text) return 0
  const timestamp = Date.parse(text.replace(/\//g, '-'))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function validHttpsUrl(value) {
  try {
    const url = new URL(trimText(value, 1000))
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function fallbackSite(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function isAreaRelevant(title, summary, city, district) {
  const haystack = `${title}${summary}`.replace(/\s+/g, '')
  return areaTokens(city, district).some((token) => haystack.includes(token.replace(/\s+/g, '')))
}

function normalizePages(pages, city, district, now = Date.now()) {
  if (!Array.isArray(pages)) return []
  const seenUrls = new Set()
  const seenTitles = new Set()
  const items = []

  for (const rawPage of pages) {
    let page
    try {
      page = typeof rawPage === 'string' ? JSON.parse(rawPage) : rawPage
    } catch {
      continue
    }
    const title = trimText(page?.title, 120)
    const summary = contentText(page?.passage || page?.content, 320)
    const url = validHttpsUrl(page?.url)
    const publishedAt = parsePublishedAt(page?.date)
    if (!title || !summary || !url || !publishedAt) continue
    if (publishedAt > now + 10 * 60 * 1000 || now - publishedAt > NEWS_LOOKBACK_MS) continue
    if (!isAreaRelevant(title, summary, city, district)) continue
    const titleKey = title.replace(/[\s\p{P}]/gu, '').toLocaleLowerCase()
    if (seenUrls.has(url) || seenTitles.has(titleKey)) continue
    seenUrls.add(url)
    seenTitles.add(titleKey)
    items.push({
      id: `news-${crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)}`,
      title,
      summary,
      url,
      sourceName: trimText(page?.site, 60) || fallbackSite(url),
      publishedAt,
      relevance: Math.max(0, Math.min(1, Number(page?.score) || 0.7))
    })
    if (items.length >= 5) break
  }
  return items
}

function requestSearch(apiKey, body) {
  const encoded = Buffer.from(JSON.stringify(body), 'utf8')
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: 'https:',
        hostname: API_HOST,
        path: API_PATH,
        method: 'POST',
        timeout: 10_000,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': encoded.length,
          'User-Agent': 'Wchat/0.5 CloudFunction'
        }
      },
      (response) => {
        const chunks = []
        let size = 0
        response.on('data', (chunk) => {
          size += chunk.length
          if (size > MAX_BODY_BYTES) request.destroy(new Error('local_news_response_too_large'))
          else chunks.push(chunk)
        })
        response.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`local_news_http_${response.statusCode}`))
              return
            }
            if (json?.Response?.Error) {
              reject(new Error(`local_news_provider_${trimText(json.Response.Error.Code, 60) || 'error'}`))
              return
            }
            resolve(json)
          } catch {
            reject(new Error('local_news_response_invalid'))
          }
        })
      }
    )
    request.on('timeout', () => request.destroy(new Error('local_news_timeout')))
    request.on('error', reject)
    request.end(encoded)
  })
}

async function fetchLocalNews(city, district, apiKey, now = Date.now()) {
  const response = await requestSearch(apiKey, {
    Query: buildQuery(city, district),
    Mode: 0,
    FromTime: Math.floor((now - NEWS_LOOKBACK_MS) / 1000),
    ToTime: Math.floor(now / 1000)
  })
  const items = normalizePages(response?.Response?.Pages, city, district, now)
  return {
    success: true,
    items,
    meta: {
      provider: 'Tencent Cloud WSA',
      requestId: trimText(response?.Response?.RequestId, 100) || null,
      fetchedAt: now,
      expiresAt: now + CACHE_TTL_MS,
      scope: district ? 'district_and_city' : 'city',
      queryArea: district || city,
      attribution: '搜索结果来自腾讯云联网搜索 API；新闻版权归原发布网站所有'
    }
  }
}

exports.main = async (event = {}) => {
  const city = sanitizeArea(event.city)
  const district = sanitizeArea(event.district)
  if (!city && !district) return { success: false, error: 'local_news_area_missing' }

  const apiKey = process.env.TENCENTCLOUD_WSA_APIKEY
  if (!apiKey) return { success: false, error: 'local_news_service_not_configured' }

  const key = cacheKey(city, district)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { ...cached.value, meta: { ...cached.value.meta, cacheHit: true } }
  }

  try {
    const value = await fetchLocalNews(city, district, apiKey)
    cache.set(key, { cachedAt: Date.now(), value })
    return { ...value, meta: { ...value.meta, cacheHit: false } }
  } catch (error) {
    return { success: false, error: error?.message || 'local_news_service_failed' }
  }
}

exports.__test = {
  sanitizeArea,
  contentText,
  areaTokens,
  cacheKey,
  buildQuery,
  parsePublishedAt,
  validHttpsUrl,
  isAreaRelevant,
  normalizePages
}
