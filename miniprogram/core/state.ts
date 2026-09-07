import type { GroupState } from './types'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function createInitialGroupState(now = Date.now()): GroupState {
  return {
    mood: '平静',
    currentTopic: null,
    currentFocus: null,
    currentOpportunityId: null,
    silenceUntil: null,
    lastMessageTime: now,
    consecutiveAiMessages: 0,
    unreadCount: 0,
    lastSpeakerId: null,
    cooldowns: {},
    seenOpportunityIds: [],
    modeState: {
      kind: 'companion',
      sharedMoments: 0
    }
  }
}
