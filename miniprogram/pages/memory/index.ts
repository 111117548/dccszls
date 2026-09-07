import { DEFAULT_GROUP_ID, getGroupDefinition } from '../../data/groups'
import {
  clearUserMemories,
  relevantUserMemories,
  syncUserMemoriesFromCloud
} from '../../services/memory-store'

function dateLabel(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function kindLabel(kind: string): string {
  if (kind === 'preference') return '喜欢'
  if (kind === 'dislike') return '不喜欢'
  if (kind === 'plan') return '近期计划'
  return '当时感受'
}

let activeGroupId = DEFAULT_GROUP_ID

Page({
  data: {
    groupName: '',
    memories: [] as Array<Record<string, unknown>>,
    loading: true
  },

  onLoad(query: Record<string, string | undefined>) {
    activeGroupId = getGroupDefinition(query?.groupId).id
    this.setData({ groupName: getGroupDefinition(activeGroupId).name })
    void this.refreshMemories()
  },

  onShow() {
    if (!this.data.loading) this.applyMemories()
  },

  applyMemories() {
    this.setData({
      memories: relevantUserMemories(activeGroupId, Date.now(), 50).map((memory) => ({
        ...memory,
        kindLabel: kindLabel(memory.kind),
        tierLabel: memory.tier === 'long_term' ? '长期记忆' : '短期记忆',
        updatedLabel: dateLabel(memory.updatedAt)
      })),
      loading: false
    })
  },

  async refreshMemories() {
    await syncUserMemoriesFromCloud(activeGroupId)
    this.applyMemories()
  },

  clearMemories() {
    wx.showModal({
      title: '清除群记忆',
      content: '将删除这个群保存的偏好、计划和短期情绪记忆，聊天消息不会被删除。',
      confirmText: '清除',
      confirmColor: '#d14343',
      success: (result) => {
        if (!result.confirm) return
        void clearUserMemories(activeGroupId).then(() => {
          this.applyMemories()
          wx.showToast({ title: '记忆已清除', icon: 'success' })
        })
      }
    })
  }
})
