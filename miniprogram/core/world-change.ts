import type { WorldSnapshot } from './types'

export type WorldChange =
  | {
      id: string
      kind: 'city_changed'
      importance: 'high'
      title: string
      description: string
      confidence: number
      evidenceIds: string[]
      detectedAt: number
    }
  | {
      id: string
      kind: 'weather_changed'
      importance: 'medium' | 'high'
      title: string
      description: string
      confidence: number
      evidenceIds: string[]
      detectedAt: number
    }

function usableLocation(snapshot: WorldSnapshot): boolean {
  return (
    !snapshot.location.isSimulated &&
    snapshot.location.expiresAt > snapshot.capturedAt &&
    snapshot.location.confidence >= 0.75 &&
    snapshot.location.data.accuracy <= 100
  )
}

function usableWeather(snapshot: WorldSnapshot): boolean {
  return (
    !snapshot.weather.isSimulated &&
    snapshot.weather.expiresAt > snapshot.capturedAt &&
    snapshot.weather.confidence >= 0.75
  )
}

export function detectWorldChanges(previous: WorldSnapshot, current: WorldSnapshot): WorldChange[] {
  const changes: WorldChange[] = []

  if (usableLocation(previous) && usableLocation(current)) {
    const from = previous.location.data
    const to = current.location.data
    if (from.city && to.city && from.city !== to.city) {
      changes.push({
        id: `city-${previous.id}-${current.id}`,
        kind: 'city_changed',
        importance: 'high',
        title: `从${from.city}到了${to.city}`,
        description: `上次可信位置在${from.city}，当前可信位置在${to.city}`,
        confidence: Math.min(previous.location.confidence, current.location.confidence),
        evidenceIds: [previous.location.id, current.location.id],
        detectedAt: current.capturedAt
      })
    }
  }

  if (usableWeather(previous) && usableWeather(current)) {
    const from = previous.weather.data
    const to = current.weather.data
    const temperatureDelta = Math.abs(to.temperature - from.temperature)
    if (from.condition !== to.condition || temperatureDelta >= 5 || Boolean(to.warning && to.warning !== from.warning)) {
      const high = Boolean(to.warning) || temperatureDelta >= 8
      changes.push({
        id: `weather-${previous.id}-${current.id}`,
        kind: 'weather_changed',
        importance: high ? 'high' : 'medium',
        title: to.warning ? `出现天气预警：${to.warning}` : `天气从${from.condition}变为${to.condition}`,
        description: `温度由${from.temperature}℃变为${to.temperature}℃`,
        confidence: Math.min(previous.weather.confidence, current.weather.confidence),
        evidenceIds: [previous.weather.id, current.weather.id],
        detectedAt: current.capturedAt
      })
    }
  }

  return changes
}
