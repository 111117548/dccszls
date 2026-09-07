import type { CharacterId } from '../core/types'

const STORY_LEDGER_KEY = 'wchat.storyLedger.v1'
const AUTONOMY_STATE_KEY = 'wchat.autonomyState.v2'
const STORY_COOLDOWN_MS = 72 * 60 * 60 * 1000
const AUTONOMY_COOLDOWN_MS = 30 * 60 * 1000
const INITIATOR_COOLDOWN_MS = 90 * 60 * 1000

interface StoryLedgerEntry {
  storyId: string
  lastMentionedAt: number
  mentionCount: number
}

interface AutonomyState {
  lastStartedAt: number
  initiators: Partial<Record<CharacterId, number>>
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = wx.getStorageSync(key) as T | undefined
    return value ?? fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    wx.setStorageSync(key, value)
  } catch {
    // Storage failure must not break the foreground conversation.
  }
}

function isStoryLedgerEntry(value: unknown): value is StoryLedgerEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<StoryLedgerEntry>
  return (
    typeof entry.storyId === 'string' &&
    entry.storyId.length > 0 &&
    typeof entry.lastMentionedAt === 'number' &&
    Number.isFinite(entry.lastMentionedAt) &&
    typeof entry.mentionCount === 'number' &&
    Number.isFinite(entry.mentionCount)
  )
}

function readStoryEntries(): StoryLedgerEntry[] {
  const stored = readStorage<unknown>(STORY_LEDGER_KEY, [])
  if (!Array.isArray(stored)) {
    writeStorage(STORY_LEDGER_KEY, [])
    return []
  }
  const valid = stored.filter(isStoryLedgerEntry).slice(-50)
  if (valid.length !== stored.length) writeStorage(STORY_LEDGER_KEY, valid)
  return valid
}

function readAutonomyState(): AutonomyState {
  const stored = readStorage<unknown>(AUTONOMY_STATE_KEY, null)
  if (
    stored &&
    typeof stored === 'object' &&
    typeof (stored as Partial<AutonomyState>).lastStartedAt === 'number' &&
    Number.isFinite((stored as AutonomyState).lastStartedAt)
  ) {
    const candidate = stored as Partial<AutonomyState>
    return {
      lastStartedAt: candidate.lastStartedAt as number,
      initiators: candidate.initiators && typeof candidate.initiators === 'object' ? candidate.initiators : {}
    }
  }
  const fallback: AutonomyState = { lastStartedAt: 0, initiators: {} }
  writeStorage(AUTONOMY_STATE_KEY, fallback)
  return fallback
}

export function recentStoryIds(now = Date.now(), cooldownMs = STORY_COOLDOWN_MS): string[] {
  return readStoryEntries()
    .filter((entry) => now - entry.lastMentionedAt < cooldownMs)
    .map((entry) => entry.storyId)
}

export function markStoryMentioned(storyId: string, now = Date.now()): void {
  if (!storyId) return
  const entries = readStoryEntries()
  const existing = entries.find((entry) => entry.storyId === storyId)
  if (existing) {
    existing.lastMentionedAt = now
    existing.mentionCount += 1
  } else {
    entries.push({ storyId, lastMentionedAt: now, mentionCount: 1 })
  }
  writeStorage(STORY_LEDGER_KEY, entries.slice(-50))
}

export function canStartAutonomousRound(now = Date.now(), initiatorId?: CharacterId): boolean {
  return autonomousRoundWaitMs(now, initiatorId) === 0
}

export function autonomousRoundWaitMs(now = Date.now(), initiatorId?: CharacterId): number {
  const state = readAutonomyState()
  const groupWait = Math.max(0, AUTONOMY_COOLDOWN_MS - (now - state.lastStartedAt))
  const initiatorLastStartedAt = initiatorId ? state.initiators[initiatorId] ?? 0 : 0
  const initiatorWait = initiatorId
    ? Math.max(0, INITIATOR_COOLDOWN_MS - (now - initiatorLastStartedAt))
    : 0
  return Math.max(groupWait, initiatorWait)
}

export function markAutonomousRoundStarted(now = Date.now(), initiatorId?: CharacterId): void {
  const state = readAutonomyState()
  writeStorage(AUTONOMY_STATE_KEY, {
    lastStartedAt: now,
    initiators: initiatorId ? { ...state.initiators, [initiatorId]: now } : state.initiators
  })
}
