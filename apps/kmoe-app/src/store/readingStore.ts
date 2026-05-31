import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nowIso } from '../lib/format'
import type { ContinueReadingItem, ManualSpreadOverride, ReaderPreferences, ReadingHistoryEntry, ReadingHistoryEvent, ReadingProgress, ReadingProgressInput } from '../types/reading'

interface ReadingState {
  progressById: Record<string, ReadingProgress>
  history: ReadingHistoryEntry[]
  upsertProgress: (input: ReadingProgressInput, event?: ReadingHistoryEvent) => ReadingProgress
  mergeProgressSnapshot: (items: ReadingProgress[]) => number
  getProgress: (comicId: string, volumeId: string) => ReadingProgress | undefined
  getComicReaderPreferences: (comicId: string) => ReaderPreferences | undefined
  markRead: (comicId: string, volumeId: string) => ReadingProgress | undefined
  markUnread: (comicId: string, volumeId: string) => ReadingProgress | undefined
  restartVolume: (comicId: string, volumeId: string) => ReadingProgress | undefined
  continueReading: (limit?: number) => ContinueReadingItem[]
  clearComicHistory: (comicId: string) => void
}

export const useReadingStore = create<ReadingState>()(
  persist(
    (set, get) => ({
      progressById: {},
      history: [],
      upsertProgress: (input, event = 'page_change') => {
        const id = readingProgressId(input.comicId, input.volumeId)
        const existing = get().progressById[id]
        const inheritedPreferences = existing
          ? undefined
          : latestComicReaderPreferences(get().progressById, input.comicId, id)
        const readAt = input.readAt ?? nowIso()
        const pageIndex = clampPageIndex(input.pageIndex ?? existing?.pageIndex ?? 0, input.pageCount ?? existing?.pageCount)
        const pageCount = input.pageCount ?? existing?.pageCount
        const progressPercent = normalizeProgressPercent(input.progressPercent ?? progressFromPage(pageIndex, pageCount))
        const progress: ReadingProgress = {
          id,
          comicId: input.comicId,
          comicTitle: input.comicTitle,
          volumeId: input.volumeId,
          volumeTitle: input.volumeTitle,
          pageIndex,
          pageCount,
          progressPercent,
          lastReadAt: readAt,
          finished: input.finished ?? progressPercent >= 99.5,
          readingMode: input.readingMode ?? existing?.readingMode ?? inheritedPreferences?.readingMode ?? 'paged',
          readingDirection: input.readingDirection ?? existing?.readingDirection ?? inheritedPreferences?.readingDirection ?? 'rtl',
          pageLayout: input.pageLayout ?? existing?.pageLayout ?? inheritedPreferences?.pageLayout ?? 'single',
          zoom: input.zoom ?? existing?.zoom ?? inheritedPreferences?.zoom,
          crop: input.crop ?? existing?.crop ?? inheritedPreferences?.crop,
          rotation: input.rotation ?? existing?.rotation ?? inheritedPreferences?.rotation,
          spreadOverrides: sanitizeSpreadOverrides(input.spreadOverrides ?? existing?.spreadOverrides)
        }
        const historyEntry = toHistoryEntry(progress, event, readAt)
        set((state) => ({
          progressById: { ...state.progressById, [id]: progress },
          history: [historyEntry, ...state.history].slice(0, 1000)
        }))
        return progress
      },
      mergeProgressSnapshot: (items) => {
        const sanitized = sanitizeProgressList(items)
        if (sanitized.length === 0) return 0
        let changed = 0
        set((state) => {
          const next = { ...state.progressById }
          for (const progress of sanitized) {
            const existing = next[progress.id]
            if (!existing || progress.lastReadAt.localeCompare(existing.lastReadAt) > 0) {
              next[progress.id] = progress
              changed += 1
            }
          }
          return changed > 0 ? { progressById: next } : state
        })
        return changed
      },
      getProgress: (comicId, volumeId) => get().progressById[readingProgressId(comicId, volumeId)],
      getComicReaderPreferences: (comicId) => latestComicReaderPreferences(get().progressById, comicId),
      markRead: (comicId, volumeId) => {
        const existing = get().progressById[readingProgressId(comicId, volumeId)]
        if (!existing) return undefined
        return get().upsertProgress({
          ...existing,
          pageIndex: Math.max(0, (existing.pageCount ?? 1) - 1),
          progressPercent: 100,
          finished: true,
          readAt: nowIso()
        }, 'mark_read')
      },
      markUnread: (comicId, volumeId) => {
        const existing = get().progressById[readingProgressId(comicId, volumeId)]
        if (!existing) return undefined
        return get().upsertProgress({
          ...existing,
          finished: false,
          progressPercent: Math.min(existing.progressPercent, 99),
          readAt: nowIso()
        }, 'mark_unread')
      },
      restartVolume: (comicId, volumeId) => {
        const existing = get().progressById[readingProgressId(comicId, volumeId)]
        if (!existing) return undefined
        return get().upsertProgress({
          ...existing,
          pageIndex: 0,
          progressPercent: 0,
          finished: false,
          zoom: 1,
          readAt: nowIso()
        }, 'restart')
      },
      continueReading: (limit = 6) =>
        Object.values(get().progressById)
          .filter((item) => !item.finished)
          .sort((left, right) => right.lastReadAt.localeCompare(left.lastReadAt))
          .slice(0, limit)
          .map((progress) => ({ progress, label: continueReadingLabel(progress) })),
      clearComicHistory: (comicId) =>
        set((state) => ({
          history: state.history.filter((entry) => entry.comicId !== comicId)
        }))
    }),
    {
      name: 'kmoe-client-reading',
      partialize: (state) => ({
        progressById: sanitizeProgressMap(state.progressById),
        history: sanitizeHistory(state.history)
      }),
      merge: (persisted, current) => {
        const state = readPersistedState(persisted)
        return {
          ...current,
          progressById: sanitizeProgressMap(state.progressById),
          history: sanitizeHistory(state.history)
        }
      }
    }
  )
)

export function readingProgressId(comicId: string, volumeId: string): string {
  return `${comicId}:${volumeId}`
}

export function continueReadingLabel(progress: ReadingProgress): string {
  const page = progress.pageIndex + 1
  const pageTotal = progress.pageCount ? ` / ${progress.pageCount}` : ''
  return `继续读 ${progress.volumeTitle} · 第 ${page}${pageTotal} 页`
}

function latestComicReaderPreferences(
  progressById: Record<string, ReadingProgress>,
  comicId: string,
  excludeId?: string
): ReaderPreferences | undefined {
  const latest = Object.values(progressById)
    .filter((progress) => progress.comicId === comicId && progress.id !== excludeId)
    .sort((left, right) => right.lastReadAt.localeCompare(left.lastReadAt))[0]
  if (!latest) return undefined
  return {
    readingMode: latest.readingMode,
    readingDirection: latest.readingDirection,
    pageLayout: latest.pageLayout,
    zoom: latest.zoom,
    crop: latest.crop ? { ...latest.crop } : undefined,
    rotation: latest.rotation
  }
}

function toHistoryEntry(progress: ReadingProgress, event: ReadingHistoryEvent, readAt: string): ReadingHistoryEntry {
  return {
    id: `${progress.id}:${event}:${readAt}`,
    comicId: progress.comicId,
    comicTitle: progress.comicTitle,
    volumeId: progress.volumeId,
    volumeTitle: progress.volumeTitle,
    pageIndex: progress.pageIndex,
    progressPercent: progress.progressPercent,
    event,
    readAt
  }
}

function progressFromPage(pageIndex: number, pageCount?: number): number {
  if (!pageCount || pageCount <= 0) return 0
  return ((pageIndex + 1) / pageCount) * 100
}

function clampPageIndex(pageIndex: number, pageCount?: number): number {
  const safe = Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0
  if (!pageCount || pageCount <= 0) return safe
  return Math.min(safe, Math.max(0, pageCount - 1))
}

function normalizeProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Number(value.toFixed(2))))
}

function sanitizeProgressMap(value: unknown): Record<string, ReadingProgress> {
  if (!isRecord(value)) return {}
  const progressById: Record<string, ReadingProgress> = {}
  for (const [id, progress] of Object.entries(value)) {
    if (isProgress(progress)) progressById[id] = progress
  }
  return progressById
}

function sanitizeProgressList(value: unknown): ReadingProgress[] {
  if (!Array.isArray(value)) return []
  return value.filter(isProgress)
}

function sanitizeHistory(value: unknown): ReadingHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(isHistoryEntry).slice(0, 1000)
}

function readPersistedState(value: unknown): { progressById?: unknown; history?: unknown } {
  if (!isRecord(value)) return {}
  return isRecord(value.state) ? value.state : value
}

function isProgress(value: unknown): value is ReadingProgress {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.comicId === 'string'
    && typeof value.volumeId === 'string'
    && typeof value.comicTitle === 'string'
    && typeof value.volumeTitle === 'string'
    && typeof value.pageIndex === 'number'
    && typeof value.progressPercent === 'number'
    && typeof value.lastReadAt === 'string'
}

function isHistoryEntry(value: unknown): value is ReadingHistoryEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.comicId === 'string'
    && typeof value.volumeId === 'string'
    && typeof value.event === 'string'
    && typeof value.readAt === 'string'
}

function sanitizeSpreadOverrides(value: unknown): Record<number, ManualSpreadOverride> | undefined {
  if (!isRecord(value)) return undefined
  const overrides: Record<number, ManualSpreadOverride> = {}
  for (const [key, override] of Object.entries(value)) {
    const pageIndex = Number(key)
    if (!Number.isInteger(pageIndex) || pageIndex < 0) continue
    if (override === 'force_single' || override === 'force_double') overrides[pageIndex] = override
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
