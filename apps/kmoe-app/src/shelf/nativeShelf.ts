import type { NativeShelfItemRecord, NativeShelfRecord } from '../platform/nativeCommands'
import type { ShelfCategory, ShelfItem } from '../types/shelf'

export const DEFAULT_NATIVE_SHELF_ID = 'default'

export function makeDefaultNativeShelf(now: string): NativeShelfRecord {
  return {
    id: DEFAULT_NATIVE_SHELF_ID,
    name: '书架',
    kind: 'default',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now
  }
}

export function nativeShelvesToCategories(records: NativeShelfRecord[]): ShelfCategory[] {
  return records
    .filter((record) => record.id !== DEFAULT_NATIVE_SHELF_ID && record.kind !== 'default' && !record.archivedAt)
    .map((record) => ({
      id: record.id,
      name: record.name,
      sortOrder: record.sortOrder,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }))
}

export function categoryToNativeShelf(category: ShelfCategory): NativeShelfRecord {
  return {
    id: category.id,
    name: category.name,
    kind: 'category',
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  }
}

export function nativeShelfItemsToDomain(records: NativeShelfItemRecord[]): ShelfItem[] {
  const grouped = new Map<string, NativeShelfItemRecord[]>()
  for (const record of records) {
    if (!record.comicId || !record.comicTitle) continue
    const current = grouped.get(record.comicId) ?? []
    current.push(record)
    grouped.set(record.comicId, current)
  }

  return [...grouped.values()].map((items) => {
    const primary = [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    const categoryIds = items
      .map((item) => item.shelfId)
      .filter((shelfId) => shelfId && shelfId !== DEFAULT_NATIVE_SHELF_ID)
      .filter(unique)

    return {
      id: `shelf:${primary.comicId}`,
      comicId: primary.comicId,
      comicTitle: primary.comicTitle,
      comicUrl: primary.comicUrl,
      coverUrl: primary.coverUrl,
      status: primary.comicStatus,
      latestVolume: primary.latestVolume,
      unreadCount: Math.max(0, primary.unreadCount),
      categoryIds,
      archived: primary.archived,
      cached: primary.cached,
      cacheStatus: primary.cached ? 'reading_cache' : 'none',
      addedAt: primary.addedAt,
      updatedAt: primary.updatedAt,
      lastReadAt: primary.lastReadAt,
      latestUpdatedAt: primary.lastUpdateAt
    }
  })
}

export function shelfItemToNativeRecords(item: ShelfItem): NativeShelfItemRecord[] {
  const shelfIds = [DEFAULT_NATIVE_SHELF_ID, ...item.categoryIds].filter(unique)
  return shelfIds.map((shelfId) => ({
    id: `${shelfId}-${item.comicId}`,
    shelfId,
    comicId: item.comicId,
    comicTitle: item.comicTitle,
    comicUrl: item.comicUrl,
    coverUrl: item.coverUrl,
    comicStatus: item.status,
    latestVolume: item.latestVolume,
    lastReadVolumeId: item.readingProgress?.volumeId,
    lastReadLabel: item.readingProgress ? progressLabel(item.readingProgress.volumeTitle, item.readingProgress.pageIndex, item.readingProgress.pageCount) : undefined,
    unreadCount: Math.max(0, item.unreadCount),
    cached: item.cached,
    archived: item.archived,
    addedAt: item.addedAt,
    updatedAt: item.updatedAt,
    lastReadAt: item.lastReadAt ?? item.readingProgress?.lastReadAt,
    lastUpdateAt: item.latestUpdatedAt
  }))
}

function progressLabel(volumeTitle: string, pageIndex: number, pageCount?: number): string {
  const total = pageCount ? ` / ${pageCount}` : ''
  return `继续读 ${volumeTitle} · 第 ${pageIndex + 1}${total} 页`
}

function unique<T>(value: T, index: number, array: T[]): boolean {
  return array.indexOf(value) === index
}
