import { makeUserMessage } from '../core/conversation'
import type { GroupModeAdapter } from '../core/group-contract'
import { classifyIntent } from '../core/intent'
import { createInitialGroupState } from '../core/state'
import { advanceTopic, startUserTopic } from '../core/topic-engine'
import { modeDecision, modeMessages, type ModeLine } from './mode-utils'

function crossoverLines(text: string, collisionCount: number): ModeLine[] {
  const subject = text.replace(/\s+/g, ' ').trim().slice(0, 34)
  const rotate = collisionCount % 3
  const lines: ModeLine[] = [
    {
      speakerId: 'axing',
      motive: 'react',
      text: `在我的群岛航路里，“${subject}”第一反应当然是先把伙伴叫齐再动。你们不会又要先写三页规则吧？`
    },
    {
      speakerId: 'qiao',
      motive: 'challenge',
      text: '这就是典型的冒险世界思路：队伍先出发，漏洞路上补。术式学院这么干，第一道门禁就能把全队送回来。'
    },
    {
      speakerId: 'ning',
      motive: 'expand',
      text: '旧城的人会先问一句邀请是怎样写的。你们把礼数当拖延，我却觉得有些门只有说对话才会开。'
    }
  ]
  return [...lines.slice(rotate), ...lines.slice(0, rotate)]
}

export const crossoverSalonModeAdapter: GroupModeAdapter = {
  mode: 'crossover_salon',

  createInitialState(now = Date.now()) {
    return {
      ...createInitialGroupState(now),
      modeState: {
        kind: 'crossover_salon',
        scene: '漫展中立会客区',
        collisionCount: 0,
        lastContrast: null,
        lastAutonomousAt: null
      }
    }
  },

  handleUserMessage(context) {
    const { state, text, now } = context
    const intent = classifyIntent(text)
    const topic = startUserTopic(text, intent, now)
    const userMessage = makeUserMessage(text, topic.id, now)
    const previous =
      state.modeState.kind === 'crossover_salon'
        ? state.modeState
        : {
            kind: 'crossover_salon' as const,
            scene: '漫展中立会客区',
            collisionCount: 0,
            lastContrast: null,
            lastAutonomousAt: null
          }
    const collisionCount = previous.collisionCount + 1
    const lines = crossoverLines(text, collisionCount)
    const decision = modeDecision(lines, now)
    const aiMessages = modeMessages(lines, topic.id, userMessage.id, now + 1)
    return {
      intent,
      decision,
      messages: [userMessage, ...aiMessages],
      state: {
        ...state,
        currentTopic: advanceTopic(topic, aiMessages.length, now + aiMessages.length + 1),
        currentFocus: text,
        currentOpportunityId: null,
        silenceUntil: null,
        lastMessageTime: now + aiMessages.length + 1,
        consecutiveAiMessages: aiMessages.length,
        lastSpeakerId: aiMessages[aiMessages.length - 1].speakerId,
        modeState: {
          ...previous,
          collisionCount,
          lastContrast: '行动优先、规则优先与表达礼数的差异'
        }
      }
    }
  },

  createAutonomousRound(context) {
    const previous =
      context.state.modeState.kind === 'crossover_salon'
        ? context.state.modeState
        : {
            kind: 'crossover_salon' as const,
            scene: '漫展中立会客区',
            collisionCount: 0,
            lastContrast: null,
            lastAutonomousAt: null
          }
    const lines: ModeLine[] = [
      {
        speakerId: 'qiao',
        motive: 'challenge',
        text: '我刚发现一个跨世界交流难题：阿星说“先上船”，默认每个人都会游泳；在我的学院，这属于没写前置条件。'
      },
      {
        speakerId: 'axing',
        motive: 'react',
        text: '那我现在补前置条件：不会游泳的先拿救生衣。你看，规则也不用写到天黑。'
      },
      {
        speakerId: 'ning',
        motive: 'close',
        text: '一个负责让人出发，一个负责不让人掉下去。这样看，你们倒没有自己以为的那么相反。'
      }
    ]
    const now = context.now
    const topicId = `crossover-autonomous-${now}`
    return {
      decision: modeDecision(lines, now, 'character'),
      messages: modeMessages(lines, topicId, 'group', now, 'autonomous'),
      topicTitle: '不同世界的前置条件',
      state: {
        ...context.state,
        lastMessageTime: now + lines.length,
        consecutiveAiMessages: lines.length,
        lastSpeakerId: lines[lines.length - 1].speakerId,
        modeState: {
          ...previous,
          collisionCount: previous.collisionCount + 1,
          lastContrast: '冒险直觉与规则前置条件',
          lastAutonomousAt: now
        }
      }
    }
  }
}
