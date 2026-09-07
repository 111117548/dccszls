import { selectRelevantStories, selectStoryForSharing } from '../data/characters'
import type {
  CharacterId,
  CharacterStorySeed,
  ConversationBeat,
  ConversationMotive,
  DirectorDecision,
  EvidenceEnvelope,
  GroupState,
  Opportunity,
  UserIntent
} from './types'

const allCharacters: CharacterId[] = ['axing', 'qiao', 'ning']

function preferredSpeaker(intent: UserIntent): CharacterId {
  if (intent === 'EMOTION' || intent === 'WEATHER_QUERY') return 'ning'
  if (intent === 'ACTION' || intent === 'LOCATION_QUERY') return 'axing'
  if (
    intent === 'OPINION' ||
    intent === 'QUESTION' ||
    intent === 'REQUEST' ||
    intent === 'NEWS_QUERY'
  ) return 'qiao'
  return 'axing'
}

function orderedSpeakers(first: CharacterId, last: CharacterId | null): CharacterId[] {
  const ordered = [first, ...allCharacters.filter((id) => id !== first)]
  if (!last || ordered[0] !== last) return ordered
  return [ordered[1], ordered[0], ordered[2]]
}

function hashPercent(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  return hash % 100
}

function asksForCharacterStory(text: string): boolean {
  if (/(附近|周围|这边|当地|我现在的位置)/.test(text)) return false
  return /(故事|有意思的事|有趣的事|分享.{0,8}(事情|经历)|你们.{0,8}(以前|最近).{0,8}(经历|做过|发生))/i.test(text)
}

function targetBubbleCount(intent: UserIntent, text: string, now: number): number {
  if (intent === 'NONSENSE') return 1
  if (asksForCharacterStory(text)) return 3
  const sample = hashPercent(`${text}:${intent}:${Math.floor(now / 60000)}`)
  if (intent === 'EMOTION') return sample < 30 ? 1 : 2
  if (intent === 'OPINION' || intent === 'CHAT' || intent === 'TOPIC_CHANGE') {
    return sample < 70 ? 2 : 3
  }
  if (
    intent === 'QUESTION' ||
    intent === 'REQUEST' ||
    intent === 'ACTION' ||
    intent === 'LOCATION_QUERY' ||
    intent === 'WEATHER_QUERY' ||
    intent === 'NEWS_QUERY'
  ) {
    return sample < 80 ? 2 : 3
  }
  return 2
}

function firstMotive(intent: UserIntent): ConversationMotive {
  if (intent === 'EMOTION') return 'support'
  if (
    intent === 'QUESTION' ||
    intent === 'REQUEST' ||
    intent === 'LOCATION_QUERY' ||
    intent === 'WEATHER_QUERY' ||
    intent === 'NEWS_QUERY'
  ) {
    return 'answer'
  }
  if (intent === 'OPINION') return 'answer'
  if (intent === 'NONSENSE') return 'ask'
  return 'acknowledge'
}

function supportMotive(intent: UserIntent, index: number): ConversationMotive {
  if (intent === 'EMOTION') return index === 1 ? 'support' : 'close'
  if (intent === 'OPINION') return index === 1 ? 'challenge' : 'close'
  if (
    intent === 'QUESTION' ||
    intent === 'REQUEST' ||
    intent === 'ACTION' ||
    intent === 'LOCATION_QUERY' ||
    intent === 'WEATHER_QUERY' ||
    intent === 'NEWS_QUERY'
  ) {
    return index === 1 ? 'expand' : 'react'
  }
  return index === 1 ? 'react' : 'close'
}

function decision(
  reason: string,
  beats: ConversationBeat[],
  maxAiBubbles: number,
  replyTarget: DirectorDecision['replyTarget'],
  endTopicAfterRound: boolean,
  now: number,
  cancellable = true
): DirectorDecision {
  return {
    shouldSpeak: beats.length > 0,
    reason,
    speakers: beats.map((beat) => beat.speakerId),
    maxMessages: maxAiBubbles,
    maxAiBubbles,
    replyTarget,
    endTopicAfterRound,
    beats,
    cancellable,
    expiresAt: now + 30_000
  }
}

export function directUserMessage(
  state: GroupState,
  intent: UserIntent,
  userText = '',
  now = Date.now(),
  excludedStoryIds: string[] = []
): DirectorDecision {
  const first = preferredSpeaker(intent)
  const speakers = orderedSpeakers(first, state.lastSpeakerId)
  const maxAiBubbles = targetBubbleCount(intent, userText, now)
  const relevantStories = userText ? selectRelevantStories(userText, speakers, excludedStoryIds, 1) : []
  const requestedStory =
    userText && asksForCharacterStory(userText)
      ? selectStoryForSharing([speakers[0]], excludedStoryIds, `${userText}:${Math.floor(now / 60_000)}`)
      : null
  const stories = relevantStories.length ? relevantStories : requestedStory ? [requestedStory] : []
  const story = maxAiBubbles >= 2 ? stories[0] ?? null : null
  const beats: ConversationBeat[] = []

  const storyBelongsToFirst = story?.ownerId === speakers[0]
  beats.push({
    speakerId: speakers[0],
    motive: firstMotive(intent),
    replyTarget: 'user',
    required: true,
    minBubbles: 1,
    maxBubbles: storyBelongsToFirst && maxAiBubbles >= 2 ? 2 : 1,
    storyId: storyBelongsToFirst ? story.id : null,
    delayProfile: intent === 'EMOTION' ? 'thoughtful' : 'normal',
    stopAfter: maxAiBubbles === 1
  })

  let availableBubbles = maxAiBubbles - 1
  if (storyBelongsToFirst && availableBubbles > 0) availableBubbles -= 1

  if (story && !storyBelongsToFirst && availableBubbles > 0) {
    beats.push({
      speakerId: story.ownerId,
      motive: 'share_story',
      replyTarget: speakers[0],
      required: true,
      minBubbles: 1,
      maxBubbles: 1,
      storyId: story.id,
      delayProfile: 'thoughtful',
      stopAfter: availableBubbles === 1
    })
    availableBubbles -= 1
  }

  let candidateIndex = 1
  while (availableBubbles > 0 && candidateIndex < speakers.length) {
    const speakerId = speakers[candidateIndex]
    if (!beats.some((beat) => beat.speakerId === speakerId)) {
      const requiredBubbles = beats.reduce(
        (total, beat) => total + (beat.required ? beat.minBubbles ?? 1 : 0),
        0
      )
      beats.push({
        speakerId,
        motive: supportMotive(intent, candidateIndex),
        replyTarget: beats[beats.length - 1].speakerId,
        required: (requiredBubbles < 2 && maxAiBubbles >= 2) || asksForCharacterStory(userText),
        minBubbles: 1,
        maxBubbles: 1,
        storyId: null,
        delayProfile: intent === 'EMOTION' ? 'thoughtful' : 'normal',
        stopAfter: availableBubbles === 1
      })
      availableBubbles -= 1
    }
    candidateIndex += 1
  }

  if (beats.length) beats[beats.length - 1].stopAfter = true
  return decision('user_message_has_priority', beats, maxAiBubbles, 'user', intent === 'NONSENSE', now)
}

export interface OpportunityContext {
  now: number
  production: boolean
  evidence: EvidenceEnvelope<unknown>[]
}

function silentDecision(reason: string, now: number): DirectorDecision {
  return decision(reason, [], 0, 'world_change', false, now)
}

export function directOpportunity(
  state: GroupState,
  opportunity: Opportunity,
  context: OpportunityContext
): DirectorDecision {
  if (opportunity.expiresAt <= context.now) return silentDecision('opportunity_expired', context.now)
  if (opportunity.importance < 70 || opportunity.confidence < 0.75) {
    return silentDecision('opportunity_low_value', context.now)
  }
  if (state.currentTopic?.lockedByUser) return silentDecision('user_topic_locked', context.now)
  if (state.consecutiveAiMessages >= 3) {
    return silentDecision('group_needs_silence', context.now)
  }
  if (state.silenceUntil && state.silenceUntil > context.now) {
    return silentDecision('silence_window_active', context.now)
  }
  if (state.seenOpportunityIds.includes(opportunity.id)) {
    return silentDecision('opportunity_already_seen', context.now)
  }
  const cooldownUntil = state.cooldowns[opportunity.type]
  if (cooldownUntil && cooldownUntil > context.now) return silentDecision('topic_cooldown_active', context.now)

  const evidence = context.evidence.filter((item) => opportunity.evidenceIds.includes(item.id))
  if (evidence.length !== opportunity.evidenceIds.length) return silentDecision('evidence_missing', context.now)
  if (evidence.some((item) => item.expiresAt <= context.now || item.confidence < 0.75)) {
    return silentDecision('evidence_invalid', context.now)
  }
  if (context.production && evidence.some((item) => item.isSimulated)) {
    return silentDecision('simulated_evidence_forbidden', context.now)
  }

  const maxAiBubbles = opportunity.importance >= 90 ? 2 : 1
  const first = opportunity.type === 'weather' ? 'ning' : 'axing'
  const speakers = orderedSpeakers(first, state.lastSpeakerId)
  const beats: ConversationBeat[] = speakers.slice(0, maxAiBubbles).map((speakerId, index) => ({
    speakerId,
    motive: index === 0 ? 'react' : 'expand',
    replyTarget: index === 0 ? 'user' : speakers[index - 1],
    required: index === 0,
    minBubbles: 1,
    maxBubbles: 1,
    storyId: null,
    delayProfile: 'normal',
    stopAfter: index === maxAiBubbles - 1
  }))
  return decision('high_value_world_change', beats, maxAiBubbles, 'world_change', true, context.now)
}

export function directRecordedOpportunity(
  state: GroupState,
  opportunity: Opportunity,
  now = Date.now()
): DirectorDecision {
  if (opportunity.expiresAt <= now) return silentDecision('opportunity_expired', now)
  if (opportunity.importance < 70 || opportunity.confidence < 0.75) {
    return silentDecision('opportunity_low_value', now)
  }
  if (state.currentTopic?.lockedByUser) return silentDecision('user_topic_locked', now)
  if (state.consecutiveAiMessages >= 3 && now - state.lastMessageTime < 15_000) {
    return silentDecision('group_needs_silence', now)
  }
  if (state.silenceUntil && state.silenceUntil > now) {
    return silentDecision('silence_window_active', now)
  }
  if (state.seenOpportunityIds.includes(opportunity.id)) {
    return silentDecision('opportunity_already_seen', now)
  }
  const cooldownUntil = state.cooldowns[opportunity.type]
  if (cooldownUntil && cooldownUntil > now) return silentDecision('topic_cooldown_active', now)

  const maxAiBubbles = opportunity.importance >= 90 ? 2 : 1
  const first = opportunity.type === 'weather' ? 'ning' : 'axing'
  const speakers = orderedSpeakers(first, state.lastSpeakerId)
  const beats: ConversationBeat[] = speakers.slice(0, maxAiBubbles).map((speakerId, index) => ({
    speakerId,
    motive: index === 0 ? 'react' : 'expand',
    replyTarget: index === 0 ? 'group' : speakers[index - 1],
    required: index === 0,
    minBubbles: 1,
    maxBubbles: 1,
    storyId: null,
    delayProfile: 'normal',
    stopAfter: index === maxAiBubbles - 1
  }))
  return decision('verified_recorded_world_change', beats, maxAiBubbles, 'world_change', true, now)
}

export function directAutonomousStory(
  state: GroupState,
  story: CharacterStorySeed,
  now = Date.now()
): DirectorDecision {
  const topicStillActive = Boolean(
    state.currentTopic?.lockedByUser && now - state.currentTopic.lastActiveAt < 35_000
  )
  if (topicStillActive) return silentDecision('user_topic_locked', now)
  if (state.consecutiveAiMessages >= 3 && now - state.lastMessageTime < 15_000) {
    return silentDecision('group_needs_silence', now)
  }
  if (state.silenceUntil && state.silenceUntil > now) return silentDecision('silence_window_active', now)

  const beats: ConversationBeat[] = [
    {
      speakerId: story.ownerId,
      motive: 'share_story',
      replyTarget: 'group',
      required: true,
      minBubbles: 1,
      maxBubbles: 1,
      storyId: story.id,
      delayProfile: 'thoughtful',
      stopAfter: false
    },
    {
      speakerId: story.autonomousPartnerId,
      motive: 'react',
      replyTarget: story.ownerId,
      required: true,
      minBubbles: 1,
      maxBubbles: 1,
      storyId: story.id,
      delayProfile: 'normal',
      stopAfter: true
    }
  ]
  return decision('character_story_opportunity', beats, 2, 'character', true, now)
}

export function directTopicContinuation(state: GroupState, now = Date.now()): DirectorDecision {
  const topic = state.currentTopic
  if (!topic || topic.stage === 'ENDED' || topic.messageCount >= 8) {
    return silentDecision('topic_has_no_continuation_value', now)
  }
  if (state.silenceUntil && state.silenceUntil > now) return silentDecision('silence_window_active', now)

  const previousSpeaker = state.lastSpeakerId ?? 'ning'
  const first = allCharacters.find((speakerId) => speakerId !== previousSpeaker) ?? 'qiao'
  const second = allCharacters.find(
    (speakerId) => speakerId !== previousSpeaker && speakerId !== first
  ) ?? previousSpeaker
  const maxAiBubbles = topic.stage === 'COOLING' ? 1 : 2
  const beats: ConversationBeat[] = [
    {
      speakerId: first,
      motive: topic.type === 'opinion' ? 'challenge' : 'react',
      replyTarget: previousSpeaker,
      required: true,
      minBubbles: 1,
      maxBubbles: 1,
      storyId: null,
      delayProfile: 'afterthought',
      stopAfter: maxAiBubbles === 1
    }
  ]

  if (maxAiBubbles > 1) {
    beats.push({
      speakerId: second,
      motive: 'expand',
      replyTarget: first,
      required: true,
      minBubbles: 1,
      maxBubbles: 1,
      storyId: null,
      delayProfile: 'normal',
      stopAfter: true
    })
  }
  return decision('continue_recent_user_topic', beats, maxAiBubbles, 'character', true, now)
}
