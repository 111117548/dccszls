import type { ChatMessage, DelayProfile } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function stableJitter(value: string, range: number): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 33 + value.charCodeAt(index)) >>> 0
  return hash % Math.max(1, range)
}

export function playbackDelay(
  message: ChatMessage,
  previousSpeakerId: ChatMessage['speakerId'] = null,
  isFirst = false
): number {
  const profile: DelayProfile = message.delayProfile ?? 'normal'
  const lengthDelay = Math.min(1400, message.text.trim().length * 24)
  const profileBase: Record<DelayProfile, number> = {
    quick: 350,
    normal: 600,
    thoughtful: 1100,
    afterthought: 3000
  }
  const speakerSwitch = previousSpeakerId && previousSpeakerId !== message.speakerId ? 450 : 0
  const sameSpeaker = previousSpeakerId === message.speakerId ? -180 : 0
  const firstAdjustment = isFirst ? 150 : 0
  const jitter = stableJitter(message.id, 360)
  const raw = profileBase[profile] + lengthDelay + speakerSwitch + sameSpeaker + firstAdjustment + jitter
  return profile === 'afterthought' ? clamp(raw, 3000, 8000) : clamp(raw, 550, 3500)
}

export function isCancellableMessage(message: ChatMessage): boolean {
  return message.required !== true
}
