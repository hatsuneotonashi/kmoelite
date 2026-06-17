import type { AppSettings, CatalogQuery, DownloadedFile, DownloadTask, LoginInput } from '../types/domain'
import type { CacheStats, ChapterCacheRecord, PageCacheRecord, ReaderArchiveFormat } from '../types/cache'
import type { NativeInvokeOptions } from './tauri'
import { invokeNative } from './tauri'

const KMOE_WEB_COMMAND_TIMEOUT_MS = 45_000
const KMOE_WEB_COMMAND_TIMEOUT_MESSAGE = 'Kmoe 网站请求超时，请检查网络后重试。'
const ANDROID_SHARE_UNSUPPORTED_MESSAGE = '当前平台不支持系统分享导出，请保留 App 私有下载目录中的文件。'
const KMOE_WEB_COMMAND_OPTIONS: NativeInvokeOptions = {
  timeoutMs: KMOE_WEB_COMMAND_TIMEOUT_MS,
  timeoutMessage: KMOE_WEB_COMMAND_TIMEOUT_MESSAGE
}

declare global {
  interface Window {
    KmoeliteAndroidFile?: {
      shareFile(path: string): string
    }
  }
}

export type NativeCommandResult<T> = {
  ok: boolean
  available: boolean
  value?: T
  message: string
}

export interface NativeMigrationImportResult {
  importedTasks: number
  importedLibrary: number
  tasks: DownloadTask[]
  library: DownloadedFile[]
}

export interface NativeDownloadPreflightCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export interface NativeDownloadPreflight {
  ok: boolean
  mode: 'real_download'
  queuedCount: number
  activeCount: number
  downloadDirectory?: string
  firstTaskId?: string
  firstTaskLabel?: string
  checks: NativeDownloadPreflightCheck[]
}

export interface NativeShelfRecord {
  id: string
  name: string
  kind: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export interface NativeShelfItemRecord {
  id: string
  shelfId: string
  comicId: string
  comicTitle: string
  comicUrl?: string
  coverUrl?: string
  comicStatus?: string
  latestVolume?: string
  lastReadVolumeId?: string
  lastReadLabel?: string
  unreadCount: number
  cached: boolean
  archived: boolean
  addedAt: string
  updatedAt: string
  lastReadAt?: string
  lastUpdateAt?: string
}

export interface NativeReadingProgressRecord {
  id: string
  comicId: string
  comicTitle: string
  volumeId: string
  volumeTitle: string
  pageIndex: number
  pageCount?: number
  progressPercent: number
  lastReadAt: string
  finished: boolean
  readingMode: string
  readingDirection: string
  pageLayout: string
  zoom?: number
  rotation?: number
  cropJson?: string
  spreadOverridesJson?: string
  updatedAt: string
}

export interface NativeReadingHistoryEntryRecord {
  id: string
  comicId: string
  comicTitle: string
  volumeId: string
  volumeTitle: string
  pageIndex: number
  progressPercent: number
  event: string
  readAt: string
  durationSeconds?: number
}

export interface NativeSaveReadingProgressInput {
  progress: NativeReadingProgressRecord
  history?: NativeReadingHistoryEntryRecord
}

export interface NativeSaveChapterCacheInput {
  chapter: ChapterCacheRecord & { cacheDir: string }
  pages: Array<PageCacheRecord & { filePath: string }>
}

export interface NativeReaderPageEntry {
  index: number
  archiveIndex: number
  name: string
  normalizedPath: string
  extension: string
  compressedSize: number
  uncompressedSize: number
}

export interface NativeReaderArchiveManifest {
  fileName: string
  pageCount: number
  pages: NativeReaderPageEntry[]
}

export interface NativePrepareReaderChapterCacheInput {
  archivePath: string
  comicId: string
  comicTitle: string
  volumeId: string
  volumeTitle: string
  sourceTaskId?: string
  format?: ReaderArchiveFormat
  policy?: 'space_saver' | 'balanced' | 'comfort'
}

export interface NativePreparedReaderChapterCache {
  chapter: ChapterCacheRecord & { cacheDir: string }
  pages: Array<PageCacheRecord & { filePath: string }>
  manifest: NativeReaderArchiveManifest
}

export interface NativeDeleteLocalReadingDataInput {
  comicIds?: string[]
  volumeIds?: string[]
  chapterIds?: string[]
  includeSourceFiles?: boolean
}

export interface NativeDeleteLocalReadingDataResult {
  cacheStats: CacheStats
  removedChapterIds: string[]
  removedFileIds: string[]
  removedTaskIds: string[]
  deletedFileCount: number
  missingFileCount: number
  tasks: DownloadTask[]
  library: DownloadedFile[]
}

export interface NativeReaderCachedPageImage {
  chapterCacheId: string
  comicId: string
  volumeId: string
  pageIndex: number
  fileName: string
  mimeType: string
  sizeBytes: number
  dataUrl: string
}

export async function getNativeAppConfig(): Promise<NativeCommandResult<Partial<AppSettings>>> {
  return nativeCommand('get_app_config', undefined, '已读取应用设置。', '当前运行环境暂不支持读取应用设置。')
}

export async function getNativeDownloadDir(): Promise<NativeCommandResult<string>> {
  return nativeCommand('get_download_dir', undefined, '已读取当前保存位置。', '当前运行环境暂不支持读取保存位置。')
}

export async function setNativeDownloadDir(path: string): Promise<NativeCommandResult<string>> {
  return nativeCommand('set_download_dir', { path }, '已保存下载目录。', '当前运行环境暂不支持更改保存位置。')
}

export async function openLocalFile(path: string): Promise<NativeCommandResult<string>> {
  const result = await nativeCommand<string>('open_file', { path }, '正在打开文件。', '当前运行环境暂不支持打开文件。')
  return withAndroidFileShareFallback(result, path, '已打开系统分享，请选择保存到“文件”或其他目标。')
}

export async function exportLocalFile(path: string): Promise<NativeCommandResult<string>> {
  const result = await nativeCommand<string>(
    'open_file',
    { path },
    '已打开系统分享，请选择保存到“文件”或其他目标。',
    '当前运行环境暂不支持导出文件。'
  )
  return withAndroidFileShareFallback(result, path, '已打开系统分享，请选择保存到“文件”或其他目标。')
}

export async function revealLocalFile(path: string): Promise<NativeCommandResult<string>> {
  const result = await nativeCommand<string>('reveal_in_folder', { path }, '正在打开所在文件夹。', '当前运行环境暂不支持打开文件夹。')
  return withAndroidFileShareFallback(result, path, '已打开系统分享，请选择保存到“文件”或其他目标。')
}

export async function showLocalFileLocation(path: string): Promise<NativeCommandResult<string>> {
  const result = await nativeCommand<string>(
    'reveal_in_folder',
    { path },
    '已打开系统分享，请选择保存到“文件”或其他目标。',
    '当前运行环境暂不支持查看文件位置。'
  )
  return withAndroidFileShareFallback(result, path, '已打开系统分享，请选择保存到“文件”或其他目标。')
}

export async function enqueueNativeDownloadTasks(tasks: DownloadTask[]): Promise<NativeCommandResult<DownloadTask[]>> {
  return nativeCommand(
    'enqueue_download_tasks',
    { tasks },
    (value) => `已加入 ${value.length} 个下载任务。`,
    '当前运行环境暂不支持加入下载队列。'
  )
}

export async function startNativeDownloadQueue(downloadDir?: string): Promise<NativeCommandResult<void>> {
  return nativeCommand('start_download_queue', { downloadDir }, '下载队列已启动。', '当前运行环境暂不支持启动下载队列。')
}

export async function preflightNativeDownloadQueue(downloadDir?: string): Promise<NativeCommandResult<NativeDownloadPreflight>> {
  return nativeCommand(
    'preflight_download_queue',
    { downloadDir },
    (value) => value.ok ? '队列已准备好。' : '队列还有需要处理的问题。',
    '当前运行环境暂不支持检查下载队列。'
  )
}

export async function listNativeDownloadTasks(options?: { recoverInterrupted?: boolean }): Promise<NativeCommandResult<DownloadTask[]>> {
  return nativeCommand(
    'list_download_tasks',
    options ? { recoverInterrupted: options.recoverInterrupted } : undefined,
    (value) => `已同步 ${value.length} 个下载任务。`,
    '当前运行环境暂不支持读取下载队列。'
  )
}

export async function listNativeDownloadedFiles(): Promise<NativeCommandResult<DownloadedFile[]>> {
  return nativeCommand(
    'list_downloaded_files',
    undefined,
    (value) => `已同步 ${value.length} 个资料库项目。`,
    '当前运行环境暂不支持读取资料库。'
  )
}

export async function linkNativeDownloadedFile(file: DownloadedFile, localPath: string): Promise<NativeCommandResult<DownloadedFile[]>> {
  return nativeCommand(
    'link_downloaded_file',
    { file, localPath },
    (value) => `已绑定本机文件，并同步 ${value.length} 个资料库项目。`,
    '当前运行环境暂不支持绑定本机文件。'
  )
}

export async function pauseNativeDownloadTask(id: string): Promise<NativeCommandResult<void>> {
  return nativeCommand('pause_download_task', { id }, '任务已暂停。', '当前运行环境暂不支持管理下载任务。')
}

export async function resumeNativeDownloadTask(id: string): Promise<NativeCommandResult<void>> {
  return nativeCommand('resume_download_task', { id }, '任务已继续。', '当前运行环境暂不支持管理下载任务。')
}

export async function cancelNativeDownloadTask(id: string): Promise<NativeCommandResult<void>> {
  return nativeCommand('cancel_download_task', { id }, '任务已取消。', '当前运行环境暂不支持管理下载任务。')
}

export async function retryNativeDownloadTask(id: string): Promise<NativeCommandResult<void>> {
  return nativeCommand('retry_download_task', { id }, '任务已重新排队。', '当前运行环境暂不支持管理下载任务。')
}

export async function prioritizeNativeDownloadTask(id: string): Promise<NativeCommandResult<DownloadTask>> {
  return nativeCommand('prioritize_download_task', { id }, '已把任务设为下一项。', '当前运行环境暂不支持调整下载顺序。')
}

export async function clearNativeQueue(): Promise<NativeCommandResult<void>> {
  return nativeCommand('clear_queue', undefined, '未完成任务已清理。', '当前运行环境暂不支持清理下载队列。')
}

export async function saveNativeMigrationSnapshot(snapshotJson: string): Promise<NativeCommandResult<string>> {
  return nativeCommand(
    'save_migration_snapshot',
    { snapshotJson },
    (value) => `已保存导出文件：${value}`,
    '当前运行环境暂不支持保存导出文件。'
  )
}

export async function importNativeMigrationSnapshot(snapshotJson: string): Promise<NativeCommandResult<NativeMigrationImportResult>> {
  return nativeCommand(
    'import_migration_snapshot',
    { snapshotJson },
    (value) => `已导入 ${value.importedTasks} 个任务和 ${value.importedLibrary} 个资料库项目。`,
    '当前运行环境暂不支持导入资料。'
  )
}

export async function nativeKmoeLogin(input: LoginInput): Promise<NativeCommandResult<string>> {
  return nativeCommand('kmoe_login', { input }, '登录请求已完成。', '当前运行环境暂不支持登录。', KMOE_WEB_COMMAND_OPTIONS)
}

export async function nativeFetchKmoeCatalog(query: CatalogQuery): Promise<NativeCommandResult<string>> {
  return nativeCommand('kmoe_fetch_catalog', { query }, '目录已更新。', '当前运行环境暂不支持读取目录。', KMOE_WEB_COMMAND_OPTIONS)
}

export async function nativeFetchCoverImage(url: string): Promise<NativeCommandResult<string>> {
  return nativeCommand('kmoe_fetch_cover_image', { url }, '封面图片已读取。', '当前运行环境暂不支持读取封面图片。', KMOE_WEB_COMMAND_OPTIONS)
}

export async function nativeFetchComicDetailHtml(comicId: string): Promise<NativeCommandResult<string>> {
  return nativeCommand('kmoe_fetch_comic_detail_html', { comicId }, '详情已更新。', '当前运行环境暂不支持读取详情。', KMOE_WEB_COMMAND_OPTIONS)
}

export async function nativeFetchBookData(path: string): Promise<NativeCommandResult<string>> {
  return nativeCommand('kmoe_fetch_book_data', { path }, '下载选项已更新。', '当前运行环境暂不支持读取下载选项。', KMOE_WEB_COMMAND_OPTIONS)
}

export async function nativeFetchUserProfileHtml(): Promise<NativeCommandResult<string>> {
  return nativeCommand('kmoe_fetch_user_profile_html', undefined, '账号信息已更新。', '当前运行环境暂不支持读取账号信息。', KMOE_WEB_COMMAND_OPTIONS)
}

export async function nativeKmoeLogout(): Promise<NativeCommandResult<string>> {
  return nativeCommand('kmoe_logout', undefined, '已退出登录。', '当前运行环境暂不支持退出登录。', KMOE_WEB_COMMAND_OPTIONS)
}

export async function listNativeShelves(): Promise<NativeCommandResult<NativeShelfRecord[]>> {
  return nativeCommand('list_shelves', undefined, (value) => `已同步 ${value.length} 个书架分类。`, '当前运行环境暂不支持同步书架。')
}

export async function upsertNativeShelf(shelf: NativeShelfRecord): Promise<NativeCommandResult<NativeShelfRecord[]>> {
  return nativeCommand('upsert_shelf', { shelf }, '书架分类已保存。', '当前运行环境暂不支持保存书架分类。')
}

export async function listNativeShelfItems(): Promise<NativeCommandResult<NativeShelfItemRecord[]>> {
  return nativeCommand('list_shelf_items', undefined, (value) => `已同步 ${value.length} 个书架项目。`, '当前运行环境暂不支持同步书架。')
}

export async function upsertNativeShelfItem(item: NativeShelfItemRecord): Promise<NativeCommandResult<NativeShelfItemRecord[]>> {
  return nativeCommand('upsert_shelf_item', { item }, '书架已更新。', '当前运行环境暂不支持更新书架。')
}

export async function removeNativeShelfItems(comicIds: string[]): Promise<NativeCommandResult<NativeShelfItemRecord[]>> {
  return nativeCommand('remove_shelf_items', { comicIds }, '已从书架移除。', '当前运行环境暂不支持更新书架。')
}

export async function getNativeReadingProgress(comicId: string, volumeId: string): Promise<NativeCommandResult<NativeReadingProgressRecord | null>> {
  return nativeCommand('get_reading_progress', { comicId, volumeId }, '阅读进度已读取。', '当前运行环境暂不支持读取阅读进度。')
}

export async function listNativeReadingProgress(): Promise<NativeCommandResult<NativeReadingProgressRecord[]>> {
  return nativeCommand('list_reading_progress', undefined, (value) => `已同步 ${value.length} 条阅读进度。`, '当前运行环境暂不支持读取阅读进度。')
}

export async function saveNativeReadingProgress(input: NativeSaveReadingProgressInput): Promise<NativeCommandResult<NativeReadingProgressRecord>> {
  return nativeCommand('save_reading_progress', { input }, '阅读进度已保存。', '当前运行环境暂不支持保存阅读进度。')
}

export async function saveNativeChapterCache(input: NativeSaveChapterCacheInput): Promise<NativeCommandResult<ChapterCacheRecord>> {
  return nativeCommand('save_chapter_cache', { input }, '章节缓存已保存。', '当前运行环境暂不支持保存章节缓存。')
}

export async function listNativeChapterCache(): Promise<NativeCommandResult<ChapterCacheRecord[]>> {
  return nativeCommand('list_chapter_cache', undefined, (value) => `已同步 ${value.length} 个章节缓存。`, '当前运行环境暂不支持读取章节缓存。')
}

export async function listNativeCachedChapterPages(chapterCacheId: string): Promise<NativeCommandResult<PageCacheRecord[]>> {
  return nativeCommand('list_cached_chapter_pages', { chapterCacheId }, (value) => `已读取 ${value.length} 页缓存。`, '当前运行环境暂不支持读取缓存页面。')
}

export async function getNativeCacheStats(): Promise<NativeCommandResult<CacheStats>> {
  return nativeCommand('get_cache_stats', undefined, '缓存占用已更新。', '当前运行环境暂不支持读取缓存占用。')
}

export async function clearNativeReadingCache(chapterIds?: string[]): Promise<NativeCommandResult<CacheStats>> {
  return nativeCommand('clear_reading_cache', { chapterIds: chapterIds ?? null }, '阅读缓存已清理。', '当前运行环境暂不支持清理阅读缓存。')
}

export async function deleteNativeLocalReadingData(
  input: NativeDeleteLocalReadingDataInput
): Promise<NativeCommandResult<NativeDeleteLocalReadingDataResult>> {
  return nativeCommand(
    'delete_local_reading_data',
    { input },
    (value) => {
      const cacheCount = value.removedChapterIds.length
      const fileCount = value.deletedFileCount + value.missingFileCount
      if (fileCount > 0) return `已删除 ${cacheCount} 个阅读缓存和 ${fileCount} 个本地阅读文件记录。`
      return `已删除 ${cacheCount} 个阅读缓存。`
    },
    '当前运行环境暂不支持删除本地阅读数据。'
  )
}

export async function setNativeIosStatusBarHidden(hidden: boolean): Promise<NativeCommandResult<boolean>> {
  return nativeCommand(
    'set_ios_status_bar_hidden',
    { hidden },
    (value) => value ? 'Reader 状态栏显示已更新。' : '当前平台无需切换 iOS 状态栏。',
    '当前运行环境暂不支持切换 iOS 状态栏。'
  )
}

export async function listNativeReaderArchivePages(path: string): Promise<NativeCommandResult<NativeReaderArchiveManifest>> {
  return nativeCommand(
    'list_reader_archive_pages',
    { path },
    (value) => `已读取 ${value.pageCount} 页漫画图片。`,
    '当前运行环境暂不支持读取漫画压缩包。'
  )
}

export async function prepareNativeReaderChapterCache(
  input: NativePrepareReaderChapterCacheInput
): Promise<NativeCommandResult<NativePreparedReaderChapterCache>> {
  return nativeCommand(
    'prepare_reader_chapter_cache',
    { input },
    (value) => `已准备 ${value.pages.length} 页阅读缓存。`,
    '当前运行环境暂不支持准备阅读缓存。'
  )
}

export async function repairNativeReaderChapterCache(chapterCacheId: string): Promise<NativeCommandResult<NativePreparedReaderChapterCache>> {
  return nativeCommand(
    'repair_reader_chapter_cache',
    { chapterCacheId },
    (value) => `已重新准备 ${value.pages.length} 页阅读缓存。`,
    '当前运行环境暂不支持修复阅读缓存。'
  )
}

export async function readNativeCachedReaderPage(
  chapterCacheId: string,
  pageIndex: number
): Promise<NativeCommandResult<NativeReaderCachedPageImage>> {
  return nativeCommand(
    'read_cached_reader_page',
    { chapterCacheId, pageIndex },
    (value) => `已读取第 ${value.pageIndex + 1} 页缓存。`,
    '当前运行环境暂不支持读取缓存页面。'
  )
}

async function nativeCommand<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  successMessage: string | ((value: T) => string),
  unavailableMessage: string,
  options?: NativeInvokeOptions
): Promise<NativeCommandResult<T>> {
  const result = await invokeNative<T>(command, args, options)
  if (!result.available) return { ok: false, available: false, message: unavailableMessage }
  if (!result.ok) return { ok: false, available: true, message: result.error }
  return {
    ok: true,
    available: true,
    value: result.value,
    message: typeof successMessage === 'function' ? successMessage(result.value) : successMessage
  }
}

export function isNativeUnavailable(result: NativeCommandResult<unknown>): boolean {
  return !result.available
}

function withAndroidFileShareFallback(
  result: NativeCommandResult<string>,
  path: string,
  successMessage: string
): NativeCommandResult<string> {
  if (result.ok || result.message !== ANDROID_SHARE_UNSUPPORTED_MESSAGE) return result
  const bridge = typeof window === 'undefined' ? undefined : window.KmoeliteAndroidFile
  if (typeof bridge?.shareFile !== 'function') return result

  try {
    const bridgeResult = bridge.shareFile(path)
    if (bridgeResult === 'ok') {
      return { ok: true, available: true, value: path, message: successMessage }
    }
    return { ok: false, available: true, message: 'Android 系统分享未能打开，请确认文件仍在 App 私有保存区。' }
  } catch (error) {
    return {
      ok: false,
      available: true,
      message: error instanceof Error ? error.message : 'Android 系统分享未能打开，请确认文件仍在 App 私有保存区。'
    }
  }
}
