import { describe, expect, it } from 'vitest'
import { canOpenDownloadedTask, canRetryDownloadedTask, countDownloadTab, taskMatchesDownloadTab } from '../download/taskFilters'
import type { DownloadTask, DownloadTaskStatus } from '../types/domain'

describe('download task filters', () => {
  it('groups active and finished statuses for the download center tabs', () => {
    const tasks = [
      task('queued'),
      task('authorizing'),
      task('downloading'),
      task('verifying'),
      task('paused'),
      task('completed', { localPath: '/tmp/a.mobi' }),
      task('failed'),
      task('cancelled')
    ]

    expect(countDownloadTab(tasks, 'all')).toBe(8)
    expect(countDownloadTab(tasks, 'active')).toBe(3)
    expect(countDownloadTab(tasks, 'finished')).toBe(1)
    expect(countDownloadTab(tasks, 'queued')).toBe(1)
    expect(countDownloadTab(tasks, 'paused')).toBe(1)
    expect(countDownloadTab(tasks, 'failed')).toBe(1)
    expect(countDownloadTab(tasks, 'cancelled')).toBe(1)
    expect(taskMatchesDownloadTab(task('completed'), 'finished')).toBe(true)
  })

  it('only enables file actions for completed tasks with a local path', () => {
    expect(canOpenDownloadedTask(task('completed', { localPath: '/tmp/a.mobi' }))).toBe(true)
    expect(canOpenDownloadedTask(task('downloading', { localPath: '/tmp/a.mobi' }))).toBe(false)
    expect(canOpenDownloadedTask(task('completed'))).toBe(false)
  })

  it('enables retry only for failed and cancelled retryable tasks', () => {
    expect(canRetryDownloadedTask(task('failed'))).toBe(true)
    expect(canRetryDownloadedTask(task('cancelled'))).toBe(true)
    expect(canRetryDownloadedTask(task('failed', { retryCount: 3, errorMessage: 'network timeout' }))).toBe(false)
    expect(canRetryDownloadedTask(task('failed', { errorMessage: 'VIP only' }))).toBe(false)
    expect(canRetryDownloadedTask(task('failed', { errorMessage: '需要通過真實驗證後才可下載' }))).toBe(false)
    expect(canRetryDownloadedTask(task('queued'))).toBe(false)
    expect(canRetryDownloadedTask(task('authorizing'))).toBe(false)
    expect(canRetryDownloadedTask(task('downloading'))).toBe(false)
    expect(canRetryDownloadedTask(task('verifying'))).toBe(false)
    expect(canRetryDownloadedTask(task('completed'))).toBe(false)
  })
})

function task(status: DownloadTaskStatus, patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: `task-${status}-${patch.localPath ?? 'none'}`,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'mobi',
    status,
    progress: status === 'completed' ? 100 : 0,
    downloadedBytes: 0,
    retryCount: 0,
    createdAt: '100',
    updatedAt: '100',
    ...patch
  }
}
