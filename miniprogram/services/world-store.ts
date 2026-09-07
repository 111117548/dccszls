import type { WorldSnapshot } from '../core/types'
import { mockWorld } from '../mock/world'

const WORLD_STORAGE_KEY = 'wchat.worldSnapshot.v1'

function storedWorld(): WorldSnapshot | null {
  try {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') return null
    const value = wx.getStorageSync(WORLD_STORAGE_KEY)
    if (!value || typeof value !== 'object') return null
    const snapshot = value as Partial<WorldSnapshot>
    if (
      typeof snapshot.id !== 'string' ||
      typeof snapshot.capturedAt !== 'number' ||
      !snapshot.location ||
      !snapshot.weather
    ) {
      return null
    }
    return snapshot as WorldSnapshot
  } catch {
    return null
  }
}

let currentWorld: WorldSnapshot = storedWorld() ?? mockWorld

export function getWorldSnapshot(): WorldSnapshot {
  return currentWorld
}

export function setWorldSnapshot(snapshot: WorldSnapshot): void {
  currentWorld = snapshot
  try {
    wx.setStorageSync(WORLD_STORAGE_KEY, snapshot)
  } catch {
    // World persistence is local-only and must never block foreground sync.
  }
}

export function isLiveWorld(): boolean {
  return !currentWorld.location.isSimulated && !currentWorld.weather.isSimulated
}
