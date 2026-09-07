import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  buildContinuationGroupRequest,
  buildGroupChatRequest,
  containsUnsupportedRealityClaim,
  groupChatErrorMessage
} from '../miniprogram/services/group-chat-service.ts'
import { mockWorld } from '../miniprogram/mock/world.ts'
import type { ChatMessage, ConversationResult, WorldSnapshot } from '../miniprogram/core/types.ts'
import { createInitialGroupState } from '../miniprogram/core/state.ts'
import { directTopicContinuation } from '../miniprogram/core/director.ts'
import { startUserTopic } from '../miniprogram/core/topic-engine.ts'

const require = createRequire(import.meta.url)
const groupChatCloud = require('../cloudfunctions/groupChat/index.js') as {
  __test: {
    isValidApiHost(host: string): boolean
    sanitizeHistory(history: unknown[]): unknown[]
    sanitizeWorld(world: unknown): unknown
    validateModelOutput(value: unknown, maxMessages?: number): {
      messages: Array<{ speakerId: string; text: string; replyTo: string }>
    } | null
    parseJsonContent(content: string): unknown
    buildSystemPrompt(): string
    sanitizeMemories(value: unknown): unknown[]
  }
}

test('group chat cloud accepts only the official DeepSeek API host', () => {
  assert.equal(groupChatCloud.__test.isValidApiHost('api.deepseek.com'), true)
  assert.equal(groupChatCloud.__test.isValidApiHost('deepseek.com.attacker.test'), false)
})

test('only bounded relevant memory content reaches the model without internal ids', () => {
  const now = Date.now()
  const request = buildGroupChatRequest({
    text: '周末做点什么？',
    history: [],
    world: mockWorld,
    topic: null,
    intent: 'QUESTION',
    decision: {
      shouldSpeak: true,
      reason: 'user_message',
      speakers: ['ning'],
      maxMessages: 1,
      replyTarget: 'user',
      endTopicAfterRound: false
    },
    memories: [
      {
        id: 'private-memory-id',
        groupId: 'evening-breeze-companion',
        tier: 'long_term',
        kind: 'preference',
        content: '用户喜欢散步',
        confidence: 0.9,
        sourceMessageId: 'private-source-message',
        createdAt: 1,
        updatedAt: now,
        expiresAt: null
      }
    ]
  })
  const serialized = JSON.stringify(request.memories)
  assert.match(serialized, /用户喜欢散步/)
  assert.equal(serialized.includes('private-memory-id'), false)
  assert.equal(serialized.includes('private-source-message'), false)
  assert.equal(groupChatCloud.__test.sanitizeMemories(request.memories).length, 1)
})

test('group chat cloud validates and chains one to three different speakers', () => {
  const output = groupChatCloud.__test.validateModelOutput(
    {
      topic: '周末安排',
      mood: '好奇',
      messages: [
        { speakerId: 'axing', text: '先说说你最想做的那件事。' },
        { speakerId: 'axing', text: '重复角色应被过滤。' },
        { speakerId: 'qiao', text: '也给临时变化留个余地。' },
        { speakerId: 'ning', text: '别把一天排得太满。' },
        { speakerId: 'qiao', text: '第四条不应出现。' }
      ]
    },
    3
  )
  assert.ok(output)
  assert.deepEqual(output.messages.map((message) => message.speakerId), ['axing', 'qiao', 'ning'])
  assert.deepEqual(output.messages.map((message) => message.replyTo), ['user', 'axing', 'qiao'])
})

test('simulated world data is never sent to the model as a real-world fact', () => {
  const request = buildGroupChatRequest({
    text: '现在天气怎么样？',
    history: [] as ChatMessage[],
    world: mockWorld,
    topic: null,
    intent: 'WEATHER_QUERY',
    decision: {
      shouldSpeak: true,
      reason: 'user_message',
      speakers: ['ning'],
      maxMessages: 2,
      replyTarget: 'user',
      endTopicAfterRound: false
    }
  })
  assert.deepEqual(request.world, { live: false })
})

test('live world context excludes exact coordinates before model transmission', () => {
  const liveWorld: WorldSnapshot = {
    ...mockWorld,
    location: { ...mockWorld.location, isSimulated: false },
    weather: { ...mockWorld.weather, isSimulated: false }
  }
  const request = buildGroupChatRequest({
    text: '现在天气怎么样？',
    history: [],
    world: liveWorld,
    topic: null,
    intent: 'WEATHER_QUERY',
    decision: {
      shouldSpeak: true,
      reason: 'user_message',
      speakers: ['ning'],
      maxMessages: 1,
      replyTarget: 'user',
      endTopicAfterRound: false
    }
  })
  const serialized = JSON.stringify(request)
  assert.equal(serialized.includes(String(liveWorld.location.data.latitude)), false)
  assert.equal(serialized.includes(String(liveWorld.location.data.longitude)), false)
  assert.equal((request.world as { live: boolean }).live, true)
})

test('live local news sends bounded evidence to the model but never sends source URLs', () => {
  const now = Date.now()
  const liveWorld: WorldSnapshot = {
    ...structuredClone(mockWorld),
    location: { ...structuredClone(mockWorld.location), isSimulated: false },
    weather: { ...structuredClone(mockWorld.weather), isSimulated: false },
    localNews: {
      id: 'local-news-1',
      provider: 'Tencent Cloud WSA',
      sourceId: 'request-1',
      observedAt: now,
      fetchedAt: now,
      expiresAt: now + 60_000,
      confidence: 0.8,
      isSimulated: false,
      data: [
        {
          id: 'news-1',
          title: '武侯区发布高温防暑提示',
          summary: '武侯区提醒市民关注高温天气。',
          url: 'https://example.gov.cn/news/1',
          sourceName: '示例政务网',
          publishedAt: now,
          relevance: 0.9
        }
      ]
    }
  }
  const request = buildGroupChatRequest({
    text: '附近有什么新闻？',
    history: [],
    world: liveWorld,
    topic: null,
    intent: 'NEWS_QUERY',
    decision: {
      shouldSpeak: true,
      reason: 'user_message',
      speakers: ['qiao'],
      maxMessages: 1,
      replyTarget: 'user',
      endTopicAfterRound: false
    }
  })
  const serialized = JSON.stringify(request.world)
  assert.match(serialized, /武侯区发布高温防暑提示/)
  assert.match(serialized, /示例政务网/)
  assert.equal(serialized.includes('https://example.gov.cn'), false)

  const sanitized = groupChatCloud.__test.sanitizeWorld(request.world) as {
    localNews: Array<{ title: string }>
  }
  assert.equal(sanitized.localNews[0].title, '武侯区发布高温防暑提示')
  assert.equal(containsUnsupportedRealityClaim('新闻里说发生了高温预警。', null, true), false)
})

test('model setup failures remain visible while local fallback stays available', () => {
  assert.equal(groupChatErrorMessage('model_service_not_configured'), '模型未配置，已使用安全备用回复')
  assert.equal(groupChatErrorMessage('model_http_401'), '模型凭据无效，已使用安全备用回复')
  assert.equal(groupChatErrorMessage('model_http_400'), '模型名称或请求参数不受支持，已使用安全备用回复')
  assert.match(groupChatErrorMessage('cloud.callFunction:fail unknown'), /cloud\.callFunction:fail/)
  assert.match(groupChatCloud.__test.buildSystemPrompt(), /第一条必须直接回应用户/)
  assert.match(groupChatCloud.__test.buildSystemPrompt(), /mode=continuation/)
})

test('client rejects unsupported recent experiences even before rendering a cloud response', () => {
  assert.equal(containsUnsupportedRealityClaim('我昨天在附近发现一家新开的书店。'), true)
  assert.equal(containsUnsupportedRealityClaim('刚看完一篇讲高温下城市供电的文章。'), true)
  assert.equal(containsUnsupportedRealityClaim('我刚把窗帘都拉上了，外面空气都是烫的。'), true)
  assert.equal(containsUnsupportedRealityClaim('附近地点数据还没接入，我暂时不能确认。'), false)
})

test('topic continuation request has no fake user message and preserves recent history', () => {
  const topic = startUserTopic('最近大家在忙什么？', 'QUESTION', 1)
  const state = { ...createInitialGroupState(1), currentTopic: topic, lastSpeakerId: 'axing' as const }
  const request = buildContinuationGroupRequest({
    history: [
      {
        id: 'ai-1',
        senderType: 'ai',
        speakerId: 'axing',
        speakerName: '阿星',
        text: '最近在整理一些旧故事。',
        createdAt: 1,
        timeLabel: '',
        topicId: topic.id,
        replyToMessageId: null,
        isAiGenerated: true
      }
    ],
    world: mockWorld,
    topic,
    decision: directTopicContinuation(state, 10_000)
  })
  assert.equal(request.mode, 'continuation')
  assert.equal(request.text, '')
  assert.equal((request.history as unknown[]).length, 1)
  assert.deepEqual(request.stories, [])
})
