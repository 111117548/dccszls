import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { ChatMessage, VisualEvidence } from '../miniprogram/core/types.ts'
import { safeImageAttachment, safeVisualEvidence } from '../miniprogram/core/visual-evidence.ts'
import { groupDefinitions } from '../miniprogram/data/groups.ts'
import { createGroupRuntime } from '../miniprogram/modes/registry.ts'
import { mockWorld } from '../miniprogram/mock/world.ts'
import { buildGroupChatRequest } from '../miniprogram/services/group-chat-service.ts'
import { makeVisualUnavailableReplies } from '../miniprogram/core/visual-conversation.ts'
import {
  loadLocalGroupSession,
  persistGroupMessages
} from '../miniprogram/services/group-session-repository.ts'
import {
  analyzeUploadedImage,
  imageMessageError,
  selectAndUploadImage
} from '../miniprogram/services/image-message-service.ts'

const require = createRequire(import.meta.url)
const visionCloud = require('../cloudfunctions/imageVision/index.js') as {
  __test: {
    validHost(value: string): string | null
    isGroupImageFile(fileId: string, groupId: string): boolean
    sanitizeVisionOutput(value: unknown, metadata?: Record<string, unknown>): VisualEvidence | null
    visionPrompt(): string
  }
}
const chatCloud = require('../cloudfunctions/groupChat/index.js') as {
  __test: {
    sanitizeVisualEvidence(value: unknown): VisualEvidence | null
    visualEvidenceForModel(value: VisualEvidence | null): Record<string, unknown> | null
  }
}
const persistenceCloud = require('../cloudfunctions/groupPersistence/index.js') as {
  __test: {
    sanitizeMessage(value: unknown, groupId: string): ChatMessage | null
    sanitizeAsset(value: unknown, groupId: string): unknown
  }
}

const groupId = 'evening-breeze-companion'
const fileId = `cloud://prototype.1234/user-images/${groupId}/sample.jpg`
const evidence: VisualEvidence = {
  id: 'private-vision-id',
  provider: 'Tencent TokenHub',
  model: 'hy-vision-2.0-instruct',
  analyzedAt: 100,
  category: 'food',
  summary: '白色盘子里放着一份面条',
  objects: ['盘子', '面条'],
  visibleText: [],
  notableDetails: ['面条上有绿色配菜'],
  uncertainties: ['无法仅凭图片确认口味'],
  confidence: 0.91,
  safety: 'passed'
}

function imageMessage(text = '看看这个'): ChatMessage {
  return {
    id: 'image-message-1',
    senderType: 'user',
    speakerId: null,
    speakerName: '我',
    text,
    createdAt: 100,
    timeLabel: '',
    topicId: 'image-topic',
    replyToMessageId: null,
    isAiGenerated: false,
    trigger: 'image',
    contentType: 'mixed',
    image: {
      fileId,
      width: 1200,
      height: 900,
      size: 300_000,
      mimeType: 'image/jpeg',
      status: 'ready'
    },
    visualEvidence: evidence
  }
}

test('vision cloud accepts only official TokenHub hosts and group-bound cloud images', () => {
  assert.equal(visionCloud.__test.validHost('https://tokenhub.tencentmaas.com/'), 'tokenhub.tencentmaas.com')
  assert.equal(visionCloud.__test.validHost('tokenhub.tencentmaas.com.attacker.test'), null)
  assert.equal(visionCloud.__test.isGroupImageFile(fileId, groupId), true)
  assert.equal(visionCloud.__test.isGroupImageFile(fileId, 'mist-harbor-story'), false)
})

test('image upload is committed before the slower visual analysis step', async () => {
  const stages: string[] = []
  let visionCalls = 0
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    chooseMedia(options: { success(result: unknown): void }) {
      options.success({
        tempFiles: [{
          tempFilePath: '/tmp/photo.jpg',
          size: 320_000,
          width: 1200,
          height: 900
        }]
      })
    },
    compressImage(options: { success(result: unknown): void }) {
      options.success({ tempFilePath: '/tmp/photo-compressed.jpg' })
    },
    getFileInfo(options: { success(result: unknown): void }) {
      options.success({ size: 210_000 })
    },
    cloud: {
      uploadFile(options: { success(result: unknown): void }) {
        options.success({ fileID: fileId })
        return { abort() {} }
      },
      callFunction(options: {
        name: string
        data?: { action?: string }
        success(result: { result: unknown }): void
      }) {
        if (options.name === 'imageVision') {
          if (options.data?.action === 'analyze') {
            visionCalls += 1
            options.success({ result: { success: true, evidence } })
          } else {
            options.success({ result: { success: true, safety: 'passed' } })
          }
          return
        }
        options.success({ result: { success: true } })
      }
    }
  }

  const image = await selectAndUploadImage(groupId, (stage) => stages.push(stage))
  assert.equal(image.fileId, fileId)
  assert.equal(image.size, 210_000)
  assert.equal(visionCalls, 0)
  assert.deepEqual(stages, ['selecting', 'compressing', 'uploading', 'registering', 'checking'])

  const analyzed = await analyzeUploadedImage(groupId, image.fileId)
  assert.equal(analyzed.summary, evidence.summary)
  assert.equal(visionCalls, 1)
})

test('image failures point to the exact cloud dependency instead of a generic retry', () => {
  assert.equal(
    imageMessageError(new Error('groupPersistence_call_failed:cloud.callFunction:fail function not found')),
    'groupPersistence 云函数尚未部署'
  )
  assert.equal(
    imageMessageError(new Error('database collection wchat_group_assets does not exist')),
    '云数据库缺少图片资产集合，请重新部署 groupPersistence'
  )
  assert.equal(
    imageMessageError(new Error('imageVision_call_failed:cloud.callFunction:fail request error')),
    '图片处理服务异常，请查看 imageVision 云函数日志'
  )
})

test('an uploaded image receives an honest acknowledgement when vision is unavailable', () => {
  const replies = makeVisualUnavailableReplies(
    'companion',
    'image-pending-1',
    'image-user-1',
    100
  )
  assert.equal(replies.length, 1)
  assert.equal(replies[0].senderType, 'ai')
  assert.equal(replies[0].trigger, 'image')
  assert.equal(replies[0].replyToMessageId, 'image-user-1')
  assert.match(replies[0].text, /没看清/)
  assert.match(replies[0].text, /不乱猜/)
  assert.equal(replies[0].visualEvidence, null)
})

test('vision evidence is bounded, safety-gated and does not invite identity inference', () => {
  const sanitized = visionCloud.__test.sanitizeVisionOutput(
    {
      ...evidence,
      objects: Array.from({ length: 20 }, (_, index) => `物体${index}`),
      confidence: 9
    },
    { ownerOpenId: 'owner', fileId, model: evidence.model }
  )
  assert.ok(sanitized)
  assert.equal(sanitized?.objects.length, 10)
  assert.equal(sanitized?.confidence, 1)
  assert.equal(safeVisualEvidence({ ...evidence, safety: 'blocked' }), null)
  assert.equal(
    safeImageAttachment({ ...imageMessage().image, fileId: 'https://attacker.test/a.jpg' }),
    null
  )
  assert.match(visionCloud.__test.visionPrompt(), /不识别人名、账号身份/)
  assert.match(visionCloud.__test.visionPrompt(), /不推断图片拍摄地点、时间/)
})

test('image context reaches group chat as bounded evidence without leaking cloud file ids', () => {
  const runtime = createGroupRuntime(groupId, mockWorld)
  const round = runtime.handleVisualMessage(evidence, '看看这个', 100)
  const request = buildGroupChatRequest({
    groupId,
    modeState: round.state.modeState,
    text: '看看这个',
    history: [imageMessage()],
    world: mockWorld,
    topic: round.state.currentTopic,
    intent: round.intent,
    decision: round.decision,
    visualEvidence: evidence
  })
  const serialized = JSON.stringify(request)
  assert.equal(request.visualEvidenceRef, evidence.id)
  assert.equal(
    JSON.stringify({ visualEvidenceRef: request.visualEvidenceRef }).includes(evidence.summary),
    false
  )
  assert.equal(serialized.includes(fileId), false)
  const trusted = chatCloud.__test.sanitizeVisualEvidence(evidence)
  assert.ok(trusted)
  const modelEvidence = chatCloud.__test.visualEvidenceForModel(trusted)
  assert.equal('id' in (modelEvidence || {}), false)
  assert.equal(modelEvidence?.summary, evidence.summary)
})

test('all product modes understand images and story images do not advance canonical clues', () => {
  assert.ok(groupDefinitions.every((group) => group.capabilities.imageUnderstanding))
  const runtime = createGroupRuntime('mist-harbor-story', mockWorld)
  const before = runtime.getState()
  const result = runtime.handleVisualMessage(evidence, '这张图能当线索吗？', 100)
  assert.equal(before.modeState.kind, 'story')
  assert.equal(result.state.modeState.kind, 'story')
  if (before.modeState.kind !== 'story' || result.state.modeState.kind !== 'story') return
  assert.equal(result.state.modeState.turnCount, before.modeState.turnCount)
  assert.deepEqual(result.state.modeState.clues, before.modeState.clues)
  assert.ok(result.messages.slice(1).length >= 1)
  assert.ok(result.messages.slice(1).length <= 3)
})

test('image messages persist locally and a later update replaces the same message id', async () => {
  const storage = new Map<string, unknown>()
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync(key: string) {
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, structuredClone(value))
    }
  }
  const runtime = createGroupRuntime(groupId, mockWorld)
  await persistGroupMessages(groupId, [imageMessage('第一版说明')], runtime.getState())
  await persistGroupMessages(groupId, [imageMessage('更新后的说明')], runtime.getState())
  const restored = loadLocalGroupSession(groupId).messages
  assert.equal(restored.length, 1)
  assert.equal(restored[0].text, '更新后的说明')
  assert.equal(restored[0].image?.fileId, fileId)
  assert.equal(restored[0].visualEvidence?.summary, evidence.summary)

  const cloudMessage = persistenceCloud.__test.sanitizeMessage(imageMessage(), groupId)
  assert.equal(cloudMessage?.image?.fileId, fileId)
  assert.equal(cloudMessage?.visualEvidence?.summary, evidence.summary)
  assert.equal(
    persistenceCloud.__test.sanitizeAsset(
      { ...imageMessage().image, fileId: fileId.replace(groupId, 'mist-harbor-story') },
      groupId
    ),
    null
  )
})
