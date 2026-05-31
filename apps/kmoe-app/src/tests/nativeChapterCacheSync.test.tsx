import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNativeChapterCacheSync, resetNativeChapterCacheSyncForTests } from '../hooks/useNativeChapterCacheSync'
import { listNativeChapterCache } from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'
import type { ChapterCacheRecord } from '../types/cache'

vi.mock('../platform/nativeCommands', () => ({
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available),
  listNativeChapterCache: vi.fn()
}))

const listNativeChapterCacheMock = vi.mocked(listNativeChapterCache)

describe('native chapter cache sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNativeChapterCacheSyncForTests()
    window.localStorage.clear()
    useCacheStore.setState({
      chaptersById: {},
      pagesByChapterId: {}
    })
  })

  it('imports native SQLite chapter cache records into cache store', async () => {
    listNativeChapterCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [chapter({ id: 'cache-native', updatedAt: '2026-05-24T10:00:00.000Z' })]
    })

    render(<NativeChapterCacheSyncHarness />)

    await waitFor(() => {
      expect(useCacheStore.getState().chaptersById['cache-native']).toMatchObject({
        comicId: '53339',
        volumeId: '3089',
        status: 'ready'
      })
    })
  })

  it('keeps newer local records when native snapshot is stale', async () => {
    useCacheStore.getState().upsertChapter(chapter({
      id: 'cache-native',
      status: 'failed',
      updatedAt: '2026-05-24T12:00:00.000Z'
    }))
    listNativeChapterCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [chapter({
        id: 'cache-native',
        status: 'ready',
        updatedAt: '2026-05-24T10:00:00.000Z'
      })]
    })

    render(<NativeChapterCacheSyncHarness />)

    await waitFor(() => {
      expect(listNativeChapterCacheMock).toHaveBeenCalledTimes(1)
      expect(useCacheStore.getState().chaptersById['cache-native'].status).toBe('failed')
    })
  })
})

function NativeChapterCacheSyncHarness() {
  useNativeChapterCacheSync()
  return null
}

function chapter(patch: Partial<ChapterCacheRecord> = {}): ChapterCacheRecord {
  return {
    id: 'cache-native',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    cacheKind: 'reading_cache',
    sizeBytes: 2048,
    pageCount: 180,
    status: 'ready',
    lastAccessedAt: '2026-05-24T10:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T10:00:00.000Z',
    ...patch
  }
}
