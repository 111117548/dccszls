declare function App(options: Record<string, unknown>): void
declare function Page(options: Record<string, unknown>): void

declare const wx: {
  cloud?: {
    init(options: { env?: string; traceUser?: boolean }): void
    callFunction(options: {
      name: string
      data?: Record<string, unknown>
      success(result: { result?: unknown }): void
      fail(error: { errMsg?: string }): void
    }): void
    uploadFile(options: {
      cloudPath: string
      filePath: string
      success(result: { fileID?: string }): void
      fail(error: { errMsg?: string }): void
    }): { abort?(): void }
  }
  getLocation(options: {
    type: 'gcj02' | 'wgs84'
    isHighAccuracy?: boolean
    highAccuracyExpireTime?: number
    success(result: {
      latitude: number
      longitude: number
      accuracy?: number
      horizontalAccuracy?: number
    }): void
    fail(error: { errMsg?: string }): void
  }): void
  chooseMedia(options: {
    count: number
    mediaType: Array<'image' | 'video'>
    sourceType: Array<'album' | 'camera'>
    sizeType: Array<'original' | 'compressed'>
    success(result: {
      tempFiles: Array<{
        tempFilePath: string
        size?: number
        width?: number
        height?: number
      }>
    }): void
    fail(error: { errMsg?: string }): void
  }): void
  compressImage(options: {
    src: string
    quality: number
    compressedWidth?: number
    success(result: { tempFilePath: string }): void
    fail(error: { errMsg?: string }): void
  }): void
  getFileInfo(options: {
    filePath: string
    success(result: { size: number }): void
    fail(error: { errMsg?: string }): void
  }): void
  previewImage(options: { current?: string; urls: string[] }): void
  openSetting(options?: {
    success?(result: { authSetting: Record<string, boolean> }): void
    fail?(error: { errMsg?: string }): void
  }): void
  navigateTo(options: { url: string }): void
  setNavigationBarTitle?(options: { title: string }): void
  showToast(options: { title: string; icon: 'none' | 'success' | 'error' | 'loading' }): void
  showModal(options: {
    title: string
    content: string
    confirmText?: string
    confirmColor?: string
    success(result: { confirm: boolean; cancel: boolean }): void
  }): void
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
}
