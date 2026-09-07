import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DEFAULT_GROUP_ID, getGroupDefinition, groupDefinitions, validateGroupDefinitions } from '../miniprogram/data/groups.ts'
import { createGroupRuntime, getModeAdapter } from '../miniprogram/modes/registry.ts'
import { mockWorld } from '../miniprogram/mock/world.ts'

test('the shared group registry has a valid companion group and unique definitions', () => {
  assert.deepEqual(validateGroupDefinitions(), [])
  assert.ok(groupDefinitions.length >= 1)
  assert.equal(new Set(groupDefinitions.map((group) => group.id)).size, groupDefinitions.length)
  assert.equal(getGroupDefinition(DEFAULT_GROUP_ID).mode, 'companion')
})

test('group runtime delegates the existing conversation to the selected mode adapter', () => {
  const runtime = createGroupRuntime(DEFAULT_GROUP_ID, mockWorld)
  const result = runtime.handleUserMessage('你们怎么看这个计划？', 100)
  assert.equal(runtime.getDefinition().id, DEFAULT_GROUP_ID)
  assert.equal(result.messages[0].senderType, 'user')
  assert.ok(result.messages.slice(1).length >= 1)
  assert.ok(result.messages.slice(1).length <= 3)
  assert.equal(result.state.currentTopic?.lockedByUser, true)
})

test('all four product modes are registered and unknown modes fail explicitly', () => {
  for (const mode of ['companion', 'discussion', 'crossover_salon', 'story']) {
    assert.equal(getModeAdapter(mode).mode, mode)
  }
  assert.throws(() => getModeAdapter('unknown'), /not implemented/)
})

test('group list and chat route are driven by groupId instead of a fixed page', () => {
  const groupPage = readFileSync('miniprogram/pages/groups/index.ts', 'utf8')
  const groupTemplate = readFileSync('miniprogram/pages/groups/index.wxml', 'utf8')
  const chatPage = readFileSync('miniprogram/pages/chat/index.ts', 'utf8')
  assert.match(groupPage, /groupDefinitions/)
  assert.match(groupPage, /groupId=/)
  assert.match(groupTemplate, /data-group-id/)
  assert.match(chatPage, /getGroupDefinition\(query\?\.groupId\)/)
})

test('group list opens the selected registered group', async () => {
  let pageOptions: Record<string, unknown> | null = null
  let navigatedTo = ''
  ;(globalThis as unknown as { Page: (options: Record<string, unknown>) => void }).Page = (options) => {
    pageOptions = options
  }
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    navigateTo(options: { url: string }) {
      navigatedTo = options.url
    }
  }
  await import('../miniprogram/pages/groups/index.ts')
  assert.ok(pageOptions)
  const options = pageOptions as {
    data: { groups: Array<{ id: string }> }
    openChat(event: { currentTarget: { dataset: { groupId: string } } }): void
  }
  assert.equal(options.data.groups[0].id, DEFAULT_GROUP_ID)
  options.openChat({ currentTarget: { dataset: { groupId: DEFAULT_GROUP_ID } } })
  assert.equal(navigatedTo, `../chat/index?groupId=${DEFAULT_GROUP_ID}`)
})
