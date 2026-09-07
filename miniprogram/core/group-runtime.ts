import type { GroupDefinition, GroupModeAdapter } from './group-contract'
import type { ModeAutonomousResult } from './group-contract'
import type {
  ConversationResult,
  GroupModeState,
  GroupState,
  VisualEvidence,
  WorldSnapshot
} from './types'
import { visualTopicText } from './visual-evidence'

function cloneModeState(state: GroupModeState): GroupModeState {
  if (state.kind === 'discussion') {
    return { ...state, perspectives: [...state.perspectives] }
  }
  if (state.kind === 'story') {
    return { ...state, clues: [...state.clues] }
  }
  return { ...state }
}

function cloneState(state: GroupState): GroupState {
  return {
    ...state,
    currentTopic: state.currentTopic ? { ...state.currentTopic } : null,
    cooldowns: { ...state.cooldowns },
    seenOpportunityIds: [...state.seenOpportunityIds],
    modeState: cloneModeState(state.modeState)
  }
}

export class GroupRuntime {
  private readonly definition: GroupDefinition
  private readonly adapter: GroupModeAdapter
  private state: GroupState
  private world: WorldSnapshot

  constructor(
    definition: GroupDefinition,
    adapter: GroupModeAdapter,
    world: WorldSnapshot,
    initialState?: GroupState
  ) {
    if (definition.mode !== adapter.mode) {
      throw new Error(`Group mode "${definition.mode}" has no matching adapter`)
    }
    this.definition = definition
    this.adapter = adapter
    this.world = world
    this.state = initialState ?? adapter.createInitialState()
  }

  getDefinition(): GroupDefinition {
    return {
      ...this.definition,
      memberIds: [...this.definition.memberIds],
      capabilities: { ...this.definition.capabilities },
      welcome: { ...this.definition.welcome },
      modeInstructions: [...this.definition.modeInstructions],
      memberRoles: { ...this.definition.memberRoles }
    }
  }

  getState(): GroupState {
    return cloneState(this.state)
  }

  replaceState(state: GroupState): void {
    this.state = cloneState(state)
  }

  setWorld(world: WorldSnapshot): void {
    this.world = world
  }

  handleUserMessage(text: string, now = Date.now(), excludedStoryIds: string[] = []): ConversationResult {
    const result = this.adapter.handleUserMessage({
      group: this.definition,
      state: cloneState(this.state),
      world: this.world,
      text,
      now,
      excludedStoryIds
    })
    this.state = cloneState(result.state)
    return { ...result, state: this.getState() }
  }

  handleVisualMessage(
    evidence: VisualEvidence,
    caption = '',
    now = Date.now()
  ): ConversationResult {
    const context = {
      group: this.definition,
      state: cloneState(this.state),
      world: this.world,
      text: visualTopicText(evidence, caption),
      now,
      excludedStoryIds: [],
      evidence
    }
    const result = this.adapter.handleVisualMessage
      ? this.adapter.handleVisualMessage(context)
      : this.adapter.handleUserMessage(context)
    this.state = cloneState(result.state)
    return { ...result, state: this.getState() }
  }

  createAutonomousRound(now = Date.now()): ModeAutonomousResult | null {
    if (!this.adapter.createAutonomousRound) return null
    const result = this.adapter.createAutonomousRound({
      group: this.definition,
      state: cloneState(this.state),
      world: this.world,
      now
    })
    return result
      ? {
          ...result,
          state: cloneState(result.state),
          messages: result.messages.map((message) => ({ ...message }))
        }
      : null
  }
}
