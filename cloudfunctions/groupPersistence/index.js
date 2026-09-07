'use strict'

const crypto = require('node:crypto')

const SESSION_COLLECTION = 'wchat_group_sessions'
const MESSAGE_COLLECTION = 'wchat_group_messages'
const EVENT_COLLECTION = 'wchat_group_events'
const MEMORY_COLLECTION = 'wchat_group_memories'
const ASSET_COLLECTION = 'wchat_group_assets'
const MAX_MESSAGES_PER_WRITE = 10
const MAX_MESSAGES_PER_LOAD = 100
const GROUP_MEMBERS = {
  'evening-breeze-companion': new Set(['axing', 'qiao', 'ning']),
  'clear-table-discussion': new Set(['axing', 'qiao', 'ning']),
  'crossworld-convention-salon': new Set(['axing', 'qiao', 'ning']),
  'mist-harbor-story': new Set(['axing', 'qiao', 'ning'])
}
const GROUP_MODES = {
  'evening-breeze-companion': 'companion',
  'clear-table-discussion': 'discussion',
  'crossworld-convention-salon': 'crossover_salon',
  'mist-harbor-story': 'story'
}
const MOODS = new Set(['平静', '开心', '好奇', '兴奋', '疲惫', '关心', '紧张', '无聊'])
const SENDERS = new Set(['user', 'ai', 'system'])
const MOTIVES = new Set([
  'answer',
  'acknowledge',
  'expand',
  'share_story',
  'react',
  'challenge',
  'support',
  'ask',
  'repair',
  'close'
])
const DELAY_PROFILES = new Set(['quick', 'normal', 'thoughtful', 'afterthought'])
const TOPIC_KINDS = new Set(['general', 'food', 'weather', 'location', 'news', 'emotion', 'action', 'opinion'])
const TOPIC_STAGES = new Set(['START', 'GROWING', 'PEAK', 'COOLING', 'ENDED'])
const TOPIC_SOURCES = new Set(['user', 'location', 'weather', 'poi', 'news', 'time', 'system'])
const TRIGGERS = new Set(['user', 'image', 'world', 'continuation', 'autonomous'])
const EVENT_STATUSES = new Set(['pending', 'consumed', 'dismissed', 'expired'])
const EVENT_TYPES = new Set(['world_change', 'memory_recall', 'scheduled_activity'])
const MEMORY_TIERS = new Set(['short_term', 'long_term'])
const MEMORY_KINDS = new Set(['preference', 'dislike', 'plan', 'emotion'])
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VISUAL_CATEGORIES = new Set([
  'food',
  'scenery',
  'building',
  'weather',
  'document',
  'screenshot',
  'person',
  'animal',
  'object',
  'other'
])

function trimText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function safeTimestamp(value, fallback = Date.now()) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return fallback
  return Math.min(number, Date.now() + 5 * 60 * 1000)
}

function isCollectionMissingError(error) {
  const code = String(error?.errCode ?? error?.errcode ?? error?.code ?? '')
  const message = String(error?.message ?? error?.errMsg ?? error ?? '').toLowerCase()
  return (
    code === '-502005' ||
    code === 'database_collection_not_exist' ||
    /collection.*(not exist|does not exist|不存在)/i.test(message)
  )
}

function isCollectionAlreadyExistsError(error) {
  const message = String(error?.message ?? error?.errMsg ?? error ?? '').toLowerCase()
  return /collection.*(already exist|已存在)/i.test(message)
}

async function setWithCollectionBootstrap(db, collectionName, documentIdValue, data) {
  const write = () => db.collection(collectionName).doc(documentIdValue).set({ data })
  try {
    await write()
  } catch (error) {
    if (!isCollectionMissingError(error) || typeof db.createCollection !== 'function') throw error
    try {
      await db.createCollection(collectionName)
    } catch (createError) {
      if (!isCollectionAlreadyExistsError(createError)) throw createError
    }
    await write()
  }
}

function isKnownGroup(groupId) {
  return Boolean(GROUP_MEMBERS[groupId])
}

function safeStringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .map((item) => trimText(item, maxLength))
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
    .slice(0, maxItems)
}

function isGroupImageFile(fileId, groupId) {
  return (
    typeof fileId === 'string' &&
    fileId.startsWith('cloud://') &&
    fileId.includes(`/user-images/${groupId}/`) &&
    fileId.length <= 500
  )
}

function documentId(...parts) {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex')
}

function sanitizeTopic(value) {
  if (!value || typeof value !== 'object') return null
  const id = trimText(value.id, 100)
  const title = trimText(value.title, 120)
  if (!id || !title || !TOPIC_KINDS.has(value.type) || !TOPIC_STAGES.has(value.stage) || !TOPIC_SOURCES.has(value.source)) {
    return null
  }
  return {
    id,
    type: value.type,
    title,
    source: value.source,
    energy: Math.max(0, Math.min(100, Number(value.energy) || 0)),
    stage: value.stage,
    messageCount: Math.max(0, Math.min(1000, Math.floor(Number(value.messageCount) || 0))),
    createdAt: safeTimestamp(value.createdAt),
    lastActiveAt: safeTimestamp(value.lastActiveAt),
    lockedByUser: value.lockedByUser === true
  }
}

function sanitizeState(value, groupId) {
  if (!value || typeof value !== 'object' || !isKnownGroup(groupId)) return null
  const members = GROUP_MEMBERS[groupId]
  const cooldowns = {}
  if (value.cooldowns && typeof value.cooldowns === 'object') {
    for (const [kind, timestamp] of Object.entries(value.cooldowns)) {
      if (TOPIC_KINDS.has(kind)) cooldowns[kind] = safeTimestamp(timestamp, 0)
    }
  }
  return {
    mood: MOODS.has(value.mood) ? value.mood : '平静',
    currentTopic: sanitizeTopic(value.currentTopic),
    currentFocus: trimText(value.currentFocus, 500) || null,
    currentOpportunityId: trimText(value.currentOpportunityId, 100) || null,
    silenceUntil: value.silenceUntil == null ? null : safeTimestamp(value.silenceUntil),
    lastMessageTime: safeTimestamp(value.lastMessageTime),
    consecutiveAiMessages: Math.max(0, Math.min(3, Math.floor(Number(value.consecutiveAiMessages) || 0))),
    unreadCount: Math.max(0, Math.min(30, Math.floor(Number(value.unreadCount) || 0))),
    lastSpeakerId: members.has(value.lastSpeakerId) ? value.lastSpeakerId : null,
    cooldowns,
    seenOpportunityIds: Array.isArray(value.seenOpportunityIds)
      ? value.seenOpportunityIds.map((item) => trimText(item, 100)).filter(Boolean).slice(-100)
      : [],
    modeState: sanitizeModeState(value.modeState, GROUP_MODES[groupId])
  }
}

function sanitizeModeState(value, expectedMode) {
  const state = value && typeof value === 'object' ? value : {}
  if (expectedMode === 'discussion') {
    return {
      kind: 'discussion',
      phase: ['OPEN', 'EXPLORE', 'COMPARE', 'SYNTHESIZE'].includes(state.phase) ? state.phase : 'OPEN',
      turnCount: Math.max(0, Math.min(1000, Math.floor(Number(state.turnCount) || 0))),
      question: trimText(state.question, 300) || null,
      perspectives: Array.isArray(state.perspectives)
        ? state.perspectives.map((item) => trimText(item, 120)).filter(Boolean).slice(0, 8)
        : []
    }
  }
  if (expectedMode === 'crossover_salon') {
    return {
      kind: 'crossover_salon',
        scene: trimText(state.scene, 120) || '漫展中立会客区',
        collisionCount: Math.max(0, Math.min(10000, Math.floor(Number(state.collisionCount) || 0))),
        lastContrast: trimText(state.lastContrast, 200) || null,
        lastAutonomousAt: state.lastAutonomousAt == null ? null : safeTimestamp(state.lastAutonomousAt)
    }
  }
  if (expectedMode === 'story') {
    return {
      kind: 'story',
      storyId: trimText(state.storyId, 120) || 'mist-harbor-letter',
      chapter: Math.max(1, Math.min(100, Math.floor(Number(state.chapter) || 1))),
      turnCount: Math.max(0, Math.min(10000, Math.floor(Number(state.turnCount) || 0))),
      scene: trimText(state.scene, 160) || '雾港临时联络群',
      objective: trimText(state.objective, 240) || '查清匿名来信与旧钟楼的关系',
        clues: Array.isArray(state.clues)
          ? state.clues.map((item) => trimText(item, 160)).filter(Boolean).slice(0, 30)
          : [],
        userRole: trimText(state.userRole, 120) || '刚抵达雾港的收信人',
        lastAutonomousAt: state.lastAutonomousAt == null ? null : safeTimestamp(state.lastAutonomousAt)
      }
  }
  return {
    kind: 'companion',
    sharedMoments: Math.max(0, Math.min(10000, Math.floor(Number(state.sharedMoments) || 0)))
  }
}

function sanitizeMessage(value, groupId) {
  if (!value || typeof value !== 'object' || !isKnownGroup(groupId)) return null
  const id = trimText(value.id, 100)
  const text = trimText(value.text, 1000)
  const senderType = SENDERS.has(value.senderType) ? value.senderType : null
  if (!id || !text || !senderType) return null
  const members = GROUP_MEMBERS[groupId]
  const speakerId = members.has(value.speakerId) ? value.speakerId : null
  if (senderType === 'ai' && !speakerId) return null
  const image = senderType === 'user' ? sanitizeImageAttachment(value.image, groupId) : null
  const visualEvidence = image ? sanitizeVisualEvidence(value.visualEvidence) : null
  const contentType =
    image && value.contentType === 'mixed'
      ? 'mixed'
      : image
        ? 'image'
        : 'text'
  return {
    id,
    senderType,
    speakerId: senderType === 'ai' ? speakerId : null,
    speakerName: trimText(value.speakerName, 40) || (senderType === 'user' ? '我' : '系统'),
    text,
    createdAt: safeTimestamp(value.createdAt),
    timeLabel: trimText(value.timeLabel, 20),
    topicId: trimText(value.topicId, 100) || null,
    replyToMessageId: trimText(value.replyToMessageId, 100) || null,
    isAiGenerated: senderType === 'ai' && value.isAiGenerated === true,
    motive: MOTIVES.has(value.motive) ? value.motive : null,
    delayProfile: DELAY_PROFILES.has(value.delayProfile) ? value.delayProfile : 'normal',
    required: value.required === true,
    storyId: trimText(value.storyId, 100) || null,
    turnId: trimText(value.turnId, 100) || null,
    bubbleIndex: Math.max(0, Math.min(1, Math.floor(Number(value.bubbleIndex) || 0))),
    trigger: TRIGGERS.has(value.trigger) ? value.trigger : undefined,
    contentType,
    image,
    visualEvidence
  }
}

function sanitizeImageAttachment(value, groupId) {
  if (!value || typeof value !== 'object') return null
  const fileId = trimText(value.fileId, 500)
  if (
    !isGroupImageFile(fileId, groupId) ||
    !IMAGE_MIME_TYPES.has(value.mimeType) ||
    value.status !== 'ready'
  ) {
    return null
  }
  return {
    fileId,
    width: Math.max(0, Math.min(12000, Math.floor(Number(value.width) || 0))),
    height: Math.max(0, Math.min(12000, Math.floor(Number(value.height) || 0))),
    size: Math.max(0, Math.min(5 * 1024 * 1024, Math.floor(Number(value.size) || 0))),
    mimeType: value.mimeType,
    status: 'ready'
  }
}

function sanitizeVisualEvidence(value) {
  if (!value || typeof value !== 'object') return null
  const id = trimText(value.id, 120)
  const summary = trimText(value.summary, 300)
  if (!id || !summary || value.safety !== 'passed') return null
  return {
    id,
    provider: trimText(value.provider, 80) || '视觉模型',
    model: trimText(value.model, 100) || 'unknown',
    analyzedAt: safeTimestamp(value.analyzedAt),
    category: VISUAL_CATEGORIES.has(value.category) ? value.category : 'other',
    summary,
    objects: safeStringList(value.objects, 10, 80),
    visibleText: safeStringList(value.visibleText, 8, 120),
    notableDetails: safeStringList(value.notableDetails, 8, 120),
    uncertainties: safeStringList(value.uncertainties, 6, 120),
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    safety: 'passed'
  }
}

function sanitizeAsset(value, groupId) {
  const image = sanitizeImageAttachment({ ...value, status: 'ready' }, groupId)
  if (!image) return null
  return {
    ...image,
    createdAt: safeTimestamp(value.createdAt)
  }
}

function sanitizeMessages(value, groupId) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .slice(0, MAX_MESSAGES_PER_WRITE)
    .map((message) => sanitizeMessage(message, groupId))
    .filter((message) => {
      if (!message || seen.has(message.id)) return false
      seen.add(message.id)
      return true
    })
}

function sanitizeEvent(value, groupId) {
  if (!value || typeof value !== 'object' || !isKnownGroup(groupId)) return null
  const id = trimText(value.id, 120)
  const title = trimText(value.title, 160)
  const description = trimText(value.description, 500)
  if (
    !id ||
    !title ||
    !description ||
    value.groupId !== groupId ||
    !EVENT_TYPES.has(value.type) ||
    !TOPIC_KINDS.has(value.topicKind) ||
    !TOPIC_SOURCES.has(value.source)
  ) {
    return null
  }
  return {
    id,
    groupId,
    type: value.type,
    topicKind: value.topicKind,
    source: value.source,
    title,
    description,
    importance: Math.max(0, Math.min(100, Number(value.importance) || 0)),
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    occurredAt: safeTimestamp(value.occurredAt),
    expiresAt: safeTimestamp(value.expiresAt),
    evidenceIds: Array.isArray(value.evidenceIds)
      ? value.evidenceIds.map((item) => trimText(item, 120)).filter(Boolean).slice(0, 8)
      : [],
    opportunityId: trimText(value.opportunityId, 120) || null,
    status: EVENT_STATUSES.has(value.status) ? value.status : 'pending',
    consumedAt: value.consumedAt == null ? null : safeTimestamp(value.consumedAt),
    messageIds: Array.isArray(value.messageIds)
      ? value.messageIds.map((item) => trimText(item, 120)).filter(Boolean).slice(0, 3)
      : []
  }
}

function sanitizeEvents(value, groupId) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .slice(0, 10)
    .map((event) => sanitizeEvent(event, groupId))
    .filter((event) => {
      if (!event || seen.has(event.id)) return false
      seen.add(event.id)
      return true
    })
}

function sanitizeMemory(value, groupId) {
  if (!value || typeof value !== 'object' || !isKnownGroup(groupId)) return null
  const id = trimText(value.id, 120)
  const content = trimText(value.content, 240)
  if (
    !id ||
    !content ||
    value.groupId !== groupId ||
    !MEMORY_TIERS.has(value.tier) ||
    !MEMORY_KINDS.has(value.kind)
  ) {
    return null
  }
  return {
    id,
    groupId,
    tier: value.tier,
    kind: value.kind,
    content,
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    sourceMessageId: trimText(value.sourceMessageId, 120),
    createdAt: safeTimestamp(value.createdAt),
    updatedAt: safeTimestamp(value.updatedAt),
    expiresAt: value.expiresAt == null ? null : safeTimestamp(value.expiresAt)
  }
}

function sanitizeMemories(value, groupId) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .slice(0, 10)
    .map((item) => sanitizeMemory(item, groupId))
    .filter((item) => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
}

async function readSession(sessionRef) {
  try {
    const result = await sessionRef.get()
    return result?.data || null
  } catch {
    return null
  }
}

async function writeMessages(db, ownerOpenId, groupId, messages, now) {
  let inserted = 0
  for (const message of messages) {
    const messageRef = db.collection(MESSAGE_COLLECTION).doc(documentId(ownerOpenId, groupId, message.id))
    let exists = false
    try {
      const existing = await messageRef.get()
      exists = Boolean(existing?.data)
    } catch {
      exists = false
    }
    await messageRef.set({
      data: {
        ownerOpenId,
        groupId,
        ...message,
        persistedAt: now
      }
    })
    if (!exists) inserted += 1
  }
  return inserted
}

async function verifyMessageAssets(db, ownerOpenId, groupId, messages) {
  const verified = []
  for (const message of messages) {
    if (!message.image) {
      verified.push(message)
      continue
    }
    const assetId = documentId(ownerOpenId, groupId, message.image.fileId)
    const asset = await readSession(db.collection(ASSET_COLLECTION).doc(assetId))
    if (
      asset?.ownerOpenId !== ownerOpenId ||
      asset?.groupId !== groupId ||
      asset?.fileId !== message.image.fileId ||
      asset?.status !== 'active' ||
      asset?.safetyStatus !== 'passed'
    ) {
      continue
    }
    if (!message.visualEvidence) {
      verified.push({ ...message, visualEvidence: null })
      continue
    }
    const trustedEvidence = sanitizeVisualEvidence(asset.visualEvidence)
    if (
      !message.visualEvidence ||
      !trustedEvidence ||
      message.visualEvidence.id !== trustedEvidence.id
    ) {
      continue
    }
    verified.push({ ...message, visualEvidence: trustedEvidence })
  }
  return verified
}

async function handleLoad(db, ownerOpenId, groupId) {
  const sessionId = documentId(ownerOpenId, groupId)
  const session = await readSession(db.collection(SESSION_COLLECTION).doc(sessionId))
  const result = await db
    .collection(MESSAGE_COLLECTION)
    .where({ ownerOpenId, groupId })
    .orderBy('createdAt', 'desc')
    .limit(MAX_MESSAGES_PER_LOAD)
    .get()
  const messages = Array.isArray(result?.data)
    ? result.data
        .slice()
        .reverse()
        .map(({ _id, ownerOpenId: _owner, groupId: _group, persistedAt: _persisted, ...message }) => message)
    : []
  return {
    success: true,
    groupId,
    state: session?.state || null,
    messages,
    unreadCount: Math.max(0, Number(session?.unreadCount) || 0),
    updatedAt: Number(session?.updatedAt) || 0,
    lastReadAt: Number(session?.lastReadAt) || 0
  }
}

async function handleAppend(db, ownerOpenId, groupId, event) {
  let messages = sanitizeMessages(event.messages, groupId)
  const state = sanitizeState(event.state, groupId)
  messages = await verifyMessageAssets(db, ownerOpenId, groupId, messages)
  if (!messages.length) return { success: false, error: 'invalid_messages' }
  const now = Date.now()
  const sessionRef = db.collection(SESSION_COLLECTION).doc(documentId(ownerOpenId, groupId))
  const previous = await readSession(sessionRef)
  const inserted = await writeMessages(db, ownerOpenId, groupId, messages, now)
  const latest = messages[messages.length - 1]
  const backgroundAiCount =
    event.visible === false ? messages.filter((message) => message.senderType === 'ai').length : 0
  const unreadCount =
    event.visible === false
      ? Math.min(30, Math.max(0, Number(previous?.unreadCount) || 0) + backgroundAiCount)
      : 0
  await sessionRef.set({
    data: {
      ownerOpenId,
      groupId,
      state: state || previous?.state || null,
      unreadCount,
      latestMessage: {
        id: latest.id,
        speakerName: latest.speakerName,
        text: latest.text,
        createdAt: latest.createdAt,
        senderType: latest.senderType
      },
      createdAt: Number(previous?.createdAt) || now,
      updatedAt: now,
      lastReadAt: event.visible === false ? Number(previous?.lastReadAt) || 0 : now,
      schemaVersion: 1
    }
  })
  return { success: true, inserted, unreadCount, updatedAt: now }
}

async function handleRegisterImage(db, ownerOpenId, groupId, event) {
  const image = sanitizeAsset(event.image, groupId)
  if (!image) return { success: false, error: 'invalid_image_asset' }
  const assetId = documentId(ownerOpenId, groupId, image.fileId)
  const now = Date.now()
  await setWithCollectionBootstrap(db, ASSET_COLLECTION, assetId, {
    ownerOpenId,
    groupId,
    ...image,
    status: 'active',
    registeredAt: now
  })
  return { success: true, groupId, fileId: image.fileId }
}

async function handleDeleteImage(cloud, db, ownerOpenId, groupId, event) {
  const fileId = trimText(event.fileId, 500)
  if (!isGroupImageFile(fileId, groupId)) return { success: false, error: 'invalid_image_asset' }
  const assetId = documentId(ownerOpenId, groupId, fileId)
  const ref = db.collection(ASSET_COLLECTION).doc(assetId)
  const asset = await readSession(ref)
  if (asset?.ownerOpenId !== ownerOpenId || asset?.groupId !== groupId || asset?.fileId !== fileId) {
    return { success: false, error: 'image_asset_not_found' }
  }
  try {
    await cloud.deleteFile({ fileList: [fileId] })
    await ref.remove()
  } catch (error) {
    await ref.update({
      data: {
        status: 'delete_pending',
        deletionError: trimText(error?.message, 160) || 'cloud_delete_failed',
        deletionRequestedAt: Date.now()
      }
    })
    throw error
  }
  return { success: true, groupId, fileId }
}

async function handleMarkRead(db, ownerOpenId, groupId) {
  const now = Date.now()
  const sessionRef = db.collection(SESSION_COLLECTION).doc(documentId(ownerOpenId, groupId))
  const previous = await readSession(sessionRef)
  await sessionRef.set({
    data: {
      ownerOpenId,
      groupId,
      state: previous?.state || null,
      unreadCount: 0,
      latestMessage: previous?.latestMessage || null,
      createdAt: Number(previous?.createdAt) || now,
      updatedAt: Number(previous?.updatedAt) || now,
      lastReadAt: now,
      schemaVersion: 1
    }
  })
  return { success: true, unreadCount: 0, lastReadAt: now }
}

async function handleAppendEvents(db, ownerOpenId, groupId, event) {
  const events = sanitizeEvents(event.events, groupId)
  if (!events.length) return { success: false, error: 'invalid_events' }
  const now = Date.now()
  for (const item of events) {
    const eventRef = db.collection(EVENT_COLLECTION).doc(documentId(ownerOpenId, groupId, item.id))
    let previous = null
    try {
      previous = (await eventRef.get())?.data || null
    } catch {
      previous = null
    }
    await eventRef.set({
      data: {
        ownerOpenId,
        ...item,
        status: previous?.status === 'consumed' ? 'consumed' : item.status,
        consumedAt: previous?.consumedAt || item.consumedAt,
        messageIds: previous?.messageIds?.length ? previous.messageIds : item.messageIds,
        persistedAt: now
      }
    })
  }
  return { success: true, stored: events.length }
}

async function handleLoadEvents(db, ownerOpenId, groupId) {
  const result = await db
    .collection(EVENT_COLLECTION)
    .where({ ownerOpenId, groupId })
    .orderBy('occurredAt', 'desc')
    .limit(100)
    .get()
  const events = Array.isArray(result?.data)
    ? result.data.map(({ _id, ownerOpenId: _owner, persistedAt: _persisted, ...item }) => item)
    : []
  return { success: true, groupId, events }
}

async function handleConsumeEvent(db, ownerOpenId, groupId, event) {
  const eventId = trimText(event.eventId, 120)
  if (!eventId) return { success: false, error: 'invalid_event_id' }
  const eventRef = db.collection(EVENT_COLLECTION).doc(documentId(ownerOpenId, groupId, eventId))
  let previous = null
  try {
    previous = (await eventRef.get())?.data || null
  } catch {
    previous = null
  }
  if (!previous || previous.ownerOpenId !== ownerOpenId || previous.groupId !== groupId) {
    return { success: false, error: 'event_not_found' }
  }
  const { _id: _eventDocumentId, ...previousData } = previous
  const consumedAt = Date.now()
  await eventRef.set({
    data: {
      ...previousData,
      status: 'consumed',
      consumedAt,
      messageIds: Array.isArray(event.messageIds)
        ? event.messageIds.map((item) => trimText(item, 120)).filter(Boolean).slice(0, 3)
        : [],
      persistedAt: consumedAt
    }
  })
  return { success: true, eventId, consumedAt }
}

async function handleAppendMemories(db, ownerOpenId, groupId, event) {
  const memories = sanitizeMemories(event.memories, groupId)
  if (!memories.length) return { success: false, error: 'invalid_memories' }
  const now = Date.now()
  for (const item of memories) {
    const ref = db.collection(MEMORY_COLLECTION).doc(documentId(ownerOpenId, groupId, item.id))
    let previous = null
    try {
      previous = (await ref.get())?.data || null
    } catch {
      previous = null
    }
    await ref.set({
      data: {
        ownerOpenId,
        ...item,
        createdAt: Number(previous?.createdAt) || item.createdAt,
        updatedAt: Math.max(Number(previous?.updatedAt) || 0, item.updatedAt),
        persistedAt: now
      }
    })
  }
  return { success: true, stored: memories.length }
}

async function handleLoadMemories(db, ownerOpenId, groupId) {
  const result = await db
    .collection(MEMORY_COLLECTION)
    .where({ ownerOpenId, groupId })
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get()
  const memories = Array.isArray(result?.data)
    ? result.data.map(({ _id, ownerOpenId: _owner, persistedAt: _persisted, ...item }) => item)
    : []
  return { success: true, groupId, memories }
}

async function handleClearMemories(db, ownerOpenId, groupId) {
  await db.collection(MEMORY_COLLECTION).where({ ownerOpenId, groupId }).remove()
  return { success: true, groupId }
}

exports.main = async (event = {}) => {
  const action = trimText(event.action, 30)
  const groupId = trimText(event.groupId, 80)
  if (!isKnownGroup(groupId)) return { success: false, error: 'unknown_group' }

  let cloud
  try {
    cloud = require('wx-server-sdk')
  } catch {
    return { success: false, error: 'cloud_sdk_unavailable' }
  }
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  const ownerOpenId = trimText(cloud.getWXContext()?.OPENID, 128)
  if (!ownerOpenId) return { success: false, error: 'user_identity_unavailable' }
  const db = cloud.database()

  try {
    if (action === 'load') return await handleLoad(db, ownerOpenId, groupId)
    if (action === 'append') return await handleAppend(db, ownerOpenId, groupId, event)
    if (action === 'markRead') return await handleMarkRead(db, ownerOpenId, groupId)
    if (action === 'appendEvents') return await handleAppendEvents(db, ownerOpenId, groupId, event)
    if (action === 'loadEvents') return await handleLoadEvents(db, ownerOpenId, groupId)
    if (action === 'consumeEvent') return await handleConsumeEvent(db, ownerOpenId, groupId, event)
    if (action === 'appendMemories') return await handleAppendMemories(db, ownerOpenId, groupId, event)
    if (action === 'loadMemories') return await handleLoadMemories(db, ownerOpenId, groupId)
    if (action === 'clearMemories') return await handleClearMemories(db, ownerOpenId, groupId)
    if (action === 'registerImage') return await handleRegisterImage(db, ownerOpenId, groupId, event)
    if (action === 'deleteImage') return await handleDeleteImage(cloud, db, ownerOpenId, groupId, event)
    return { success: false, error: 'unknown_action' }
  } catch (error) {
    return { success: false, error: error?.message || 'group_persistence_failed' }
  }
}

exports.__test = {
  isKnownGroup,
  documentId,
  sanitizeTopic,
  sanitizeState,
  sanitizeModeState,
  sanitizeMessage,
  sanitizeMessages,
  sanitizeEvent,
  sanitizeEvents,
  sanitizeMemory,
  sanitizeMemories,
  sanitizeImageAttachment,
  sanitizeVisualEvidence,
  sanitizeAsset,
  isGroupImageFile,
  isCollectionMissingError,
  setWithCollectionBootstrap
}
