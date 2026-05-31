export type ReadingMode = 'paged' | 'vertical_scroll' | 'horizontal_scroll' | 'webtoon'
export type ReadingDirection = 'rtl' | 'ltr'
export type PageLayout = 'single' | 'double' | 'auto_double'
export type CropMode = 'none' | 'auto' | 'manual'
export type ReadingHistoryEvent = 'open' | 'page_change' | 'finish' | 'mark_read' | 'mark_unread' | 'restart'
export type ManualSpreadOverride = 'force_single' | 'force_double'

export interface ReadingCropState {
  mode: CropMode
  inset?: number
}

export interface ReadingProgress {
  id: string
  comicId: string
  comicTitle: string
  volumeId: string
  volumeTitle: string
  pageIndex: number
  pageCount?: number
  progressPercent: number
  lastReadAt: string
  finished: boolean
  readingMode: ReadingMode
  readingDirection: ReadingDirection
  pageLayout: PageLayout
  zoom?: number
  crop?: ReadingCropState
  rotation?: 0 | 90 | 180 | 270
  spreadOverrides?: Record<number, ManualSpreadOverride>
}

export interface ReaderPreferences {
  readingMode: ReadingMode
  readingDirection: ReadingDirection
  pageLayout: PageLayout
  zoom?: number
  crop?: ReadingCropState
  rotation?: 0 | 90 | 180 | 270
}

export interface ReadingProgressInput {
  comicId: string
  comicTitle: string
  volumeId: string
  volumeTitle: string
  pageIndex?: number
  pageCount?: number
  progressPercent?: number
  finished?: boolean
  readingMode?: ReadingMode
  readingDirection?: ReadingDirection
  pageLayout?: PageLayout
  zoom?: number
  crop?: ReadingCropState
  rotation?: 0 | 90 | 180 | 270
  spreadOverrides?: Record<number, ManualSpreadOverride>
  readAt?: string
}

export interface ReadingHistoryEntry {
  id: string
  comicId: string
  comicTitle: string
  volumeId: string
  volumeTitle: string
  pageIndex: number
  progressPercent: number
  event: ReadingHistoryEvent
  readAt: string
  durationSeconds?: number
}

export interface ContinueReadingItem {
  progress: ReadingProgress
  label: string
}
