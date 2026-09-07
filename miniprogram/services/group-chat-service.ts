import {
  modelCharacterContext,
  selectRelevantStories,
  storyById
} from '../data/characters'
import { DEFAULT_GROUP_ID, getGroupDefinition } from '../data/groups'
import type {
  CharacterId,
  CharacterStorySeed,
  ChatMessage,
  ConversationMotive,
  DelayProfile,
  DirectorDecision,
  GroupModeState,
  TopicState,
  UserMemory,
  UserIntent,
  VisualEvidence,
  WorldSnapshot
} from '../core/types'

export interface ModelGroupReply {
  speakerId: CharacterId
  text: string
  replyTo: 'user' | 'group' | CharacterId
  motive: ConversationMotive
  delayProfile: DelayProfile
  required: boolean
  storyId: string | null
  turnId: string
  bubbleIndex: number
}

interface GroupChatCloudPayload {
  success: true
  topic: string
  mood: string
  messages: ModelGroupReply[]
  meta: {
    provider: string
    model: string
    usage: unknown
  }
}

export type GroupChatResult =
  | { ok: true; payload: GroupChatCloudPayload }
  | { ok: false; error: string }

export interface GroupChatRequest {
  groupId?: string
  modeState?: GroupModeState
  text: string
  history: ChatMessage[]
  world: WorldSnapshot
  topic: TopicState | null
  intent: UserIntent
  decision: DirectorDecision
  excludedStoryIds?: string[]
  memories?: UserMemory[]
  visualEvidence?: VisualEvidence | null
}

interface AutonomousGroupChatRequest {
  groupId?: string
  history: ChatMessage[]
  world: WorldSnapshot
  decision: DirectorDecision
  story: CharacterStorySeed
}

export interface ModeAutonomousGroupChatRequest {
  groupId: string
  modeState: GroupModeState
  history: ChatMessage[]
  world: WorldSnapshot
  decision: DirectorDecision
  topicId: string
  topicTitle: string
}

export interface ContinuationGroupChatRequest {
  groupId?: string
  history: ChatMessage[]
  world: WorldSnapshot
  topic: TopicState
  decision: DirectorDecision
}

const motives = new Set<ConversationMotive>([
  'answer',
  'acknowledge',
  'expand',
  'share_story',
  'react',
  'challenge',
  'support',
  'ask',
  'repair',
  'close'
])
const delayProfiles = new Set<DelayProfile>(['quick', 'normal', 'thoughtful', 'afterthought'])

export function containsUnsupportedRealityClaim(
  text: string,
  storyId: string | null = null,
  hasNewsEvidence = false
): boolean {
  const normalized = text.trim().slice(0, 220)
  if (!normalized) return false
  if (/(无法确认|不能确认|没有数据|没接入|不知道|不清楚|不能确定|暂时没有)/.test(normalized)) return false
  if (/(附近|周围|这边).{0,24}(新开|发现一家|有一家|有个|正在举行|发生了|书店|餐厅|咖啡店|展览|演出|活动)/.test(normalized)) {
    return true
  }
  if (
    !hasNewsEvidence &&
    /(听说|新闻|消息说).{0,24}(事故|活动|演出|展览|新开|发生)/.test(normalized)
  ) return true
  const firstPersonExperience = /(我|我们)(最近|昨天|前几天|以前|曾经|刚才|今天).{0,40}(去过|去了|发现|看到|遇到|路过|买了|吃了|参加|听说|试着|开始)/
  if (!storyId && firstPersonExperience.test(normalized)) return true
  const unsupportedCurrentActivity = /(我|我们)?(刚|刚刚|刚才|正在|这会儿).{0,40}(看完|看了|读完|读了|拉上|关上|打开|洗了|收拾|整理|写完|做完|去了|发现|看到|遇到|路过|参加)/
  if (unsupportedCurrentActivity.test(normalized)) return true
  return Boolean(
    storyId && /(我|我们)(最近|昨天|刚才|今天).{0,40}(去了|发现|看到|遇到|路过|参加)/.test(normalized)
  )
}

function serializedWorld(input: WorldSnapshot): Record<string, unknown> {
  const location = input.location.data
  const weather = input.weather.data
  const live = !input.location.isSimulated && !input.weather.isSimulated
  if (!live) return { live: false }
  const localNews =
    input.localNews &&
    !input.localNews.isSimulated &&
    input.localNews.expiresAt > Date.now()
      ? input.localNews.data.slice(0, 5).map((item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          sourceName: item.sourceName,
          publishedAt: item.publishedAt
        }))
      : []
  return {
    live: true,
    observedAt: input.weather.observedAt,
    location: {
      city: location.city,
      district: location.district,
      landmark: location.landmark
    },
    weather: {
      condition: weather.condition,
      temperature: weather.temperature,
      feelsLike: weather.feelsLike,
      warning: weather.warning,
      provider: input.weather.provider
    },
    localNews
  }
}

function serializedWorldForGroup(input: WorldSnapshot, groupId = DEFAULT_GROUP_ID): Record<string, unknown> {
  return getGroupDefinition(groupId).capabilities.worldAware ? serializedWorld(input) : { live: false }
}

function serializedHistory(history: ChatMessage[]): Array<Record<string, unknown>> {
  return history
    .filter((message) => message.senderType !== 'system')
    .slice(-20)
    .map((message) => ({
      id: message.id,
      senderType: message.senderType,
      speakerId: message.speakerId,
      speakerName: message.speakerName,
      text:
        message.contentType === 'image' || message.contentType === 'mixed'
          ? `[用户图片] ${message.text}；已核验视觉摘要：${message.visualEvidence?.summary || '识别结果不可用'}`
          : message.text,
      storyId: message.storyId ?? null
    }))
}

function serializedStory(story: CharacterStorySeed): Record<string, unknown> {
  return {
    id: story.id,
    ownerId: story.ownerId,
    type: story.type,
    title: story.title,
    summary: story.summary,
    keyFacts: story.keyFacts,
    emotionalMeaning: story.emotionalMeaning,
    shareHint: story.shareHint
  }
}

function serializedMemories(memories: UserMemory[] = []): Array<Record<string, unknown>> {
  return memories.slice(0, 8).map((memory) => ({
    kind: memory.kind,
    tier: memory.tier,
    content: memory.content,
    confidence: memory.confidence,
    updatedAt: memory.updatedAt,
    expiresAt: memory.expiresAt
  }))
}

function serializedPlan(decision: DirectorDecision): Record<string, unknown> {
  const fallbackBeats = (decision.speakers ?? []).map((speakerId, index) => ({
    speakerId,
    motive: index === 0 ? ('answer' as const) : ('react' as const),
    replyTarget: index === 0 ? ('user' as const) : decision.speakers[index - 1],
    required: index === 0,
    minBubbles: 1 as const,
    maxBubbles: 1 as const,
    storyId: null,
    delayProfile: 'normal' as const,
    stopAfter: index === decision.speakers.length - 1
  }))
  const beats = Array.isArray(decision.beats) && decision.beats.length ? decision.beats : fallbackBeats
  return {
    reason: decision.reason,
    maxAiBubbles: decision.maxAiBubbles || decision.maxMessages,
    cancellable: decision.cancellable,
    expiresAt: decision.expiresAt,
    beats: beats.map((beat) => ({
      speakerId: beat.speakerId,
      motive: beat.motive,
      replyTarget: beat.replyTarget,
      required: beat.required,
      minBubbles: beat.minBubbles ?? 1,
      maxBubbles: beat.maxBubbles,
      storyId: beat.storyId,
      delayProfile: beat.delayProfile,
      stopAfter: beat.stopAfter
    }))
  }
}

export function buildGroupChatRequest(input: GroupChatRequest): Record<string, unknown> {
  const companionMode = getGroupDefinition(input.groupId).mode === 'companion'
  const selected = companionMode && !input.visualEvidence
    ? selectRelevantStories(
        input.text,
        input.decision.speakers,
        input.excludedStoryIds ?? [],
        2
      )
    : []
  const planned = companionMode
    ? (input.decision.beats ?? [])
        .map((beat) => (beat.storyId ? storyById[beat.storyId] : null))
        .filter((story): story is CharacterStorySeed => Boolean(story))
    : []
  const stories = [...new Map([...planned, ...selected].map((story) => [story.id, story])).values()]

  return {
    groupId: input.groupId || DEFAULT_GROUP_ID,
    modeState: input.modeState || null,
    mode: 'user',
    text: input.text,
    history: serializedHistory(input.history),
    topic: input.topic ? { id: input.topic.id, title: input.topic.title, type: input.topic.type } : null,
    intent: input.intent,
    roundPlan: serializedPlan(input.decision),
    characters: modelCharacterContext(input.decision.speakers),
    stories: stories.map(serializedStory),
    memories: serializedMemories(input.memories),
    visualEvidenceRef: input.visualEvidence?.id || null,
    world: serializedWorldForGroup(input.world, input.groupId)
  }
}

export function buildAutonomousGroupRequest(input: AutonomousGroupChatRequest): Record<string, unknown> {
  return {
    groupId: input.groupId || DEFAULT_GROUP_ID,
    mode: 'autonomous',
    text: '',
    history: serializedHistory(input.history),
    topic: { id: `story-${input.story.id}`, title: input.story.title, type: 'general' },
    intent: 'CHAT',
    roundPlan: serializedPlan(input.decision),
    characters: modelCharacterContext(input.decision.speakers),
    stories: [serializedStory(input.story)],
    world: serializedWorldForGroup(input.world, input.groupId)
  }
}

export function buildModeAutonomousGroupRequest(
  input: ModeAutonomousGroupChatRequest
): Record<string, unknown> {
  return {
    groupId: input.groupId,
    modeState: input.modeState,
    mode: 'autonomous',
    text: '',
    history: serializedHistory(input.history),
    topic: { id: input.topicId, title: input.topicTitle, type: 'general' },
    intent: 'CHAT',
    roundPlan: serializedPlan(input.decision),
    characters: modelCharacterContext(input.decision.speakers),
    stories: [],
    memories: [],
    world: serializedWorldForGroup(input.world, input.groupId)
  }
}

export function buildContinuationGroupRequest(input: ContinuationGroupChatRequest): Record<string, unknown> {
  return {
    groupId: input.groupId || DEFAULT_GROUP_ID,
    mode: 'continuation',
    text: '',
    history: serializedHistory(input.history),
    topic: { id: input.topic.id, title: input.topic.title, type: input.topic.type },
    intent: 'CHAT',
    roundPlan: serializedPlan(input.decision),
    characters: modelCharacterContext(input.decision.speakers),
    stories: [],
    world: serializedWorldForGroup(input.world, input.groupId)
  }
}

function isModelReply(
  value: unknown,
  hasNewsEvidence = false,
  allowFictionalScene = false
): value is ModelGroupReply {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ModelGroupReply>
  return (
    (candidate.speakerId === 'axing' || candidate.speakerId === 'qiao' || candidate.speakerId === 'ning') &&
    typeof candidate.text === 'string' &&
    candidate.text.trim().length > 0 &&
    candidate.text.length <= 220 &&
    typeof candidate.motive === 'string' &&
    motives.has(candidate.motive as ConversationMotive) &&
    typeof candidate.delayProfile === 'string' &&
    delayProfiles.has(candidate.delayProfile as DelayProfile) &&
    typeof candidate.required === 'boolean' &&
    typeof candidate.turnId === 'string' &&
    Number.isInteger(candidate.bubbleIndex) &&
    (allowFictionalScene ||
      !containsUnsupportedRealityClaim(candidate.text, candidate.storyId ?? null, hasNewsEvidence))
  )
}

function callGroupChat(data: Record<string, unknown>): Promise<GroupChatResult> {
  return new Promise((resolve) => {
    if (!wx.cloud) {
      resolve({ ok: false, error: 'cloud_not_available' })
      return
    }
    wx.cloud.callFunction({
      name: 'groupChat',
      data,
      success(response) {
        const world = data.world as { localNews?: unknown[] } | undefined
        const hasNewsEvidence = Array.isArray(world?.localNews) && world.localNews.length > 0
        const groupId = typeof data.groupId === 'string' ? data.groupId : DEFAULT_GROUP_ID
        const groupMode = getGroupDefinition(groupId).mode
        const allowFictionalScene = groupMode === 'story' || groupMode === 'crossover_salon'
        const result = response.result as GroupChatCloudPayload | { success?: false; error?: string } | undefined
        if (
          result?.success &&
          Array.isArray(result.messages) &&
          result.messages.length >= 1 &&
          result.messages.length <= 3 &&
          result.messages.every((message) =>
            isModelReply(message, hasNewsEvidence, allowFictionalScene)
          )
        ) {
          resolve({ ok: true, payload: result })
        } else {
          resolve({ ok: false, error: result?.error || 'model_output_invalid' })
        }
      },
      fail(error) {
        resolve({ ok: false, error: error.errMsg || 'group_chat_cloud_failed' })
      }
    })
  })
}

export function generateGroupReplies(input: GroupChatRequest): Promise<GroupChatResult> {
  return callGroupChat(buildGroupChatRequest(input))
}

export function generateAutonomousReplies(input: AutonomousGroupChatRequest): Promise<GroupChatResult> {
  return callGroupChat(buildAutonomousGroupRequest(input))
}

export function generateModeAutonomousReplies(
  input: ModeAutonomousGroupChatRequest
): Promise<GroupChatResult> {
  return callGroupChat(buildModeAutonomousGroupRequest(input))
}

export function generateContinuationReplies(input: ContinuationGroupChatRequest): Promise<GroupChatResult> {
  return callGroupChat(buildContinuationGroupRequest(input))
}

export function groupChatErrorMessage(error: string): string {
  if (error === 'model_service_not_configured') return '模型未配置，已使用安全备用回复'
  if (error === 'model_content_filtered') return '这条内容无法生成，已使用安全回复'
  if (error === 'model_timeout') return '模型响应超时，已使用安全备用回复'
  if (/function.*not.*found|functionname|找不到.*函数|-501000/i.test(error)) {
    return 'groupChat 云函数未部署，已使用安全备用回复'
  }
  if (/model_http_401|model_http_403/.test(error)) return '模型凭据无效，已使用安全备用回复'
  if (/model_http_402/.test(error)) return '模型余额不足，已使用安全备用回复'
  if (/model_http_400|model_http_404/.test(error)) return '模型名称或请求参数不受支持，已使用安全备用回复'
  if (/model_http_429/.test(error)) return '模型请求过于频繁，已使用安全备用回复'
  if (/model_http_5\d\d/.test(error)) return '模型供应商服务异常，已使用安全备用回复'
  if (/model_(empty|json_invalid|output_invalid|output_truncated)/.test(error)) {
    return '模型输出格式无效，已使用安全备用回复'
  }
  if (/-504002|execute.*fail|execution.*fail/i.test(error)) {
    return 'groupChat 云函数执行失败，请查看云端日志'
  }
  const diagnostic = error.replace(/[^a-zA-Z0-9_:\-.\u4e00-\u9fa5]/g, ' ').trim().slice(0, 72)
  return `模型不可用（${diagnostic || 'unknown'}），已使用安全备用回复`
}
