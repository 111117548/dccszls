import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { makeOpportunityReplies } from '../miniprogram/core/conversation.ts'
import { directRecordedOpportunity } from '../miniprogram/core/director.ts'
import { createInitialGroupState } from '../miniprogram/core/state.ts'
import type { Opportunity, WorldSnapshot } from '../miniprogram/core/types.ts'
import { detectWorldChanges } from '../miniprogram/core/world-change.ts'
import { mockWorld } from '../miniprogram/mock/world.ts'
import { processWorldOpportunitiesForGroups } from '../miniprogram/services/background-group-processor.ts'
import {
  markGroupEventConsumed,
  opportunityFromEvent,
  pendingGroupEvents,
  recordWorldOpportunities,
  syncGroupEventsFromCloud
} from '../miniprogram/services/event-ledger.ts'
import { loadLocalGroupSession } from '../miniprogram/services/group-session-repository.ts'

const require = createRequire(import.meta.url)
const persistenceCloud = require('../cloudfunctions/groupPersistence/index.js') as {
  __test: {
    sanitizeEvent(value: unknown, groupId: string): Record<string, unknown> | null
  }
}

const groupId = 'evening-breeze-companion'

function opportunity(now: number): Opportunity {
  return {
    id: 'opportunity-city-1',
    type: 'location',
    source: 'location',
    title: '从西宁市到了上海市',
    description: '上次可信位置在西宁市，当前可信位置在上海市',
    importance: 95,
    confidence: 0.9,
    expiresAt: now + 60_000,
    evidenceIds: ['location-old', 'location-new']
  }
}

test('simulated snapshots never create real-world changes', () => {
  const previous = structuredClone(mockWorld) as WorldSnapshot
  const current = structuredClone(mockWorld) as WorldSnapshot
  previous.location.data.city = '西宁市'
  current.location.data.city = '上海市'
  current.capturedAt += 1
  assert.deepEqual(detectWorldChanges(previous, current), [])
})

test('event ledger deduplicates opportunities and records consumption message ids', () => {
  const storage = new Map<string, unknown>()
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    }
  }
  const now = 1_000
  assert.equal(recordWorldOpportunities(groupId, [opportunity(now)], now).length, 1)
  assert.equal(recordWorldOpportunities(groupId, [opportunity(now)], now).length, 0)
  const event = pendingGroupEvents(groupId, now)[0]
  assert.equal(opportunityFromEvent(event)?.title, '从西宁市到了上海市')
  markGroupEventConsumed(groupId, event.id, ['world-message-1'], now + 1)
  assert.equal(pendingGroupEvents(groupId, now + 1).length, 0)
})

test('a stale cloud pending event cannot revive a locally consumed event', async () => {
  const storage = new Map<string, unknown>()
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    }
  }
  const now = 2_000
  recordWorldOpportunities(groupId, [opportunity(now)], now)
  const localEvent = pendingGroupEvents(groupId, now)[0]
  markGroupEventConsumed(groupId, localEvent.id, ['message-1'], now + 1)

  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    },
    cloud: {
      callFunction(options: {
        data: { action: string }
        success(result: { result: unknown }): void
      }) {
        if (options.data.action === 'loadEvents') {
          options.success({
            result: {
              success: true,
              events: [{ ...localEvent, status: 'pending', consumedAt: null, messageIds: [] }]
            }
          })
          return
        }
        options.success({ result: { success: true } })
      }
    }
  }
  const synced = await syncGroupEventsFromCloud(groupId)
  assert.equal(synced[0].status, 'consumed')
  assert.equal(pendingGroupEvents(groupId, now + 2).length, 0)
})

test('a recorded verified event creates a bounded world-triggered role chain', () => {
  const now = Date.now()
  const item = opportunity(now)
  const decision = directRecordedOpportunity(createInitialGroupState(now - 60_000), item, now)
  assert.equal(decision.shouldSpeak, true)
  const messages = makeOpportunityReplies(decision.beats, item, 'world-topic', now)
  assert.equal(messages.length, 2)
  assert.ok(messages.every((message) => message.trigger === 'world'))
  assert.equal(messages[1].replyToMessageId, messages[0].id)
})

test('cloud event sanitizer strips unknown data and binds an event to its registered group', () => {
  const now = Date.now()
  const value = persistenceCloud.__test.sanitizeEvent(
    {
      id: 'event-1',
      groupId,
      type: 'world_change',
      topicKind: 'weather',
      source: 'weather',
      title: '出现大风预警',
      description: '天气数据出现新的预警',
      importance: 95,
      confidence: 0.9,
      occurredAt: now,
      expiresAt: now + 60_000,
      evidenceIds: ['weather-1'],
      opportunityId: 'opportunity-1',
      status: 'pending',
      secret: 'drop-me'
    },
    groupId
  )
  assert.ok(value)
  assert.equal(value?.groupId, groupId)
  assert.equal('secret' in (value || {}), false)
})

test('group-list processing creates bounded unread messages before the user enters chat', async () => {
  const storage = new Map<string, unknown>()
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    }
  }
  const now = Date.now()
  const item = opportunity(now)
  const evidence = item.evidenceIds.map((id) => ({
    id,
    provider: 'test',
    sourceId: id,
    observedAt: now,
    fetchedAt: now,
    expiresAt: now + 60_000,
    confidence: 0.9,
    isSimulated: false,
    data: {}
  }))
  const world = structuredClone(mockWorld) as WorldSnapshot
  world.location.isSimulated = false
  world.weather.isSimulated = false
  const result = await processWorldOpportunitiesForGroups([item], evidence, world, now)
  assert.equal(result.generatedMessages, 2)
  assert.deepEqual(result.affectedGroups, [groupId])
  const session = loadLocalGroupSession(groupId)
  assert.equal(session.unreadCount, 2)
  assert.ok(session.messages.every((message) => message.trigger === 'world'))
  const repeated = await processWorldOpportunitiesForGroups([item], evidence, world, now + 1)
  assert.equal(repeated.generatedMessages, 0)
})
