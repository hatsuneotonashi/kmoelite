import type { DownloadedFile, DownloadFormat, DownloadTask, DownloadTaskStatus } from '../types/domain'
import { extensionForFormat } from './pathPlanner'

const PRODUCT_DOWNLOAD_FORMATS = new Set<string>(['mobi', 'epub', 'source_zip'])
const PRODUCT_TASK_STATUSES = new Set<string>([
  'queued',
  'authorizing',
  'downloading',
  'paused',
  'verifying',
  'completed',
  'failed',
  'cancelled'
])

export function sanitizeDownloadTasks(tasks: DownloadTask[]): DownloadTask[] {
  return tasks.filter(isProductDownloadTask)
}

export function sanitizeDownloadedFiles(files: DownloadedFile[]): DownloadedFile[] {
  return files.filter(isProductDownloadedFile)
}

export function isProductDownloadTask(task: DownloadTask): boolean {
  if (!isDownloadTaskStatus(task.status as string)) return false
  if (!isDownloadFormat(task.format as string)) return false
  return task.localPath ? hasExpectedFileExtension(task.localPath, task.format) : true
}

export function isProductDownloadedFile(file: DownloadedFile): boolean {
  if (!isDownloadFormat(file.format as string)) return false
  return hasExpectedFileExtension(file.localPath, file.format)
}

export function isDownloadTaskStatus(status: string): status is DownloadTaskStatus {
  return PRODUCT_TASK_STATUSES.has(status)
}

function isDownloadFormat(format: string): format is DownloadFormat {
  return PRODUCT_DOWNLOAD_FORMATS.has(format)
}

function hasExpectedFileExtension(path: string, format: DownloadFormat): boolean {
  const filename = path.trim().replace(/\\/g, '/').split('/').filter(Boolean).pop()
  if (!filename) return false
  return filename.toLowerCase().endsWith(`.${extensionForFormat(format)}`)
}
