import type { GroupModeAdapter } from '../core/group-contract'
import { GroupRuntime } from '../core/group-runtime'
import type { GroupState, WorldSnapshot } from '../core/types'
import { getGroupDefinition } from '../data/groups'
import { companionModeAdapter } from './companion-mode'
import { crossoverSalonModeAdapter } from './crossover-salon-mode'
import { discussionModeAdapter } from './discussion-mode'
import { storyModeAdapter } from './story-mode'

const adapters: Partial<Record<string, GroupModeAdapter>> = {
  companion: companionModeAdapter,
  discussion: discussionModeAdapter,
  crossover_salon: crossoverSalonModeAdapter,
  story: storyModeAdapter
}

export function getModeAdapter(mode: string): GroupModeAdapter {
  const adapter = adapters[mode]
  if (!adapter) throw new Error(`Group mode "${mode}" is not implemented`)
  return adapter
}

export function createGroupRuntime(
  groupId: string | undefined,
  world: WorldSnapshot,
  initialState?: GroupState
): GroupRuntime {
  const definition = getGroupDefinition(groupId)
  return new GroupRuntime(definition, getModeAdapter(definition.mode), world, initialState)
}
