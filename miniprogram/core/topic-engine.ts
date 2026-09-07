import { clamp } from './state'
import { topicKindForIntent } from './intent'
import type { TopicStage, TopicState, UserIntent } from './types'

function topicTitle(text: string): string {
  const compact = text.trim().replace(/\s+/g, ' ')
  return compact.length > 18 ? `${compact.slice(0, 18)}…` : compact
}

export function startUserTopic(text: string, intent: UserIntent, now = Date.now()): TopicState {
  const kind = topicKindForIntent(intent, text)
  return {
    id: `topic-${now}`,
    type: kind,
    title: topicTitle(text) || '等待澄清',
    source: 'user',
    energy: intent === 'QUESTION' || intent === 'REQUEST' ? 68 : 58,
    stage: 'START',
    messageCount: 0,
    createdAt: now,
    lastActiveAt: now,
    lockedByUser: true
  }
}

export function advanceTopic(topic: TopicState, addedMessages: number, now = Date.now()): TopicState {
  const messageCount = topic.messageCount + Math.max(0, addedMessages)
  let stage: TopicStage = topic.stage
  if (messageCount >= 8) stage = 'COOLING'
  else if (messageCount >= 5) stage = 'PEAK'
  else if (messageCount >= 2) stage = 'GROWING'
  return {
    ...topic,
    messageCount,
    stage,
    energy: clamp(topic.energy - Math.max(0, addedMessages) * 7, 0, 100),
    lastActiveAt: now
  }
}

export function endTopic(topic: TopicState, now = Date.now()): TopicState {
  return { ...topic, stage: 'ENDED', energy: 0, lockedByUser: false, lastActiveAt: now }
}

export function unlockIfInactive(topic: TopicState, now = Date.now(), inactivityMs = 10 * 60 * 1000): TopicState {
  if (!topic.lockedByUser || now - topic.lastActiveAt < inactivityMs) return topic
  return { ...topic, lockedByUser: false, stage: topic.stage === 'ENDED' ? 'ENDED' : 'COOLING' }
}
