import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeReadingProgressSync, resetNativeReadingProgressSyncForTests } from '../hooks/useNativeReadingProgressSync'
import { listNativeReadingProgress } from '../platform/nativeCommands'
import { nativeReadingProgressToDomain } from '../reading/nativeProgress'
import { useReadingStore } from '../store/readingStore'
import { useShelfStore } from '../store/shelfStore'

vi.mock('../platform/nativeCommands', () => ({
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available),
  listNativeReadingProgress: vi.fn()
}))

const listNativeReadingProgressMock = vi.mocked(listNativeReadingProgress)

describe('native reading progress sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNativeReadingProgressSyncForTests()
    window.localStorage.clear()
    useReadingStore.setState({ progressById: {}, history: [] })
    useShelfStore.setState({
      itemsByComicId: {
        '53339': {
          id: 'shelf:53339',
          comicId: '53339',
          comicTitle: '尖帽子的魔法工房',
          unreadCount: 0,
          categoryIds: [],
          archived: false,
          cached: true,
          cacheStatus: 'reading_cache',
          addedAt: '2026-05-24T09:00:00.000Z',
          updatedAt: '2026-05-24T09:00:00.000Z'
        }
      },
      categories: []
    })
  })

  it('normalizes native records into safe domain progress', () => {
    expect(nativeReadingProgressToDomain({
      id: 'native-id',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 12.8,
      pageCount: 180,
      progressPercent: 6.666,
      lastReadAt: '2026-05-24T10:00:00.000Z',
      finished: false,
      readingMode: 'bad-mode',
      readingDirection: 'ltr',
      pageLayout: 'auto_double',
      zoom: 1.45,
      rotation: 90,
      cropJson: '{"mode":"manual","inset":4}',
      spreadOverridesJson: '{"0":"force_double","bad":"force_single","2":"bad"}',
      updatedAt: '2026-05-24T10:00:00.000Z'
    })).toMatchObject({
      id: '53339:3089',
      pageIndex: 12,
      progressPercent: 6.67,
      readingMode: 'paged',
      readingDirection: 'ltr',
      pageLayout: 'auto_double',
      zoom: 1.45,
      rotation: 90,
      crop: { mode: 'manual', inset: 4 },
      spreadOverrides: { 0: 'force_double' }
    })
  })

  it('imports native SQLite progress into reading store and existing shelf items', async () => {
    listNativeReadingProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [{
        id: 'native-id',
        comicId: '53339',
        comicTitle: '尖帽子的魔法工房',
        volumeId: '3089',
        volumeTitle: '話 089-095',
        pageIndex: 12,
        pageCount: 180,
        progressPercent: 7.22,
        lastReadAt: '2026-05-24T10:00:00.000Z',
        finished: false,
        readingMode: 'paged',
        readingDirection: 'rtl',
        pageLayout: 'single',
        zoom: 1.25,
        rotation: 180,
        cropJson: '{"mode":"auto"}',
        spreadOverridesJson: '{"0":"force_single"}',
        updatedAt: '2026-05-24T10:00:00.000Z'
      }]
    })

    render(<NativeReadingProgressSyncHarness />)

    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3089')).toMatchObject({
        pageIndex: 12,
        rotation: 180,
        crop: { mode: 'auto' },
        spreadOverrides: { 0: 'force_single' }
      })
      expect(useShelfStore.getState().itemsByComicId['53339'].readingProgress).toMatchObject({
        volumeId: '3089',
        pageIndex: 12
      })
    })
  })
})

function NativeReadingProgressSyncHarness() {
  useNativeReadingProgressSync()
  return null
}
