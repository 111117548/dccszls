import {
  makeOpportunityReplies,
  makePrototypeReplies,
  makeTopicContinuationReplies
} from '../../core/conversation'
import {
  directAutonomousStory,
  directOpportunity,
  directRecordedOpportunity,
  directTopicContinuation
} from '../../core/director'
import { GroupRuntime } from '../../core/group-runtime'
import { checkActiveMessageBudget } from '../../core/message-budget'
import { playbackDelay } from '../../core/rhythm'
import {
  makeVisualFallbackReplies,
  makeVisualUnavailableReplies
} from '../../core/visual-conversation'
import type { GroupDefinition } from '../../core/group-contract'
import type { CharacterId, ChatMessage, EvidenceEnvelope, Opportunity } from '../../core/types'
import { unlockIfInactive } from '../../core/topic-engine'
import { autonomousStoryFor, characterById } from '../../data/characters'
import { DEFAULT_GROUP_ID, getGroupDefinition } from '../../data/groups'
import { mockWorld } from '../../mock/world'
import { createGroupRuntime } from '../../modes/registry'
import {
  generateAutonomousReplies,
  generateContinuationReplies,
  generateGroupReplies,
  generateModeAutonomousReplies,
  groupChatErrorMessage,
  type ModelGroupReply
} from '../../services/group-chat-service'
import {
  autonomousRoundWaitMs,
  canStartAutonomousRound,
  markAutonomousRoundStarted,
  markStoryMentioned,
  recentStoryIds
} from '../../services/story-ledger'
import {
  loadLocalGroupSession,
  loadGroupSession,
  markGroupRead,
  persistGroupMessages
} from '../../services/group-session-repository'
import {
  markGroupEventConsumed,
  opportunityFromEvent,
  pendingGroupEvents,
  recordWorldOpportunities,
  syncGroupEventsFromCloud
} from '../../services/event-ledger'
import {
  recordUserMemories,
  relevantUserMemories,
  syncUserMemoriesFromCloud
} from '../../services/memory-store'
import {
  analyzeUploadedImage,
  discardPreparedImage,
  imageMessageError,
  selectAndUploadImage,
  type ImageMessageStage
} from '../../services/image-message-service'
import { getWorldSnapshot, isLiveWorld } from '../../services/world-store'
import { syncForegroundWorld, worldSyncErrorMessage } from '../../services/world-sync'

interface ViewMessage extends ChatMessage {
  avatarText: string
  avatarClass: string
  imageUrl: string
  hasVisibleText: boolean
}

const runtimes = new Map<string, GroupRuntime>()
let activeGroup = getGroupDefinition(DEFAULT_GROUP_ID)
let engine = runtimeForGroup(activeGroup.id)
let autoWorldSyncAttempted = false
let activeRoundToken = 0
let activeImageToken = 0
let playbackTimer: ReturnType<typeof setTimeout> | null = null
let autonomousTimer: ReturnType<typeof setTimeout> | null = null
let pageVisible = false
let lastUserMessageAt = 0
let lastContinuedUserMessageAt = 0
let persistenceQueue: Promise<unknown> = Promise.resolve()
let activeEventId: string | null = null

const CONTINUATION_DELAY_MS = 9_000
const AUTONOMOUS_IDLE_MS = 45_000
const MODE_AUTONOMOUS_IDLE_MS = 60_000
const MODE_AUTONOMOUS_COOLDOWN_MS = 20 * 60_000
const IMAGE_STAGE_LABELS: Record<ImageMessageStage, string> = {
  selecting: '请选择一张图片',
  compressing: '正在压缩图片',
  uploading: '正在上传图片',
  registering: '正在登记图片',
  checking: '正在进行图片安全检查',
  analyzing: '正在识别图片内容'
}

function lastModeAutonomousAt(): number | null {
  const modeState = engine.getState().modeState
  if (modeState.kind === 'crossover_salon' || modeState.kind === 'story') {
    return modeState.lastAutonomousAt
  }
  return null
}

function runtimeForGroup(groupId: string): GroupRuntime {
  const existing = runtimes.get(groupId)
  if (existing) return existing
  const runtime = createGroupRuntime(groupId, mockWorld)
  runtimes.set(runtime.getDefinition().id, runtime)
  return runtime
}

function activeCharacterIds(): CharacterId[] {
  return [...activeGroup.memberIds]
}

function queueVisiblePersistence(messages: ChatMessage[]): void {
  const groupId = activeGroup.id
  const state = engine.getState()
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(() => persistGroupMessages(groupId, messages, state, true))
}

function queueBackgroundPersistence(
  groupId: string,
  messages: ChatMessage[],
  state: ReturnType<GroupRuntime['getState']>
): void {
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(() => persistGroupMessages(groupId, messages, state, false))
}

function proactiveMessageTimestamps(messages: ViewMessage[]): number[] {
  return messages
    .filter(
      (message) =>
        message.senderType === 'ai' &&
        (message.trigger === 'world' || message.trigger === 'autonomous')
    )
    .map((message) => message.createdAt)
}

function modeStatus(state: ReturnType<GroupRuntime['getState']>): string {
  if (state.modeState.kind === 'discussion') {
    const labels = {
      OPEN: '准备问题',
      EXPLORE: '拆解问题',
      COMPARE: '比较视角',
      SYNTHESIZE: '形成结论'
    }
    return labels[state.modeState.phase]
  }
  if (state.modeState.kind === 'crossover_salon') {
    return `身份碰撞 ${state.modeState.collisionCount}`
  }
  if (state.modeState.kind === 'story') {
    return `第${state.modeState.chapter}章 · 线索${state.modeState.clues.length}条`
  }
  return `共同片段 ${state.modeState.sharedMoments}`
}

function stateMatchesGroup(state: ReturnType<GroupRuntime['getState']>, group: GroupDefinition): boolean {
  return state.modeState.kind === group.mode
}

function viewMessage(message: ChatMessage): ViewMessage {
  const character = message.speakerId ? characterById[message.speakerId] : null
  return {
    ...message,
    avatarText: character?.avatarText ?? '我',
    avatarClass: character?.avatarClass ?? 'avatar-user',
    imageUrl: message.image?.fileId || '',
    hasVisibleText: message.contentType !== 'image' && Boolean(message.text.trim())
  }
}

function safeViewMessages(value: unknown): ViewMessage[] {
  return Array.isArray(value) ? (value as ViewMessage[]) : []
}

function timeLabel(now: number): string {
  const date = new Date(now)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function modelReplyMessages(
  replies: ModelGroupReply[],
  topicId: string | null,
  firstReplyToMessageId: string | null,
  now = Date.now(),
  trigger: ChatMessage['trigger'] = 'user'
): ViewMessage[] {
  let previousId = firstReplyToMessageId
  return replies.slice(0, 3).map((reply, index) => {
    const profile = characterById[reply.speakerId]
    const id = `model-${now}-${index}`
    const message = viewMessage({
      id,
      senderType: 'ai',
      speakerId: reply.speakerId,
      speakerName: profile.name,
      text: reply.text,
      createdAt: now + index * 1000,
      timeLabel: timeLabel(now + index * 1000),
      topicId,
      replyToMessageId: previousId,
      isAiGenerated: true,
      motive: reply.motive,
      delayProfile: reply.delayProfile,
      required: reply.required,
      storyId: reply.storyId,
      turnId: `${id}-${reply.turnId}`,
      bubbleIndex: reply.bubbleIndex,
      trigger
    })
    previousId = id
    return message
  })
}

function initialMessagesFor(group: GroupDefinition, openedAt = Date.now()): ViewMessage[] {
  const welcomeCharacter = characterById[group.welcome.speakerId]
  return [
    viewMessage({
    id: 'system-ai-disclosure',
    senderType: 'system',
    speakerId: null,
    speakerName: '系统',
    text: group.disclosure,
    createdAt: openedAt,
    timeLabel: '',
    topicId: 'system',
    replyToMessageId: null,
    isAiGenerated: false
  }),
    viewMessage({
    id: 'welcome-ning',
    senderType: 'ai',
    speakerId: group.welcome.speakerId,
    speakerName: welcomeCharacter.name,
    text: group.welcome.text,
    createdAt: openedAt + 1,
    timeLabel: '现在',
    topicId: 'welcome',
    replyToMessageId: null,
    isAiGenerated: true,
    motive: 'acknowledge',
    delayProfile: 'normal',
    required: true,
    storyId: null,
    turnId: 'welcome',
    bubbleIndex: 0
  })
  ]
}

Page({
  data: {
    groupId: activeGroup.id,
    groupName: activeGroup.name,
    memberCount: activeGroup.memberIds.length + 1,
    groupMode: activeGroup.mode,
    modeLabel: activeGroup.modeLabel,
    modeStatus: modeStatus(engine.getState()),
    memoryCount: 0,
    imageBusy: false,
    sessionReady: false,
    inputValue: '',
    messages: initialMessagesFor(activeGroup),
    typing: false,
    typingName: '',
    scrollTarget: 'msg-1',
    topicTitle: '等待你开启话题',
    modelModeLabel: '模型待连接',
    worldModeLabel: '世界状态为模拟数据',
    storageModeLabel: '正在恢复记录'
  },

  onLoad(query: Record<string, string | undefined>) {
    activeGroup = getGroupDefinition(query?.groupId)
    engine = runtimeForGroup(activeGroup.id)
    lastUserMessageAt = 0
    lastContinuedUserMessageAt = 0
    this.setData({
      groupId: activeGroup.id,
      groupName: activeGroup.name,
      memberCount: activeGroup.memberIds.length + 1,
      groupMode: activeGroup.mode,
      modeLabel: activeGroup.modeLabel,
      modeStatus: modeStatus(engine.getState()),
      memoryCount: 0,
      imageBusy: false,
      sessionReady: false,
      messages: initialMessagesFor(activeGroup),
      topicTitle: '等待你开启话题',
      modelModeLabel: '正在恢复群聊',
      storageModeLabel: '正在恢复记录'
    })
    wx.setNavigationBarTitle?.({ title: `${activeGroup.name}（${activeGroup.memberIds.length + 1}）` })
    void this.restoreGroupSession(activeGroup.id)
  },

  async restoreGroupSession(groupId: string) {
    const session = await loadGroupSession(groupId)
    if (activeGroup.id !== groupId) return
    if (session.state && stateMatchesGroup(session.state, activeGroup)) {
      engine = createGroupRuntime(groupId, getWorldSnapshot(), session.state)
      runtimes.set(groupId, engine)
    }
    const persistedMessages = session.messages
      .filter((message) => message.id !== 'system-ai-disclosure' && message.id !== 'welcome-ning')
      .map(viewMessage)
    const messages = [...initialMessagesFor(activeGroup), ...persistedMessages]
    const latestUserMessage = [...persistedMessages]
      .reverse()
      .find((message) => message.senderType === 'user')
    lastUserMessageAt = latestUserMessage?.createdAt || 0
    lastContinuedUserMessageAt = lastUserMessageAt
    this.setData({
      messages,
      sessionReady: true,
      modelModeLabel: '模型待连接',
      storageModeLabel: session.source === 'cloud' ? '云端记录' : '本机记录',
      modeStatus: modeStatus(engine.getState()),
      topicTitle: session.state?.currentTopic?.title || '等待你开启话题',
      scrollTarget: `msg-${Math.max(0, messages.length - 1)}`
    })
    void markGroupRead(groupId)
    void this.restorePendingEvents(groupId)
    void this.restoreMemories(groupId)
    if (pageVisible && !this.data.inputValue.trim()) this.scheduleAutonomousRound()
  },

  async restorePendingEvents(groupId: string) {
    await syncGroupEventsFromCloud(groupId)
    if (activeGroup.id !== groupId || !this.data.sessionReady) return
    const pending = pendingGroupEvents(groupId)
    if (!pending.length) return
    const summaryId = `catchup-${pending.map((event) => event.id).join('-').slice(-80)}`
    const current = safeViewMessages(this.data.messages)
    if (!current.some((message) => message.id === summaryId)) {
      const titles = pending.slice(0, 3).map((event) => event.title).join('；')
      const summary = viewMessage({
        id: summaryId,
        senderType: 'system',
        speakerId: null,
        speakerName: '群记录',
        text: `你离开期间记录到：${titles}。群友会先挑最值得说的一件接着聊。`,
        createdAt: pending[0].occurredAt,
        timeLabel: '',
        topicId: 'catchup',
        replyToMessageId: null,
        isAiGenerated: false,
        trigger: 'world'
      })
      const messages = [...current, summary]
      this.setData({
        messages,
        scrollTarget: `msg-${messages.length - 1}`
      })
      queueVisiblePersistence([summary])
    }
    void this.processRecordedWorldEvent()
  },

  async restoreMemories(groupId: string) {
    await syncUserMemoriesFromCloud(groupId)
    if (activeGroup.id !== groupId) return
    this.setData({ memoryCount: relevantUserMemories(groupId).length })
  },

  async onShow() {
    pageVisible = true
    engine.setWorld(getWorldSnapshot())
    this.setData({ worldModeLabel: isLiveWorld() ? '已同步真实天气' : '正在同步真实天气…' })

    const currentNews = getWorldSnapshot().localNews
    const localNewsStale = !currentNews || currentNews.expiresAt <= Date.now()
    if ((!isLiveWorld() || localNewsStale) && !autoWorldSyncAttempted) {
      autoWorldSyncAttempted = true
      const result = await syncForegroundWorld()
      if (!result.ok) this.setData({ worldModeLabel: worldSyncErrorMessage(result.error) })
      else if (activeGroup.capabilities.worldAware && result.opportunities.length) {
        recordWorldOpportunities(activeGroup.id, result.opportunities, result.snapshot?.capturedAt)
        void this.processWorldOpportunities(result.opportunities, result.evidence)
      }
    }

    engine.setWorld(getWorldSnapshot())
    if (isLiveWorld()) {
      this.setData({
        worldModeLabel: getWorldSnapshot().localNews
          ? '已同步真实天气与本地资讯'
          : '已同步真实天气 · 本地资讯待配置'
      })
    }
    if (this.data.sessionReady) {
      void markGroupRead(activeGroup.id)
      this.scheduleAutonomousRound()
    }
  },

  onHide() {
    pageVisible = false
    this.cancelPendingRound()
    this.clearAutonomousTimer()
  },

  onUnload() {
    pageVisible = false
    activeImageToken += 1
    this.cancelPendingRound()
    this.clearAutonomousTimer()
  },

  onInput(event: { detail: { value: string } }) {
    const value = event.detail.value
    this.setData({ inputValue: value })
    if (value.trim()) this.clearAutonomousTimer()
    else if (!this.data.typing) {
      if (lastUserMessageAt && lastContinuedUserMessageAt !== lastUserMessageAt) {
        this.scheduleTopicContinuation()
      } else {
        this.scheduleAutonomousRound()
      }
    }
  },

  openWorld() {
    wx.navigateTo({ url: '../world/index' })
  },

  openMemory() {
    wx.navigateTo({ url: `../memory/index?groupId=${encodeURIComponent(activeGroup.id)}` })
  },

  clearAutonomousTimer() {
    if (autonomousTimer) clearTimeout(autonomousTimer)
    autonomousTimer = null
  },

  cancelPendingRound() {
    activeRoundToken += 1
    if (playbackTimer) clearTimeout(playbackTimer)
    playbackTimer = null
    activeEventId = null
    this.setData({ typing: false, typingName: '' })
  },

  scheduleAutonomousRound() {
    this.clearAutonomousTimer()
    if (!this.data.sessionReady) return
    if (!activeGroup.capabilities.autonomousConversation) return
    const now = Date.now()
    if (activeGroup.mode !== 'companion') {
      const lastAutonomousAt = lastModeAutonomousAt()
      const delay = lastAutonomousAt
        ? Math.max(10_000, MODE_AUTONOMOUS_COOLDOWN_MS - (now - lastAutonomousAt))
        : lastUserMessageAt
          ? Math.max(10_000, MODE_AUTONOMOUS_IDLE_MS - (now - lastUserMessageAt))
          : 20_000
      autonomousTimer = setTimeout(() => {
        autonomousTimer = null
        if (!pageVisible || this.data.typing || this.data.inputValue.trim()) return
        void this.startModeAutonomousRound()
      }, delay)
      return
    }
    const characterIds = activeCharacterIds()
    const eligibleOwners = characterIds.filter((characterId) => canStartAutonomousRound(now, characterId))
    if (!eligibleOwners.length) {
      const waitMs = Math.min(...characterIds.map((characterId) => autonomousRoundWaitMs(now, characterId)))
      autonomousTimer = setTimeout(() => {
        autonomousTimer = null
        if (pageVisible && !this.data.inputValue.trim()) this.scheduleAutonomousRound()
      }, Math.max(5_000, waitMs))
      return
    }
    const story = autonomousStoryFor(now, recentStoryIds(), eligibleOwners)
    if (!story) return
    const elapsedSinceUser = lastUserMessageAt ? Date.now() - lastUserMessageAt : AUTONOMOUS_IDLE_MS
    const delay = lastUserMessageAt
      ? Math.max(5_000, AUTONOMOUS_IDLE_MS - elapsedSinceUser)
      : 12_000

    autonomousTimer = setTimeout(() => {
      autonomousTimer = null
      const userRecentlySpoke = lastUserMessageAt > 0 && Date.now() - lastUserMessageAt < AUTONOMOUS_IDLE_MS
      if (!pageVisible || this.data.inputValue.trim()) return
      if (userRecentlySpoke || this.data.typing) {
        this.scheduleAutonomousRound()
        return
      }
      void this.startAutonomousRound(story.id)
    }, delay)
  },

  scheduleTopicContinuation() {
    this.clearAutonomousTimer()
    if (activeGroup.mode !== 'companion') {
      this.scheduleAutonomousRound()
      return
    }
    if (!lastUserMessageAt || lastContinuedUserMessageAt === lastUserMessageAt) {
      this.scheduleAutonomousRound()
      return
    }
    const lastAiMessage = [...safeViewMessages(this.data.messages)]
      .reverse()
      .find((message) => message.senderType === 'ai')
    if (!lastAiMessage || /[?？]\s*$/.test(lastAiMessage.text)) {
      this.scheduleAutonomousRound()
      return
    }

    autonomousTimer = setTimeout(() => {
      autonomousTimer = null
      if (!pageVisible || this.data.typing || this.data.inputValue.trim()) return
      void this.startTopicContinuation()
    }, CONTINUATION_DELAY_MS)
  },

  async startTopicContinuation() {
    if (activeGroup.mode !== 'companion') return
    if (!lastUserMessageAt || lastContinuedUserMessageAt === lastUserMessageAt) return
    const topic = engine.getState().currentTopic
    const previousMessage = [...safeViewMessages(this.data.messages)]
      .reverse()
      .find((message) => message.senderType === 'ai')
    if (!topic || !previousMessage || !previousMessage.speakerId) {
      this.scheduleAutonomousRound()
      return
    }

    const state = { ...engine.getState(), lastSpeakerId: previousMessage.speakerId }
    const decision = directTopicContinuation(state)
    const firstBeat = decision.beats?.[0]
    if (!decision.shouldSpeak || !firstBeat) {
      this.scheduleAutonomousRound()
      return
    }

    lastContinuedUserMessageAt = lastUserMessageAt
    this.cancelPendingRound()
    const roundToken = activeRoundToken
    this.setData({
      typing: true,
      typingName: characterById[firstBeat.speakerId].name,
      modelModeLabel: '群友顺着刚才的话继续聊'
    })

    const fallbackQueue = makeTopicContinuationReplies(
      decision.beats,
      decision.maxAiBubbles,
      topic.id,
      topic.title,
      previousMessage,
      [...safeViewMessages(this.data.messages)]
        .reverse()
        .find((message) => message.topicId === topic.id && message.storyId)?.storyId ?? null,
      Date.now()
    ).map(viewMessage)
    const modelResult = await generateContinuationReplies({
      groupId: activeGroup.id,
      history: [...safeViewMessages(this.data.messages)],
      world: getWorldSnapshot(),
      topic,
      decision
    })
    if (roundToken !== activeRoundToken || !pageVisible) return

    const queue = modelResult.ok
      ? modelReplyMessages(
          modelResult.payload.messages,
          topic.id,
          previousMessage.id,
          Date.now(),
          'continuation'
        )
      : fallbackQueue
    this.setData({
      modelModeLabel: modelResult.ok
        ? `${modelResult.payload.meta.provider} 实时生成`
        : groupChatErrorMessage(modelResult.error),
      topicTitle: modelResult.ok ? modelResult.payload.topic : topic.title
    })
    this.playQueue(queue, roundToken, () => this.scheduleAutonomousRound())
  },

  async startAutonomousRound(storyId: string) {
    if (activeGroup.mode !== 'companion') return
    const story = autonomousStoryFor(Date.now(), recentStoryIds(), activeCharacterIds())
    if (!story || story.id !== storyId) return
    if (!canStartAutonomousRound(Date.now(), story.ownerId)) return
    const budget = checkActiveMessageBudget(
      proactiveMessageTimestamps(safeViewMessages(this.data.messages)),
      loadLocalGroupSession(activeGroup.id).unreadCount,
      2
    )
    if (!budget.allowed) return
    const state = engine.getState()
    const decision = directAutonomousStory(state, story)
    if (!decision.shouldSpeak) return

    this.cancelPendingRound()
    const roundToken = activeRoundToken
    markAutonomousRoundStarted(Date.now(), story.ownerId)
    this.setData({
      typing: true,
      typingName: characterById[story.ownerId].name,
      topicTitle: story.title,
      modelModeLabel: '角色正在聊'
    })

    const topicId = `story-${story.id}-${Date.now()}`
    const fallbackQueue = makePrototypeReplies(
      decision.beats,
      decision.maxAiBubbles,
      'CHAT',
      '',
      topicId,
      'group',
      getWorldSnapshot(),
      Date.now(),
      'autonomous'
    ).map(viewMessage)
    const modelResult = await generateAutonomousReplies({
      groupId: activeGroup.id,
      history: [...safeViewMessages(this.data.messages)],
      world: getWorldSnapshot(),
      decision,
      story
    })
    if (roundToken !== activeRoundToken || !pageVisible) return

    const queue = modelResult.ok
      ? modelReplyMessages(modelResult.payload.messages, topicId, null, Date.now(), 'autonomous')
      : fallbackQueue
    this.setData({
      modelModeLabel: modelResult.ok
        ? `${modelResult.payload.meta.provider} 实时生成`
        : groupChatErrorMessage(modelResult.error),
      topicTitle: modelResult.ok ? modelResult.payload.topic : story.title
    })
    this.playQueue(queue, roundToken, () => this.scheduleAutonomousRound())
  },

  async startModeAutonomousRound() {
    if (activeGroup.mode === 'companion') return
    const now = Date.now()
    const previousAutonomousAt = lastModeAutonomousAt()
    if (previousAutonomousAt && now - previousAutonomousAt < MODE_AUTONOMOUS_COOLDOWN_MS) {
      this.scheduleAutonomousRound()
      return
    }
    const result = engine.createAutonomousRound(now)
    if (!result || !result.messages.length) return
    const budget = checkActiveMessageBudget(
      proactiveMessageTimestamps(safeViewMessages(this.data.messages)),
      loadLocalGroupSession(activeGroup.id).unreadCount,
      result.messages.length
    )
    if (!budget.allowed) return

    this.cancelPendingRound()
    const roundToken = activeRoundToken
    const fallbackQueue = result.messages.map(viewMessage)
    this.setData({
      typing: true,
      typingName: fallbackQueue[0]?.speakerName || '',
      topicTitle: result.topicTitle,
      modelModeLabel: `${activeGroup.modeLabel}角色正在聊`
    })
    const modelResult = await generateModeAutonomousReplies({
      groupId: activeGroup.id,
      modeState: result.state.modeState,
      history: [...safeViewMessages(this.data.messages)],
      world: getWorldSnapshot(),
      decision: result.decision,
      topicId: fallbackQueue[0]?.topicId || `mode-autonomous-${now}`,
      topicTitle: result.topicTitle
    })
    if (roundToken !== activeRoundToken || !pageVisible) return
    const queue = modelResult.ok
      ? modelReplyMessages(
          modelResult.payload.messages,
          fallbackQueue[0]?.topicId || null,
          'group',
          now,
          'autonomous'
        )
      : fallbackQueue
    this.setData({
      modelModeLabel: modelResult.ok
        ? `${activeGroup.modeLabel}实时生成`
        : groupChatErrorMessage(modelResult.error)
    })
    this.playQueue(queue, roundToken, () => {
      engine.replaceState(result.state)
      this.setData({ modeStatus: modeStatus(engine.getState()) })
      if (queue.length) queueVisiblePersistence([queue[queue.length - 1]])
      this.scheduleAutonomousRound()
    })
  },

  async processWorldOpportunities(
    opportunities: Opportunity[],
    evidence: EvidenceEnvelope<unknown>[]
  ) {
    if (
      !pageVisible ||
      !this.data.sessionReady ||
      this.data.typing ||
      this.data.inputValue.trim() ||
      activeEventId
    ) {
      return
    }
    const pendingIds = new Set(pendingGroupEvents(activeGroup.id).map((event) => event.opportunityId))
    const opportunity = opportunities
      .filter((candidate) => pendingIds.has(candidate.id))
      .sort((left, right) => right.importance - left.importance)[0]
    if (!opportunity) return

    const now = Date.now()
    let state = engine.getState()
    if (state.currentTopic) {
      state = { ...state, currentTopic: unlockIfInactive(state.currentTopic, now) }
      engine.replaceState(state)
    }
    const decision = directOpportunity(state, opportunity, {
      now,
      production: true,
      evidence
    })
    if (!decision.shouldSpeak) return

    const budget = checkActiveMessageBudget(
      proactiveMessageTimestamps(safeViewMessages(this.data.messages)),
      loadLocalGroupSession(activeGroup.id).unreadCount,
      decision.maxAiBubbles,
      now
    )
    if (!budget.allowed) return

    const event = pendingGroupEvents(activeGroup.id, now).find(
      (candidate) => candidate.opportunityId === opportunity.id
    )
    if (!event) return
    this.playWorldOpportunity(event.id, opportunity, decision)
  },

  processRecordedWorldEvent() {
    if (!activeGroup.capabilities.worldAware) return
    if (
      !pageVisible ||
      !this.data.sessionReady ||
      this.data.typing ||
      this.data.inputValue.trim() ||
      activeEventId
    ) {
      return
    }
    const event = pendingGroupEvents(activeGroup.id)[0]
    if (!event) return
    const opportunity = opportunityFromEvent(event)
    if (!opportunity) return
    const now = Date.now()
    let state = engine.getState()
    if (state.currentTopic) {
      state = { ...state, currentTopic: unlockIfInactive(state.currentTopic, now) }
      engine.replaceState(state)
    }
    const decision = directRecordedOpportunity(state, opportunity, now)
    if (!decision.shouldSpeak) return
    const budget = checkActiveMessageBudget(
      proactiveMessageTimestamps(safeViewMessages(this.data.messages)),
      loadLocalGroupSession(activeGroup.id).unreadCount,
      decision.maxAiBubbles,
      now
    )
    if (!budget.allowed) return
    this.playWorldOpportunity(event.id, opportunity, decision)
  },

  playWorldOpportunity(
    eventId: string,
    opportunity: Opportunity,
    decision: ReturnType<typeof directOpportunity>
  ) {
    const now = Date.now()
    this.cancelPendingRound()
    activeEventId = eventId
    const roundToken = activeRoundToken
    const topicId = `world-topic-${opportunity.id}`
    const queue = makeOpportunityReplies(decision.beats, opportunity, topicId, now).map(viewMessage)
    const nextState = {
      ...engine.getState(),
      currentOpportunityId: opportunity.id,
      seenOpportunityIds: [...engine.getState().seenOpportunityIds, opportunity.id].slice(-100),
      cooldowns: {
        ...engine.getState().cooldowns,
        [opportunity.type]: now + (opportunity.type === 'weather' ? 60 * 60_000 : 6 * 60 * 60_000)
      },
      consecutiveAiMessages: queue.length,
      lastMessageTime: now,
      lastSpeakerId: queue[queue.length - 1]?.speakerId ?? engine.getState().lastSpeakerId
    }
    this.setData({
      typing: true,
      typingName: queue[0]?.speakerName || '',
      topicTitle: opportunity.title,
      modelModeLabel: '真实世界变化'
    })
    this.playQueue(queue, roundToken, () => {
      engine.replaceState(nextState)
      if (queue.length) queueVisiblePersistence([queue[queue.length - 1]])
      markGroupEventConsumed(activeGroup.id, eventId, queue.map((message) => message.id))
      activeEventId = null
      this.scheduleAutonomousRound()
    })
  },

  async sendMessage() {
    if (!this.data.sessionReady || this.data.imageBusy) return
    const text = this.data.inputValue.trim()
    if (!text) return

    this.clearAutonomousTimer()
    this.cancelPendingRound()
    const roundToken = activeRoundToken
    lastUserMessageAt = Date.now()

    engine.setWorld(getWorldSnapshot())
    const excludedStoryIds = recentStoryIds()
    const result = engine.handleUserMessage(text, Date.now(), excludedStoryIds)
    const user = viewMessage(result.messages[0])
    const fallbackQueue = result.messages.slice(1).map(viewMessage)
    const currentMessages = safeViewMessages(this.data.messages)
    const history = [...currentMessages]
    const messages = [...currentMessages, user]
    const firstDecisionBeat = result.decision.beats?.[0]
    this.setData({
      inputValue: '',
      messages,
      typing: true,
      typingName: characterById[firstDecisionBeat?.speakerId ?? 'ning'].name,
      modelModeLabel: '角色正在想',
      scrollTarget: `msg-${messages.length - 1}`,
      topicTitle: result.state.currentTopic?.title ?? '当前话题',
      modeStatus: modeStatus(result.state)
    })
    queueVisiblePersistence([user])
    const memoryEnabled =
      activeGroup.mode === 'companion' || activeGroup.mode === 'discussion'
    if (memoryEnabled) {
      recordUserMemories(activeGroup.id, user, result.intent)
      this.setData({ memoryCount: relevantUserMemories(activeGroup.id).length })
    }

    if (result.intent === 'NEWS_QUERY') {
      const localNews = getWorldSnapshot().localNews
      const hasCurrentNews =
        Boolean(localNews) &&
        !localNews?.isSimulated &&
        Number(localNews?.expiresAt) > Date.now() &&
        Boolean(localNews?.data.length)
      this.setData({
        modelModeLabel: hasCurrentNews ? '真实本地资讯 · 按来源回答' : '本地资讯尚未同步'
      })
      this.playQueue(fallbackQueue, roundToken, () => this.scheduleAutonomousRound())
      return
    }

    const modelResult = await generateGroupReplies({
      groupId: activeGroup.id,
      modeState: result.state.modeState,
      text,
      history,
      world: getWorldSnapshot(),
      topic: result.state.currentTopic,
      intent: result.intent,
      decision: result.decision,
      excludedStoryIds,
      memories: memoryEnabled ? relevantUserMemories(activeGroup.id) : []
    })
    if (roundToken !== activeRoundToken || !pageVisible) return

    const aiQueue = modelResult.ok
      ? modelReplyMessages(modelResult.payload.messages, result.state.currentTopic?.id ?? null, user.id)
      : fallbackQueue
    this.setData({
      modelModeLabel: modelResult.ok
        ? `${modelResult.payload.meta.provider} 实时生成`
        : groupChatErrorMessage(modelResult.error),
      topicTitle: modelResult.ok ? modelResult.payload.topic : this.data.topicTitle
    })
    this.playQueue(aiQueue, roundToken, () => this.scheduleTopicContinuation())
  },

  async chooseAndSendImage() {
    if (
      !this.data.sessionReady ||
      this.data.imageBusy ||
      !activeGroup.capabilities.imageUnderstanding
    ) {
      return
    }
    this.clearAutonomousTimer()
    this.cancelPendingRound()
    const imageToken = ++activeImageToken
    const groupId = activeGroup.id
    const caption = this.data.inputValue.trim()
    let imageCommitted = false
    this.setData({
      imageBusy: true,
      modelModeLabel: IMAGE_STAGE_LABELS.selecting
    })

    try {
      const image = await selectAndUploadImage(groupId, (stage) => {
        if (activeGroup.id !== groupId || imageToken !== activeImageToken) return
        this.setData({ modelModeLabel: IMAGE_STAGE_LABELS[stage] })
      })
      if (
        activeGroup.id !== groupId ||
        imageToken !== activeImageToken
      ) {
        await discardPreparedImage(groupId, image.fileId)
        if (activeGroup.id === groupId && pageVisible) {
          this.setData({ imageBusy: false, modelModeLabel: '模型待连接' })
        }
        return
      }

      const now = Date.now()
      const userId = `image-user-${now}-${Math.random().toString(36).slice(2, 8)}`
      const currentMessages = safeViewMessages(this.data.messages)
      const history = [...currentMessages]
      const provisionalUser = viewMessage({
        id: userId,
        senderType: 'user',
        speakerId: null,
        speakerName: '我',
        text: caption || '分享了一张图片',
        createdAt: now,
        timeLabel: timeLabel(now),
        topicId: `image-pending-${userId}`,
        replyToMessageId: null,
        isAiGenerated: false,
        trigger: 'image',
        contentType: caption ? 'mixed' : 'image',
        image,
        visualEvidence: null
      })
      const uploadedMessages = [...currentMessages, provisionalUser]
      imageCommitted = true
      lastUserMessageAt = now
      this.setData({
        inputValue: '',
        messages: uploadedMessages,
        modelModeLabel: IMAGE_STAGE_LABELS.analyzing,
        topicTitle: caption || '你分享的图片',
        scrollTarget: `msg-${uploadedMessages.length - 1}`
      })
      queueVisiblePersistence([provisionalUser])

      const evidence = await analyzeUploadedImage(groupId, image.fileId)
      if (activeGroup.id !== groupId || imageToken !== activeImageToken) return

      const roundToken = activeRoundToken
      engine.setWorld(getWorldSnapshot())
      const result = engine.handleVisualMessage(evidence, caption, now)
      const generatedUser = result.messages[0]
      const user = viewMessage({
        ...generatedUser,
        id: userId,
        text: caption || '分享了一张图片',
        contentType: caption ? 'mixed' : 'image',
        image,
        visualEvidence: evidence,
        trigger: 'image'
      })
      const messages = safeViewMessages(this.data.messages).map((message) =>
        message.id === userId ? user : message
      )
      const topicId = result.state.currentTopic?.id || `image-topic-${evidence.id}`
      const fallbackQueue = makeVisualFallbackReplies(
        activeGroup.mode,
        evidence,
        topicId,
        user.id,
        now + 1
      ).map(viewMessage)
      const firstBeat = result.decision.beats?.[0]
      this.setData({
        imageBusy: false,
        messages,
        typing: true,
        typingName: characterById[firstBeat?.speakerId ?? fallbackQueue[0]?.speakerId ?? 'ning'].name,
        modelModeLabel: '群友正在看图',
        topicTitle: caption || '你分享的图片',
        modeStatus: modeStatus(result.state),
        scrollTarget: `msg-${messages.length - 1}`
      })
      queueVisiblePersistence([user])

      const modelResult = await generateGroupReplies({
        groupId,
        modeState: result.state.modeState,
        text: caption || '请围绕我分享的这张图片自然聊聊',
        history,
        world: getWorldSnapshot(),
        topic: result.state.currentTopic,
        intent: 'CHAT',
        decision: result.decision,
        memories:
          activeGroup.mode === 'companion' || activeGroup.mode === 'discussion'
            ? relevantUserMemories(groupId)
            : [],
        visualEvidence: evidence
      })
      const queue = modelResult.ok
        ? modelReplyMessages(
            modelResult.payload.messages,
            topicId,
            user.id,
            now + 1,
            'image'
          )
        : fallbackQueue
      if (activeGroup.id !== groupId) return
      if (!pageVisible) {
        const nextMessages = [...safeViewMessages(this.data.messages), ...queue]
        this.setData({
          messages: nextMessages,
          typing: false,
          typingName: '',
          modelModeLabel: modelResult.ok
            ? `${modelResult.payload.meta.provider} 看图回应`
            : groupChatErrorMessage(modelResult.error),
          scrollTarget: `msg-${nextMessages.length - 1}`
        })
        queueBackgroundPersistence(groupId, queue, result.state)
        return
      }
      if (roundToken !== activeRoundToken) return
      this.setData({
        modelModeLabel: modelResult.ok
          ? `${modelResult.payload.meta.provider} 看图回应`
          : groupChatErrorMessage(modelResult.error),
        topicTitle: modelResult.ok ? modelResult.payload.topic : this.data.topicTitle
      })
      this.playQueue(queue, roundToken, () => this.scheduleTopicContinuation())
    } catch (error) {
      if (activeGroup.id !== groupId) return
      if (imageToken !== activeImageToken) {
        if (pageVisible) {
          this.setData({ imageBusy: false, typing: false, typingName: '' })
        }
        return
      }
      const message = imageMessageError(error)
      console.warn('[image-message]', {
        groupId,
        committed: imageCommitted,
        error: error instanceof Error ? error.message : String(error || '')
      })
      const status = imageCommitted && message
        ? `图片已发送；${message}`
        : message || '模型待连接'
      let messages = safeViewMessages(this.data.messages)
      if (imageCommitted) {
        const imageMessage = [...messages]
          .reverse()
          .find(
            (item) =>
              item.senderType === 'user' &&
              item.trigger === 'image' &&
              (item.contentType === 'image' || item.contentType === 'mixed')
          )
        const alreadyAcknowledged = imageMessage
          ? messages.some(
              (item) =>
                item.replyToMessageId === imageMessage.id &&
                item.turnId === `visual-unavailable-turn-${imageMessage.id}`
            )
          : true
        if (imageMessage && !alreadyAcknowledged) {
          const fallback = makeVisualUnavailableReplies(
            activeGroup.mode,
            imageMessage.topicId || `image-pending-${imageMessage.id}`,
            imageMessage.id,
            Date.now()
          ).map(viewMessage)
          messages = [...messages, ...fallback]
          queueVisiblePersistence(fallback)
        }
      }
      this.setData({
        imageBusy: false,
        typing: false,
        typingName: '',
        messages,
        modelModeLabel: status,
        scrollTarget: `msg-${Math.max(0, messages.length - 1)}`
      })
      if (message) {
        wx.showToast({
          title: imageCommitted ? '图片已发送，但暂时无法识别' : message,
          icon: 'none'
        })
      }
      this.scheduleAutonomousRound()
    }
  },

  previewMessageImage(event: { currentTarget: { dataset: { url?: string } } }) {
    const url = String(event.currentTarget.dataset.url || '')
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  playQueue(queue: ViewMessage[], roundToken: number, onComplete?: () => void) {
    const safeQueue = Array.isArray(queue) ? queue : []
    if (!safeQueue.length || roundToken !== activeRoundToken) {
      this.setData({ typing: false, typingName: '' })
      if (roundToken === activeRoundToken) onComplete?.()
      return
    }

    const appendAt = (index: number, previousSpeakerId: CharacterId | null) => {
      if (roundToken !== activeRoundToken || !pageVisible) return
      if (index >= safeQueue.length) {
        playbackTimer = null
        this.setData({ typing: false, typingName: '' })
        onComplete?.()
        return
      }

      const next = safeQueue[index]
      if (!next) {
        playbackTimer = null
        this.setData({ typing: false, typingName: '' })
        onComplete?.()
        return
      }
      this.setData({ typing: true, typingName: next.speakerName })
      playbackTimer = setTimeout(() => {
        if (roundToken !== activeRoundToken || !pageVisible) return
        const nextMessages = [...safeViewMessages(this.data.messages), next]
        if (next.storyId) markStoryMentioned(next.storyId)
        this.setData({
          messages: nextMessages,
          typing: index < safeQueue.length - 1,
          typingName: safeQueue[index + 1]?.speakerName ?? '',
          scrollTarget: `msg-${nextMessages.length - 1}`
        })
        queueVisiblePersistence([next])
        appendAt(index + 1, next.speakerId)
      }, playbackDelay(next, previousSpeakerId, index === 0))
    }

    const lastVisibleAi = [...safeViewMessages(this.data.messages)]
      .reverse()
      .find((message) => message.senderType === 'ai')
    appendAt(0, lastVisibleAi?.speakerId ?? null)
  },

  submitMessage() {
    void this.sendMessage()
  }
})
