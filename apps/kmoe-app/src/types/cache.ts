export type CacheKind = 'permanent_download' | 'reading_cache' | 'metadata_cache'
export type ReaderArchiveFormat = 'source_zip' | 'epub'
export type CachePolicyMode = 'space_saver' | 'balanced' | 'comfort'
export type ChapterCacheStatus = 'missing' | 'preparing' | 'ready' | 'failed' | 'evicting'

export interface CachePolicy {
  id: string
  mode: CachePolicyMode
  keepPreviousChapters: number
  keepNextChapters: number
  maxRecentChapters: number
  wifiPrefetch: boolean
  lowPowerReducePrefetch: boolean
  maxCacheBytes?: number
  updatedAt: string
}

export interface ChapterCacheRecord {
  id: string
  comicId: string
  comicTitle: string
  volumeId: string
  volumeTitle: string
  format: ReaderArchiveFormat
  cacheKind: CacheKind
  sourceTaskId?: string
  cacheDir?: string
  sizeBytes: number
  pageCount?: number
  status: ChapterCacheStatus
  policy?: CachePolicyMode
  lastAccessedAt: string
  createdAt: string
  updatedAt: string
  expiresAt?: string
  errorMessage?: string
}

export interface PageCacheRecord {
  id: string
  chapterCacheId: string
  comicId: string
  volumeId: string
  pageIndex: number
  filePath?: string
  width?: number
  height?: number
  sizeBytes?: number
  createdAt: string
  lastAccessedAt: string
}

export interface CacheStats {
  totalBytes: number
  permanentDownloadBytes: number
  readingCacheBytes: number
  metadataCacheBytes: number
  chapterCount: number
  pageCount: number
}

export interface CacheCleanupCandidate {
  chapter: ChapterCacheRecord
  reason: 'policy' | 'storage_pressure' | 'manual'
}
