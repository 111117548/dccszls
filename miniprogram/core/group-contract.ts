import type {
  CharacterId,
  ConversationResult,
  GroupState,
  VisualEvidence,
  WorldSnapshot
} from './types'
import type { ChatMessage, DirectorDecision } from './types'

export type GroupMode = 'companion' | 'discussion' | 'crossover_salon' | 'story'

export interface GroupWelcome {
  speakerId: CharacterId
  text: string
}

export interface GroupCapabilities {
  worldAware: boolean
  proactiveWorld: boolean
  autonomousConversation: boolean
  structuredDiscussion: boolean
  narrativeProgression: boolean
  imageUnderstanding: boolean
}

export interface GroupDefinition {
  id: string
  name: string
  description: string
  mode: GroupMode
  memberIds: CharacterId[]
  disclosure: string
  welcome: GroupWelcome
  capabilities: GroupCapabilities
  modeLabel: string
  modeInstructions: string[]
  memberRoles: Partial<Record<CharacterId, string>>
}

export interface GroupModeContext {
  group: GroupDefinition
  state: GroupState
  world: WorldSnapshot
  text: string
  now: number
  excludedStoryIds: string[]
}

export interface GroupModeAdapter {
  readonly mode: GroupMode
  createInitialState(now?: number): GroupState
  handleUserMessage(context: GroupModeContext): ConversationResult
  handleVisualMessage?(context: GroupModeContext & { evidence: VisualEvidence }): ConversationResult
  createAutonomousRound?(context: Omit<GroupModeContext, 'text' | 'excludedStoryIds'>): ModeAutonomousResult | null
}

export interface ModeAutonomousResult {
  decision: DirectorDecision
  messages: ChatMessage[]
  state: GroupState
  topicTitle: string
}
