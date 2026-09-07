export interface ForegroundLocation {
  longitude: number
  latitude: number
  accuracy: number
  coordinateType: 'gcj02'
  capturedAt: number
}

export type LocationResult =
  | { ok: true; location: ForegroundLocation }
  | { ok: false; error: 'permission_denied' | 'location_failed'; detail: string }

function normalizeError(message = ''): LocationResult {
  const denied = /auth deny|auth denied|permission|authorize/i.test(message)
  return {
    ok: false,
    error: denied ? 'permission_denied' : 'location_failed',
    detail: message || '无法获取前台位置'
  }
}

export function getForegroundLocation(): Promise<LocationResult> {
  return new Promise((resolve) => {
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 4000,
      success(result) {
        const accuracy = Number(result.horizontalAccuracy || result.accuracy || 9999)
        resolve({
          ok: true,
          location: {
            longitude: result.longitude,
            latitude: result.latitude,
            accuracy,
            coordinateType: 'gcj02',
            capturedAt: Date.now()
          }
        })
      },
      fail(error) {
        resolve(normalizeError(error.errMsg))
      }
    })
  })
}
