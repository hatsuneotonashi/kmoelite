import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShelfPage } from '../pages/ShelfPage'
import { useCacheStore } from '../store/cacheStore'
import { useReadingStore } from '../store/readingStore'
import { useShelfStore } from '../store/shelfStore'

describe('ShelfPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useShelfStore.setState({ itemsByComicId: {}, categories: [] })
    useReadingStore.setState({ progressById: {}, history: [] })
    useCacheStore.setState({ chaptersById: {}, pagesByChapterId: {} })
  })

  it('renders an actionable empty shelf state', () => {
    render(
      <MemoryRouter>
        <ShelfPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: '书架', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('书架还没有内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '去搜索漫画' })).toBeInTheDocument()
  })

  it('shows continue reading, updates, filters, categories, and batch actions', () => {
    seedShelf()
    render(
      <MemoryRouter>
        <ShelfPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: '继续阅读' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '有更新' })).toBeInTheDocument()
    expect(screen.getAllByText('尖帽子的魔法工房').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('新分类名称'), { target: { value: '待读' } })
    fireEvent.click(screen.getByRole('button', { name: /新建/ }))
    expect(screen.getByRole('button', { name: '待读' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '全部分类' }))

    fireEvent.click(screen.getByRole('button', { name: '选择当前' }))
    expect(screen.getByLabelText('批量分类')).toHaveValue('cat:待读')
    fireEvent.click(screen.getByRole('button', { name: '加入分类' }))
    expect(useShelfStore.getState().itemsByComicId['53339'].categoryIds).toContain('cat:待读')
    expect(useShelfStore.getState().itemsByComicId['14140'].categoryIds).toContain('cat:待读')

    fireEvent.click(screen.getByRole('button', { name: '选择当前' }))
    fireEvent.click(screen.getByRole('button', { name: '移出分类' }))
    expect(useShelfStore.getState().itemsByComicId['53339'].categoryIds).not.toContain('cat:待读')
    expect(useShelfStore.getState().itemsByComicId['14140'].categoryIds).not.toContain('cat:待读')

    fireEvent.click(screen.getByRole('button', { name: '选择当前' }))
    fireEvent.click(screen.getByRole('button', { name: '移动分类' }))
    expect(useShelfStore.getState().itemsByComicId['53339'].categoryIds).toEqual(['cat:待读'])
    expect(useShelfStore.getState().itemsByComicId['14140'].categoryIds).toEqual(['cat:待读'])

    fireEvent.click(screen.getByRole('button', { name: '选择当前' }))
    fireEvent.click(screen.getByRole('button', { name: '标为已读' }))

    expect(useShelfStore.getState().itemsByComicId['53339'].unreadCount).toBe(0)
    expect(useShelfStore.getState().itemsByComicId['14140'].unreadCount).toBe(0)
    expect(useShelfStore.getState().itemsByComicId['53339'].readingProgress).toMatchObject({
      progressPercent: 100,
      finished: true
    })
    expect(useReadingStore.getState().getProgress('53339', '3089')).toMatchObject({
      progressPercent: 100,
      finished: true
    })

    fireEvent.click(screen.getByRole('button', { name: '已缓存' }))
    expect(screen.getAllByText('尖帽子的魔法工房').length).toBeGreaterThan(0)
  })

  it('exposes read-completed, series-completed, and downloaded shelf filters in the UI', () => {
    seedShelfFilterItems()
    render(
      <MemoryRouter>
        <ShelfPage />
      </MemoryRouter>
    )

    const collection = getAllCollectionSection()

    fireEvent.click(screen.getByRole('button', { name: '已读完' }))
    expect(within(collection).getAllByText('GRAND BLUE 碧蓝之海').length).toBeGreaterThan(0)
    expect(within(collection).queryAllByText('地下忍者')).toHaveLength(0)
    expect(within(collection).queryAllByText('尖帽子的魔法工房')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '已完结' }))
    expect(within(collection).getAllByText('尖帽子的魔法工房').length).toBeGreaterThan(0)
    expect(within(collection).queryAllByText('GRAND BLUE 碧蓝之海')).toHaveLength(0)
    expect(within(collection).queryAllByText('地下忍者')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '已下载' }))
    expect(within(collection).getAllByText('地下忍者').length).toBeGreaterThan(0)
    expect(within(collection).queryAllByText('GRAND BLUE 碧蓝之海')).toHaveLength(0)
    expect(within(collection).queryAllByText('尖帽子的魔法工房')).toHaveLength(0)
  })

  it('marks all currently filtered shelf items read without selecting them first', () => {
    seedShelf()
    render(
      <MemoryRouter>
        <ShelfPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '有更新' }))
    fireEvent.click(screen.getByRole('button', { name: '全部标为已读' }))

    expect(useShelfStore.getState().itemsByComicId['53339'].unreadCount).toBe(0)
    expect(useShelfStore.getState().itemsByComicId['14140'].unreadCount).toBe(0)
    expect(useShelfStore.getState().itemsByComicId['53339'].readingProgress).toMatchObject({
      progressPercent: 100,
      finished: true
    })
    expect(useReadingStore.getState().getProgress('53339', '3089')).toMatchObject({
      progressPercent: 100,
      finished: true
    })
  })

  it('clears selected reading cache without removing downloaded shelf state', async () => {
    seedShelfCacheCleanupItems()
    render(
      <MemoryRouter>
        <ShelfPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: '选择当前' }))
    fireEvent.click(screen.getByRole('button', { name: '删除阅读缓存 1' }))

    await waitFor(() => {
      expect(useCacheStore.getState().chaptersById['cache-53339-3089']).toBeUndefined()
      expect(useShelfStore.getState().itemsByComicId['53339']).toMatchObject({ cached: false, cacheStatus: 'none' })
      expect(useShelfStore.getState().itemsByComicId['14140']).toMatchObject({ cached: true, cacheStatus: 'downloaded' })
    })
    expect(screen.getByText(/永久下载、书架和阅读记录不受影响/)).toBeInTheDocument()
  })
})

function getAllCollectionSection() {
  const section = screen.getByRole('heading', { name: '全部收藏' }).closest('section')
  expect(section).not.toBeNull()
  return section as HTMLElement
}

function seedShelf() {
  const progress = {
    id: '53339:3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    pageIndex: 12,
    pageCount: 180,
    progressPercent: 6.67,
    lastReadAt: '2026-05-24T11:00:00.000Z',
    finished: false,
    readingMode: 'paged' as const,
    readingDirection: 'rtl' as const,
    pageLayout: 'single' as const
  }
  useReadingStore.getState().mergeProgressSnapshot([progress])
  useShelfStore.getState().addToShelf({
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    comicUrl: '/c/53339.htm',
    author: '白浜鴎',
    latestVolume: '話 095',
    unreadCount: 2,
    cached: true,
    cacheStatus: 'reading_cache',
    readingProgress: progress
  })
  useShelfStore.getState().addToShelf({
    comicId: '14140',
    comicTitle: '地下忍者',
    comicUrl: '/c/14140.htm',
    latestVolume: '第 12 卷',
    unreadCount: 1,
    latestUpdatedAt: '2026-05-24T12:00:00.000Z'
  })
}

function seedShelfFilterItems() {
  const completedProgress = {
    id: '10180:vol20',
    comicId: '10180',
    comicTitle: 'GRAND BLUE 碧蓝之海',
    volumeId: 'vol20',
    volumeTitle: '第 20 卷',
    pageIndex: 199,
    pageCount: 200,
    progressPercent: 100,
    lastReadAt: '2026-05-24T13:00:00.000Z',
    finished: true,
    readingMode: 'paged' as const,
    readingDirection: 'rtl' as const,
    pageLayout: 'single' as const
  }
  useShelfStore.getState().addToShelf({
    comicId: '10180',
    comicTitle: 'GRAND BLUE 碧蓝之海',
    comicUrl: '/c/10180.htm',
    latestVolume: '第 20 卷',
    status: '連載',
    unreadCount: 0,
    readingProgress: completedProgress
  })
  useShelfStore.getState().addToShelf({
    comicId: '14140',
    comicTitle: '地下忍者',
    comicUrl: '/c/14140.htm',
    latestVolume: '第 12 卷',
    status: '連載',
    unreadCount: 0,
    cached: true,
    cacheStatus: 'downloaded'
  })
  useShelfStore.getState().addToShelf({
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    comicUrl: '/c/53339.htm',
    latestVolume: '話 095',
    status: '完結',
    unreadCount: 0,
    readingProgress: {
      ...completedProgress,
      id: '53339:3089',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 12,
      pageCount: 180,
      progressPercent: 6.67,
      finished: false
    }
  })
}

function seedShelfCacheCleanupItems() {
  useShelfStore.getState().addToShelf({
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    comicUrl: '/c/53339.htm',
    latestVolume: '話 095',
    unreadCount: 0,
    cached: true,
    cacheStatus: 'reading_cache'
  })
  useShelfStore.getState().addToShelf({
    comicId: '14140',
    comicTitle: '地下忍者',
    comicUrl: '/c/14140.htm',
    latestVolume: '第 12 卷',
    unreadCount: 0,
    cached: true,
    cacheStatus: 'downloaded'
  })
  useCacheStore.getState().upsertChapter({
    id: 'cache-53339-3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    cacheKind: 'reading_cache',
    sizeBytes: 12000,
    pageCount: 8,
    status: 'ready',
    policy: 'balanced',
    lastAccessedAt: '2026-05-24T12:00:00.000Z',
    createdAt: '2026-05-24T11:00:00.000Z',
    updatedAt: '2026-05-24T12:00:00.000Z'
  })
  useCacheStore.getState().upsertChapter({
    id: 'downloaded-14140-v12',
    comicId: '14140',
    comicTitle: '地下忍者',
    volumeId: 'v12',
    volumeTitle: '第 12 卷',
    format: 'source_zip',
    cacheKind: 'permanent_download',
    sizeBytes: 34000,
    pageCount: 160,
    status: 'ready',
    lastAccessedAt: '2026-05-24T10:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T10:00:00.000Z'
  })
}
