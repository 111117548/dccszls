import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const localNewsCloud = require('../cloudfunctions/localIntelSnapshot/index.js') as {
  __test: {
    sanitizeArea(value: unknown): string
    contentText(value: unknown, maxLength: number): string
    buildQuery(city: string, district: string): string
    normalizePages(
      pages: unknown[],
      city: string,
      district: string,
      now?: number
    ): Array<{
      title: string
      summary: string
      url: string
      sourceName: string
      publishedAt: number
    }>
  }
}

test('local news query uses only sanitized city and district names', () => {
  assert.equal(localNewsCloud.__test.sanitizeArea('成都市<script>'), '成都市')
  const query = localNewsCloud.__test.buildQuery('成都市', '武侯区')
  assert.match(query, /成都市/)
  assert.match(query, /武侯区/)
  assert.equal(query.includes('104.06'), false)
})

test('local news results require freshness, HTTPS, local relevance and deduplication', () => {
  const now = Date.parse('2026-07-24T08:00:00+08:00')
  const valid = {
    title: '武侯区发布高温防暑提示',
    passage: '<strong>成都市武侯区</strong>提醒市民关注高温天气。',
    date: '2026-07-23 10:00:00',
    url: 'https://example.gov.cn/news/1',
    site: '示例政务网',
    score: 0.91
  }
  const pages = [
    JSON.stringify(valid),
    JSON.stringify({ ...valid, title: '重复链接应删除' }),
    JSON.stringify({ ...valid, url: 'http://example.gov.cn/news/2' }),
    JSON.stringify({
      ...valid,
      title: '其他城市新闻',
      passage: '北京市发布一项通知',
      url: 'https://example.gov.cn/news/3'
    }),
    JSON.stringify({
      ...valid,
      title: '武侯区旧闻',
      date: '2026-06-01 10:00:00',
      url: 'https://example.gov.cn/news/4'
    })
  ]

  const result = localNewsCloud.__test.normalizePages(pages, '成都市', '武侯区', now)
  assert.equal(result.length, 1)
  assert.equal(result[0].title, valid.title)
  assert.equal(result[0].summary.includes('<strong>'), false)
  assert.equal(result[0].sourceName, '示例政务网')
})
