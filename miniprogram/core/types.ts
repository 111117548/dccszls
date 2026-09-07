export type TopicStage = 'START' | 'GROWING' | 'PEAK' | 'COOLING' | 'ENDED'
export type TopicSource = 'user' | 'location' | 'weather' | 'poi' | 'news' | 'time' | 'system'
export type UserIntent =
  | 'QUESTION'
  | 'REQUEST'
  | 'EMOTION'
  | 'CHAT'
  | 'LOCATION_QUERY'
  | 'NEWS_QUERY'
  | 'WEATHER_QUERY'
  | 'OPINION'
  | 'ACTION'
  | 'NONSENSE'
  | 'TOPIC_CHANGE'

export type CharacterId = string
export type TopicKind =
  | 'general'
  | 'food'
  | 'weather'
  | 'location'
  | 'news'
  | 'emotion'
  | 'action'
  | 'opinion'
export type ConversationTrigger = 'user' | 'image' | 'world' | 'continuation' | 'autonomous'
export type ConversationMotive =
  | 'answer'
  | 'acknowledge'
  | 'expand'
  | 'share_story'
  | 'react'
  | 'challenge'
  | 'support'
  | 'ask'
  | 'repair'
  | 'close'
export type DelayProfile = 'quick' | 'normal' | 'thoughtful' | 'afterthought'
export type CharacterStoryType = 'canon_backstory' | 'shared_history' | 'virtual_episode' | 'hypothetical'

export interface TopicState {
  id: string
  type: TopicKind
  title: string
  source: TopicSource
  energy: number
  stage: TopicStage
  messageCount: number
  createdAt: number
  lastActiveAt: number
  lockedByUser: boolean
}

export interface GroupState {
  mood: '平静' | '开心' | '好奇' | '兴奋' | '疲惫' | '关心' | '紧张' | '无聊'
  currentTopic: TopicState | null
  currentFocus: string | null
  currentOpportunityId: string | null
  silenceUntil: number | null
  lastMessageTime: number
  consecutiveAiMessages: number
  unreadCount: number
  lastSpeakerId: CharacterId | null
  cooldowns: Partial<Record<TopicKind, number>>
  seenOpportunityIds: string[]
  modeState: GroupModeState
}

export type GroupModeState =
  | {
      kind: 'companion'
      sharedMoments: number
    }
  | {
      kind: 'discussion'
      phase: 'OPEN' | 'EXPLORE' | 'COMPARE' | 'SYNTHESIZE'
      turnCount: number
      question: string | null
      perspectives: string[]
    }
    | {
        kind: 'crossover_salon'
        scene: string
        collisionCount: number
        lastContrast: string | null
        lastAutonomousAt: number | null
      }
  | {
      kind: 'story'
      storyId: string
      chapter: number
      turnCount: number
      scene: string
        objective: string
        clues: string[]
        userRole: string
        lastAutonomousAt: number | null
      }

export interface EvidenceEnvelope<T> {
  id: string
  provider: string
  sourceId: string | null
  observedAt: number
  fetchedAt: number
  expiresAt: number
  confidence: number
  isSimulated: boolean
  data: T
}

export interface Opportunity {
  id: string
  type: TopicKind
  source: TopicSource
  title: string
  description: string
  importance: number
  confidence: number
  expiresAt: number
  evidenceIds: string[]
}

export interface DirectorDecision {
  shouldSpeak: boolean
  reason: string
  speakers: CharacterId[]
  maxMessages: number
  maxAiBubbles: number
  replyTarget: 'user' | 'character' | 'world_change'
  endTopicAfterRound: boolean
  beats: ConversationBeat[]
  cancellable: boolean
  expiresAt: number
}

export interface ConversationBeat {
  speakerId: CharacterId
  motive: ConversationMotive
  replyTarget: 'user' | 'group' | CharacterId
  required: boolean
  minBubbles?: 1 | 2
  maxBubbles: 1 | 2
  storyId: string | null
  delayProfile: DelayProfile
  stopAfter: boolean
}

export interface ConversationRoundPlan {
  trigger: ConversationTrigger
  topicId: string | null
  beats: ConversationBeat[]
  maxAiBubbles: number
  cancellable: boolean
  expiresAt: number
  reason: string
}

export interface ChatMessage {
  id: string
  senderType: 'user' | 'ai' | 'system'
  speakerId: CharacterId | null
  speakerName: string
  text: string
  createdAt: number
  timeLabel: string
  topicId: string | null
  replyToMessageId: string | null
  isAiGenerated: boolean
  motive?: ConversationMotive | null
  delayProfile?: DelayProfile
  required?: boolean
  storyId?: string | null
  turnId?: string | null
  bubbleIndex?: number
  trigger?: ConversationTrigger
  contentType?: 'text' | 'image' | 'mixed'
  image?: ImageAttachment | null
  visualEvidence?: VisualEvidence | null
}

export type VisualCategory =
  | 'food'
  | 'scenery'
  | 'building'
  | 'weather'
  | 'document'
  | 'screenshot'
  | 'person'
  | 'animal'
  | 'object'
  | 'other'

export interface ImageAttachment {
  fileId: string
  width: number
  height: number
  size: number
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  status: 'ready'
}

export interface VisualEvidence {
  id: string
  provider: string
  model: string
  analyzedAt: number
  category: VisualCategory
  summary: string
  objects: string[]
  visibleText: string[]
  notableDetails: string[]
  uncertainties: string[]
  confidence: number
  safety: 'passed'
}

export type GroupEventStatus = 'pending' | 'consumed' | 'dismissed' | 'expired'

export interface GroupEvent {
  id: string
  groupId: string
  type: 'world_change' | 'memory_recall' | 'scheduled_activity'
  topicKind: TopicKind
  source: TopicSource
  title: string
  description: string
  importance: number
  confidence: number
  occurredAt: number
  expiresAt: number
  evidenceIds: string[]
  opportunityId: string | null
  status: GroupEventStatus
  consumedAt: number | null
  messageIds: string[]
}

export type MemoryTier = 'short_term' | 'long_term'
export type MemoryKind = 'preference' | 'dislike' | 'plan' | 'emotion'

export interface UserMemory {
  id: string
  groupId: string
  tier: MemoryTier
  kind: MemoryKind
  content: string
  confidence: number
  sourceMessageId: string
  createdAt: number
  updatedAt: number
  expiresAt: number | null
}

export interface CharacterProfile {
  id: CharacterId
  name: string
  avatarText: string
  avatarClass: string
  role: string
  coreMotive: string
  values: string[]
  attention: string[]
  speechStyle: string
  silenceRule: string
  relationships: Partial<Record<CharacterId | 'user', string>>
  stories: CharacterStorySeed[]
}

export interface CharacterStorySeed {
  id: string
  ownerId: CharacterId
  type: CharacterStoryType
  title: string
  summary: string
  keyFacts: string[]
  emotionalMeaning: string
  triggers: string[]
  shareHint: string
  autonomousHook: string
  autonomousPartnerId: CharacterId
  autonomousReply: string
}

export interface WorldLocation {
  country: string
  province: string
  city: string
  district: string
  street: string
  address: string
  landmark: string
  latitude: number
  longitude: number
  accuracy: number
}

export interface WorldWeather {
  condition: string
  icon: string
  temperature: number
  feelsLike: number
  humidity: number
  wind: string
  precipitation: number
  warning: string | null
  warningId: string | null
  sources: string[]
  attributions: string[]
}

export interface WorldLocalNewsItem {
  id: string
  title: string
  summary: string
  url: string
  sourceName: string
  publishedAt: number
  relevance: number
}

export interface WorldSnapshot {
  id: string
  capturedAt: number
  location: EvidenceEnvelope<WorldLocation>
  weather: EvidenceEnvelope<WorldWeather>
  localNews?: EvidenceEnvelope<WorldLocalNewsItem[]>
}

export interface ConversationResult {
  intent: UserIntent
  decision: DirectorDecision
  messages: ChatMessage[]
  state: GroupState
}
