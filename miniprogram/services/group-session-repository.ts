import type { ChatMessage, GroupModeState, GroupState, TopicState } from '../core/types'
import { safeImageAttachment, safeVisualEvidence } from '../core/visual-evidence'

const STORAGE_PREFIX = 'wchat.groupSession.v1.'
const MAX_LOCAL_MESSAGES = 100

export interface GroupSessionSnapshot {
  groupId: string
  state: GroupState | null
  messages: ChatMessage[]
  unreadCount: number
  updatedAt: number
  lastReadAt: number
  source: 'cloud' | 'local' | 'empty'
}

export interface GroupLocalSummary {
  latestSpeaker: string
  latestMessage: string
  updatedAt: number
  unreadCount: number
}

interface CloudResult {
  success?: boolean
  error?: string
  groupId?: string
  state?: unknown
  messages?: unknown
  unreadCount?: number
  updatedAt?: number
  lastReadAt?: number
}

function storageKey(groupId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(groupId)}`
}

function finiteTimestamp(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function safeTopic(value: unknown): TopicState | null {
  if (!value || typeof value !== 'object') return null
  const topic = value as Partial<TopicState>
  if (
    typeof topic.id !== 'string' ||
    typeof topic.title !== 'string' ||
    typeof topic.type !== 'string' ||
    typeof topic.source !== 'string' ||
    typeof topic.stage !== 'string'
  ) {
    return null
  }
  return {
    id: topic.id,
    title: topic.title,
    type: topic.type as TopicState['type'],
    source: topic.source as TopicState['source'],
    energy: Math.max(0, Math.min(100, Number(topic.energy) || 0)),
    stage: topic.stage as TopicState['stage'],
    messageCount: Math.max(0, Number(topic.messageCount) || 0),
    createdAt: finiteTimestamp(topic.createdAt),
    lastActiveAt: finiteTimestamp(topic.lastActiveAt),
    lockedByUser: topic.lockedByUser === true
  }
}

function safeModeState(value: unknown): GroupModeState {
  const state = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (state.kind === 'discussion') {
    const phase =
      state.phase === 'OPEN' ||
      state.phase === 'EXPLORE' ||
      state.phase === 'COMPARE' ||
      state.phase === 'SYNTHESIZE'
        ? state.phase
        : 'OPEN'
    return {
      kind: 'discussion',
      phase,
      turnCount: Math.max(0, Number(state.turnCount) || 0),
      question: typeof state.question === 'string' ? state.question : null,
      perspectives: Array.isArray(state.perspectives)
        ? state.perspectives.filter((item): item is string => typeof item === 'string').slice(0, 8)
        : []
    }
  }
  if (state.kind === 'crossover_salon') {
    return {
      kind: 'crossover_salon',
      scene: typeof state.scene === 'string' ? state.scene : '漫展中立会客区',
      collisionCount: Math.max(0, Number(state.collisionCount) || 0),
      lastContrast: typeof state.lastContrast === 'string' ? state.lastContrast : null,
      lastAutonomousAt: state.lastAutonomousAt == null ? null : finiteTimestamp(state.lastAutonomousAt)
    }
  }
  if (state.kind === 'story') {
    return {
      kind: 'story',
      storyId: typeof state.storyId === 'string' ? state.storyId : 'mist-harbor-letter',
      chapter: Math.max(1, Number(state.chapter) || 1),
      turnCount: Math.max(0, Number(state.turnCount) || 0),
      scene: typeof state.scene === 'string' ? state.scene : '雾港临时联络群',
      objective:
        typeof state.objective === 'string' ? state.objective : '查清匿名来信与旧钟楼的关系',
      clues: Array.isArray(state.clues)
        ? state.clues.filter((item): item is string => typeof item === 'string').slice(0, 30)
        : [],
      userRole: typeof state.userRole === 'string' ? state.userRole : '刚抵达雾港的收信人',
      lastAutonomousAt: state.lastAutonomousAt == null ? null : finiteTimestamp(state.lastAutonomousAt)
    }
  }
  return {
    kind: 'companion',
    sharedMoments: Math.max(0, Number(state.sharedMoments) || 0)
  }
}

function safeState(value: unknown): GroupState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<GroupState>
  if (typeof state.mood !== 'string') return null
  return {
    mood: state.mood as GroupState['mood'],
    currentTopic: safeTopic(state.currentTopic),
    currentFocus: typeof state.currentFocus === 'string' ? state.currentFocus : null,
    currentOpportunityId: typeof state.currentOpportunityId === 'string' ? state.currentOpportunityId : null,
    silenceUntil: state.silenceUntil == null ? null : finiteTimestamp(state.silenceUntil),
    lastMessageTime: finiteTimestamp(state.lastMessageTime),
    consecutiveAiMessages: Math.max(0, Math.min(3, Number(state.consecutiveAiMessages) || 0)),
    unreadCount: Math.max(0, Math.min(30, Number(state.unreadCount) || 0)),
    lastSpeakerId: typeof state.lastSpeakerId === 'string' ? state.lastSpeakerId : null,
    cooldowns: state.cooldowns && typeof state.cooldowns === 'object' ? { ...state.cooldowns } : {},
    seenOpportunityIds: Array.isArray(state.seenOpportunityIds)
      ? state.seenOpportunityIds.filter((item): item is string => typeof item === 'string').slice(-100)
      : [],
    modeState: safeModeState(state.modeState)
  }
}

function safeMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Partial<ChatMessage>
  if (
    typeof message.id !== 'string' ||
    !message.id ||
    typeof message.text !== 'string' ||
    !message.text ||
    (message.senderType !== 'user' && message.senderType !== 'ai' && message.senderType !== 'system')
  ) {
    return null
  }
  if (message.senderType === 'ai' && typeof message.speakerId !== 'string') return null
  const image = message.senderType === 'user' ? safeImageAttachment(message.image) : null
  const visualEvidence = image ? safeVisualEvidence(message.visualEvidence) : null
  return {
    id: message.id,
    senderType: message.senderType,
    speakerId: message.senderType === 'ai' ? message.speakerId || null : null,
    speakerName: typeof message.speakerName === 'string' ? message.speakerName : '',
    text: message.text,
    createdAt: finiteTimestamp(message.createdAt),
    timeLabel: typeof message.timeLabel === 'string' ? message.timeLabel : '',
    topicId: typeof message.topicId === 'string' ? message.topicId : null,
    replyToMessageId: typeof message.replyToMessageId === 'string' ? message.replyToMessageId : null,
    isAiGenerated: message.isAiGenerated === true,
    motive: message.motive ?? null,
    delayProfile: message.delayProfile,
    required: message.required === true,
    storyId: typeof message.storyId === 'string' ? message.storyId : null,
    turnId: typeof message.turnId === 'string' ? message.turnId : null,
    bubbleIndex: Number(message.bubbleIndex) || 0,
    trigger:
      message.trigger === 'user' ||
      message.trigger === 'world' ||
      message.trigger === 'continuation' ||
      message.trigger === 'autonomous'
        ? message.trigger
        : message.trigger === 'image'
          ? 'image'
          : undefined,
    contentType: image ? (message.contentType === 'mixed' ? 'mixed' : 'image') : 'text',
    image,
    visualEvidence
  }
}

function safeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  const byId = new Map<string, ChatMessage>()
  for (const item of value) {
    const message = safeMessage(item)
    if (message) byId.set(message.id, message)
  }
  return [...byId.values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_LOCAL_MESSAGES)
}

function emptySession(groupId: string): GroupSessionSnapshot {
  return {
    groupId,
    state: null,
    messages: [],
    unreadCount: 0,
    updatedAt: 0,
    lastReadAt: 0,
    source: 'empty'
  }
}

function writeLocalSession(snapshot: GroupSessionSnapshot): void {
  try {
    wx.setStorageSync(storageKey(snapshot.groupId), {
      groupId: snapshot.groupId,
      state: snapshot.state,
      messages: snapshot.messages.slice(-MAX_LOCAL_MESSAGES),
      unreadCount: snapshot.unreadCount,
      updatedAt: snapshot.updatedAt,
      lastReadAt: snapshot.lastReadAt
    })
  } catch {
    // Local storage is a resilience layer; failure must not block chat.
  }
}

export function loadLocalGroupSession(groupId: string): GroupSessionSnapshot {
  try {
    const value = wx.getStorageSync(storageKey(groupId))
    if (!value || typeof value !== 'object') return emptySession(groupId)
    const stored = value as Partial<GroupSessionSnapshot>
    return {
      groupId,
      state: safeState(stored.state),
      messages: safeMessages(stored.messages),
      unreadCount: Math.max(0, Math.min(30, Number(stored.unreadCount) || 0)),
      updatedAt: finiteTimestamp(stored.updatedAt),
      lastReadAt: finiteTimestamp(stored.lastReadAt),
      source: 'local'
    }
  } catch {
    return emptySession(groupId)
  }
}

function callCloud(data: Record<string, unknown>): Promise<CloudResult> {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('cloud_unavailable'))
      return
    }
    wx.cloud.callFunction({
      name: 'groupPersistence',
      data,
      success(result) {
        const payload = result.result as CloudResult | undefined
        if (!payload?.success) {
          reject(new Error(payload?.error || 'group_persistence_failed'))
          return
        }
        resolve(payload)
      },
      fail(error) {
        reject(new Error(error.errMsg || 'group_persistence_failed'))
      }
    })
  })
}

function cloudSnapshot(groupId: string, payload: CloudResult): GroupSessionSnapshot {
  return {
    groupId,
    state: safeState(payload.state),
    messages: safeMessages(payload.messages),
    unreadCount: Math.max(0, Math.min(30, Number(payload.unreadCount) || 0)),
    updatedAt: finiteTimestamp(payload.updatedAt),
    lastReadAt: finiteTimestamp(payload.lastReadAt),
    source: 'cloud'
  }
}

async function uploadLocalSession(snapshot: GroupSessionSnapshot): Promise<void> {
  if (!snapshot.messages.length) return
  for (let index = 0; index < snapshot.messages.length; index += 10) {
    await callCloud({
      action: 'append',
      groupId: snapshot.groupId,
      messages: snapshot.messages.slice(index, index + 10),
      state: snapshot.state,
      visible: true
    })
  }
}

export async function loadGroupSession(groupId: string): Promise<GroupSessionSnapshot> {
  const local = loadLocalGroupSession(groupId)
  try {
    const remote = cloudSnapshot(groupId, await callCloud({ action: 'load', groupId }))
    if (local.updatedAt > remote.updatedAt && local.messages.length) {
      await uploadLocalSession(local)
      return local
    }
    writeLocalSession(remote)
    return remote
  } catch {
    return local
  }
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  return safeMessages([...current, ...incoming])
}

export async function persistGroupMessages(
  groupId: string,
  messages: ChatMessage[],
  state: GroupState,
  visible = true
): Promise<{ cloudSynced: boolean }> {
  const now = Date.now()
  const local = loadLocalGroupSession(groupId)
  const next: GroupSessionSnapshot = {
    groupId,
    state: safeState(state),
    messages: mergeMessages(local.messages, messages),
    unreadCount: visible ? 0 : Math.min(30, local.unreadCount + messages.filter((item) => item.senderType === 'ai').length),
    updatedAt: now,
    lastReadAt: visible ? now : local.lastReadAt,
    source: 'local'
  }
  writeLocalSession(next)
  try {
    await callCloud({
      action: 'append',
      groupId,
      messages: safeMessages(messages).slice(0, 10),
      state: next.state,
      visible
    })
    return { cloudSynced: true }
  } catch {
    return { cloudSynced: false }
  }
}

export async function markGroupRead(groupId: string): Promise<void> {
  const local = loadLocalGroupSession(groupId)
  const now = Date.now()
  writeLocalSession({ ...local, unreadCount: 0, lastReadAt: now })
  try {
    await callCloud({ action: 'markRead', groupId })
  } catch {
    // The local read marker is enough until the next cloud synchronization.
  }
}

export function localGroupSummary(groupId: string): GroupLocalSummary | null {
  const local = loadLocalGroupSession(groupId)
  const latest = local.messages[local.messages.length - 1]
  if (!latest) return null
  return {
    latestSpeaker: latest.senderType === 'user' ? '我' : latest.speakerName,
    latestMessage: latest.text,
    updatedAt: latest.createdAt || local.updatedAt,
    unreadCount: local.unreadCount
  }
}
