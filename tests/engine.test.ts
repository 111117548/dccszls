import assert from 'node:assert/strict'
import test from 'node:test'
import { directOpportunity, directUserMessage } from '../miniprogram/core/director.ts'
import { PrototypeConversationEngine, countConsecutiveAi } from '../miniprogram/core/engine.ts'
import { classifyIntent } from '../miniprogram/core/intent.ts'
import { checkActiveMessageBudget } from '../miniprogram/core/message-budget.ts'
import { opportunitiesFromChanges } from '../miniprogram/core/opportunity-engine.ts'
import { createInitialGroupState } from '../miniprogram/core/state.ts'
import { startUserTopic } from '../miniprogram/core/topic-engine.ts'
import type { EvidenceEnvelope, Opportunity, WorldSnapshot } from '../miniprogram/core/types.ts'
import { detectWorldChanges } from '../miniprogram/core/world-change.ts'
import { mockWorld } from '../miniprogram/mock/world.ts'

test('classifies high-value user intents before generic chat', () => {
  assert.equal(classifyIntent('附近有什么新闻？'), 'NEWS_QUERY')
  assert.equal(classifyIntent('附近有什么地方可以走走？'), 'LOCATION_QUERY')
  assert.equal(classifyIntent('今天会下雨吗？'), 'WEATHER_QUERY')
  assert.equal(classifyIntent('我今天真的很难过'), 'EMOTION')
  assert.equal(classifyIntent('？？？'), 'NONSENSE')
})

test('a local news query answers from current evidence and names its source', () => {
  const now = Date.now()
  const liveWorld: WorldSnapshot = {
    ...structuredClone(mockWorld),
    location: { ...structuredClone(mockWorld.location), isSimulated: false },
    weather: { ...structuredClone(mockWorld.weather), isSimulated: false },
    localNews: {
      id: 'local-news-test',
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
  const engine = new PrototypeConversationEngine(liveWorld)
  const result = engine.handleUserMessage('附近有什么新闻？', now)
  assert.equal(result.intent, 'NEWS_QUERY')
  assert.match(result.messages[1].text, /武侯区发布高温防暑提示/)
  assert.match(result.messages[1].text, /示例政务网/)
})

test('a new user message replaces and locks an old world topic', () => {
  const oldTopic = { ...startUserTopic('天气', 'WEATHER_QUERY', 1), source: 'weather' as const, lockedByUser: false }
  const state = { ...createInitialGroupState(1), currentTopic: oldTopic }
  const engine = new PrototypeConversationEngine(mockWorld, state)
  const result = engine.handleUserMessage('为什么这次行程要改？', 10)
  assert.equal(result.state.currentTopic?.source, 'user')
  assert.equal(result.state.currentTopic?.lockedByUser, true)
  assert.equal(result.state.currentFocus, '为什么这次行程要改？')
})

test('user messages always receive one to three replies', () => {
  const state = createInitialGroupState()
  for (const intent of ['QUESTION', 'REQUEST', 'EMOTION', 'CHAT', 'NONSENSE'] as const) {
    const decision = directUserMessage(state, intent)
    assert.equal(decision.shouldSpeak, true)
    assert.ok(decision.speakers.length >= 1)
    assert.ok(decision.speakers.length <= 3)
  }
})

test('prototype reply chain never exceeds three consecutive AI messages', () => {
  const engine = new PrototypeConversationEngine(mockWorld)
  const result = engine.handleUserMessage('你们怎么看这个计划？')
  assert.ok(countConsecutiveAi(result.messages) <= 3)
  assert.equal(result.messages[1].replyToMessageId, result.messages[0].id)
  assert.equal(result.messages[2].replyToMessageId, result.messages[1].id)
})

test('world opportunity is silent while a user topic is locked', () => {
  const now = Date.now()
  const state = {
    ...createInitialGroupState(now),
    currentTopic: startUserTopic('先说我的问题', 'QUESTION', now)
  }
  const opportunity: Opportunity = {
    id: 'arrival-1',
    type: 'location',
    source: 'location',
    title: '抵达新城市',
    description: '城市发生变化',
    importance: 95,
    confidence: 0.95,
    expiresAt: now + 1000,
    evidenceIds: ['e1']
  }
  const evidence: EvidenceEnvelope<unknown> = {
    id: 'e1',
    provider: 'test',
    sourceId: '1',
    observedAt: now,
    fetchedAt: now,
    expiresAt: now + 1000,
    confidence: 0.95,
    isSimulated: false,
    data: {}
  }
  const decision = directOpportunity(state, opportunity, { now, production: true, evidence: [evidence] })
  assert.equal(decision.shouldSpeak, false)
  assert.equal(decision.reason, 'user_topic_locked')
})

test('production cannot speak from simulated world evidence', () => {
  const now = Date.now()
  const opportunity: Opportunity = {
    id: 'weather-1',
    type: 'weather',
    source: 'weather',
    title: '开始下雨',
    description: '天气发生变化',
    importance: 80,
    confidence: 0.9,
    expiresAt: now + 1000,
    evidenceIds: ['e1']
  }
  const evidence: EvidenceEnvelope<unknown> = {
    id: 'e1',
    provider: 'mock',
    sourceId: '1',
    observedAt: now,
    fetchedAt: now,
    expiresAt: now + 1000,
    confidence: 0.9,
    isSimulated: true,
    data: {}
  }
  const decision = directOpportunity(createInitialGroupState(now), opportunity, {
    now,
    production: true,
    evidence: [evidence]
  })
  assert.equal(decision.shouldSpeak, false)
  assert.equal(decision.reason, 'simulated_evidence_forbidden')
})

test('a credible cross-city move creates one high-value opportunity', () => {
  const previous = structuredClone(mockWorld) as WorldSnapshot
  const current = structuredClone(mockWorld) as WorldSnapshot
  previous.id = 'xining'
  previous.location.data.city = '西宁市'
  previous.location.data.province = '青海省'
  previous.location.isSimulated = false
  current.id = 'shanghai'
  current.location.data.city = '上海市'
  current.location.data.province = '上海市'
  current.location.isSimulated = false
  current.capturedAt += 1000
  current.location.expiresAt = current.capturedAt + 1000
  current.weather.data = previous.weather.data

  const changes = detectWorldChanges(previous, current)
  const opportunities = opportunitiesFromChanges(changes, current.capturedAt)
  assert.equal(changes.filter((item) => item.kind === 'city_changed').length, 1)
  assert.equal(opportunities.filter((item) => item.type === 'location').length, 1)
  assert.match(opportunities[0].title, /西宁市.*上海市/)
})

test('low-accuracy location jump is treated as drift and creates no city change', () => {
  const previous = structuredClone(mockWorld) as WorldSnapshot
  const current = structuredClone(mockWorld) as WorldSnapshot
  previous.location.data.city = '西宁市'
  current.location.data.city = '上海市'
  current.location.data.accuracy = 900
  current.capturedAt += 1000
  current.location.expiresAt = current.capturedAt + 1000
  assert.equal(detectWorldChanges(previous, current).some((item) => item.kind === 'city_changed'), false)
})

test('active message budget blocks hourly bursts and the unread hard cap', () => {
  const now = Date.now()
  const hourly = checkActiveMessageBudget([now - 1000, now - 2000, now - 3000], 3, 1, now)
  assert.equal(hourly.allowed, false)
  assert.equal(hourly.reason, 'hourly_limit')

  const hardCap = checkActiveMessageBudget([], 30, 1, now)
  assert.equal(hardCap.allowed, false)
  assert.equal(hardCap.reason, 'hard_unread_cap')
})
