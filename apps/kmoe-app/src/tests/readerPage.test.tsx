import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ReaderPage } from '../pages/ReaderPage'
import { useDownloadStore } from '../store/downloadStore'
import { useReadingStore } from '../store/readingStore'
import { useCacheStore } from '../store/cacheStore'
import { useSettingsStore } from '../store/settingsStore'
import {
  clearNativeReadingCache,
  deleteNativeLocalReadingData,
  enqueueNativeDownloadTasks,
  listNativeCachedChapterPages,
  listNativeChapterCache,
  prepareNativeReaderChapterCache,
  readNativeCachedReaderPage,
  repairNativeReaderChapterCache,
  saveNativeReadingProgress
} from '../platform/nativeCommands'

const apiMock = vi.hoisted(() => ({
  getSession: vi.fn()
}))

vi.mock('../hooks/useKmoeApi', () => ({
  useKmoeApi: () => apiMock
}))

vi.mock('../platform/nativeCommands', () => ({
  clearNativeReadingCache: vi.fn(),
  deleteNativeLocalReadingData: vi.fn(),
  enqueueNativeDownloadTasks: vi.fn(),
  isNativeUnavailable: vi.fn((result: { available: boolean }) => !result.available),
  listNativeChapterCache: vi.fn(),
  listNativeCachedChapterPages: vi.fn(),
  prepareNativeReaderChapterCache: vi.fn(),
  readNativeCachedReaderPage: vi.fn(),
  repairNativeReaderChapterCache: vi.fn(),
  saveNativeReadingProgress: vi.fn()
}))

const clearReadingCacheMock = vi.mocked(clearNativeReadingCache)
const deleteLocalReadingDataMock = vi.mocked(deleteNativeLocalReadingData)
const enqueueTasksMock = vi.mocked(enqueueNativeDownloadTasks)
const listChaptersMock = vi.mocked(listNativeChapterCache)
const listPagesMock = vi.mocked(listNativeCachedChapterPages)
const prepareCacheMock = vi.mocked(prepareNativeReaderChapterCache)
const readPageMock = vi.mocked(readNativeCachedReaderPage)
const repairCacheMock = vi.mocked(repairNativeReaderChapterCache)
const saveProgressMock = vi.mocked(saveNativeReadingProgress)

describe('ReaderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    apiMock.getSession.mockResolvedValue({ authenticated: true, mode: 'live' })
    useCacheStore.setState({ chaptersById: {}, pagesByChapterId: {} })
    useDownloadStore.setState({ tasks: [], library: [] })
    useReadingStore.setState({ progressById: {}, history: [] })
    useSettingsStore.getState().resetSafetyDefaults()
    clearReadingCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: {
        totalBytes: 0,
        permanentDownloadBytes: 0,
        readingCacheBytes: 0,
        metadataCacheBytes: 0,
        chapterCount: 0,
        pageCount: 0
      }
    })
    deleteLocalReadingDataMock.mockResolvedValue({
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
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useCacheStore.setState({ chaptersById: {}, pagesByChapterId: {} })
    useDownloadStore.setState({ tasks: [], library: [] })
    useReadingStore.setState({ progressById: {}, history: [] })
    useSettingsStore.getState().resetSafetyDefaults()
  })

  it('opens cached pages through native cache records and saves progress', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    const firstPageImage = await screen.findByAltText('第 1 页')
    expect(firstPageImage).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
    expect(firstPageImage.closest('.reader-transform-wrapper')).toHaveStyle({
      width: '100%',
      height: '100%'
    })
    expect(screen.getByRole('heading', { name: '尖帽子的魔法工房 · 話 089-095' })).toBeInTheDocument()
    expect(readPageMock).toHaveBeenCalledWith('cache-53339-3089', 0)
    expect(readPageMock).toHaveBeenCalledWith('cache-53339-3089', 1)
    await waitFor(() => {
      expect(nativeProgressHistoryEvents()).toContain('open')
    })
    expect(useReadingStore.getState().history.map((entry) => entry.event)).toContain('open')

    showReaderChrome()
    fireEvent.click(screen.getByRole('button', { name: /下一页/ }))

    await waitFor(() => {
      expect(screen.getByAltText('第 2 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AQ==')
    })
    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(1)
    await waitFor(() => {
      expect(nativeProgressHistoryEvents()).toContain('finish')
    })
    expect(useReadingStore.getState().history.map((entry) => entry.event)).toContain('finish')

    fireEvent.keyDown(window, { key: 'PageUp' })
    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(0)
    })
    expect(nativeProgressHistoryEvents()).toContain('page_change')
    openReaderControls()
    expect(screen.getByRole('button', { name: '放大' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '缩小' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '纵向' }))
    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
  })

  it('keeps layout and direction controls in the bottom bar and maps physical page buttons by direction', async () => {
    useSettingsStore.getState().setReaderPageTurnAnimation('curl')
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    expect(document.querySelector('.reader-shell')).toHaveAttribute('data-page-animation', 'curl')
    showReaderChrome()
    const layoutControls = screen.getByRole('group', { name: '页面布局' })
    const directionControls = screen.getByRole('group', { name: '阅读方向' })
    const rotationControls = screen.getByRole('group', { name: '页面旋转' })
    expect(within(layoutControls).getByRole('button', { name: /单页/ })).toHaveAttribute('data-selected', 'true')
    expect(within(directionControls).getByRole('button', { name: 'RTL' })).toHaveAttribute('data-selected', 'true')
    expect(within(rotationControls).getByRole('button', { name: '重置页面旋转' })).toHaveTextContent('0°')

    fireEvent.click(within(rotationControls).getByRole('button', { name: '向右旋转页面' }))

    await waitFor(() => {
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('data-rotation', '90')
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('data-rotated-axis', 'true')
      expect(within(rotationControls).getByRole('button', { name: '重置页面旋转' })).toHaveTextContent('90°')
    })

    fireEvent.click(screen.getByRole('button', { name: /下一页/ }))

    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(1)
    })

    fireEvent.click(within(directionControls).getByRole('button', { name: 'LTR' }))
    fireEvent.click(screen.getByRole('button', { name: /上一页/ }))

    await waitFor(() => {
      const progress = useReadingStore.getState().getProgress('53339', '3089')
      expect(progress?.pageIndex).toBe(0)
      expect(progress?.readingDirection).toBe('ltr')
    })
  })

  it('uses the visible image surface for tap zones and center control toggles', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    const firstPage = await screen.findByAltText('第 1 页')
    fireEvent.click(firstPage, { clientX: 100 })

    await waitFor(() => {
      expect(screen.getByAltText('第 2 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AQ==')
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(1)
    })

    fireEvent.click(screen.getByAltText('第 2 页'), { clientX: 500 })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '目录' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByAltText('第 2 页'), { clientX: 500 })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '目录' })).not.toBeInTheDocument()
    })
  })

  it('keeps zoomed image gestures available for pan instead of page swiping', async () => {
    useReadingStore.getState().upsertProgress({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 0,
      pageCount: 3,
      readingMode: 'paged',
      readingDirection: 'rtl',
      pageLayout: 'single',
      zoom: 1.7,
      crop: { mode: 'none' },
      rotation: 0,
      readAt: '2026-05-24T08:00:00.000Z'
    })
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    const firstPage = await screen.findByAltText('第 1 页')
    openReaderControls()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重置缩放' })).toHaveTextContent('1.7x')
    })

    fireEvent.pointerDown(firstPage, { pointerId: 1, pointerType: 'touch', clientX: 120, clientY: 300 })
    fireEvent.pointerUp(firstPage, { pointerId: 1, pointerType: 'touch', clientX: 210, clientY: 306 })

    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(0)
    expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
  })

  it('respects desktop reader shortcuts without hijacking focused controls', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'End' })
    await waitFor(() => {
      expect(screen.getByAltText('第 3 页')).toHaveAttribute('src', 'data:image/jpeg;base64,Ag==')
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(2)
    })

    fireEvent.keyDown(window, { key: 'Home' })
    await waitFor(() => {
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(0)
    })

    showReaderChrome()
    const progressSlider = screen.getByRole('slider', { name: '阅读进度' })
    progressSlider.focus()
    fireEvent.keyDown(progressSlider, { key: 'End' })
    fireEvent.keyDown(progressSlider, { key: 'PageDown' })
    fireEvent.keyDown(progressSlider, { key: 'ArrowRight' })

    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(0)
    expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
  })

  it('inherits per-comic reader preferences when opening a new cached volume', async () => {
    useReadingStore.getState().upsertProgress({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 4,
      pageCount: 20,
      readingMode: 'webtoon',
      readingDirection: 'ltr',
      pageLayout: 'auto_double',
      zoom: 1.7,
      crop: { mode: 'auto' },
      rotation: 90,
      readAt: '2026-05-24T08:00:00.000Z'
    })
    const nextChapter = sampleChapter({
      id: 'cache-53339-3090',
      volumeId: '3090',
      volumeTitle: '話 096-100'
    })
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter(), nextChapter]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [
        samplePage(0, { chapterCacheId: 'cache-53339-3090', volumeId: '3090' }),
        samplePage(1, { chapterCacheId: 'cache-53339-3090', volumeId: '3090' })
      ]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3090']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    showReaderChrome()
    expect(screen.getByLabelText('当前阅读状态')).toHaveTextContent('Webtoon')
    expect(screen.getAllByText('LTR').length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3090')).toMatchObject({
        pageIndex: 0,
        readingMode: 'webtoon',
        readingDirection: 'ltr',
        pageLayout: 'double',
        zoom: 1.7,
        crop: { mode: 'auto' },
        rotation: 90
      })
    })
    expect(
      saveProgressMock.mock.calls.some(([input]) =>
        input.progress.volumeId === '3090'
        && input.progress.readingMode === 'webtoon'
        && input.progress.readingDirection === 'ltr'
        && input.progress.pageLayout === 'double'
        && input.progress.rotation === 90
        && input.history?.event === 'open'
      )
    ).toBe(true)
  })

  it('applies saved zoom as the initial reader image scale', async () => {
    useReadingStore.getState().upsertProgress({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 0,
      pageCount: 2,
      readingMode: 'paged',
      readingDirection: 'rtl',
      pageLayout: 'single',
      zoom: 1.7,
      crop: { mode: 'none' },
      rotation: 0,
      readAt: '2026-05-24T08:00:00.000Z'
    })
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()

    openReaderControls()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重置缩放' })).toHaveTextContent('1.7x')
    })
  })

  it('supports manual read, unread, and restart actions from reader controls', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()

    openReaderControls()
    fireEvent.click(screen.getByRole('button', { name: '标为已读' }))
    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3089')).toMatchObject({
        pageIndex: 1,
        progressPercent: 100,
        finished: true
      })
    })
    expect(useReadingStore.getState().history.map((entry) => entry.event)).toContain('mark_read')
    expect(nativeProgressHistoryEvents()).toContain('mark_read')
    expect(screen.getByText('已标记为已读。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '标为未读' }))
    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3089')).toMatchObject({
        pageIndex: 1,
        progressPercent: 99,
        finished: false
      })
    })
    expect(useReadingStore.getState().history.map((entry) => entry.event)).toContain('mark_unread')
    expect(nativeProgressHistoryEvents()).toContain('mark_unread')
    expect(screen.getByText('已标记为未读。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '从头重读' }))
    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3089')).toMatchObject({
        pageIndex: 0,
        progressPercent: 0,
        finished: false,
        zoom: 1
      })
    })
    expect(useReadingStore.getState().history.map((entry) => entry.event)).toContain('restart')
    expect(nativeProgressHistoryEvents()).toContain('restart')
    expect(screen.getByText('已从本章开头重读。')).toBeInTheDocument()
  })

  it('deletes the current local reading data and returns to detail', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
          <Route path="/comic/:comicId" element={<h1>Detail Returned</h1>} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()

    openReaderControls()
    fireEvent.click(screen.getByRole('button', { name: '删除本地数据并返回详情' }))

    await waitFor(() => {
      expect(deleteLocalReadingDataMock).toHaveBeenCalledWith({
        comicIds: ['53339'],
        volumeIds: ['3089'],
        chapterIds: ['cache-53339-3089'],
        includeSourceFiles: true
      })
      expect(screen.getByRole('heading', { name: 'Detail Returned' })).toBeInTheDocument()
    })
  })

  it('keeps the reader open when a page fails and allows skipping it', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => {
      if (pageIndex === 0) return { ok: false, available: true, message: 'page corrupt' }
      return { ok: true, available: true, message: 'ok', value: sampleImage(pageIndex) }
    })
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('page corrupt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '跳过本页' }))

    await waitFor(() => {
      expect(screen.getByAltText('第 2 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AQ==')
    })
    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(1)
  })

  it('lets the reader manually merge and split the current spread', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    expect(screen.queryByAltText('第 2 页')).not.toBeInTheDocument()

    openReaderControls()
    fireEvent.click(screen.getByRole('button', { name: '合下页' }))

    await waitFor(() => {
      expect(screen.getByText(/手动合页/)).toBeInTheDocument()
      expect(screen.getByText('第 1-2 / 2 页')).toBeInTheDocument()
      expect(screen.getByAltText('第 2 页')).toBeInTheDocument()
      expect(useReadingStore.getState().getProgress('53339', '3089')?.spreadOverrides).toEqual({ 0: 'force_double' })
      expect(saveProgressMock).toHaveBeenCalledWith(expect.objectContaining({
        progress: expect.objectContaining({ spreadOverridesJson: '{"0":"force_double"}' })
      }))
    })

    fireEvent.click(screen.getByRole('button', { name: '拆当前页' }))

    await waitFor(() => {
      expect(screen.getByText(/手动拆页/)).toBeInTheDocument()
      expect(screen.queryByAltText('第 2 页')).not.toBeInTheDocument()
      expect(useReadingStore.getState().getProgress('53339', '3089')?.spreadOverrides).toEqual({ 0: 'force_single' })
      expect(saveProgressMock).toHaveBeenCalledWith(expect.objectContaining({
        progress: expect.objectContaining({ spreadOverridesJson: '{"0":"force_single"}' })
      }))
    })
  })

  it('restores saved manual spread overrides for the current chapter', async () => {
    useReadingStore.getState().upsertProgress({
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 0,
      pageCount: 2,
      readingMode: 'paged',
      readingDirection: 'rtl',
      pageLayout: 'single',
      spreadOverrides: { 0: 'force_double' },
      readAt: '2026-05-24T08:00:00.000Z'
    })
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/手动合页/)).toBeInTheDocument()
      expect(screen.getByText('第 1-2 / 2 页')).toBeInTheDocument()
      expect(screen.getByAltText('第 2 页')).toBeInTheDocument()
    })
  })

  it('rotates the current reading surface and persists rotation with progress', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toHaveAttribute('data-rotation', '0')

    showReaderChrome()
    const rotationControls = screen.getByRole('group', { name: '页面旋转' })
    fireEvent.click(within(rotationControls).getByRole('button', { name: '向右旋转页面' }))

    await waitFor(() => {
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('data-rotation', '90')
      expect(useReadingStore.getState().getProgress('53339', '3089')?.rotation).toBe(90)
      expect(saveProgressMock).toHaveBeenCalledWith(expect.objectContaining({
        progress: expect.objectContaining({ rotation: 90 })
      }))
    })
  })

  it('applies reader crop controls and persists crop state with progress', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toHaveAttribute('data-crop-mode', 'none')

    openReaderControls()
    fireEvent.click(screen.getByRole('button', { name: '自动裁边' }))

    await waitFor(() => {
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('data-crop-mode', 'auto')
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('data-crop-inset', '2')
      expect(useReadingStore.getState().getProgress('53339', '3089')?.crop).toEqual({ mode: 'auto' })
      expect(saveProgressMock).toHaveBeenCalledWith(expect.objectContaining({
        progress: expect.objectContaining({ cropJson: '{"mode":"auto"}' })
      }))
    })
  })

  it('virtualizes continuous mode so long chapters do not render every page at once', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 40 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: Array.from({ length: 40 }, (_item, index) => samplePage(index))
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    const { container } = render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    openReaderControls()
    fireEvent.click(screen.getByRole('button', { name: '纵向' }))

    const scroller = await waitFor(() => {
      const node = container.querySelector<HTMLElement>('.reader-continuous')
      expect(node).toBeInTheDocument()
      return node!
    })
    expect(container.querySelectorAll('.reader-continuous-page').length).toBeLessThan(40)
    expect(container.querySelector('.reader-continuous-spacer')).toBeInTheDocument()
    expect(container.querySelector('[data-reader-page-index="39"]')).not.toBeInTheDocument()

    Object.defineProperty(scroller, 'scrollTop', { value: 640 * 20, configurable: true })
    await act(async () => {
      fireEvent.scroll(scroller)
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    await waitFor(() => {
      expect(container.querySelector('[data-reader-page-index="20"]')).toBeInTheDocument()
      expect(container.querySelectorAll('.reader-continuous-page').length).toBeLessThan(40)
    })
  })

  it('keeps the current continuous page anchored after viewport size changes', async () => {
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView
    const scrollIntoViewMock = vi.fn()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock
    })
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 40 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: Array.from({ length: 40 }, (_item, index) => samplePage(index))
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    try {
      const { container } = render(
        <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
          <Routes>
            <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
          </Routes>
        </MemoryRouter>
      )

      expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
      openReaderControls()
      fireEvent.click(screen.getByRole('button', { name: '纵向' }))
      const scroller = await waitFor(() => {
        const node = container.querySelector<HTMLElement>('.reader-continuous')
        expect(node).toBeInTheDocument()
        return node!
      })

      Object.defineProperty(scroller, 'scrollTop', { value: 640 * 20, configurable: true })
      await act(async () => {
        fireEvent.scroll(scroller)
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
      })
      await waitFor(() => {
        expect(container.querySelector('[data-reader-page-index="20"]')).toBeInTheDocument()
      })

      scrollIntoViewMock.mockClear()
      Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 390, configurable: true })
      fireEvent(window, new Event('resize'))

      await waitFor(() => {
        expect(scrollIntoViewMock.mock.contexts.some((context) =>
          context instanceof HTMLElement && context.getAttribute('data-reader-page-index') === '20'
        )).toBe(true)
      })
    } finally {
      Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView
      })
    }
  })

  it('flushes the current reading progress when the app is backgrounded', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    showReaderChrome()
    fireEvent.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(1)
    })

    saveProgressMock.mockClear()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(saveProgressMock).toHaveBeenCalledWith(expect.objectContaining({
        progress: expect.objectContaining({ pageIndex: 1 })
      }))
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('can repair a broken reader cache from the trusted native source archive', async () => {
    let repaired = false
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => {
      if (pageIndex === 0 && !repaired) return { ok: false, available: true, message: 'page corrupt' }
      return { ok: true, available: true, message: 'ok', value: sampleImage(pageIndex) }
    })
    repairCacheMock.mockImplementation(async () => {
      repaired = true
      return {
        ok: true,
        available: true,
        message: '已重新准备 2 页阅读缓存。',
        value: {
          chapter: sampleChapter(),
          pages: [samplePage(0), samplePage(1)],
          manifest: sampleManifest(2)
        }
      }
    })
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('page corrupt')).toBeInTheDocument()
    expect(screen.getByText('恢复前检查')).toBeInTheDocument()
    expect(screen.getByText('2 页可读')).toBeInTheDocument()
    expect(screen.getByText('未找到阅读文件，可加入单项下载队列')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新准备缓存' }))

    await waitFor(() => {
      expect(repairCacheMock).toHaveBeenCalledWith('cache-53339-3089')
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
    })
    expect(screen.queryByText('page corrupt')).not.toBeInTheDocument()
  })

  it('can repair a chapter cache that has metadata but no readable pages', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 0 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: []
    })
    repairCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已重新准备 2 页阅读缓存。',
      value: {
        chapter: sampleChapter(),
        pages: [samplePage(0), samplePage(1)],
        manifest: sampleManifest(2)
      }
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect((await screen.findAllByText('章节缓存没有可阅读页面，请重新准备阅读缓存。')).length).toBeGreaterThan(0)
    expect(screen.getByText('恢复前检查')).toBeInTheDocument()
    expect(screen.getByText('没有可阅读页面')).toBeInTheDocument()
    expect(screen.getByText('重新下载 EPUB/源图后自动准备阅读缓存')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新准备缓存' }))

    await waitFor(() => {
      expect(repairCacheMock).toHaveBeenCalledWith('cache-53339-3089')
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
    })
  })

  it('can enqueue a single source ZIP task when cache repair needs a missing original archive', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 0 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: []
    })
    repairCacheMock.mockResolvedValue({
      ok: false,
      available: true,
      message: '本地源图 ZIP 文件不存在或无法访问，请重新下载或重新绑定本机文件。'
    })
    enqueueTasksMock.mockImplementation(async (tasks) => ({
      ok: true,
      available: true,
      message: '已加入 1 个下载任务。',
      value: tasks
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect((await screen.findAllByText('章节缓存没有可阅读页面，请重新准备阅读缓存。')).length).toBeGreaterThan(0)
    expect(screen.getByText('恢复前检查')).toBeInTheDocument()
    expect(screen.getByText('未找到阅读文件，可加入单项下载队列')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新准备缓存' }))

    expect(await screen.findByText('本地源图 ZIP 文件不存在或无法访问，请重新下载或重新绑定本机文件。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '加入阅读文件队列' }))

    await waitFor(() => {
      expect(enqueueTasksMock).toHaveBeenCalledTimes(1)
      expect(enqueueTasksMock.mock.calls[0][0]).toMatchObject([
        {
          id: '53339-3089-source_zip',
          comicId: '53339',
          volId: '3089',
          format: 'source_zip',
          status: 'queued'
        }
      ])
      expect(useDownloadStore.getState().tasks).toHaveLength(1)
      expect(useDownloadStore.getState().tasks[0]).toMatchObject({ format: 'source_zip', status: 'queued' })
    })
    expect(screen.getByText('已加入 1 个源图 ZIP 下载任务，请到下载中心逐项下载。')).toBeInTheDocument()
  })

  it('redirects to login instead of enqueueing a reader recovery download while signed out', async () => {
    apiMock.getSession.mockResolvedValue({ authenticated: false, mode: 'live', error: '当前会话未登录或已过期。' })
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 0 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: []
    })
    repairCacheMock.mockResolvedValue({
      ok: false,
      available: true,
      message: '本地源图 ZIP 文件不存在或无法访问，请重新下载或重新绑定本机文件。'
    })
    enqueueTasksMock.mockImplementation(async (tasks) => ({
      ok: true,
      available: true,
      message: '已加入 1 个下载任务。',
      value: tasks
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
          <Route path="/login" element={<h1>Login Required</h1>} />
        </Routes>
      </MemoryRouter>
    )

    expect((await screen.findAllByText('章节缓存没有可阅读页面，请重新准备阅读缓存。')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '重新准备缓存' }))
    expect(await screen.findByText('本地源图 ZIP 文件不存在或无法访问，请重新下载或重新绑定本机文件。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '加入阅读文件队列' }))

    expect(await screen.findByRole('heading', { name: 'Login Required' })).toBeInTheDocument()
    expect(enqueueTasksMock).not.toHaveBeenCalled()
    expect(useDownloadStore.getState().tasks).toEqual([])
  })

  it('automatically prepares the reader cache when a recovered source ZIP appears in the library', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 0 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: []
    })
    prepareCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已准备 2 页阅读缓存。',
      value: {
        chapter: sampleChapter(),
        pages: [samplePage(0), samplePage(1)],
        manifest: sampleManifest(2)
      }
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect((await screen.findAllByText('章节缓存没有可阅读页面，请重新准备阅读缓存。')).length).toBeGreaterThan(0)

    act(() => {
      useDownloadStore.setState({ library: [sampleDownloadedSourceArchive()] })
    })

    await waitFor(() => {
      expect(prepareCacheMock).toHaveBeenCalledWith({
        archivePath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.zip',
        comicId: '53339',
        comicTitle: '尖帽子的魔法工房',
        volumeId: '3089',
        volumeTitle: '話 089-095',
        sourceTaskId: '53339-3089-source_zip',
        format: 'source_zip',
        policy: 'balanced'
      })
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
    })
    expect(screen.getByText('已从重新下载的源图 ZIP 自动准备阅读缓存。')).toBeInTheDocument()
  })

  it('opens a thumbnail table of contents and jumps to a selected page without loading the full chapter', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    await waitFor(() => {
      expect(readPageMock).toHaveBeenCalledWith('cache-53339-3089', 0)
      expect(readPageMock).toHaveBeenCalledWith('cache-53339-3089', 1)
    })
    expect(readPageMock).not.toHaveBeenCalledWith('cache-53339-3089', 2)

    showReaderChrome()
    fireEvent.click(screen.getByRole('button', { name: '目录' }))

    expect(screen.getByLabelText('目录和页面缩略图')).toBeInTheDocument()
    expect(screen.getByLabelText('章节列表')).toBeInTheDocument()
    expect(screen.getByText('1 章本地缓存')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开章节 話 089-095' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '跳到第 1 页' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '跳到第 3 页' })).toBeInTheDocument()
    await waitFor(() => {
      expect(readPageMock).toHaveBeenCalledWith('cache-53339-3089', 2)
    })

    fireEvent.click(screen.getByRole('button', { name: '跳到第 3 页' }))

    await waitFor(() => {
      expect(readPageMock).toHaveBeenCalledWith('cache-53339-3089', 2)
      expect(screen.getByAltText('第 3 页')).toHaveAttribute('src', 'data:image/jpeg;base64,Ag==')
      expect(screen.getByRole('button', { name: '跳到第 3 页' })).toHaveAttribute('aria-current', 'page')
    })
    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(2)
  })

  it('keeps reader page shortcuts inactive while the page panel is open and closes it with Escape', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    showReaderChrome()
    fireEvent.click(screen.getByRole('button', { name: '目录' }))
    expect(screen.getByLabelText('目录和页面缩略图')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'PageDown' })
    fireEvent.keyDown(window, { key: 'End' })
    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(0)
    expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('目录和页面缩略图')).not.toBeInTheDocument()
    })
    expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
  })

  it('shows a reader help panel and pauses page shortcuts while help is open', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    showReaderChrome()
    fireEvent.click(screen.getByRole('button', { name: '帮助' }))

    expect(screen.getByLabelText('阅读器帮助和快捷键')).toBeInTheDocument()
    expect(screen.getByText('触控手势')).toBeInTheDocument()
    expect(screen.getByText('键盘快捷键')).toBeInTheDocument()
    expect(screen.getByText('Space / PageDown')).toBeInTheDocument()
    expect(screen.getByText('打开本帮助')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'PageDown' })
    fireEvent.keyDown(window, { key: 'End' })
    expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(0)
    expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText('阅读器帮助和快捷键')).not.toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByLabelText('阅读器帮助和快捷键')).toBeInTheDocument()
  })

  it('navigates between locally cached chapters for the same comic', async () => {
    const chapters = [
      sampleChapter({ id: 'cache-53339-3001', volumeId: '3001', volumeTitle: '話 001-006' }),
      sampleChapter(),
      sampleChapter({ id: 'cache-53339-3096', volumeId: '3096', volumeTitle: '話 096-100' })
    ]
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: chapters
    })
    listPagesMock.mockImplementation(async () => ({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    }))
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: '尖帽子的魔法工房 · 話 089-095' })).toBeInTheDocument()
    showReaderChrome()
    expect(screen.getByLabelText('当前阅读状态')).toHaveTextContent('第 2/3 章')
    expect(screen.getByRole('button', { name: '上一章：話 001-006' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '下一章：話 096-100' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '目录' }))
    expect(screen.getByRole('button', { name: '打开章节 話 089-095' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('3 章本地缓存')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开章节 話 096-100' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '尖帽子的魔法工房 · 話 096-100' })).toBeInTheDocument()
      expect(listPagesMock).toHaveBeenCalledWith('cache-53339-3096')
      expect(readPageMock).toHaveBeenCalledWith('cache-53339-3096', 0)
    })
    expect(screen.queryByLabelText('目录和页面缩略图')).not.toBeInTheDocument()
    showReaderChrome()
    expect(screen.getByLabelText('当前阅读状态')).toHaveTextContent('第 3/3 章')
    expect(screen.getByRole('button', { name: '下一章' })).toBeDisabled()

    fireEvent.keyDown(window, { key: '[' })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '尖帽子的魔法工房 · 話 089-095' })).toBeInTheDocument()
    })
  })

  it('prefetches the next local source ZIP chapter when cache policy allows it', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter()]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    prepareCacheMock.mockResolvedValue({
      ok: true,
      available: true,
      message: '已准备 1 页阅读缓存。',
      value: {
        chapter: sampleChapter({
          id: 'cache-53339-3096',
          volumeId: '3096',
          volumeTitle: '話 096-100',
          sourceTaskId: '53339-3096-source_zip',
          cacheDir: '/tmp/Kmoe/ReadingCache/53339/3096/source_zip',
          pageCount: 1
        }),
        pages: [{
          ...samplePage(0),
          id: 'page-next-0',
          chapterCacheId: 'cache-53339-3096',
          volumeId: '3096',
          filePath: '/tmp/Kmoe/ReadingCache/53339/3096/source_zip/00001.jpg'
        }],
        manifest: sampleManifest(1)
      }
    })
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })
    useDownloadStore.setState({
      tasks: [],
      library: [
        sampleDownloadedSourceArchive(),
        sampleDownloadedSourceArchive({
          id: 'file-53339-3096-source_zip',
          taskId: '53339-3096-source_zip',
          volId: '3096',
          volumeTitle: '話 096-100',
          localPath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 096-100.zip'
        })
      ]
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()
    showReaderChrome()

    await waitFor(() => {
      expect(prepareCacheMock).toHaveBeenCalledWith({
        archivePath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 096-100.zip',
        comicId: '53339',
        comicTitle: '尖帽子的魔法工房',
        volumeId: '3096',
        volumeTitle: '話 096-100',
        sourceTaskId: '53339-3096-source_zip',
        format: 'source_zip',
        policy: 'balanced'
      })
      expect(screen.getByText('已预取下一章：話 096-100')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '下一章：話 096-100' })).toBeEnabled()
    })
  })

  it('supports touch swipe paging in paged RTL mode', async () => {
    listChaptersMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [sampleChapter({ pageCount: 3 })]
    })
    listPagesMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: [samplePage(0), samplePage(1), samplePage(2)]
    })
    readPageMock.mockImplementation(async (_chapterCacheId, pageIndex) => ({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleImage(pageIndex)
    }))
    saveProgressMock.mockResolvedValue({
      ok: true,
      available: true,
      message: 'ok',
      value: sampleNativeProgress(0)
    })

    render(
      <MemoryRouter initialEntries={['/reader/cache/cache-53339-3089']}>
        <Routes>
          <Route path="/reader/cache/:chapterCacheId" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    )

    const reader = await screen.findByRole('main')
    expect(await screen.findByAltText('第 1 页')).toBeInTheDocument()

    fireEvent.pointerDown(reader, { pointerId: 1, pointerType: 'touch', clientX: 120, clientY: 300 })
    fireEvent.pointerUp(reader, { pointerId: 1, pointerType: 'touch', clientX: 210, clientY: 306 })

    await waitFor(() => {
      expect(screen.getByAltText('第 2 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AQ==')
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(1)
    })

    fireEvent.pointerDown(reader, { pointerId: 2, pointerType: 'touch', clientX: 210, clientY: 300 })
    fireEvent.pointerUp(reader, { pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 304 })

    await waitFor(() => {
      expect(screen.getByAltText('第 1 页')).toHaveAttribute('src', 'data:image/jpeg;base64,AA==')
      expect(useReadingStore.getState().getProgress('53339', '3089')?.pageIndex).toBe(0)
    })
  })
})

function showReaderChrome() {
  const shell = document.querySelector<HTMLElement>('.reader-shell')
  if (!shell) throw new Error('Reader shell is not mounted')
  if (shell.dataset.controlsVisible === 'true') return
  fireEvent.click(shell, { clientX: Math.max(1, window.innerWidth / 2) })
}

function openReaderControls() {
  showReaderChrome()
  fireEvent.click(screen.getByRole('button', { name: '高级' }))
  expect(screen.getByLabelText('阅读控制')).toBeInTheDocument()
}

function sampleChapter(overrides?: Partial<ReturnType<typeof sampleChapterBase>>) {
  return { ...sampleChapterBase(), ...overrides }
}

function sampleChapterBase() {
  return {
    id: 'cache-53339-3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip' as const,
    cacheKind: 'reading_cache' as const,
    sourceTaskId: 'task-53339',
    cacheDir: '/tmp/Kmoe/ReadingCache/53339/3089/source_zip',
    sizeBytes: 2,
    pageCount: 2,
    status: 'ready' as const,
    policy: 'balanced' as const,
    lastAccessedAt: '100',
    createdAt: '100',
    updatedAt: '100'
  }
}

function samplePage(pageIndex: number, patch: Partial<ReturnType<typeof samplePageBase>> = {}) {
  return { ...samplePageBase(pageIndex), ...patch }
}

function samplePageBase(pageIndex: number) {
  return {
    id: `page-${pageIndex}`,
    chapterCacheId: 'cache-53339-3089',
    comicId: '53339',
    volumeId: '3089',
    pageIndex,
    filePath: `/tmp/Kmoe/ReadingCache/53339/3089/source_zip/${String(pageIndex + 1).padStart(5, '0')}.jpg`,
    sizeBytes: 1,
    createdAt: '100',
    lastAccessedAt: '100'
  }
}

function sampleImage(pageIndex: number) {
  const encoded = pageIndex === 0 ? 'AA==' : pageIndex === 1 ? 'AQ==' : 'Ag=='
  return {
    chapterCacheId: 'cache-53339-3089',
    comicId: '53339',
    volumeId: '3089',
    pageIndex,
    fileName: `${String(pageIndex + 1).padStart(5, '0')}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1,
    dataUrl: `data:image/jpeg;base64,${encoded}`
  }
}

function sampleManifest(pageCount: number) {
  return {
    fileName: 'chapter.cbz',
    pageCount,
    pages: Array.from({ length: pageCount }, (_item, index) => ({
      index,
      archiveIndex: index,
      name: `page${index + 1}.jpg`,
      normalizedPath: `page${index + 1}.jpg`,
      extension: 'jpg',
      compressedSize: 1,
      uncompressedSize: 1
    }))
  }
}

function sampleDownloadedSourceArchive(patch: Partial<ReturnType<typeof sampleDownloadedSourceArchiveBase>> = {}) {
  return { ...sampleDownloadedSourceArchiveBase(), ...patch }
}

function sampleDownloadedSourceArchiveBase() {
  return {
    id: 'file-53339-3089-source_zip',
    taskId: '53339-3089-source_zip',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip' as const,
    localPath: '/Users/example/Downloads/Kmoe/尖帽子的魔法工房/話 089-095.zip',
    sizeBytes: 2048,
    downloadedAt: '2026-05-24T05:30:00.000Z'
  }
}

function nativeProgressHistoryEvents() {
  return saveProgressMock.mock.calls
    .map(([input]) => input.history?.event)
    .filter(Boolean)
}

function sampleNativeProgress(pageIndex: number) {
  return {
    id: '53339:3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    pageIndex,
    pageCount: 2,
    progressPercent: pageIndex === 0 ? 50 : 100,
    lastReadAt: '100',
    finished: pageIndex === 1,
    readingMode: 'paged',
    readingDirection: 'rtl',
    pageLayout: 'single',
    rotation: 0,
    updatedAt: '100'
  }
}
