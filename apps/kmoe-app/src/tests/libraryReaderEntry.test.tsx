import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LibraryPage } from '../pages/LibraryPage'
import { deleteNativeLocalReadingData, listNativeDownloadedFiles, prepareNativeReaderChapterCache } from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'
import { useDownloadStore } from '../store/downloadStore'
import type { ChapterCacheRecord, PageCacheRecord } from '../types/cache'
import type { DownloadedFile } from '../types/domain'

vi.mock('../platform/nativeCommands', () => ({
  deleteNativeLocalReadingData: vi.fn(async () => ({
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
  })),
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available),
  linkNativeDownloadedFile: vi.fn(async () => ({ ok: false, available: false, message: 'unavailable' })),
  listNativeDownloadedFiles: vi.fn(),
  openLocalFile: vi.fn(async () => ({ ok: true, available: true, message: 'opened' })),
  prepareNativeReaderChapterCache: vi.fn(),
  revealLocalFile: vi.fn(async () => ({ ok: true, available: true, message: 'revealed' }))
}))

const listNativeDownloadedFilesMock = vi.mocked(listNativeDownloadedFiles)
const prepareReaderCacheMock = vi.mocked(prepareNativeReaderChapterCache)
const deleteLocalReadingDataMock = vi.mocked(deleteNativeLocalReadingData)

describe('Library reader entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useDownloadStore.setState({ tasks: [], library: [] })
    useCacheStore.setState({ chaptersById: {}, pagesByChapterId: {} })
    listNativeDownloadedFilesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sourceArchive()]
    })
  })

  it('opens an existing ready reader cache without preparing again', async () => {
    useCacheStore.getState().upsertChapter(chapter({ id: 'cache-ready' }))

    renderLibrary()

    expect(await screen.findByText('尖帽子的魔法工房')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /继续阅读/ }))

    expect(await screen.findByRole('heading', { name: 'Reader Opened' })).toBeInTheDocument()
    expect(prepareReaderCacheMock).not.toHaveBeenCalled()
  })

  it('prepares source ZIP cache, stores native pages, and opens Reader', async () => {
    prepareReaderCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已准备 1 页阅读缓存。',
      value: {
        chapter: chapter({ id: 'cache-prepared' }),
        pages: [page({ chapterCacheId: 'cache-prepared' })],
        manifest: {
          fileName: 'book.zip',
          pageCount: 1,
          pages: [{
            index: 0,
            archiveIndex: 0,
            name: '001.jpg',
            normalizedPath: '001.jpg',
            extension: 'jpg',
            compressedSize: 1,
            uncompressedSize: 1
          }]
        }
      }
    })

    renderLibrary()

    expect(await screen.findByText('尖帽子的魔法工房')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /准备阅读/ }))

    await waitFor(() => {
      expect(prepareReaderCacheMock).toHaveBeenCalledWith({
        archivePath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.zip',
        comicId: '53339',
        comicTitle: '尖帽子的魔法工房',
        volumeId: '3089',
        volumeTitle: '話 089-095',
        sourceTaskId: 'task-source',
        format: 'source_zip',
        policy: 'balanced'
      })
      expect(useCacheStore.getState().chaptersById['cache-prepared']).toMatchObject({ status: 'ready' })
      expect(useCacheStore.getState().pagesByChapterId['cache-prepared']).toHaveLength(1)
    })
    expect(await screen.findByRole('heading', { name: 'Reader Opened' })).toBeInTheDocument()
  })

  it('prepares EPUB cache, stores native pages, and opens Reader', async () => {
    listNativeDownloadedFilesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sourceArchive({
        id: 'file-epub',
        taskId: 'task-epub',
        format: 'epub',
        localPath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.epub'
      })]
    })
    prepareReaderCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已准备 1 页阅读缓存。',
      value: {
        chapter: chapter({ id: 'cache-prepared-epub', format: 'epub' }),
        pages: [page({ chapterCacheId: 'cache-prepared-epub' })],
        manifest: {
          fileName: 'book.epub',
          pageCount: 1,
          pages: [{
            index: 0,
            archiveIndex: 0,
            name: '001.jpg',
            normalizedPath: '001.jpg',
            extension: 'jpg',
            compressedSize: 1,
            uncompressedSize: 1
          }]
        }
      }
    })

    renderLibrary()

    expect(await screen.findByText('尖帽子的魔法工房')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /准备阅读/ }))

    await waitFor(() => {
      expect(prepareReaderCacheMock).toHaveBeenCalledWith(expect.objectContaining({
        archivePath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.epub',
        format: 'epub'
      }))
      expect(useCacheStore.getState().chaptersById['cache-prepared-epub']).toMatchObject({ status: 'ready', format: 'epub' })
    })
    expect(await screen.findByRole('heading', { name: 'Reader Opened' })).toBeInTheDocument()
  })

  it('deletes reader-capable local library data through native storage', async () => {
    renderLibrary()

    expect(await screen.findByText('尖帽子的魔法工房')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除本地数据' }))

    await waitFor(() => {
      expect(deleteLocalReadingDataMock).toHaveBeenCalledWith({
        comicIds: ['53339'],
        volumeIds: ['3089'],
        includeSourceFiles: true
      })
      expect(useDownloadStore.getState().library).toEqual([])
      expect(screen.getByText(/已删除本地阅读数据/)).toBeInTheDocument()
    })
  })
})

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/reader/cache/:chapterCacheId" element={<h1>Reader Opened</h1>} />
      </Routes>
    </MemoryRouter>
  )
}

function sourceArchive(patch: Partial<DownloadedFile> = {}): DownloadedFile {
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

function chapter(patch: Partial<ChapterCacheRecord> = {}): ChapterCacheRecord & { cacheDir: string } {
  return {
    id: 'cache-53339-3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    cacheKind: 'reading_cache',
    cacheDir: '/tmp/Kmoe/ReadingCache/53339/3089/source_zip',
    sizeBytes: 2048,
    pageCount: 1,
    status: 'ready',
    lastAccessedAt: '2026-05-24T09:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T09:00:00.000Z',
    ...patch
  }
}

function page(patch: Partial<PageCacheRecord> = {}): PageCacheRecord & { filePath: string } {
  return {
    id: 'cache-prepared:0',
    chapterCacheId: 'cache-prepared',
    comicId: '53339',
    volumeId: '3089',
    pageIndex: 0,
    filePath: '/tmp/Kmoe/ReadingCache/53339/3089/001.jpg',
    sizeBytes: 1,
    createdAt: '2026-05-24T09:00:00.000Z',
    lastAccessedAt: '2026-05-24T09:00:00.000Z',
    ...patch
  }
}
