import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nowIso } from '../lib/format'
import type { ShelfBatchAction, ShelfCategory, ShelfItem, ShelfItemInput, ShelfQuery, ShelfSections } from '../types/shelf'

interface ShelfState {
  itemsByComicId: Record<string, ShelfItem>
  categories: ShelfCategory[]
  addToShelf: (input: ShelfItemInput) => ShelfItem
  mergeShelfSnapshot: (input: { categories?: ShelfCategory[]; items?: ShelfItem[] }) => number
  removeFromShelf: (comicIds: string[]) => void
  isInShelf: (comicId: string) => boolean
  updateShelfItem: (comicId: string, patch: Partial<ShelfItem>) => ShelfItem | undefined
  createCategory: (name: string) => ShelfCategory
  renameCategory: (id: string, name: string) => ShelfCategory | undefined
  deleteCategory: (id: string) => void
  batchUpdate: (comicIds: string[], action: ShelfBatchAction) => void
  queryItems: (query?: ShelfQuery) => ShelfItem[]
  getSections: () => ShelfSections
}

export const useShelfStore = create<ShelfState>()(
  persist(
    (set, get) => ({
      itemsByComicId: {},
      categories: [],
      addToShelf: (input) => {
        const now = nowIso()
        const existing = get().itemsByComicId[input.comicId]
        const item: ShelfItem = {
          id: existing?.id ?? shelfItemId(input.comicId),
          comicId: input.comicId,
          comicTitle: input.comicTitle,
          comicUrl: input.comicUrl ?? existing?.comicUrl,
          coverUrl: input.coverUrl ?? existing?.coverUrl,
          author: input.author ?? existing?.author,
          status: input.status ?? existing?.status,
          latestVolume: input.latestVolume ?? existing?.latestVolume,
          latestVolumeId: input.latestVolumeId ?? existing?.latestVolumeId,
          latestUpdatedAt: input.latestUpdatedAt ?? existing?.latestUpdatedAt,
          unreadCount: input.unreadCount ?? existing?.unreadCount ?? 0,
          categoryIds: normalizeCategoryIds(input.categoryIds ?? existing?.categoryIds ?? []),
          archived: input.archived ?? existing?.archived ?? false,
          cached: input.cached ?? existing?.cached ?? false,
          cacheStatus: input.cacheStatus ?? existing?.cacheStatus ?? (input.cached ? 'reading_cache' : 'none'),
          addedAt: existing?.addedAt ?? now,
          updatedAt: now,
          lastReadAt: input.readingProgress?.lastReadAt ?? existing?.lastReadAt,
          readingProgress: input.readingProgress ?? existing?.readingProgress
        }
        set((state) => ({ itemsByComicId: { ...state.itemsByComicId, [item.comicId]: item } }))
        return item
      },
      mergeShelfSnapshot: (input) => {
        const categories = sanitizeCategories(input.categories)
        const items = sanitizeItems(input.items)
        let changed = 0
        set((state) => {
          const nextCategories = [...state.categories]
          for (const category of categories) {
            const index = nextCategories.findIndex((item) => item.id === category.id)
            if (index === -1) {
              nextCategories.push(category)
              changed += 1
              continue
            }
            if (category.updatedAt.localeCompare(nextCategories[index].updatedAt) > 0) {
              nextCategories[index] = category
              changed += 1
            }
          }

          const nextItems = { ...state.itemsByComicId }
          for (const item of items) {
            const existing = nextItems[item.comicId]
            if (!existing || item.updatedAt.localeCompare(existing.updatedAt) > 0) {
              nextItems[item.comicId] = item
              changed += 1
            }
          }

          return changed > 0
            ? { categories: nextCategories.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)), itemsByComicId: nextItems }
            : state
        })
        return changed
      },
      removeFromShelf: (comicIds) =>
        set((state) => {
          const next = { ...state.itemsByComicId }
          for (const comicId of comicIds) delete next[comicId]
          return { itemsByComicId: next }
        }),
      isInShelf: (comicId) => Boolean(get().itemsByComicId[comicId]),
      updateShelfItem: (comicId, patch) => {
        const existing = get().itemsByComicId[comicId]
        if (!existing) return undefined
        const updated: ShelfItem = {
          ...existing,
          ...patch,
          categoryIds: patch.categoryIds ? normalizeCategoryIds(patch.categoryIds) : existing.categoryIds,
          updatedAt: nowIso()
        }
        set((state) => ({ itemsByComicId: { ...state.itemsByComicId, [comicId]: updated } }))
        return updated
      },
      createCategory: (name) => {
        const now = nowIso()
        const category: ShelfCategory = {
          id: categoryId(name),
          name: name.trim(),
          sortOrder: get().categories.length,
          createdAt: now,
          updatedAt: now
        }
        set((state) => ({
          categories: state.categories.some((item) => item.id === category.id) ? state.categories : [...state.categories, category]
        }))
        return get().categories.find((item) => item.id === category.id) ?? category
      },
      renameCategory: (id, name) => {
        const existing = get().categories.find((item) => item.id === id)
        if (!existing) return undefined
        const updated = { ...existing, name: name.trim(), updatedAt: nowIso() }
        set((state) => ({ categories: state.categories.map((item) => item.id === id ? updated : item) }))
        return updated
      },
      deleteCategory: (id) =>
        set((state) => ({
          categories: state.categories.filter((item) => item.id !== id),
          itemsByComicId: Object.fromEntries(
            Object.entries(state.itemsByComicId).map(([comicId, item]) => [
              comicId,
              { ...item, categoryIds: item.categoryIds.filter((categoryId) => categoryId !== id), updatedAt: nowIso() }
            ])
          )
        })),
      batchUpdate: (comicIds, action) =>
        set((state) => applyBatchAction(state.itemsByComicId, comicIds, action)),
      queryItems: (query) => queryShelfItems(Object.values(get().itemsByComicId), query),
      getSections: () => {
        const items = queryShelfItems(Object.values(get().itemsByComicId), { includeArchived: false })
        return {
          continueReading: items
            .filter((item) => item.readingProgress && !item.readingProgress.finished)
            .sort((left, right) => (right.lastReadAt ?? '').localeCompare(left.lastReadAt ?? ''))
            .slice(0, 12),
          updated: items
            .filter((item) => item.unreadCount > 0 || hasUpdates(item))
            .sort((left, right) => (right.latestUpdatedAt ?? '').localeCompare(left.latestUpdatedAt ?? ''))
            .slice(0, 24),
          all: items
        }
      }
    }),
    {
      name: 'kmoe-client-shelf',
      partialize: (state) => ({
        itemsByComicId: sanitizeItemsMap(state.itemsByComicId),
        categories: sanitizeCategories(state.categories)
      }),
      merge: (persisted, current) => {
        const state = readPersistedState(persisted)
        return {
          ...current,
          itemsByComicId: sanitizeItemsMap(state.itemsByComicId),
          categories: sanitizeCategories(state.categories)
        }
      }
    }
  )
)

export function queryShelfItems(items: ShelfItem[], query: ShelfQuery = {}): ShelfItem[] {
  const filters = query.filters ?? {}
  const keyword = query.keyword?.trim().toLowerCase()
  const filtered = items.filter((item) => {
    if (!query.includeArchived && item.archived) return false
    if (query.categoryId && !item.categoryIds.includes(query.categoryId)) return false
    if (keyword && !`${item.comicTitle} ${item.author ?? ''} ${item.latestVolume ?? ''}`.toLowerCase().includes(keyword)) return false
    if (filters.archived !== undefined && item.archived !== filters.archived) return false
    if (filters.hasUpdates && !hasUpdates(item)) return false
    if (filters.unreadOnly && item.unreadCount <= 0) return false
    if (filters.unfinished && item.readingProgress?.finished) return false
    if (filters.completed && !item.readingProgress?.finished) return false
    if (filters.seriesCompleted && !isSeriesCompletedStatus(item.status)) return false
    if (filters.cached && !item.cached) return false
    if (filters.downloaded && item.cacheStatus !== 'downloaded') return false
    return true
  })

  const sortBy = query.sortBy ?? 'recent_read'
  const direction = query.sortDirection ?? 'desc'
  return [...filtered].sort((left, right) => {
    const result = compareBySort(left, right, sortBy)
    return direction === 'asc' ? result : -result
  })
}

function applyBatchAction(itemsByComicId: Record<string, ShelfItem>, comicIds: string[], action: ShelfBatchAction): { itemsByComicId: Record<string, ShelfItem> } {
  const now = nowIso()
  const next = { ...itemsByComicId }
  for (const comicId of comicIds) {
    const item = next[comicId]
    if (!item) continue
    if (action.type === 'remove') {
      delete next[comicId]
      continue
    }
    if (action.type === 'archive') next[comicId] = { ...item, archived: action.archived, updatedAt: now }
    if (action.type === 'mark_read') {
      next[comicId] = {
        ...item,
        unreadCount: 0,
        readingProgress: item.readingProgress ? markProgressRead(item.readingProgress, now) : item.readingProgress,
        lastReadAt: item.readingProgress ? now : item.lastReadAt,
        updatedAt: now
      }
    }
    if (action.type === 'mark_unread') {
      next[comicId] = {
        ...item,
        unreadCount: Math.max(1, action.unreadCount ?? item.unreadCount),
        readingProgress: item.readingProgress ? markProgressUnread(item.readingProgress) : item.readingProgress,
        updatedAt: now
      }
    }
    if (action.type === 'set_cached') next[comicId] = { ...item, cached: action.cached, cacheStatus: action.cacheStatus ?? (action.cached ? 'reading_cache' : 'none'), updatedAt: now }
    if (action.type === 'move_categories') {
      next[comicId] = {
        ...item,
        categoryIds: applyCategoryMove(item.categoryIds, action.categoryIds, action.mode),
        updatedAt: now
      }
    }
  }
  return { itemsByComicId: next }
}

function markProgressRead(progress: NonNullable<ShelfItem['readingProgress']>, now: string): NonNullable<ShelfItem['readingProgress']> {
  const pageCount = progress.pageCount ?? Math.max(progress.pageIndex + 1, 1)
  return {
    ...progress,
    pageIndex: Math.max(0, pageCount - 1),
    pageCount,
    progressPercent: 100,
    lastReadAt: now,
    finished: true
  }
}

function markProgressUnread(progress: NonNullable<ShelfItem['readingProgress']>): NonNullable<ShelfItem['readingProgress']> {
  return {
    ...progress,
    progressPercent: Math.min(progress.progressPercent, 99),
    finished: false
  }
}

function compareBySort(left: ShelfItem, right: ShelfItem, sortBy: NonNullable<ShelfQuery['sortBy']>): number {
  switch (sortBy) {
    case 'title':
      return left.comicTitle.localeCompare(right.comicTitle, 'zh-Hans-CN')
    case 'recent_update':
      return (left.latestUpdatedAt ?? '').localeCompare(right.latestUpdatedAt ?? '')
    case 'added_at':
      return left.addedAt.localeCompare(right.addedAt)
    case 'reading_progress':
      return (left.readingProgress?.progressPercent ?? 0) - (right.readingProgress?.progressPercent ?? 0)
    case 'unread_count':
      return left.unreadCount - right.unreadCount
    case 'recent_read':
    default:
      return (left.lastReadAt ?? '').localeCompare(right.lastReadAt ?? '')
  }
}

function hasUpdates(item: ShelfItem): boolean {
  return item.unreadCount > 0 || Boolean(item.latestUpdatedAt && (!item.lastReadAt || item.latestUpdatedAt > item.lastReadAt))
}

function isSeriesCompletedStatus(status?: string): boolean {
  if (!status) return false
  const normalized = status.trim().toLowerCase()
  return ['完結', '完结', '已完結', '已完结'].some((marker) => normalized.includes(marker))
    || normalized === 'completed'
    || normalized === 'finished'
}

function applyCategoryMove(current: string[], incoming: string[], mode: 'replace' | 'add' | 'remove'): string[] {
  const normalized = normalizeCategoryIds(incoming)
  if (mode === 'replace') return normalized
  if (mode === 'remove') return current.filter((id) => !normalized.includes(id))
  return normalizeCategoryIds([...current, ...normalized])
}

function normalizeCategoryIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function shelfItemId(comicId: string): string {
  return `shelf:${comicId}`
}

function categoryId(name: string): string {
  return `cat:${name.trim().toLowerCase().replace(/\s+/g, '-') || 'untitled'}`
}

function sanitizeItemsMap(value: unknown): Record<string, ShelfItem> {
  if (!isRecord(value)) return {}
  const itemsByComicId: Record<string, ShelfItem> = {}
  for (const [comicId, item] of Object.entries(value)) {
    if (isShelfItem(item)) itemsByComicId[comicId] = item
  }
  return itemsByComicId
}

function sanitizeItems(value: unknown): ShelfItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(isShelfItem)
}

function sanitizeCategories(value: unknown): ShelfCategory[] {
  if (!Array.isArray(value)) return []
  return value.filter(isShelfCategory)
}

function readPersistedState(value: unknown): { itemsByComicId?: unknown; categories?: unknown } {
  if (!isRecord(value)) return {}
  return isRecord(value.state) ? value.state : value
}

function isShelfItem(value: unknown): value is ShelfItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.comicId === 'string'
    && typeof value.comicTitle === 'string'
    && Array.isArray(value.categoryIds)
    && typeof value.addedAt === 'string'
    && typeof value.updatedAt === 'string'
}

function isShelfCategory(value: unknown): value is ShelfCategory {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.sortOrder === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
