import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DownloadCenterPage } from '../pages/DownloadCenterPage'
import {
  listNativeDownloadedFiles,
  listNativeDownloadTasks,
  pauseNativeDownloadTask,
  prepareNativeReaderChapterCache
} from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'
import { useDownloadStore } from '../store/downloadStore'
import { useSettingsStore } from '../store/settingsStore'
import type { DownloadTask } from '../types/domain'

vi.mock('../platform/nativeCommands', () => ({
  cancelNativeDownloadTask: vi.fn(),
  clearNativeQueue: vi.fn(),
  exportLocalFile: vi.fn(),
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available),
  listNativeDownloadedFiles: vi.fn(),
  listNativeDownloadTasks: vi.fn(),
  openLocalFile: vi.fn(),
  pauseNativeDownloadTask: vi.fn(),
  prepareNativeReaderChapterCache: vi.fn(),
  preflightNativeDownloadQueue: vi.fn(),
  prioritizeNativeDownloadTask: vi.fn(),
  revealLocalFile: vi.fn(),
  resumeNativeDownloadTask: vi.fn(),
  retryNativeDownloadTask: vi.fn(),
  startNativeDownloadQueue: vi.fn()
}))

const listNativeDownloadTasksMock = vi.mocked(listNativeDownloadTasks)
const listNativeDownloadedFilesMock = vi.mocked(listNativeDownloadedFiles)
const pauseNativeDownloadTaskMock = vi.mocked(pauseNativeDownloadTask)
const prepareNativeReaderChapterCacheMock = vi.mocked(prepareNativeReaderChapterCache)

describe('DownloadCenter reader action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setNavigatorPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })
    useSettingsStore.getState().resetSafetyDefaults()
    useDownloadStore.setState({ tasks: [completedEpubTask()], library: [] })
    useCacheStore.setState({ chaptersById: {}, pagesByChapterId: {} })
    listNativeDownloadTasksMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已同步 1 个下载任务。',
      value: [completedEpubTask()]
    })
    listNativeDownloadedFilesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已同步 0 个资料库项目。',
      value: []
    })
    prepareNativeReaderChapterCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已准备 1 页阅读缓存。',
      value: {
        chapter: {
          id: 'cache-10190-1001',
          comicId: '10190',
          comicTitle: '月刊少女野崎同學',
          volumeId: '1001',
          volumeTitle: '卷 01',
          format: 'epub',
          cacheKind: 'reading_cache',
          sourceTaskId: '10190-1001-epub',
          cacheDir: '/tmp/Kmoe/cache/10190/1001',
          sizeBytes: 1024,
          status: 'ready',
          policy: 'balanced',
          lastAccessedAt: '2026-05-25T00:00:00.000Z',
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z'
        },
        pages: [{
          id: 'page-1',
          chapterCacheId: 'cache-10190-1001',
          comicId: '10190',
          volumeId: '1001',
          pageIndex: 0,
          filePath: '/tmp/Kmoe/cache/10190/1001/001.jpg',
          width: 1000,
          height: 1500,
          sizeBytes: 1024,
          createdAt: '2026-05-25T00:00:00.000Z',
          lastAccessedAt: '2026-05-25T00:00:00.000Z'
        }],
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
  })

  it('opens completed EPUB downloads through the Reader instead of the file opener', async () => {
    renderDownloadCenter()

    expect(await screen.findByRole('button', { name: '阅读' })).toBeInTheDocument()
    expect(screen.getByText('保存到：资料库 / 月刊少女野崎同學 / 月刊少女野崎同學 - 卷 01.epub')).toBeInTheDocument()
    expect(screen.queryByText(/保存到：保存位置/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开文件' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '阅读' }))

    await waitFor(() => {
      expect(prepareNativeReaderChapterCacheMock).toHaveBeenCalledWith(expect.objectContaining({
        archivePath: '/tmp/Kmoe/月刊少女野崎同學/月刊少女野崎同學 - 卷 01.epub',
        comicId: '10190',
        volumeId: '1001',
        format: 'epub'
      }))
    })
    expect(await screen.findByRole('heading', { name: 'Reader Opened' })).toBeInTheDocument()
  })

  it('keeps completed EPUB downloads exportable on iPad without desktop folder wording', async () => {
    setNavigatorPlatform({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 })

    renderDownloadCenter()

    expect(await screen.findByRole('button', { name: '阅读' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出文件' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看位置' })).not.toBeInTheDocument()
  })

  it('shows a recoverable state when a completed task is missing its local path', async () => {
    const taskWithoutPath = completedEpubTask({ localPath: undefined })
    useDownloadStore.setState({ tasks: [taskWithoutPath], library: [] })
    listNativeDownloadTasksMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已同步 1 个下载任务。',
      value: [taskWithoutPath]
    })

    renderDownloadCenter()

    expect(await screen.findByText(/已完成记录缺少本机文件路径/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新同步' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '阅读' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开文件' })).not.toBeInTheDocument()
  })

  it('does not fake task control state when native commands are unavailable', async () => {
    const downloadingTask = completedEpubTask({
      status: 'downloading',
      progress: 42,
      downloadedBytes: 34 * 1024 * 1024,
      localPath: undefined
    })
    useDownloadStore.setState({ tasks: [downloadingTask], library: [] })
    listNativeDownloadTasksMock.mockReturnValue(new Promise(() => {}))
    listNativeDownloadedFilesMock.mockReturnValue(new Promise(() => {}))
    pauseNativeDownloadTaskMock.mockResolvedValue({
      ok: false,
      available: false,
      message: '当前运行环境暂不支持管理下载任务。'
    })

    renderDownloadCenter()

    fireEvent.click(await screen.findByRole('button', { name: /^暂停$/ }))

    expect(pauseNativeDownloadTaskMock).toHaveBeenCalledWith(downloadingTask.id)
    expect(await screen.findByText('暂时无法管理该任务，请稍后重试。')).toBeInTheDocument()
    expect(useDownloadStore.getState().tasks[0]).toMatchObject({
      id: downloadingTask.id,
      status: 'downloading',
      progress: 42
    })
  })
})

function renderDownloadCenter() {
  return render(
    <MemoryRouter initialEntries={['/downloads']}>
      <Routes>
        <Route path="/downloads" element={<DownloadCenterPage />} />
        <Route path="/reader/cache/:chapterCacheId" element={<h1>Reader Opened</h1>} />
      </Routes>
    </MemoryRouter>
  )
}

function setNavigatorPlatform({
  userAgent,
  platform,
  maxTouchPoints
}: {
  userAgent: string
  platform: string
  maxTouchPoints: number
}) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true })
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true })
}

function completedEpubTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: '10190-1001-epub',
    comicId: '10190',
    comicTitle: '月刊少女野崎同學',
    volId: '1001',
    volumeTitle: '卷 01',
    format: 'epub',
    status: 'completed',
    progress: 100,
    downloadedBytes: 81 * 1024 * 1024,
    totalBytes: 81 * 1024 * 1024,
    retryCount: 0,
    localPath: '/tmp/Kmoe/月刊少女野崎同學/月刊少女野崎同學 - 卷 01.epub',
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    ...patch
  }
}
