export type AppMode = 'live'
export type DownloadFormat = 'mobi' | 'epub' | 'source_zip'
export type DownloadScope = 'single_volume' | 'single_chapter_group' | 'whole_comic' | 'batch' | 'unknown'
export type ReaderPageTurnAnimation = 'slide' | 'curl' | 'fade'

export interface LoginInput {
  email: string
  password: string
  remember?: boolean
}

export interface LoginResult {
  ok: boolean
  message?: string
  user?: UserProfile
}

export interface SessionState {
  authenticated: boolean
  mode: AppMode
  user?: UserProfile
  error?: string
}

export interface UserProfile {
  id?: string
  nickname?: string
  level?: string
  isVip?: boolean
  vipStatus?: string
  quotaNow?: number
  quotaUsed?: number
  freeQuota?: number
  vipQuota?: number
  warnings: string[]
}

export interface CatalogQuery {
  keyword?: string
  category?: string
  status?: string
  language?: string
  region?: string
  length?: string
  color?: boolean
  hd?: boolean
  sort?: string
  page: number
}

export interface CatalogPage {
  items: ComicListItem[]
  page: number
  totalPages?: number
  totalItems?: number
  source: 'data_list' | 'html'
}

export interface ComicListItem {
  id: string
  title: string
  url: string
  coverUrl?: string
  author?: string
  status?: string
  language?: string
  region?: string
  score?: string
  latestVolume?: string
  lastUpdate?: string
  tags: string[]
}

export interface ComicDetail {
  id: string
  url: string
  title: string
  aliases: string[]
  coverUrl?: string
  authors: string[]
  status?: string
  region?: string
  language?: string
  categories: string[]
  tags: string[]
  rating?: string
  heat?: string
  description?: string
  quotaHint?: string
  isRestricted?: boolean
  downloadOptions: VolumeDownloadOption[]
  relatedComics?: ComicListItem[]
}

export interface VolumeDownloadOption {
  id: string
  comicId: string
  volId: string
  title: string
  displayTitle: string
  kind: 'volume' | 'chapter_group' | 'unknown'
  pageCount?: number
  docPageCount?: number
  sizes: {
    mobi?: number
    epub?: number
    sourceZip?: number
  }
  availableFormats: DownloadFormat[]
  restrictions: string[]
}

export type DownloadTaskStatus =
  | 'queued'
  | 'authorizing'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface DownloadTask {
  id: string
  comicId: string
  comicTitle: string
  volId: string
  volumeTitle: string
  format: DownloadFormat
  status: DownloadTaskStatus
  progress: number
  downloadedBytes: number
  totalBytes?: number
  retryCount: number
  errorMessage?: string
  localPath?: string
  createdAt: string
  updatedAt: string
}

export interface DownloadedFile {
  id: string
  taskId?: string
  comicId: string
  comicTitle: string
  volId: string
  volumeTitle: string
  format: DownloadFormat
  localPath: string
  sizeBytes?: number
  downloadedAt: string
}

export interface AppSettings {
  concurrency: number
  preferredFormat: DownloadFormat
  downloadDirectory: string
  colorizeDetailPage: boolean
  readerPageTurnAnimation: ReaderPageTurnAnimation
}

export interface DownloadAuthorizeInput {
  bookId: string
  volId: string
  format: DownloadFormat
  line: number
}
