import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetNativeShelfSyncForTests, useNativeShelfSync } from '../hooks/useNativeShelfSync'
import {
  listNativeShelfItems,
  listNativeShelves,
  removeNativeShelfItems,
  upsertNativeShelf,
  upsertNativeShelfItem
} from '../platform/nativeCommands'
import {
  DEFAULT_NATIVE_SHELF_ID,
  nativeShelfItemsToDomain,
  nativeShelvesToCategories,
  shelfItemToNativeRecords
} from '../shelf/nativeShelf'
import { useShelfStore } from '../store/shelfStore'

vi.mock('../platform/nativeCommands', () => ({
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available),
  listNativeShelves: vi.fn(),
  listNativeShelfItems: vi.fn(),
  removeNativeShelfItems: vi.fn(),
  upsertNativeShelf: vi.fn(),
  upsertNativeShelfItem: vi.fn()
}))

const listShelvesMock = vi.mocked(listNativeShelves)
const listItemsMock = vi.mocked(listNativeShelfItems)
const removeItemsMock = vi.mocked(removeNativeShelfItems)
const upsertShelfMock = vi.mocked(upsertNativeShelf)
const upsertItemMock = vi.mocked(upsertNativeShelfItem)

describe('native shelf sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNativeShelfSyncForTests()
    window.localStorage.clear()
    useShelfStore.setState({ itemsByComicId: {}, categories: [] })
    removeItemsMock.mockResolvedValue({ ok: true, available: true, message: 'ok', value: [] })
    upsertShelfMock.mockResolvedValue({ ok: true, available: true, message: 'ok', value: [] })
    upsertItemMock.mockResolvedValue({ ok: true, available: true, message: 'ok', value: [] })
  })

  it('converts native shelves and shelf rows into domain shelf state', () => {
    expect(nativeShelvesToCategories([
      sampleNativeShelf(DEFAULT_NATIVE_SHELF_ID, '书架', 'default'),
      sampleNativeShelf('cat:magic', '魔法', 'category')
    ])).toEqual([{
      id: 'cat:magic',
      name: '魔法',
      sortOrder: 1,
      createdAt: '2026-05-24T09:00:00.000Z',
      updatedAt: '2026-05-24T09:00:00.000Z'
    }])

    const [item] = nativeShelfItemsToDomain([
      sampleNativeItem(DEFAULT_NATIVE_SHELF_ID),
      sampleNativeItem('cat:magic')
    ])

    expect(item).toMatchObject({
      id: 'shelf:53339',
      comicId: '53339',
      categoryIds: ['cat:magic'],
      status: '連載',
      cached: true,
      cacheStatus: 'reading_cache'
    })
    expect(shelfItemToNativeRecords(item).map((record) => record.shelfId)).toEqual([DEFAULT_NATIVE_SHELF_ID, 'cat:magic'])
    expect(shelfItemToNativeRecords(item)[0]).toMatchObject({ comicStatus: '連載' })
  })

  it('imports native shelf rows on startup and writes later local changes back to native', async () => {
    listShelvesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleNativeShelf(DEFAULT_NATIVE_SHELF_ID, '书架', 'default'), sampleNativeShelf('cat:magic', '魔法', 'category')]
    })
    listItemsMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleNativeItem(DEFAULT_NATIVE_SHELF_ID), sampleNativeItem('cat:magic')]
    })

    render(<NativeShelfSyncHarness />)

    await waitFor(() => {
      expect(useShelfStore.getState().categories.map((item) => item.id)).toEqual(['cat:magic'])
      expect(useShelfStore.getState().itemsByComicId['53339']).toMatchObject({
        comicTitle: '尖帽子的魔法工房',
        categoryIds: ['cat:magic']
      })
    })
    expect(upsertShelfMock).toHaveBeenCalledWith(expect.objectContaining({ id: DEFAULT_NATIVE_SHELF_ID }))
    expect(upsertItemMock).toHaveBeenCalledWith(expect.objectContaining({ comicId: '53339', shelfId: DEFAULT_NATIVE_SHELF_ID }))

    act(() => {
      useShelfStore.getState().addToShelf({
        comicId: '14140',
        comicTitle: '地下忍者',
        comicUrl: '/c/14140.htm',
        latestVolume: '卷 01',
        unreadCount: 1
      })
    })

    await waitFor(() => {
      expect(removeItemsMock).toHaveBeenCalledWith(['14140'])
      expect(upsertItemMock).toHaveBeenCalledWith(expect.objectContaining({ comicId: '14140', shelfId: DEFAULT_NATIVE_SHELF_ID }))
    })
  })
})

function NativeShelfSyncHarness() {
  useNativeShelfSync()
  return null
}

function sampleNativeShelf(id: string, name: string, kind: string) {
  return {
    id,
    name,
    kind,
    sortOrder: id === DEFAULT_NATIVE_SHELF_ID ? 0 : 1,
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T09:00:00.000Z'
  }
}

function sampleNativeItem(shelfId: string) {
  return {
    id: `${shelfId}-53339`,
    shelfId,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    comicUrl: '/c/53339.htm',
    coverUrl: '/cover/53339.jpg',
    comicStatus: '連載',
    latestVolume: '話 095',
    lastReadVolumeId: '3089',
    lastReadLabel: '继续读 話 089-095 · 第 12 页',
    unreadCount: 2,
    cached: true,
    archived: false,
    addedAt: '2026-05-24T09:30:00.000Z',
    updatedAt: '2026-05-24T10:00:00.000Z',
    lastReadAt: '2026-05-24T10:00:00.000Z',
    lastUpdateAt: '2026-05-24T10:30:00.000Z'
  }
}
