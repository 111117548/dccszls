import { opportunitiesFromChanges } from '../core/opportunity-engine'
import type { EvidenceEnvelope, Opportunity, WorldSnapshot } from '../core/types'
import { detectWorldChanges, type WorldChange } from '../core/world-change'
import { fetchLocalNewsSnapshot, type LocalNewsCloudPayload } from './local-news-service'
import { getForegroundLocation, type ForegroundLocation } from './location-service'
import { getWorldSnapshot, setWorldSnapshot } from './world-store'
import { fetchWeatherSnapshot, type WeatherCloudPayload } from './weather-service'

export interface WorldSyncResult {
  ok: boolean
  snapshot: WorldSnapshot | null
  error: string | null
  localNewsError: string | null
  locationPermissionDenied: boolean
  previousSnapshot: WorldSnapshot | null
  changes: WorldChange[]
  opportunities: Opportunity[]
  evidence: EvidenceEnvelope<unknown>[]
}

export function worldSyncErrorMessage(error: string | null): string {
  const message = error || ''
  if (message === 'permission_denied') return '定位权限未开启'
  if (message === 'location_failed') return '无法获取当前位置，请使用真机或在模拟器中设置定位'
  if (message === 'cloud_not_available') return '当前小程序没有可用的云开发环境'
  if (message === 'weather_service_not_configured') return '云端 weatherSnapshot 尚未配置和风天气环境变量'
  if (/function.*not.*found|functionname|找不到.*函数|-501000/i.test(message)) {
    return '当前云环境中找不到 weatherSnapshot，请先上传并部署云函数'
  }
  if (/environment|env.*not|cloud.*init|云环境/i.test(message)) {
    return '小程序没有绑定正确的云环境'
  }
  if (/timeout|timed out/i.test(message)) return '天气服务请求超时，请稍后重试'
  return message ? `天气同步失败：${message}` : '天气同步失败，请检查云函数日志'
}

export function buildLiveSnapshot(
  location: ForegroundLocation,
  payload: WeatherCloudPayload,
  now = Date.now()
): WorldSnapshot {
  const place = payload.location
  const weather = payload.weather
  return {
    id: `world-live-${now}`,
    capturedAt: now,
    location: {
      id: `location-live-${now}`,
      provider: 'WeChat Location + QWeather GeoAPI',
      sourceId: null,
      observedAt: location.capturedAt,
      fetchedAt: now,
      expiresAt: now + 30 * 60 * 1000,
      confidence: location.accuracy <= 100 ? 0.9 : location.accuracy <= 500 ? 0.7 : 0.4,
      isSimulated: false,
      data: {
        country: place.country,
        province: place.province,
        city: place.city,
        district: place.district,
        street: '',
        address: '尚未接入地图详细逆地理编码',
        landmark: place.displayName || '经纬度定位',
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy
      }
    },
    weather: {
      id: `weather-live-${weather.warningId || now}`,
      provider: payload.meta.provider,
      sourceId: weather.warningId,
      observedAt: weather.observedAt,
      fetchedAt: payload.meta.fetchedAt,
      expiresAt: payload.meta.expiresAt,
      confidence: 0.9,
      isSimulated: false,
      data: {
        condition: weather.condition,
        icon: weather.icon,
        temperature: weather.temperature,
        feelsLike: weather.feelsLike,
        humidity: weather.humidity,
        wind: weather.wind,
        precipitation: weather.precipitation,
        warning: weather.warning,
        warningId: weather.warningId,
        sources: weather.sources,
        attributions: weather.attributions
      }
    }
  }
}

export function attachLocalNews(
  snapshot: WorldSnapshot,
  payload: LocalNewsCloudPayload
): WorldSnapshot {
  const observedAt = payload.items.reduce(
    (latest, item) => Math.max(latest, item.publishedAt),
    payload.meta.fetchedAt
  )
  return {
    ...snapshot,
    localNews: {
      id: `local-news-${payload.meta.fetchedAt}`,
      provider: payload.meta.provider,
      sourceId: payload.meta.requestId,
      observedAt,
      fetchedAt: payload.meta.fetchedAt,
      expiresAt: payload.meta.expiresAt,
      confidence: payload.items.length > 0 ? 0.8 : 0.6,
      isSimulated: false,
      data: payload.items
    }
  }
}

export async function syncForegroundWorld(): Promise<WorldSyncResult> {
  const locationResult = await getForegroundLocation()
  if (!locationResult.ok) {
    return {
      ok: false,
      snapshot: null,
      error: locationResult.error,
      localNewsError: null,
      locationPermissionDenied: locationResult.error === 'permission_denied',
      previousSnapshot: null,
      changes: [],
      opportunities: [],
      evidence: []
    }
  }

  const weatherResult = await fetchWeatherSnapshot(
    locationResult.location.longitude,
    locationResult.location.latitude
  )
  if (!weatherResult.ok) {
    return {
      ok: false,
      snapshot: null,
      error: weatherResult.error,
      localNewsError: null,
      locationPermissionDenied: false,
      previousSnapshot: null,
      changes: [],
      opportunities: [],
      evidence: []
    }
  }

  const previousSnapshot = getWorldSnapshot()
  let snapshot = buildLiveSnapshot(locationResult.location, weatherResult.payload)
  const localNewsResult = await fetchLocalNewsSnapshot(
    snapshot.location.data.city,
    snapshot.location.data.district
  )
  let localNewsError: string | null = null
  if (localNewsResult.ok) {
    snapshot = attachLocalNews(snapshot, localNewsResult.payload)
  } else {
    localNewsError = localNewsResult.error
  }
  const changes = detectWorldChanges(previousSnapshot, snapshot)
  const opportunities = opportunitiesFromChanges(changes, snapshot.capturedAt)
  const evidence: EvidenceEnvelope<unknown>[] = [
    previousSnapshot.location,
    previousSnapshot.weather,
    snapshot.location,
    snapshot.weather
  ]
  setWorldSnapshot(snapshot)
  return {
    ok: true,
    snapshot,
    error: null,
    localNewsError,
    locationPermissionDenied: false,
    previousSnapshot,
    changes,
    opportunities,
    evidence
  }
}
