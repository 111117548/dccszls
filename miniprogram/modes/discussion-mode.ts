import { makeUserMessage } from '../core/conversation'
import type { GroupModeAdapter } from '../core/group-contract'
import { classifyIntent } from '../core/intent'
import { createInitialGroupState } from '../core/state'
import { advanceTopic, startUserTopic } from '../core/topic-engine'
import { modeDecision, modeMessages, type ModeLine } from './mode-utils'

function discussionLines(text: string, phase: string): ModeLine[] {
  const subject = text.replace(/\s+/g, ' ').trim().slice(0, 42)
  return [
    {
      speakerId: 'qiao',
      motive: 'answer',
      text: `先把核心问题钉住：你现在真正要判断的是“${subject}”里的哪一个选择。已知事实和猜测要分开。`
    },
    {
      speakerId: 'ning',
      motive: 'challenge',
      text: '我补一个容易被逻辑表格漏掉的角度：这个选择会让谁更安心、让谁承担隐形代价，也应该算进条件。'
    },
    {
      speakerId: 'axing',
      motive: phase === 'SYNTHESIZE' ? 'close' : 'expand',
      text:
        phase === 'SYNTHESIZE'
          ? '先给一个暂时结论，再列出还缺的证据；别等到百分之百确定才动。'
          : '如果现在还没有结论，就设计一个成本最低的小测试。做完能多知道一点，比继续空想强。'
    }
  ]
}

export const discussionModeAdapter: GroupModeAdapter = {
  mode: 'discussion',

  createInitialState(now = Date.now()) {
    return {
      ...createInitialGroupState(now),
      modeState: {
        kind: 'discussion',
        phase: 'OPEN',
        turnCount: 0,
        question: null,
        perspectives: []
      }
    }
  },

  handleUserMessage(context) {
    const { state, text, now } = context
    const intent = classifyIntent(text)
    const topic = startUserTopic(text, intent, now)
    const userMessage = makeUserMessage(text, topic.id, now)
    const previous =
      state.modeState.kind === 'discussion'
        ? state.modeState
        : { kind: 'discussion' as const, phase: 'OPEN' as const, turnCount: 0, question: null, perspectives: [] }
    const turnCount = previous.turnCount + 1
    const phase =
      turnCount >= 4 ? 'SYNTHESIZE' : turnCount >= 2 ? 'COMPARE' : 'EXPLORE'
    const lines = discussionLines(text, phase)
    const decision = modeDecision(lines, now)
    const aiMessages = modeMessages(lines, topic.id, userMessage.id, now + 1)
    const nextTopic = advanceTopic(topic, aiMessages.length, now + aiMessages.length + 1)
    return {
      intent,
      decision,
      messages: [userMessage, ...aiMessages],
      state: {
        ...state,
        currentTopic: nextTopic,
        currentFocus: text,
        currentOpportunityId: null,
        silenceUntil: null,
        lastMessageTime: now + aiMessages.length + 1,
        consecutiveAiMessages: aiMessages.length,
        lastSpeakerId: aiMessages[aiMessages.length - 1].speakerId,
        modeState: {
          kind: 'discussion',
          phase,
          turnCount,
          question: previous.question || text.slice(0, 120),
          perspectives: ['事实与假设', '关系与隐性代价', '低成本行动']
        }
      }
    }
  }
}
