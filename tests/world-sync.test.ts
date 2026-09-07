import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  attachLocalNews,
  buildLiveSnapshot,
  worldSyncErrorMessage
} from '../miniprogram/services/world-sync.ts'
import type { ForegroundLocation } from '../miniprogram/services/location-service.ts'
import type { WeatherCloudPayload } from '../miniprogram/services/weather-service.ts'

const require = createRequire(import.meta.url)
const weatherCloud = require('../cloudfunctions/weatherSnapshot/index.js') as {
  __test: {
    isValidApiHost(host: string): boolean
    validateCoordinates(longitude: number, latitude: number): boolean
    cacheKey(longitude: number, latitude: number): string
  }
}

test('weather cloud only accepts dedicated QWeather API hosts', () => {
  assert.equal(weatherCloud.__test.isValidApiHost('abc123.re.qweatherapi.com'), true)
  assert.equal(weatherCloud.__test.isValidApiHost('example.com'), false)
  assert.equal(weatherCloud.__test.isValidApiHost('qweatherapi.com.attacker.test'), false)
})

test('weather cloud rejects invalid coordinates and rounds cache cells', () => {
  assert.equal(weatherCloud.__test.validateCoordinates(121.47, 31.23), true)
  assert.equal(weatherCloud.__test.validateCoordinates(999, 31.23), false)
  assert.equal(weatherCloud.__test.cacheKey(121.4749, 31.2349), '121.47,31.23')
})

test('live payload becomes evidence-backed world snapshot', () => {
  const location: ForegroundLocation = {
    longitude: 121.47,
    latitude: 31.23,
    accuracy: 35,
    coordinateType: 'gcj02',
    capturedAt: 1000
  }
  const payload: WeatherCloudPayload = {
    success: true,
    location: {
      country: '中国',
      province: '上海市',
      city: '上海市',
      district: '黄浦区',
      displayName: '黄浦区',
      longitude: 121.47,
      latitude: 31.23,
      scope: 'city'
    },
    weather: {
      condition: '多云',
      icon: '101',
      temperature: 28,
      feelsLike: 30,
      humidity: 70,
      wind: '东南风 2级',
      precipitation: 0,
      warning: null,
      warningId: null,
      sources: ['QWeather'],
      attributions: ['QWeather Developers License'],
      observedAt: 900
    },
    meta: {
      provider: 'QWeather',
      fetchedAt: 1100,
      expiresAt: 6100,
      coordinatePrecision: '0.01_degree'
    }
  }

  const snapshot = buildLiveSnapshot(location, payload, 1200)
  assert.equal(snapshot.location.isSimulated, false)
  assert.equal(snapshot.weather.isSimulated, false)
  assert.equal(snapshot.location.data.accuracy, 35)
  assert.deepEqual(snapshot.weather.data.sources, ['QWeather'])
  assert.equal(snapshot.weather.observedAt, 900)
})

test('world sync failures explain the missing real-data dependency', () => {
  assert.equal(
    worldSyncErrorMessage('weather_service_not_configured'),
    '云端 weatherSnapshot 尚未配置和风天气环境变量'
  )
  assert.equal(
    worldSyncErrorMessage('cloud.callFunction:fail function not found'),
    '当前云环境中找不到 weatherSnapshot，请先上传并部署云函数'
  )
})

test('local news is attached as optional evidence without replacing weather', () => {
  const snapshot = attachLocalNews(structuredClone(mockLiveSnapshot()), {
    success: true,
    items: [
      {
        id: 'news-1',
        title: '武侯区发布一项通知',
        summary: '通知摘要',
        url: 'https://example.gov.cn/news/1',
        sourceName: '示例政务网',
        publishedAt: 2000,
        relevance: 0.9
      }
    ],
    meta: {
      provider: 'Tencent Cloud WSA',
      requestId: 'request-1',
      fetchedAt: 2100,
      expiresAt: 3100,
      scope: 'district_and_city',
      queryArea: '武侯区',
      attribution: 'test'
    }
  })
  assert.equal(snapshot.localNews?.isSimulated, false)
  assert.equal(snapshot.localNews?.data[0].title, '武侯区发布一项通知')
  assert.equal(snapshot.weather.data.condition, '多云')
})

function mockLiveSnapshot() {
  const location: ForegroundLocation = {
    longitude: 104.06,
    latitude: 30.57,
    accuracy: 30,
    coordinateType: 'gcj02',
    capturedAt: 1000
  }
  const payload: WeatherCloudPayload = {
    success: true,
    location: {
      country: '中国',
      province: '四川省',
      city: '成都市',
      district: '武侯区',
      displayName: '武侯区',
      longitude: 104.06,
      latitude: 30.57,
      scope: 'city'
    },
    weather: {
      condition: '多云',
      icon: '101',
      temperature: 28,
      feelsLike: 30,
      humidity: 70,
      wind: '东南风 2级',
      precipitation: 0,
      warning: null,
      warningId: null,
      sources: ['QWeather'],
      attributions: ['QWeather Developers License'],
      observedAt: 900
    },
    meta: {
      provider: 'QWeather',
      fetchedAt: 1100,
      expiresAt: 6100,
      coordinatePrecision: '0.01_degree'
    }
  }
  return buildLiveSnapshot(location, payload, 1200)
}
