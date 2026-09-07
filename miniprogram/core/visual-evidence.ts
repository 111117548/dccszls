import type { ImageAttachment, VisualCategory, VisualEvidence } from './types'

const categories = new Set<VisualCategory>([
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
const mimeTypes = new Set<ImageAttachment['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/webp'
])

function compact(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map((item) => compact(item, maxLength))
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
    .slice(0, maxItems)
}

export function safeImageAttachment(value: unknown): ImageAttachment | null {
  if (!value || typeof value !== 'object') return null
  const image = value as Partial<ImageAttachment>
  const fileId = compact(image.fileId, 500)
  if (
    !fileId.startsWith('cloud://') ||
    !mimeTypes.has(image.mimeType as ImageAttachment['mimeType']) ||
    image.status !== 'ready'
  ) {
    return null
  }
  return {
    fileId,
    width: Math.max(0, Math.min(12000, Math.floor(Number(image.width) || 0))),
    height: Math.max(0, Math.min(12000, Math.floor(Number(image.height) || 0))),
    size: Math.max(0, Math.min(5 * 1024 * 1024, Math.floor(Number(image.size) || 0))),
    mimeType: image.mimeType as ImageAttachment['mimeType'],
    status: 'ready'
  }
}

export function safeVisualEvidence(value: unknown): VisualEvidence | null {
  if (!value || typeof value !== 'object') return null
  const evidence = value as Partial<VisualEvidence>
  const id = compact(evidence.id, 120)
  const summary = compact(evidence.summary, 300)
  const category = categories.has(evidence.category as VisualCategory)
    ? (evidence.category as VisualCategory)
    : 'other'
  if (!id || !summary || evidence.safety !== 'passed') return null
  return {
    id,
    provider: compact(evidence.provider, 80) || '视觉模型',
    model: compact(evidence.model, 100) || 'unknown',
    analyzedAt: Math.max(0, Number(evidence.analyzedAt) || 0),
    category,
    summary,
    objects: stringList(evidence.objects, 10, 80),
    visibleText: stringList(evidence.visibleText, 8, 120),
    notableDetails: stringList(evidence.notableDetails, 8, 120),
    uncertainties: stringList(evidence.uncertainties, 6, 120),
    confidence: Math.max(0, Math.min(1, Number(evidence.confidence) || 0)),
    safety: 'passed'
  }
}

export function visualTopicText(evidence: VisualEvidence, caption = ''): string {
  const userCaption = compact(caption, 200)
  return userCaption
    ? `${userCaption}（图片中可确认：${evidence.summary}）`
    : `我分享了一张图片。图片中可确认：${evidence.summary}`
}
