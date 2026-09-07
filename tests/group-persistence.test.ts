import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createInitialGroupState } from '../miniprogram/core/state.ts'
import type { ChatMessage } from '../miniprogram/core/types.ts'
import {
  loadGroupSession,
  loadLocalGroupSession,
  localGroupSummary,
  markGroupRead,
  persistGroupMessages
} from '../miniprogram/services/group-session-repository.ts'

const require = createRequire(import.meta.url)
const persistenceCloud = require('../cloudfunctions/groupPersistence/index.js') as {
  __test: {
    isKnownGroup(groupId: string): boolean
    documentId(...parts: string[]): string
    sanitizeState(value: unknown, groupId: string): unknown
    sanitizeMessage(value: unknown, groupId: string): unknown
    sanitizeMessages(value: unknown, groupId: string): unknown[]
    isCollectionMissingError(error: unknown): boolean
    setWithCollectionBootstrap(
      db: Record<string, unknown>,
      collectionName: string,
      documentIdValue: string,
      data: Record<string, unknown>
    ): Promise<void>
  }
}

const groupId = 'evening-breeze-companion'

function userMessage(id: string, text: string, createdAt: number): ChatMessage {
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

test('cloud persistence accepts only registered groups and sanitizes messages', () => {
  assert.equal(persistenceCloud.__test.isKnownGroup(groupId), true)
  assert.equal(persistenceCloud.__test.isKnownGroup('unknown'), false)
  const message = persistenceCloud.__test.sanitizeMessage(
    {
      ...userMessage('message-1', '  你好\u0000  ', Date.now()),
      speakerId: 'axing',
      extraSecret: 'must-not-persist'
    },
    groupId
  ) as Record<string, unknown>
  assert.equal(message.text, '你好')
  assert.equal(message.speakerId, null)
  assert.equal('extraSecret' in message, false)
})

test('cloud message writes are bounded, deduplicated and use stable private document ids', () => {
  const messages = Array.from({ length: 12 }, (_, index) => userMessage(`message-${index % 6}`, `内容${index}`, index + 1))
  const sanitized = persistenceCloud.__test.sanitizeMessages(messages, groupId)
  assert.equal(sanitized.length, 6)
  assert.equal(
    persistenceCloud.__test.documentId('openid', groupId, 'message-1'),
    persistenceCloud.__test.documentId('openid', groupId, 'message-1')
  )
  assert.notEqual(
    persistenceCloud.__test.documentId('openid-a', groupId, 'message-1'),
    persistenceCloud.__test.documentId('openid-b', groupId, 'message-1')
  )
})

test('image asset registration bootstraps a missing cloud collection once', async () => {
  let writes = 0
  let created = ''
  const db = {
    collection() {
      return {
        doc() {
          return {
            async set() {
              writes += 1
              if (writes === 1) {
                const error = new Error('collection does not exist') as Error & { errCode: number }
                error.errCode = -502005
                throw error
              }
            }
          }
        }
      }
    },
    async createCollection(name: string) {
      created = name
    }
  }
  assert.equal(
    persistenceCloud.__test.isCollectionMissingError({ errCode: -502005 }),
    true
  )
  await persistenceCloud.__test.setWithCollectionBootstrap(
    db,
    'wchat_group_assets',
    'asset-1',
    { status: 'active' }
  )
  assert.equal(created, 'wchat_group_assets')
  assert.equal(writes, 2)
})

test('local fallback persists and restores a session when the cloud function is unavailable', async () => {
  const storage = new Map<string, unknown>()
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    }
  }
  const state = createInitialGroupState(1)
  const message = userMessage('local-1', '本地也要保住这句话', 10)
  const result = await persistGroupMessages(groupId, [message], state)
  assert.equal(result.cloudSynced, false)
  assert.equal(loadLocalGroupSession(groupId).messages[0].text, message.text)
  assert.equal((await loadGroupSession(groupId)).source, 'local')
  assert.equal(localGroupSummary(groupId)?.latestMessage, message.text)
})

test('marking a group read updates the local unread marker even without cloud', async () => {
  const storage = new Map<string, unknown>()
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    }
  }
  const aiMessage: ChatMessage = {
    ...userMessage('ai-1', '你回来时会看到这条', 20),
    senderType: 'ai',
    speakerId: 'ning',
    speakerName: '宁宁',
    isAiGenerated: true
  }
  await persistGroupMessages(groupId, [aiMessage], createInitialGroupState(1), false)
  assert.equal(loadLocalGroupSession(groupId).unreadCount, 1)
  await markGroupRead(groupId)
  assert.equal(loadLocalGroupSession(groupId).unreadCount, 0)
})

test('a valid cloud session replaces an older local snapshot and is cached locally', async () => {
  const storage = new Map<string, unknown>()
  const remoteMessage = userMessage('remote-1', '这条来自云端', 200)
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    },
    cloud: {
      callFunction(options: { success(result: { result: unknown }): void }) {
        options.success({
          result: {
            success: true,
            groupId,
            state: createInitialGroupState(100),
            messages: [remoteMessage],
            unreadCount: 1,
            updatedAt: 300,
            lastReadAt: 100
          }
        })
      }
    }
  }
  const loaded = await loadGroupSession(groupId)
  assert.equal(loaded.source, 'cloud')
  assert.equal(loaded.messages[0].text, remoteMessage.text)
  assert.equal(loadLocalGroupSession(groupId).messages[0].text, remoteMessage.text)
})
