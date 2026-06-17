import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowUp, BookOpen, CheckCircle2, Download, FileText, FolderOpen, Pause, Play, RefreshCcw, RotateCcw, Search, X, XCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { ProgressBar } from '../components/ProgressBar'
import { PageHeader } from '../components/layout/PageHeader'
import { useDownloadStore } from '../store/downloadStore'
import { useCacheStore } from '../store/cacheStore'
import { useSettingsStore } from '../store/settingsStore'
import { formatBytes, readableAppMessage, readableDownloadIssue, statusLabel } from '../lib/format'
import {
  cancelNativeDownloadTask,
  clearNativeQueue,
  exportLocalFile,
  isNativeUnavailable,
  listNativeDownloadedFiles,
  listNativeDownloadTasks,
  openLocalFile,
  pauseNativeDownloadTask,
  prepareNativeReaderChapterCache,
  preflightNativeDownloadQueue,
  prioritizeNativeDownloadTask,
  revealLocalFile,
  resumeNativeDownloadTask,
  retryNativeDownloadTask,
  startNativeDownloadQueue,
  type NativeDownloadPreflight,
  type NativeDownloadPreflightCheck
} from '../platform/nativeCommands'
import { createDownloadPipelinePlan } from '../download/pipeline'
import { detectPlatformTarget, isMobileAppTarget } from '../download/pathPlanner'
import { compareDownloadQueueOrder } from '../download/stateMachine'
import {
  canOpenDownloadedTask,
  canRetryDownloadedTask,
  countDownloadTab,
  downloadTabs,
  taskMatchesDownloadTab,
  type DownloadTabKey
} from '../download/taskFilters'
import type { DownloadTask } from '../types/domain'
import { findReadyReadingCacheForVolume, isReaderArchiveFormat } from '../reading/sourceArchive'

export function DownloadCenterPage() {
  const navigate = useNavigate()
  const store = useDownloadStore()
  const replaceWithNativeSnapshot = useDownloadStore((state) => state.replaceWithNativeSnapshot)
  const chaptersById = useCacheStore((state) => state.chaptersById)
  const upsertChapter = useCacheStore((state) => state.upsertChapter)
  const registerPages = useCacheStore((state) => state.registerPages)
  const settings = useSettingsStore()
  const platformTarget = useMemo(() => detectPlatformTarget(), [])
  const mobileFileExport = isMobileAppTarget(platformTarget)
  const [tab, setTab] = useState<DownloadTabKey>('all')
  const [message, setMessage] = useState('')
  const [preflight, setPreflight] = useState<NativeDownloadPreflight | undefined>()
  const [confirmClearQueue, setConfirmClearQueue] = useState(false)
  const [nativeQueueRunning, setNativeQueueRunning] = useState(false)
  const showMessage = useCallback((value: unknown, fallback?: string) => {
    setMessage(readableAppMessage(value, fallback))
  }, [])
  const nativeRunId = useRef(0)
  const nativePollTimer = useRef<number | undefined>(undefined)
  const tasks = useMemo(() => store.tasks.filter((task) => taskMatchesDownloadTab(task, tab)), [store.tasks, tab])
  const cachedChapters = useMemo(() => Object.values(chaptersById), [chaptersById])
  const executionTasks = useMemo(
    () => store.tasks
      .filter((task) => ['queued', 'authorizing', 'downloading', 'verifying'].includes(task.status))
      .sort(compareDownloadQueueOrder),
    [store.tasks]
  )
  const hasActiveNativeTask = useMemo(
    () => store.tasks.some((task) => ['authorizing', 'downloading', 'verifying'].includes(task.status)),
    [store.tasks]
  )
  const queuedCount = executionTasks.filter((task) => task.status === 'queued').length
  const unfinishedCount = store.tasks.filter((task) => task.status !== 'completed').length
  const activeTask = executionTasks.find((task) => task.status !== 'queued')
  const nextTask = executionTasks.find((task) => task.status === 'queued')
  const canRunQueue = executionTasks.length > 0 && !nativeQueueRunning
  const canClearUnfinished = unfinishedCount > 0 && !nativeQueueRunning && !hasActiveNativeTask
  const tabCounts = useMemo(
    () => Object.fromEntries(downloadTabs.map((item) => [item.key, countDownloadTab(store.tasks, item.key)])) as Record<DownloadTabKey, number>,
    [store.tasks]
  )
  const syncNativeSnapshot = useCallback(async (options?: { quiet?: boolean; recoverInterrupted?: boolean }) => {
    const taskListOptions = options?.recoverInterrupted === undefined ? undefined : { recoverInterrupted: options.recoverInterrupted }
    const [taskResult, libraryResult] = await Promise.all([
      listNativeDownloadTasks(taskListOptions),
      listNativeDownloadedFiles()
    ])
    if (taskResult.ok && taskResult.value !== undefined && libraryResult.ok && libraryResult.value !== undefined) {
      const snapshot = replaceWithNativeSnapshot(
        { tasks: taskResult.value, library: libraryResult.value },
        { recoverInterrupted: options?.recoverInterrupted }
      )
      if (!options?.quiet) setMessage(`已同步 ${snapshot.tasks.length} 个下载任务。 已同步 ${snapshot.library.length} 个资料库项目。`)
      return true
    }
    const nativeError = [taskResult, libraryResult].find((result) => !result.ok && !isNativeUnavailable(result))
    if (nativeError) showMessage(nativeError.message)
    return false
  }, [replaceWithNativeSnapshot, showMessage])

  useEffect(() => {
    void syncNativeSnapshot()
  }, [syncNativeSnapshot])

  useEffect(
    () => () => {
      if (nativePollTimer.current) window.clearTimeout(nativePollTimer.current)
      nativeRunId.current += 1
    },
    []
  )

  const pollNativeSnapshot = useCallback(
    (runId: number) => {
      if (nativePollTimer.current) window.clearTimeout(nativePollTimer.current)
      const poll = async () => {
        if (nativeRunId.current !== runId) return
        await syncNativeSnapshot({ quiet: true, recoverInterrupted: false })
        if (nativeRunId.current !== runId) return
        nativePollTimer.current = window.setTimeout(poll, 350)
      }
      nativePollTimer.current = window.setTimeout(poll, 120)
    },
    [syncNativeSnapshot]
  )

  useEffect(() => {
    if (!hasActiveNativeTask || nativeQueueRunning) return undefined
    const runId = nativeRunId.current + 1
    nativeRunId.current = runId
    pollNativeSnapshot(runId)
    return () => {
      if (nativePollTimer.current) window.clearTimeout(nativePollTimer.current)
      nativeRunId.current += 1
    }
  }, [hasActiveNativeTask, nativeQueueRunning, pollNativeSnapshot])

  const startQueue = useCallback(async () => {
    setConfirmClearQueue(false)
    if (executionTasks.length === 0) {
      setMessage('没有待处理任务。下载中心已同步完成记录。')
      return
    }
    const preflightResult = await preflightNativeDownloadQueue(settings.downloadDirectory)
    if (preflightResult.ok && preflightResult.value) {
      setPreflight(preflightResult.value)
      if (!preflightResult.value.ok) {
        if (preflightHasOnlyActiveTaskBlock(preflightResult.value)) {
          const runId = nativeRunId.current + 1
          nativeRunId.current = runId
          setMessage('已有下载任务正在执行，正在刷新队列状态。')
          pollNativeSnapshot(runId)
          return
        }
        showMessage(preflightResult.message)
        return
      }
    } else if (!isNativeUnavailable(preflightResult)) {
      showMessage(preflightResult.message)
      return
    }

    const runId = nativeRunId.current + 1
    nativeRunId.current = runId
    const queueRun = startNativeDownloadQueue(settings.downloadDirectory)
    const firstResult = await Promise.race([queueRun, delay(180).then(() => undefined)])

    if (!firstResult) {
      setNativeQueueRunning(true)
      setMessage(
        mobileFileExport
          ? '前台下载运行中，请保持 App 打开。'
          : '下载队列运行中，正在刷新任务状态。'
      )
      pollNativeSnapshot(runId)
      const result = await queueRun
      if (nativeRunId.current !== runId) return
      if (nativePollTimer.current) window.clearTimeout(nativePollTimer.current)
      setNativeQueueRunning(false)
      if (result.ok) {
        await syncNativeSnapshot()
      } else {
        showMessage(result.message)
      }
      return
    }

    if (firstResult.ok) {
      await syncNativeSnapshot()
    } else {
      showMessage(firstResult.message)
    }
  }, [executionTasks.length, mobileFileExport, pollNativeSnapshot, settings.downloadDirectory, showMessage, syncNativeSnapshot])

  const prioritizeTask = useCallback(async (task: DownloadTask) => {
    const result = await prioritizeNativeDownloadTask(task.id)
    if (result.ok) {
      await syncNativeSnapshot()
      setMessage(`已把「${task.comicTitle} · ${task.volumeTitle}」设为下一项。`)
      return
    }
    if (isNativeUnavailable(result)) {
      showMessage(result.message)
      return
    }
    showMessage(result.message, '暂时无法调整下载顺序。')
  }, [showMessage, syncNativeSnapshot])

  const openReaderTask = useCallback(async (task: DownloadTask) => {
    if (!task.localPath || !isReaderArchiveFormat(task.format)) {
      showMessage('这个格式不能直接进入内置阅读器。')
      return
    }
    const readyCache = findReadyReadingCacheForVolume(cachedChapters, task.comicId, task.volId)
    if (readyCache) {
      navigate(`/reader/cache/${encodeURIComponent(readyCache.id)}`)
      return
    }
    setMessage(`正在准备「${task.comicTitle} · ${task.volumeTitle}」阅读缓存。`)
    const result = await prepareNativeReaderChapterCache({
      archivePath: task.localPath,
      comicId: task.comicId,
      comicTitle: task.comicTitle,
      volumeId: task.volId,
      volumeTitle: task.volumeTitle,
      sourceTaskId: task.id,
      format: task.format,
      policy: 'balanced'
    })
    if (result.ok && result.value) {
      upsertChapter(result.value.chapter)
      registerPages(result.value.chapter.id, result.value.pages)
      navigate(`/reader/cache/${encodeURIComponent(result.value.chapter.id)}`)
      return
    }
    showMessage(result.message, '暂时无法准备阅读缓存，请确认下载文件仍在保存位置。')
  }, [cachedChapters, navigate, registerPages, showMessage, upsertChapter])

  const runPreflight = useCallback(async () => {
    const result = await preflightNativeDownloadQueue(settings.downloadDirectory)
    if (result.ok && result.value) {
      setPreflight(result.value)
      showMessage(result.message)
    } else {
      showMessage(result.message)
      if (isNativeUnavailable(result)) setPreflight(undefined)
    }
  }, [settings.downloadDirectory, showMessage])

  return (
    <div className="content-grid">
      <PageHeader
        eyebrow="下载管理"
        title="下载中心"
        description="管理下载队列、进度、重试和保存位置。"
        actions={(
          <>
          <Button
            variant="primary"
            disabled={!canRunQueue}
            onClick={() => void startQueue()}
            title={executionTasks.length === 0 ? '没有待处理任务' : undefined}
          >
            <Play className="h-4 w-4" />
            {nativeQueueRunning ? '队列运行中' : executionTasks.length === 0 ? '无待处理任务' : '启动队列'}
          </Button>
          <Button
            disabled={nativeQueueRunning}
            onClick={() => void runPreflight()}
          >
            <CheckCircle2 className="h-4 w-4" />
            检查队列
          </Button>
          <Button
            onClick={async () => {
              if (!confirmClearQueue) {
                setConfirmClearQueue(true)
                setMessage('再次点击“清理未完成”才会移除未完成任务。已完成记录会保留。')
                return
              }
              const result = await clearNativeQueue()
              setConfirmClearQueue(false)
              if (result.ok) {
                await syncNativeSnapshot()
              } else if (isNativeUnavailable(result)) {
                showMessage(result.message)
              } else {
                showMessage(result.message)
              }
            }}
            disabled={!canClearUnfinished}
            title={unfinishedCount === 0 ? '没有未完成任务' : hasActiveNativeTask ? '下载运行中，先暂停或取消任务' : undefined}
          >
            <RefreshCcw className="h-4 w-4" />
            {unfinishedCount === 0 ? '无未完成任务' : confirmClearQueue ? '确认清理未完成' : '清理未完成'}
          </Button>
          </>
        )}
      />

      <div className="download-center-grid">
        <aside className="download-filter-panel glass-panel sticky top-4 grid gap-4 rounded-[var(--radius-panel)] p-4">
          <div>
            <h2 className="text-sm font-bold tracking-[0.16em] text-[var(--app-muted)]">任务视图</h2>
            <div className="download-tab-list mt-3 grid gap-2">
              {downloadTabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="liquid-chip pressable flex w-full items-center justify-between"
                  data-selected={tab === item.key}
                  onClick={() => setTab(item.key)}
                >
                  <span>{item.label}</span>
                  <span>{tabCounts[item.key]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="download-filter-badges grid gap-2">
            <Badge tone="success">下载队列</Badge>
            <Badge>待下载</Badge>
            {nativeQueueRunning ? <Badge tone="info">刷新中</Badge> : null}
          </div>
          {message ? <div className="metric-tile break-words p-3 text-sm leading-6 text-[var(--app-muted)]">{message}</div> : null}
        </aside>

        <div className="grid min-w-0 gap-4">
          {preflight ? <PreflightPanel preflight={preflight} /> : null}

          <section className="download-metrics-grid md:grid-cols-3">
            <QueueMetric title="等待队列" value={`${queuedCount} 项`} hint={unfinishedCount === 0 ? '没有待处理任务。' : '等待下载的内容会按加入时间处理。'} />
            <QueueMetric
              title="当前执行"
              value={activeTask ? activeTask.volumeTitle : '未开始'}
              hint={activeTask ? `${activeTask.comicTitle} · ${statusLabel(activeTask.status)}` : '点击启动队列后从最早入队项开始。'}
            />
            <QueueMetric
              title="下一项"
              value={nextTask ? nextTask.volumeTitle : '无'}
              hint="队列会从最早加入的内容继续执行。"
            />
          </section>

          {tasks.length === 0 ? <DownloadEmptyState /> : null}
          <div className="download-task-list">
            {tasks.map((task) => {
              const plan = createDownloadPipelinePlan(task, settings, platformTarget)
              const displayPath = displayDownloadPath(plan, mobileFileExport)
              const serialIndex = executionTasks.findIndex((item) => item.id === task.id)
              const isNextQueuedTask = task.status === 'queued' && nextTask?.id === task.id
              const canStartQueuedTask = isNextQueuedTask && !activeTask
              const canPrioritizeQueuedTask = task.status === 'queued' && !canStartQueuedTask
              const canReadDownloadedTask = task.status === 'completed' && Boolean(task.localPath) && isReaderArchiveFormat(task.format)
              const completedWithoutLocalPath = task.status === 'completed' && !task.localPath
              return (
                <div key={task.id} className="download-task-card status-pop grid min-w-0 gap-3 overflow-hidden p-3 md:p-4" data-status={task.status}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="break-words font-semibold">{task.comicTitle}</div>
                      <div className="mt-1 break-words text-sm text-[var(--app-muted)]">
                        {task.volumeTitle} · {task.format.toUpperCase()} · {formatBytes(task.totalBytes)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={task.status === 'failed' ? 'danger' : task.status === 'completed' ? 'success' : 'info'}>{statusLabel(task.status)}</Badge>
                      {serialIndex >= 0 ? <Badge>序号 {serialIndex + 1}/{executionTasks.length}</Badge> : null}
                    </div>
                  </div>
                  <div className="download-progress-head flex items-center justify-between gap-3 text-xs font-semibold text-[var(--app-muted)]">
                    <span>{formatBytes(task.downloadedBytes)} / {formatBytes(task.totalBytes)}</span>
                    <span>{Math.round(task.progress)}%</span>
                  </div>
                  <ProgressBar value={task.progress} />
                  {task.errorMessage ? (
                    <div className="feedback-warning text-xs leading-5">{readableDownloadIssue(task.errorMessage)}</div>
                  ) : null}
                  {completedWithoutLocalPath ? (
                    <div className="feedback-warning text-xs leading-5">
                      已完成记录缺少本机文件路径。请重新同步队列；如果文件已被移动或删除，需要重新下载后才能阅读或打开。
                    </div>
                  ) : null}
                  <div className="grid min-w-0 gap-3">
                    <div className="download-task-meta">
                      <span className="soft-code block max-w-full text-xs leading-5">
                        保存到：{displayPath}
                      </span>
                    </div>
                    <div className="download-task-actions">
                      {(task.status === 'downloading' || task.status === 'authorizing') ? (
                        <Button
                          className="w-full sm:w-auto"
                          onClick={async () => {
                            const result = await pauseNativeDownloadTask(task.id)
                            if (result.ok) {
                              await syncNativeSnapshot()
                            } else if (isNativeUnavailable(result)) {
                              showMessage(result.message)
                            } else {
                              showMessage(result.message)
                            }
                          }}
                        >
                          <Pause className="h-4 w-4" />
                          暂停
                        </Button>
                      ) : null}
                      {task.status === 'queued' ? (
                        <Button
                          className="w-full sm:w-auto"
                          disabled={nativeQueueRunning}
                          onClick={() => void (canStartQueuedTask ? startQueue() : prioritizeTask(task))}
                        >
                          {canPrioritizeQueuedTask ? <ArrowUp className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          {canStartQueuedTask ? (task.errorMessage ? '重新确认' : '启动队列') : '优先处理'}
                        </Button>
                      ) : null}
                      {task.status === 'paused' ? (
                        <Button
                          className="w-full sm:w-auto"
                          onClick={async () => {
                            const result = await resumeNativeDownloadTask(task.id)
                            if (result.ok) {
                              await syncNativeSnapshot()
                            } else if (isNativeUnavailable(result)) {
                              showMessage(result.message)
                            } else {
                              showMessage(result.message)
                            }
                          }}
                        >
                          <Play className="h-4 w-4" />
                          继续
                        </Button>
                      ) : null}
                      {canRetryDownloadedTask(task) ? (
                        <Button
                          className="w-full sm:w-auto"
                          onClick={async () => {
                            const result = await retryNativeDownloadTask(task.id)
                            if (result.ok) {
                              await syncNativeSnapshot()
                            } else if (isNativeUnavailable(result)) {
                              showMessage(result.message)
                            } else {
                              showMessage(result.message)
                            }
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                          重试
                        </Button>
                      ) : null}
                      {task.status !== 'cancelled' && task.status !== 'completed' ? (
                        <Button
                          className="w-full sm:w-auto"
                          variant="danger"
                          onClick={async () => {
                            const result = await cancelNativeDownloadTask(task.id)
                            if (result.ok) {
                              await syncNativeSnapshot()
                            } else if (isNativeUnavailable(result)) {
                              showMessage(result.message)
                            } else {
                              showMessage(result.message)
                            }
                          }}
                        >
                          <X className="h-4 w-4" />
                          取消
                        </Button>
                      ) : null}
                      {canReadDownloadedTask ? (
                        <Button
                          className="w-full sm:w-auto"
                          variant="primary"
                          onClick={() => void openReaderTask(task)}
                        >
                          <BookOpen className="h-4 w-4" />
                          阅读
                        </Button>
                      ) : null}
                      {completedWithoutLocalPath ? (
                        <Button
                          className="w-full sm:w-auto"
                          onClick={() => void syncNativeSnapshot({ recoverInterrupted: true })}
                        >
                          <RefreshCcw className="h-4 w-4" />
                          重新同步
                        </Button>
                      ) : null}
                      {canOpenDownloadedTask(task) ? (
                        <>
                          {!canReadDownloadedTask ? (
                            <Button
                              className="w-full sm:w-auto"
                              onClick={async () => {
                                if (!task.localPath) return
                                const result = mobileFileExport
                                  ? await exportLocalFile(task.localPath)
                                  : await openLocalFile(task.localPath)
                                showMessage(result.message)
                              }}
                            >
                              <FileText className="h-4 w-4" />
                              {mobileFileExport ? '导出文件' : '打开文件'}
                            </Button>
                          ) : null}
                          {canReadDownloadedTask || !mobileFileExport ? (
                            <Button
                              className="w-full sm:w-auto"
                              onClick={async () => {
                                if (!task.localPath) return
                                const result = mobileFileExport
                                  ? await exportLocalFile(task.localPath)
                                  : await revealLocalFile(task.localPath)
                                showMessage(result.message)
                              }}
                            >
                              <FolderOpen className="h-4 w-4" />
                              {mobileFileExport ? '导出文件' : '查看位置'}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function DownloadEmptyState() {
  return (
    <section className="download-empty-state glass-panel grid gap-4 rounded-[var(--radius-panel)] p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
      <div className="download-empty-main min-w-0">
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-[24px] border border-[var(--app-border)] subtle-fill shadow-[var(--app-glow)]">
          <Download className="h-7 w-7 text-[var(--app-muted)]" />
        </div>
        <h2 className="text-2xl font-bold">还没有下载任务</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
          打开漫画详情，选择卷/话和格式后加入队列。队列会按单项顺序处理，方便你控制保存位置、重试和阅读缓存。
        </p>
      </div>
      <div className="download-empty-actions flex flex-wrap gap-2 md:flex-col">
        <Link to="/">
          <Button variant="primary" className="w-full justify-center">
            <Search className="h-4 w-4" />
            去找漫画
          </Button>
        </Link>
        <Link to="/library">
          <Button className="w-full justify-center">
            <FolderOpen className="h-4 w-4" />
            查看资料库
          </Button>
        </Link>
      </div>
      <div className="download-empty-points grid gap-2 text-sm text-[var(--app-muted)] sm:grid-cols-3 md:col-span-2">
        <div className="metric-tile p-3"><strong className="block text-[var(--app-fg)]">单项队列</strong><span>多选只生成本地任务。</span></div>
        <div className="metric-tile p-3"><strong className="block text-[var(--app-fg)]">阅读优先</strong><span>EPUB 和源图 ZIP 完成后优先进入内置 Reader。</span></div>
        <div className="metric-tile p-3"><strong className="block text-[var(--app-fg)]">文件管理</strong><span>MOBI 等文件格式保留打开和查看位置。</span></div>
      </div>
    </section>
  )
}

function QueueMetric({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="queue-metric metric-tile p-3 md:p-4">
      <div className="queue-metric-title text-xs font-bold tracking-[0.14em] text-[var(--app-muted)]">{title}</div>
      <div className="queue-metric-value mt-1 break-words text-base font-semibold md:text-lg">{value}</div>
      <div className="queue-metric-hint mt-1 text-xs leading-5 text-[var(--app-muted)]">{hint}</div>
    </div>
  )
}

function displayDownloadPath(plan: ReturnType<typeof createDownloadPipelinePlan>, mobileFileExport: boolean): string {
  const prefix = mobileFileExport ? 'App 内 / Kmoe' : '资料库'
  return `${prefix} / ${plan.path.relativeDirectory} / ${plan.path.filename}`
}

function PreflightPanel({ preflight }: { preflight: NativeDownloadPreflight }) {
  return (
    <section className="glass-panel grid gap-3 rounded-[var(--radius-panel)] p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold">队列状态</h2>
          <p className="mt-1 text-sm text-[var(--app-muted)]">
            确认保存位置、任务数量和当前队列状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={preflight.ok ? 'success' : 'danger'}>{preflight.ok ? '可启动' : '需要处理'}</Badge>
          <Badge>等待 {preflight.queuedCount}</Badge>
          {preflight.activeCount ? <Badge tone="warning">执行中 {preflight.activeCount}</Badge> : null}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {preflight.checks.map((check) => <PreflightCheckRow key={check.id} check={check} />)}
      </div>
      <div className="grid gap-1 text-xs text-[var(--app-muted)]">
        {preflight.downloadDirectory ? <span className="break-words">保存位置：已设置，可在设置中调整。</span> : null}
        {preflight.firstTaskLabel ? <span className="break-words">首项任务：{preflight.firstTaskLabel}</span> : null}
      </div>
    </section>
  )
}

function PreflightCheckRow({ check }: { check: NativeDownloadPreflightCheck }) {
  const icon = check.status === 'pass'
      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-success)]" />
    : check.status === 'warn'
      ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-warning)]" />
      : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-danger)]" />
  const tone = check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'danger'
  const label = check.status === 'pass' ? '通过' : check.status === 'warn' ? '提醒' : '未通过'
  const checkLabel = readablePreflightLabel(check)
  const checkDetail = readablePreflightDetail(check)
  return (
    <div className="metric-tile flex min-w-0 gap-2 p-3 text-sm">
      {icon}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{checkLabel}</span>
          <Badge tone={tone}>{label}</Badge>
        </div>
        <div className="mt-1 break-words text-xs leading-5 text-[var(--app-muted)]">{checkDetail}</div>
      </div>
    </div>
  )
}

function preflightHasOnlyActiveTaskBlock(preflight: NativeDownloadPreflight): boolean {
  const failedChecks = preflight.checks.filter((check) => check.status === 'fail')
  return preflight.activeCount > 0 && failedChecks.length > 0 && failedChecks.every((check) => check.id === 'active-task')
}

function readablePreflightLabel(check: NativeDownloadPreflightCheck): string {
  if (check.id === 'sqlite') return '资料库状态'
  if (check.id === 'native-env' || check.id === 'download-dir') return '保存位置'
  if (check.id === 'session') return '登录状态'
  return check.label
}

function readablePreflightDetail(check: NativeDownloadPreflightCheck): string {
  if (check.id === 'download-dir' && check.status === 'pass') return '保存位置可用。'
  if (check.id === 'native-env') return '保存位置可用，下载任务可以开始。'
  if (check.id === 'session') return '请确认已经登录；开始下载前会再次检查账号状态。'
  return readableAppMessage(check.detail, check.status === 'fail' ? '这项检查未通过，请处理后重试。' : '检查完成。')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
