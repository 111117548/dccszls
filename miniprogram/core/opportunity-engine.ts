import type { Opportunity } from './types'
import type { WorldChange } from './world-change'

export function opportunitiesFromChanges(changes: WorldChange[], now = Date.now()): Opportunity[] {
  return changes.map((change) => {
    const cityChange = change.kind === 'city_changed'
    return {
      id: `opportunity-${change.id}`,
      type: cityChange ? 'location' : 'weather',
      source: cityChange ? 'location' : 'weather',
      title: change.title,
      description: change.description,
      importance: change.importance === 'high' ? 95 : 76,
      confidence: change.confidence,
      expiresAt: now + (cityChange ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000),
      evidenceIds: [...change.evidenceIds]
    }
  })
}
