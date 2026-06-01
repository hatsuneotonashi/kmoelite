import { clearNativeReadingCache, isNativeUnavailable } from '../platform/nativeCommands'
import { storagePressureCleanupCandidates, useCacheStore } from '../store/cacheStore'
import type { ChapterCacheRecord, PageCacheRecord } from '../types/cache'

export interface ReaderCachePolicySyncInput {
  chapters: ChapterCacheRecord[]
  activeChapter: ChapterCacheRecord
  pages: PageCacheRecord[]
  limit?: number
}

export interface ReaderCachePolicySyncResult {
  removedIds: string[]
  message: string
  nativeAvailable: boolean
  ok: boolean
}

export async function syncReaderCachePolicyAfterOpen({
  chapters,
  activeChapter,
  pages,
  limit = 20
}: ReaderCachePolicySyncInput): Promise<ReaderCachePolicySyncResult> {
  const cache = useCacheStore.getState()
  cache.mergeChapterSnapshot(chapters)
  cache.registerPages(activeChapter.id, pages)
  cache.touchChapter(activeChapter.id)

  const policyCandidates = cache.cleanupCandidates({
    activeChapterId: activeChapter.id,
    limit,
    reason: 'policy'
  })
  const policyIds = new Set(policyCandidates.map((item) => item.chapter.id))
  const remainingChapters = Object.values(useCacheStore.getState().chaptersById)
    .filter((chapter) => !policyIds.has(chapter.id))
  const storageCandidates = storagePressureCleanupCandidates(remainingChapters, cache.policy, {
    activeChapterId: activeChapter.id,
    limit: Math.max(0, limit - policyCandidates.length)
  })
  const chapterIds = [...policyCandidates, ...storageCandidates].map((item) => item.chapter.id)
  if (chapterIds.length === 0) {
    return {
      removedIds: [],
      message: '',
      nativeAvailable: true,
      ok: true
    }
  }

  const result = await clearNativeReadingCache(chapterIds)
  if (result.ok) {
    cache.clearReadingCache(chapterIds)
    return {
      removedIds: chapterIds,
      message: cleanupMessage(policyCandidates.length, storageCandidates.length, false),
      nativeAvailable: true,
      ok: true
    }
  }

  if (isNativeUnavailable(result)) {
    cache.clearReadingCache(chapterIds)
    return {
      removedIds: chapterIds,
      message: cleanupMessage(policyCandidates.length, storageCandidates.length, true),
      nativeAvailable: false,
      ok: true
    }
  }

  return {
    removedIds: [],
    message: `自动清理阅读缓存失败：${result.message}`,
    nativeAvailable: true,
    ok: false
  }
}

function cleanupMessage(policyCount: number, storageCount: number, browserPreview: boolean): string {
  const parts: string[] = []
  if (policyCount > 0) parts.push(`滚动窗口 ${policyCount} 个`)
  if (storageCount > 0) parts.push(`容量 ${storageCount} 个`)
  const summary = parts.length > 0 ? parts.join('、') : '0 个'
  if (browserPreview) return `已清理${summary}浏览器预览缓存；桌面端会同步清理本机缓存。`
  return `已自动清理${summary}阅读缓存。`
}
