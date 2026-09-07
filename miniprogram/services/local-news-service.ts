import type { WorldLocalNewsItem } from '../core/types'

export interface LocalNewsCloudPayload {
  success: true
  items: WorldLocalNewsItem[]
  meta: {
    provider: string
    requestId: string | null
    fetchedAt: number
    expiresAt: number
    scope: 'city' | 'district_and_city'
    queryArea: string
    attribution: string
    cacheHit?: boolean
  }
}

export type LocalNewsResult =
  | { ok: true; payload: LocalNewsCloudPayload }
  | { ok: false; error: string }

function isNewsItem(value: unknown): value is WorldLocalNewsItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<WorldLocalNewsItem>
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    item.title.length > 0 &&
    typeof item.summary === 'string' &&
    typeof item.url === 'string' &&
    item.url.startsWith('https://') &&
    typeof item.sourceName === 'string' &&
    typeof item.publishedAt === 'number' &&
    Number.isFinite(item.publishedAt) &&
    typeof item.relevance === 'number'
  )
}

export function fetchLocalNewsSnapshot(city: string, district: string): Promise<LocalNewsResult> {
  return new Promise((resolve) => {
    if (!wx.cloud) {
      resolve({ ok: false, error: 'cloud_not_available' })
      return
    }
    wx.cloud.callFunction({
      name: 'localIntelSnapshot',
      data: { city, district },
      success(response) {
        const result = response.result as LocalNewsCloudPayload | { success?: false; error?: string } | undefined
        if (
          result?.success &&
          Array.isArray(result.items) &&
          result.items.length <= 5 &&
          result.items.every(isNewsItem)
        ) {
          resolve({ ok: true, payload: result })
        } else {
          resolve({ ok: false, error: result?.error || 'local_news_payload_invalid' })
        }
      },
      fail(error) {
        resolve({ ok: false, error: error.errMsg || 'local_news_cloud_failed' })
      }
    })
  })
}

export function localNewsErrorMessage(error: string | null): string {
  const message = error || ''
  if (message === 'local_news_service_not_configured') return '本地资讯待配置腾讯云联网搜索 API KEY'
  if (message === 'local_news_area_missing') return '当前城市或区县信息不足，无法查询本地资讯'
  if (/function.*not.*found|functionname|找不到.*函数|-501000/i.test(message)) {
    return '当前云环境中找不到 localIntelSnapshot，请先上传并部署云函数'
  }
  if (/UnauthorizedOperation|401|403/i.test(message)) return '腾讯云联网搜索 API KEY 无效或服务未开通'
  if (/ResourceNotFound|ResourceUnavailable/i.test(message)) return '腾讯云联网搜索服务未开通、欠费或不可用'
  if (/timeout/i.test(message)) return '本地资讯服务请求超时，请稍后重试'
  return message ? `本地资讯同步失败：${message}` : '本地资讯同步失败'
}
