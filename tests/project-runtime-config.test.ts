import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('mini program TypeScript runtime is enabled and not shadowed by blank JavaScript pages', () => {
  const config = JSON.parse(readFileSync('project.config.json', 'utf8'))
  assert.ok(config.setting.useCompilerPlugins.includes('typescript'))
  assert.equal(config.appid, 'wx7f03b7ba6e92dc3d')

  for (const page of ['groups', 'chat', 'memory', 'world']) {
    assert.equal(existsSync(`miniprogram/pages/${page}/index.js`), false)
    assert.equal(existsSync(`miniprogram/pages/${page}/index.ts`), true)
  }
  assert.equal(existsSync('cloudfunctions/localIntelSnapshot/index.js'), true)
  assert.equal(existsSync('cloudfunctions/localIntelSnapshot/package.json'), true)
  assert.equal(existsSync('cloudfunctions/groupPersistence/index.js'), true)
  assert.equal(existsSync('cloudfunctions/groupPersistence/package.json'), true)
  assert.equal(existsSync('cloudfunctions/groupChat/index.js'), true)
  assert.equal(existsSync('cloudfunctions/groupChat/package.json'), true)
  assert.equal(existsSync('cloudfunctions/imageVision/index.js'), true)
  assert.equal(existsSync('cloudfunctions/imageVision/package.json'), true)
  assert.equal(existsSync('cloudfunctions/imageVision/config.json'), true)
  const imageVisionConfig = JSON.parse(
    readFileSync('cloudfunctions/imageVision/config.json', 'utf8')
  )
  assert.ok(
    imageVisionConfig.permissions.openapi.includes('security.imgSecCheck')
  )

  const cloudbase = JSON.parse(readFileSync('cloudbaserc.json', 'utf8'))
  assert.deepEqual(
    cloudbase.functions.map((item: { name: string }) => item.name).sort(),
    ['groupChat', 'groupPersistence', 'imageVision', 'localIntelSnapshot', 'weatherSnapshot']
  )
})

test('chat page module loads with the interruptible rhythm methods registered', async () => {
  let pageOptions: Record<string, unknown> | null = null
  ;(globalThis as unknown as { Page: (options: Record<string, unknown>) => void }).Page = (options) => {
    pageOptions = options
  }
  ;(globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    getStorageSync() {
      return undefined
    },
    setStorageSync() {},
    navigateTo() {},
    showToast() {}
  }
  await import('../miniprogram/pages/chat/index.ts')
  assert.ok(pageOptions)
  assert.equal(typeof pageOptions.sendMessage, 'function')
  assert.equal(typeof pageOptions.cancelPendingRound, 'function')
  assert.equal(typeof pageOptions.playQueue, 'function')
  assert.equal(typeof pageOptions.startAutonomousRound, 'function')
  assert.equal(typeof pageOptions.scheduleTopicContinuation, 'function')
  assert.equal(typeof pageOptions.startTopicContinuation, 'function')
  assert.equal(typeof pageOptions.submitMessage, 'function')
  assert.equal(typeof pageOptions.chooseAndSendImage, 'function')
  assert.equal(typeof pageOptions.previewMessageImage, 'function')
  const wxml = readFileSync('miniprogram/pages/chat/index.wxml', 'utf8')
  assert.equal(/bind(?:tap|confirm)="sendMessage"/.test(wxml), false)
  assert.match(wxml, /bindtap="submitMessage"/)
  assert.match(wxml, /bindtap="chooseAndSendImage"/)
  assert.match(wxml, /bindtap="previewMessageImage"/)
  assert.equal(wxml.includes('class="image-button"'), false)
  assert.ok(wxml.indexOf('class="composer-input"') < wxml.indexOf('class="attachment-button"'))
  const wxss = readFileSync('miniprogram/pages/chat/index.wxss', 'utf8')
  assert.match(wxss, /\.attachment-button\s*\{[^}]*margin:\s*0;/s)
  assert.match(wxss, /\.composer-input-shell\s*\{[^}]*min-width:\s*0;/s)
  const chatSource = readFileSync('miniprogram/pages/chat/index.ts', 'utf8')
  assert.match(chatSource, /let activeImageToken = 0/)
  assert.match(chatSource, /onUnload\(\)\s*\{[\s\S]*?activeImageToken \+= 1/)
})
