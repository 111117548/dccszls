import type { ChatMessage, UserIntent, UserMemory } from '../core/types'

const MEMORY_PREFIX = 'wchat.memories.v1.'
const MEMORY_CLEAR_PREFIX = 'wchat.memories.clear-pending.v1.'
const MAX_MEMORIES = 50

interface MemoryCloudResult {
  success?: boolean
  error?: string
  memories?: unknown
}

function storageKey(groupId: string): string {
  return `${MEMORY_PREFIX}${encodeURIComponent(groupId)}`
}

function clearPendingKey(groupId: string): string {
  return `${MEMORY_CLEAR_PREFIX}${encodeURIComponent(groupId)}`
}

function compact(value: string, maxLength = 120): string {
  return value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function memoryHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function safeMemories(groupId: string, value: unknown): UserMemory[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((item): item is UserMemory => {
      if (!item || typeof item !== 'object') return false
      const memory = item as Partial<UserMemory>
      if (
        typeof memory.id !== 'string' ||
        memory.groupId !== groupId ||
        typeof memory.content !== 'string' ||
        typeof memory.sourceMessageId !== 'string' ||
        typeof memory.createdAt !== 'number' ||
        typeof memory.updatedAt !== 'number' ||
        typeof memory.confidence !== 'number' ||
        memory.confidence < 0 ||
        memory.confidence > 1 ||
        (memory.expiresAt !== null && typeof memory.expiresAt !== 'number') ||
        (memory.tier !== 'short_term' && memory.tier !== 'long_term') ||
        !['preference', 'dislike', 'plan', 'emotion'].includes(String(memory.kind)) ||
        seen.has(memory.id)
      ) {
        return false
      }
      seen.add(memory.id)
      return true
    })
    .slice(-MAX_MEMORIES)
}

function hasPendingClear(groupId: string): boolean {
  try {
    return wx.getStorageSync(clearPendingKey(groupId)) === true
  } catch {
    return false
  }
}

function setPendingClear(groupId: string, pending: boolean): void {
  try {
    wx.setStorageSync(clearPendingKey(groupId), pending)
  } catch {
    // A cloud failure still must not block the local deletion.
  }
}

function readMemories(groupId: string): UserMemory[] {
  try {
    return safeMemories(groupId, wx.getStorageSync(storageKey(groupId)))
  } catch {
    return []
  }
}

function writeMemories(groupId: string, memories: UserMemory[]): void {
  try {
    wx.setStorageSync(storageKey(groupId), memories.slice(-MAX_MEMORIES))
  } catch {
    // Memory failure must never block the active conversation.
  }
}

function callMemoryCloud(data: Record<string, unknown>): Promise<MemoryCloudResult> {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('cloud_unavailable'))
      return
    }
    wx.cloud.callFunction({
      name: 'groupPersistence',
      data,
      success(result) {
        const payload = result.result as MemoryCloudResult | undefined
        if (!payload?.success) {
          reject(new Error(payload?.error || 'memory_persistence_failed'))
          return
        }
        resolve(payload)
      },
      fail(error) {
        reject(new Error(error.errMsg || 'memory_persistence_failed'))
      }
    })
  })
}

function memory(
  groupId: string,
  source: ChatMessage,
  kind: UserMemory['kind'],
  tier: UserMemory['tier'],
  content: string,
  now: number,
  lifetimeMs: number | null,
  confidence: number
): UserMemory {
  const normalized = compact(content)
  return {
    id: `memory-${memoryHash(`${groupId}:${kind}:${normalized}`)}`,
    groupId,
    tier,
    kind,
    content: normalized,
    confidence,
    sourceMessageId: source.id,
    createdAt: now,
    updatedAt: now,
    expiresAt: lifetimeMs == null ? null : now + lifetimeMs
  }
}

export function extractUserMemories(
  groupId: string,
  message: ChatMessage,
  intent: UserIntent,
  now = Date.now()
): UserMemory[] {
  if (message.senderType !== 'user') return []
  const text = compact(message.text, 300)
  const candidates: UserMemory[] = []
  const preference = text.match(/我(?:很|比较|特别|一直)?(?:喜欢|爱)([^，。！？!?]{1,60})/)
  if (preference) {
    candidates.push(
      memory(groupId, message, 'preference', 'long_term', `用户喜欢${preference[1]}`, now, null, 0.9)
    )
  }
  const dislike = text.match(/我(?:很|比较|特别|一直)?(?:不喜欢|讨厌)([^，。！？!?]{1,60})/)
  if (dislike) {
    candidates.push(
      memory(groupId, message, 'dislike', 'long_term', `用户不喜欢${dislike[1]}`, now, null, 0.9)
    )
  }
  const plan = text.match(/我(?:准备|打算|计划|要去)([^，。！？!?]{1,80})/)
  if (plan) {
    candidates.push(
      memory(groupId, message, 'plan', 'short_term', `用户准备${plan[1]}`, now, 24 * 60 * 60_000, 0.85)
    )
  }
  if (intent === 'EMOTION') {
    candidates.push(
      memory(groupId, message, 'emotion', 'short_term', `用户当时表达：${text.slice(0, 80)}`, now, 6 * 60 * 60_000, 0.75)
    )
  }
  return candidates.slice(0, 3)
}

export function recordUserMemories(
  groupId: string,
  message: ChatMessage,
  intent: UserIntent,
  now = Date.now()
): UserMemory[] {
  const extracted = extractUserMemories(groupId, message, intent, now)
  if (!extracted.length) return []
  const memories = readMemories(groupId)
  const byId = new Map(memories.map((item) => [item.id, item]))
  for (const item of extracted) {
    const previous = byId.get(item.id)
    byId.set(
      item.id,
      previous
        ? {
            ...previous,
            content: item.content,
            confidence: Math.max(previous.confidence, item.confidence),
            sourceMessageId: item.sourceMessageId,
            updatedAt: now,
            expiresAt: item.expiresAt
          }
        : item
    )
  }
  const next = [...byId.values()].sort((left, right) => left.updatedAt - right.updatedAt).slice(-MAX_MEMORIES)
  writeMemories(groupId, next)
  const append = () =>
    callMemoryCloud({
      action: 'appendMemories',
      groupId,
      memories: extracted
    })
  if (hasPendingClear(groupId)) {
    void callMemoryCloud({ action: 'clearMemories', groupId })
      .then(() => {
        setPendingClear(groupId, false)
        return append()
      })
      .catch(() => undefined)
  } else {
    void append().catch(() => undefined)
  }
  return extracted
}

export function relevantUserMemories(groupId: string, now = Date.now(), limit = 8): UserMemory[] {
  const memories = readMemories(groupId)
  const active = memories.filter((item) => item.expiresAt == null || item.expiresAt > now)
  if (active.length !== memories.length) writeMemories(groupId, active)
  return active
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, limit))
}

export async function syncUserMemoriesFromCloud(groupId: string): Promise<UserMemory[]> {
  const local = readMemories(groupId)
  try {
    if (hasPendingClear(groupId)) {
      await callMemoryCloud({ action: 'clearMemories', groupId })
      setPendingClear(groupId, false)
      if (local.length) {
        await callMemoryCloud({ action: 'appendMemories', groupId, memories: local })
      }
    }
    const payload = await callMemoryCloud({ action: 'loadMemories', groupId })
    const remote = safeMemories(groupId, payload.memories)
    const merged = new Map(local.map((item) => [item.id, item]))
    for (const item of remote) {
      const previous = merged.get(item.id)
      if (!previous || item.updatedAt >= previous.updatedAt) merged.set(item.id, item)
    }
    const result = [...merged.values()]
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(-MAX_MEMORIES)
    writeMemories(groupId, result)
    return result
  } catch {
    return local
  }
}

export async function clearUserMemories(groupId: string): Promise<void> {
  writeMemories(groupId, [])
  setPendingClear(groupId, true)
  try {
    await callMemoryCloud({ action: 'clearMemories', groupId })
    setPendingClear(groupId, false)
  } catch {
    // Keep a tombstone so the next sync retries deletion instead of restoring cloud memories.
  }
}
