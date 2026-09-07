import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { ChatMessage } from '../miniprogram/core/types.ts'
import {
  clearUserMemories,
  extractUserMemories,
  recordUserMemories,
  relevantUserMemories,
  syncUserMemoriesFromCloud
} from '../miniprogram/services/memory-store.ts'

const require = createRequire(import.meta.url)
const persistenceCloud = require('../cloudfunctions/groupPersistence/index.js') as {
  __test: {
    sanitizeMemory(value: unknown, groupId: string): unknown
    sanitizeMemories(value: unknown, groupId: string): unknown[]
  }
}

const groupId = 'evening-breeze-companion'

function userMessage(id: string, text: string, createdAt = 1): ChatMessage {
  return {
    id,
    senderType: 'user',
    speakerId: null,
    speakerName: '我',
    text,
    createdAt,
    timeLabel: '',
    topicId: 'topic-1',
    replyToMessageId: null,
    isAiGenerated: false
  }
}

function localWx(storage = new Map<string, unknown>()) {
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    }
  }
  return storage
}

test('memory extraction saves only explicit durable facts and bounded short-term state', () => {
  const now = 10_000
  const memories = extractUserMemories(
    groupId,
    userMessage('user-1', '我喜欢川菜，我不喜欢排长队，我准备周末去博物馆'),
    'ACTION',
    now
  )
  assert.deepEqual(
    memories.map((item) => [item.kind, item.tier, item.content]),
    [
      ['preference', 'long_term', '用户喜欢川菜'],
      ['dislike', 'long_term', '用户不喜欢排长队'],
      ['plan', 'short_term', '用户准备周末去博物馆']
    ]
  )
  assert.equal(memories[0].expiresAt, null)
  assert.equal(memories[2].expiresAt, now + 24 * 60 * 60_000)
  assert.deepEqual(
    extractUserMemories(groupId, userMessage('user-2', '今天天气还行'), 'CHAT', now),
    []
  )
})

test('emotion memory expires, repeated plans deduplicate and refresh their lifetime', () => {
  localWx()
  const first = recordUserMemories(
    groupId,
    userMessage('user-1', '我准备明天去看展'),
    'ACTION',
    1_000
  )
  const repeated = recordUserMemories(
    groupId,
    userMessage('user-2', '我准备明天去看展'),
    'ACTION',
    5_000
  )
  assert.equal(first[0].id, repeated[0].id)
  const stored = relevantUserMemories(groupId, 5_001, 50)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].sourceMessageId, 'user-2')
  assert.equal(stored[0].expiresAt, 5_000 + 24 * 60 * 60_000)

  recordUserMemories(groupId, userMessage('user-3', '我今天真的有点难过'), 'EMOTION', 10_000)
  assert.equal(relevantUserMemories(groupId, 10_001, 50).length, 2)
  assert.equal(relevantUserMemories(groupId, 10_000 + 6 * 60 * 60_000 + 1, 50).length, 1)
})

test('a failed cloud deletion leaves a tombstone and never resurrects remote memory', async () => {
  const storage = localWx()
  recordUserMemories(groupId, userMessage('user-1', '我喜欢散步'), 'CHAT', 1_000)
  await clearUserMemories(groupId)
  assert.equal(relevantUserMemories(groupId).length, 0)

  let cloudCalls = 0
  let remoteCleared = false
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
        cloudCalls += 1
        if (options.data.action === 'clearMemories') {
          remoteCleared = true
          options.success({ result: { success: true } })
          return
        }
        options.success({
          result: {
            success: true,
            memories: remoteCleared
              ? []
              : [
                  {
                    id: 'remote-old',
                    groupId,
                    tier: 'long_term',
                    kind: 'preference',
                    content: '已经被删除的旧记忆',
                    confidence: 0.9,
                    sourceMessageId: 'old',
                    createdAt: 1,
                    updatedAt: 1,
                    expiresAt: null
                  }
                ]
          }
        })
      }
    }
  }
  await syncUserMemoriesFromCloud(groupId)
  assert.ok(cloudCalls >= 2)
  assert.equal(relevantUserMemories(groupId).length, 0)
})

test('cloud memory sanitizer rejects cross-group, low-shape and duplicate records', () => {
  const base = {
    id: 'memory-1',
    groupId,
    tier: 'long_term',
    kind: 'preference',
    content: '  用户喜欢安静\u0000  ',
    confidence: 3,
    sourceMessageId: 'message-1',
    createdAt: 10,
    updatedAt: 20,
    expiresAt: null,
    secret: 'drop-me'
  }
  const memory = persistenceCloud.__test.sanitizeMemory(base, groupId) as Record<string, unknown>
  assert.equal(memory.content, '用户喜欢安静')
  assert.equal(memory.confidence, 1)
  assert.equal('secret' in memory, false)
  assert.equal(
    persistenceCloud.__test.sanitizeMemory({ ...base, groupId: 'clear-table-discussion' }, groupId),
    null
  )
  assert.equal(persistenceCloud.__test.sanitizeMemories([base, base], groupId).length, 1)
})
