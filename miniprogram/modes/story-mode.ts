import { makeUserMessage } from '../core/conversation'
import type { GroupModeAdapter } from '../core/group-contract'
import { classifyIntent } from '../core/intent'
import { createInitialGroupState } from '../core/state'
import { advanceTopic, startUserTopic } from '../core/topic-engine'
import { modeDecision, modeMessages, type ModeLine } from './mode-utils'

const initialStoryModeState = {
  kind: 'story' as const,
  storyId: 'mist-harbor-letter',
  chapter: 1,
  turnCount: 0,
  scene: '雾港临时联络群',
  objective: '查清匿名来信与旧钟楼的关系',
  clues: ['没有署名的来信', '雾散前不要去旧钟楼'],
  userRole: '刚抵达雾港的收信人',
  lastAutonomousAt: null
}

function storyLines(text: string, turnCount: number, clues: string[]): ModeLine[] {
  const action = text.replace(/\s+/g, ' ').trim().slice(0, 36)
  if (turnCount === 1) {
    return [
      {
        speakerId: 'ning',
        motive: 'answer',
        text: `你说“${action}”，那我先把信封拍给你看：纸角有一枚褪色的海鸟水印，寄信人没有留下名字。`
      },
      {
        speakerId: 'qiao',
        motive: 'challenge',
        text: '先别把“不要去钟楼”自动理解成警告。它也可能是在确保我们一定会注意钟楼。'
      },
      {
        speakerId: 'axing',
        motive: 'ask',
        text: '我可以陪你走，但路线你定：先查寄信处，还是先远远看一眼旧钟楼？'
      }
    ]
  }
  if (turnCount === 2) {
    return [
      {
        speakerId: 'qiao',
        motive: 'expand',
        text: `顺着你的选择继续。港务旧档里，钟楼停摆时间被反复写成23:17，可那一页的日期被撕掉了。`
      },
      {
        speakerId: 'ning',
        motive: 'react',
        text: '23:17也写在信封内侧，铅笔很淡。它不像地址，更像一个必须记住的时刻。'
      },
      {
        speakerId: 'axing',
        motive: 'ask',
        text: '现在多了一条真线索。要追时间，还是追那张被撕掉的日期页？你选，我们不替你走。'
      }
    ]
  }
  return [
    {
      speakerId: 'axing',
      motive: 'react',
      text: `收到，你决定“${action}”。我按这个方向推进，只做你已经选的那一步。`
    },
    {
      speakerId: 'ning',
      motive: 'expand',
      text: `目前能确认的线索有：${clues.join('、')}。它们彼此有关，但还不足以说明寄信人是谁。`
    },
    {
      speakerId: 'qiao',
      motive: 'challenge',
      text: '还有个问题没解决：是谁希望我们避开钟楼，又为什么把足够多的线索留给我们靠近它？'
    }
  ]
}

export const storyModeAdapter: GroupModeAdapter = {
  mode: 'story',

  createInitialState(now = Date.now()) {
    return {
      ...createInitialGroupState(now),
      modeState: { ...initialStoryModeState, clues: [...initialStoryModeState.clues] }
    }
  },

  handleUserMessage(context) {
    const { state, text, now } = context
    const intent = classifyIntent(text)
    const topic = startUserTopic(text, intent, now)
    const userMessage = makeUserMessage(text, topic.id, now)
    const previous =
      state.modeState.kind === 'story'
        ? state.modeState
        : { ...initialStoryModeState, clues: [...initialStoryModeState.clues] }
    const turnCount = previous.turnCount + 1
    const clues = [...previous.clues]
    if (turnCount >= 1 && !clues.includes('信纸上的海鸟水印')) clues.push('信纸上的海鸟水印')
    if (turnCount >= 2 && !clues.includes('钟楼停摆时间23:17')) clues.push('钟楼停摆时间23:17')
    const lines = storyLines(text, turnCount, clues)
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
          chapter: 1 + Math.floor(turnCount / 4),
          turnCount,
          clues
        }
      }
    }
  },

  handleVisualMessage(context) {
    const { state, text, now, evidence } = context
    const topic = startUserTopic(text, 'CHAT', now)
    const userMessage = makeUserMessage('分享了一张图片', topic.id, now)
    const previous =
      state.modeState.kind === 'story'
        ? state.modeState
        : { ...initialStoryModeState, clues: [...initialStoryModeState.clues] }
    const uncertainty = evidence.uncertainties[0]
      ? `有一处我不敢说死：${evidence.uncertainties[0]}。`
      : '能看清的部分先到这里，不把画面外的事补进去。'
    const lines: ModeLine[] = [
      {
        speakerId: 'ning',
        motive: 'react',
        text: `我先按图里能看见的说：${evidence.summary}`
      },
      {
        speakerId: 'qiao',
        motive: 'challenge',
        text: uncertainty
      },
      {
        speakerId: 'axing',
        motive: 'ask',
        text: '这张图现在只是你带进群的参考，不自动算作雾港线索。你想拿它和哪条线索比，再由你决定。'
      }
    ]
    const decision = modeDecision(lines, now)
    const aiMessages = modeMessages(lines, topic.id, userMessage.id, now + 1)
    return {
      intent: 'CHAT',
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
        modeState: { ...previous, clues: [...previous.clues] }
      }
    }
  },

  createAutonomousRound(context) {
    const state = context.state.modeState
    if (state.kind !== 'story') return null
    const lines: ModeLine[] = [
      {
        speakerId: 'qiao',
        motive: 'react',
        text: '用户还没选下一步，我们先别替人推进。我只确认一件事：信封和港务旧档上的字迹不是同一只手。'
      },
      {
        speakerId: 'ning',
        motive: 'expand',
        text: '我也看出来了。信封里的23:17写得很轻，旧档上的数字却像故意压进纸里。'
      },
      {
        speakerId: 'axing',
        motive: 'close',
        text: '那就把“至少有两个人留下线索”记下来，等用户回来决定追哪一个。'
      }
    ]
    const now = context.now
    const clues = state.clues.includes('两种不同的字迹')
      ? state.clues
      : [...state.clues, '两种不同的字迹']
    return {
      decision: modeDecision(lines, now, 'character'),
      messages: modeMessages(lines, `story-autonomous-${now}`, 'group', now, 'autonomous'),
      topicTitle: '信封上的两种字迹',
      state: {
        ...context.state,
        lastMessageTime: now + lines.length,
        consecutiveAiMessages: lines.length,
        lastSpeakerId: lines[lines.length - 1].speakerId,
        modeState: { ...state, clues, lastAutonomousAt: now }
      }
    }
  }
}
