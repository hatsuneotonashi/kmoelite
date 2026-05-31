import { beforeEach, describe, expect, it } from 'vitest'
import { queryShelfItems, useShelfStore } from '../store/shelfStore'
import type { ShelfItem } from '../types/shelf'

describe('shelfStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useShelfStore.setState({ itemsByComicId: {}, categories: [] })
  })

  it('adds local shelf items before login and keeps multiple categories', () => {
    const magic = useShelfStore.getState().createCategory('魔法')
    const favorite = useShelfStore.getState().createCategory('收藏')
    const item = useShelfStore.getState().addToShelf({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      author: '白浜鴎',
      latestVolume: '話 095',
      unreadCount: 2,
      categoryIds: [magic.id, favorite.id, magic.id]
    })

    expect(useShelfStore.getState().isInShelf('53339')).toBe(true)
    expect(item.categoryIds).toEqual([magic.id, favorite.id])
    expect(item.unreadCount).toBe(2)
    expect(item.archived).toBe(false)
  })

  it('builds continue reading, updated, and all sections from separate shelf state', () => {
    useShelfStore.getState().addToShelf(sampleItem('53339', '尖帽子的魔法工房', { unreadCount: 3, lastReadAt: '2026-05-24T10:00:00.000Z', progress: 42 }))
    useShelfStore.getState().addToShelf(sampleItem('14140', '地下忍者', { latestUpdatedAt: '2026-05-24T11:00:00.000Z' }))

    const sections = useShelfStore.getState().getSections()

    expect(sections.continueReading.map((item) => item.comicId)).toEqual(['53339'])
    expect(sections.updated.map((item) => item.comicId)).toEqual(['14140', '53339'])
    expect(sections.all).toHaveLength(2)
  })

  it('supports search, sort, filter, archive, cached, downloaded, and series-completed queries', () => {
    const cached = useShelfStore.getState().addToShelf(sampleItem('53339', '尖帽子的魔法工房', { unreadCount: 4, cached: true, cacheStatus: 'downloaded', progress: 20 }))
    useShelfStore.getState().addToShelf(sampleItem('10180', 'A 完结漫画', { unreadCount: 0, status: '完結' }))
    useShelfStore.getState().addToShelf(sampleItem('14140', '地下忍者', { unreadCount: 0 }))
    useShelfStore.getState().updateShelfItem('14140', { archived: true })

    expect(useShelfStore.getState().queryItems({ keyword: '魔法' }).map((item) => item.comicId)).toEqual(['53339'])
    expect(useShelfStore.getState().queryItems({ filters: { unreadOnly: true } }).map((item) => item.comicId)).toEqual(['53339'])
    expect(useShelfStore.getState().queryItems({ filters: { downloaded: true } }).map((item) => item.comicId)).toEqual(['53339'])
    expect(useShelfStore.getState().queryItems({ filters: { seriesCompleted: true } }).map((item) => item.comicId)).toEqual(['10180'])
    expect(useShelfStore.getState().queryItems({ includeArchived: false }).map((item) => item.comicId).sort()).toEqual(['10180', '53339'])
    expect(cached.cacheStatus).toBe('downloaded')
  })

  it('applies batch actions without touching download records', () => {
    useShelfStore.getState().addToShelf(sampleItem('53339', '尖帽子的魔法工房', { unreadCount: 3, cached: true, progress: 40 }))
    useShelfStore.getState().addToShelf(sampleItem('14140', '地下忍者', { unreadCount: 1 }))
    const backlog = useShelfStore.getState().createCategory('待读')

    useShelfStore.getState().batchUpdate(['53339', '14140'], { type: 'mark_read' })
    expect(useShelfStore.getState().queryItems({ includeArchived: true }).map((item) => item.unreadCount)).toEqual([0, 0])
    expect(useShelfStore.getState().itemsByComicId['53339'].readingProgress).toMatchObject({
      pageIndex: 9,
      progressPercent: 100,
      finished: true
    })

    useShelfStore.getState().batchUpdate(['53339'], { type: 'mark_unread' })
    expect(useShelfStore.getState().itemsByComicId['53339']).toMatchObject({ unreadCount: 1 })
    expect(useShelfStore.getState().itemsByComicId['53339'].readingProgress).toMatchObject({
      progressPercent: 99,
      finished: false
    })

    useShelfStore.getState().batchUpdate(['53339'], { type: 'move_categories', categoryIds: [backlog.id], mode: 'add' })
    expect(useShelfStore.getState().itemsByComicId['53339'].categoryIds).toContain(backlog.id)

    useShelfStore.getState().batchUpdate(['53339'], { type: 'set_cached', cached: false })
    expect(useShelfStore.getState().itemsByComicId['53339']).toMatchObject({ cached: false, cacheStatus: 'none' })

    useShelfStore.getState().batchUpdate(['14140'], { type: 'archive', archived: true })
    expect(useShelfStore.getState().itemsByComicId['14140'].archived).toBe(true)
  })

  it('merges native shelf snapshots without overwriting newer local items', () => {
    useShelfStore.getState().addToShelf(sampleItem('53339', '尖帽子的魔法工房', {
      unreadCount: 1,
      latestUpdatedAt: '2026-05-24T12:00:00.000Z'
    }))

    const changed = useShelfStore.getState().mergeShelfSnapshot({
      categories: [{
        id: 'cat:downloaded',
        name: '已下载',
        sortOrder: 0,
        createdAt: '2026-05-24T09:00:00.000Z',
        updatedAt: '2026-05-24T09:00:00.000Z'
      }],
      items: [
        {
          ...useShelfStore.getState().itemsByComicId['53339'],
          unreadCount: 8,
          updatedAt: '2000-01-01T00:00:00.000Z'
        },
        {
          id: 'shelf:14140',
          comicId: '14140',
          comicTitle: '地下忍者',
          unreadCount: 2,
          categoryIds: ['cat:downloaded'],
          archived: false,
          cached: true,
          cacheStatus: 'reading_cache',
          addedAt: '2026-05-24T10:00:00.000Z',
          updatedAt: '2026-05-24T10:00:00.000Z'
        }
      ]
    })

    expect(changed).toBe(2)
    expect(useShelfStore.getState().categories.map((item) => item.id)).toEqual(['cat:downloaded'])
    expect(useShelfStore.getState().itemsByComicId['53339'].unreadCount).toBe(1)
    expect(useShelfStore.getState().itemsByComicId['14140']).toMatchObject({ cached: true, unreadCount: 2 })
  })

  it('removes deleted categories from every item', () => {
    const category = useShelfStore.getState().createCategory('已下载')
    useShelfStore.getState().addToShelf(sampleItem('53339', '尖帽子的魔法工房', { categoryIds: [category.id] }))

    useShelfStore.getState().deleteCategory(category.id)

    expect(useShelfStore.getState().categories).toEqual([])
    expect(useShelfStore.getState().itemsByComicId['53339'].categoryIds).toEqual([])
  })

  it('query helper keeps title ordering deterministic', () => {
    const items: ShelfItem[] = [
      useShelfStore.getState().addToShelf(sampleItem('14140', 'B 漫画')),
      useShelfStore.getState().addToShelf(sampleItem('10180', 'A 漫画'))
    ]

    expect(queryShelfItems(items, { sortBy: 'title', sortDirection: 'asc' }).map((item) => item.comicTitle)).toEqual([
      'A 漫画',
      'B 漫画'
    ])
  })
})

function sampleItem(
  comicId: string,
  comicTitle: string,
  options: {
    unreadCount?: number
    cached?: boolean
    cacheStatus?: ShelfItem['cacheStatus']
    lastReadAt?: string
    latestUpdatedAt?: string
    progress?: number
    categoryIds?: string[]
    status?: string
  } = {}
) {
  return {
    comicId,
    comicTitle,
    latestVolume: '話 001',
    status: options.status,
    unreadCount: options.unreadCount ?? 0,
    cached: options.cached ?? false,
    cacheStatus: options.cacheStatus,
    categoryIds: options.categoryIds,
    latestUpdatedAt: options.latestUpdatedAt,
    readingProgress: options.progress === undefined ? undefined : {
      id: `${comicId}:v1`,
      comicId,
      comicTitle,
      volumeId: 'v1',
      volumeTitle: '話 001',
      pageIndex: 4,
      pageCount: 10,
      progressPercent: options.progress,
      lastReadAt: options.lastReadAt ?? '2026-05-24T10:00:00.000Z',
      finished: false,
      readingMode: 'paged' as const,
      readingDirection: 'rtl' as const,
      pageLayout: 'single' as const
    }
  }
}
