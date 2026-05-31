import type { ChapterCacheRecord } from '../types/cache'
import type { DownloadedFile, DownloadTask, VolumeDownloadOption } from '../types/domain'
import { canQueueDownloadOption, getBlockingDownloadRestrictions } from '../download/optionGuards'
import {
  findReaderArchiveForVolume,
  findReadyReadingCacheForVolume,
  findUsableReaderArchiveForVolume,
  isMetadataOnlyDownloadedFile,
  readerArchiveFormatLabel,
  type ReaderArchiveFormat
} from './sourceArchive'

export type ReaderEntryKind =
  | 'continue_reading'
  | 'prepare_from_local_source'
  | 'bind_local_source'
  | 'source_downloading'
  | 'source_failed'
  | 'source_completed_missing_library'
  | 'queue_source_zip'
  | 'not_supported_format'
  | 'blocked_by_policy'
  | 'unavailable'

export interface ReaderEntryState {
  kind: ReaderEntryKind
  enabled: boolean
  label: string
  helper: string
  cache?: ChapterCacheRecord
  sourceFile?: DownloadedFile
  sourceTask?: DownloadTask
  readerFormat?: ReaderArchiveFormat
  blockingReasons: string[]
}

export function resolveReaderEntryState(input: {
  option: VolumeDownloadOption
  chapters: ChapterCacheRecord[]
  library: DownloadedFile[]
  tasks: DownloadTask[]
}): ReaderEntryState {
  const { option, chapters, library, tasks } = input
  const readyCache = findReadyReadingCacheForVolume(chapters, option.comicId, option.volId)
  if (readyCache) {
    return {
      kind: 'continue_reading',
      enabled: true,
      label: '继续阅读',
      helper: '已准备阅读缓存，可直接打开。',
      cache: readyCache,
      blockingReasons: []
    }
  }

  const usableSource = findUsableReaderArchiveForVolume(library, option.comicId, option.volId)
  if (usableSource) {
    const readerFormat = usableSource.format as ReaderArchiveFormat
    return {
      kind: 'prepare_from_local_source',
      enabled: true,
      label: '准备阅读',
      helper: `已找到本机${readerArchiveFormatLabel(readerFormat)}，可生成阅读缓存。`,
      sourceFile: usableSource,
      readerFormat,
      blockingReasons: []
    }
  }

  const sourceArchive = findReaderArchiveForVolume(library, option.comicId, option.volId)
  if (sourceArchive && isMetadataOnlyDownloadedFile(sourceArchive)) {
    const readerFormat = sourceArchive.format as ReaderArchiveFormat
    return {
      kind: 'bind_local_source',
      enabled: true,
      label: `绑定${readerArchiveFormatLabel(readerFormat)}`,
      helper: `资料库只有记录，还需要绑定本机${readerArchiveFormatLabel(readerFormat)}文件。`,
      sourceFile: sourceArchive,
      readerFormat,
      blockingReasons: []
    }
  }

  const readerFormat = selectReaderArchiveFormat(option)
  const sourceTask = findLatestReaderArchiveTask(tasks, option.comicId, option.volId, readerFormat ? [readerFormat] : ['source_zip', 'epub'])
  if (sourceTask && ['queued', 'authorizing', 'downloading', 'paused', 'verifying'].includes(sourceTask.status)) {
    const taskFormat = sourceTask.format as ReaderArchiveFormat
    return {
      kind: 'source_downloading',
      enabled: true,
      label: sourceTask.status === 'queued' ? '已排队' : sourceTask.status === 'paused' ? '已暂停' : '下载中',
      helper: sourceTask.status === 'paused'
        ? `${readerArchiveFormatLabel(taskFormat)}任务已暂停，请到下载中心继续。`
        : `${readerArchiveFormatLabel(taskFormat)}任务正在下载队列中，完成后可打开阅读器。`,
      sourceTask,
      readerFormat: taskFormat,
      blockingReasons: []
    }
  }

  if (sourceTask?.status === 'failed' || sourceTask?.status === 'cancelled') {
    const taskFormat = sourceTask.format as ReaderArchiveFormat
    return {
      kind: 'source_failed',
      enabled: true,
      label: sourceTask.status === 'failed' ? '下载失败' : '已取消',
      helper: sourceTask.errorMessage || `${readerArchiveFormatLabel(taskFormat)}任务未完成，请到下载中心重试或重新排队。`,
      sourceTask,
      readerFormat: taskFormat,
      blockingReasons: sourceTask.errorMessage ? [sourceTask.errorMessage] : []
    }
  }

  if (sourceTask?.status === 'completed') {
    const taskFormat = sourceTask.format as ReaderArchiveFormat
    return {
      kind: 'source_completed_missing_library',
      enabled: true,
      label: '同步资料库',
      helper: `${readerArchiveFormatLabel(taskFormat)}任务显示已完成，但资料库还没有可用文件记录，请同步资料库。`,
      sourceTask,
      readerFormat: taskFormat,
      blockingReasons: []
    }
  }

  if (readerFormat && canQueueDownloadOption(option, readerFormat)) {
    return {
      kind: 'queue_source_zip',
      enabled: true,
      label: readerFormat === 'source_zip' ? '获取源图' : '获取 EPUB',
      helper: readerFormat === 'source_zip'
        ? '获取源图 ZIP/CBZ 后可准备内置阅读缓存。'
        : '获取 EPUB 后可准备内置阅读缓存。',
      readerFormat,
      blockingReasons: []
    }
  }

  const blockingReasons = getBlockingDownloadRestrictions(option)
  if ((option.availableFormats.includes('source_zip') || option.availableFormats.includes('epub')) && blockingReasons.length > 0) {
    return {
      kind: 'blocked_by_policy',
      enabled: false,
      label: '受限',
      helper: `可阅读格式暂时受限：${blockingReasons[0]}`,
      blockingReasons
    }
  }

  if (!option.availableFormats.includes('source_zip') && !option.availableFormats.includes('epub') && hasDocumentFormat(option)) {
    return {
      kind: 'not_supported_format',
      enabled: false,
      label: '缺少源图',
      helper: '内置阅读器需要源图 ZIP/CBZ 或 EPUB；MOBI 可作为文件下载。',
      blockingReasons: []
    }
  }

  return {
    kind: 'unavailable',
    enabled: false,
    label: '无源图',
    helper: '网站未提供可用于内置阅读器的源图文件。',
    blockingReasons
  }
}

export function resolveLibraryReaderEntryState(input: {
  file: DownloadedFile
  chapters: ChapterCacheRecord[]
}): ReaderEntryState {
  const { file, chapters } = input
  const readyCache = findReadyReadingCacheForVolume(chapters, file.comicId, file.volId)
  if (readyCache) {
    return {
      kind: 'continue_reading',
      enabled: true,
      label: '继续阅读',
      helper: '已准备阅读缓存，可直接打开。',
      cache: readyCache,
      blockingReasons: []
    }
  }
  if (file.format !== 'source_zip') {
    if (file.format === 'epub') {
      if (isMetadataOnlyDownloadedFile(file)) {
        return {
          kind: 'bind_local_source',
          enabled: false,
          label: '需绑定 EPUB',
          helper: '资料库只有记录，需要先绑定本机 EPUB 文件。',
          sourceFile: file,
          readerFormat: 'epub',
          blockingReasons: []
        }
      }
      return {
        kind: 'prepare_from_local_source',
        enabled: true,
        label: '准备阅读',
        helper: '已找到本机 EPUB，可生成阅读缓存。',
        sourceFile: file,
        readerFormat: 'epub',
        blockingReasons: []
      }
    }
    return {
      kind: 'not_supported_format',
      enabled: false,
      label: '不能内置阅读',
      helper: 'MOBI 可作为文件打开；内置阅读器需要 EPUB 或源图 ZIP/CBZ。',
      sourceFile: file,
      blockingReasons: []
    }
  }
  if (isMetadataOnlyDownloadedFile(file)) {
    return {
      kind: 'bind_local_source',
      enabled: false,
      label: '需绑定源图',
      helper: '资料库只有记录，需要先绑定本机源图 ZIP/CBZ 文件。',
      sourceFile: file,
      readerFormat: 'source_zip',
      blockingReasons: []
    }
  }
  return {
    kind: 'prepare_from_local_source',
    enabled: true,
    label: '准备阅读',
    helper: '已找到本机源图文件，可生成阅读缓存。',
    sourceFile: file,
    readerFormat: 'source_zip',
    blockingReasons: []
  }
}

export function readerEntryNeedsDownloadCenter(state: ReaderEntryState): boolean {
  return ['source_downloading', 'source_failed', 'source_completed_missing_library'].includes(state.kind)
}

function findLatestReaderArchiveTask(
  tasks: DownloadTask[],
  comicId: string,
  volId: string,
  formats: ReaderArchiveFormat[]
): DownloadTask | undefined {
  const formatOrder = new Map(formats.map((format, index) => [format, index]))
  return tasks
    .filter((task) =>
      task.comicId === comicId
      && task.volId === volId
      && formatOrder.has(task.format as ReaderArchiveFormat)
    )
    .sort((left, right) =>
      (formatOrder.get(left.format as ReaderArchiveFormat) ?? 99) - (formatOrder.get(right.format as ReaderArchiveFormat) ?? 99)
      || right.updatedAt.localeCompare(left.updatedAt)
      || right.createdAt.localeCompare(left.createdAt)
    )[0]
}

function selectReaderArchiveFormat(option: VolumeDownloadOption): ReaderArchiveFormat | undefined {
  if (canQueueDownloadOption(option, 'source_zip')) return 'source_zip'
  if (canQueueDownloadOption(option, 'epub')) return 'epub'
  if (option.availableFormats.includes('source_zip')) return 'source_zip'
  if (option.availableFormats.includes('epub')) return 'epub'
  return undefined
}

function hasDocumentFormat(option: VolumeDownloadOption): boolean {
  return option.availableFormats.includes('mobi') || option.availableFormats.includes('epub')
}
