import {
  isNativeUnavailable,
  prepareNativeReaderChapterCache
} from '../platform/nativeCommands'
import { findReadyReadingCacheForVolume, findUsableReaderArchiveForVolume, isReaderArchiveFormat } from './sourceArchive'
import { useCacheStore } from '../store/cacheStore'
import type { CachePolicy, ChapterCacheRecord } from '../types/cache'
import type { DownloadedFile } from '../types/domain'

interface ReaderNextChapterPrefetchInput {
  currentChapter: ChapterCacheRecord
  chapters: ChapterCacheRecord[]
  library: DownloadedFile[]
  policy?: CachePolicy
  runtime?: ReaderPrefetchRuntimeContext
}

export interface ReaderPrefetchRuntimeContext {
  network?: {
    type?: string
    effectiveType?: string
    saveData?: boolean
  }
  power?: {
    lowPowerMode?: boolean
    batteryLevel?: number
    charging?: boolean
  }
}

export interface ReaderNextChapterPrefetchPlan {
  sourceArchive?: DownloadedFile
  skipReason?:
    | 'policy_disabled'
    | 'already_cached'
    | 'missing_source'
    | 'no_next_chapter'
    | 'data_saver'
    | 'low_power'
    | 'metered_network'
    | 'slow_network'
}

export interface ReaderNextChapterPrefetchResult {
  status: 'prefetched' | 'skipped' | 'failed'
  message: string
  chapter?: ChapterCacheRecord
  skipReason?: ReaderNextChapterPrefetchPlan['skipReason']
}

export function planNextReaderChapterPrefetch({
  currentChapter,
  chapters,
  library,
  policy = useCacheStore.getState().policy,
  runtime = getReaderPrefetchRuntimeContext()
}: ReaderNextChapterPrefetchInput): ReaderNextChapterPrefetchPlan {
  if (!policy.wifiPrefetch || policy.keepNextChapters <= 0) {
    return { skipReason: 'policy_disabled' }
  }

  const runtimeSkipReason = readerPrefetchRuntimeSkipReason(policy, runtime)
  if (runtimeSkipReason) return { skipReason: runtimeSkipReason }

  const nextSourceArchive = findNextSourceArchive(library, currentChapter)
  if (!nextSourceArchive) return { skipReason: 'no_next_chapter' }

  const readyCache = findReadyReadingCacheForVolume(
    chapters,
    currentChapter.comicId,
    nextSourceArchive.volId
  )
  if (readyCache) return { skipReason: 'already_cached' }

  const usable = findUsableReaderArchiveForVolume(
    library,
    currentChapter.comicId,
    nextSourceArchive.volId,
    isReaderArchiveFormat(nextSourceArchive.format) ? [nextSourceArchive.format] : undefined
  )
  if (!usable) return { skipReason: 'missing_source' }

  return { sourceArchive: usable }
}

export async function prefetchNextReaderChapter(input: ReaderNextChapterPrefetchInput): Promise<ReaderNextChapterPrefetchResult> {
  const policy = input.policy ?? useCacheStore.getState().policy
  const runtime = input.runtime ?? getReaderPrefetchRuntimeContext()
  const plan = planNextReaderChapterPrefetch({ ...input, policy, runtime })
  if (!plan.sourceArchive) {
    return {
      status: 'skipped',
      message: '',
      skipReason: plan.skipReason
    }
  }

  const result = await prepareNativeReaderChapterCache({
    archivePath: plan.sourceArchive.localPath,
    comicId: plan.sourceArchive.comicId,
    comicTitle: plan.sourceArchive.comicTitle,
    volumeId: plan.sourceArchive.volId,
    volumeTitle: plan.sourceArchive.volumeTitle,
    sourceTaskId: plan.sourceArchive.taskId,
    format: isReaderArchiveFormat(plan.sourceArchive.format) ? plan.sourceArchive.format : 'source_zip',
    policy: policy.mode
  })

  if (result.ok && result.value) {
    const cache = useCacheStore.getState()
    cache.upsertChapter(result.value.chapter)
    cache.registerPages(result.value.chapter.id, result.value.pages)
    return {
      status: 'prefetched',
      message: `已预取下一章：${result.value.chapter.volumeTitle}`,
      chapter: result.value.chapter
    }
  }

  return {
    status: 'failed',
    message: isNativeUnavailable(result)
      ? '当前运行环境暂不支持自动预取下一章。'
      : `自动预取下一章失败：${result.message}`
  }
}

export function getReaderPrefetchRuntimeContext(): ReaderPrefetchRuntimeContext {
  const connection = readNavigatorConnection()
  return connection ? { network: connection } : {}
}

function readerPrefetchRuntimeSkipReason(
  policy: CachePolicy,
  runtime: ReaderPrefetchRuntimeContext
): ReaderNextChapterPrefetchPlan['skipReason'] | undefined {
  const network = runtime.network
  if (policy.lowPowerReducePrefetch) {
    if (network?.saveData) return 'data_saver'
    if (runtime.power?.lowPowerMode) return 'low_power'
    if (
      typeof runtime.power?.batteryLevel === 'number'
      && runtime.power.batteryLevel <= 0.2
      && runtime.power.charging === false
    ) {
      return 'low_power'
    }
  }

  if (!network) return undefined
  if (isExplicitMeteredConnection(network.type)) return 'metered_network'
  if (isExplicitSlowConnection(network.effectiveType)) return 'slow_network'
  return undefined
}

function readNavigatorConnection(): ReaderPrefetchRuntimeContext['network'] | undefined {
  if (typeof navigator === 'undefined') return undefined
  const source = navigator as Navigator & {
    connection?: unknown
    mozConnection?: unknown
    webkitConnection?: unknown
  }
  const connection = source.connection ?? source.mozConnection ?? source.webkitConnection
  if (!connection || typeof connection !== 'object') return undefined
  const record = connection as Record<string, unknown>
  return {
    type: typeof record.type === 'string' ? record.type : undefined,
    effectiveType: typeof record.effectiveType === 'string' ? record.effectiveType : undefined,
    saveData: typeof record.saveData === 'boolean' ? record.saveData : undefined
  }
}

function isExplicitMeteredConnection(value: string | undefined): boolean {
  const type = value?.toLowerCase()
  return type === 'cellular' || type === 'bluetooth' || type === 'wimax'
}

function isExplicitSlowConnection(value: string | undefined): boolean {
  const effectiveType = value?.toLowerCase()
  return effectiveType === 'slow-2g' || effectiveType === '2g'
}

function findNextSourceArchive(
  library: DownloadedFile[],
  currentChapter: ChapterCacheRecord
): DownloadedFile | undefined {
  const sourceArchives = library
    .filter((file) =>
      file.comicId === currentChapter.comicId
      && file.format === currentChapter.format
      && isReaderArchiveFormat(file.format)
    )
    .sort(compareSourceArchives)
  const currentIndex = sourceArchives.findIndex((file) => file.volId === currentChapter.volumeId)
  if (currentIndex < 0) return undefined
  return sourceArchives[currentIndex + 1]
}

function compareSourceArchives(left: DownloadedFile, right: DownloadedFile): number {
  return left.volumeTitle.localeCompare(right.volumeTitle, undefined, { numeric: true, sensitivity: 'base' })
    || left.volId.localeCompare(right.volId, undefined, { numeric: true, sensitivity: 'base' })
    || left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' })
}
