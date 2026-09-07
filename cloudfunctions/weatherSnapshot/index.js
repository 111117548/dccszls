'use strict'

const https = require('node:https')
const zlib = require('node:zlib')

const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map()

function isValidApiHost(host) {
  return typeof host === 'string' && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.qweatherapi\.com$/i.test(host)
}

function validateCoordinates(longitude, latitude) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  )
}

function decodeResponse(buffer, encoding) {
  if (encoding === 'gzip') return zlib.gunzipSync(buffer)
  if (encoding === 'deflate') return zlib.inflateSync(buffer)
  return buffer
}

function requestJson(host, path, apiKey) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: 'https:',
        hostname: host,
        path,
        method: 'GET',
        timeout: 8000,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'X-QW-Api-Key': apiKey,
          'User-Agent': 'Wchat/0.2 CloudFunction'
        }
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          try {
            const decoded = decodeResponse(Buffer.concat(chunks), response.headers['content-encoding'])
            const json = JSON.parse(decoded.toString('utf8'))
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`provider_http_${response.statusCode}`))
              return
            }
            resolve(json)
          } catch {
            reject(new Error('provider_response_invalid'))
          }
        })
      }
    )
    request.on('timeout', () => request.destroy(new Error('provider_timeout')))
    request.on('error', reject)
    request.end()
  })
}

function numberOr(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function cacheKey(longitude, latitude) {
  return `${longitude.toFixed(2)},${latitude.toFixed(2)}`
}

async function fetchSnapshot(longitude, latitude, host, apiKey) {
  // 和风天气坐标接口最多支持两位小数；这也避免向天气服务提供过细坐标。
  const longitudeRounded = longitude.toFixed(2)
  const latitudeRounded = latitude.toFixed(2)
  const encodedLocation = encodeURIComponent(`${longitudeRounded},${latitudeRounded}`)

  const weatherPromise = requestJson(host, `/v7/weather/now?location=${encodedLocation}&lang=zh&unit=m`, apiKey)
  const geoPromise = requestJson(host, `/geo/v2/city/lookup?location=${encodedLocation}&number=1&lang=zh`, apiKey)
  const alertPromise = requestJson(
    host,
    `/weatheralert/v1/current/${latitudeRounded}/${longitudeRounded}?localTime=true&lang=zh`,
    apiKey
  ).catch(() => ({ alerts: [], metadata: { attributions: [] } }))

  const [weatherResponse, geoResponse, alertResponse] = await Promise.all([
    weatherPromise,
    geoPromise,
    alertPromise
  ])

  if (weatherResponse.code !== '200' || !weatherResponse.now) throw new Error('weather_unavailable')
  const place = geoResponse.code === '200' && Array.isArray(geoResponse.location) ? geoResponse.location[0] : null
  const alert = Array.isArray(alertResponse.alerts) ? alertResponse.alerts[0] : null
  const now = Date.now()
  const observedAt = Date.parse(weatherResponse.now.obsTime || weatherResponse.updateTime || '') || now

  return {
    success: true,
    location: {
      country: place?.country || '',
      province: place?.adm1 || '',
      city: place?.adm2 || place?.name || '',
      district: place?.name && place.name !== place.adm2 ? place.name : '',
      displayName: place?.name || place?.adm2 || place?.adm1 || '经纬度定位',
      longitude,
      latitude,
      scope: 'city'
    },
    weather: {
      condition: weatherResponse.now.text || '未知',
      icon: weatherResponse.now.icon || '',
      temperature: numberOr(weatherResponse.now.temp),
      feelsLike: numberOr(weatherResponse.now.feelsLike),
      humidity: numberOr(weatherResponse.now.humidity),
      wind: `${weatherResponse.now.windDir || ''} ${weatherResponse.now.windScale || ''}级`.trim(),
      precipitation: numberOr(weatherResponse.now.precip),
      warning: alert?.headline || null,
      warningId: alert?.id || null,
      sources: Array.isArray(weatherResponse.refer?.sources) ? weatherResponse.refer.sources : ['QWeather'],
      attributions: [
        ...(Array.isArray(weatherResponse.refer?.license) ? weatherResponse.refer.license : []),
        ...(Array.isArray(alertResponse.metadata?.attributions) ? alertResponse.metadata.attributions : [])
      ],
      observedAt
    },
    meta: {
      provider: 'QWeather',
      fetchedAt: now,
      expiresAt: now + CACHE_TTL_MS,
      coordinatePrecision: '0.01_degree'
    }
  }
}

exports.main = async (event = {}) => {
  const longitude = Number(event.longitude)
  const latitude = Number(event.latitude)
  if (!validateCoordinates(longitude, latitude)) {
    return { success: false, error: 'invalid_coordinates' }
  }

  const apiKey = process.env.QWEATHER_API_KEY
  const apiHost = process.env.QWEATHER_API_HOST
  if (!apiKey || !isValidApiHost(apiHost)) {
    return { success: false, error: 'weather_service_not_configured' }
  }

  const key = cacheKey(longitude, latitude)
  const cached = cache.get(key)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { ...cached.value, meta: { ...cached.value.meta, cacheHit: true } }
  }

  try {
    const value = await fetchSnapshot(longitude, latitude, apiHost, apiKey)
    cache.set(key, { cachedAt: Date.now(), value })
    return { ...value, meta: { ...value.meta, cacheHit: false } }
  } catch (error) {
    // 不返回供应商原始响应、凭据或请求 URL。
    return { success: false, error: error?.message || 'weather_service_failed' }
  }
}

exports.__test = { isValidApiHost, validateCoordinates, cacheKey, numberOr }
