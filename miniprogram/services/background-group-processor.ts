import { makeOpportunityReplies } from '../core/conversation'
import { directOpportunity } from '../core/director'
import { checkActiveMessageBudget } from '../core/message-budget'
import { unlockIfInactive } from '../core/topic-engine'
import type {
  ChatMessage,
  EvidenceEnvelope,
  Opportunity,
  WorldSnapshot
} from '../core/types'
import { groupDefinitions } from '../data/groups'
import { createGroupRuntime } from '../modes/registry'
import {
  markGroupEventConsumed,
  pendingGroupEvents,
  recordWorldOpportunities
} from './event-ledger'
import {
  loadGroupSession,
  persistGroupMessages
} from './group-session-repository'

export interface PassiveProcessingResult {
  generatedMessages: number
  affectedGroups: string[]
}

function proactiveTimestamps(messages: ChatMessage[]): number[] {
  return messages
    .filter(
      (message) =>
        message.senderType === 'ai' &&
        (message.trigger === 'world' || message.trigger === 'autonomous')
    )
    .map((message) => message.createdAt)
}

export async function processWorldOpportunitiesForGroups(
  opportunities: Opportunity[],
  evidence: EvidenceEnvelope<unknown>[],
  world: WorldSnapshot,
  now = Date.now()
): Promise<PassiveProcessingResult> {
  let generatedMessages = 0
  const affectedGroups: string[] = []
  if (!opportunities.length) return { generatedMessages, affectedGroups }

  for (const group of groupDefinitions.filter((candidate) => candidate.capabilities.proactiveWorld)) {
    recordWorldOpportunities(group.id, opportunities, now)
    const session = await loadGroupSession(group.id)
    const compatibleState =
      session.state?.modeState.kind === group.mode ? session.state : undefined
    const runtime = createGroupRuntime(group.id, world, compatibleState)

    for (const opportunity of [...opportunities].sort(
      (left, right) => right.importance - left.importance
    )) {
      const event = pendingGroupEvents(group.id, now).find(
        (candidate) => candidate.opportunityId === opportunity.id
      )
      if (!event) continue
      let state = runtime.getState()
      if (state.currentTopic) {
        state = { ...state, currentTopic: unlockIfInactive(state.currentTopic, now) }
        runtime.replaceState(state)
      }
      const decision = directOpportunity(state, opportunity, {
        now,
        production: true,
        evidence
      })
      if (!decision.shouldSpeak) continue
      const budget = checkActiveMessageBudget(
        proactiveTimestamps(session.messages),
        session.unreadCount,
        decision.maxAiBubbles,
        now
      )
      if (!budget.allowed) continue

      const messages = makeOpportunityReplies(
        decision.beats,
        opportunity,
        `world-topic-${opportunity.id}`,
        now
      )
      const currentState = runtime.getState()
      const nextState = {
        ...currentState,
        currentOpportunityId: opportunity.id,
        seenOpportunityIds: [...currentState.seenOpportunityIds, opportunity.id].slice(-100),
        cooldowns: {
          ...currentState.cooldowns,
          [opportunity.type]:
            now + (opportunity.type === 'weather' ? 60 * 60_000 : 6 * 60 * 60_000)
        },
        consecutiveAiMessages: messages.length,
        unreadCount: Math.min(30, session.unreadCount + messages.length),
        lastMessageTime: now,
        lastSpeakerId: messages[messages.length - 1]?.speakerId ?? currentState.lastSpeakerId
      }
      runtime.replaceState(nextState)
      await persistGroupMessages(group.id, messages, nextState, false)
      markGroupEventConsumed(group.id, event.id, messages.map((message) => message.id), now)
      generatedMessages += messages.length
      affectedGroups.push(group.id)
      break
    }
  }
  return { generatedMessages, affectedGroups }
}
