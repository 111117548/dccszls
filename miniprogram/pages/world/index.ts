import { mockWorld } from '../../mock/world'
import type { WorldLocalNewsItem, WorldSnapshot } from '../../core/types'
import { localNewsErrorMessage } from '../../services/local-news-service'
import { getWorldSnapshot } from '../../services/world-store'
import { syncForegroundWorld, worldSyncErrorMessage } from '../../services/world-sync'

interface WorldLocalNewsView extends WorldLocalNewsItem {
  publishedLabel: string
}

function dateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

Page({
  data: {
    location: mockWorld.location.data,
    weather: mockWorld.weather.data,
    updatedAt: dateTime(mockWorld.capturedAt),
    locationExpiresAt: dateTime(mockWorld.location.expiresAt),
    weatherExpiresAt: dateTime(mockWorld.weather.expiresAt),
    localNews: [] as WorldLocalNewsView[],
    newsStatus: '尚未同步真实本地资讯',
    newsUpdatedAt: '—',
    newsExpiresAt: '—',
    newsProvider: '未配置',
    provider: mockWorld.location.provider,
    isSimulated: mockWorld.location.isSimulated,
    loading: false,
    autoSyncStarted: false,
    syncStatus: '尚未同步真实世界状态',
    permissionDenied: false,
    attributions: mockWorld.weather.data.attributions
  },

  onLoad() {
    this.applySnapshot(getWorldSnapshot())
  },

  onShow() {
    if (!this.data.autoSyncStarted && getWorldSnapshot().location.isSimulated) {
      this.setData({ autoSyncStarted: true })
      void this.refreshWorld()
    }
  },

  applySnapshot(snapshot: WorldSnapshot) {
    const localNews = snapshot.localNews
    this.setData({
      location: snapshot.location.data,
      weather: snapshot.weather.data,
      updatedAt: dateTime(snapshot.capturedAt),
      locationExpiresAt: dateTime(snapshot.location.expiresAt),
      weatherExpiresAt: dateTime(snapshot.weather.expiresAt),
      localNews:
        localNews?.data.map((item) => ({
          ...item,
          publishedLabel: dateTime(item.publishedAt)
        })) || [],
      newsStatus: localNews
        ? localNews.data.length > 0
          ? `已找到 ${localNews.data.length} 条近 7 日本地资讯`
          : '当前没有检索到可核验的近 7 日本地资讯'
        : '本地资讯尚未同步',
      newsUpdatedAt: localNews ? dateTime(localNews.fetchedAt) : '—',
      newsExpiresAt: localNews ? dateTime(localNews.expiresAt) : '—',
      newsProvider: localNews?.provider || '未配置',
      provider: `${snapshot.location.provider} / ${snapshot.weather.provider}`,
      isSimulated: snapshot.location.isSimulated || snapshot.weather.isSimulated,
      attributions: snapshot.weather.data.attributions,
      syncStatus: snapshot.location.isSimulated ? '当前仍为模拟数据' : '真实前台位置与天气已同步',
      permissionDenied: false
    })
  },

  async refreshWorld() {
    if (this.data.loading) return
    this.setData({ loading: true, syncStatus: '正在获取前台位置和天气…' })
    const result = await syncForegroundWorld()
    if (result.ok && result.snapshot) {
      this.applySnapshot(result.snapshot)
      if (result.localNewsError) {
        this.setData({ newsStatus: localNewsErrorMessage(result.localNewsError) })
      }
      wx.showToast({ title: '世界状态已更新', icon: 'success' })
    } else {
      this.setData({
        syncStatus: result.locationPermissionDenied
          ? '定位权限未开启，继续显示原有数据'
          : worldSyncErrorMessage(result.error),
        permissionDenied: result.locationPermissionDenied
      })
      wx.showToast({ title: '同步失败，已安全降级', icon: 'none' })
    }
    this.setData({ loading: false })
  },

  openPermissions() {
    wx.openSetting()
  },

  copyNewsLink(event: WechatMiniprogram.BaseEvent) {
    const url = String(event.currentTarget.dataset.url || '')
    if (!url.startsWith('https://')) return
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: '原文链接已复制', icon: 'none' })
      }
    })
  }
})
