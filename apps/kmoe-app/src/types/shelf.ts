import type { ReadingProgress } from './reading'

export type ShelfCacheStatus = 'none' | 'metadata' | 'reading_cache' | 'downloaded'
export type ShelfSortKey = 'recent_read' | 'recent_update' | 'added_at' | 'title' | 'reading_progress' | 'unread_count'
export type ShelfSortDirection = 'asc' | 'desc'

export interface ShelfCategory {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ShelfItem {
  id: string
  comicId: string
  comicTitle: string
  comicUrl?: string
  coverUrl?: string
  author?: string
  status?: string
  latestVolume?: string
  latestVolumeId?: string
  latestUpdatedAt?: string
  unreadCount: number
  categoryIds: string[]
  archived: boolean
  cached: boolean
  cacheStatus: ShelfCacheStatus
  addedAt: string
  updatedAt: string
  lastReadAt?: string
  readingProgress?: ReadingProgress
}

export interface ShelfItemInput {
  comicId: string
  comicTitle: string
  comicUrl?: string
  coverUrl?: string
  author?: string
  status?: string
  latestVolume?: string
  latestVolumeId?: string
  latestUpdatedAt?: string
  unreadCount?: number
  categoryIds?: string[]
  archived?: boolean
  cached?: boolean
  cacheStatus?: ShelfCacheStatus
  readingProgress?: ReadingProgress
}

export interface ShelfFilters {
  hasUpdates?: boolean
  unreadOnly?: boolean
  unfinished?: boolean
  completed?: boolean
  seriesCompleted?: boolean
  cached?: boolean
  downloaded?: boolean
  archived?: boolean
}

export interface ShelfQuery {
  keyword?: string
  categoryId?: string
  sortBy?: ShelfSortKey
  sortDirection?: ShelfSortDirection
  filters?: ShelfFilters
  includeArchived?: boolean
}

export interface ShelfSections {
  continueReading: ShelfItem[]
  updated: ShelfItem[]
  all: ShelfItem[]
}

export type ShelfBatchAction =
  | { type: 'remove' }
  | { type: 'archive'; archived: boolean }
  | { type: 'mark_read' }
  | { type: 'mark_unread'; unreadCount?: number }
  | { type: 'set_cached'; cached: boolean; cacheStatus?: ShelfCacheStatus }
  | { type: 'move_categories'; categoryIds: string[]; mode: 'replace' | 'add' | 'remove' }
