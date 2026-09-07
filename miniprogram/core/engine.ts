import { GroupRuntime } from './group-runtime'
import type { ChatMessage, GroupState, WorldSnapshot } from './types'
import { DEFAULT_GROUP_ID } from '../data/groups'
import { getModeAdapter } from '../modes/registry'
import { getGroupDefinition } from '../data/groups'

export class PrototypeConversationEngine extends GroupRuntime {
  constructor(world: WorldSnapshot, initialState?: GroupState) {
    const definition = getGroupDefinition(DEFAULT_GROUP_ID)
    super(definition, getModeAdapter(definition.mode), world, initialState)
  }
}

export function countConsecutiveAi(messages: ChatMessage[]): number {
  let count = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].senderType !== 'ai') break
    count += 1
  }
  return count
}
