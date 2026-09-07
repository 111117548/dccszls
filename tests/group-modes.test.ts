import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  buildGroupChatRequest,
  buildModeAutonomousGroupRequest
} from '../miniprogram/services/group-chat-service.ts'
import { groupDefinitions } from '../miniprogram/data/groups.ts'
import { createGroupRuntime } from '../miniprogram/modes/registry.ts'
import { mockWorld } from '../miniprogram/mock/world.ts'

const require = createRequire(import.meta.url)
const groupChatCloud = require('../cloudfunctions/groupChat/index.js') as {
  __test: {
    buildSystemPrompt(contract?: Record<string, unknown>): string
    modePrompt(contract: { mode: string }): string
    sanitizeModeState(value: unknown, mode: string): unknown
    requiresAutonomousStory(contract: { mode: string }): boolean
  }
}

test('each registered group runs through its own mode state and returns a real group round', () => {
  const expectedKinds = new Map([
    ['evening-breeze-companion', 'companion'],
    ['clear-table-discussion', 'discussion'],
    ['crossworld-convention-salon', 'crossover_salon'],
    ['mist-harbor-story', 'story']
  ])
  for (const group of groupDefinitions) {
    const runtime = createGroupRuntime(group.id, mockWorld)
    const result = runtime.handleUserMessage('我们接下来应该怎么办？', 100)
    assert.equal(result.state.modeState.kind, expectedKinds.get(group.id))
    assert.equal(result.messages[0].senderType, 'user')
    assert.ok(result.messages.slice(1).length >= 1)
    assert.ok(result.messages.slice(1).length <= 3)
  }
})

test('discussion mode compares perspectives and converges after repeated turns', () => {
  const runtime = createGroupRuntime('clear-table-discussion', mockWorld)
  for (let index = 0; index < 4; index += 1) {
    runtime.handleUserMessage('我要不要换工作？', 100 + index)
  }
  const state = runtime.getState()
  assert.equal(state.modeState.kind, 'discussion')
  if (state.modeState.kind !== 'discussion') return
  assert.equal(state.modeState.phase, 'SYNTHESIZE')
  assert.deepEqual(state.modeState.perspectives, ['事实与假设', '关系与隐性代价', '低成本行动'])
})

test('crossover and story modes can create bounded autonomous character rounds', () => {
  for (const groupId of ['crossworld-convention-salon', 'mist-harbor-story']) {
    const runtime = createGroupRuntime(groupId, mockWorld)
    const round = runtime.createAutonomousRound(1_000)
    assert.ok(round)
    assert.equal(round?.messages.length, 3)
    assert.ok(round?.messages.every((message) => message.trigger === 'autonomous'))
    assert.equal(round?.decision.beats[0].replyTarget, 'group')
    if (
      round?.state.modeState.kind === 'crossover_salon' ||
      round?.state.modeState.kind === 'story'
    ) {
      assert.equal(round.state.modeState.lastAutonomousAt, 1_000)
    }
  }
  assert.equal(createGroupRuntime('clear-table-discussion', mockWorld).createAutonomousRound(1_000), null)
})

test('fictional mode autonomous rounds can use the model without inventing a companion story', () => {
  const runtime = createGroupRuntime('mist-harbor-story', mockWorld)
  const round = runtime.createAutonomousRound(1_000)
  assert.ok(round)
  if (!round) return
  const request = buildModeAutonomousGroupRequest({
    groupId: 'mist-harbor-story',
    modeState: round.state.modeState,
    history: [],
    world: mockWorld,
    decision: round.decision,
    topicId: 'story-auto-1',
    topicTitle: round.topicTitle
  })
  assert.equal(request.mode, 'autonomous')
  assert.deepEqual(request.stories, [])
  assert.deepEqual(request.world, { live: false })
  assert.equal(
    ((request.roundPlan as { beats: Array<{ replyTarget: string }> }).beats[0]).replyTarget,
    'group'
  )
  assert.equal(groupChatCloud.__test.requiresAutonomousStory({ mode: 'companion' }), true)
  assert.equal(groupChatCloud.__test.requiresAutonomousStory({ mode: 'story' }), false)
  assert.equal(groupChatCloud.__test.requiresAutonomousStory({ mode: 'crossover_salon' }), false)
})

test('story mode advances registered clues without deciding the user action', () => {
  const runtime = createGroupRuntime('mist-harbor-story', mockWorld)
  const first = runtime.handleUserMessage('我先检查信封', 100)
  assert.equal(first.state.modeState.kind, 'story')
  if (first.state.modeState.kind !== 'story') return
  assert.ok(first.state.modeState.clues.includes('信纸上的海鸟水印'))
  assert.match(first.messages[3].text, /你选|路线/)
})

test('model requests carry group mode state and hide real world context from fictional groups', () => {
  const runtime = createGroupRuntime('mist-harbor-story', mockWorld)
  const result = runtime.handleUserMessage('我先看看信封', 100)
  const request = buildGroupChatRequest({
    groupId: 'mist-harbor-story',
    modeState: result.state.modeState,
    text: '我先看看信封',
    history: [],
    world: {
      ...structuredClone(mockWorld),
      location: { ...structuredClone(mockWorld.location), isSimulated: false },
      weather: { ...structuredClone(mockWorld.weather), isSimulated: false }
    },
    topic: result.state.currentTopic,
    intent: result.intent,
    decision: result.decision
  })
  assert.equal(request.groupId, 'mist-harbor-story')
  assert.deepEqual(request.world, { live: false })
  assert.equal((request.modeState as { kind: string }).kind, 'story')
  assert.deepEqual(request.stories, [])
})

test('cloud prompts have explicit and different contracts for each product mode', () => {
  assert.match(groupChatCloud.__test.modePrompt({ mode: 'discussion' }), /事实、假设、分歧和行动/)
  assert.match(groupChatCloud.__test.modePrompt({ mode: 'crossover_salon' }), /互不统一的原创世界/)
  assert.match(groupChatCloud.__test.modePrompt({ mode: 'story' }), /不替用户决定行动/)
  assert.equal(
    (groupChatCloud.__test.sanitizeModeState({ chapter: 3, clues: ['信'] }, 'story') as { chapter: number }).chapter,
    3
  )
})
