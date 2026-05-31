import type { DownloadTask } from '../types/domain'
import { canRetry } from './stateMachine'

export type DownloadTabKey = 'all' | 'queued' | 'active' | 'paused' | 'finished' | 'failed' | 'cancelled'

export const downloadTabs: Array<{ key: DownloadTabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'queued', label: '排队中' },
  { key: 'active', label: '进行中' },
  { key: 'paused', label: '已暂停' },
  { key: 'finished', label: '已完成' },
  { key: 'failed', label: '失败' },
  { key: 'cancelled', label: '已取消' }
]

export function taskMatchesDownloadTab(task: DownloadTask, tab: DownloadTabKey): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'active':
      return task.status === 'authorizing' || task.status === 'downloading' || task.status === 'verifying'
    case 'finished':
      return task.status === 'completed'
    case 'queued':
    case 'paused':
    case 'failed':
    case 'cancelled':
      return task.status === tab
  }
  return false
}

export function canOpenDownloadedTask(task: DownloadTask): boolean {
  return Boolean(task.localPath && task.status === 'completed')
}

export function canRetryDownloadedTask(task: DownloadTask): boolean {
  return canRetry(task)
}

export function countDownloadTab(tasks: DownloadTask[], tab: DownloadTabKey): number {
  return tasks.filter((task) => taskMatchesDownloadTab(task, tab)).length
}
