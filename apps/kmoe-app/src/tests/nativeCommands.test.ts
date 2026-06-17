import { invoke } from '@tauri-apps/api/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearNativeReadingCache,
  clearNativeQueue,
  deleteNativeLocalReadingData,
  enqueueNativeDownloadTasks,
  getNativeAppConfig,
  getNativeCacheStats,
  getNativeReadingProgress,
  importNativeMigrationSnapshot,
  isNativeUnavailable,
  linkNativeDownloadedFile,
  listNativeCachedChapterPages,
  listNativeChapterCache,
  listNativeDownloadTasks,
  listNativeReadingProgress,
  listNativeReaderArchivePages,
  listNativeShelfItems,
  listNativeShelves,
  nativeFetchKmoeCatalog,
  nativeFetchBookData,
  nativeFetchCoverImage,
  openLocalFile,
  prepareNativeReaderChapterCache,
  preflightNativeDownloadQueue,
  prioritizeNativeDownloadTask,
  readNativeCachedReaderPage,
  repairNativeReaderChapterCache,
  revealLocalFile,
  removeNativeShelfItems,
  saveNativeChapterCache,
  saveNativeMigrationSnapshot,
  saveNativeReadingProgress,
  setNativeIosStatusBarHidden,
  startNativeDownloadQueue,
  upsertNativeShelf,
  upsertNativeShelfItem
} from '../platform/nativeCommands'
import { invokeNative, invokeOptional } from '../platform/tauri'
import type { DownloadTask, DownloadedFile } from '../types/domain'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

const invokeMock = vi.mocked(invoke)

describe('native command bridge', () => {
  afterEach(() => {
    vi.useRealTimers()
    invokeMock.mockReset()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    Reflect.deleteProperty(window, 'KmoeliteAndroidFile')
  })

  it('reports unavailable when not running inside Tauri', async () => {
    const result = await clearNativeQueue()

    expect(result).toEqual({ ok: false, available: false, message: '当前运行环境暂不支持清理下载队列。' })
    expect(isNativeUnavailable(result)).toBe(true)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('treats successful void commands as success', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce(undefined)

    const result = await startNativeDownloadQueue('~/Downloads/Kmoe')

    expect(result).toEqual({ ok: true, available: true, value: undefined, message: '下载队列已启动。' })
    expect(invokeMock).toHaveBeenCalledWith('start_download_queue', {
      downloadDir: '~/Downloads/Kmoe'
    })
  })

  it('turns Tauri command errors into safe UI messages', async () => {
    enableTauriRuntime()
    invokeMock.mockRejectedValueOnce('native session is not authenticated')

    const result = await startNativeDownloadQueue('~/Downloads/Kmoe')

    expect(result).toEqual({ ok: false, available: true, message: 'native session is not authenticated' })
    expect(isNativeUnavailable(result)).toBe(false)
  })

  it('preserves empty native arrays as successful values', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce([])

    const result = await listNativeDownloadTasks()

    expect(result).toEqual({ ok: true, available: true, value: [], message: '已同步 0 个下载任务。' })
  })

  it('can request a native queue snapshot without restart recovery', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce([])

    const result = await listNativeDownloadTasks({ recoverInterrupted: false })

    expect(result).toEqual({ ok: true, available: true, value: [], message: '已同步 0 个下载任务。' })
    expect(invokeMock).toHaveBeenCalledWith('list_download_tasks', { recoverInterrupted: false })
  })

  it('routes native queue preflight without starting authorization or download', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce({
      ok: false,
      mode: 'real_download',
      queuedCount: 1,
      activeCount: 0,
      downloadDirectory: '/Users/example/Downloads/Kmoe',
      firstTaskId: '53339-3089-mobi',
      firstTaskLabel: '尖帽子的魔法工房 / 話 089-095 / MOBI',
      checks: [
        { id: 'native-env', label: '原生下载能力', status: 'pass', detail: '原生桌面进程可以执行真实单项下载。' }
      ]
    })

    const result = await preflightNativeDownloadQueue('/Users/example/Downloads/Kmoe')

    expect(result.ok).toBe(true)
    expect(result.available).toBe(true)
    expect(result.value?.ok).toBe(false)
    expect(result.message).toBe('队列还有需要处理的问题。')
    expect(invokeMock).toHaveBeenCalledWith('preflight_download_queue', {
      downloadDir: '/Users/example/Downloads/Kmoe'
    })
  })

  it('reports the accepted native enqueue count', async () => {
    enableTauriRuntime()
    const tasks = [sampleTask()]
    invokeMock.mockResolvedValueOnce(tasks)

    const result = await enqueueNativeDownloadTasks(tasks)

    expect(result).toEqual({ ok: true, available: true, value: tasks, message: '已加入 1 个下载任务。' })
    expect(invokeMock).toHaveBeenCalledWith('enqueue_download_tasks', { tasks })
  })

  it('can prioritize a queued native download task', async () => {
    enableTauriRuntime()
    const task = sampleTask()
    invokeMock.mockResolvedValueOnce({ ...task, createdAt: '!priority', updatedAt: '200' })

    const result = await prioritizeNativeDownloadTask(task.id)

    expect(result.ok).toBe(true)
    expect(result.available).toBe(true)
    expect(result.value).toMatchObject({ id: task.id, createdAt: '!priority' })
    expect(invokeMock).toHaveBeenCalledWith('prioritize_download_task', { id: task.id })
  })

  it('loads native app config with the frontend downloadDirectory field', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce({
      concurrency: 1,
      downloadDirectory: '/Users/example/Downloads/Kmoe'
    })

    const result = await getNativeAppConfig()

    expect(result).toEqual({
      ok: true,
      available: true,
      value: {
        concurrency: 1,
        downloadDirectory: '/Users/example/Downloads/Kmoe'
      },
      message: '已读取应用设置。'
    })
    expect(invokeMock).toHaveBeenCalledWith('get_app_config', undefined)
  })

  it('falls back to the Android system share bridge after native path validation succeeds', async () => {
    enableTauriRuntime()
    const shareFile = vi.fn(() => 'ok')
    Object.defineProperty(window, 'KmoeliteAndroidFile', {
      value: { shareFile },
      configurable: true
    })
    invokeMock.mockRejectedValueOnce('当前平台不支持系统分享导出，请保留 App 私有下载目录中的文件。')

    const result = await openLocalFile('/data/data/moe.kzo.client/files/Downloads/Kmoe/book.epub')

    expect(result).toEqual({
      ok: true,
      available: true,
      value: '/data/data/moe.kzo.client/files/Downloads/Kmoe/book.epub',
      message: '已打开系统分享，请选择保存到“文件”或其他目标。'
    })
    expect(shareFile).toHaveBeenCalledWith('/data/data/moe.kzo.client/files/Downloads/Kmoe/book.epub')
  })

  it('does not call the Android share bridge for unrelated native errors', async () => {
    enableTauriRuntime()
    const shareFile = vi.fn(() => 'ok')
    Object.defineProperty(window, 'KmoeliteAndroidFile', {
      value: { shareFile },
      configurable: true
    })
    invokeMock.mockRejectedValueOnce('failed to resolve open target')

    const result = await revealLocalFile('/data/data/moe.kzo.client/files/Downloads/Kmoe/book.epub')

    expect(result).toEqual({ ok: false, available: true, message: 'failed to resolve open target' })
    expect(shareFile).not.toHaveBeenCalled()
  })

  it('keeps invokeNative and invokeOptional compatible for existing callers', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce('book-data')

    await expect(invokeNative<string>('kmoe_fetch_book_data', { path: '/book_data.php?h=abc' })).resolves.toEqual({
      available: true,
      ok: true,
      value: 'book-data'
    })

    invokeMock.mockResolvedValueOnce('book-data')
    await expect(invokeOptional<string>('kmoe_fetch_book_data', { path: '/book_data.php?h=abc' })).resolves.toBe('book-data')
  })

  it('uses user-facing copy for generic native command timeouts', async () => {
    vi.useFakeTimers()
    enableTauriRuntime()
    invokeMock.mockReturnValueOnce(new Promise(() => undefined))

    const result = invokeNative<string>('save_app_config', {}, { timeoutMs: 10 })
    await vi.advanceTimersByTimeAsync(10)

    await expect(result).resolves.toEqual({
      available: true,
      ok: false,
      error: '操作超时，请稍后重试。'
    })
  })

  it('routes native book data fetch through the shared bridge', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce('volcount=0')

    const result = await nativeFetchBookData('/book_data.php?h=abc')

    expect(result).toEqual({ ok: true, available: true, value: 'volcount=0', message: '下载选项已更新。' })
  })

  it('times out native Kmoe website commands instead of leaving catalog loading forever', async () => {
    vi.useFakeTimers()
    enableTauriRuntime()
    invokeMock.mockReturnValueOnce(new Promise(() => undefined))

    const result = nativeFetchKmoeCatalog({ page: 1 })
    await vi.advanceTimersByTimeAsync(45_000)

    await expect(result).resolves.toEqual({
      ok: false,
      available: true,
      message: 'Kmoe 网站请求超时，请检查网络后重试。'
    })
  })

  it('routes native cover image fetch through the shared bridge', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce('data:image/jpeg;base64,AA==')

    const result = await nativeFetchCoverImage('https://kmimg.mxomo.com/cover/a.jpg!cover_l?sign=sample')

    expect(result).toEqual({
      ok: true,
      available: true,
      value: 'data:image/jpeg;base64,AA==',
      message: '封面图片已读取。'
    })
    expect(invokeMock).toHaveBeenCalledWith('kmoe_fetch_cover_image', {
      url: 'https://kmimg.mxomo.com/cover/a.jpg!cover_l?sign=sample'
    })
  })

  it('routes migration snapshot saving through a native command', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce('/Users/example/Downloads/Kmoe/Snapshots/kmoe-client-snapshot.json')

    const result = await saveNativeMigrationSnapshot('{"version":1}')

    expect(result).toEqual({
      ok: true,
      available: true,
      value: '/Users/example/Downloads/Kmoe/Snapshots/kmoe-client-snapshot.json',
      message: '已保存导出文件：/Users/example/Downloads/Kmoe/Snapshots/kmoe-client-snapshot.json'
    })
    expect(invokeMock).toHaveBeenCalledWith('save_migration_snapshot', { snapshotJson: '{"version":1}' })
  })

  it('routes migration snapshot import through native storage', async () => {
    enableTauriRuntime()
    const tasks = [sampleTask()]
    invokeMock.mockResolvedValueOnce({ importedTasks: 1, importedLibrary: 0, tasks, library: [] })

    const result = await importNativeMigrationSnapshot('{"version":1}')

    expect(result).toEqual({
      ok: true,
      available: true,
      value: { importedTasks: 1, importedLibrary: 0, tasks, library: [] },
      message: '已导入 1 个任务和 0 个资料库项目。'
    })
    expect(invokeMock).toHaveBeenCalledWith('import_migration_snapshot', { snapshotJson: '{"version":1}' })
  })

  it('routes local library file relinking through native validation', async () => {
    enableTauriRuntime()
    const linked = { ...sampleFile(), localPath: '/Users/example/Downloads/Kmoe/book.mobi', sizeBytes: 2048 }
    invokeMock.mockResolvedValueOnce([linked])

    const result = await linkNativeDownloadedFile(sampleFile(), '/Users/example/Downloads/Kmoe/book.mobi')

    expect(result).toEqual({
      ok: true,
      available: true,
      value: [linked],
      message: '已绑定本机文件，并同步 1 个资料库项目。'
    })
    expect(invokeMock).toHaveBeenCalledWith('link_downloaded_file', {
      file: sampleFile(),
      localPath: '/Users/example/Downloads/Kmoe/book.mobi'
    })
  })

  it('routes native shelf commands through stable Tauri command names', async () => {
    enableTauriRuntime()
    const shelf = sampleShelf()
    const item = sampleShelfItem()
    invokeMock.mockResolvedValueOnce([shelf])
    invokeMock.mockResolvedValueOnce([shelf])
    invokeMock.mockResolvedValueOnce([item])
    invokeMock.mockResolvedValueOnce([item])
    invokeMock.mockResolvedValueOnce([])

    await expect(listNativeShelves()).resolves.toEqual({
      ok: true,
      available: true,
      value: [shelf],
      message: '已同步 1 个书架分类。'
    })
    await expect(upsertNativeShelf(shelf)).resolves.toMatchObject({ ok: true, available: true, value: [shelf] })
    await expect(listNativeShelfItems()).resolves.toMatchObject({ ok: true, available: true, value: [item] })
    await expect(upsertNativeShelfItem(item)).resolves.toMatchObject({ ok: true, available: true, value: [item] })
    await expect(removeNativeShelfItems(['53339'])).resolves.toMatchObject({ ok: true, available: true, value: [] })

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'list_shelves', undefined)
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'upsert_shelf', { shelf })
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'list_shelf_items', undefined)
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'upsert_shelf_item', { item })
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'remove_shelf_items', { comicIds: ['53339'] })
  })

  it('routes native reading progress commands with history payloads', async () => {
    enableTauriRuntime()
    const progress = sampleProgress()
    const input = { progress, history: sampleHistory() }
    invokeMock.mockResolvedValueOnce(progress)
    invokeMock.mockResolvedValueOnce([progress])
    invokeMock.mockResolvedValueOnce(progress)

    await expect(getNativeReadingProgress('53339', '3089')).resolves.toEqual({
      ok: true,
      available: true,
      value: progress,
      message: '阅读进度已读取。'
    })
    await expect(listNativeReadingProgress()).resolves.toMatchObject({
      ok: true,
      available: true,
      value: [progress],
      message: '已同步 1 条阅读进度。'
    })
    await expect(saveNativeReadingProgress(input)).resolves.toMatchObject({
      ok: true,
      available: true,
      value: progress,
      message: '阅读进度已保存。'
    })

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_reading_progress', { comicId: '53339', volumeId: '3089' })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'list_reading_progress', undefined)
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'save_reading_progress', { input })
  })

  it('routes native chapter cache commands without touching permanent downloads', async () => {
    enableTauriRuntime()
    const chapter = sampleChapterCache()
    const page = samplePageCache()
    const stats = {
      totalBytes: 4096,
      permanentDownloadBytes: 0,
      readingCacheBytes: 4096,
      metadataCacheBytes: 0,
      chapterCount: 1,
      pageCount: 1
    }
    const input = { chapter, pages: [page] }
    invokeMock.mockResolvedValueOnce(chapter)
    invokeMock.mockResolvedValueOnce([chapter])
    invokeMock.mockResolvedValueOnce([page])
    invokeMock.mockResolvedValueOnce(stats)
    invokeMock.mockResolvedValueOnce({ ...stats, totalBytes: 0, readingCacheBytes: 0, chapterCount: 0, pageCount: 0 })
    invokeMock.mockResolvedValueOnce({ ...stats, totalBytes: 0, readingCacheBytes: 0, chapterCount: 0, pageCount: 0 })

    await expect(saveNativeChapterCache(input)).resolves.toMatchObject({ ok: true, available: true, value: chapter })
    await expect(listNativeChapterCache()).resolves.toMatchObject({ ok: true, available: true, value: [chapter] })
    await expect(listNativeCachedChapterPages('cache-53339-3089')).resolves.toMatchObject({ ok: true, available: true, value: [page] })
    await expect(getNativeCacheStats()).resolves.toMatchObject({ ok: true, available: true, value: stats })
    await expect(clearNativeReadingCache(['cache-53339-3089'])).resolves.toMatchObject({
      ok: true,
      available: true,
      value: { ...stats, totalBytes: 0, readingCacheBytes: 0, chapterCount: 0, pageCount: 0 }
    })
    await expect(clearNativeReadingCache()).resolves.toMatchObject({
      ok: true,
      available: true,
      value: { ...stats, totalBytes: 0, readingCacheBytes: 0, chapterCount: 0, pageCount: 0 }
    })

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'save_chapter_cache', { input })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'list_chapter_cache', undefined)
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'list_cached_chapter_pages', { chapterCacheId: 'cache-53339-3089' })
    expect(invokeMock).toHaveBeenNthCalledWith(4, 'get_cache_stats', undefined)
    expect(invokeMock).toHaveBeenNthCalledWith(5, 'clear_reading_cache', { chapterIds: ['cache-53339-3089'] })
    expect(invokeMock).toHaveBeenNthCalledWith(6, 'clear_reading_cache', { chapterIds: null })
  })

  it('routes local reading data deletion through the native storage boundary', async () => {
    enableTauriRuntime()
    const stats = {
      totalBytes: 0,
      permanentDownloadBytes: 0,
      readingCacheBytes: 0,
      metadataCacheBytes: 0,
      chapterCount: 0,
      pageCount: 0
    }
    invokeMock.mockResolvedValueOnce({
      cacheStats: stats,
      removedChapterIds: ['cache-53339-3089'],
      removedFileIds: ['file-source'],
      removedTaskIds: ['task-source'],
      deletedFileCount: 1,
      missingFileCount: 0,
      tasks: [],
      library: []
    })

    const result = await deleteNativeLocalReadingData({
      comicIds: ['53339'],
      volumeIds: ['3089'],
      includeSourceFiles: true
    })

    expect(result).toEqual({
      ok: true,
      available: true,
      value: {
        cacheStats: stats,
        removedChapterIds: ['cache-53339-3089'],
        removedFileIds: ['file-source'],
        removedTaskIds: ['task-source'],
        deletedFileCount: 1,
        missingFileCount: 0,
        tasks: [],
        library: []
      },
      message: '已删除 1 个阅读缓存和 1 个本地阅读文件记录。'
    })
    expect(invokeMock).toHaveBeenCalledWith('delete_local_reading_data', {
      input: {
        comicIds: ['53339'],
        volumeIds: ['3089'],
        includeSourceFiles: true
      }
    })
  })

  it('routes iOS status bar visibility through the native reader boundary', async () => {
    enableTauriRuntime()
    invokeMock.mockResolvedValueOnce(true)

    const result = await setNativeIosStatusBarHidden(true)

    expect(result).toEqual({
      ok: true,
      available: true,
      value: true,
      message: 'Reader 状态栏显示已更新。'
    })
    expect(invokeMock).toHaveBeenCalledWith('set_ios_status_bar_hidden', { hidden: true })
  })

  it('routes native reader archive manifests through the guarded native command', async () => {
    enableTauriRuntime()
    const manifest = {
      fileName: 'chapter.cbz',
      pageCount: 2,
      pages: [
        {
          index: 0,
          archiveIndex: 3,
          name: 'page1.jpg',
          normalizedPath: 'pages/page1.jpg',
          extension: 'jpg',
          compressedSize: 120,
          uncompressedSize: 240
        },
        {
          index: 1,
          archiveIndex: 4,
          name: 'page2.jpg',
          normalizedPath: 'pages/page2.jpg',
          extension: 'jpg',
          compressedSize: 130,
          uncompressedSize: 260
        }
      ]
    }
    invokeMock.mockResolvedValueOnce(manifest)

    const result = await listNativeReaderArchivePages('/Users/example/Downloads/Kmoe/chapter.cbz')

    expect(result).toEqual({
      ok: true,
      available: true,
      value: manifest,
      message: '已读取 2 页漫画图片。'
    })
    expect(invokeMock).toHaveBeenCalledWith('list_reader_archive_pages', {
      path: '/Users/example/Downloads/Kmoe/chapter.cbz'
    })
  })

  it('routes native reader cache preparation with chapter metadata', async () => {
    enableTauriRuntime()
    const prepared = {
      chapter: sampleChapterCache(),
      pages: [samplePageCache()],
      manifest: {
        fileName: 'chapter.cbz',
        pageCount: 1,
        pages: [
          {
            index: 0,
            archiveIndex: 0,
            name: 'page1.jpg',
            normalizedPath: 'page1.jpg',
            extension: 'jpg',
            compressedSize: 120,
            uncompressedSize: 240
          }
        ]
      }
    }
    const input = {
      archivePath: '/Users/example/Downloads/Kmoe/chapter.cbz',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      sourceTaskId: 'task-53339-source',
      policy: 'balanced' as const
    }
    invokeMock.mockResolvedValueOnce(prepared)

    const result = await prepareNativeReaderChapterCache(input)

    expect(result).toEqual({
      ok: true,
      available: true,
      value: prepared,
      message: '已准备 1 页阅读缓存。'
    })
    expect(invokeMock).toHaveBeenCalledWith('prepare_reader_chapter_cache', { input })
  })

  it('routes native cached reader page reads by cache id and page index', async () => {
    enableTauriRuntime()
    const page = {
      chapterCacheId: 'cache-53339-3089',
      comicId: '53339',
      volumeId: '3089',
      pageIndex: 0,
      fileName: '00001.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      dataUrl: 'data:image/jpeg;base64,Ag=='
    }
    invokeMock.mockResolvedValueOnce(page)

    const result = await readNativeCachedReaderPage('cache-53339-3089', 0)

    expect(result).toEqual({
      ok: true,
      available: true,
      value: page,
      message: '已读取第 1 页缓存。'
    })
    expect(invokeMock).toHaveBeenCalledWith('read_cached_reader_page', {
      chapterCacheId: 'cache-53339-3089',
      pageIndex: 0
    })
  })

  it('routes native reader cache repair by cache id only', async () => {
    enableTauriRuntime()
    const repaired = {
      chapter: sampleChapterCache(),
      pages: [samplePageCache()],
      manifest: {
        fileName: 'chapter.cbz',
        pageCount: 1,
        pages: [
          {
            index: 0,
            archiveIndex: 0,
            name: 'page1.jpg',
            normalizedPath: 'page1.jpg',
            extension: 'jpg',
            compressedSize: 120,
            uncompressedSize: 240
          }
        ]
      }
    }
    invokeMock.mockResolvedValueOnce(repaired)

    const result = await repairNativeReaderChapterCache('cache-53339-3089')

    expect(result).toEqual({
      ok: true,
      available: true,
      value: repaired,
      message: '已重新准备 1 页阅读缓存。'
    })
    expect(invokeMock).toHaveBeenCalledWith('repair_reader_chapter_cache', {
      chapterCacheId: 'cache-53339-3089'
    })
  })
})

function enableTauriRuntime() {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: {},
    configurable: true
  })
}

function sampleTask(): DownloadTask {
  return {
    id: '53339-3089-mobi',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'mobi',
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 2048,
    retryCount: 0,
    createdAt: '100',
    updatedAt: '100'
  }
}

function sampleFile(): DownloadedFile {
  return {
    id: 'file-53339-3089-mobi',
    taskId: '53339-3089-mobi',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'mobi',
    localPath: 'Imported metadata only/尖帽子的魔法工房 - 話 089-095.mobi',
    downloadedAt: '100'
  }
}

function sampleShelf() {
  return {
    id: 'default',
    name: '书架',
    kind: 'default',
    sortOrder: 0,
    createdAt: '100',
    updatedAt: '100'
  }
}

function sampleShelfItem() {
  return {
    id: 'default-53339',
    shelfId: 'default',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    comicUrl: '/c/53339.htm',
    coverUrl: '/cover/53339.jpg',
    latestVolume: '話 095',
    lastReadVolumeId: '3089',
    lastReadLabel: '继续读 話 089-095 · 第 12 页',
    unreadCount: 2,
    cached: true,
    archived: false,
    addedAt: '100',
    updatedAt: '101',
    lastReadAt: '101',
    lastUpdateAt: '102'
  }
}

function sampleProgress() {
  return {
    id: '53339-3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    pageIndex: 12,
    pageCount: 180,
    progressPercent: 6.67,
    lastReadAt: '103',
    finished: false,
    readingMode: 'paged',
    readingDirection: 'rtl',
    pageLayout: 'single',
    zoom: 1.25,
    rotation: 90,
    cropJson: '{"mode":"auto"}',
    updatedAt: '103'
  }
}

function sampleHistory() {
  return {
    id: 'history-53339-3089-103',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    pageIndex: 12,
    progressPercent: 6.67,
    event: 'page_change',
    readAt: '103',
    durationSeconds: 45
  }
}

function sampleChapterCache() {
  return {
    id: 'cache-53339-3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip' as const,
    cacheKind: 'reading_cache' as const,
    sourceTaskId: 'task-53339',
    cacheDir: '/Users/example/Library/Application Support/Kmoe/Cache/53339/3089',
    sizeBytes: 4096,
    pageCount: 1,
    status: 'ready' as const,
    policy: 'balanced' as const,
    lastAccessedAt: '104',
    createdAt: '103',
    updatedAt: '104'
  }
}

function samplePageCache() {
  return {
    id: 'page-0',
    chapterCacheId: 'cache-53339-3089',
    comicId: '53339',
    volumeId: '3089',
    pageIndex: 0,
    filePath: '/Users/example/Library/Application Support/Kmoe/Cache/53339/3089/0001.jpg',
    width: 1400,
    height: 2000,
    sizeBytes: 1024,
    createdAt: '104',
    lastAccessedAt: '104'
  }
}
