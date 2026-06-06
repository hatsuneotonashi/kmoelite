import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Columns2, HelpCircle, List, Maximize2, Minus, Plus, RefreshCcw, RotateCcw, RotateCw, Rows3, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import {
  enqueueNativeDownloadTasks,
  isNativeUnavailable,
  listNativeCachedChapterPages,
  listNativeChapterCache,
  prepareNativeReaderChapterCache,
  readNativeCachedReaderPage,
  repairNativeReaderChapterCache,
  saveNativeReadingProgress,
  type NativeReaderCachedPageImage
} from '../platform/nativeCommands'
import {
  normalizeReaderSpreadPageIndex,
  planReaderSpread,
  readerLayoutLabel,
  readerSpreadPageLabel,
  readerSpreadStep
} from '../reader/layout'
import { estimatePageIndexFromScroll, planReaderVirtualWindow } from '../reader/virtualWindow'
import { findUsableReaderArchiveForVolume, isReaderArchiveFormat, readerArchiveFormatLabel, type ReaderArchiveFormat } from '../reading/sourceArchive'
import { syncReaderCachePolicyAfterOpen } from '../reading/cachePolicyRuntime'
import { planNextReaderChapterPrefetch, prefetchNextReaderChapter } from '../reading/readerPrefetchRuntime'
import { deleteLocalReadingData } from '../reading/localReadingData'
import { useDownloadStore } from '../store/downloadStore'
import { useReadingStore } from '../store/readingStore'
import { useSettingsStore } from '../store/settingsStore'
import { useLayoutMode } from '../hooks/useLayoutMode'
import { useKmoeApi } from '../hooks/useKmoeApi'
import { readableAppMessage } from '../lib/format'
import { ReaderHelpPanel, getReaderHelpMode } from '../reader/ReaderHelpPanel'
import { ReaderPagePanel } from '../reader/ReaderPagePanel'
import type { ChapterCacheRecord, PageCacheRecord } from '../types/cache'
import type { DownloadedFile, DownloadTask } from '../types/domain'
import type { ManualSpreadOverride, PageLayout, ReadingCropState, ReadingDirection, ReadingHistoryEvent, ReadingMode, ReadingProgress } from '../types/reading'

const readingModes: Array<{ value: ReadingMode; label: string }> = [
  { value: 'paged', label: '分页' },
  { value: 'vertical_scroll', label: '纵向' },
  { value: 'horizontal_scroll', label: '横向' },
  { value: 'webtoon', label: 'Webtoon' }
]
const chapterCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const AUTO_CROP_INSET = 2
const DEFAULT_MANUAL_CROP_INSET = 3
const READER_SURFACE_ZOOMED_THRESHOLD = 1.05

type ReaderPanel = 'closed' | 'pages' | 'help' | 'controls'
type ReaderSwipeStart = { x: number; y: number; pointerId: number } | null
type ReadingRotation = NonNullable<ReadingProgress['rotation']>
type ReaderPageMotion = 'forward' | 'back' | 'jump'
type ReaderSpreadSlot = 'single' | 'first' | 'last'
type ReaderRecoveryPreflightInfo = {
  chapterTitle: string
  pageCount: number
  cachedPageCount: number
  hasSourceArchive: boolean
}
type SaveProgressOptions = {
  event?: ReadingHistoryEvent
  finished?: boolean
  progressPercent?: number
  zoom?: number
}

export function ReaderPage() {
  const navigate = useNavigate()
  const params = useParams()
  const api = useKmoeApi()
  const chapterCacheId = safeDecode(params.chapterCacheId ?? '')
  const layoutMode = useLayoutMode()
  const upsertProgress = useReadingStore((state) => state.upsertProgress)
  const addDownloadTasks = useDownloadStore((state) => state.addTasks)
  const library = useDownloadStore((state) => state.library)
  const pageTurnAnimation = useSettingsStore((state) => state.readerPageTurnAnimation)
  const lastWheelAtRef = useRef(0)
  const swipeStartRef = useRef<ReaderSwipeStart>(null)
  const autoPreparedSourceRef = useRef('')
  const nextChapterPrefetchRef = useRef('')
  const zoomRefs = useRef<Record<number, ReactZoomPanPinchContentRef | undefined>>({})
  const continuousScrollFrameRef = useRef<number | undefined>(undefined)
  const continuousContainerRef = useRef<HTMLDivElement | null>(null)
  const continuousAnchorKeyRef = useRef('')
  const thumbnailLoadingRef = useRef<Set<number>>(new Set())
  const openedHistoryKeysRef = useRef<Set<string>>(new Set())
  const finishedHistoryKeysRef = useRef<Set<string>>(new Set())
  const suppressNextAutoSaveKeyRef = useRef('')
  const [chapter, setChapter] = useState<ChapterCacheRecord | null>(null)
  const [allChapters, setAllChapters] = useState<ChapterCacheRecord[]>([])
  const [pages, setPages] = useState<PageCacheRecord[]>([])
  const [pageImages, setPageImages] = useState<Record<number, NativeReaderCachedPageImage>>({})
  const [pageIndex, setPageIndex] = useState(0)
  const [pageMotion, setPageMotion] = useState<ReaderPageMotion>('jump')
  const [readingMode, setReadingMode] = useState<ReadingMode>('paged')
  const [direction, setDirection] = useState<ReadingDirection>('rtl')
  const [pageLayout, setPageLayout] = useState<PageLayout>('single')
  const [manualSpreadOverrides, setManualSpreadOverrides] = useState<Record<number, ManualSpreadOverride>>({})
  const [rotation, setRotation] = useState<ReadingRotation>(0)
  const [crop, setCrop] = useState<ReadingCropState>({ mode: 'none' })
  const [controlsVisible, setControlsVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')
  const [repairingCache, setRepairingCache] = useState(false)
  const [repairMessage, setRepairMessage] = useState('')
  const [enqueueingSource, setEnqueueingSource] = useState(false)
  const [sourceQueueMessage, setSourceQueueMessage] = useState('')
  const [cachePolicyMessage, setCachePolicyMessage] = useState('')
  const [prefetchMessage, setPrefetchMessage] = useState('')
  const [readStateMessage, setReadStateMessage] = useState('')
  const [deletingLocalData, setDeletingLocalData] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [readerPanel, setReaderPanel] = useState<ReaderPanel>('closed')
  const panelOpen = readerPanel !== 'closed'
  const viewportSupportsDouble = useReaderDoublePageViewport()
  const viewportSupportsDoubleRef = useRef(viewportSupportsDouble)
  const viewportSize = useReaderViewportSize()
  const readerHelpMode = useMemo(() => getReaderHelpMode(viewportSize.width), [viewportSize.width])
  const pageCount = pages.length || chapter?.pageCount || 0
  const progress = pageCount > 0 ? ((pageIndex + 1) / pageCount) * 100 : 0
  const visibleSpread = useMemo(
    () => planReaderSpread({
      pages,
      pageIndex,
      pageLayout,
      direction,
      viewportSupportsDouble,
      manualOverrides: manualSpreadOverrides
    }),
    [direction, manualSpreadOverrides, pageIndex, pageLayout, pages, viewportSupportsDouble]
  )
  const title = chapter ? `${chapter.comicTitle} · ${chapter.volumeTitle}` : '阅读器'
  const continuousMode = readingMode !== 'paged'
  const zoomTargetPageIndexes = useMemo(
    () => continuousMode ? [pageIndex] : visibleSpread.displayIndexes,
    [continuousMode, pageIndex, visibleSpread.displayIndexes]
  )
  const manualSpreadOverride = manualSpreadOverrides[pageIndex]
  const canManualMerge = pageIndex < pageCount - 1
  const readerChapters = useMemo(
    () => getReaderChapterSiblings(chapter, allChapters),
    [allChapters, chapter]
  )
  const chapterNavigation = useMemo(
    () => getReaderChapterNavigation(chapter, readerChapters),
    [chapter, readerChapters]
  )
  const recoveredSourceArchive = useMemo(
    () => findReaderSourceArchive(chapter, library),
    [chapter, library]
  )
  const continuousVirtualWindow = useMemo(
    () => planReaderVirtualWindow({
      pageCount,
      pageIndex,
      readingMode,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height
    }),
    [pageCount, pageIndex, readingMode, viewportSize.height, viewportSize.width]
  )

  useEffect(() => {
    viewportSupportsDoubleRef.current = viewportSupportsDouble
  }, [viewportSupportsDouble])
  const pagesByIndex = useMemo(
    () => new Map(pages.map((page) => [page.pageIndex, page])),
    [pages]
  )
  const registerZoomRef = useCallback((index: number, ref: ReactZoomPanPinchContentRef | null) => {
    if (ref) {
      zoomRefs.current[index] = ref
      return
    }
    delete zoomRefs.current[index]
  }, [])

  const zoomVisiblePages = useCallback((action: 'in' | 'out' | 'reset') => {
    const refs = zoomTargetPageIndexes
      .map((index) => zoomRefs.current[index])
      .filter((ref): ref is ReactZoomPanPinchContentRef => Boolean(ref))

    if (refs.length === 0) {
      setZoom((current) => {
        if (action === 'reset') return 1
        return clampZoom(current + (action === 'in' ? 0.35 : -0.35))
      })
      return
    }

    refs.forEach((ref) => {
      if (action === 'in') ref.zoomIn(0.35)
      if (action === 'out') ref.zoomOut(0.35)
      if (action === 'reset') ref.resetTransform()
    })
    if (action === 'reset') setZoom(1)
  }, [zoomTargetPageIndexes])

  const loadMetadata = useCallback(async () => {
    if (!chapterCacheId) {
      setError('缺少章节缓存 ID，无法打开阅读器。')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    setPageError('')
    setRepairMessage('')
    setSourceQueueMessage('')
    setCachePolicyMessage('')
    setPrefetchMessage('')
    setReadStateMessage('')
    setManualSpreadOverrides({})
    setPageImages({})
    setPageLoading(false)
    const [chaptersResult, pagesResult] = await Promise.all([
      listNativeChapterCache(),
      listNativeCachedChapterPages(chapterCacheId)
    ])
    if (!chaptersResult.ok || !chaptersResult.value) {
      setError(isNativeUnavailable(chaptersResult) ? '请在 Tauri 客户端中打开阅读器。' : chaptersResult.message)
      setLoading(false)
      return
    }
    setAllChapters(chaptersResult.value)
    const found = chaptersResult.value.find((item) => item.id === chapterCacheId)
    if (!found) {
      setError('本地没有找到这个章节缓存，请从资料库重新准备阅读缓存。')
      setLoading(false)
      return
    }
    if (!pagesResult.ok || !pagesResult.value) {
      setChapter(found)
      setPages([])
      setPageIndex(0)
      setError(isNativeUnavailable(pagesResult) ? '请在 Tauri 客户端中打开阅读器。' : pagesResult.message)
      setLoading(false)
      return
    }
    if (pagesResult.value.length === 0) {
      setChapter(found)
      setPages([])
      setPageIndex(0)
      setError('章节缓存没有可阅读页面，请重新准备阅读缓存。')
      setLoading(false)
      return
    }
    const readingState = useReadingStore.getState()
    const existing = readingState.getProgress(found.comicId, found.volumeId)
    const inheritedPreferences = existing ? undefined : readingState.getComicReaderPreferences(found.comicId)
    const restoredReadingMode = existing?.readingMode ?? inheritedPreferences?.readingMode ?? 'paged'
    const restoredDirection = existing?.readingDirection ?? inheritedPreferences?.readingDirection ?? 'rtl'
    const restoredPageLayout = normalizeVisiblePageLayout(existing?.pageLayout ?? inheritedPreferences?.pageLayout ?? defaultPageLayout())
    const restoredManualSpreadOverrides = existing?.spreadOverrides ?? {}
    const safePageIndex = clampPageIndex(existing?.pageIndex ?? 0, pagesResult.value.length)
    const restoredPageIndex = restoredReadingMode === 'paged'
      ? normalizeReaderSpreadPageIndex({
        pages: pagesResult.value,
        pageIndex: safePageIndex,
        pageLayout: restoredPageLayout,
        direction: restoredDirection,
        viewportSupportsDouble: viewportSupportsDoubleRef.current,
        manualOverrides: restoredManualSpreadOverrides
      })
      : safePageIndex
    setChapter(found)
    setPages(pagesResult.value)
    setPageIndex(restoredPageIndex)
    setReadingMode(restoredReadingMode)
    setDirection(restoredDirection)
    setPageLayout(restoredPageLayout)
    setZoom(existing?.zoom ?? inheritedPreferences?.zoom ?? 1)
    setRotation(existing?.rotation ?? inheritedPreferences?.rotation ?? 0)
    setCrop(existing?.crop ?? inheritedPreferences?.crop ?? { mode: 'none' })
    setManualSpreadOverrides(restoredManualSpreadOverrides)
    const cleanupResult = await syncReaderCachePolicyAfterOpen({
      chapters: chaptersResult.value,
      activeChapter: found,
      pages: pagesResult.value
    })
    if (cleanupResult.message) setCachePolicyMessage(cleanupResult.message)
    setLoading(false)
  }, [chapterCacheId])

  const loadPageImage = useCallback(async (index: number, visible = false) => {
    if (!chapterCacheId || index < 0 || index >= pageCount) return undefined
    if (pageImages[index]) return pageImages[index]
    if (visible) {
      setPageLoading(true)
      setPageError('')
    }
    const result = await readNativeCachedReaderPage(chapterCacheId, index)
    if (result.ok && result.value) {
      setPageImages((current) => ({ ...current, [index]: result.value! }))
      if (visible) setPageLoading(false)
      return result.value
    }
    if (visible) {
      setPageError(result.message)
      setPageLoading(false)
    }
    return undefined
  }, [chapterCacheId, pageCount, pageImages])

  const saveProgress = useCallback((nextPageIndex: number, options: SaveProgressOptions = {}) => {
    if (!chapter) return
    const readAt = new Date().toISOString()
    const historyKey = readerHistoryKey(chapter, pageCount)
    let historyEvent = options.event ?? 'page_change'
    if (!options.event && !openedHistoryKeysRef.current.has(historyKey)) {
      historyEvent = 'open'
    } else if (
      !options.event
      && pageCount > 0
      && nextPageIndex >= pageCount - 1
      && !finishedHistoryKeysRef.current.has(historyKey)
    ) {
      historyEvent = 'finish'
    }
    if (historyEvent === 'open') openedHistoryKeysRef.current.add(historyKey)
    if (historyEvent === 'finish') {
      openedHistoryKeysRef.current.add(historyKey)
      finishedHistoryKeysRef.current.add(historyKey)
    }
    if (historyEvent === 'mark_read') {
      openedHistoryKeysRef.current.add(historyKey)
      finishedHistoryKeysRef.current.add(historyKey)
    }
    if (historyEvent === 'mark_unread' || historyEvent === 'restart') {
      openedHistoryKeysRef.current.add(historyKey)
      finishedHistoryKeysRef.current.delete(historyKey)
    }
    const progressPercent = options.progressPercent ?? (pageCount > 0 ? ((nextPageIndex + 1) / pageCount) * 100 : 0)
    const finished = options.finished ?? (pageCount > 0 && nextPageIndex >= pageCount - 1)
    const local = upsertProgress({
      comicId: chapter.comicId,
      comicTitle: chapter.comicTitle,
      volumeId: chapter.volumeId,
      volumeTitle: chapter.volumeTitle,
      pageIndex: nextPageIndex,
      pageCount,
      progressPercent,
      finished,
      readingMode,
      readingDirection: direction,
      pageLayout,
      zoom: options.zoom ?? zoom,
      rotation,
      crop,
      spreadOverrides: manualSpreadOverrides,
      readAt
    }, historyEvent)
    void saveNativeReadingProgress({
      progress: {
        id: local.id,
        comicId: local.comicId,
        comicTitle: local.comicTitle,
        volumeId: local.volumeId,
        volumeTitle: local.volumeTitle,
        pageIndex: local.pageIndex,
        pageCount: local.pageCount,
        progressPercent: local.progressPercent,
        lastReadAt: local.lastReadAt,
        finished: local.finished,
        readingMode: local.readingMode,
        readingDirection: local.readingDirection,
        pageLayout: local.pageLayout,
        zoom: local.zoom,
        rotation: local.rotation,
        cropJson: local.crop ? JSON.stringify(local.crop) : undefined,
        spreadOverridesJson: stringifySpreadOverrides(local.spreadOverrides),
        updatedAt: readAt
      },
      history: {
        id: `${local.id}:${historyEvent}:${readAt}`,
        comicId: local.comicId,
        comicTitle: local.comicTitle,
        volumeId: local.volumeId,
        volumeTitle: local.volumeTitle,
        pageIndex: local.pageIndex,
        progressPercent: local.progressPercent,
        event: historyEvent,
        readAt
      }
    })
  }, [chapter, crop, direction, manualSpreadOverrides, pageCount, pageLayout, readingMode, rotation, upsertProgress, zoom])

  const scrollContinuousPageIntoView = useCallback((targetPageIndex: number, behavior: ScrollBehavior = 'auto') => {
    if (typeof window === 'undefined') return
    const root = continuousContainerRef.current ?? document
    const target = root.querySelector<HTMLElement>(`[data-reader-page-index="${targetPageIndex}"]`)
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior, block: 'center', inline: 'center' })
    }
  }, [])

  const goToPage = useCallback((nextPageIndex: number) => {
    const safeNext = clampPageIndex(nextPageIndex, pageCount)
    const next = continuousMode
      ? safeNext
      : normalizeReaderSpreadPageIndex({
        pages,
        pageIndex: safeNext,
        pageLayout,
        direction,
        viewportSupportsDouble,
        manualOverrides: manualSpreadOverrides
      })
    if (!Number.isFinite(next)) return
    setPageError('')
    setPageLoading(false)
    setPageMotion(next > pageIndex ? 'forward' : next < pageIndex ? 'back' : 'jump')
    setPageIndex(next)
    if (continuousMode && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        scrollContinuousPageIntoView(next, getReaderScrollBehavior())
      })
    }
  }, [
    continuousMode,
    direction,
    manualSpreadOverrides,
    pageCount,
    pageIndex,
    pageLayout,
    pages,
    scrollContinuousPageIntoView,
    viewportSupportsDouble
  ])

  const markCurrentVolumeRead = useCallback(() => {
    if (pageCount <= 0) return
    const lastPageIndex = Math.max(0, pageCount - 1)
    setPageError('')
    setPageLoading(false)
    if (chapter) suppressNextAutoSaveKeyRef.current = readerPageSaveKey(chapter, lastPageIndex)
    setPageMotion('jump')
    setPageIndex(lastPageIndex)
    if (continuousMode && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        scrollContinuousPageIntoView(lastPageIndex, getReaderScrollBehavior())
      })
    }
    saveProgress(lastPageIndex, { event: 'mark_read', finished: true, progressPercent: 100 })
    setReadStateMessage('已标记为已读。')
  }, [chapter, continuousMode, pageCount, saveProgress, scrollContinuousPageIntoView])

  const markCurrentVolumeUnread = useCallback(() => {
    if (pageCount <= 0) return
    const unreadProgress = Math.min(progress, 99)
    saveProgress(pageIndex, { event: 'mark_unread', finished: false, progressPercent: unreadProgress })
    setReadStateMessage('已标记为未读。')
  }, [pageCount, pageIndex, progress, saveProgress])

  const restartCurrentVolume = useCallback(() => {
    if (pageCount <= 0) return
    setPageError('')
    setPageLoading(false)
    setZoom(1)
    if (chapter) suppressNextAutoSaveKeyRef.current = readerPageSaveKey(chapter, 0)
    setPageMotion('jump')
    setPageIndex(0)
    if (continuousMode && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        scrollContinuousPageIntoView(0, getReaderScrollBehavior())
      })
    }
    saveProgress(0, { event: 'restart', finished: false, progressPercent: 0, zoom: 1 })
    setReadStateMessage('已从本章开头重读。')
  }, [chapter, continuousMode, pageCount, saveProgress, scrollContinuousPageIntoView])

  const deleteCurrentLocalReadingData = useCallback(async () => {
    if (!chapter || deletingLocalData) return
    setDeletingLocalData(true)
    setReadStateMessage('')
    setSourceQueueMessage('')
    const outcome = await deleteLocalReadingData({
      comicIds: [chapter.comicId],
      volumeIds: [chapter.volumeId],
      chapterIds: [chapter.id],
      includeSourceFiles: true
    })
    setDeletingLocalData(false)
    if (outcome.ok) {
      navigate(`/comic/${encodeURIComponent(chapter.comicId)}`, { replace: true })
      return
    }
    setReadStateMessage(outcome.message)
  }, [chapter, deletingLocalData, navigate])

  const selectPageFromPanel = useCallback((nextPageIndex: number) => {
    goToPage(nextPageIndex)
    if (isPhoneLayout()) setReaderPanel('closed')
  }, [goToPage])

  const goToChapter = useCallback((target?: ChapterCacheRecord | null) => {
    if (!target) return
    setReaderPanel('closed')
    setPageError('')
    setRepairMessage('')
    setSourceQueueMessage('')
    setManualSpreadOverrides({})
    setPageLoading(false)
    setPageImages({})
    setControlsVisible(false)
    navigate(`/reader/cache/${encodeURIComponent(target.id)}`)
  }, [navigate])

  const goRelative = useCallback((delta: number) => {
    const step = continuousMode ? 1 : readerSpreadStep(visibleSpread)
    goToPage(pageIndex + delta * step)
  }, [continuousMode, goToPage, pageIndex, visibleSpread])

  const setManualSpreadOverride = useCallback((override?: ManualSpreadOverride) => {
    setManualSpreadOverrides((current) => {
      const next = { ...current }
      if (override) {
        next[pageIndex] = override
      } else {
        delete next[pageIndex]
      }
      return next
    })
  }, [pageIndex])

  const rotatePage = useCallback((delta: 90 | -90) => {
    setRotation((current) => normalizeRotation(current + delta))
  }, [])

  const setManualCropInset = useCallback((delta: number) => {
    setCrop((current) => {
      const currentInset = current.mode === 'manual' && typeof current.inset === 'number'
        ? current.inset
        : DEFAULT_MANUAL_CROP_INSET
      return {
        mode: 'manual',
        inset: clampCropInset(currentInset + delta)
      }
    })
  }, [])

  const repairCache = useCallback(async () => {
    if (!chapter) return
    setRepairingCache(true)
    setRepairMessage('')
    setSourceQueueMessage('')
    const result = await repairNativeReaderChapterCache(chapter.id)
    if (result.ok && result.value) {
      const safePageIndex = clampPageIndex(pageIndex, result.value.pages.length)
      const restoredPageIndex = continuousMode
        ? safePageIndex
        : normalizeReaderSpreadPageIndex({
          pages: result.value.pages,
          pageIndex: safePageIndex,
          pageLayout,
          direction,
          viewportSupportsDouble,
          manualOverrides: {}
        })
      setChapter(result.value.chapter)
      setPages(result.value.pages)
      setPageImages({})
      setPageError('')
      setError('')
      setPageLoading(false)
      setPageIndex(restoredPageIndex)
      setManualSpreadOverrides({})
      setRepairMessage(result.message)
    } else {
      setRepairMessage(isNativeUnavailable(result) ? '请在 Tauri 客户端中重新准备阅读缓存。' : result.message)
    }
    setRepairingCache(false)
  }, [chapter, continuousMode, direction, pageIndex, pageLayout, viewportSupportsDouble])

  const enqueueSourceZipDownload = useCallback(async () => {
    if (!chapter) return
    setEnqueueingSource(true)
    setSourceQueueMessage('')
    try {
      const session = await api.getSession()
      if (!session.authenticated) {
        setSourceQueueMessage('请先登录账号，再创建阅读文件下载任务。')
        setEnqueueingSource(false)
        navigate('/login')
        return
      }
    } catch (error) {
      setSourceQueueMessage(readableAppMessage(error, '暂时无法确认登录状态，请稍后重试。'))
      setEnqueueingSource(false)
      return
    }
    const task = makeReaderSourceZipTask(chapter)
    const formatLabel = readerArchiveFormatLabel(task.format as ReaderArchiveFormat)
    const result = await enqueueNativeDownloadTasks([task])
    if (result.ok && result.value !== undefined) {
      const accepted = result.value
      if (accepted.length > 0) {
        const created = addDownloadTasks(accepted)
        setSourceQueueMessage(
          created.length > 0
            ? `已加入 1 个${formatLabel} 下载任务，请到下载中心逐项下载。`
            : `下载队列已有这个${formatLabel}任务，请到下载中心查看。`
        )
      } else {
        setSourceQueueMessage(`下载队列已有这个${formatLabel}任务，请到下载中心同步后查看。`)
      }
    } else if (isNativeUnavailable(result)) {
      setSourceQueueMessage(`请在 Kmoe 客户端中创建真实${formatLabel}下载任务。`)
    } else {
      setSourceQueueMessage(result.message)
    }
    setEnqueueingSource(false)
  }, [addDownloadTasks, api, chapter, navigate])

  const goFromZone = useCallback((side: 'left' | 'right') => {
    if (direction === 'rtl') {
      goRelative(side === 'left' ? 1 : -1)
    } else {
      goRelative(side === 'right' ? 1 : -1)
    }
  }, [direction, goRelative])

  const handleReaderClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (!target || isReaderInteractiveTarget(target)) return
    if (panelOpen) {
      setReaderPanel('closed')
      setControlsVisible(false)
      return
    }
    if (isReaderZoomSurfaceTarget(target) && zoom > READER_SURFACE_ZOOMED_THRESHOLD) return
    if (event.detail > 1) return
    const ratio = event.clientX / Math.max(1, window.innerWidth)
    if (!continuousMode && ratio < 0.28) {
      goFromZone('left')
      return
    }
    if (!continuousMode && ratio > 0.72) {
      goFromZone('right')
      return
    }
    setControlsVisible((value) => !value)
  }, [continuousMode, goFromZone, panelOpen, zoom])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (panelOpen) return
    if (continuousMode || event.pointerType === 'mouse') return
    const target = event.target as HTMLElement | null
    if (!target || isReaderInteractiveTarget(target)) return
    if (isReaderZoomSurfaceTarget(target) && zoom > READER_SURFACE_ZOOMED_THRESHOLD) return
    swipeStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }, [continuousMode, panelOpen, zoom])

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (panelOpen) return
    if (!start || start.pointerId !== event.pointerId || continuousMode) return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 56 || Math.abs(deltaY) > 92 || Math.abs(deltaY) > Math.abs(deltaX) * 0.85) return
    if (direction === 'rtl') {
      goRelative(deltaX > 0 ? 1 : -1)
    } else {
      goRelative(deltaX < 0 ? 1 : -1)
    }
  }, [continuousMode, direction, goRelative, panelOpen])

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (panelOpen) return
    if (event.ctrlKey || event.metaKey || continuousMode) return
    if (Math.abs(event.deltaY) < 36 && Math.abs(event.deltaX) < 36) return
    const now = Date.now()
    if (now - lastWheelAtRef.current < 420) return
    lastWheelAtRef.current = now
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault()
      goRelative(event.deltaX > 0 ? 1 : -1)
      return
    }
    event.preventDefault()
    goRelative(event.deltaY > 0 ? 1 : -1)
  }, [continuousMode, goRelative, panelOpen])

  const handleContinuousScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    if (!continuousMode || pageCount <= 0) return
    const container = event.currentTarget
    const scrollOffset = readingMode === 'horizontal_scroll' ? container.scrollLeft : container.scrollTop
    if (continuousScrollFrameRef.current) window.cancelAnimationFrame(continuousScrollFrameRef.current)
    continuousScrollFrameRef.current = window.requestAnimationFrame(() => {
      const nextIndex = estimatePageIndexFromScroll({
        scrollOffset,
        pageCount,
        estimatedPageSize: continuousVirtualWindow.estimatedPageSize
      })
      setPageIndex((current) => current === nextIndex ? current : nextIndex)
    })
  }, [continuousMode, continuousVirtualWindow.estimatedPageSize, pageCount, readingMode])

  useEffect(() => {
    void loadMetadata()
  }, [loadMetadata])

  useEffect(() => {
    if (!cachePolicyMessage) return undefined
    const timer = window.setTimeout(() => setCachePolicyMessage(''), 3200)
    return () => window.clearTimeout(timer)
  }, [cachePolicyMessage])

  useEffect(() => {
    if (!prefetchMessage) return undefined
    const timer = window.setTimeout(() => setPrefetchMessage(''), 3200)
    return () => window.clearTimeout(timer)
  }, [prefetchMessage])

  useEffect(() => {
    if (!readStateMessage) return undefined
    const timer = window.setTimeout(() => setReadStateMessage(''), 2600)
    return () => window.clearTimeout(timer)
  }, [readStateMessage])

  useEffect(
    () => () => {
      if (continuousScrollFrameRef.current) window.cancelAnimationFrame(continuousScrollFrameRef.current)
    },
    []
  )

  useEffect(() => {
    autoPreparedSourceRef.current = ''
    nextChapterPrefetchRef.current = ''
    continuousAnchorKeyRef.current = ''
    thumbnailLoadingRef.current.clear()
  }, [chapterCacheId])

  useEffect(() => {
    if (loading || !chapter || pageCount === 0) return
    for (const index of visibleSpread.pageIndexes) {
      void loadPageImage(index, index === pageIndex)
    }
    const prefetchIndex = Math.max(...visibleSpread.pageIndexes) + 1
    if (prefetchIndex < pageCount) void loadPageImage(prefetchIndex, false)
    const autoSaveKey = readerPageSaveKey(chapter, pageIndex)
    if (suppressNextAutoSaveKeyRef.current === autoSaveKey) {
      suppressNextAutoSaveKeyRef.current = ''
      return
    }
    saveProgress(pageIndex)
  }, [chapter, loadPageImage, loading, pageCount, pageIndex, saveProgress, visibleSpread])

  useEffect(() => {
    if (readerPanel !== 'pages' || loading || !chapter || pageCount === 0) return
    for (const index of [pageIndex - 1, pageIndex, pageIndex + 1]) {
      if (index >= 0 && index < pageCount) void loadPageImage(index, false)
    }
  }, [chapter, loadPageImage, loading, pageCount, pageIndex, readerPanel])

  useEffect(() => {
    if (readerPanel !== 'pages' || loading || !chapter || pageCount === 0) return undefined
    let cancelled = false
    let timer: number | undefined
    const missingIndexes = pages
      .map((page) => page.pageIndex)
      .filter((index) => !pageImages[index] && !thumbnailLoadingRef.current.has(index))

    const loadBatch = (cursor: number) => {
      if (cancelled || cursor >= missingIndexes.length) return
      for (const index of missingIndexes.slice(cursor, cursor + 8)) {
        thumbnailLoadingRef.current.add(index)
        void loadPageImage(index, false).finally(() => {
          thumbnailLoadingRef.current.delete(index)
        })
      }
      timer = window.setTimeout(() => loadBatch(cursor + 8), 70)
    }

    loadBatch(0)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [chapter, loadPageImage, loading, pageCount, pageImages, pages, readerPanel])

  useEffect(() => {
    if (!continuousMode || loading || error || pageCount <= 0) return
    const anchorKey = [
      chapterCacheId,
      readingMode,
      viewportSize.width ?? 'unknown-width',
      viewportSize.height ?? 'unknown-height',
      pageCount
    ].join(':')
    if (continuousAnchorKeyRef.current === anchorKey) return
    continuousAnchorKeyRef.current = anchorKey
    const frame = window.requestAnimationFrame(() => {
      scrollContinuousPageIntoView(pageIndex, 'auto')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [
    chapterCacheId,
    continuousMode,
    error,
    loading,
    pageCount,
    pageIndex,
    readingMode,
    scrollContinuousPageIntoView,
    viewportSize.height,
    viewportSize.width
  ])

  useEffect(() => {
    function flushProgress() {
      if (loading || error) return
      saveProgress(pageIndex)
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') flushProgress()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flushProgress)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flushProgress)
    }
  }, [error, loading, pageIndex, saveProgress])

  useEffect(() => {
    if (loading || error || !chapter || pages.length === 0) return
    const plan = planNextReaderChapterPrefetch({
      currentChapter: chapter,
      chapters: allChapters,
      library
    })
    if (!plan.sourceArchive) return
    const prefetchKey = `${chapter.id}:${plan.sourceArchive.id}:${plan.sourceArchive.localPath}`
    if (nextChapterPrefetchRef.current === prefetchKey) return
    nextChapterPrefetchRef.current = prefetchKey

    const prefetchNext = async () => {
      const result = await prefetchNextReaderChapter({
        currentChapter: chapter,
        chapters: allChapters,
        library
      })
      const prefetchedChapter = result.chapter
      if (result.status === 'prefetched' && prefetchedChapter) {
        setAllChapters((current) => mergeReaderChapterList(current, prefetchedChapter))
        setPrefetchMessage(result.message)
      } else if (result.status === 'failed') {
        setPrefetchMessage(result.message)
      }
    }

    void prefetchNext()
  }, [allChapters, chapter, error, library, loading, pages.length])

  useEffect(() => {
    if (!chapter || !recoveredSourceArchive || repairingCache) return
    if (!error && !pageError && pages.length > 0) return
    const sourceKey = `${chapter.id}:${recoveredSourceArchive.id}:${recoveredSourceArchive.localPath}`
    if (autoPreparedSourceRef.current === sourceKey) return
    autoPreparedSourceRef.current = sourceKey

    const prepareRecoveredSource = async () => {
      setRepairingCache(true)
      const format = recoveredSourceArchive.format as ReaderArchiveFormat
      setSourceQueueMessage(`已找到重新下载的${readerArchiveFormatLabel(format)}，正在自动准备阅读缓存...`)
      const result = await prepareNativeReaderChapterCache({
        archivePath: recoveredSourceArchive.localPath,
        comicId: chapter.comicId,
        comicTitle: chapter.comicTitle,
        volumeId: chapter.volumeId,
        volumeTitle: chapter.volumeTitle,
        sourceTaskId: recoveredSourceArchive.taskId,
        format,
        policy: 'balanced'
      })
      if (result.ok && result.value) {
        const safePageIndex = clampPageIndex(pageIndex, result.value.pages.length)
        const restoredPageIndex = continuousMode
          ? safePageIndex
          : normalizeReaderSpreadPageIndex({
            pages: result.value.pages,
            pageIndex: safePageIndex,
            pageLayout,
            direction,
            viewportSupportsDouble,
            manualOverrides: {}
          })
        setChapter(result.value.chapter)
        setPages(result.value.pages)
        setPageImages({})
        setPageError('')
        setError('')
        setPageLoading(false)
        setPageIndex(restoredPageIndex)
        setManualSpreadOverrides({})
        setSourceQueueMessage(`已从重新下载的${readerArchiveFormatLabel(format)} 自动准备阅读缓存。`)
      } else {
        setSourceQueueMessage(isNativeUnavailable(result) ? '请在 Tauri 客户端中准备阅读缓存。' : result.message)
      }
      setRepairingCache(false)
    }

    void prepareRecoveredSource()
  }, [
    chapter,
    continuousMode,
    direction,
    error,
    pageError,
    pageIndex,
    pageLayout,
    pages.length,
    recoveredSourceArchive,
    repairingCache,
    viewportSupportsDouble
  ])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreReaderShortcut(event)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (readerPanel !== 'closed') {
          setReaderPanel('closed')
          return
        }
        navigate(-1)
        return
      }
      if (readerPanel !== 'closed') return
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault()
        setReaderPanel('help')
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        goToPage(0)
      }
      if (event.key === 'End') {
        event.preventDefault()
        goToPage(pageCount - 1)
      }
      if (event.key === ' ' || event.key === 'PageDown') {
        event.preventDefault()
        goRelative(1)
      }
      if (event.key === 'PageUp') {
        event.preventDefault()
        goRelative(-1)
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goFromZone('left')
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goFromZone('right')
      }
      if (event.key === '[') {
        event.preventDefault()
        goToChapter(chapterNavigation.previous)
      }
      if (event.key === ']') {
        event.preventDefault()
        goToChapter(chapterNavigation.next)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chapterNavigation.next, chapterNavigation.previous, goFromZone, goRelative, goToChapter, goToPage, navigate, pageCount, readerPanel])

  const modeLabel = useMemo(
    () => readingModes.find((item) => item.value === readingMode)?.label ?? '分页',
    [readingMode]
  )
  const physicalNavigation = useMemo(() => {
    const atStart = pageIndex <= 0
    const atEnd = pageIndex >= pageCount - 1
    return {
      left: {
        label: direction === 'rtl' ? '下一页' : '上一页',
        disabled: direction === 'rtl' ? atEnd : atStart
      },
      right: {
        label: direction === 'rtl' ? '上一页' : '下一页',
        disabled: direction === 'rtl' ? atStart : atEnd
      }
    }
  }, [direction, pageCount, pageIndex])

  return (
    <main
      className="reader-shell"
      data-layout-mode={layoutMode}
      data-controls-visible={controlsVisible ? 'true' : 'false'}
      data-panel-open={panelOpen ? 'true' : 'false'}
      data-page-animation={pageTurnAnimation}
      data-page-motion={pageMotion}
      data-reading-direction={direction}
      onClick={handleReaderClick}
      onPointerCancel={() => {
        swipeStartRef.current = null
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <h1 className="sr-only">{title}</h1>
      <div className="reader-stage">
        {loading ? (
          <div className="reader-center-card">
            <div className="skeleton h-64 rounded-[22px]" />
            <p className="mt-4 text-sm text-white/70">正在读取本地章节缓存...</p>
          </div>
        ) : error ? (
          <div className="reader-center-card">
            <EmptyState title="无法打开阅读器">{error}</EmptyState>
            <ReaderRecoveryPreflight
              info={readerRecoveryPreflightInfo(chapter, pages.length, recoveredSourceArchive)}
              errorMessage={error}
              repairMessage={repairMessage}
              sourceQueueMessage={sourceQueueMessage}
              repairingCache={repairingCache}
              enqueueingSource={enqueueingSource}
              onRepairCache={chapter ? () => void repairCache() : undefined}
              onQueueSourceDownload={chapter ? () => void enqueueSourceZipDownload() : undefined}
              onReload={() => void loadMetadata()}
            />
          </div>
        ) : (
          <>
            {continuousMode ? (
              <div
                ref={continuousContainerRef}
                className="reader-continuous"
                data-mode={readingMode}
                data-virtualized="true"
                onScroll={handleContinuousScroll}
              >
                {continuousVirtualWindow.leadingSize > 0 ? (
                  <ReaderContinuousSpacer size={continuousVirtualWindow.leadingSize} />
                ) : null}
                {continuousVirtualWindow.indexes.map((virtualIndex) => {
                  const page = pagesByIndex.get(virtualIndex)
                  if (!page) return null
                  return (
                    <ContinuousReaderPage
                      key={page.id}
                      index={page.pageIndex}
                      image={pageImages[page.pageIndex]}
                      loadPageImage={loadPageImage}
                      onVisible={setPageIndex}
                      onZoomChange={setZoom}
                      rotation={rotation}
                      crop={crop}
                      initialZoom={zoom}
                      registerZoomRef={registerZoomRef}
                      webtoon={readingMode === 'webtoon'}
                    />
                  )
                })}
                {continuousVirtualWindow.trailingSize > 0 ? (
                  <ReaderContinuousSpacer size={continuousVirtualWindow.trailingSize} />
                ) : null}
              </div>
            ) : (
              <div
                key={`${chapterCacheId}:${visibleSpread.displayIndexes.join('-')}:${pageTurnAnimation}:${pageMotion}`}
                className={visibleSpread.spread === 'single' ? 'reader-page-single' : 'reader-page-spread'}
                data-mode={readingMode}
                data-spread-reason={visibleSpread.reason}
              >
                {visibleSpread.displayIndexes.map((visibleIndex, slotIndex) => (
                  <ReaderImageView
                    key={`${chapterCacheId}:${visibleIndex}`}
                    image={pageImages[visibleIndex]}
                    loading={visibleIndex === pageIndex ? pageLoading : !pageImages[visibleIndex]}
                    error={visibleIndex === pageIndex ? pageError : ''}
                    onRetry={() => void loadPageImage(visibleIndex, true)}
                    onRepairCache={visibleIndex === pageIndex ? () => void repairCache() : undefined}
                    onQueueSourceDownload={visibleIndex === pageIndex ? () => void enqueueSourceZipDownload() : undefined}
                    repairMessage={visibleIndex === pageIndex ? repairMessage : ''}
                    sourceQueueMessage={visibleIndex === pageIndex ? sourceQueueMessage : ''}
                    recoveryInfo={visibleIndex === pageIndex ? readerRecoveryPreflightInfo(chapter, pages.length, recoveredSourceArchive) : undefined}
                    repairingCache={visibleIndex === pageIndex && repairingCache}
                    enqueueingSource={visibleIndex === pageIndex && enqueueingSource}
                    onSkip={() => goRelative(1)}
                    muted={visibleIndex !== pageIndex}
                    rotation={rotation}
                    crop={crop}
                    initialZoom={zoom}
                    onZoomChange={setZoom}
                    registerZoomRef={registerZoomRef}
                    spreadSlot={visibleSpread.spread === 'double' ? (slotIndex === 0 ? 'first' : 'last') : 'single'}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {readStateMessage && !loading && !error ? (
        <div className="reader-status-toast" role="status">
          {readStateMessage}
        </div>
      ) : null}

      {sourceQueueMessage && !loading && !error && !readStateMessage ? (
        <div className="reader-status-toast" role="status">
          {sourceQueueMessage}
        </div>
      ) : null}

      {cachePolicyMessage && !loading && !error && !sourceQueueMessage && !readStateMessage ? (
        <div className="reader-status-toast" role="status">
          {cachePolicyMessage}
        </div>
      ) : null}

      {prefetchMessage && !loading && !error && !sourceQueueMessage && !cachePolicyMessage && !readStateMessage ? (
        <div className="reader-status-toast" role="status">
          {prefetchMessage}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="reader-topbar" aria-hidden={!controlsVisible} data-visible={controlsVisible ? 'true' : 'false'}>
            <div className="reader-topbar-actions">
              <Button variant="secondary" className="reader-top-button" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4" />
                <span className="reader-button-label">返回</span>
              </Button>
              <Button
                aria-controls="reader-page-panel"
                aria-expanded={readerPanel === 'pages'}
                className="reader-top-button"
                variant="secondary"
                onClick={() => setReaderPanel((value) => value === 'pages' ? 'closed' : 'pages')}
              >
                <List className="h-4 w-4" />
                <span className="reader-button-label">目录</span>
              </Button>
              <Button
                aria-controls="reader-help-panel"
                aria-expanded={readerPanel === 'help'}
                className="reader-top-button"
                variant="secondary"
                onClick={() => setReaderPanel((value) => value === 'help' ? 'closed' : 'help')}
              >
                <HelpCircle className="h-4 w-4" />
                <span className="reader-button-label">帮助</span>
              </Button>
            </div>
            <div className="reader-title-chip min-w-0">
              <div className="truncate text-sm font-semibold text-white">{title}</div>
            </div>
          </div>

          <div className="reader-bottombar" aria-hidden={!controlsVisible} data-visible={controlsVisible ? 'true' : 'false'}>
            <div className="reader-bottom-navigation">
              <Button variant="secondary" className="reader-page-button" disabled={physicalNavigation.left.disabled} onClick={() => goFromZone('left')}>
                <ChevronLeft className="h-4 w-4" />
                {physicalNavigation.left.label}
              </Button>
              <div className="text-center text-sm font-semibold text-white">{readerSpreadPageLabel(visibleSpread, pageCount)}</div>
              <Button variant="secondary" className="reader-page-button" disabled={physicalNavigation.right.disabled} onClick={() => goFromZone('right')}>
                {physicalNavigation.right.label}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="reader-bottom-details">
              <div className="reader-status-controls" data-reader-interactive="true">
                <div className="reader-status-segment" role="group" aria-label="高级阅读控制">
                  <button
                    type="button"
                    aria-controls="reader-controls-panel"
                    aria-expanded={readerPanel === 'controls'}
                    data-selected={readerPanel === 'controls'}
                    onClick={() => setReaderPanel((value) => value === 'controls' ? 'closed' : 'controls')}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    高级
                  </button>
                </div>
                <div className="reader-status-segment" role="group" aria-label="页面布局">
                  <button type="button" data-selected={pageLayout === 'single'} onClick={() => setPageLayout('single')}>
                    <Maximize2 className="h-4 w-4" />
                    单页
                  </button>
                  <button type="button" data-selected={pageLayout === 'double' || pageLayout === 'auto_double'} onClick={() => setPageLayout('double')}>
                    <Columns2 className="h-4 w-4" />
                    双页
                  </button>
                </div>
                <div className="reader-status-segment" role="group" aria-label="阅读方向">
                  <button type="button" data-selected={direction === 'rtl'} onClick={() => setDirection('rtl')}>
                    RTL
                  </button>
                  <button type="button" data-selected={direction === 'ltr'} onClick={() => setDirection('ltr')}>
                    LTR
                  </button>
                </div>
                <div className="reader-status-segment reader-status-rotation" role="group" aria-label="页面旋转">
                  <button type="button" aria-label="向左旋转页面" onClick={() => rotatePage(-90)}>
                    <RotateCcw className="h-4 w-4" />
                    左旋
                  </button>
                  <button type="button" data-selected={rotation === 0} aria-label="重置页面旋转" onClick={() => setRotation(0)}>
                    {rotation}°
                  </button>
                  <button type="button" aria-label="向右旋转页面" onClick={() => rotatePage(90)}>
                    <RotateCw className="h-4 w-4" />
                    右旋
                  </button>
                </div>
                <div className="reader-status-meta" aria-label="当前阅读状态">
                  {modeLabel} · {readerLayoutLabel(pageLayout, visibleSpread)} · {direction === 'rtl' ? '从右向左' : '从左向右'} · {rotation}°
                  {chapterNavigation.total > 1 ? ` · 第 ${chapterNavigation.position + 1}/${chapterNavigation.total} 章` : ''}
                </div>
              </div>

              {chapterNavigation.total > 1 ? (
                <div className="reader-chapter-navigation">
                  <Button
                    aria-label={chapterNavigation.previous ? `上一章：${chapterNavigation.previous.volumeTitle}` : '上一章'}
                    variant="secondary"
                    disabled={!chapterNavigation.previous}
                    onClick={() => goToChapter(chapterNavigation.previous)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一章
                  </Button>
                  <Button
                    aria-label={chapterNavigation.next ? `下一章：${chapterNavigation.next.volumeTitle}` : '下一章'}
                    variant="secondary"
                    disabled={!chapterNavigation.next}
                    onClick={() => goToChapter(chapterNavigation.next)}
                  >
                    下一章
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              <div className="reader-progress-stack" dir={direction === 'rtl' ? 'rtl' : 'ltr'}>
                <input
                  aria-label="阅读进度"
                  className="reader-range"
                  type="range"
                  min={0}
                  max={Math.max(0, pageCount - 1)}
                  value={pageIndex}
                  onChange={(event) => goToPage(Number(event.target.value))}
                />
              </div>
            </div>

          </div>
        </>
      ) : null}

      {readerPanel === 'pages' && !loading && !error ? (
        <ReaderPagePanel
          id="reader-page-panel"
          title={title}
          pages={pages}
          pageImages={pageImages}
          pageIndex={pageIndex}
          progress={progress}
          chapters={readerChapters}
          currentChapterId={chapter?.id}
          onClose={() => setReaderPanel('closed')}
          onScrimClick={() => {
            setReaderPanel('closed')
            setControlsVisible(false)
          }}
          onSelectChapter={goToChapter}
          onSelectPage={selectPageFromPanel}
        />
      ) : null}

      {readerPanel === 'help' && !loading && !error ? (
        <ReaderHelpPanel
          id="reader-help-panel"
          mode={readerHelpMode}
          onClose={() => setReaderPanel('closed')}
          onScrimClick={() => {
            setReaderPanel('closed')
            setControlsVisible(false)
          }}
        />
      ) : null}

      {readerPanel === 'controls' && !loading && !error ? (
        <ReaderControlsPanel
          id="reader-controls-panel"
          onClose={() => setReaderPanel('closed')}
          onScrimClick={() => {
            setReaderPanel('closed')
            setControlsVisible(false)
          }}
        >
          <ReaderControlsContent
            readingMode={readingMode}
            setReadingMode={setReadingMode}
            manualSpreadOverride={manualSpreadOverride}
            setManualSpreadOverride={setManualSpreadOverride}
            canManualMerge={canManualMerge}
            zoom={zoom}
            zoomVisiblePages={zoomVisiblePages}
            rotation={rotation}
            setRotation={setRotation}
            rotatePage={rotatePage}
            crop={crop}
            setCrop={setCrop}
            setManualCropInset={setManualCropInset}
            markCurrentVolumeRead={markCurrentVolumeRead}
            markCurrentVolumeUnread={markCurrentVolumeUnread}
            restartCurrentVolume={restartCurrentVolume}
            deletingLocalData={deletingLocalData}
            deleteCurrentLocalReadingData={deleteCurrentLocalReadingData}
          />
        </ReaderControlsPanel>
      ) : null}
    </main>
  )
}

function ReaderControlsPanel({
  id,
  onClose,
  onScrimClick,
  children
}: {
  id: string
  onClose: () => void
  onScrimClick: () => void
  children: ReactNode
}) {
  return (
    <div className="reader-panel-layer" data-reader-interactive="true">
      <button className="reader-panel-scrim" type="button" aria-label="关闭阅读控制" onClick={onScrimClick} />
      <aside id={id} className="reader-side-panel reader-controls-panel" aria-label="阅读控制">
        <div className="reader-panel-header">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Controls</p>
            <h2 className="mt-1 truncate text-base font-semibold text-white">阅读控制</h2>
            <p className="mt-1 text-xs text-white/58">
              调整阅读模式、合页、旋转、裁边和阅读状态。
            </p>
          </div>
          <button className="reader-panel-close" type="button" aria-label="关闭阅读控制" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="reader-controls-scroll">
          {children}
        </div>
      </aside>
    </div>
  )
}

type ReaderControlsContentProps = {
  readingMode: ReadingMode
  setReadingMode: (mode: ReadingMode) => void
  manualSpreadOverride?: ManualSpreadOverride
  setManualSpreadOverride: (override?: ManualSpreadOverride) => void
  canManualMerge: boolean
  zoom: number
  zoomVisiblePages: (action: 'in' | 'out' | 'reset') => void
  rotation: ReadingRotation
  setRotation: (rotation: ReadingRotation) => void
  rotatePage: (delta: 90 | -90) => void
  crop: ReadingCropState
  setCrop: (crop: ReadingCropState) => void
  setManualCropInset: (delta: number) => void
  markCurrentVolumeRead: () => void
  markCurrentVolumeUnread: () => void
  restartCurrentVolume: () => void
  deletingLocalData: boolean
  deleteCurrentLocalReadingData: () => void
}

function ReaderControlsContent({
  readingMode,
  setReadingMode,
  manualSpreadOverride,
  setManualSpreadOverride,
  canManualMerge,
  zoom,
  zoomVisiblePages,
  rotation,
  setRotation,
  rotatePage,
  crop,
  setCrop,
  setManualCropInset,
  markCurrentVolumeRead,
  markCurrentVolumeUnread,
  restartCurrentVolume,
  deletingLocalData,
  deleteCurrentLocalReadingData
}: ReaderControlsContentProps) {
  return (
    <div className="reader-controls-content">
      <section className="reader-control-section" aria-label="阅读状态">
        <div className="reader-control-section-title">阅读状态</div>
        <div className="reader-control-group">
          <button className="reader-control-pill" onClick={markCurrentVolumeRead}>
            标为已读
          </button>
          <button className="reader-control-pill" onClick={markCurrentVolumeUnread}>
            标为未读
          </button>
          <button className="reader-control-pill" onClick={restartCurrentVolume}>
            从头重读
          </button>
        </div>
      </section>

      <section className="reader-control-section" aria-label="本地阅读数据">
        <div className="reader-control-section-title">本地阅读数据</div>
        <div className="reader-control-group">
          <button
            className="reader-control-pill reader-control-danger"
            disabled={deletingLocalData}
            onClick={deleteCurrentLocalReadingData}
          >
            <Trash2 className="h-4 w-4" />
            {deletingLocalData ? '删除中' : '删除本地数据并返回详情'}
          </button>
        </div>
      </section>

      <section className="reader-control-section" aria-label="阅读模式">
        <div className="reader-control-section-title">阅读模式</div>
        <div className="reader-control-group">
          {readingModes.map((mode) => (
            <button key={mode.value} className="reader-control-pill" data-selected={readingMode === mode.value} onClick={() => setReadingMode(mode.value)}>
              {mode.value === 'vertical_scroll' ? <Rows3 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      <section className="reader-control-section" aria-label="页面缩放">
        <div className="reader-control-section-title">页面缩放</div>
        <div className="reader-control-group">
          <button className="reader-control-pill" aria-label="放大" onClick={() => zoomVisiblePages('in')}>
            <Plus className="h-4 w-4" />
            放大
          </button>
          <button className="reader-control-pill" aria-label="缩小" onClick={() => zoomVisiblePages('out')}>
            <Minus className="h-4 w-4" />
            缩小
          </button>
          <button className="reader-control-pill" aria-label="重置缩放" onClick={() => zoomVisiblePages('reset')}>
            <RotateCcw className="h-4 w-4" />
            {zoom.toFixed(1)}x
          </button>
        </div>
      </section>

      <section className="reader-control-section" aria-label="手动合页拆页">
        <div className="reader-control-section-title">合页拆页</div>
        <div className="reader-control-group">
          <button
            className="reader-control-pill"
            data-selected={manualSpreadOverride === 'force_single'}
            onClick={() => setManualSpreadOverride('force_single')}
          >
            <Maximize2 className="h-4 w-4" />
            拆当前页
          </button>
          <button
            className="reader-control-pill"
            data-selected={manualSpreadOverride === 'force_double'}
            disabled={!canManualMerge}
            onClick={() => setManualSpreadOverride('force_double')}
          >
            <Columns2 className="h-4 w-4" />
            合下页
          </button>
          <button
            className="reader-control-pill"
            disabled={!manualSpreadOverride}
            onClick={() => setManualSpreadOverride(undefined)}
          >
            <RotateCcw className="h-4 w-4" />
            自动
          </button>
        </div>
      </section>

      <section className="reader-control-section" aria-label="页面旋转">
        <div className="reader-control-section-title">页面旋转</div>
        <div className="reader-control-group">
          <button className="reader-control-pill" aria-label="向左旋转页面" onClick={() => rotatePage(-90)}>
            <RotateCcw className="h-4 w-4" />
            左旋
          </button>
          <button className="reader-control-pill" data-selected={rotation !== 0} onClick={() => setRotation(0)}>
            {rotation}°
          </button>
          <button className="reader-control-pill" aria-label="向右旋转页面" onClick={() => rotatePage(90)}>
            <RotateCw className="h-4 w-4" />
            右旋
          </button>
        </div>
      </section>

      <section className="reader-control-section" aria-label="页面裁边">
        <div className="reader-control-section-title">页面裁边</div>
        <div className="reader-control-group">
          <button className="reader-control-pill" data-selected={crop.mode === 'none'} onClick={() => setCrop({ mode: 'none' })}>
            原图
          </button>
          <button className="reader-control-pill" data-selected={crop.mode === 'auto'} onClick={() => setCrop({ mode: 'auto' })}>
            自动裁边
          </button>
          <button className="reader-control-pill" aria-label="减少手动裁边" disabled={crop.mode === 'manual' && (crop.inset ?? 0) <= 0} onClick={() => setManualCropInset(-1)}>
            -
          </button>
          <button className="reader-control-pill" data-selected={crop.mode === 'manual'} onClick={() => setCrop({ mode: 'manual', inset: crop.mode === 'manual' ? crop.inset : DEFAULT_MANUAL_CROP_INSET })}>
            手动 {crop.mode === 'manual' ? `${crop.inset ?? 0}%` : `${DEFAULT_MANUAL_CROP_INSET}%`}
          </button>
          <button className="reader-control-pill" aria-label="增加手动裁边" disabled={crop.mode === 'manual' && (crop.inset ?? 0) >= 10} onClick={() => setManualCropInset(1)}>
            +
          </button>
        </div>
      </section>
    </div>
  )
}

function readerHistoryKey(chapter: ChapterCacheRecord, pageCount: number): string {
  return `${chapter.id}:${Math.max(0, pageCount)}`
}

function readerPageSaveKey(chapter: ChapterCacheRecord, pageIndex: number): string {
  return `${chapter.id}:${Math.max(0, pageIndex)}`
}

function ReaderImageView({
  image,
  loading,
  error,
  onRetry,
  onRepairCache,
  onQueueSourceDownload,
  repairMessage,
  sourceQueueMessage,
  recoveryInfo,
  repairingCache,
  enqueueingSource,
  onSkip,
  muted,
  rotation,
  crop,
  initialZoom,
  onZoomChange,
  registerZoomRef,
  spreadSlot = 'single'
}: {
  image?: NativeReaderCachedPageImage
  loading: boolean
  error: string
  onRetry: () => void
  onRepairCache?: () => void
  onQueueSourceDownload?: () => void
  repairMessage?: string
  sourceQueueMessage?: string
  recoveryInfo?: ReaderRecoveryPreflightInfo
  repairingCache?: boolean
  enqueueingSource?: boolean
  onSkip?: () => void
  muted?: boolean
  rotation: ReadingRotation
  crop: ReadingCropState
  initialZoom: number
  onZoomChange?: (scale: number) => void
  registerZoomRef?: (index: number, ref: ReactZoomPanPinchContentRef | null) => void
  spreadSlot?: ReaderSpreadSlot
}) {
  if (error) {
    return (
      <div className="reader-page-error">
        <ReaderRecoveryPreflight
          info={recoveryInfo}
          errorMessage={error}
          repairMessage={repairMessage}
          sourceQueueMessage={sourceQueueMessage}
          repairingCache={repairingCache}
          enqueueingSource={enqueueingSource}
          onRetry={onRetry}
          onRepairCache={onRepairCache}
          onQueueSourceDownload={onQueueSourceDownload}
          onSkip={onSkip}
          compact
        />
      </div>
    )
  }
  if (loading || !image) {
    return <div className="reader-page-loading skeleton" data-muted={muted ? 'true' : undefined} />
  }
  return (
    <ZoomableReaderImage
      image={image}
      muted={muted}
      rotation={rotation}
      crop={crop}
      initialZoom={initialZoom}
      onZoomChange={onZoomChange}
      registerZoomRef={registerZoomRef}
      spreadSlot={spreadSlot}
      viewportFit
    />
  )
}

function ReaderRecoveryPreflight({
  info,
  errorMessage,
  repairMessage,
  sourceQueueMessage,
  repairingCache,
  enqueueingSource,
  onRetry,
  onRepairCache,
  onQueueSourceDownload,
  onSkip,
  onReload,
  compact
}: {
  info?: ReaderRecoveryPreflightInfo
  errorMessage: string
  repairMessage?: string
  sourceQueueMessage?: string
  repairingCache?: boolean
  enqueueingSource?: boolean
  onRetry?: () => void
  onRepairCache?: () => void
  onQueueSourceDownload?: () => void
  onSkip?: () => void
  onReload?: () => void
  compact?: boolean
}) {
  return (
    <div className="reader-recovery-preflight" data-compact={compact ? 'true' : undefined}>
      <div className="reader-recovery-header">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Recovery preflight</div>
          <div className="mt-1 text-sm font-semibold text-white">恢复前检查</div>
        </div>
        {info?.chapterTitle ? <Badge>{info.chapterTitle}</Badge> : null}
      </div>
      <p className="reader-recovery-error">{errorMessage}</p>
      <div className="reader-recovery-grid">
        <ReaderRecoveryCheck
          label="章节缓存"
          value={cachePreflightLabel(info)}
          state={(info?.cachedPageCount ?? 0) > 0 ? 'ok' : 'warn'}
        />
        <ReaderRecoveryCheck
          label="本机阅读文件"
          value={info?.hasSourceArchive ? '已找到可重新解包的 EPUB 或源图 ZIP/CBZ' : '未找到阅读文件，可加入单项下载队列'}
          state={info?.hasSourceArchive ? 'ok' : 'warn'}
        />
        <ReaderRecoveryCheck
          label="恢复方式"
          value={info?.hasSourceArchive ? '优先重新准备缓存；失败后再重新下载阅读文件' : '重新下载 EPUB/源图后自动准备阅读缓存'}
          state="info"
        />
      </div>
      <div className="reader-recovery-actions">
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCcw className="h-4 w-4" />
            重试本页
          </Button>
        ) : null}
        {onRepairCache ? (
          <Button variant="secondary" disabled={repairingCache} onClick={onRepairCache}>
            <RefreshCcw className="h-4 w-4" />
            {repairingCache ? '正在重新准备...' : '重新准备缓存'}
          </Button>
        ) : null}
        {onQueueSourceDownload ? (
          <Button variant="secondary" disabled={enqueueingSource} onClick={onQueueSourceDownload}>
            {enqueueingSource ? '正在加入队列...' : '加入阅读文件队列'}
          </Button>
        ) : null}
        {onReload ? (
          <Button variant="secondary" onClick={onReload}>
            <RefreshCcw className="h-4 w-4" />
            重新读取缓存
          </Button>
        ) : null}
        {onSkip ? (
          <Button variant="secondary" onClick={onSkip}>
            跳过本页
          </Button>
        ) : null}
      </div>
      {repairMessage ? <p className="reader-recovery-note">{repairMessage}</p> : null}
      {sourceQueueMessage ? <p className="reader-recovery-note">{sourceQueueMessage}</p> : null}
    </div>
  )
}

function ReaderRecoveryCheck({
  label,
  value,
  state
}: {
  label: string
  value: string
  state: 'ok' | 'warn' | 'info'
}) {
  return (
    <div className="reader-recovery-check" data-state={state}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function cachePreflightLabel(info?: ReaderRecoveryPreflightInfo): string {
  if (!info) return '无法读取章节缓存元数据'
  if (info.cachedPageCount <= 0) return '没有可阅读页面'
  if (info.pageCount > 0 && info.cachedPageCount < info.pageCount) return `${info.cachedPageCount}/${info.pageCount} 页可读`
  return `${info.cachedPageCount} 页可读`
}

function readerRecoveryPreflightInfo(
  chapter: ChapterCacheRecord | null,
  cachedPageCount: number,
  sourceArchive?: DownloadedFile
): ReaderRecoveryPreflightInfo | undefined {
  if (!chapter) return undefined
  return {
    chapterTitle: chapter.volumeTitle,
    pageCount: chapter.pageCount ?? 0,
    cachedPageCount,
    hasSourceArchive: Boolean(sourceArchive)
  }
}

function ZoomableReaderImage({
  image,
  muted,
  rotation,
  crop,
  initialZoom,
  onZoomChange,
  registerZoomRef,
  spreadSlot = 'single',
  viewportFit = false
}: {
  image: NativeReaderCachedPageImage
  muted?: boolean
  rotation: ReadingRotation
  crop: ReadingCropState
  initialZoom: number
  onZoomChange?: (scale: number) => void
  registerZoomRef?: (index: number, ref: ReactZoomPanPinchContentRef | null) => void
  spreadSlot?: ReaderSpreadSlot
  viewportFit?: boolean
}) {
  const cropInset = getCropInset(crop)
  const safeInitialZoom = clampZoom(initialZoom)
  const contentPlaceItems = spreadSlot === 'first' ? 'center end' : spreadSlot === 'last' ? 'center start' : 'center'
  const rotatedAxis = Math.abs(rotation) % 180 === 90
  const imageStyle = {
    '--reader-page-rotation': `${rotation}deg`,
    '--reader-page-crop-inset': `${cropInset}%`,
    '--reader-page-crop-scale': cropInset > 0 ? String(1 + cropInset / 50) : '1'
  } as CSSProperties
  return (
    <div
      className="reader-zoom-shell"
      data-muted={muted ? 'true' : undefined}
      data-reader-zoom-surface="true"
      data-spread-slot={spreadSlot}
    >
      <TransformWrapper
        ref={(ref) => registerZoomRef?.(image.pageIndex, ref)}
        minScale={1}
        maxScale={4}
        initialScale={safeInitialZoom}
        centerOnInit
        centerZoomedOut
        limitToBounds
        doubleClick={{ mode: 'toggle', step: 1.8, animationTime: 180 }}
        wheel={{ disabled: true }}
        panning={{ allowLeftClickPan: true, velocityDisabled: false }}
        pinch={{ step: 6 }}
        onTransform={(_, state) => onZoomChange?.(state.scale)}
      >
        {() => (
          <TransformComponent
            wrapperClass="reader-transform-wrapper"
            contentClass="reader-transform-content"
            wrapperStyle={viewportFit ? { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' } : undefined}
            contentStyle={viewportFit ? { width: '100%', height: '100%', display: 'grid', placeItems: contentPlaceItems } : undefined}
          >
            <img
              className="reader-page-image"
              data-rotation={rotation}
              data-rotated-axis={rotatedAxis ? 'true' : undefined}
              data-crop-mode={crop.mode}
              data-crop-inset={cropInset}
              style={imageStyle}
              src={image.dataUrl}
              alt={`第 ${image.pageIndex + 1} 页`}
              decoding="async"
              draggable={false}
            />
          </TransformComponent>
        )}
      </TransformWrapper>
    </div>
  )
}

function ContinuousReaderPage({
  index,
  image,
  loadPageImage,
  onVisible,
  onZoomChange,
  rotation,
  crop,
  initialZoom,
  registerZoomRef,
  webtoon
}: {
  index: number
  image?: NativeReaderCachedPageImage
  loadPageImage: (index: number, visible?: boolean) => Promise<NativeReaderCachedPageImage | undefined>
  onVisible: (index: number) => void
  onZoomChange: (scale: number) => void
  rotation: ReadingRotation
  crop: ReadingCropState
  initialZoom: number
  registerZoomRef: (index: number, ref: ReactZoomPanPinchContentRef | null) => void
  webtoon: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver !== 'function') {
      void loadPageImage(index, index === 0)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        void loadPageImage(index, false)
        if (entry.intersectionRatio >= 0.35) onVisible(index)
      }
    }, { threshold: [0.01, 0.35, 0.7], rootMargin: '320px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [index, loadPageImage, onVisible])

  return (
    <div ref={ref} className="reader-continuous-page" data-reader-page-index={index} data-webtoon={webtoon ? 'true' : undefined}>
      {image ? (
        <ZoomableReaderImage image={image} rotation={rotation} crop={crop} initialZoom={initialZoom} onZoomChange={onZoomChange} registerZoomRef={registerZoomRef} />
      ) : (
        <div className="reader-page-loading skeleton" aria-label={`第 ${index + 1} 页加载中`} />
      )}
    </div>
  )
}

function ReaderContinuousSpacer({ size }: { size: number }) {
  return (
    <div
      aria-hidden="true"
      className="reader-continuous-spacer"
      style={{ '--reader-spacer-size': `${Math.max(0, Math.round(size))}px` } as CSSProperties}
    />
  )
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getReaderChapterSiblings(current: ChapterCacheRecord | null, chapters: ChapterCacheRecord[]): ChapterCacheRecord[] {
  if (!current) return []
  return chapters
    .filter((item) => {
      const cacheKind = String(item.cacheKind)
      return item.comicId === current.comicId
        && isReaderArchiveFormat(item.format)
        && (cacheKind === 'reading_cache' || cacheKind === 'reading')
    })
    .sort(compareReaderChapters)
}

function getReaderChapterNavigation(current: ChapterCacheRecord | null, siblings: ChapterCacheRecord[]) {
  if (!current) return { previous: null, next: null, position: -1, total: 0 }
  const position = siblings.findIndex((item) => item.id === current.id)
  if (position < 0) return { previous: null, next: null, position: -1, total: siblings.length }
  return {
    previous: siblings[position - 1] ?? null,
    next: siblings[position + 1] ?? null,
    position,
    total: siblings.length
  }
}

function findReaderSourceArchive(chapter: ChapterCacheRecord | null, library: DownloadedFile[]): DownloadedFile | undefined {
  if (!chapter) return undefined
  const preferred = isReaderArchiveFormat(chapter.format) ? [chapter.format] : undefined
  return findUsableReaderArchiveForVolume(library, chapter.comicId, chapter.volumeId, preferred)
}

function compareReaderChapters(left: ChapterCacheRecord, right: ChapterCacheRecord): number {
  return chapterCollator.compare(left.volumeTitle, right.volumeTitle)
    || chapterCollator.compare(left.volumeId, right.volumeId)
    || chapterCollator.compare(left.id, right.id)
}

function mergeReaderChapterList(chapters: ChapterCacheRecord[], chapter: ChapterCacheRecord): ChapterCacheRecord[] {
  const next = chapters.filter((item) => item.id !== chapter.id)
  next.push(chapter)
  return next.sort(compareReaderChapters)
}

function makeReaderSourceZipTask(chapter: ChapterCacheRecord): DownloadTask {
  const now = new Date().toISOString()
  const format: ReaderArchiveFormat = isReaderArchiveFormat(chapter.format) ? chapter.format : 'source_zip'
  return {
    id: `${chapter.comicId}-${chapter.volumeId}-${format}`,
    comicId: chapter.comicId,
    comicTitle: chapter.comicTitle,
    volId: chapter.volumeId,
    volumeTitle: chapter.volumeTitle,
    format,
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    retryCount: 0,
    createdAt: now,
    updatedAt: now
  }
}

function isReaderInteractiveTarget(target: HTMLElement): boolean {
  return Boolean(target.closest('button, input, select, textarea, a, [contenteditable="true"], [role="button"], [role="slider"], [role="textbox"], [data-reader-interactive="true"]'))
}

function isReaderZoomSurfaceTarget(target: HTMLElement): boolean {
  return Boolean(target.closest('[data-reader-zoom-surface="true"]'))
}

function shouldIgnoreReaderShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return true
  const target = event.target
  return target instanceof HTMLElement && isReaderInteractiveTarget(target)
}

function isPhoneLayout(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(max-width: 767px)').matches
}

function getReaderScrollBehavior(): ScrollBehavior {
  if (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 'auto'
  }
  return 'smooth'
}

function getViewportWidth(): number | undefined {
  return typeof window === 'undefined' ? undefined : window.innerWidth
}

function getViewportHeight(): number | undefined {
  return typeof window === 'undefined' ? undefined : window.innerHeight
}

function useReaderViewportSize(): { width?: number; height?: number } {
  const [size, setSize] = useState(() => ({ width: getViewportWidth(), height: getViewportHeight() }))
  useEffect(() => {
    function update() {
      setSize({ width: getViewportWidth(), height: getViewportHeight() })
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return size
}

function useReaderDoublePageViewport(): boolean {
  const [supportsDouble, setSupportsDouble] = useState(() => getReaderDoublePageViewport())
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(min-width: 900px) and (orientation: landscape)')
    const update = () => setSupportsDouble(query.matches)
    update()
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update)
      return () => query.removeEventListener('change', update)
    }
    query.addListener?.(update)
    return () => query.removeListener?.(update)
  }, [])
  return supportsDouble
}

function getReaderDoublePageViewport(): boolean {
  return Boolean(
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(min-width: 900px) and (orientation: landscape)').matches
  )
}

function clampPageIndex(value: number, pageCount: number): number {
  if (!Number.isFinite(value) || pageCount <= 0) return 0
  return Math.max(0, Math.min(Math.floor(value), pageCount - 1))
}

function normalizeRotation(value: number): ReadingRotation {
  const normalized = ((value % 360) + 360) % 360
  return (normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0) as ReadingRotation
}

function getCropInset(crop: ReadingCropState): number {
  if (crop.mode === 'auto') return AUTO_CROP_INSET
  if (crop.mode === 'manual') return clampCropInset(crop.inset ?? DEFAULT_MANUAL_CROP_INSET)
  return 0
}

function clampCropInset(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MANUAL_CROP_INSET
  return Math.max(0, Math.min(10, Math.round(value)))
}

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(4, value))
}

function stringifySpreadOverrides(overrides?: Record<number, ManualSpreadOverride>): string | undefined {
  if (!overrides || Object.keys(overrides).length === 0) return undefined
  return JSON.stringify(overrides)
}

function defaultPageLayout(): PageLayout {
  return getReaderDoublePageViewport() ? 'double' : 'single'
}

function normalizeVisiblePageLayout(layout: PageLayout): PageLayout {
  return layout === 'auto_double' ? 'double' : layout
}
