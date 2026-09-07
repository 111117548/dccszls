import { makePrototypeReplies, makeUserMessage } from '../core/conversation'
import { directUserMessage } from '../core/director'
import type { GroupModeAdapter } from '../core/group-contract'
import { classifyIntent } from '../core/intent'
import { createInitialGroupState } from '../core/state'
import { advanceTopic, startUserTopic } from '../core/topic-engine'

export const companionModeAdapter: GroupModeAdapter = {
  mode: 'companion',

  createInitialState(now = Date.now()) {
    return createInitialGroupState(now)
  },

  handleUserMessage(context) {
    const { state, world, text, now, excludedStoryIds } = context
    const intent = classifyIntent(text)
    const topic = startUserTopic(text, intent, now)
    const userMessage = makeUserMessage(text, topic.id, now)

    const stateForDirector = {
      ...state,
      currentTopic: topic,
      currentFocus: text,
      currentOpportunityId: null,
      silenceUntil: null,
      consecutiveAiMessages: 0,
      lastMessageTime: now
    }

    const decision = directUserMessage(stateForDirector, intent, text, now, excludedStoryIds)
    const aiMessages = makePrototypeReplies(
      decision.beats,
      decision.maxAiBubbles,
      intent,
      text,
      topic.id,
      userMessage.id,
      world,
      now + 1
    )
    const advancedTopic = advanceTopic(topic, aiMessages.length, now + aiMessages.length + 1)
    const nextState = {
      ...stateForDirector,
      currentTopic: advancedTopic,
      lastMessageTime: now + aiMessages.length + 1,
      consecutiveAiMessages: aiMessages.length,
      lastSpeakerId: aiMessages[aiMessages.length - 1]?.speakerId ?? state.lastSpeakerId,
      modeState: {
        kind: 'companion' as const,
        sharedMoments:
          state.modeState.kind === 'companion' ? state.modeState.sharedMoments + 1 : 1
      }
    }

    return {
      intent,
      decision,
      messages: [userMessage, ...aiMessages],
      state: nextState
    }
  }
}
