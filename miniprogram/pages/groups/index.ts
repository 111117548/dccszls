import { groupDefinitions } from '../../data/groups'
import { characterById } from '../../data/characters'
import { processWorldOpportunitiesForGroups } from '../../services/background-group-processor'
import { localGroupSummary } from '../../services/group-session-repository'
import { syncForegroundWorld } from '../../services/world-sync'

let lastPassiveSyncAt = 0
let passiveSyncInFlight = false
const PASSIVE_SYNC_COOLDOWN_MS = 15 * 60 * 1000

function updatedAtLabel(timestamp: number): string {
  if (!timestamp) return '可进入'
  const elapsed = Math.max(0, Date.now() - timestamp)
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}分钟前`
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function groupViews() {
  return groupDefinitions.map((group) => {
    const summary = localGroupSummary(group.id)
    return {
      id: group.id,
      name: group.name,
      mode: group.mode,
      modeLabel: group.modeLabel,
      description: group.description,
      latestSpeaker: summary?.latestSpeaker || '群介绍',
      latestMessage: summary?.latestMessage || group.description,
      updatedAt: updatedAtLabel(summary?.updatedAt || 0),
      unreadCount: summary?.unreadCount || 0,
      members: group.memberIds.map((characterId) => ({
        characterId,
        text: characterById[characterId].avatarText,
        className: characterById[characterId].avatarClass
      }))
    }
  })
}

Page({
  data: {
    groups: groupViews()
  },

  onShow() {
    this.setData({ groups: groupViews() })
    void this.refreshPassiveGroups()
  },

  async refreshPassiveGroups() {
    const now = Date.now()
    if (passiveSyncInFlight || now - lastPassiveSyncAt < PASSIVE_SYNC_COOLDOWN_MS) return
    passiveSyncInFlight = true
    lastPassiveSyncAt = now
    try {
      const result = await syncForegroundWorld()
      if (result.ok && result.snapshot && result.opportunities.length) {
        await processWorldOpportunitiesForGroups(
          result.opportunities,
          result.evidence,
          result.snapshot,
          result.snapshot.capturedAt
        )
        this.setData({ groups: groupViews() })
      }
    } finally {
      passiveSyncInFlight = false
    }
  },

  openChat(event: { currentTarget: { dataset: { groupId?: string } } }) {
    const groupId = String(event.currentTarget.dataset.groupId || '')
    if (!groupId) return
    wx.navigateTo({ url: `../chat/index?groupId=${encodeURIComponent(groupId)}` })
  }
})
