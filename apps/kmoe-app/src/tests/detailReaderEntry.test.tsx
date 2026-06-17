import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetailPage } from '../pages/DetailPage'
import {
  deleteNativeLocalReadingData,
  enqueueNativeDownloadTasks,
  listNativeDownloadedFiles,
  listNativeDownloadTasks,
  nativeFetchCoverImage,
  prepareNativeReaderChapterCache,
  preflightNativeDownloadQueue,
  prioritizeNativeDownloadTask,
  startNativeDownloadQueue
} from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'
import { useDownloadStore } from '../store/downloadStore'
import type { ChapterCacheRecord, PageCacheRecord } from '../types/cache'
import type { ComicDetail, DownloadTask, DownloadedFile } from '../types/domain'

const mocks = vi.hoisted(() => ({
  api: {
    getComicDetail: vi.fn(),
    getSession: vi.fn(),
    createDownloadTasks: vi.fn()
  }
}))

vi.mock('../hooks/useKmoeApi', () => ({
  useKmoeApi: () => mocks.api
}))

vi.mock('../platform/nativeCommands', () => ({
  deleteNativeLocalReadingData: vi.fn(),
  enqueueNativeDownloadTasks: vi.fn(),
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available),
  listNativeDownloadedFiles: vi.fn(),
  listNativeDownloadTasks: vi.fn(),
  nativeFetchCoverImage: vi.fn(),
  prepareNativeReaderChapterCache: vi.fn(),
  preflightNativeDownloadQueue: vi.fn(),
  prioritizeNativeDownloadTask: vi.fn(),
  startNativeDownloadQueue: vi.fn()
}))

const enqueueNativeDownloadTasksMock = vi.mocked(enqueueNativeDownloadTasks)
const deleteNativeLocalReadingDataMock = vi.mocked(deleteNativeLocalReadingData)
const listNativeDownloadedFilesMock = vi.mocked(listNativeDownloadedFiles)
const listNativeDownloadTasksMock = vi.mocked(listNativeDownloadTasks)
const nativeFetchCoverImageMock = vi.mocked(nativeFetchCoverImage)
const prepareReaderCacheMock = vi.mocked(prepareNativeReaderChapterCache)
const preflightNativeDownloadQueueMock = vi.mocked(preflightNativeDownloadQueue)
const prioritizeNativeDownloadTaskMock = vi.mocked(prioritizeNativeDownloadTask)
const startNativeDownloadQueueMock = vi.mocked(startNativeDownloadQueue)

let nativeTasks: DownloadTask[]
let nativeLibrary: DownloadedFile[]

describe('Detail reader entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setNavigatorPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      platform: 'MacIntel',
      maxTouchPoints: 0
    })
    useDownloadStore.setState({ tasks: [], library: [] })
    useCacheStore.setState({ chaptersById: {}, pagesByChapterId: {} })
    nativeTasks = []
    nativeLibrary = []
    nativeFetchCoverImageMock.mockResolvedValue({
      ok: false,
      available: false,
      message: 'Native cover image recovery is available only inside Tauri.'
    })
    mocks.api.getComicDetail.mockResolvedValue(sampleComic())
    mocks.api.getSession.mockResolvedValue({ authenticated: true, mode: 'live', user: { warnings: [] } })
    mocks.api.createDownloadTasks.mockImplementation(async ({ format }) => [
      sourceZipTask({ id: `53339-3089-${format}`, format })
    ])
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
        removedChapterIds: [],
        removedFileIds: ['file-source'],
        removedTaskIds: ['task-source'],
        deletedFileCount: 1,
        missingFileCount: 0,
        tasks: [],
        library: []
      }
    })
    listNativeDownloadedFilesMock.mockImplementation(async () => ({
      ok: true,
      available: true,
      message: `已同步 ${nativeLibrary.length} 个资料库项目。`,
      value: nativeLibrary
    }))
    listNativeDownloadTasksMock.mockImplementation(async () => ({
      ok: true,
      available: true,
      message: `已同步 ${nativeTasks.length} 个下载任务。`,
      value: nativeTasks
    }))
    enqueueNativeDownloadTasksMock.mockImplementation(async (tasks) => {
      nativeTasks = tasks
      return {
        ok: true,
        available: true,
        message: `已加入 ${tasks.length} 个下载任务。`,
        value: tasks
      }
    })
    prioritizeNativeDownloadTaskMock.mockImplementation(async (id) => {
      const target = nativeTasks.find((task) => task.id === id)
      if (!target) {
        return { ok: false, available: true, message: 'task not found' }
      }
      const prioritized = { ...target, createdAt: '!priority', updatedAt: '200' }
      nativeTasks = nativeTasks.map((task) => (task.id === id ? prioritized : task))
      return {
        ok: true,
        available: true,
        message: '已把任务设为下一项。',
        value: prioritized
      }
    })
    preflightNativeDownloadQueueMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '队列已准备好。',
      value: {
        ok: true,
        mode: 'real_download',
        queuedCount: 1,
        activeCount: 0,
        checks: [
          { id: 'download-dir', label: '下载目录', status: 'pass', detail: '目录可用。' },
          { id: 'queued-task', label: '等待任务', status: 'pass', detail: '有等待任务。' }
        ]
      }
    })
    startNativeDownloadQueueMock.mockImplementation(async () => {
      nativeTasks = nativeTasks.map((task) => ({
        ...task,
        status: 'completed',
        progress: 100,
        downloadedBytes: task.totalBytes ?? 2048,
        localPath: `/Users/example/Downloads/Kmoe/尖帽子的魔法工房/${task.volumeTitle}.${task.format === 'epub' ? 'epub' : 'zip'}`
      }))
      nativeLibrary = nativeTasks
        .filter((task) => task.status === 'completed')
        .map((task) => sourceArchive({
          id: `file-${task.id}`,
          taskId: task.id,
          format: task.format,
          localPath: task.localPath ?? '',
          sizeBytes: task.totalBytes ?? 2048
        }))
      return {
        ok: true,
        available: true,
        message: '下载队列已启动。'
      }
    })
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
  })

  it('shows an explicit back action on the detail page', async () => {
    renderDetail()

    expect(await screen.findByText('尖帽子的魔法工房')).toBeInTheDocument()
    expect(document.querySelector('.detail-back-button')).toHaveTextContent('返回')
  })

  it('shows a themed loading page with the route preview before detail data resolves', async () => {
    mocks.api.getComicDetail.mockReturnValue(new Promise(() => {}))

    renderDetail({
      pathname: '/comic/53339',
      state: {
        comicPreview: {
          title: '圣洁少女的秘密情事',
          coverUrl: 'https://kmimg.mxomo.com/cover/secret.jpg'
        }
      }
    })

    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '圣洁少女的秘密情事' })).toBeInTheDocument()
    expect(screen.getByAltText('圣洁少女的秘密情事')).toHaveAttribute('src', 'https://kmimg.mxomo.com/cover/secret.jpg')
  })

  it('downloads one local EPUB task, prepares cache, and opens Reader when reading without a local archive', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /获取 EPUB/ })[0])

    await waitFor(() => {
      expect(mocks.api.createDownloadTasks).toHaveBeenCalledWith({
        comic: expect.objectContaining({ id: '53339' }),
        selectedVolIds: ['3089'],
        format: 'epub'
      })
      expect(enqueueNativeDownloadTasksMock).toHaveBeenCalledWith([expect.objectContaining({
        comicId: '53339',
        volId: '3089',
        format: 'epub',
        status: 'queued'
      })])
      expect(preflightNativeDownloadQueueMock).toHaveBeenCalled()
      expect(startNativeDownloadQueueMock).toHaveBeenCalled()
      expect(useDownloadStore.getState().tasks).toHaveLength(1)
      expect(prepareReaderCacheMock).toHaveBeenCalledWith(expect.objectContaining({
        archivePath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.epub',
        comicId: '53339',
        volumeId: '3089',
        format: 'epub'
      }))
    })
    expect(await screen.findByRole('heading', { name: 'Reader Opened' })).toBeInTheDocument()
  })

  it('keeps source ZIP available when it is explicitly selected', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /离线下载/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '源图 ZIP' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 話 089-095' }))
    fireEvent.click(screen.getAllByRole('button', { name: /加入队列/ })[0])

    await waitFor(() => {
      expect(mocks.api.createDownloadTasks).toHaveBeenCalledWith({
        comic: expect.objectContaining({ id: '53339' }),
        selectedVolIds: ['3089'],
        format: 'source_zip'
      })
      expect(enqueueNativeDownloadTasksMock).toHaveBeenCalledWith([expect.objectContaining({
        comicId: '53339',
        volId: '3089',
        format: 'source_zip',
        status: 'queued'
      })])
    })
  })

  it('starts the foreground native queue after iPad offline-download enqueue', async () => {
    setNavigatorPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'MacIntel',
      maxTouchPoints: 5
    })

    renderDetail()

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /离线下载/ })[0])
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 話 089-095' }))
    const startButton = screen.getAllByRole('button', { name: /加入并开始/ })[0] as HTMLButtonElement
    expect(startButton.disabled).toBe(false)
    fireEvent.click(startButton)

    await waitFor(() => {
      expect(enqueueNativeDownloadTasksMock).toHaveBeenCalledWith([expect.objectContaining({
        comicId: '53339',
        volId: '3089',
        format: 'epub',
        status: 'queued'
      })])
      expect(preflightNativeDownloadQueueMock).toHaveBeenCalled()
      expect(startNativeDownloadQueueMock).toHaveBeenCalled()
      expect(useDownloadStore.getState().tasks[0]).toMatchObject({
        comicId: '53339',
        volId: '3089',
        status: 'completed'
      })
    })
    expect(screen.getByText(/下载队列已处理完成|下载完成/)).toBeInTheDocument()
  })

  it('blocks queueing reader downloads while logged out', async () => {
    mocks.api.getSession.mockResolvedValue({ authenticated: false, mode: 'live', error: '未登录' })

    renderDetail()

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /获取 EPUB/ })[0])

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Login Page' })).toBeInTheDocument()
    })
    expect(mocks.api.createDownloadTasks).not.toHaveBeenCalled()
    expect(enqueueNativeDownloadTasksMock).not.toHaveBeenCalled()
  })

  it('downloads and prepares one local EPUB task when source ZIP is unavailable but EPUB can be downloaded', async () => {
    mocks.api.getComicDetail.mockResolvedValue(sampleComic({
      sizes: {
        mobi: 10,
        epub: 11,
        sourceZip: undefined
      },
      availableFormats: ['mobi', 'epub']
    }))
    mocks.api.createDownloadTasks.mockResolvedValue([sourceZipTask({ format: 'epub', id: '53339-3089-epub' })])

    renderDetail()

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /获取 EPUB/ })[0])

    await waitFor(() => {
      expect(mocks.api.createDownloadTasks).toHaveBeenCalledWith({
        comic: expect.objectContaining({ id: '53339' }),
        selectedVolIds: ['3089'],
        format: 'epub'
      })
      expect(enqueueNativeDownloadTasksMock).toHaveBeenCalledWith([expect.objectContaining({
        comicId: '53339',
        volId: '3089',
        format: 'epub',
        status: 'queued'
      })])
      expect(startNativeDownloadQueueMock).toHaveBeenCalled()
      expect(prepareReaderCacheMock).toHaveBeenCalledWith(expect.objectContaining({
        archivePath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.epub',
        comicId: '53339',
        volumeId: '3089',
        format: 'epub'
      }))
    })
    expect(await screen.findByRole('heading', { name: 'Reader Opened' })).toBeInTheDocument()
  })

  it('shows the task failure reason when automatic reader download fails', async () => {
    startNativeDownloadQueueMock.mockImplementation(async () => {
      nativeTasks = nativeTasks.map((task) => ({
        ...task,
        status: 'failed',
        progress: 0,
        downloadedBytes: 0,
        errorMessage: '登录会话已失效，请重新登录后重试。'
      }))
      return {
        ok: true,
        available: true,
        message: '下载队列已启动。'
      }
    })

    renderDetail()

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /获取 EPUB/ })[0])

    expect((await screen.findAllByText(/登录会话已失效/)).length).toBeGreaterThan(0)
    expect(prepareReaderCacheMock).not.toHaveBeenCalled()
  })

  it('syncs native source ZIP records on detail entry before preparing Reader cache', async () => {
    listNativeDownloadedFilesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已同步 1 个资料库项目。',
      value: [sourceArchive()]
    })

    renderDetail()

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房' })).toBeInTheDocument()
    const readButton = await screen.findAllByRole('button', { name: /准备阅读/ })
    fireEvent.click(readButton[0])

    await waitFor(() => {
      expect(listNativeDownloadedFilesMock).toHaveBeenCalled()
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

  it('deletes local reading data for a directory entry without faking success', async () => {
    nativeLibrary = [sourceArchive()]

    renderDetail()

    expect(await screen.findByText('尖帽子的魔法工房')).toBeInTheDocument()
    fireEvent.click((await screen.findAllByRole('button', { name: '删除本地数据' }))[0])

    await waitFor(() => {
      expect(deleteNativeLocalReadingDataMock).toHaveBeenCalledWith({
        comicIds: ['53339'],
        volumeIds: ['3089'],
        chapterIds: undefined,
        includeSourceFiles: true
      })
      expect(screen.getByText(/再次阅读会重新获取/)).toBeInTheDocument()
    })
  })
})

function renderDetail(initialEntry: string | { pathname: string; state?: unknown } = '/comic/53339') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/comic/:comicId" element={<DetailPage />} />
          <Route path="/reader/cache/:chapterCacheId" element={<h1>Reader Opened</h1>} />
          <Route path="/login" element={<h1>Login Page</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function setNavigatorPlatform(input: { userAgent: string; platform: string; maxTouchPoints: number }) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: input.userAgent,
    configurable: true
  })
  Object.defineProperty(window.navigator, 'platform', {
    value: input.platform,
    configurable: true
  })
  Object.defineProperty(window.navigator, 'maxTouchPoints', {
    value: input.maxTouchPoints,
    configurable: true
  })
}

function sampleComic(optionPatch: Partial<ComicDetail['downloadOptions'][number]> = {}): ComicDetail {
  return {
    id: '53339',
    url: '/c/53339.htm',
    title: '尖帽子的魔法工房',
    aliases: [],
    authors: ['白浜鴎'],
    status: '连载',
    region: '日本',
    language: '繁体中文',
    categories: ['魔幻'],
    tags: [],
    rating: '9.7',
    heat: '1000',
    description: '测试详情',
    downloadOptions: [{
      id: '53339-3089',
      comicId: '53339',
      volId: '3089',
      title: '話 089-095',
      displayTitle: '話 089-095',
      kind: 'chapter_group',
      pageCount: 180,
      docPageCount: 180,
      sizes: {
        mobi: 10,
        epub: 11,
        sourceZip: 12
      },
      availableFormats: ['mobi', 'epub', 'source_zip'],
      restrictions: [],
      ...optionPatch
    }]
  }
}

function sourceZipTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: '53339-3089-source_zip',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    retryCount: 0,
    createdAt: '2026-05-24T10:00:00.000Z',
    updatedAt: '2026-05-24T10:00:00.000Z',
    ...patch
  }
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
