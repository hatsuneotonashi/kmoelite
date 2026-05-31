import type { ComicDetail, DownloadFormat, DownloadTask, DownloadTaskStatus } from '../types/domain'
import { nowIso } from '../lib/format'
import { canQueueDownloadOption } from './optionGuards'

export const DEFAULT_CONCURRENCY = 1
export const MAX_RETRY_COUNT = 3
const POLICY_RETRY_BLOCK_PATTERN = /VIP|Lv2|Lv3|level|quota|額度|额度|insufficient|权限不足|權限不足|没有下载权限|沒有下載權限|no permission|真實驗證|真实验证|true verification|暫不可下載|暂不可下载|製作中|制作中/i

export type DownloadEvent =
  | 'enqueue'
  | 'start'
  | 'authorize'
  | 'progress'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'retry'
  | 'fail'
  | 'complete'

const transitions: Record<DownloadTaskStatus, Partial<Record<DownloadEvent, DownloadTaskStatus>>> = {
  queued: { start: 'authorizing', cancel: 'cancelled' },
  authorizing: { authorize: 'downloading', pause: 'paused', fail: 'failed', cancel: 'cancelled' },
  downloading: { progress: 'downloading', pause: 'paused', fail: 'failed', complete: 'verifying', cancel: 'cancelled' },
  paused: { resume: 'queued', cancel: 'cancelled' },
  verifying: { complete: 'completed', fail: 'failed', cancel: 'cancelled' },
  completed: {},
  failed: { retry: 'queued', cancel: 'cancelled' },
  cancelled: { retry: 'queued' }
}

export function transitionTask(task: DownloadTask, event: DownloadEvent, patch: Partial<DownloadTask> = {}): DownloadTask {
  const next = transitions[task.status][event]
  if (!next) return task
  return {
    ...task,
    ...patch,
    status: next ?? task.status,
    updatedAt: nowIso()
  }
}

export function makeDownloadTask(input: {
  comic: ComicDetail
  volId: string
  format: DownloadFormat
}): DownloadTask | undefined {
  const option = input.comic.downloadOptions.find((item) => item.volId === input.volId)
  if (!option) return undefined
  if (!canQueueDownloadOption(option, input.format)) return undefined
  const now = nowIso()
  return {
    id: `${input.comic.id}-${option.volId}-${input.format}`,
    comicId: input.comic.id,
    comicTitle: input.comic.title,
    volId: option.volId,
    volumeTitle: option.displayTitle,
    format: input.format,
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: input.format === 'mobi' ? option.sizes.mobi : input.format === 'epub' ? option.sizes.epub : option.sizes.sourceZip,
    retryCount: 0,
    errorMessage: option.restrictions.length ? option.restrictions.join(', ') : undefined,
    createdAt: now,
    updatedAt: now
  }
}

export function makeOrderedDownloadTasks(input: {
  comic: ComicDetail
  selectedVolIds: string[]
  format: DownloadFormat
}): DownloadTask[] {
  const baseTime = Date.now()
  return input.selectedVolIds
    .map((volId, index) => {
      const task = makeDownloadTask({ comic: input.comic, volId, format: input.format })
      if (!task) return undefined
      const createdAt = new Date(baseTime + index).toISOString()
      return {
        ...task,
        createdAt,
        updatedAt: createdAt
      }
    })
    .filter((task): task is DownloadTask => Boolean(task))
}

export function createDedupedTasks(existing: DownloadTask[], incoming: DownloadTask[]): DownloadTask[] {
  const keys = new Set(existing.map(taskKey))
  return incoming.filter((task) => {
    const key = taskKey(task)
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
}

export function taskKey(task: Pick<DownloadTask, 'comicId' | 'volId' | 'format'>): string {
  return `${task.comicId}:${task.volId}:${task.format}`
}

export function compareDownloadQueueOrder(a: Pick<DownloadTask, 'createdAt' | 'id'>, b: Pick<DownloadTask, 'createdAt' | 'id'>): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export function canRetry(task: DownloadTask): boolean {
  if (task.status !== 'failed' && task.status !== 'cancelled') return false
  if (task.retryCount >= MAX_RETRY_COUNT) return false
  const message = task.errorMessage ?? ''
  return !POLICY_RETRY_BLOCK_PATTERN.test(message)
}

export function recoverTaskAfterRestart(task: DownloadTask): DownloadTask {
  if (!['authorizing', 'downloading', 'verifying'].includes(task.status)) return task
  return {
    ...task,
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    localPath: undefined,
    errorMessage: '应用重新启动，需要重新确认下载。',
    updatedAt: nowIso()
  }
}
