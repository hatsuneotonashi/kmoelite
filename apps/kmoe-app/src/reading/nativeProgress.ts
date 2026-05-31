import type { NativeReadingProgressRecord } from '../platform/nativeCommands'
import { readingProgressId } from '../store/readingStore'
import type { ManualSpreadOverride, PageLayout, ReadingCropState, ReadingDirection, ReadingMode, ReadingProgress } from '../types/reading'

export function nativeReadingProgressToDomain(record: NativeReadingProgressRecord): ReadingProgress | undefined {
  if (!record.comicId || !record.volumeId || !record.comicTitle || !record.volumeTitle) return undefined
  return {
    id: readingProgressId(record.comicId, record.volumeId),
    comicId: record.comicId,
    comicTitle: record.comicTitle,
    volumeId: record.volumeId,
    volumeTitle: record.volumeTitle,
    pageIndex: safeInteger(record.pageIndex, 0),
    pageCount: optionalPositiveInteger(record.pageCount),
    progressPercent: clampPercent(record.progressPercent),
    lastReadAt: record.lastReadAt || record.updatedAt || new Date(0).toISOString(),
    finished: Boolean(record.finished),
    readingMode: normalizeReadingMode(record.readingMode),
    readingDirection: normalizeReadingDirection(record.readingDirection),
    pageLayout: normalizePageLayout(record.pageLayout),
    zoom: optionalPositiveNumber(record.zoom),
    crop: parseCrop(record.cropJson),
    rotation: normalizeRotation(record.rotation),
    spreadOverrides: parseSpreadOverrides(record.spreadOverridesJson)
  }
}

export function nativeReadingProgressListToDomain(records: NativeReadingProgressRecord[]): ReadingProgress[] {
  return records
    .map(nativeReadingProgressToDomain)
    .filter((item): item is ReadingProgress => Boolean(item))
}

function normalizeReadingMode(value: string): ReadingMode {
  if (value === 'vertical_scroll' || value === 'horizontal_scroll' || value === 'webtoon') return value
  return 'paged'
}

function normalizeReadingDirection(value: string): ReadingDirection {
  return value === 'ltr' ? 'ltr' : 'rtl'
}

function normalizePageLayout(value: string): PageLayout {
  if (value === 'double' || value === 'auto_double') return value
  return 'single'
}

function normalizeRotation(value?: number): ReadingProgress['rotation'] {
  return value === 90 || value === 180 || value === 270 ? value : 0
}

function parseCrop(value?: string): ReadingCropState | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) return undefined
    if (parsed.mode === 'auto') return { mode: 'auto', inset: optionalPositiveNumber(parsed.inset) }
    if (parsed.mode === 'manual') return { mode: 'manual', inset: optionalPositiveNumber(parsed.inset) }
    if (parsed.mode === 'none') return { mode: 'none' }
    return undefined
  } catch {
    return undefined
  }
}

function parseSpreadOverrides(value?: string): Record<number, ManualSpreadOverride> | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) return undefined
    const overrides: Record<number, ManualSpreadOverride> = {}
    for (const [key, override] of Object.entries(parsed)) {
      const pageIndex = Number(key)
      if (!Number.isInteger(pageIndex) || pageIndex < 0) continue
      if (override === 'force_single' || override === 'force_double') overrides[pageIndex] = override
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined
  } catch {
    return undefined
  }
}

function optionalPositiveInteger(value?: number): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return undefined
  return Math.floor(value)
}

function optionalPositiveNumber(value?: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Number(value.toFixed(2))
}

function safeInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Number(value.toFixed(2))))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
