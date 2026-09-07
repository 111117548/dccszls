import type { WorldSnapshot } from '../core/types'

const now = Date.now()

export const mockWorld: WorldSnapshot = {
  id: 'world-demo-shanghai',
  capturedAt: now,
  location: {
    id: 'evidence-location-demo',
    provider: '本地原型数据',
    sourceId: 'mock-location-001',
    observedAt: now,
    fetchedAt: now,
    expiresAt: now + 60 * 60 * 1000,
    confidence: 0.99,
    isSimulated: true,
    data: {
      country: '中国',
      province: '上海市',
      city: '上海市',
      district: '浦东新区',
      street: '川沙新镇',
      address: '阶段 1 模拟地址',
      landmark: '模拟地点（非真实定位）',
      latitude: 31.1434,
      longitude: 121.657,
      accuracy: 20
    }
  },
  weather: {
    id: 'evidence-weather-demo',
    provider: '本地原型数据',
    sourceId: 'mock-weather-001',
    observedAt: now,
    fetchedAt: now,
    expiresAt: now + 30 * 60 * 1000,
    confidence: 0.99,
    isSimulated: true,
    data: {
      condition: '多云',
      icon: '101',
      temperature: 27,
      feelsLike: 29,
      humidity: 68,
      wind: '东南风 2 级',
      precipitation: 0,
      warning: null,
      warningId: null,
      sources: ['本地原型数据'],
      attributions: ['模拟数据，不代表真实天气']
    }
  }
}
