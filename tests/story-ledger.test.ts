import assert from 'node:assert/strict'
import test from 'node:test'
import {
  autonomousRoundWaitMs,
  canStartAutonomousRound,
  markAutonomousRoundStarted,
  markStoryMentioned,
  recentStoryIds
} from '../miniprogram/services/story-ledger.ts'

function installStorage(initial: Record<string, unknown>) {
  const storage = new Map(Object.entries(initial))
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, value)
    }
  }
  return storage
}

test('invalid legacy story storage is migrated to an empty array instead of blocking chat', () => {
  const storage = installStorage({ 'wchat.storyLedger.v1': { oldFormat: true } })
  assert.deepEqual(recentStoryIds(10_000), [])
  assert.deepEqual(storage.get('wchat.storyLedger.v1'), [])
})

test('invalid autonomous storage is migrated without throwing', () => {
  const storage = installStorage({ 'wchat.autonomyState.v2': 'legacy-value' })
  assert.equal(canStartAutonomousRound(100 * 60 * 60 * 1000), true)
  assert.deepEqual(storage.get('wchat.autonomyState.v2'), { lastStartedAt: 0, initiators: {} })
})

test('autonomous rounds use a 30 minute group cooldown and a 90 minute initiator cooldown', () => {
  installStorage({})
  const startedAt = 100 * 60 * 60 * 1000
  markAutonomousRoundStarted(startedAt, 'axing')
  assert.equal(canStartAutonomousRound(startedAt + 29 * 60 * 1000, 'qiao'), false)
  assert.equal(canStartAutonomousRound(startedAt + 31 * 60 * 1000, 'qiao'), true)
  assert.equal(canStartAutonomousRound(startedAt + 31 * 60 * 1000, 'axing'), false)
  assert.equal(autonomousRoundWaitMs(startedAt + 31 * 60 * 1000, 'axing'), 59 * 60 * 1000)
  assert.equal(canStartAutonomousRound(startedAt + 91 * 60 * 1000, 'axing'), true)
})

test('marking a story remains safe after malformed storage and establishes cooldown', () => {
  installStorage({ 'wchat.storyLedger.v1': 'not-an-array' })
  markStoryMentioned('story-1', 10_000)
  assert.deepEqual(recentStoryIds(10_001), ['story-1'])
})
