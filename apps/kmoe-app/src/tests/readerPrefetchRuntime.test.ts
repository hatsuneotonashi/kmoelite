import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  planNextReaderChapterPrefetch,
  prefetchNextReaderChapter
} from '../reading/readerPrefetchRuntime'
import { useCacheStore } from '../store/cacheStore'
import { prepareNativeReaderChapterCache } from '../platform/nativeCommands'
import type { ChapterCacheRecord, PageCacheRecord } from '../types/cache'
import type { DownloadedFile } from '../types/domain'

vi.mock('../platform/nativeCommands', () => ({
  prepareNativeReaderChapterCache: vi.fn(),
  isNativeUnavailable: (result: { available: boolean }) => !result.available
}))

const prepareNativeReaderChapterCacheMock = vi.mocked(prepareNativeReaderChapterCache)

describe('reader prefetch runtime', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useCacheStore.setState({
      policy: {
        ...useCacheStore.getState().policy,
        mode: 'balanced',
        keepPreviousChapters: 1,
        keepNextChapters: 1,
        maxRecentChapters: 3,
        wifiPrefetch: true,
        lowPowerReducePrefetch: true
      },
      chaptersById: {},
      pagesByChapterId: {}
    })
    prepareNativeReaderChapterCacheMock.mockReset()
    prepareNativeReaderChapterCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: {
        chapter: sampleChapter('cache-002', '002', '話 002'),
        pages: [samplePage('cache-002', '002', 0)],
        manifest: {
          fileName: '002.cbz',
          pageCount: 1,
          pages: []
        }
      }
    })
  })

  it('plans and prepares the next local source archive when policy allows prefetch', async () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const library = [
      sampleArchive('file-001', '001', '話 001'),
      sampleArchive('file-002', '002', '話 002')
    ]

    expect(planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library
    }).sourceArchive?.id).toBe('file-002')

    const result = await prefetchNextReaderChapter({
      currentChapter: current,
      chapters: [current],
      library
    })

    expect(result).toMatchObject({
      status: 'prefetched',
      message: '已预取下一章：話 002'
    })
    expect(prepareNativeReaderChapterCacheMock).toHaveBeenCalledWith({
      archivePath: '/Users/example/Downloads/Kmoe/話 002.zip',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '002',
      volumeTitle: '話 002',
      sourceTaskId: 'task-002',
      format: 'source_zip',
      policy: 'balanced'
    })
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-002')
    expect(useCacheStore.getState().pagesByChapterId['cache-002']).toHaveLength(1)
  })

  it('skips next chapter prefetch for space saver policy', () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const plan = planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library: [
        sampleArchive('file-001', '001', '話 001'),
        sampleArchive('file-002', '002', '話 002')
      ],
      policy: {
        ...useCacheStore.getState().policy,
        mode: 'space_saver',
        keepPreviousChapters: 0,
        keepNextChapters: 0,
        maxRecentChapters: 1
      }
    })

    expect(plan).toEqual({ skipReason: 'policy_disabled' })
    expect(prepareNativeReaderChapterCacheMock).not.toHaveBeenCalled()
  })

  it('allows prefetch when a custom policy keeps a next chapter window', () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const plan = planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library: [
        sampleArchive('file-001', '001', '話 001'),
        sampleArchive('file-002', '002', '話 002')
      ],
      policy: {
        ...useCacheStore.getState().policy,
        mode: 'space_saver',
        keepPreviousChapters: 1,
        keepNextChapters: 1,
        maxRecentChapters: 1
      }
    })

    expect(plan.sourceArchive?.id).toBe('file-002')
  })

  it('skips next chapter prefetch when save-data is enabled and low-power reduction is on', () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const plan = planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library: [
        sampleArchive('file-001', '001', '話 001'),
        sampleArchive('file-002', '002', '話 002')
      ],
      runtime: {
        network: { saveData: true, type: 'wifi', effectiveType: '4g' }
      }
    })

    expect(plan).toEqual({ skipReason: 'data_saver' })
    expect(prepareNativeReaderChapterCacheMock).not.toHaveBeenCalled()
  })

  it('skips next chapter prefetch on explicit low battery runtime context', () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const plan = planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library: [
        sampleArchive('file-001', '001', '話 001'),
        sampleArchive('file-002', '002', '話 002')
      ],
      runtime: {
        power: { batteryLevel: 0.12, charging: false }
      }
    })

    expect(plan).toEqual({ skipReason: 'low_power' })
  })

  it('skips next chapter prefetch on explicit metered or slow connections', () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const library = [
      sampleArchive('file-001', '001', '話 001'),
      sampleArchive('file-002', '002', '話 002')
    ]

    expect(planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library,
      runtime: {
        network: { type: 'cellular', effectiveType: '4g' }
      }
    })).toEqual({ skipReason: 'metered_network' })

    expect(planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library,
      runtime: {
        network: { type: 'unknown', effectiveType: '2g' }
      }
    })).toEqual({ skipReason: 'slow_network' })
  })

  it('allows next chapter prefetch when runtime network details are unavailable', () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const plan = planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current],
      library: [
        sampleArchive('file-001', '001', '話 001'),
        sampleArchive('file-002', '002', '話 002')
      ],
      runtime: {}
    })

    expect(plan.sourceArchive?.id).toBe('file-002')
  })

  it('skips next chapter prefetch when the next chapter already has a ready cache', () => {
    const current = sampleChapter('cache-001', '001', '話 001')
    const readyNext = sampleChapter('cache-002', '002', '話 002')

    expect(planNextReaderChapterPrefetch({
      currentChapter: current,
      chapters: [current, readyNext],
      library: [
        sampleArchive('file-001', '001', '話 001'),
        sampleArchive('file-002', '002', '話 002')
      ]
    })).toEqual({ skipReason: 'already_cached' })
  })

  it('reports failure without registering cache rows when native prepare fails', async () => {
    prepareNativeReaderChapterCacheMock.mockResolvedValue({
      ok: false,
      available: true,
      message: 'archive corrupt'
    })
    const current = sampleChapter('cache-001', '001', '話 001')

    const result = await prefetchNextReaderChapter({
      currentChapter: current,
      chapters: [current],
      library: [
        sampleArchive('file-001', '001', '話 001'),
        sampleArchive('file-002', '002', '話 002')
      ]
    })

    expect(result).toEqual({
      status: 'failed',
      message: '自动预取下一章失败：archive corrupt'
    })
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-002')
  })
})

function sampleChapter(id: string, volumeId: string, volumeTitle: string): ChapterCacheRecord & { cacheDir: string } {
  return {
    id,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId,
    volumeTitle,
    format: 'source_zip',
    cacheKind: 'reading_cache',
    sourceTaskId: `task-${volumeId}`,
    cacheDir: `/tmp/Kmoe/ReadingCache/53339/${volumeId}/source_zip`,
    sizeBytes: 1024,
    pageCount: 1,
    status: 'ready',
    policy: 'balanced',
    lastAccessedAt: `2026-05-24T09:0${volumeId === '001' ? '1' : '2'}:00.000Z`,
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T09:00:00.000Z'
  }
}

function samplePage(chapterCacheId: string, volumeId: string, pageIndex: number): PageCacheRecord & { filePath: string } {
  return {
    id: `${chapterCacheId}:${pageIndex}`,
    chapterCacheId,
    comicId: '53339',
    volumeId,
    pageIndex,
    filePath: `/tmp/Kmoe/ReadingCache/53339/${volumeId}/source_zip/${String(pageIndex + 1).padStart(5, '0')}.jpg`,
    sizeBytes: 512,
    createdAt: '2026-05-24T09:00:00.000Z',
    lastAccessedAt: '2026-05-24T09:00:00.000Z'
  }
}

function sampleArchive(id: string, volumeId: string, volumeTitle: string): DownloadedFile {
  return {
    id,
    taskId: `task-${volumeId}`,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: volumeId,
    volumeTitle,
    format: 'source_zip',
    localPath: `/Users/example/Downloads/Kmoe/${volumeTitle}.zip`,
    sizeBytes: 1024,
    downloadedAt: '2026-05-24T09:00:00.000Z'
  }
}
