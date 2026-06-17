import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ExternalLink, FolderOpen, Link2, RefreshCcw, Search, Trash2 } from 'lucide-react'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { EmptyState } from '../components/EmptyState'
import { ImeAwareInput } from '../components/ImeAwareInput'
import { PageHeader } from '../components/layout/PageHeader'
import { useDownloadStore } from '../store/downloadStore'
import { useCacheStore } from '../store/cacheStore'
import { formatBytes, readableAppMessage } from '../lib/format'
import type { DownloadedFile, DownloadFormat } from '../types/domain'
import { exportLocalFile, linkNativeDownloadedFile, openLocalFile, prepareNativeReaderChapterCache, revealLocalFile } from '../platform/nativeCommands'
import { isMetadataOnlyDownloadedFile, isReaderArchiveFormat } from '../reading/sourceArchive'
import { resolveLibraryReaderEntryState } from '../reading/readerEntry'
import { syncNativeLibraryRecords } from '../library/nativeLibrarySync'
import { deleteLocalReadingData } from '../reading/localReadingData'
import { detectPlatformTarget, isMobileAppTarget } from '../download/pathPlanner'

export function LibraryPage() {
  const store = useDownloadStore()
  const replaceLibrary = useDownloadStore((state) => state.replaceLibrary)
  const [keyword, setKeyword] = useState('')
  const [format, setFormat] = useState<DownloadFormat | 'all'>('all')
  const [message, setMessage] = useState('')
  const syncNativeLibrary = useCallback(async (): Promise<'synced' | 'unavailable' | 'error'> => {
    const outcome = await syncNativeLibraryRecords(replaceLibrary)
    if (outcome.status === 'synced') {
      setMessage(outcome.message)
      return 'synced'
    }
    if (outcome.status === 'error') {
      setMessage(readableAppMessage(outcome.message, '暂时无法同步资料库，请稍后重试。'))
      return 'error'
    }
    return 'unavailable'
  }, [replaceLibrary])
  const files = useMemo(
    () =>
      store.library.filter((file) => {
        const haystack = `${file.comicTitle} ${file.volumeTitle} ${file.comicId} ${file.volId}`.toLowerCase()
        if (keyword && !haystack.includes(keyword.toLowerCase())) return false
        if (format !== 'all' && file.format !== format) return false
        return true
      }),
    [format, keyword, store.library]
  )

  useEffect(() => {
    void syncNativeLibrary()
  }, [syncNativeLibrary])

  return (
    <div className="content-grid">
      <PageHeader
        eyebrow="资料库"
        title="资料库"
        description="查看已下载文件，按漫画、卷号和格式检索。"
        actions={(
          <>
          <Button
            onClick={async () => {
              const synced = await syncNativeLibrary()
              if (synced === 'unavailable') setMessage('暂时无法同步资料库，请稍后重试。')
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            同步资料库
          </Button>
          </>
        )}
      />

      <div className="glass-toolbar flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
          <ImeAwareInput aria-label="搜索漫画、卷号、ID" value={keyword} onValueChange={setKeyword} className="liquid-input h-12 w-full rounded-full pl-11 pr-4 outline-none" />
        </label>
        <select aria-label="资料库格式筛选" value={format} onChange={(event) => setFormat(event.target.value as DownloadFormat | 'all')} className="liquid-input h-12 rounded-full px-4 outline-none">
          <option value="all">全部格式</option>
          <option value="mobi">MOBI</option>
          <option value="epub">EPUB</option>
          <option value="source_zip">源图 ZIP</option>
        </select>
      </div>
      {message ? <div className="metric-tile break-words p-3 text-sm text-[var(--app-muted)]">{message}</div> : null}

      {files.length === 0 ? <EmptyState title="资料库为空">完成下载后会在这里生成资料库记录。</EmptyState> : null}
      <div className="grid gap-3 xl:grid-cols-2">
        {files.map((file) => (
          <LibraryFileCard
            key={file.id}
            file={file}
            onMessage={setMessage}
            onLibraryLinked={(library) => {
              const nextLibrary = replaceLibrary(library)
              setMessage(`已绑定文件，并同步 ${nextLibrary.length} 个资料库项目。`)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function LibraryFileCard({
  file,
  onMessage,
  onLibraryLinked
}: {
  file: DownloadedFile
  onMessage: (message: string) => void
  onLibraryLinked: (library: DownloadedFile[]) => void
}) {
  const navigate = useNavigate()
  const chaptersById = useCacheStore((state) => state.chaptersById)
  const upsertChapter = useCacheStore((state) => state.upsertChapter)
  const registerPages = useCacheStore((state) => state.registerPages)
  const [linkPath, setLinkPath] = useState('')
  const metadataOnly = isMetadataOnlyDownloadedFile(file)
  const expectedExtension = extensionForFormat(file.format)
  const fileName = displayFileName(file.localPath)
  const canDeleteLocalReadingData = isReaderArchiveFormat(file.format)
  const [deletingLocalData, setDeletingLocalData] = useState(false)
  const platformTarget = useMemo(() => detectPlatformTarget(), [])
  const mobileFileExport = isMobileAppTarget(platformTarget)
  const cachedChapters = useMemo(() => Object.values(chaptersById), [chaptersById])
  const readerState = useMemo(
    () => resolveLibraryReaderEntryState({ file, chapters: cachedChapters }),
    [cachedChapters, file]
  )

  async function openReader() {
    if (readerState.cache) {
      navigate(`/reader/cache/${encodeURIComponent(readerState.cache.id)}`)
      return
    }
    if (!readerState.enabled || !isReaderArchiveFormat(file.format) || metadataOnly) {
      onMessage(readerState.helper)
      return
    }
    onMessage('正在准备阅读缓存...')
    const result = await prepareNativeReaderChapterCache({
      archivePath: file.localPath,
      comicId: file.comicId,
      comicTitle: file.comicTitle,
      volumeId: file.volId,
      volumeTitle: file.volumeTitle,
      sourceTaskId: file.taskId,
      format: file.format,
      policy: 'balanced'
    })
    if (result.ok && result.value) {
      upsertChapter(result.value.chapter)
      registerPages(result.value.chapter.id, result.value.pages)
      navigate(`/reader/cache/${encodeURIComponent(result.value.chapter.id)}`)
      return
    }
    onMessage(readableAppMessage(result.message, '暂时无法准备阅读缓存，请确认源图 ZIP 仍在本机。'))
  }

  async function deleteLocalData() {
    setDeletingLocalData(true)
    const outcome = await deleteLocalReadingData({
      comicIds: [file.comicId],
      volumeIds: [file.volId],
      includeSourceFiles: true
    })
    setDeletingLocalData(false)
    onMessage(outcome.ok
      ? '已删除本地阅读数据；再次阅读会重新获取。'
      : outcome.message)
  }

  return (
    <div className="library-card interactive-lift grid min-w-0 gap-3 p-3 md:p-4">
      <div className="min-w-0">
        <div className="break-words font-semibold">{file.comicTitle}</div>
        <div className="mt-1 break-words text-sm text-[var(--app-muted)]">
          {file.volumeTitle} · {file.comicId}/{file.volId} · {formatBytes(file.sizeBytes)}
        </div>
        <div className="soft-code mt-2 block text-xs leading-5">文件：{fileName}</div>
      </div>
      <div className="library-actions flex flex-wrap gap-2">
        <Badge tone="success">{file.format.toUpperCase()}</Badge>
        {metadataOnly ? <Badge tone="warning">需绑定文件</Badge> : null}
        {isReaderArchiveFormat(file.format) ? (
          <Button
            className="w-full sm:w-auto"
            disabled={!readerState.enabled}
            onClick={() => void openReader()}
          >
            <BookOpen className="h-4 w-4" />
            {readerState.label}
          </Button>
        ) : <Badge>{readerState.label}</Badge>}
        <Button
          className="w-full sm:w-auto"
          disabled={metadataOnly}
          onClick={async () => {
            const result = mobileFileExport
              ? await exportLocalFile(file.localPath)
              : await openLocalFile(file.localPath)
            onMessage(readableAppMessage(
              result.message,
              mobileFileExport ? '暂时无法导出文件，请确认文件仍在 App 保存区。' : '暂时无法打开文件，请确认文件仍在保存位置。'
            ))
          }}
        >
          <ExternalLink className="h-4 w-4" />
          {mobileFileExport ? '导出文件' : '打开文件'}
        </Button>
        {!mobileFileExport ? (
          <Button
            className="w-full sm:w-auto"
            disabled={metadataOnly}
            onClick={async () => {
              const result = await revealLocalFile(file.localPath)
              onMessage(readableAppMessage(result.message, '暂时无法显示文件位置，请确认文件仍在保存位置。'))
            }}
          >
            <FolderOpen className="h-4 w-4" />
            查看位置
          </Button>
        ) : null}
        {canDeleteLocalReadingData ? (
          <Button
            className="w-full sm:w-auto"
            variant="danger"
            disabled={deletingLocalData}
            onClick={() => void deleteLocalData()}
          >
            <Trash2 className="h-4 w-4" />
            {deletingLocalData ? '删除中' : '删除本地数据'}
          </Button>
        ) : null}
      </div>
      <div className="text-xs leading-5 text-[var(--app-muted)]">{readerState.helper}</div>
      {metadataOnly ? (
        <div>
          <div className="library-link-panel flex flex-col gap-2 border-dashed p-3 md:flex-row md:items-start">
            <label className="min-w-0 flex-1">
              <span className="sr-only">文件路径</span>
              <ImeAwareInput
                aria-label="文件路径"
                value={linkPath}
                onValueChange={setLinkPath}
                className="liquid-input h-11 w-full rounded-full px-4 text-sm outline-none"
              />
              <span className="mt-1 block text-xs text-[var(--app-muted)]">期望文件扩展名：{expectedExtension}</span>
            </label>
            <Button
              className="w-full md:w-auto"
              disabled={!linkPath.trim()}
              onClick={async () => {
                const result = await linkNativeDownloadedFile(file, linkPath)
                if (result.ok && result.value) {
                  setLinkPath('')
                  onLibraryLinked(result.value)
                } else {
                  onMessage(readableAppMessage(result.message, '暂时无法绑定文件，请确认选择的是对应格式的文件。'))
                }
              }}
            >
              <Link2 className="h-4 w-4" />
              绑定文件
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function extensionForFormat(format: DownloadFormat): string {
  return format === 'source_zip' ? '.zip' : `.${format}`
}

function displayFileName(path: string): string {
  if (isMetadataOnlyDownloadedFile({ localPath: path })) return '待绑定文件'
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() ?? '已保存文件'
}
