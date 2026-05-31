import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nowIso } from '../lib/format'
import type { CacheCleanupCandidate, CachePolicy, CachePolicyMode, CacheStats, ChapterCacheRecord, ChapterCacheStatus, PageCacheRecord } from '../types/cache'

interface CacheState {
  policy: CachePolicy
  chaptersById: Record<string, ChapterCacheRecord>
  pagesByChapterId: Record<string, PageCacheRecord[]>
  updatePolicy: (patch: Partial<CachePolicy>) => CachePolicy
  upsertChapter: (chapter: ChapterCacheRecord) => ChapterCacheRecord
  mergeChapterSnapshot: (chapters: ChapterCacheRecord[]) => number
  markChapterStatus: (chapterId: string, status: ChapterCacheStatus, errorMessage?: string) => ChapterCacheRecord | undefined
  registerPages: (chapterId: string, pages: PageCacheRecord[]) => PageCacheRecord[]
  touchChapter: (chapterId: string, accessedAt?: string) => ChapterCacheRecord | undefined
  stats: () => CacheStats
  cleanupCandidates: (options?: { reason?: CacheCleanupCandidate['reason']; limit?: number; activeChapterId?: string }) => CacheCleanupCandidate[]
  clearReadingCache: (chapterIds?: string[]) => string[]
}

export const DEFAULT_CACHE_POLICY: CachePolicy = {
  id: 'default',
  mode: 'balanced',
  keepPreviousChapters: 1,
  keepNextChapters: 1,
  maxRecentChapters: 3,
  wifiPrefetch: true,
  lowPowerReducePrefetch: true,
  updatedAt: '1970-01-01T00:00:00.000Z'
}

export const useCacheStore = create<CacheState>()(
  persist(
    (set, get) => ({
      policy: { ...DEFAULT_CACHE_POLICY, updatedAt: nowIso() },
      chaptersById: {},
      pagesByChapterId: {},
      updatePolicy: (patch) => {
        const base = { ...get().policy, ...patch, updatedAt: nowIso() }
        if (patch.mode && !('keepPreviousChapters' in patch) && !('keepNextChapters' in patch) && !('maxRecentChapters' in patch)) {
          const retention = retentionForMode(patch.mode)
          base.keepPreviousChapters = retention.previous
          base.keepNextChapters = retention.next
          base.maxRecentChapters = retention.recent
        }
        const policy = normalizePolicy(base)
        set({ policy })
        return policy
      },
      upsertChapter: (chapter) => {
        const normalized = normalizeChapter(chapter)
        set((state) => ({ chaptersById: { ...state.chaptersById, [normalized.id]: normalized } }))
        return normalized
      },
      mergeChapterSnapshot: (chapters) => {
        const sanitized = sanitizeChapterList(chapters)
        if (sanitized.length === 0) return 0
        let changed = 0
        set((state) => {
          const next = { ...state.chaptersById }
          for (const chapter of sanitized) {
            const existing = next[chapter.id]
            if (!existing || chapter.updatedAt.localeCompare(existing.updatedAt) > 0) {
              next[chapter.id] = chapter
              changed += 1
            }
          }
          return changed > 0 ? { chaptersById: next } : state
        })
        return changed
      },
      markChapterStatus: (chapterId, status, errorMessage) => {
        const existing = get().chaptersById[chapterId]
        if (!existing) return undefined
        const updated = { ...existing, status, errorMessage, updatedAt: nowIso() }
        set((state) => ({ chaptersById: { ...state.chaptersById, [chapterId]: updated } }))
        return updated
      },
      registerPages: (chapterId, pages) => {
        const normalized = pages
          .filter((page) => page.chapterCacheId === chapterId)
          .sort((left, right) => left.pageIndex - right.pageIndex)
        set((state) => ({ pagesByChapterId: { ...state.pagesByChapterId, [chapterId]: normalized } }))
        return normalized
      },
      touchChapter: (chapterId, accessedAt = nowIso()) => {
        const existing = get().chaptersById[chapterId]
        if (!existing) return undefined
        const updated = { ...existing, lastAccessedAt: accessedAt, updatedAt: accessedAt }
        set((state) => ({ chaptersById: { ...state.chaptersById, [chapterId]: updated } }))
        return updated
      },
      stats: () => cacheStats(Object.values(get().chaptersById), get().pagesByChapterId),
      cleanupCandidates: (options) => {
        const reason = options?.reason ?? 'policy'
        const limit = options?.limit ?? 20
        if (reason === 'storage_pressure') {
          return storagePressureCleanupCandidates(Object.values(get().chaptersById), get().policy, {
            activeChapterId: options?.activeChapterId,
            limit
          })
        }
        return cacheCleanupCandidates(Object.values(get().chaptersById), get().policy, {
          reason,
          limit,
          activeChapterId: options?.activeChapterId,
          respectPolicy: reason !== 'manual'
        })
      },
      clearReadingCache: (chapterIds) => {
        const removable = chapterIds ?? get().cleanupCandidates({ reason: 'manual', limit: Number.MAX_SAFE_INTEGER }).map((item) => item.chapter.id)
        set((state) => {
          const chaptersById = { ...state.chaptersById }
          const pagesByChapterId = { ...state.pagesByChapterId }
          for (const id of removable) {
            const chapter = chaptersById[id]
            if (!chapter || chapter.cacheKind !== 'reading_cache') continue
            delete chaptersById[id]
            delete pagesByChapterId[id]
          }
          return { chaptersById, pagesByChapterId }
        })
        return removable
      }
    }),
    {
      name: 'kmoe-client-cache',
      partialize: (state) => ({
        policy: state.policy,
        chaptersById: sanitizeChapters(state.chaptersById),
        pagesByChapterId: sanitizePages(state.pagesByChapterId)
      }),
      merge: (persisted, current) => {
        const state = readPersistedState(persisted)
        return {
          ...current,
          policy: normalizePolicy(isRecord(state.policy) ? state.policy : current.policy),
          chaptersById: sanitizeChapters(state.chaptersById),
          pagesByChapterId: sanitizePages(state.pagesByChapterId)
        }
      }
    }
  )
)

export function cacheStats(chapters: ChapterCacheRecord[], pagesByChapterId: Record<string, PageCacheRecord[]>): CacheStats {
  const stats = chapters.reduce(
    (acc, chapter) => {
      acc.totalBytes += chapter.sizeBytes
      if (chapter.cacheKind === 'permanent_download') acc.permanentDownloadBytes += chapter.sizeBytes
      if (chapter.cacheKind === 'reading_cache') acc.readingCacheBytes += chapter.sizeBytes
      if (chapter.cacheKind === 'metadata_cache') acc.metadataCacheBytes += chapter.sizeBytes
      return acc
    },
    { totalBytes: 0, permanentDownloadBytes: 0, readingCacheBytes: 0, metadataCacheBytes: 0 }
  )
  return {
    ...stats,
    chapterCount: chapters.length,
    pageCount: Object.values(pagesByChapterId).reduce((total, pages) => total + pages.length, 0)
  }
}

export function cacheCleanupCandidates(
  chapters: ChapterCacheRecord[],
  policy: CachePolicy,
  options: {
    reason?: CacheCleanupCandidate['reason']
    limit?: number
    activeChapterId?: string
    respectPolicy?: boolean
  } = {}
): CacheCleanupCandidate[] {
  const reason = options.reason ?? 'policy'
  const limit = options.limit ?? 20
  const readingChapters = chapters
    .filter((chapter) => chapter.cacheKind === 'reading_cache' && chapter.status === 'ready')
    .sort((left, right) => left.lastAccessedAt.localeCompare(right.lastAccessedAt))
  if (!options.respectPolicy || readingChapters.length === 0) {
    return readingChapters.slice(0, limit).map((chapter) => ({ chapter, reason }))
  }

  const keepIds = policyProtectedChapterIds(readingChapters, policy, options.activeChapterId)

  return readingChapters
    .filter((chapter) => !keepIds.has(chapter.id))
    .slice(0, limit)
    .map((chapter) => ({ chapter, reason }))
}

export function storagePressureCleanupCandidates(
  chapters: ChapterCacheRecord[],
  policy: CachePolicy,
  options: {
    limit?: number
    activeChapterId?: string
  } = {}
): CacheCleanupCandidate[] {
  const maxCacheBytes = typeof policy.maxCacheBytes === 'number' && policy.maxCacheBytes > 0
    ? policy.maxCacheBytes
    : undefined
  if (!maxCacheBytes) return []

  const readingChapters = chapters.filter((chapter) => chapter.cacheKind === 'reading_cache' && chapter.status === 'ready')
  let projectedBytes = readingChapters.reduce((total, chapter) => total + Math.max(0, chapter.sizeBytes), 0)
  if (projectedBytes <= maxCacheBytes) return []

  const keepIds = policyProtectedChapterIds(readingChapters, policy, options.activeChapterId)
  const activeChapterId = resolveActiveChapter(readingChapters, options.activeChapterId)?.id
  const candidates: CacheCleanupCandidate[] = []
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER

  const oldestFirst = [...readingChapters].sort((left, right) => left.lastAccessedAt.localeCompare(right.lastAccessedAt))
  for (const chapter of oldestFirst) {
    if (candidates.length >= limit) break
    if (keepIds.has(chapter.id)) continue
    candidates.push({ chapter, reason: 'storage_pressure' })
    projectedBytes -= Math.max(0, chapter.sizeBytes)
    if (projectedBytes <= maxCacheBytes) break
  }

  if (projectedBytes > maxCacheBytes && candidates.length < limit) {
    const selectedIds = new Set(candidates.map((item) => item.chapter.id))
    for (const chapter of oldestFirst) {
      if (candidates.length >= limit) break
      if (selectedIds.has(chapter.id) || chapter.id === activeChapterId) continue
      candidates.push({ chapter, reason: 'storage_pressure' })
      projectedBytes -= Math.max(0, chapter.sizeBytes)
      if (projectedBytes <= maxCacheBytes) break
    }
  }

  return candidates
}

function policyProtectedChapterIds(
  readingChapters: ChapterCacheRecord[],
  policy: CachePolicy,
  activeChapterId?: string
): Set<string> {
  const explicitActive = Boolean(activeChapterId)
  const activeChapter = resolveActiveChapter(readingChapters, activeChapterId)
  const keepIds = new Set<string>()
  if (activeChapter) {
    keepIds.add(activeChapter.id)
    for (const chapter of siblingRetentionWindow(
      readingChapters,
      activeChapter,
      policy.keepPreviousChapters,
      policy.keepNextChapters
    )) {
      keepIds.add(chapter.id)
    }
  }

  if (!explicitActive || policy.mode === 'comfort') {
    for (const chapter of [...readingChapters]
      .sort((left, right) => right.lastAccessedAt.localeCompare(left.lastAccessedAt))
      .slice(0, Math.max(0, policy.maxRecentChapters))) {
      keepIds.add(chapter.id)
    }
  }
  return keepIds
}

function normalizePolicy(value: unknown): CachePolicy {
  const record = isRecord(value) ? value : {}
  const mode = isPolicyMode(record.mode) ? record.mode : DEFAULT_CACHE_POLICY.mode
  return {
    id: typeof record.id === 'string' ? record.id : DEFAULT_CACHE_POLICY.id,
    mode,
    keepPreviousChapters: safeNumber(record.keepPreviousChapters, retentionForMode(mode).previous),
    keepNextChapters: safeNumber(record.keepNextChapters, retentionForMode(mode).next),
    maxRecentChapters: safeNumber(record.maxRecentChapters, retentionForMode(mode).recent),
    wifiPrefetch: typeof record.wifiPrefetch === 'boolean' ? record.wifiPrefetch : DEFAULT_CACHE_POLICY.wifiPrefetch,
    lowPowerReducePrefetch: typeof record.lowPowerReducePrefetch === 'boolean' ? record.lowPowerReducePrefetch : DEFAULT_CACHE_POLICY.lowPowerReducePrefetch,
    maxCacheBytes: typeof record.maxCacheBytes === 'number' && record.maxCacheBytes > 0 ? record.maxCacheBytes : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : nowIso()
  }
}

function normalizeChapter(chapter: ChapterCacheRecord): ChapterCacheRecord {
  return {
    ...chapter,
    sizeBytes: Math.max(0, chapter.sizeBytes),
    pageCount: chapter.pageCount && chapter.pageCount > 0 ? chapter.pageCount : undefined,
    status: chapter.status,
    updatedAt: chapter.updatedAt || nowIso(),
    lastAccessedAt: chapter.lastAccessedAt || nowIso()
  }
}

function resolveActiveChapter(chapters: ChapterCacheRecord[], activeChapterId?: string): ChapterCacheRecord | undefined {
  if (activeChapterId) {
    const active = chapters.find((chapter) => chapter.id === activeChapterId)
    if (active) return active
  }
  return [...chapters].sort((left, right) => right.lastAccessedAt.localeCompare(left.lastAccessedAt))[0]
}

function siblingRetentionWindow(
  chapters: ChapterCacheRecord[],
  activeChapter: ChapterCacheRecord,
  keepPrevious: number,
  keepNext: number
): ChapterCacheRecord[] {
  const siblings = chapters
    .filter((chapter) => chapter.comicId === activeChapter.comicId)
    .sort(compareChapterOrder)
  const activeIndex = siblings.findIndex((chapter) => chapter.id === activeChapter.id)
  if (activeIndex < 0) return []
  const start = Math.max(0, activeIndex - Math.max(0, keepPrevious))
  const end = Math.min(siblings.length - 1, activeIndex + Math.max(0, keepNext))
  return siblings.slice(start, end + 1)
}

function compareChapterOrder(left: ChapterCacheRecord, right: ChapterCacheRecord): number {
  return left.volumeTitle.localeCompare(right.volumeTitle, undefined, { numeric: true, sensitivity: 'base' })
    || left.volumeId.localeCompare(right.volumeId, undefined, { numeric: true, sensitivity: 'base' })
    || left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' })
}

function retentionForMode(mode: CachePolicyMode): { previous: number; next: number; recent: number } {
  if (mode === 'space_saver') return { previous: 0, next: 0, recent: 1 }
  if (mode === 'comfort') return { previous: 2, next: 2, recent: 5 }
  return { previous: 1, next: 1, recent: 3 }
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function isPolicyMode(value: unknown): value is CachePolicyMode {
  return value === 'space_saver' || value === 'balanced' || value === 'comfort'
}

function sanitizeChapters(value: unknown): Record<string, ChapterCacheRecord> {
  if (!isRecord(value)) return {}
  const chaptersById: Record<string, ChapterCacheRecord> = {}
  for (const [id, chapter] of Object.entries(value)) {
    if (isChapter(chapter)) chaptersById[id] = normalizeChapter(chapter)
  }
  return chaptersById
}

function sanitizeChapterList(value: unknown): ChapterCacheRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(isChapter).map(normalizeChapter)
}

function sanitizePages(value: unknown): Record<string, PageCacheRecord[]> {
  if (!isRecord(value)) return {}
  const pagesByChapterId: Record<string, PageCacheRecord[]> = {}
  for (const [chapterId, pages] of Object.entries(value)) {
    if (Array.isArray(pages)) {
      pagesByChapterId[chapterId] = pages.filter(isPage).sort((left, right) => left.pageIndex - right.pageIndex)
    }
  }
  return pagesByChapterId
}

function readPersistedState(value: unknown): { policy?: unknown; chaptersById?: unknown; pagesByChapterId?: unknown } {
  if (!isRecord(value)) return {}
  return isRecord(value.state) ? value.state : value
}

function isChapter(value: unknown): value is ChapterCacheRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.comicId === 'string'
    && typeof value.volumeId === 'string'
    && typeof value.cacheKind === 'string'
    && typeof value.status === 'string'
    && typeof value.sizeBytes === 'number'
}

function isPage(value: unknown): value is PageCacheRecord {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.chapterCacheId === 'string'
    && typeof value.comicId === 'string'
    && typeof value.volumeId === 'string'
    && typeof value.pageIndex === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
