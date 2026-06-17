import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../pages/SettingsPage'
import { useCacheStore } from '../store/cacheStore'
import { useSettingsStore } from '../store/settingsStore'
import type { ChapterCacheRecord } from '../types/cache'

const nativeMocks = vi.hoisted(() => ({
  clearNativeReadingCache: vi.fn(),
  deleteNativeLocalReadingData: vi.fn(),
  getNativeAppConfig: vi.fn(),
  getNativeCacheStats: vi.fn(),
  getNativeDownloadDir: vi.fn(),
  setNativeDownloadDir: vi.fn()
}))

vi.mock('../platform/nativeCommands', () => ({
  clearNativeReadingCache: nativeMocks.clearNativeReadingCache,
  deleteNativeLocalReadingData: nativeMocks.deleteNativeLocalReadingData,
  getNativeAppConfig: nativeMocks.getNativeAppConfig,
  getNativeCacheStats: nativeMocks.getNativeCacheStats,
  getNativeDownloadDir: nativeMocks.getNativeDownloadDir,
  setNativeDownloadDir: nativeMocks.setNativeDownloadDir,
  isNativeUnavailable: (result: { available: boolean }) => !result.available
}))

describe('Settings native config sync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useSettingsStore.getState().resetSafetyDefaults()
    useCacheStore.setState({
      policy: {
        ...useCacheStore.getState().policy,
        mode: 'balanced',
        keepPreviousChapters: 1,
        keepNextChapters: 1,
        maxRecentChapters: 3,
        maxCacheBytes: undefined
      },
      chaptersById: {},
      pagesByChapterId: {}
    })
    nativeMocks.clearNativeReadingCache.mockReset()
    nativeMocks.deleteNativeLocalReadingData.mockReset()
    nativeMocks.getNativeAppConfig.mockReset()
    nativeMocks.getNativeCacheStats.mockReset()
    nativeMocks.getNativeDownloadDir.mockReset()
    nativeMocks.setNativeDownloadDir.mockReset()
    nativeMocks.getNativeAppConfig.mockResolvedValue({
      ok: false,
      available: false,
      message: 'Native config is available only inside Tauri.'
    })
    nativeMocks.getNativeCacheStats.mockResolvedValue({
      ok: false,
      available: false,
      message: 'Native cache stats are available only inside Tauri.'
    })
    nativeMocks.getNativeDownloadDir.mockResolvedValue({
      ok: false,
      available: false,
      message: 'Native download directory is available only inside Tauri.'
    })
    nativeMocks.setNativeDownloadDir.mockResolvedValue({
      ok: false,
      available: false,
      message: 'Saving native download directory requires Tauri.'
    })
    nativeMocks.clearNativeReadingCache.mockResolvedValue({
      ok: false,
      available: false,
      message: 'Native cache cleanup is available only inside Tauri.'
    })
    nativeMocks.deleteNativeLocalReadingData.mockResolvedValue({
      ok: false,
      available: false,
      message: 'Native local reading data deletion is available only inside Tauri.'
    })
  })

  it('shows mobile app-private downloads as read-only', async () => {
    const restoreUserAgent = setNavigatorGetter('userAgent', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')
    const restorePlatform = setNavigatorGetter('platform', 'MacIntel')
    const restoreTouchPoints = setNavigatorGetter('maxTouchPoints', 5)
    nativeMocks.getNativeAppConfig.mockResolvedValue({
      ok: true,
      available: true,
      value: {
        concurrency: 1,
        downloadDirectory: '/app/container/Library/Application Support/moe.kzo.client/Downloads/Kmoe'
      },
      message: 'Loaded native config.'
    })

    try {
      render(<SettingsPage />)

      await waitFor(() => {
        expect(screen.getByText('App 私有保存区')).toBeInTheDocument()
      })
      expect(screen.queryByLabelText('保存位置')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
      expect(screen.getByText(/下载先保存在 App 内部/)).toBeInTheDocument()
    } finally {
      restoreUserAgent()
      restorePlatform()
      restoreTouchPoints()
    }
  })

  it('loads a native download directory without runtime mode switches', async () => {
    nativeMocks.getNativeAppConfig.mockResolvedValue({
      ok: true,
      available: true,
      value: {
        concurrency: 1,
        downloadDirectory: '/Users/example/Downloads/Kmoe'
      },
      message: 'Loaded native config.'
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('保存位置')).toHaveValue('/Users/example/Downloads/Kmoe')
    })
    expect(useSettingsStore.getState()).toMatchObject({
      downloadDirectory: '/Users/example/Downloads/Kmoe',
      concurrency: 1
    })
    expect(screen.queryByText('维护动作开关')).not.toBeInTheDocument()
    expect(screen.queryByText(/Apple Music/)).not.toBeInTheDocument()
    expect(screen.getByText('队列方式')).toBeInTheDocument()
    expect(screen.getByLabelText('作品详情随封面变色')).toBeChecked()
    expect(screen.getAllByText('阅读缓存').length).toBeGreaterThan(0)
  })

  it('lets the user disable cover-color detail pages without changing global mode', async () => {
    render(<SettingsPage />)

    const toggle = screen.getByLabelText('作品详情随封面变色')
    expect(toggle).toBeChecked()

    fireEvent.click(toggle)

    expect(useSettingsStore.getState().colorizeDetailPage).toBe(false)
    expect(screen.getByText('跟随系统外观')).toBeInTheDocument()
  })

  it('lets the user choose the reader page turn animation', async () => {
    render(<SettingsPage />)

    expect(screen.getByRole('button', { name: /顺滑滑页/ })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /纸页翻折/ }))

    expect(useSettingsStore.getState().readerPageTurnAnimation).toBe('curl')
    expect(screen.getByRole('button', { name: /纸页翻折/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /纸页翻折/ })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: /顺滑滑页/ })).not.toHaveAttribute('data-active')
  })

  it('lets the user choose whether Reader hides the iOS status bar', async () => {
    render(<SettingsPage />)

    expect(screen.getByRole('button', { name: /隐藏状态栏/ })).toHaveAttribute('aria-pressed', 'true')
    expect(useSettingsStore.getState().showReaderStatusBar).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /显示状态栏/ }))

    expect(useSettingsStore.getState().showReaderStatusBar).toBe(true)
    expect(screen.getByRole('button', { name: /显示状态栏/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows local reader cache stats, updates policy, and does not fake device deletion in browser preview', async () => {
    useCacheStore.getState().upsertChapter(sampleChapter('reading-old', 'reading_cache', 2048, { lastAccessedAt: '2026-05-24T08:00:00.000Z' }))
    useCacheStore.getState().upsertChapter(sampleChapter('downloaded', 'permanent_download', 4096))

    render(<SettingsPage />)

    expect(screen.getAllByText('2.0 KB').length).toBeGreaterThan(0)
    expect(screen.getByText('4.0 KB')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /省空间/ }))
    expect(useCacheStore.getState().policy).toMatchObject({
      mode: 'space_saver',
      keepPreviousChapters: 0,
      keepNextChapters: 0,
      maxRecentChapters: 1
    })

    fireEvent.click(screen.getByRole('button', { name: /删除全部本地阅读数据/ }))

    await waitFor(() => {
      expect(screen.getByText(/请在 kmoelite 客户端中删除本地阅读数据/)).toBeInTheDocument()
    })
    expect(useCacheStore.getState().chaptersById).toHaveProperty('downloaded')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('reading-old')
  })

  it('deletes all native local reading data and removes stale non-ready local cache rows', async () => {
    useCacheStore.getState().upsertChapter(sampleChapter('reading-ready', 'reading_cache', 2048, {
      status: 'ready',
      lastAccessedAt: '2026-05-24T08:00:00.000Z'
    }))
    useCacheStore.getState().upsertChapter(sampleChapter('reading-failed', 'reading_cache', 0, {
      status: 'failed',
      lastAccessedAt: '2026-05-24T09:00:00.000Z'
    }))
    useCacheStore.getState().upsertChapter(sampleChapter('downloaded', 'permanent_download', 4096))
    nativeMocks.getNativeCacheStats.mockResolvedValue({
      ok: true,
      available: true,
      value: {
        totalBytes: 6144,
        permanentDownloadBytes: 4096,
        readingCacheBytes: 2048,
        metadataCacheBytes: 0,
        chapterCount: 3,
        pageCount: 2
      },
      message: '缓存占用已更新。'
    })
    nativeMocks.deleteNativeLocalReadingData.mockResolvedValue({
      ok: true,
      available: true,
      value: {
        cacheStats: {
          totalBytes: 4096,
          permanentDownloadBytes: 4096,
          readingCacheBytes: 0,
          metadataCacheBytes: 0,
          chapterCount: 1,
          pageCount: 0
        },
        removedChapterIds: ['reading-ready', 'reading-failed'],
        removedFileIds: ['file-source'],
        removedTaskIds: ['task-source'],
        deletedFileCount: 1,
        missingFileCount: 0,
        tasks: [],
        library: []
      },
      message: '已删除 2 个阅读缓存和 1 个本地阅读文件记录。'
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /删除全部本地阅读数据/ }))

    await waitFor(() => {
      expect(nativeMocks.deleteNativeLocalReadingData).toHaveBeenCalledWith({
        includeSourceFiles: true
      })
      expect(screen.getByText(/已删除全部本地阅读数据/)).toBeInTheDocument()
    })
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('reading-ready')
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('reading-failed')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('downloaded')
  })

  it('clears only policy cleanup candidate cache ids when native cleanup is available', async () => {
    useCacheStore.getState().upsertChapter(sampleChapter('cache-001', 'reading_cache', 1024, {
      volumeId: '001',
      volumeTitle: '話 001',
      lastAccessedAt: '2026-05-24T08:00:00.000Z'
    }))
    useCacheStore.getState().upsertChapter(sampleChapter('cache-002', 'reading_cache', 1024, {
      volumeId: '002',
      volumeTitle: '話 002',
      lastAccessedAt: '2026-05-24T09:00:00.000Z'
    }))
    useCacheStore.getState().upsertChapter(sampleChapter('cache-003', 'reading_cache', 1024, {
      volumeId: '003',
      volumeTitle: '話 003',
      lastAccessedAt: '2026-05-24T10:00:00.000Z'
    }))
    useCacheStore.getState().upsertChapter(sampleChapter('cache-004', 'reading_cache', 1024, {
      volumeId: '004',
      volumeTitle: '話 004',
      lastAccessedAt: '2026-05-24T11:00:00.000Z'
    }))
    useCacheStore.getState().upsertChapter(sampleChapter('downloaded', 'permanent_download', 4096, {
      volumeId: '001',
      volumeTitle: '話 001',
      lastAccessedAt: '2026-05-24T07:00:00.000Z'
    }))
    nativeMocks.clearNativeReadingCache.mockResolvedValue({
      ok: true,
      available: true,
      value: {
        totalBytes: 5120,
        permanentDownloadBytes: 4096,
        readingCacheBytes: 1024,
        metadataCacheBytes: 0,
        chapterCount: 2,
        pageCount: 0
      },
      message: '阅读缓存已清理。'
    })

    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: /按滚动窗口清理 1 项/ }))

    await waitFor(() => {
      expect(nativeMocks.clearNativeReadingCache).toHaveBeenCalledWith(['cache-001'])
      expect(screen.getByText(/已按滚动窗口清理 1 个本机阅读缓存/)).toBeInTheDocument()
    })
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-001')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-002')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-003')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-004')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('downloaded')
  })

  it('updates the cache size limit and clears storage-pressure candidates safely', async () => {
    for (const index of [1, 2, 3, 4, 5]) {
      useCacheStore.getState().upsertChapter(sampleChapter(`cache-00${index}`, 'reading_cache', 100, {
        volumeId: `00${index}`,
        volumeTitle: `話 00${index}`,
        lastAccessedAt: `2026-05-24T08:${String(index).padStart(2, '0')}:00.000Z`
      }))
    }
    useCacheStore.getState().upsertChapter(sampleChapter('downloaded', 'permanent_download', 900, {
      volumeId: '001',
      volumeTitle: '話 001',
      lastAccessedAt: '2026-05-24T07:00:00.000Z'
    }))
    nativeMocks.clearNativeReadingCache.mockResolvedValue({
      ok: true,
      available: true,
      value: {
        totalBytes: 1100,
        permanentDownloadBytes: 900,
        readingCacheBytes: 200,
        metadataCacheBytes: 0,
        chapterCount: 3,
        pageCount: 0
      },
      message: '阅读缓存已清理。'
    })

    render(<SettingsPage />)

    fireEvent.change(screen.getByLabelText('上限 MB'), { target: { value: '0.00025' } })

    await waitFor(() => {
      expect(useCacheStore.getState().policy.maxCacheBytes).toBe(262)
      expect(screen.getByRole('button', { name: /按容量清理 3 项/ })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /按容量清理 3 项/ }))

    await waitFor(() => {
      expect(nativeMocks.clearNativeReadingCache).toHaveBeenCalledWith(['cache-001', 'cache-002', 'cache-003'])
      expect(screen.getByText(/已按容量上限清理 3 个本机阅读缓存/)).toBeInTheDocument()
    })
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-001')
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-002')
    expect(useCacheStore.getState().chaptersById).not.toHaveProperty('cache-003')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-004')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('cache-005')
    expect(useCacheStore.getState().chaptersById).toHaveProperty('downloaded')
  })
})

function sampleChapter(
  id: string,
  cacheKind: ChapterCacheRecord['cacheKind'],
  sizeBytes: number,
  patch: Partial<ChapterCacheRecord> = {}
): ChapterCacheRecord {
  return {
    id,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: id,
    volumeTitle: '話 089-095',
    format: 'source_zip',
    cacheKind,
    sizeBytes,
    pageCount: 2,
    status: 'ready',
    lastAccessedAt: '2026-05-24T08:00:00.000Z',
    createdAt: '2026-05-24T08:00:00.000Z',
    updatedAt: '2026-05-24T08:00:00.000Z',
    ...patch
  }
}

function setNavigatorGetter(key: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, key)
  Object.defineProperty(window.navigator, key, {
    configurable: true,
    get: () => value
  })
  return () => {
    if (descriptor) {
      Object.defineProperty(window.navigator, key, descriptor)
    } else {
      delete (window.navigator as unknown as Record<string, unknown>)[key]
    }
  }
}
