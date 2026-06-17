import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteLocalReadingData, hasLocalReadingDataForComic } from '../reading/localReadingData'
import { deleteNativeLocalReadingData } from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'
import { useDownloadStore } from '../store/downloadStore'
import { useShelfStore } from '../store/shelfStore'
import type { ChapterCacheRecord } from '../types/cache'
import type { DownloadedFile } from '../types/domain'

vi.mock('../platform/nativeCommands', () => ({
  deleteNativeLocalReadingData: vi.fn(),
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available)
}))

const deleteNativeLocalReadingDataMock = vi.mocked(deleteNativeLocalReadingData)

describe('local reading data deletion helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useCacheStore.setState({ chaptersById: {}, pagesByChapterId: {} })
    useDownloadStore.setState({ tasks: [], library: [] })
    useShelfStore.setState({ itemsByComicId: {}, categories: [] })
  })

  it('syncs cache, library, and shelf state after native deletion succeeds', async () => {
    useCacheStore.getState().upsertChapter(sampleChapter())
    useDownloadStore.setState({ tasks: [sampleTask()], library: [sampleFile()] })
    useShelfStore.getState().addToShelf({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      cached: true,
      cacheStatus: 'reading_cache'
    })
    deleteNativeLocalReadingDataMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'deleted',
      value: {
        cacheStats: {
          totalBytes: 0,
          permanentDownloadBytes: 0,
          readingCacheBytes: 0,
          metadataCacheBytes: 0,
          chapterCount: 0,
          pageCount: 0
        },
        removedChapterIds: ['cache-53339-3089'],
        removedFileIds: ['file-source'],
        removedTaskIds: ['task-source'],
        deletedFileCount: 1,
        missingFileCount: 0,
        tasks: [],
        library: []
      }
    })

    const outcome = await deleteLocalReadingData({ comicIds: ['53339'] })

    expect(outcome.ok).toBe(true)
    expect(deleteNativeLocalReadingDataMock).toHaveBeenCalledWith({
      comicIds: ['53339'],
      includeSourceFiles: true
    })
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-53339-3089')
    expect(useDownloadStore.getState().library).toEqual([])
    expect(useShelfStore.getState().itemsByComicId['53339']).toMatchObject({
      cached: false,
      cacheStatus: 'none'
    })
  })

  it('does not count metadata-only reader archive records as local reading data', () => {
    useDownloadStore.setState({
      tasks: [],
      library: [sampleFile({ localPath: 'Imported metadata only/book.epub', format: 'epub' })]
    })

    expect(hasLocalReadingDataForComic('53339')).toBe(false)
  })
})

function sampleChapter(): ChapterCacheRecord {
  return {
    id: 'cache-53339-3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    cacheKind: 'reading_cache',
    sizeBytes: 2048,
    pageCount: 1,
    status: 'ready',
    lastAccessedAt: '2026-05-24T09:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T09:00:00.000Z'
  }
}

function sampleFile(patch: Partial<DownloadedFile> = {}): DownloadedFile {
  return {
    id: 'file-source',
    taskId: 'task-source',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    localPath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.zip',
    sizeBytes: 2048,
    downloadedAt: '2026-05-24T09:00:00.000Z',
    ...patch
  }
}

function sampleTask() {
  return {
    id: 'task-source',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip' as const,
    status: 'completed' as const,
    progress: 100,
    downloadedBytes: 2048,
    totalBytes: 2048,
    retryCount: 0,
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T09:00:00.000Z'
  }
}
