import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  directAutonomousStory,
  directTopicContinuation,
  directUserMessage
} from '../miniprogram/core/director.ts'
import { PrototypeConversationEngine } from '../miniprogram/core/engine.ts'
import { makePrototypeReplies } from '../miniprogram/core/conversation.ts'
import { playbackDelay } from '../miniprogram/core/rhythm.ts'
import { createInitialGroupState } from '../miniprogram/core/state.ts'
import type { ChatMessage, ConversationBeat } from '../miniprogram/core/types.ts'
import {
  autonomousStoryFor,
  characters,
  selectRelevantStories,
  storySeeds
} from '../miniprogram/data/characters.ts'
import { mockWorld } from '../miniprogram/mock/world.ts'

const require = createRequire(import.meta.url)
const groupChatCloud = require('../cloudfunctions/groupChat/index.js') as {
  __test: {
    validateModelOutput(
      value: unknown,
      maxBubbles: number,
      plan: unknown,
      allowedStoryIds: string[],
      mode?: 'user' | 'autonomous'
    ): {
      messages: Array<{
        speakerId: string
        text: string
        storyId: string | null
        bubbleIndex: number
      }>
    } | null
    hasUnsupportedRealityClaim(text: string, storyId?: string | null): boolean
  }
}

test('all characters have persistent motives, relationships and traceable story seeds', () => {
  assert.equal(characters.length, 3)
  assert.ok(characters.every((character) => character.coreMotive.length >= 20))
  assert.ok(characters.every((character) => character.values.length >= 3))
  assert.ok(characters.every((character) => character.stories.length >= 2))
  assert.equal(new Set(storySeeds.map((story) => story.id)).size, storySeeds.length)
  assert.ok(storySeeds.every((story) => story.keyFacts.length >= 3))
})

test('story selection requires a semantic trigger and respects cooldown exclusions', () => {
  const selected = selectRelevantStories('我第一次一个人坐高铁，有点紧张', ['axing', 'qiao', 'ning'])
  assert.equal(selected[0]?.id, 'axing-first-solo-departure')
  const excluded = selectRelevantStories(
    '我第一次一个人坐高铁，有点紧张',
    ['axing', 'qiao', 'ning'],
    ['axing-first-solo-departure']
  )
  assert.equal(excluded.some((story) => story.id === 'axing-first-solo-departure'), false)
  assert.deepEqual(selectRelevantStories('今天天气普通', ['qiao']), [])
})

test('director attaches a relevant story only when the round has room after the direct response', () => {
  const state = createInitialGroupState(0)
  let decision = directUserMessage(state, 'ACTION', '我第一次一个人出发，有点紧张', 0)
  for (let minute = 1; minute < 100 && decision.maxAiBubbles < 2; minute += 1) {
    decision = directUserMessage(state, 'ACTION', '我第一次一个人出发，有点紧张', minute * 60_000)
  }
  assert.ok(decision.maxAiBubbles >= 2)
  assert.equal(decision.beats[0].replyTarget, 'user')
  assert.equal(decision.beats[0].storyId, 'axing-first-solo-departure')
  assert.equal(decision.beats[0].maxBubbles, 2)
})

test('an explicit character story request creates a story turn plus another character reaction', () => {
  const decision = directUserMessage(
    createInitialGroupState(0),
    'QUESTION',
    '大家有没有什么有意思的事情分享？',
    60_000
  )
  assert.equal(decision.maxAiBubbles, 3)
  assert.equal(decision.beats[0].storyId?.startsWith('qiao-'), true)
  assert.equal(decision.beats[0].minBubbles, 1)
  assert.equal(decision.beats.length, 2)
  assert.equal(decision.beats[1].required, true)
  assert.equal(decision.beats[1].motive, 'expand')
})

test('a nearby real-world query never receives a fictional character story as evidence', () => {
  const decision = directUserMessage(
    createInitialGroupState(0),
    'LOCATION_QUERY',
    '我周围有什么有意思的事情发生吗？',
    60_000
  )
  assert.ok(decision.maxAiBubbles >= 2)
  assert.equal(decision.beats.some((beat) => beat.storyId), false)
})

test('repeated user questions remain multi-bubble without a global energy gate', () => {
  const engine = new PrototypeConversationEngine(mockWorld, createInitialGroupState(0))
  for (let index = 1; index <= 6; index += 1) {
    const result = engine.handleUserMessage(`第${index}个问题是什么？`, index * 60_000)
    assert.ok(result.decision.maxAiBubbles >= 2)
  }
  assert.equal('energy' in engine.getState(), false)
})

test('autonomous story rounds have a sourced opener, a responding character and a hard two-bubble plan', () => {
  const story = autonomousStoryFor(0, [])
  assert.ok(story)
  const decision = directAutonomousStory(createInitialGroupState(0), story, 1)
  assert.equal(decision.shouldSpeak, true)
  assert.equal(decision.maxAiBubbles, 2)
  assert.equal(decision.beats.length, 2)
  assert.equal(decision.beats[0].motive, 'share_story')
  assert.equal(decision.beats[0].storyId, story.id)
  assert.equal(decision.beats[1].replyTarget, story.ownerId)
})

test('legacy stored group energy no longer suppresses an otherwise valid autonomous round', () => {
  const story = autonomousStoryFor(0, [])
  assert.ok(story)
  const legacyState = { ...createInitialGroupState(0), energy: 100 }
  const decision = directAutonomousStory(legacyState, story, 1)
  assert.equal(decision.shouldSpeak, true)
})

test('a recent user topic can create one short character-to-character continuation round', () => {
  const state = createInitialGroupState(0)
  state.currentTopic = {
    id: 'topic-1',
    type: 'general',
    title: '最近大家在忙什么',
    source: 'user',
    energy: 45,
    stage: 'GROWING',
    messageCount: 3,
    createdAt: 0,
    lastActiveAt: 0,
    lockedByUser: true
  }
  state.lastSpeakerId = 'axing'
  const decision = directTopicContinuation(state, 10_000)
  assert.equal(decision.shouldSpeak, true)
  assert.equal(decision.replyTarget, 'character')
  assert.equal(decision.maxAiBubbles, 2)
  assert.equal(decision.beats[0].replyTarget, 'axing')
  assert.equal(decision.beats[1].replyTarget, decision.beats[0].speakerId)
})

test('cloud output allows two meaningful bubbles in one character turn but never exceeds three', () => {
  const storyId = 'axing-first-solo-departure'
  const beats: ConversationBeat[] = [
    {
      speakerId: 'axing',
      motive: 'acknowledge',
      replyTarget: 'user',
      required: true,
      maxBubbles: 2,
      storyId,
      delayProfile: 'normal',
      stopAfter: false
    },
    {
      speakerId: 'qiao',
      motive: 'react',
      replyTarget: 'axing',
      required: false,
      maxBubbles: 1,
      storyId: null,
      delayProfile: 'normal',
      stopAfter: true
    }
  ]
  const output = groupChatCloud.__test.validateModelOutput(
    {
      topic: '第一次出发',
      mood: '关心',
      turns: [
        {
          speakerId: 'axing',
          motive: 'acknowledge',
          replyTo: 'user',
          bubbles: ['第一次自己走确实会紧张。', '我那次检查了三遍行李，还是忘了充电线。'],
          storyId
        },
        {
          speakerId: 'qiao',
          motive: 'react',
          replyTo: 'axing',
          bubbles: ['所以先列清单，比检查第四遍靠谱。'],
          storyId: null
        }
      ]
    },
    3,
    { maxAiBubbles: 3, beats },
    [storyId],
    'user'
  )
  assert.ok(output)
  assert.deepEqual(output.messages.map((message) => message.speakerId), ['axing', 'axing', 'qiao'])
  assert.deepEqual(output.messages.map((message) => message.bubbleIndex), [0, 1, 0])
  assert.equal(output.messages[0].storyId, storyId)
})

test('cloud accepts a planned story when the model merges it into one bubble and omits internal storyId', () => {
  const storyId = 'qiao-confident-mistake'
  const beats: ConversationBeat[] = [
    {
      speakerId: 'qiao',
      motive: 'answer',
      replyTarget: 'user',
      required: true,
      minBubbles: 1,
      maxBubbles: 2,
      storyId,
      delayProfile: 'normal',
      stopAfter: false
    },
    {
      speakerId: 'axing',
      motive: 'expand',
      replyTarget: 'qiao',
      required: true,
      minBubbles: 1,
      maxBubbles: 1,
      storyId: null,
      delayProfile: 'normal',
      stopAfter: true
    }
  ]
  const output = groupChatCloud.__test.validateModelOutput(
    {
      turns: [
        {
          speakerId: 'qiao',
          motive: 'answer',
          bubbles: ['我以前太早下过结论，后来才学会给自己留一句“也可能不是这样”。']
        },
        {
          speakerId: 'axing',
          motive: 'expand',
          bubbles: ['肯改口这件事，本身就挺难得。'],
          storyId: null
        }
      ]
    },
    3,
    { maxAiBubbles: 3, beats },
    [storyId],
    'user'
  )
  assert.ok(output)
  assert.equal(output.messages.length, 2)
  assert.equal(output.messages[0].storyId, storyId)
})

test('story fallback contains actual character content and never exposes prototype control language', () => {
  const decision = directUserMessage(
    createInitialGroupState(0),
    'QUESTION',
    '最近有什么有意思的事情吗？',
    60_000
  )
  const messages = makePrototypeReplies(
    decision.beats,
    decision.maxAiBubbles,
    'QUESTION',
    '最近有什么有意思的事情吗？',
    'topic-story',
    'user-story',
    mockWorld,
    60_001
  )
  assert.equal(messages.length, 3)
  assert.equal(messages.some((message) => /本地原型|当前最高优先级|沿着上一句/.test(message.text)), false)
  assert.equal(messages.some((message) => /太早|结论|判断错/.test(message.text)), true)
})

test('cloud rejects a story that was not included in the approved round plan', () => {
  const output = groupChatCloud.__test.validateModelOutput(
    {
      turns: [
        {
          speakerId: 'ning',
          motive: 'share_story',
          bubbles: ['我临时编了一段过去。'],
          storyId: 'unknown-story'
        }
      ]
    },
    1,
    {
      maxAiBubbles: 1,
      beats: [
        {
          speakerId: 'ning',
          motive: 'support',
          replyTarget: 'user',
          required: true,
          maxBubbles: 1,
          storyId: null,
          delayProfile: 'thoughtful'
        }
      ]
    },
    [],
    'user'
  )
  assert.equal(output, null)
})

test('cloud rejects invented recent experiences and unsupported nearby places', () => {
  assert.equal(
    groupChatCloud.__test.hasUnsupportedRealityClaim('我昨天在附近发现一家新开的书店，冷气很足。'),
    true
  )
  assert.equal(groupChatCloud.__test.hasUnsupportedRealityClaim('我最近试着把每天的小纠结记下来。'), true)
  assert.equal(groupChatCloud.__test.hasUnsupportedRealityClaim('刚看完一篇讲高温下城市供电的文章。'), true)
  assert.equal(groupChatCloud.__test.hasUnsupportedRealityClaim('我刚把窗帘都拉上了。'), true)
  assert.equal(
    groupChatCloud.__test.hasUnsupportedRealityClaim('附近活动数据还没接入，我现在不能确认。'),
    false
  )
  assert.equal(
    groupChatCloud.__test.hasUnsupportedRealityClaim('我以前第一次出发时检查了三遍行李。', 'axing-first-solo-departure'),
    false
  )
})

test('cloud requires the second character beat when the director marks it required', () => {
  const plan = {
    maxAiBubbles: 2,
    beats: [
      {
        speakerId: 'qiao',
        motive: 'answer',
        replyTarget: 'user',
        required: true,
        minBubbles: 1,
        maxBubbles: 1,
        storyId: null,
        delayProfile: 'normal'
      },
      {
        speakerId: 'ning',
        motive: 'expand',
        replyTarget: 'qiao',
        required: true,
        minBubbles: 1,
        maxBubbles: 1,
        storyId: null,
        delayProfile: 'normal'
      }
    ]
  }
  const output = groupChatCloud.__test.validateModelOutput(
    {
      turns: [
        { speakerId: 'qiao', motive: 'answer', bubbles: ['我先回应你这个问题。'], storyId: null }
      ]
    },
    2,
    plan,
    [],
    'user'
  )
  assert.equal(output, null)
})

test('playback timing changes with speaker, text length and thoughtful delivery', () => {
  const base: ChatMessage = {
    id: 'timing-a',
    senderType: 'ai',
    speakerId: 'axing',
    speakerName: '阿星',
    text: '先试一步。',
    createdAt: 0,
    timeLabel: '',
    topicId: 't',
    replyToMessageId: null,
    isAiGenerated: true,
    delayProfile: 'normal'
  }
  const sameSpeaker = playbackDelay(base, 'axing', false)
  const switchedSpeaker = playbackDelay(base, 'qiao', false)
  const thoughtful = playbackDelay({ ...base, delayProfile: 'thoughtful' }, 'axing', false)
  assert.ok(switchedSpeaker > sameSpeaker)
  assert.ok(thoughtful > sameSpeaker)
  assert.ok(sameSpeaker >= 550 && thoughtful <= 3500)
})

test('chat composer remains enabled while AI is typing so the user can interrupt', () => {
  const wxml = readFileSync('miniprogram/pages/chat/index.wxml', 'utf8')
  assert.equal(/disabled="\{\{typing\}\}"/.test(wxml), false)
  assert.equal(/!inputValue \|\| typing/.test(wxml), false)
  const pageSource = readFileSync('miniprogram/pages/chat/index.ts', 'utf8')
  assert.match(pageSource, /cancelPendingRound/)
  assert.match(pageSource, /roundToken !== activeRoundToken/)
})
