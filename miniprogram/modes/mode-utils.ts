import { characterById } from '../data/characters'
import type {
  CharacterId,
  ChatMessage,
  ConversationBeat,
  ConversationMotive,
  DirectorDecision
} from '../core/types'

export interface ModeLine {
  speakerId: CharacterId
  text: string
  motive: ConversationMotive
}

function timeLabel(now: number): string {
  const date = new Date(now)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function modeDecision(
  lines: ModeLine[],
  now: number,
  target: 'user' | 'character' = 'user'
): DirectorDecision {
  const beats: ConversationBeat[] = lines.slice(0, 3).map((line, index) => ({
    speakerId: line.speakerId,
    motive: line.motive,
    replyTarget: index === 0 ? (target === 'character' ? 'group' : 'user') : lines[index - 1].speakerId,
    required: true,
    minBubbles: 1,
    maxBubbles: 1,
    storyId: null,
    delayProfile: line.motive === 'support' ? 'thoughtful' : 'normal',
    stopAfter: index === Math.min(3, lines.length) - 1
  }))
  return {
    shouldSpeak: beats.length > 0,
    reason: target === 'character' ? 'mode_specific_autonomous_round' : 'mode_specific_user_round',
    speakers: beats.map((beat) => beat.speakerId),
    maxMessages: beats.length,
    maxAiBubbles: beats.length,
    replyTarget: target,
    endTopicAfterRound: false,
    beats,
    cancellable: true,
    expiresAt: now + 30_000
  }
}

export function modeMessages(
  lines: ModeLine[],
  topicId: string,
  replyToMessageId: string,
  now: number,
  trigger: ChatMessage['trigger'] = 'user'
): ChatMessage[] {
  let previousId = replyToMessageId
  return lines.slice(0, 3).map((line, index) => {
    const id = `mode-${topicId}-${now}-${index}`
    const createdAt = now + index * 1000
    const message: ChatMessage = {
      id,
      senderType: 'ai',
      speakerId: line.speakerId,
      speakerName: characterById[line.speakerId].name,
      text: line.text,
      createdAt,
      timeLabel: timeLabel(createdAt),
      topicId,
      replyToMessageId: previousId,
      isAiGenerated: true,
      motive: line.motive,
      delayProfile: line.motive === 'support' ? 'thoughtful' : 'normal',
      required: true,
      storyId: null,
      turnId: `mode-turn-${topicId}-${index}`,
      bubbleIndex: 0,
      trigger
    }
    previousId = id
    return message
  })
}
