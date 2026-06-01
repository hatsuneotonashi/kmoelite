import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncReaderCachePolicyAfterOpen } from '../reading/cachePolicyRuntime'
import { useCacheStore } from '../store/cacheStore'
import { clearNativeReadingCache } from '../platform/nativeCommands'
import type { ChapterCacheRecord, PageCacheRecord } from '../types/cache'

vi.mock('../platform/nativeCommands', () => ({
  clearNativeReadingCache: vi.fn(),
  isNativeUnavailable: (result: { available: boolean }) => !result.available
}))

const clearNativeReadingCacheMock = vi.mocked(clearNativeReadingCache)

describe('reader cache policy runtime', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useCacheStore.setState({
      policy: {
        ...useCacheStore.getState().policy,
        mode: 'space_saver',
        keepPreviousChapters: 0,
        keepNextChapters: 0,
        maxRecentChapters: 1,
        maxCacheBytes: undefined
      },
      chaptersById: {},
      pagesByChapterId: {}
    })
    clearNativeReadingCacheMock.mockReset()
    clearNativeReadingCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: {
        totalBytes: 4096,
        permanentDownloadBytes: 4096,
        readingCacheBytes: 0,
        metadataCacheBytes: 0,
        chapterCount: 1,
        pageCount: 0
      }
    })
  })

  it('syncs native cache metadata and clears only policy candidates after opening a chapter', async () => {
    const chapters = [
      sampleChapter('cache-001', '001', '話 001', '2026-05-24T08:00:00.000Z'),
      sampleChapter('cache-002', '002', '話 002', '2026-05-24T09:00:00.000Z'),
      sampleChapter('cache-003', '003', '話 003', '2026-05-24T10:00:00.000Z'),
      sampleChapter('downloaded-002', '002', '話 002', '2026-05-24T07:00:00.000Z', 'permanent_download')
    ]

    const result = await syncReaderCachePolicyAfterOpen({
      chapters,
      activeChapter: chapters[1],
      pages: [samplePage('cache-002', 0)]
    })

    expect(result).toMatchObject({
      ok: true,
      removedIds: ['cache-001', 'cache-003'],
      nativeAvailable: true
    })
    expect(clearNativeReadingCacheMock).toHaveBeenCalledWith(['cache-001', 'cache-003'])
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-001')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-002')
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-003')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('downloaded-002')
    expect(useCacheStore.getState().pagesByChapterId['cache-002']).toHaveLength(1)
  })

  it('does not drop local cache records when native cleanup fails', async () => {
    clearNativeReadingCacheMock.mockResolvedValue({
      ok: false,
      available: true,
      message: 'disk permission denied'
    })
    const chapters = [
      sampleChapter('cache-001', '001', '話 001', '2026-05-24T08:00:00.000Z'),
      sampleChapter('cache-002', '002', '話 002', '2026-05-24T09:00:00.000Z')
    ]

    const result = await syncReaderCachePolicyAfterOpen({
      chapters,
      activeChapter: chapters[1],
      pages: [samplePage('cache-002', 0)]
    })

    expect(result).toMatchObject({
      ok: false,
      removedIds: []
    })
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-001')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-002')
  })

  it('combines policy cleanup with hard storage-pressure cleanup after opening a chapter', async () => {
    useCacheStore.setState({
      policy: {
        ...useCacheStore.getState().policy,
        mode: 'balanced',
        keepPreviousChapters: 1,
        keepNextChapters: 1,
        maxRecentChapters: 3,
        maxCacheBytes: 250
      }
    })
    const chapters = [
      sampleChapter('cache-001', '001', '話 001', '2026-05-24T08:00:00.000Z', 'reading_cache', 100),
      sampleChapter('cache-002', '002', '話 002', '2026-05-24T08:10:00.000Z', 'reading_cache', 100),
      sampleChapter('cache-003', '003', '話 003', '2026-05-24T08:20:00.000Z', 'reading_cache', 100),
      sampleChapter('cache-004', '004', '話 004', '2026-05-24T08:30:00.000Z', 'reading_cache', 100),
      sampleChapter('cache-005', '005', '話 005', '2026-05-24T08:40:00.000Z', 'reading_cache', 100),
      sampleChapter('downloaded-003', '003', '話 003', '2026-05-24T07:00:00.000Z', 'permanent_download', 900)
    ]

    const result = await syncReaderCachePolicyAfterOpen({
      chapters,
      activeChapter: chapters[2],
      pages: [samplePage('cache-003', 0)]
    })

    expect(result).toMatchObject({
      ok: true,
      removedIds: ['cache-001', 'cache-005', 'cache-002']
    })
    expect(clearNativeReadingCacheMock).toHaveBeenCalledWith(['cache-001', 'cache-005', 'cache-002'])
    expect(result.message).toContain('滚动窗口 2 个')
    expect(result.message).toContain('容量 1 个')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-003')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('downloaded-003')
  })

  it('clears browser preview cache records when native cleanup is unavailable', async () => {
    clearNativeReadingCacheMock.mockResolvedValue({
      ok: false,
      available: false,
      message: 'native unavailable'
    })
    const chapters = [
      sampleChapter('cache-001', '001', '話 001', '2026-05-24T08:00:00.000Z'),
      sampleChapter('cache-002', '002', '話 002', '2026-05-24T09:00:00.000Z')
    ]

    const result = await syncReaderCachePolicyAfterOpen({
      chapters,
      activeChapter: chapters[1],
      pages: [samplePage('cache-002', 0)]
    })

    expect(result).toMatchObject({
      ok: true,
      nativeAvailable: false,
      removedIds: ['cache-001']
    })
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-001')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-002')
  })
})

function sampleChapter(
  id: string,
  volumeId: string,
  volumeTitle: string,
  lastAccessedAt: string,
  cacheKind: ChapterCacheRecord['cacheKind'] = 'reading_cache',
  sizeBytes = 1024
): ChapterCacheRecord {
  return {
    id,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId,
    volumeTitle,
    format: 'source_zip',
    cacheKind,
    cacheDir: `/tmp/Kmoe/ReadingCache/53339/${volumeId}/source_zip`,
    sizeBytes,
    pageCount: 1,
    status: 'ready',
    policy: 'space_saver',
    lastAccessedAt,
    createdAt: lastAccessedAt,
    updatedAt: lastAccessedAt
  }
}

function samplePage(chapterCacheId: string, pageIndex: number): PageCacheRecord {
  return {
    id: `${chapterCacheId}:${pageIndex}`,
    chapterCacheId,
    comicId: '53339',
    volumeId: '002',
    pageIndex,
    filePath: `/tmp/Kmoe/ReadingCache/53339/002/source_zip/${String(pageIndex + 1).padStart(5, '0')}.jpg`,
    sizeBytes: 512,
    createdAt: '2026-05-24T09:00:00.000Z',
    lastAccessedAt: '2026-05-24T09:00:00.000Z'
  }
}
