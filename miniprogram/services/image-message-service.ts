import type { ImageAttachment, VisualEvidence } from '../core/types'
import { safeVisualEvidence } from '../core/visual-evidence'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 25_000
const PERSISTENCE_TIMEOUT_MS = 15_000
const SAFETY_TIMEOUT_MS = 25_000
const VISION_TIMEOUT_MS = 45_000

export type ImageMessageStage =
  | 'selecting'
  | 'compressing'
  | 'uploading'
  | 'registering'
  | 'checking'
  | 'analyzing'

type StageListener = (stage: ImageMessageStage) => void

interface SelectedImage {
  path: string
  width: number
  height: number
  size: number
  mimeType: ImageAttachment['mimeType']
}

interface ImageCloudResult {
  success?: boolean
  error?: string
  evidence?: unknown
}

function extensionAndMime(path: string): {
  extension: 'jpg' | 'png' | 'webp'
  mimeType: ImageAttachment['mimeType']
} {
  const normalized = path.toLowerCase().split('?')[0]
  if (normalized.endsWith('.png')) return { extension: 'png', mimeType: 'image/png' }
  if (normalized.endsWith('.webp')) return { extension: 'webp', mimeType: 'image/webp' }
  return { extension: 'jpg', mimeType: 'image/jpeg' }
}

function chooseImage(): Promise<SelectedImage> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(result) {
        const file = result.tempFiles?.[0]
        if (!file?.tempFilePath) {
          reject(new Error('image_selection_empty'))
          return
        }
        const format = extensionAndMime(file.tempFilePath)
        resolve({
          path: file.tempFilePath,
          width: Math.max(0, Number(file.width) || 0),
          height: Math.max(0, Number(file.height) || 0),
          size: Math.max(0, Number(file.size) || 0),
          mimeType: format.mimeType
        })
      },
      fail(error) {
        reject(new Error(/cancel/i.test(error.errMsg || '') ? 'image_selection_cancelled' : error.errMsg || 'image_selection_failed'))
      }
    })
  })
}

function compressImage(image: SelectedImage): Promise<SelectedImage> {
  return new Promise((resolve) => {
    wx.compressImage({
      src: image.path,
      quality: 72,
      compressedWidth: 1600,
      success(result) {
        resolve({ ...image, path: result.tempFilePath })
      },
      fail() {
        resolve(image)
      }
    })
  })
}

function measureImage(image: SelectedImage): Promise<SelectedImage> {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath: image.path,
      success(result) {
        resolve({
          ...image,
          size: Math.max(0, Number(result.size) || image.size)
        })
      },
      fail() {
        resolve(image)
      }
    })
  })
}

function uploadImage(groupId: string, image: SelectedImage): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('cloud_not_available'))
      return
    }
    const format = extensionAndMime(image.path)
    const random = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    let settled = false
    let task: { abort?(): void } | undefined
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      task?.abort?.()
      reject(new Error('image_upload_timeout'))
    }, UPLOAD_TIMEOUT_MS)
    task = wx.cloud.uploadFile({
      cloudPath: `user-images/${groupId}/${random}.${format.extension}`,
      filePath: image.path,
      success(result) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (!result.fileID) {
          reject(new Error('image_upload_empty'))
          return
        }
        resolve(result.fileID)
      },
      fail(error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(error.errMsg || 'image_upload_failed'))
      }
    })
  })
}

function callCloud(
  name: string,
  data: Record<string, unknown>,
  timeoutMs = PERSISTENCE_TIMEOUT_MS
): Promise<ImageCloudResult> {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('cloud_not_available'))
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`${name}_timeout`))
    }, timeoutMs)
    wx.cloud.callFunction({
      name,
      data,
      success(result) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const payload = result.result as ImageCloudResult | undefined
        if (!payload?.success) {
          reject(new Error(payload?.error || `${name}_failed`))
          return
        }
        resolve(payload)
      },
      fail(error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`${name}_call_failed:${error.errMsg || 'unknown'}`))
      }
    })
  })
}

async function deleteUploadedImage(groupId: string, fileId: string): Promise<void> {
  try {
    await callCloud('groupPersistence', { action: 'deleteImage', groupId, fileId })
  } catch {
    // The asset collection provides a cleanup audit even if immediate deletion fails.
  }
}

export async function discardPreparedImage(groupId: string, fileId: string): Promise<void> {
  await deleteUploadedImage(groupId, fileId)
}

export interface PreparedImageMessage {
  image: ImageAttachment
  evidence: VisualEvidence
}

export async function selectAndUploadImage(
  groupId: string,
  onStage: StageListener = () => undefined
): Promise<ImageAttachment> {
  onStage('selecting')
  let selected = await chooseImage()
  onStage('compressing')
  selected = await compressImage(selected)
  selected = await measureImage(selected)
  if (selected.size > MAX_IMAGE_BYTES) throw new Error('image_too_large')
  onStage('uploading')
  const fileId = await uploadImage(groupId, selected)
  try {
    onStage('registering')
    await callCloud('groupPersistence', {
      action: 'registerImage',
      groupId,
      image: {
        fileId,
        width: selected.width,
        height: selected.height,
        size: selected.size,
        mimeType: selected.mimeType,
        createdAt: Date.now()
      }
    })
    onStage('checking')
    await callCloud(
      'imageVision',
      { action: 'check', groupId, fileId },
      SAFETY_TIMEOUT_MS
    )
    return {
      fileId,
      width: selected.width,
      height: selected.height,
      size: selected.size,
      mimeType: selected.mimeType,
      status: 'ready'
    }
  } catch (error) {
    await deleteUploadedImage(groupId, fileId)
    throw error
  }
}

export async function analyzeUploadedImage(
  groupId: string,
  fileId: string
): Promise<VisualEvidence> {
  const result = await callCloud(
    'imageVision',
    { action: 'analyze', groupId, fileId },
    VISION_TIMEOUT_MS
  )
  const evidence = safeVisualEvidence(result.evidence)
  if (!evidence) throw new Error('image_vision_output_invalid')
  return evidence
}

export async function selectUploadAndAnalyzeImage(
  groupId: string,
  onStage: StageListener = () => undefined
): Promise<PreparedImageMessage> {
  const image = await selectAndUploadImage(groupId, onStage)
  onStage('analyzing')
  try {
    const evidence = await analyzeUploadedImage(groupId, image.fileId)
    return { image, evidence }
  } catch (error) {
    await discardPreparedImage(groupId, image.fileId)
    throw error
  }
}

export function imageMessageError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error || '')
  if (code === 'image_selection_cancelled') return ''
  if (code === 'image_too_large') return '图片过大，请选择 5MB 以内的图片'
  if (code === 'image_upload_timeout') return '图片上传超时，请检查网络后重试'
  if (code === 'groupPersistence_timeout') return '图片登记超时，请检查并重新部署 groupPersistence'
  if (code === 'image_safety_not_verified') return '图片尚未通过安全检查，请重新上传'
  if (code === 'imageVision_timeout') return '图片识别超时，请检查 imageVision 日志或稍后重试'
  if (code === 'image_content_unsafe') return '图片未通过内容安全检查，未发送'
  if (code === 'image_security_check_failed') return '图片安全检查暂时不可用，请稍后再试'
  if (code === 'image_vision_not_configured') return '视觉模型尚未配置，请先部署 imageVision 并设置 TokenHub 密钥'
  if (code === 'unknown_action') return '图片服务版本过旧，请重新部署 groupPersistence'
  if (code === 'visual_evidence_not_found') return '图片识别记录不存在，请重新上传图片'
  if (/groupPersistence_call_failed.*(?:function.*not.*found|找不到.*函数|-501000)/i.test(code)) {
    return 'groupPersistence 云函数尚未部署'
  }
  if (/imageVision_call_failed.*(?:function.*not.*found|找不到.*函数|-501000)/i.test(code)) {
    return 'imageVision 云函数尚未部署'
  }
  if (/(?:-502005|collection.*(?:not exist|does not exist|不存在))/i.test(code)) {
    return '云数据库缺少图片资产集合，请重新部署 groupPersistence'
  }
  if (/image_asset_not_owned/i.test(code)) return '图片资产登记校验失败，请重新部署图片云函数'
  if (/groupPersistence|group_persistence/i.test(code)) return '图片登记服务异常，请查看 groupPersistence 云函数日志'
  if (/imageVision|image_vision/i.test(code)) return '图片处理服务异常，请查看 imageVision 云函数日志'
  if (/upload/i.test(code)) return '图片上传失败，请检查云存储后重试'
  return '图片暂时无法识别，请稍后再试'
}
