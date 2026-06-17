import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom'
import { ArrowLeft, BookMarked, BookmarkPlus, BookOpen, CheckSquare, Download, MoreHorizontal, Play, Sparkles, Square, Trash2, X } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { ProgressBar } from '../components/ProgressBar'
import { DetailSkeleton } from '../components/ui/Skeletons'
import { CoverImage } from '../components/CoverImage'
import { useKmoeApi } from '../hooks/useKmoeApi'
import { useDownloadStore } from '../store/downloadStore'
import { useCacheStore } from '../store/cacheStore'
import { useSettingsStore } from '../store/settingsStore'
import { useShelfStore } from '../store/shelfStore'
import { formatBytes, formatDownloadFormat, readableAppMessage } from '../lib/format'
import type { DownloadedFile, DownloadFormat, DownloadTask, VolumeDownloadOption } from '../types/domain'
import {
  enqueueNativeDownloadTasks,
  isNativeUnavailable,
  listNativeDownloadedFiles,
  listNativeDownloadTasks,
  prepareNativeReaderChapterCache,
  preflightNativeDownloadQueue,
  prioritizeNativeDownloadTask,
  startNativeDownloadQueue
} from '../platform/nativeCommands'
import { planDownloadPath, detectPlatformTarget, isMobileAppTarget } from '../download/pathPlanner'
import { canQueueDownloadOption } from '../download/optionGuards'
import { Info, MiniStat } from '../detail/DetailInfoTiles'
import { clearDocumentCoverTheme, coverThemeColor, cssCoverImageValue, ensureThemeColorMeta, useCoverTheme } from '../detail/coverTheme'
import {
  findUsableReaderArchiveForVolume,
  isMetadataOnlyDownloadedFile,
  readerArchiveFormatLabel,
  type ReaderArchiveFormat
} from '../reading/sourceArchive'
import { readerEntryNeedsDownloadCenter, resolveReaderEntryState, type ReaderEntryState } from '../reading/readerEntry'
import { deleteLocalReadingData } from '../reading/localReadingData'
import { syncNativeLibraryRecords } from '../library/nativeLibrarySync'

type DownloadModeFormat = 'auto' | DownloadFormat

interface SelectionBoxState {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface DetailRoutePreview {
  title?: string
  coverUrl?: string
}

const DOWNLOAD_MODE_FORMATS: DownloadModeFormat[] = ['auto', 'source_zip', 'epub', 'mobi']

export function DetailPage() {
  const { comicId = '53339' } = useParams()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const location = useLocation()
  const api = useKmoeApi()
  const settings = useSettingsStore()
  const platformTarget = useMemo(() => detectPlatformTarget(), [])
  const mobileFileDownload = isMobileAppTarget(platformTarget)
  const downloadStore = useDownloadStore()
  const replaceLibrary = useDownloadStore((state) => state.replaceLibrary)
  const replaceWithNativeSnapshot = useDownloadStore((state) => state.replaceWithNativeSnapshot)
  const chaptersById = useCacheStore((state) => state.chaptersById)
  const upsertChapter = useCacheStore((state) => state.upsertChapter)
  const registerPages = useCacheStore((state) => state.registerPages)
  const isInShelf = useShelfStore((state) => state.isInShelf(comicId))
  const addToShelf = useShelfStore((state) => state.addToShelf)
  const removeFromShelf = useShelfStore((state) => state.removeFromShelf)
  const [downloadModeOpen, setDownloadModeOpen] = useState(false)
  const [downloadModeFormat, setDownloadModeFormat] = useState<DownloadModeFormat>('auto')
  const [moreOpen, setMoreOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | undefined>()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | undefined>()
  const [nativeQueueMessage, setNativeQueueMessage] = useState('')
  const [readerMessage, setReaderMessage] = useState('')
  const [readerFlow, setReaderFlow] = useState<ReaderFlowState | undefined>()
  const [librarySyncMessage, setLibrarySyncMessage] = useState('')
  const [preparingReaderVolId, setPreparingReaderVolId] = useState('')
  const [deletingReaderVolId, setDeletingReaderVolId] = useState('')
  const readerFlowRunId = useRef(0)
  const downloadListRef = useRef<HTMLDivElement | null>(null)
  const detailPollTimer = useRef<number | undefined>(undefined)
  const longPressTimer = useRef<number | undefined>(undefined)
  const ignoreNextDownloadClick = useRef(false)

  const detail = useQuery({
    queryKey: ['comic-detail', comicId],
    queryFn: () => api.getComicDetail(comicId)
  })
  const routePreview = useMemo(() => readDetailRoutePreview(location.state), [location.state])
  const session = useQuery({
    queryKey: ['detail-session'],
    queryFn: () => api.getSession(),
    staleTime: 15_000
  })

  const selectableOptions = useMemo(
    () => detail.data?.downloadOptions.filter((option) => canQueueDownloadModeOption(option, downloadModeFormat)) ?? [],
    [detail.data, downloadModeFormat]
  )
  const selectableVolIds = useMemo(() => new Set(selectableOptions.map((option) => option.volId)), [selectableOptions])
  const selectedOptions = useMemo(
    () => detail.data?.downloadOptions.filter((option) => selected.includes(option.volId) && selectableVolIds.has(option.volId)) ?? [],
    [detail.data, selected, selectableVolIds]
  )
  const allSelected = selectableOptions.length > 0 && selectableOptions.every((option) => selected.includes(option.volId))
  const selectedQueueableCount = selected.filter((volId) => selectableVolIds.has(volId)).length
  const selectedEstimatedBytes = useMemo(
    () => selectedOptions.reduce((total, option) => total + (downloadSizeForMode(option, downloadModeFormat) ?? 0), 0),
    [downloadModeFormat, selectedOptions]
  )
  const colorizeDetailPage = settings.colorizeDetailPage
  const themeCoverUrl = detail.data?.coverUrl ?? routePreview.coverUrl
  const themeTitle = detail.data?.title ?? routePreview.title ?? comicId
  const coverTheme = useCoverTheme(themeCoverUrl, themeTitle, colorizeDetailPage)
  const detailThemeStyle = useMemo(() => ({
    '--detail-accent': `rgb(${coverTheme.r} ${coverTheme.g} ${coverTheme.b})`,
    '--detail-accent-rgb': `${coverTheme.r} ${coverTheme.g} ${coverTheme.b}`,
    '--detail-accent-soft': `rgb(${coverTheme.r} ${coverTheme.g} ${coverTheme.b} / 0.12)`,
    '--detail-cover-image': colorizeDetailPage ? cssCoverImageValue(themeCoverUrl) : 'none'
  } as CSSProperties), [colorizeDetailPage, coverTheme, themeCoverUrl])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    clearDocumentCoverTheme()
    if (!colorizeDetailPage) {
      return undefined
    }

    const root = document.documentElement
    const themeColorMeta = ensureThemeColorMeta()
    const previousThemeColor = themeColorMeta?.getAttribute('content')
    root.dataset.detailCoverTheme = 'true'
    root.style.setProperty('--active-cover-accent-rgb', `${coverTheme.r} ${coverTheme.g} ${coverTheme.b}`)
    root.style.setProperty('--active-cover-image', cssCoverImageValue(themeCoverUrl))
    themeColorMeta?.setAttribute('content', coverThemeColor(coverTheme))

    return () => {
      clearDocumentCoverTheme()
      if (previousThemeColor) {
        themeColorMeta?.setAttribute('content', previousThemeColor)
      } else {
        themeColorMeta?.remove()
      }
    }
  }, [colorizeDetailPage, coverTheme, themeCoverUrl])
  const cachedChapters = useMemo(() => Object.values(chaptersById), [chaptersById])
  const hasActiveDetailDownload = useMemo(
    () => downloadStore.tasks.some((task) =>
      task.comicId === comicId && ['authorizing', 'downloading', 'verifying'].includes(task.status)
    ),
    [comicId, downloadStore.tasks]
  )

  useEffect(() => {
    setSelected((current) => (current.every((volId) => selectableVolIds.has(volId)) ? current : current.filter((volId) => selectableVolIds.has(volId))))
  }, [selectableVolIds])

  useEffect(() => {
    let cancelled = false
    setLibrarySyncMessage('')
    void Promise.all([
      listNativeDownloadTasks(),
      listNativeDownloadedFiles()
    ]).then(([taskResult, libraryResult]) => {
      if (cancelled) return
      if (taskResult.ok && taskResult.value !== undefined && libraryResult.ok && libraryResult.value !== undefined) {
        replaceWithNativeSnapshot({ tasks: taskResult.value, library: libraryResult.value })
        return
      }
      if (libraryResult.ok && libraryResult.value !== undefined) {
        replaceLibrary(libraryResult.value)
      }
      const nativeError = [taskResult, libraryResult].find((result) => !result.ok && !isNativeUnavailable(result))
      if (nativeError) {
        setLibrarySyncMessage(readableAppMessage(nativeError.message, '暂时无法同步下载状态。'))
      }
    })
    return () => {
      cancelled = true
    }
  }, [comicId, replaceLibrary, replaceWithNativeSnapshot])

  useEffect(() => {
    if (!hasActiveDetailDownload || readerFlow) return undefined
    let cancelled = false
    const poll = async () => {
      const [taskResult, libraryResult] = await Promise.all([
        listNativeDownloadTasks({ recoverInterrupted: false }),
        listNativeDownloadedFiles()
      ])
      if (cancelled) return
      if (taskResult.ok && taskResult.value !== undefined && libraryResult.ok && libraryResult.value !== undefined) {
        replaceWithNativeSnapshot(
          { tasks: taskResult.value, library: libraryResult.value },
          { recoverInterrupted: false }
        )
      }
      if (!cancelled) detailPollTimer.current = window.setTimeout(poll, 450)
    }
    detailPollTimer.current = window.setTimeout(poll, 150)
    return () => {
      cancelled = true
      if (detailPollTimer.current) window.clearTimeout(detailPollTimer.current)
    }
  }, [hasActiveDetailDownload, readerFlow, replaceWithNativeSnapshot])

  useEffect(
    () => () => {
      readerFlowRunId.current += 1
      if (detailPollTimer.current) window.clearTimeout(detailPollTimer.current)
      clearLongPressTimer()
    },
    []
  )

  const createTasks = useMutation({
    mutationFn: async () => {
      if (!detail.data) return []
      if (!session.data?.authenticated) throw new Error('请先登录账号，再加入下载队列。')
      const queueableOptions = detail.data.downloadOptions.filter((option) => selected.includes(option.volId) && canQueueDownloadModeOption(option, downloadModeFormat))
      if (queueableOptions.length === 0) return []
      const tasks: DownloadTask[] = []
      if (downloadModeFormat === 'auto') {
        for (const groupFormat of ['epub', 'source_zip', 'mobi'] as DownloadFormat[]) {
          const groupVolIds = queueableOptions
            .filter((option) => resolveDownloadFormatForOption(option, 'auto') === groupFormat)
            .map((option) => option.volId)
          if (groupVolIds.length === 0) continue
          tasks.push(...await api.createDownloadTasks({ comic: detail.data, selectedVolIds: groupVolIds, format: groupFormat }))
        }
      } else {
        tasks.push(...await api.createDownloadTasks({
          comic: detail.data,
          selectedVolIds: queueableOptions.map((option) => option.volId),
          format: downloadModeFormat
        }))
      }
      if (tasks.length === 0) {
        throw new Error('没有生成可下载任务，请刷新详情后重试。')
      }
      const nativeResult = await enqueueNativeDownloadTasks(tasks)
      setNativeQueueMessage(readableAppMessage(nativeResult.message, '暂时无法加入下载队列，请稍后重试。'))
      if (nativeResult.ok && nativeResult.value !== undefined) {
        const created = downloadStore.addTasks(nativeResult.value)
        if (mobileFileDownload && tasks.length > 0) {
          void startMobileDownloadQueueAfterEnqueue()
        }
        return created
      }
      if (isNativeUnavailable(nativeResult)) {
        throw new Error('请在 Kmoe 客户端中创建真实下载队列。')
      }
      throw new Error(nativeResult.message)
    }
  })

  const handleBack = useCallback(() => {
    if (navigationType === 'PUSH') {
      navigate(-1)
      return
    }
    navigate('/')
  }, [navigate, navigationType])

  if (detail.isLoading) {
    return (
      <DetailLoadingPage
        title={routePreview.title ?? '正在加载漫画详情'}
        coverUrl={routePreview.coverUrl}
        colorize={colorizeDetailPage}
        style={detailThemeStyle}
        onBack={handleBack}
      />
    )
  }
  if (detail.isError) {
    return (
      <div className="content-grid">
        <div className="detail-page-toolbar">
          <Button variant="ghost" className="detail-back-button" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </div>
        <EmptyState title="详情加载失败">{readableAppMessage(detail.error, '暂时无法加载漫画详情，请检查网络后重试。')}</EmptyState>
      </div>
    )
  }
  if (!detail.data) {
    return (
      <div className="content-grid">
        <div className="detail-page-toolbar">
          <Button variant="ghost" className="detail-back-button" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
        </div>
        <EmptyState title="未找到漫画" />
      </div>
    )
  }

  const comic = detail.data
  const readerEntries = comic.downloadOptions.map((option) => ({ option, state: readerOptionState(option) }))
  const continueReaderEntry = readerEntries.find((entry) => entry.state.kind === 'continue_reading')
  const firstEnabledReaderEntry = readerEntries.find((entry) => entry.state.enabled)
  const primaryReaderEntry = continueReaderEntry ?? firstEnabledReaderEntry
  const startReaderEntry = readerEntries[0]

  function toggleShelf() {
    if (isInShelf) {
      removeFromShelf([comic.id])
      return
    }
    addToShelf({
      comicId: comic.id,
      comicTitle: comic.title,
      comicUrl: comic.url,
      coverUrl: comic.coverUrl,
      author: comic.authors.join(', '),
      status: comic.status,
      latestVolume: comic.downloadOptions[0]?.displayTitle,
      unreadCount: comic.downloadOptions.length
    })
  }

  function clearDownloadSelection() {
    setSelected([])
    setSelectionMode(false)
    setLastSelectedIndex(undefined)
  }

  async function syncNativeDownloadSnapshot(options?: { recoverInterrupted?: boolean }) {
    const [taskResult, libraryResult] = await Promise.all([
      listNativeDownloadTasks({ recoverInterrupted: options?.recoverInterrupted ?? false }),
      listNativeDownloadedFiles()
    ])
    if (taskResult.ok && taskResult.value !== undefined && libraryResult.ok && libraryResult.value !== undefined) {
      return replaceWithNativeSnapshot(
        { tasks: taskResult.value, library: libraryResult.value },
        { recoverInterrupted: options?.recoverInterrupted ?? false }
      )
    }
    const nativeError = [taskResult, libraryResult].find((result) => !result.ok && !isNativeUnavailable(result))
    if (nativeError) {
      setNativeQueueMessage(readableAppMessage(nativeError.message, '下载已启动，但暂时无法同步队列状态。'))
    }
    return undefined
  }

  async function startMobileDownloadQueueAfterEnqueue() {
    setNativeQueueMessage('已加入队列，正在 iPhone/iPad 前台启动下载；请保持 App 打开。')

    const preflightResult = await preflightNativeDownloadQueue(settings.downloadDirectory)
    if (preflightResult.ok && preflightResult.value) {
      const blockingCheck = preflightResult.value.checks.find((check) => check.status === 'fail' && check.id !== 'active-task')
      if (blockingCheck) {
        setNativeQueueMessage(readableAppMessage(blockingCheck.detail, '下载前检查未通过，请处理后重试。'))
        return
      }
      const activeTaskCheck = preflightResult.value.checks.find((check) => check.status === 'fail' && check.id === 'active-task')
      if (activeTaskCheck) {
        setNativeQueueMessage('已有下载正在运行，正在刷新 iPhone/iPad 前台队列状态。')
        await syncNativeDownloadSnapshot({ recoverInterrupted: false })
        return
      }
    } else if (!isNativeUnavailable(preflightResult)) {
      setNativeQueueMessage(readableAppMessage(preflightResult.message, '暂时无法检查下载队列，请稍后重试。'))
      return
    }

    const queueRun = startNativeDownloadQueue(settings.downloadDirectory)
    const firstResult = await Promise.race([queueRun, delay(220).then(() => undefined)])
    if (!firstResult) {
      setNativeQueueMessage('iPhone/iPad 前台下载运行中，请保持 App 打开；完成后会同步资料库。')
      await delay(300)
      await syncNativeDownloadSnapshot({ recoverInterrupted: false })
      const result = await queueRun
      if (result.ok) {
        await syncNativeDownloadSnapshot({ recoverInterrupted: false })
        setNativeQueueMessage('下载完成，已同步本机资料库。')
        return
      }
      setNativeQueueMessage(readableAppMessage(result.message, '下载队列启动失败，请到下载中心重试。'))
      return
    }

    if (firstResult.ok) {
      await syncNativeDownloadSnapshot({ recoverInterrupted: false })
      setNativeQueueMessage('下载队列已处理完成，已同步本机资料库。')
      return
    }
    setNativeQueueMessage(readableAppMessage(firstResult.message, '下载队列启动失败，请到下载中心重试。'))
  }

  function toggleDownloadOption(option: VolumeDownloadOption, index: number, event?: ReactMouseEvent) {
    if (!canQueueDownloadModeOption(option, downloadModeFormat)) return
    if (event?.shiftKey && lastSelectedIndex !== undefined) {
      const [start, end] = [lastSelectedIndex, index].sort((left, right) => left - right)
      const rangeIds = comic.downloadOptions
        .slice(start, end + 1)
        .filter((item) => canQueueDownloadModeOption(item, downloadModeFormat))
        .map((item) => item.volId)
      setSelected((current) => Array.from(new Set([...current, ...rangeIds])))
    } else {
      setSelected((current) => (current.includes(option.volId) ? current.filter((id) => id !== option.volId) : [...current, option.volId]))
    }
    setLastSelectedIndex(index)
    setSelectionMode(true)
  }

  function clearLongPressTimer() {
    if (longPressTimer.current !== undefined) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = undefined
    }
  }

  function handleDownloadRowPointerDown(option: VolumeDownloadOption, index: number, event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' || isInteractiveTarget(event.target)) return
    clearLongPressTimer()
    longPressTimer.current = window.setTimeout(() => {
      ignoreNextDownloadClick.current = true
      setSelectionMode(true)
      setSelected((current) => current.includes(option.volId) ? current : [...current, option.volId])
      setLastSelectedIndex(index)
    }, 320)
  }

  function handleDownloadListPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || isInteractiveTarget(event.target)) return
    const bounds = downloadListRef.current?.getBoundingClientRect()
    if (!bounds) return
    const box = {
      startX: event.clientX - bounds.left,
      startY: event.clientY - bounds.top,
      currentX: event.clientX - bounds.left,
      currentY: event.clientY - bounds.top
    }
    setSelectionBox(box)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleDownloadListPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (selectionBox) {
      const bounds = downloadListRef.current?.getBoundingClientRect()
      if (!bounds) return
      const nextBox = {
        ...selectionBox,
        currentX: event.clientX - bounds.left,
        currentY: event.clientY - bounds.top
      }
      setSelectionBox(nextBox)
      selectOptionsInsideBox(nextBox)
      return
    }

    if (event.pointerType === 'mouse' || !selectionMode) return
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-download-vol-id]')
    const volId = element?.dataset.downloadVolId
    const option = volId ? comic.downloadOptions.find((item) => item.volId === volId) : undefined
    if (!option || !canQueueDownloadModeOption(option, downloadModeFormat)) return
    setSelected((current) => current.includes(option.volId) ? current : [...current, option.volId])
  }

  function handleDownloadListPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    clearLongPressTimer()
    if (selectionBox) {
      setSelectionMode(true)
      setSelectionBox(undefined)
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // The pointer may already be released by the browser.
      }
    }
  }

  function selectOptionsInsideBox(box: SelectionBoxState) {
    const list = downloadListRef.current
    if (!list) return
    const listBounds = list.getBoundingClientRect()
    const selectionRect = normalizeSelectionRect(box, listBounds)
    const selectedIds: string[] = []
    list.querySelectorAll<HTMLElement>('[data-download-vol-id]').forEach((element) => {
      const volId = element.dataset.downloadVolId
      const option = volId ? comic.downloadOptions.find((item) => item.volId === volId) : undefined
      if (!option || !canQueueDownloadModeOption(option, downloadModeFormat)) return
      if (rectsIntersect(selectionRect, element.getBoundingClientRect())) selectedIds.push(option.volId)
    })
    if (selectedIds.length === 0) return
    setSelected((current) => Array.from(new Set([...current, ...selectedIds])))
  }

  async function openReaderOption(option: VolumeDownloadOption, state = readerOptionState(option)) {
    if (state.cache) {
      navigate(`/reader/cache/${encodeURIComponent(state.cache.id)}`)
      return
    }

    if (state.kind === 'source_downloading' && state.sourceTask && state.readerFormat && state.sourceTask.status !== 'paused') {
      if (state.sourceTask.status === 'queued' && !requireAuthenticatedForWebsiteTask('reader')) return
      const runId = readerFlowRunId.current + 1
      readerFlowRunId.current = runId
      setPreparingReaderVolId(option.volId)
      setReaderMessage('')
      updateReaderFlow(runId, readerFlowForTask(option, state.readerFormat, state.sourceTask))
      await runQueuedReaderDownloadFlow({
        option,
        readerFormat: state.readerFormat,
        targetTask: state.sourceTask,
        createdCount: 0,
        runId
      })
      return
    }

    if (state.kind === 'source_completed_missing_library' && state.readerFormat) {
      setPreparingReaderVolId(option.volId)
      setReaderMessage('')
      const outcome = await syncNativeLibraryRecords(replaceLibrary)
      const sourceFile = outcome.status === 'synced'
        ? findUsableReaderArchiveForVolume(outcome.library, comic.id, option.volId, [state.readerFormat])
        : undefined
      if (sourceFile) {
        await prepareReaderCacheFromSourceArchive(option, sourceFile, state.readerFormat)
        return
      }
      setPreparingReaderVolId('')
      setReaderMessage(outcome.status === 'error'
        ? readableAppMessage(outcome.message, '资料库同步失败，请到下载中心检查任务。')
        : '下载任务已完成，但还没有找到可用文件记录，请到下载中心同步或重试。'
      )
      return
    }

    if (readerEntryNeedsDownloadCenter(state)) {
      setReaderMessage(`「${option.displayTitle}」${state.helper}`)
      navigate('/downloads')
      return
    }

    if (state.kind === 'queue_source_zip') {
      if (!requireAuthenticatedForWebsiteTask('reader')) return
      const readerFormat = state.readerFormat ?? 'source_zip'
      const runId = readerFlowRunId.current + 1
      readerFlowRunId.current = runId
      setPreparingReaderVolId(option.volId)
      updateReaderFlow(runId, {
        volId: option.volId,
        stage: 'queue',
        percent: 8,
        title: `正在创建${readerArchiveFormatLabel(readerFormat)}任务`,
        detail: '会创建一个本地单项任务，不会触发整本或批量下载。'
      })
      setReaderMessage('')
      const tasks = await api.createDownloadTasks({ comic, selectedVolIds: [option.volId], format: readerFormat })
      if (tasks.length === 0) {
        setPreparingReaderVolId('')
        updateReaderFlow(runId, {
          volId: option.volId,
          stage: 'failed',
          percent: 100,
          title: '没有生成下载任务',
          detail: `没有生成「${option.displayTitle}」的${readerArchiveFormatLabel(readerFormat)}任务，请刷新详情后重试。`
        })
        setReaderMessage(`没有生成「${option.displayTitle}」的${readerArchiveFormatLabel(readerFormat)}任务，请刷新详情后重试。`)
        return
      }
      const nativeResult = await enqueueNativeDownloadTasks(tasks)
      if (nativeResult.ok && nativeResult.value !== undefined) {
        let candidateTasks = nativeResult.value
        if (candidateTasks.length > 0) {
          downloadStore.addTasks(candidateTasks)
        } else {
          const [taskResult, libraryResult] = await Promise.all([
            listNativeDownloadTasks({ recoverInterrupted: false }),
            listNativeDownloadedFiles()
          ])
          if (!readerFlowIsActive(runId)) return
          if (taskResult.ok && taskResult.value !== undefined && libraryResult.ok && libraryResult.value !== undefined) {
            const snapshot = replaceWithNativeSnapshot(
              { tasks: taskResult.value, library: libraryResult.value },
              { recoverInterrupted: false }
            )
            candidateTasks = snapshot.tasks
          } else {
            const nativeError = [taskResult, libraryResult].find((result) => !result.ok && !isNativeUnavailable(result))
            setPreparingReaderVolId('')
            setReaderFlow(undefined)
            setReaderMessage(readableAppMessage(nativeError?.message, `下载队列已有这个${readerArchiveFormatLabel(readerFormat)}任务，但暂时无法同步队列状态。`))
            return
          }
        }
        const targetTask = findReaderDownloadTask(candidateTasks, option, readerFormat)
        if (!targetTask) {
          setPreparingReaderVolId('')
          setReaderFlow(undefined)
          setReaderMessage(`下载队列已有这个${readerArchiveFormatLabel(readerFormat)}任务，但没有找到可启动的本地任务记录。请到下载中心同步后重试。`)
          return
        }
        await runQueuedReaderDownloadFlow({ option, readerFormat, targetTask, createdCount: nativeResult.value.length, runId })
        return
      }
      setPreparingReaderVolId('')
      setReaderFlow(undefined)
      if (isNativeUnavailable(nativeResult)) {
        setReaderMessage(`请在 Kmoe 客户端中创建「${option.displayTitle}」的真实${readerArchiveFormatLabel(readerFormat)}下载任务。`)
        return
      }
      setReaderMessage(readableAppMessage(nativeResult.message, `暂时无法加入${readerArchiveFormatLabel(readerFormat)}下载队列，请稍后重试。`))
      return
    }

    const sourceArchive = state.sourceFile
    if (!sourceArchive) {
      setReaderMessage(`「${option.displayTitle}」${state.helper}`)
      return
    }
    if (isMetadataOnlyDownloadedFile(sourceArchive)) {
      setReaderMessage(`「${option.displayTitle}」只有资料库记录，还需要先在资料库绑定本机${readerArchiveFormatLabel(sourceArchive.format as ReaderArchiveFormat)}文件。`)
      return
    }

    setPreparingReaderVolId(option.volId)
    setReaderMessage('')
    await prepareReaderCacheFromSourceArchive(option, sourceArchive, sourceArchive.format as ReaderArchiveFormat)
  }

  async function deleteLocalDataForOption(option: VolumeDownloadOption, state = readerOptionState(option)) {
    setDeletingReaderVolId(option.volId)
    setReaderMessage('')
    const outcome = await deleteLocalReadingData({
      comicIds: [comic.id],
      volumeIds: [option.volId],
      chapterIds: state.cache ? [state.cache.id] : undefined,
      includeSourceFiles: true
    })
    setDeletingReaderVolId('')
    setReaderMessage(outcome.ok
      ? `已删除「${option.displayTitle}」的本地阅读数据；再次阅读会重新获取。`
      : outcome.message
    )
  }

  async function runQueuedReaderDownloadFlow(input: {
    option: VolumeDownloadOption
    readerFormat: ReaderArchiveFormat
    targetTask?: DownloadTask
    createdCount: number
    runId: number
  }) {
    const { option, readerFormat, targetTask, createdCount, runId } = input
    if (!targetTask) {
      setPreparingReaderVolId('')
      updateReaderFlow(runId, undefined)
      setReaderMessage(`没有生成「${option.displayTitle}」的${readerArchiveFormatLabel(readerFormat)}任务，请刷新详情后重试。`)
      return
    }
    let activeTargetTask = targetTask

    if (targetTask.status === 'queued') {
      updateReaderFlow(runId, {
        volId: option.volId,
        stage: 'queue',
        percent: 10,
        title: '正在优先处理当前阅读项',
        detail: '会把当前卷/话设为下一项，不再被旧的排队任务挡住。'
      })
      const priorityResult = await prioritizeNativeDownloadTask(targetTask.id)
      if (!readerFlowIsActive(runId)) return
      if (priorityResult.ok && priorityResult.value) {
        activeTargetTask = priorityResult.value
        const [taskResult, libraryResult] = await Promise.all([
          listNativeDownloadTasks({ recoverInterrupted: false }),
          listNativeDownloadedFiles()
        ])
        if (!readerFlowIsActive(runId)) return
        if (taskResult.ok && taskResult.value !== undefined && libraryResult.ok && libraryResult.value !== undefined) {
          const snapshot = replaceWithNativeSnapshot(
            { tasks: taskResult.value, library: libraryResult.value },
            { recoverInterrupted: false }
          )
          activeTargetTask = findReaderDownloadTask(snapshot.tasks, option, readerFormat, activeTargetTask.id) ?? activeTargetTask
        }
      } else if (!isNativeUnavailable(priorityResult)) {
        setPreparingReaderVolId('')
        updateReaderFlow(runId, undefined)
        setReaderMessage(readableAppMessage(priorityResult.message, '暂时无法调整下载顺序，请到下载中心重试。'))
        return
      }
    }

    updateReaderFlow(runId, {
      volId: option.volId,
      stage: 'preflight',
      percent: 14,
      title: createdCount > 0 ? '已加入队列，正在检查下载条件' : '任务已在队列中，正在检查下载条件',
      detail: '检查保存位置和当前队列状态。'
    })

    const preflightResult = await preflightNativeDownloadQueue(settings.downloadDirectory)
    if (!readerFlowIsActive(runId)) return
    if (preflightResult.ok && preflightResult.value) {
      const blockingCheck = preflightResult.value.checks.find((check) => check.status === 'fail' && check.id !== 'active-task')
      if (blockingCheck) {
        setPreparingReaderVolId('')
        updateReaderFlow(runId, {
          volId: option.volId,
          stage: 'failed',
          percent: 100,
          title: '下载前检查未通过',
          detail: readableAppMessage(blockingCheck.detail, '请处理下载条件后重试。')
        })
        setReaderMessage(readableAppMessage(blockingCheck.detail, '下载前检查未通过，请处理后重试。'))
        return
      }
    } else if (!isNativeUnavailable(preflightResult)) {
      setPreparingReaderVolId('')
      updateReaderFlow(runId, undefined)
      setReaderMessage(readableAppMessage(preflightResult.message, '暂时无法检查下载队列，请稍后重试。'))
      return
    }

    updateReaderFlow(runId, {
      volId: option.volId,
      stage: 'download',
      percent: Math.max(18, activeTargetTask.progress),
      title: `正在下载${readerArchiveFormatLabel(readerFormat)}`,
      detail: '下载完成后会自动同步资料库并准备阅读缓存。'
    })

    const queueRun = startNativeDownloadQueue(settings.downloadDirectory).then(async (firstResult) => {
      if (firstResult.ok) return firstResult
      await delay(500)
      const taskResult = await listNativeDownloadTasks({ recoverInterrupted: false })
      if (taskResult.ok && taskResult.value !== undefined) {
        const queuedTarget = findReaderDownloadTask(taskResult.value, option, readerFormat, activeTargetTask.id)
        if (queuedTarget?.status === 'queued') return startNativeDownloadQueue(settings.downloadDirectory)
      }
      return firstResult
    })
    const result = await waitForReaderArchiveDownload({ option, readerFormat, targetTask: activeTargetTask, queueRun, runId })
    if (!readerFlowIsActive(runId)) return
    if (!result.ok) {
      setPreparingReaderVolId('')
      updateReaderFlow(runId, {
        volId: option.volId,
        stage: 'failed',
        percent: 100,
        title: '阅读准备失败',
        detail: result.message
      })
      setReaderMessage(result.message)
      return
    }

    await prepareReaderCacheFromSourceArchive(option, result.file, readerFormat, runId)
  }

  async function waitForReaderArchiveDownload(input: {
    option: VolumeDownloadOption
    readerFormat: ReaderArchiveFormat
    targetTask: DownloadTask
    queueRun: Promise<{ ok: boolean; available: boolean; message: string }>
    runId: number
  }): Promise<{ ok: true; file: DownloadedFile } | { ok: false; message: string }> {
    const { option, readerFormat, targetTask, queueRun, runId } = input
    let queueResult: { ok: boolean; available: boolean; message: string } | undefined
    let lastSample: { bytes: number; sampledAt: number } | undefined
    let smoothedSpeedBytesPerSecond: number | undefined
    let lastSpeedAt = 0
    void queueRun.then((result) => {
      queueResult = result
    })

    for (let attempt = 0; attempt < 900; attempt += 1) {
      if (!readerFlowIsActive(runId)) return { ok: false, message: '阅读准备已取消。' }
      let latestTask: DownloadTask | undefined
      const [taskResult, libraryResult] = await Promise.all([
        listNativeDownloadTasks({ recoverInterrupted: false }),
        listNativeDownloadedFiles()
      ])
      if (taskResult.ok && taskResult.value !== undefined && libraryResult.ok && libraryResult.value !== undefined) {
        const snapshot = replaceWithNativeSnapshot(
          { tasks: taskResult.value, library: libraryResult.value },
          { recoverInterrupted: false }
        )
        latestTask = findReaderDownloadTask(snapshot.tasks, option, readerFormat, targetTask.id)
        const sourceFile = findUsableReaderArchiveForVolume(snapshot.library, comic.id, option.volId, [readerFormat])
        if (latestTask) {
          const sampledAt = Date.now()
          if (lastSample && sampledAt > lastSample.sampledAt && latestTask.downloadedBytes > lastSample.bytes) {
            const instantSpeed = (latestTask.downloadedBytes - lastSample.bytes) / ((sampledAt - lastSample.sampledAt) / 1000)
            smoothedSpeedBytesPerSecond = smoothedSpeedBytesPerSecond === undefined
              ? instantSpeed
              : (smoothedSpeedBytesPerSecond * 0.65) + (instantSpeed * 0.35)
            lastSpeedAt = sampledAt
            lastSample = { bytes: latestTask.downloadedBytes, sampledAt }
          } else if (!lastSample || latestTask.downloadedBytes < lastSample.bytes) {
            lastSample = { bytes: latestTask.downloadedBytes, sampledAt }
          } else if (lastSpeedAt > 0 && sampledAt - lastSpeedAt > 5000) {
            smoothedSpeedBytesPerSecond = undefined
          }
          updateReaderFlow(runId, readerFlowForTask(option, readerFormat, latestTask, smoothedSpeedBytesPerSecond))
          if (latestTask.status === 'failed' || latestTask.status === 'cancelled') {
            return {
              ok: false,
              message: latestTask.errorMessage
                ? readableAppMessage(latestTask.errorMessage, `${readerArchiveFormatLabel(readerFormat)}任务未完成。`)
                : `${readerArchiveFormatLabel(readerFormat)}任务${latestTask.status === 'failed' ? '下载失败' : '已取消'}，请到下载中心重试。`
            }
          }
        }
        if (sourceFile) return { ok: true, file: sourceFile }
      } else {
        const nativeError = [taskResult, libraryResult].find((result) => !result.ok && !isNativeUnavailable(result))
        if (nativeError) return { ok: false, message: readableAppMessage(nativeError.message, '无法同步下载状态。') }
      }

      if (queueResult && !queueResult.ok) {
        return { ok: false, message: readableAppMessage(queueResult.message, '下载队列启动失败，请到下载中心重试。') }
      }
      if (queueResult?.ok) {
        if (latestTask && ['queued', 'authorizing', 'downloading', 'verifying'].includes(latestTask.status)) {
          await delay(250)
          continue
        }
        const libraryOutcome = await syncNativeLibraryRecords(replaceLibrary)
        if (libraryOutcome.status === 'synced') {
          const sourceFile = findUsableReaderArchiveForVolume(libraryOutcome.library, comic.id, option.volId, [readerFormat])
          if (sourceFile) return { ok: true, file: sourceFile }
        }
        return {
          ok: false,
          message: `${readerArchiveFormatLabel(readerFormat)}任务已结束，但资料库没有找到可用文件记录。请到下载中心同步或重试。`
        }
      }

      await delay(250)
    }

    return {
      ok: false,
      message: `${readerArchiveFormatLabel(readerFormat)}下载仍在进行。请到下载中心查看进度，完成后可再次点击阅读。`
    }
  }

  async function prepareReaderCacheFromSourceArchive(
    option: VolumeDownloadOption,
    sourceArchive: DownloadedFile,
    readerFormat: ReaderArchiveFormat,
    runId?: number
  ) {
    updateReaderFlow(runId, {
      volId: option.volId,
      stage: 'cache',
      percent: 92,
      title: '正在准备阅读缓存',
      detail: `已完成${readerArchiveFormatLabel(readerFormat)}下载，正在生成本地阅读页。`
    })
    const result = await prepareNativeReaderChapterCache({
      archivePath: sourceArchive.localPath,
      comicId: comic.id,
      comicTitle: comic.title,
      volumeId: option.volId,
      volumeTitle: option.displayTitle,
      sourceTaskId: sourceArchive.taskId,
      format: readerFormat,
      policy: 'balanced'
    })
    if (runId !== undefined && !readerFlowIsActive(runId)) return
    setPreparingReaderVolId('')
    if (result.ok && result.value) {
      upsertChapter(result.value.chapter)
      registerPages(result.value.chapter.id, result.value.pages)
      updateReaderFlow(runId, {
        volId: option.volId,
        stage: 'done',
        percent: 100,
        title: '阅读缓存已准备好',
        detail: '正在打开内置阅读器。'
      })
      navigate(`/reader/cache/${encodeURIComponent(result.value.chapter.id)}`)
      return
    }
    updateReaderFlow(runId, {
      volId: option.volId,
      stage: 'failed',
      percent: 100,
      title: '阅读缓存准备失败',
      detail: readableAppMessage(result.message, `暂时无法准备${readerArchiveFormatLabel(readerFormat)}阅读缓存。`)
    })
    setReaderMessage(readableAppMessage(result.message, `暂时无法准备${readerArchiveFormatLabel(readerFormat)}阅读缓存，请确认文件仍在本机。`))
  }

  function readerFlowIsActive(runId: number): boolean {
    return readerFlowRunId.current === runId
  }

  function updateReaderFlow(runId: number | undefined, value: ReaderFlowState | undefined) {
    if (runId !== undefined && !readerFlowIsActive(runId)) return
    setReaderFlow(value)
  }

  function readerOptionState(option: VolumeDownloadOption): ReaderEntryState {
    return resolveReaderEntryState({
      option,
      chapters: cachedChapters,
      library: downloadStore.library,
      tasks: downloadStore.tasks
    })
  }

  function requireAuthenticatedForWebsiteTask(surface: 'download' | 'reader'): boolean {
    if (session.data?.authenticated) return true
    const message = session.isLoading || session.isFetching
      ? '正在确认登录状态，请稍后再试。'
      : '请先登录账号，再创建下载任务。'
    if (surface === 'reader') {
      setReaderMessage(message)
    } else {
      setNativeQueueMessage(message)
    }
    if (!session.isLoading && !session.isFetching) navigate('/login')
    return false
  }

  return (
    <div
      className={`detail-reading-page content-grid ${downloadModeOpen ? 'download-mode-open' : ''}`}
      data-cover-theme={colorizeDetailPage ? 'true' : undefined}
      style={detailThemeStyle}
    >
      <div className="detail-page-toolbar">
        <Button variant="ghost" className="detail-back-button" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
      </div>
      <section className="detail-reader-hero detail-shell rounded-[var(--radius-panel)] p-4 md:p-6">
        <div className="detail-cover-column mx-auto w-full max-w-[260px] lg:max-w-[300px]">
          <div className="cover-art aspect-[7/10] overflow-hidden subtle-fill">
            <CoverImage src={comic.coverUrl} title={comic.title} subtitle={comic.authors.join(', ')} priority />
          </div>
          <div className="detail-cover-stats mt-4 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="评分" value={comic.rating ?? '-'} />
            <MiniStat label="热度" value={comic.heat ?? '-'} />
            <MiniStat label="状态" value={comic.status ?? '-'} />
          </div>
        </div>
        <div className="detail-info min-w-0 self-center">
          <div className="detail-title-block min-w-0">
            <div className="detail-eyebrow mb-3 text-xs font-semibold tracking-[0.16em] text-[var(--app-muted)]">阅读详情</div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title max-w-4xl break-words">{comic.title}</h1>
              {comic.status ? <Badge tone="info">{comic.status}</Badge> : null}
              {comic.language ? <Badge>{comic.language}</Badge> : null}
              {comic.rating ? <Badge tone="warning">{comic.rating}</Badge> : null}
            </div>
            <div className="detail-alias mt-3 break-words text-sm leading-6 text-[var(--app-muted)]">{comic.aliases.join(' / ')}</div>
          </div>
          <dl className="detail-meta-grid mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Info label="作者" value={comic.authors.join(', ')} />
            <Info label="地区" value={comic.region} />
            <Info label="热度" value={comic.heat} />
            <Info label="分类" value={comic.categories.join(', ')} />
            <Info label="额度提示" value={comic.quotaHint} />
            <Info label="作品编号" value={comic.id} />
          </dl>
          <p className="detail-description mt-5 max-w-3xl text-sm leading-7 text-[var(--app-muted)]">{comic.description}</p>
          <div className="detail-actions detail-primary-actions mt-6 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!primaryReaderEntry?.state.enabled || preparingReaderVolId === primaryReaderEntry?.option.volId}
              onClick={() => {
                if (primaryReaderEntry) void openReaderOption(primaryReaderEntry.option, primaryReaderEntry.state)
              }}
            >
              <BookOpen className="h-4 w-4" />
              {preparingReaderVolId === primaryReaderEntry?.option.volId ? '准备中' : detailPrimaryReaderActionLabel(primaryReaderEntry?.state)}
            </Button>
            <Button
              variant="secondary"
              disabled={!startReaderEntry?.state.enabled || preparingReaderVolId === startReaderEntry?.option.volId}
              onClick={() => {
                if (startReaderEntry) void openReaderOption(startReaderEntry.option, startReaderEntry.state)
              }}
            >
              <Play className="h-4 w-4" />
              从头阅读
            </Button>
            {primaryReaderEntry && hasReaderLocalData(primaryReaderEntry.state) ? (
              <Button
                variant="danger"
                disabled={deletingReaderVolId === primaryReaderEntry.option.volId}
                onClick={() => void deleteLocalDataForOption(primaryReaderEntry.option, primaryReaderEntry.state)}
              >
                <Trash2 className="h-4 w-4" />
                {deletingReaderVolId === primaryReaderEntry.option.volId ? '删除中' : '删除本地数据'}
              </Button>
            ) : null}
            <Button variant={isInShelf ? 'secondary' : 'primary'} onClick={toggleShelf}>
              {isInShelf ? <BookMarked className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
              {isInShelf ? '已在书架' : '加入书架'}
            </Button>
            <Button variant="secondary" className="detail-secondary-action" onClick={() => setDownloadModeOpen(true)}>
              <Download className="h-4 w-4" />
              离线下载
            </Button>
            <div className="detail-more-wrap">
              <Button variant="secondary" className="detail-secondary-action" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
                <MoreHorizontal className="h-4 w-4" />
                更多
              </Button>
              {moreOpen ? (
                <div className="detail-more-menu">
                  <Link to="/shelf">查看书架</Link>
                  <Link to="/downloads">下载中心</Link>
                  <Link to="/library">资料库</Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="reading-directory-panel grid gap-4 rounded-[var(--radius-panel)] p-4 md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">目录</h2>
            <p className="mt-1 text-sm text-[var(--app-muted)]">选择卷/话开始阅读；离线状态会在条目右侧轻量显示。</p>
          </div>
          <Button variant="secondary" onClick={() => setDownloadModeOpen(true)}>
            <Download className="h-4 w-4" />
            离线下载
          </Button>
        </div>
        {librarySyncMessage ? <div className="metric-tile p-3 text-sm text-[var(--app-muted)]">{librarySyncMessage}</div> : null}
        {readerFlow ? <ReaderFlowPanel flow={readerFlow} /> : null}
        {readerMessage ? <div className="metric-tile p-3 text-sm text-[var(--app-muted)]">{readerMessage}</div> : null}
        <div className="reading-directory-list">
          {readerEntries.map(({ option, state }, index) => (
            <ReadingDirectoryCard
              key={option.id}
              option={option}
              state={state}
              index={index}
              readerBusy={preparingReaderVolId === option.volId}
              deletingLocalData={deletingReaderVolId === option.volId}
              onRead={() => void openReaderOption(option, state)}
              onDelete={hasReaderLocalData(state) ? () => void deleteLocalDataForOption(option, state) : undefined}
            />
          ))}
        </div>
      </section>

      {downloadModeOpen ? (
        <>
          <button className="download-mode-backdrop" aria-label="关闭离线下载" onClick={() => setDownloadModeOpen(false)} />
          <aside id="download-selection" className="download-mode-panel" aria-label="离线下载">
            <div className="download-mode-header">
              <div className="min-w-0">
                <div className="detail-eyebrow mb-2 text-xs font-semibold tracking-[0.14em] text-[var(--app-muted)]">离线下载</div>
                <h2 className="break-words text-xl font-black">选择内容</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">选择卷/话和格式，队列会按单项顺序下载并同步资料库。</p>
              </div>
              <button className="download-mode-close pressable" type="button" aria-label="关闭离线下载" onClick={() => setDownloadModeOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <DownloadModeFormatPicker value={downloadModeFormat} onChange={setDownloadModeFormat} />
            <div className="download-mode-summary">
              <div>
                <span>已选择</span>
                <strong>{selectedQueueableCount}</strong>
                <span>/ {selectableOptions.length} 项</span>
              </div>
              <Badge tone={session.data?.authenticated ? 'success' : 'warning'}>
                {session.data?.authenticated ? '已登录' : '需登录'}
              </Badge>
            </div>
            <div className="download-mode-actions">
              <Button
                onClick={() => {
                  if (allSelected) {
                    clearDownloadSelection()
                    return
                  }
                  setSelected(selectableOptions.map((option) => option.volId))
                  setSelectionMode(true)
                }}
                disabled={selectableOptions.length === 0}
              >
                {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allSelected ? '取消全选' : '全选'}
              </Button>
              <Button variant="ghost" onClick={clearDownloadSelection}>
                清空
              </Button>
              <Button
                variant="primary"
                disabled={selectedQueueableCount === 0 || createTasks.isPending}
                onClick={() => {
                  if (requireAuthenticatedForWebsiteTask('download')) createTasks.mutate()
                }}
              >
                <Download className="h-4 w-4" />
                {mobileFileDownload ? '加入并开始' : '加入队列'}
              </Button>
            </div>
            {createTasks.data ? (
              <div className="feedback-success">
                已创建 {createTasks.data.length} 个新任务；重复项已跳过。<Link className="font-semibold underline" to="/downloads">查看下载中心</Link>
              </div>
            ) : null}
            {nativeQueueMessage ? <div className="metric-tile p-3 text-sm text-[var(--app-muted)]">{nativeQueueMessage}</div> : null}
            {createTasks.isError ? <div className="feedback-danger">{readableAppMessage(createTasks.error, '暂时无法加入下载队列，请稍后重试。')}</div> : null}
            {selected.length > 0 ? (
              <div className="soft-code text-xs leading-5">
                保存位置：{selected.slice(0, 3).map((volId) => {
                  const option = comic.downloadOptions.find((item) => item.volId === volId)
                  if (!option) return null
                  const plannedFormat = resolveDownloadFormatForOption(option, downloadModeFormat)
                  return displayPlannedPath(planDownloadPath(
                    { comicTitle: comic.title, volumeTitle: option.displayTitle, format: plannedFormat },
                    settings,
                    platformTarget
                  ), platformTarget)
                }).filter(Boolean).join('；')}
              </div>
            ) : null}
            <div
              ref={downloadListRef}
              className="download-pick-list"
              onPointerDown={handleDownloadListPointerDown}
              onPointerMove={handleDownloadListPointerMove}
              onPointerUp={handleDownloadListPointerUp}
              onPointerCancel={handleDownloadListPointerUp}
            >
              {comic.downloadOptions.map((option, index) => (
                <DownloadPickRow
                  key={option.id}
                  option={option}
                  formatMode={downloadModeFormat}
                  selected={selected.includes(option.volId)}
                  index={index}
                  onClick={(event) => {
                    if (ignoreNextDownloadClick.current) {
                      ignoreNextDownloadClick.current = false
                      return
                    }
                    toggleDownloadOption(option, index, event)
                  }}
                  onPointerDown={(event) => handleDownloadRowPointerDown(option, index, event)}
                  onPointerUp={clearLongPressTimer}
                />
              ))}
              {selectionBox ? <div className="selection-marquee" style={selectionBoxStyle(selectionBox)} /> : null}
            </div>
            {selectionMode && selectedQueueableCount > 0 ? (
              <div className="download-bulk-bar">
                <span>已选择 {selectedQueueableCount} 项 · 预计 {formatBytes(selectedEstimatedBytes)}</span>
                <Button variant="ghost" onClick={clearDownloadSelection}>取消</Button>
                <Button
                  variant="primary"
                  disabled={createTasks.isPending}
                  onClick={() => {
                    if (requireAuthenticatedForWebsiteTask('download')) createTasks.mutate()
                  }}
                >
                  {mobileFileDownload ? '加入并开始' : '加入下载队列'}
                </Button>
              </div>
            ) : null}
          </aside>
        </>
      ) : null}

      {(comic.relatedComics ?? []).length ? (
        <section className="related-comics-panel glass-panel grid gap-3 rounded-[var(--radius-panel)] p-4 md:p-5">
          <div className="related-comics-heading">
            <span className="related-comics-heading-icon" aria-hidden="true">
              <Sparkles className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-bold">相关漫画</h2>
          </div>
          <div className="related-comics-grid grid gap-3 md:grid-cols-2">
            {comic.relatedComics?.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                to={`/comic/${item.id}`}
                state={{ comicPreview: { title: item.title, coverUrl: item.coverUrl } }}
                className="related-comic-row interactive-lift"
              >
                <div className="related-comic-cover subtle-fill">
                  <CoverImage src={item.coverUrl} title={item.title} subtitle={item.author} />
                </div>
                <div className="related-comic-copy min-w-0">
                  <div className="related-comic-title">{item.title}</div>
                  <div className="related-comic-meta mt-1 flex flex-wrap gap-1 text-xs text-[var(--app-muted)]">
                    {item.score ? <span>评分 {item.score}</span> : null}
                    {item.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  {item.latestVolume ? <div className="related-comic-latest">{item.latestVolume}</div> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="hidden">
        <ProgressBar value={0} />
      </div>
    </div>
  )
}

function DetailLoadingPage({
  title,
  coverUrl,
  colorize,
  style,
  onBack
}: {
  title: string
  coverUrl?: string
  colorize: boolean
  style: CSSProperties
  onBack: () => void
}) {
  return (
    <div
      className="detail-reading-page detail-loading-page content-grid"
      data-cover-theme={colorize ? 'true' : undefined}
      style={style}
    >
      <div className="detail-page-toolbar">
        <Button variant="ghost" className="detail-back-button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
      </div>
      <section className="detail-loading-hero detail-shell rounded-[var(--radius-panel)] p-4 md:p-6">
        <div className="detail-loading-cover">
          {coverUrl ? (
            <div className="cover-art aspect-[7/10] overflow-hidden subtle-fill">
              <CoverImage src={coverUrl} title={title} priority />
            </div>
          ) : (
            <div className="skeleton aspect-[7/10] rounded-[var(--radius-cover)]" />
          )}
        </div>
        <div className="detail-loading-copy">
          <div className="detail-loading-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--detail-muted)]">Loading detail</p>
          <h1 className="mt-2 break-words text-2xl font-black md:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--detail-muted)]">
            正在读取漫画详情、目录和本地阅读状态，请稍候。
          </p>
        </div>
      </section>
      <DetailSkeleton />
    </div>
  )
}

function readDetailRoutePreview(state: unknown): DetailRoutePreview {
  if (!state || typeof state !== 'object' || !('comicPreview' in state)) return {}
  const preview = (state as { comicPreview?: unknown }).comicPreview
  if (!preview || typeof preview !== 'object') return {}
  const title = (preview as { title?: unknown }).title
  const coverUrl = (preview as { coverUrl?: unknown }).coverUrl
  return {
    title: typeof title === 'string' && title.trim() ? title : undefined,
    coverUrl: typeof coverUrl === 'string' && coverUrl.trim() ? coverUrl : undefined
  }
}

function displayPlannedPath(
  plan: ReturnType<typeof planDownloadPath>,
  platformTarget: ReturnType<typeof detectPlatformTarget>
): string {
  const prefix = platformTarget === 'ios' || platformTarget === 'ipados' ? 'App 内 / Kmoe' : '保存位置'
  return `${prefix} / ${plan.relativeDirectory} / ${plan.filename}`
}

type ReaderFlowStage = 'queue' | 'preflight' | 'download' | 'cache' | 'done' | 'failed'

interface ReaderFlowState {
  volId: string
  stage: ReaderFlowStage
  percent: number
  title: string
  detail: string
}

function ReaderFlowPanel({ flow }: { flow: ReaderFlowState }) {
  const tone = flow.stage === 'failed' ? 'danger' : flow.stage === 'done' ? 'success' : 'info'
  return (
    <div className="metric-tile grid gap-2 p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--app-fg)]">{flow.title}</div>
          <div className="mt-1 break-words text-xs leading-5 text-[var(--app-muted)]">{flow.detail}</div>
        </div>
        <Badge tone={tone}>{Math.round(flow.percent)}%</Badge>
      </div>
      <ProgressBar value={flow.percent} />
    </div>
  )
}

function findReaderDownloadTask(
  tasks: DownloadTask[],
  option: VolumeDownloadOption,
  readerFormat: ReaderArchiveFormat,
  preferredTaskId?: string
): DownloadTask | undefined {
  const matching = tasks.filter((task) =>
    task.comicId === option.comicId
    && task.volId === option.volId
    && task.format === readerFormat
  )
  return matching.find((task) => task.id === preferredTaskId)
    ?? matching.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt))[0]
}

function readerFlowForTask(
  option: VolumeDownloadOption,
  readerFormat: ReaderArchiveFormat,
  task: DownloadTask,
  speedBytesPerSecond?: number
): ReaderFlowState {
  const progress = clampPercent(task.progress)
  const total = task.totalBytes ? ` / ${formatBytes(task.totalBytes)}` : ''
  const downloaded = `${formatBytes(task.downloadedBytes)}${total}`
  const speed = speedBytesPerSecond && speedBytesPerSecond > 0 ? ` · ${formatBytes(speedBytesPerSecond)}/s` : ''
  if (task.status === 'queued') {
    return {
      volId: option.volId,
      stage: 'download',
      percent: progress,
      title: `等待当前项开始下载${readerArchiveFormatLabel(readerFormat)}`,
      detail: task.errorMessage
        ? readableAppMessage(task.errorMessage, '队列需要重新确认，启动后会继续处理当前项。')
        : '已把当前卷/话排到下一项，启动队列后会自动继续。'
    }
  }
  if (task.status === 'authorizing') {
    return {
      volId: option.volId,
      stage: 'download',
      percent: Math.max(22, progress),
      title: '正在授权下载',
      detail: '正在使用当前登录会话请求下载权限。'
    }
  }
  if (task.status === 'downloading') {
    return {
      volId: option.volId,
      stage: 'download',
      percent: progress,
      title: `正在下载${readerArchiveFormatLabel(readerFormat)}`,
      detail: `${downloaded}${speed}，下载完成后会自动准备阅读缓存。`
    }
  }
  if (task.status === 'verifying') {
    return {
      volId: option.volId,
      stage: 'download',
      percent: Math.max(88, progress),
      title: '正在校验下载文件',
      detail: '文件写入完成，正在登记资料库记录。'
    }
  }
  if (task.status === 'completed') {
    return {
      volId: option.volId,
      stage: 'cache',
      percent: 90,
      title: '下载完成，正在同步资料库',
      detail: '即将准备阅读缓存。'
    }
  }
  return {
    volId: option.volId,
    stage: 'failed',
    percent: 100,
    title: task.status === 'cancelled' ? '下载已取消' : '下载失败',
    detail: task.errorMessage || '请到下载中心重试或重新排队。'
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function resolveDownloadFormatForOption(option: VolumeDownloadOption, mode: DownloadModeFormat): DownloadFormat {
  if (mode !== 'auto') return mode
  if (canQueueDownloadOption(option, 'epub')) return 'epub'
  if (canQueueDownloadOption(option, 'source_zip')) return 'source_zip'
  return 'mobi'
}

function canQueueDownloadModeOption(option: VolumeDownloadOption, mode: DownloadModeFormat): boolean {
  return canQueueDownloadOption(option, resolveDownloadFormatForOption(option, mode))
}

function downloadSizeForMode(option: VolumeDownloadOption, mode: DownloadModeFormat): number | undefined {
  const format = resolveDownloadFormatForOption(option, mode)
  if (format === 'source_zip') return option.sizes.sourceZip
  return option.sizes[format]
}

function downloadModeLabel(format: DownloadModeFormat): string {
  return format === 'auto' ? '自动' : formatDownloadFormat(format)
}

function kindLabel(option: VolumeDownloadOption): string {
  return option.kind === 'volume' ? '单行本' : option.kind === 'chapter_group' ? '话组' : '未知类型'
}

function pageCountLabel(option: VolumeDownloadOption): string {
  return option.docPageCount || option.pageCount ? `${option.docPageCount ?? option.pageCount}` : '-'
}

function readerStatus(state: ReaderEntryState): { label: string; tone?: 'info' | 'success' | 'warning' | 'danger' } {
  if (state.cache) return { label: '已缓存', tone: 'success' }
  if (state.kind === 'prepare_from_local_source') return { label: '可离线', tone: 'success' }
  if (state.kind === 'source_downloading') return { label: state.label, tone: 'info' }
  if (state.kind === 'source_failed' || state.kind === 'source_completed_missing_library') return { label: state.label, tone: 'warning' }
  if (state.kind === 'blocked_by_policy' || state.kind === 'not_supported_format' || state.kind === 'unavailable') return { label: state.label, tone: 'warning' }
  return { label: '未缓存' }
}

function visibleReaderActionLabel(state: ReaderEntryState): string {
  if (state.kind === 'continue_reading') return '继续阅读'
  if (state.kind === 'prepare_from_local_source') return '阅读'
  if (state.kind === 'queue_source_zip') return '阅读'
  if (state.kind === 'source_downloading') return state.sourceTask?.status === 'queued' ? '继续队列' : '查看进度'
  if (state.kind === 'source_failed' || state.kind === 'source_completed_missing_library') return state.label
  return state.label
}

function detailPrimaryReaderActionLabel(state: ReaderEntryState | undefined): string {
  if (!state) return '开始阅读'
  if (state.kind === 'continue_reading') return '继续阅读'
  if (state.kind === 'prepare_from_local_source') return '准备阅读'
  if (state.kind === 'queue_source_zip') return '开始阅读'
  if (state.kind === 'source_downloading') return state.sourceTask?.status === 'queued' ? '等待下载' : '下载中'
  return state.label
}

function hasReaderLocalData(state: ReaderEntryState): boolean {
  return Boolean(state.cache || state.sourceFile)
}

function DownloadModeFormatPicker({
  value,
  onChange
}: {
  value: DownloadModeFormat
  onChange: (value: DownloadModeFormat) => void
}) {
  return (
    <div className="download-format-picker">
      <div className="download-format-options" role="group" aria-label="下载格式">
        {DOWNLOAD_MODE_FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            className="download-format-option pressable"
            data-selected={value === format}
            aria-pressed={value === format}
            onClick={() => onChange(format)}
          >
            {downloadModeLabel(format)}
          </button>
        ))}
      </div>
      <p>自动会优先选择已验证可用于内置阅读器的 EPUB；源图 ZIP 保留为手动高画质选项，最后回退到 MOBI 文件。</p>
    </div>
  )
}

function ReadingDirectoryCard({
  option,
  state,
  index,
  readerBusy,
  deletingLocalData,
  onRead,
  onDelete
}: {
  option: VolumeDownloadOption
  state: ReaderEntryState
  index: number
  readerBusy: boolean
  deletingLocalData: boolean
  onRead: () => void
  onDelete?: () => void
}) {
  const status = readerStatus(state)
  const visibleLabel = visibleReaderActionLabel(state)
  const needsHiddenOriginalLabel = state.label !== visibleLabel
  return (
    <article className="volume-option-card reading-directory-item" data-index={index}>
      <div className="reading-directory-main">
        <div className="reading-directory-index">{String(index + 1).padStart(2, '0')}</div>
        <div className="min-w-0">
          <h3>{option.displayTitle}</h3>
          <div className="reading-directory-meta">
            <span>{kindLabel(option)}</span>
            <span>{pageCountLabel(option)} 页</span>
            {option.restrictions[0] ? <span>{option.restrictions[0]}</span> : null}
          </div>
        </div>
      </div>
      <div className="reading-directory-side">
        <Badge tone={status.tone}>{status.label}</Badge>
        <Button disabled={!state.enabled || readerBusy} variant={state.cache ? 'primary' : 'secondary'} onClick={onRead}>
          <BookOpen className="h-4 w-4" />
          {readerBusy ? '处理中' : visibleLabel}
          {needsHiddenOriginalLabel ? <span className="sr-only">{state.label}</span> : null}
        </Button>
        {onDelete ? (
          <Button disabled={deletingLocalData} variant="danger" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            {deletingLocalData ? '删除中' : '删除本地数据'}
          </Button>
        ) : null}
      </div>
    </article>
  )
}

function DownloadPickRow({
  option,
  formatMode,
  selected,
  index,
  onClick,
  onPointerDown,
  onPointerUp
}: {
  option: VolumeDownloadOption
  formatMode: DownloadModeFormat
  selected: boolean
  index: number
  onClick: (event: ReactMouseEvent<HTMLElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: () => void
}) {
  const enabled = canQueueDownloadModeOption(option, formatMode)
  const resolvedFormat = resolveDownloadFormatForOption(option, formatMode)
  const size = downloadSizeForMode(option, formatMode)
  return (
    <article
      className="download-pick-row"
      data-download-vol-id={option.volId}
      data-selected={selected ? 'true' : 'false'}
      data-disabled={enabled ? 'false' : 'true'}
      data-index={index}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <label className="download-pick-check pressable" onClick={(event) => event.stopPropagation()}>
        <input className="sr-only" type="checkbox" aria-label={`选择 ${option.displayTitle}`} checked={selected} disabled={!enabled} onChange={(event) => {
          event.stopPropagation()
          onClick(event as unknown as ReactMouseEvent<HTMLElement>)
        }} />
        {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
      </label>
      <div className="download-pick-title">
        <h3>{option.displayTitle}</h3>
        <span>{kindLabel(option)}</span>
      </div>
      <div className="download-pick-cell">
        <span>页数</span>
        <strong>{pageCountLabel(option)}</strong>
      </div>
      <div className="download-pick-cell">
        <span>{downloadModeLabel(resolvedFormat)}</span>
        <strong>{formatBytes(size)}</strong>
      </div>
      <div className="download-pick-state">
        <Badge tone={enabled ? 'success' : 'warning'}>{enabled ? '可加入' : '不可下载'}</Badge>
      </div>
    </article>
  )
}

function selectionBoxStyle(box: SelectionBoxState): CSSProperties {
  const left = Math.min(box.startX, box.currentX)
  const top = Math.min(box.startY, box.currentY)
  return {
    left,
    top,
    width: Math.abs(box.currentX - box.startX),
    height: Math.abs(box.currentY - box.startY)
  }
}

function normalizeSelectionRect(box: SelectionBoxState, listBounds: DOMRect): DOMRect {
  const style = selectionBoxStyle(box)
  return new DOMRect(
    listBounds.left + Number(style.left ?? 0),
    listBounds.top + Number(style.top ?? 0),
    Number(style.width ?? 0),
    Number(style.height ?? 0)
  )
}

function rectsIntersect(left: DOMRect, right: DOMRect): boolean {
  return left.left <= right.right && left.right >= right.left && left.top <= right.bottom && left.bottom >= right.top
}

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('button,a,input,label,select,textarea,[role="button"]'))
}
