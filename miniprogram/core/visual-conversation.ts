import type { GroupMode } from './group-contract'
import type {
  CharacterId,
  ChatMessage,
  ConversationMotive,
  VisualEvidence
} from './types'
import { characterById } from '../data/characters'

interface VisualLine {
  speakerId: CharacterId
  motive: ConversationMotive
  text: string
}

function visualLines(mode: GroupMode, evidence: VisualEvidence): VisualLine[] {
  const summary = evidence.summary
  const detail = evidence.notableDetails[0] || evidence.objects[0] || ''
  const uncertainty = evidence.uncertainties[0] || ''
  if (mode === 'discussion') {
    return [
      {
        speakerId: 'qiao',
        motive: 'answer',
        text: `先只放能确认的部分：${summary}`
      },
      {
        speakerId: 'ning',
        motive: 'expand',
        text: detail
          ? `我会多留意这个细节：${detail}。它可能影响我们怎么理解这张图，但先不替它补背景。`
          : '画面能提供一些观察，但还不足以替代你的目的和上下文。'
      },
      {
        speakerId: 'axing',
        motive: 'ask',
        text: uncertainty
          ? `还有一处没看准：${uncertainty}。你想讨论图里的内容，还是用它解决一个具体问题？`
          : '图里能看到的先齐了。你想让我们评价、比较，还是一起想下一步？'
      }
    ]
  }
  if (mode === 'crossover_salon') {
    return [
      {
        speakerId: 'axing',
        motive: 'react',
        text: `我先按群岛航路的眼睛看：${summary}${detail ? `，最抓我的是${detail}` : ''}。`
      },
      {
        speakerId: 'qiao',
        motive: 'challenge',
        text: '先提醒一下，图里没出现的背景条件一概不算。阿星已经快把一张图补成出航任务了。'
      },
      {
        speakerId: 'ning',
        motive: 'close',
        text: uncertainty
          ? `我倒想把没看准的地方留白：${uncertainty}。留白比猜错更体面。`
          : '三种世界可以有三种联想，但画面本身只有一份，别把联想冒充成事实。'
      }
    ]
  }
  if (mode === 'story') {
    return [
      { speakerId: 'ning', motive: 'react', text: `我先按图里能看见的说：${summary}` },
      {
        speakerId: 'qiao',
        motive: 'challenge',
        text: uncertainty ? `这部分不能确认：${uncertainty}。` : '画面外的来历和时间都还不能确认。'
      },
      {
        speakerId: 'axing',
        motive: 'ask',
        text: '它现在只是你带进群的参考，不自动算雾港线索。你想怎么用，由你来定。'
      }
    ]
  }
  if (evidence.category === 'food') {
    return [
      {
        speakerId: 'axing',
        motive: 'react',
        text: `这张我确实先看见吃的了：${summary}${detail ? `，尤其是${detail}` : ''}。`
      },
      {
        speakerId: 'ning',
        motive: 'expand',
        text: uncertainty
          ? `我不太确定的是：${uncertainty}。味道和店名就更不能只凭照片猜。`
          : '照片能看见样子，味道和当时的感受还是得听你说。'
      }
    ]
  }
  return [
    {
      speakerId: 'ning',
      motive: 'react',
      text: `我先说自己真的看见的：${summary}`
    },
    {
      speakerId: 'qiao',
      motive: uncertainty ? 'challenge' : 'expand',
      text: uncertainty
        ? `这处还不能确认：${uncertainty}。先不靠想象把它补满。`
        : detail
          ? `有个细节挺抓眼：${detail}。不过它的来历还得听你说。`
          : '画面之外的地点、时间和前因后果，我们先不替你编。'
    }
  ]
}

function timeLabel(now: number): string {
  const date = new Date(now)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function makeVisualFallbackReplies(
  mode: GroupMode,
  evidence: VisualEvidence,
  topicId: string,
  userMessageId: string,
  now = Date.now()
): ChatMessage[] {
  let replyTo = userMessageId
  return visualLines(mode, evidence).slice(0, 3).map((line, index) => {
    const id = `visual-fallback-${evidence.id}-${now}-${index}`
    const message: ChatMessage = {
      id,
      senderType: 'ai',
      speakerId: line.speakerId,
      speakerName: characterById[line.speakerId].name,
      text: line.text,
      createdAt: now + index * 1000,
      timeLabel: timeLabel(now + index * 1000),
      topicId,
      replyToMessageId: replyTo,
      isAiGenerated: true,
      motive: line.motive,
      delayProfile: line.motive === 'challenge' ? 'thoughtful' : 'normal',
      required: index === 0,
      storyId: null,
      turnId: `visual-turn-${evidence.id}-${index}`,
      bubbleIndex: 0,
      trigger: 'image',
      contentType: 'text',
      image: null,
      visualEvidence: null
    }
    replyTo = id
    return message
  })
}

export function makeVisualUnavailableReplies(
  mode: GroupMode,
  topicId: string,
  userMessageId: string,
  now = Date.now()
): ChatMessage[] {
  const lines: Record<GroupMode, VisualLine> = {
    companion: {
      speakerId: 'ning',
      motive: 'acknowledge',
      text: '图片收到了，不过我这边暂时没看清，就先不乱猜。你愿意说说最想让我们注意哪里吗？'
    },
    discussion: {
      speakerId: 'qiao',
      motive: 'acknowledge',
      text: '图片收到了，但识别服务暂时不可用，我现在不能可靠判断里面是什么。你可以先告诉我们想讨论哪一处。'
    },
    crossover_salon: {
      speakerId: 'ning',
      motive: 'acknowledge',
      text: '图是收到了，只是眼下还看不清内容。若随口乱猜，反倒辜负你这一番分享；你最想让我们看哪里？'
    },
    story: {
      speakerId: 'qiao',
      motive: 'acknowledge',
      text: '图片收到，但现在还不能可靠识别，因此不会自动算作故事线索。你可以先描述想让我们留意的部分。'
    }
  }
  const line = lines[mode]
  return [
    {
      id: `visual-unavailable-${userMessageId}-${now}`,
      senderType: 'ai',
      speakerId: line.speakerId,
      speakerName: characterById[line.speakerId].name,
      text: line.text,
      createdAt: now,
      timeLabel: timeLabel(now),
      topicId,
      replyToMessageId: userMessageId,
      isAiGenerated: true,
      motive: line.motive,
      delayProfile: 'normal',
      required: true,
      storyId: null,
      turnId: `visual-unavailable-turn-${userMessageId}`,
      bubbleIndex: 0,
      trigger: 'image',
      contentType: 'text',
      image: null,
      visualEvidence: null
    }
  ]
}
