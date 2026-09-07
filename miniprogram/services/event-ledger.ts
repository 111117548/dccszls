import type { GroupEvent, Opportunity } from '../core/types'

const EVENT_LEDGER_PREFIX = 'wchat.eventLedger.v1.'
const MAX_EVENTS = 100

interface EventCloudResult {
  success?: boolean
  error?: string
  events?: unknown
}

function storageKey(groupId: string): string {
  return `${EVENT_LEDGER_PREFIX}${encodeURIComponent(groupId)}`
}

function safeEvents(groupId: string, value: unknown): GroupEvent[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((item): item is GroupEvent => {
      if (!item || typeof item !== 'object') return false
      const event = item as Partial<GroupEvent>
      if (
        typeof event.id !== 'string' ||
        typeof event.title !== 'string' ||
        typeof event.description !== 'string' ||
        typeof event.occurredAt !== 'number' ||
        typeof event.expiresAt !== 'number' ||
        event.groupId !== groupId ||
        seen.has(event.id)
      ) {
        return false
      }
      seen.add(event.id)
      return true
    })
    .slice(-MAX_EVENTS)
}

function readEvents(groupId: string): GroupEvent[] {
  try {
    return safeEvents(groupId, wx.getStorageSync(storageKey(groupId)))
  } catch {
    return []
  }
}

function writeEvents(groupId: string, events: GroupEvent[]): void {
  try {
    wx.setStorageSync(storageKey(groupId), events.slice(-MAX_EVENTS))
  } catch {
    // Event persistence is best-effort until cloud synchronization is available.
  }
}

function callEventCloud(data: Record<string, unknown>): Promise<EventCloudResult> {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('cloud_unavailable'))
      return
    }
    wx.cloud.callFunction({
      name: 'groupPersistence',
      data,
      success(result) {
        const payload = result.result as EventCloudResult | undefined
        if (!payload?.success) {
          reject(new Error(payload?.error || 'event_persistence_failed'))
          return
        }
        resolve(payload)
      },
      fail(error) {
        reject(new Error(error.errMsg || 'event_persistence_failed'))
      }
    })
  })
}

async function appendEventsToCloud(groupId: string, events: GroupEvent[]): Promise<void> {
  if (!events.length) return
  try {
    await callEventCloud({ action: 'appendEvents', groupId, events: events.slice(0, 10) })
  } catch {
    // Local ledger remains authoritative until cloud synchronization succeeds.
  }
}

export function recordWorldOpportunities(
  groupId: string,
  opportunities: Opportunity[],
  occurredAt = Date.now()
): GroupEvent[] {
  const events = readEvents(groupId)
  const byId = new Map(events.map((event) => [event.id, event]))
  const added: GroupEvent[] = []
  for (const opportunity of opportunities) {
    const id = `event-${opportunity.id}`
    if (byId.has(id)) continue
    const event: GroupEvent = {
      id,
      groupId,
      type: 'world_change',
      topicKind: opportunity.type,
      source: opportunity.source,
      title: opportunity.title,
      description: opportunity.description,
      importance: opportunity.importance,
      confidence: opportunity.confidence,
      occurredAt,
      expiresAt: opportunity.expiresAt,
      evidenceIds: [...opportunity.evidenceIds],
      opportunityId: opportunity.id,
      status: 'pending',
      consumedAt: null,
      messageIds: []
    }
    events.push(event)
    byId.set(id, event)
    added.push(event)
  }
  writeEvents(groupId, events)
  void appendEventsToCloud(groupId, added)
  return added
}

export async function syncGroupEventsFromCloud(groupId: string): Promise<GroupEvent[]> {
  const local = readEvents(groupId)
  try {
    const payload = await callEventCloud({ action: 'loadEvents', groupId })
    const remote = safeEvents(groupId, payload.events)
    const merged = new Map(local.map((event) => [event.id, event]))
    for (const event of remote) {
      const previous = merged.get(event.id)
      if (previous?.status === 'consumed' && event.status !== 'consumed') continue
      if (previous?.status === 'expired' && event.status === 'pending') continue
      merged.set(event.id, event)
    }
    const events = [...merged.values()]
      .sort((left, right) => left.occurredAt - right.occurredAt)
      .slice(-MAX_EVENTS)
    writeEvents(groupId, events)
    const localAhead = local.filter((event) => {
      const candidate = remote.find((remoteEvent) => remoteEvent.id === event.id)
      return (
        !candidate ||
        (event.status === 'consumed' && candidate.status !== 'consumed') ||
        (event.status === 'expired' && candidate.status === 'pending')
      )
    })
    void appendEventsToCloud(groupId, localAhead)
    return events
  } catch {
    return local
  }
}

export function pendingGroupEvents(groupId: string, now = Date.now()): GroupEvent[] {
  const events = readEvents(groupId)
  let changed = false
  for (const event of events) {
    if (event.status === 'pending' && event.expiresAt <= now) {
      event.status = 'expired'
      changed = true
    }
  }
  if (changed) writeEvents(groupId, events)
  return events
    .filter((event) => event.status === 'pending' && event.expiresAt > now)
    .sort((left, right) => right.importance - left.importance || left.occurredAt - right.occurredAt)
}

export function markGroupEventConsumed(
  groupId: string,
  eventId: string,
  messageIds: string[],
  now = Date.now()
): void {
  const events = readEvents(groupId)
  const event = events.find((candidate) => candidate.id === eventId)
  if (!event) return
  event.status = 'consumed'
  event.consumedAt = now
  event.messageIds = messageIds.slice(0, 3)
  writeEvents(groupId, events)
  void callEventCloud({
    action: 'consumeEvent',
    groupId,
    eventId,
    messageIds: event.messageIds
  }).catch(() => undefined)
}

export function opportunityFromEvent(event: GroupEvent): Opportunity | null {
  if (event.type !== 'world_change' || !event.opportunityId) return null
  return {
    id: event.opportunityId,
    type: event.topicKind,
    source: event.source,
    title: event.title,
    description: event.description,
    importance: event.importance,
    confidence: event.confidence,
    expiresAt: event.expiresAt,
    evidenceIds: [...event.evidenceIds]
  }
}
