export interface WeatherCloudPayload {
  success: true
  location: {
    country: string
    province: string
    city: string
    district: string
    displayName: string
    longitude: number
    latitude: number
    scope: 'city'
  }
  weather: {
    condition: string
    icon: string
    temperature: number
    feelsLike: number
    humidity: number
    wind: string
    precipitation: number
    warning: string | null
    warningId: string | null
    sources: string[]
    attributions: string[]
    observedAt: number
  }
  meta: {
    provider: string
    fetchedAt: number
    expiresAt: number
    coordinatePrecision: string
    cacheHit?: boolean
  }
}

export type WeatherResult =
  | { ok: true; payload: WeatherCloudPayload }
  | { ok: false; error: string }

export function fetchWeatherSnapshot(longitude: number, latitude: number): Promise<WeatherResult> {
  return new Promise((resolve) => {
    if (!wx.cloud) {
      resolve({ ok: false, error: 'cloud_not_available' })
      return
    }
    wx.cloud.callFunction({
      name: 'weatherSnapshot',
      data: { longitude, latitude },
      success(response) {
        const result = response.result as WeatherCloudPayload | { success?: false; error?: string } | undefined
        if (result?.success) resolve({ ok: true, payload: result })
        else resolve({ ok: false, error: result?.error || 'weather_cloud_failed' })
      },
      fail(error) {
        resolve({ ok: false, error: error.errMsg || 'weather_cloud_failed' })
      }
    })
  })
}
