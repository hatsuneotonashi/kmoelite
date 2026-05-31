import { describe, expect, it } from 'vitest'
import { resolveContinueReadingTarget } from '../reading/continueTarget'
import type { ChapterCacheRecord } from '../types/cache'
import type { ReadingProgress } from '../types/reading'

describe('resolveContinueReadingTarget', () => {
  it('opens a ready local reader cache for the same comic and volume', () => {
    expect(resolveContinueReadingTarget(progress(), [
      chapter({ id: 'cache-53339-3089', status: 'ready', cacheKind: 'reading_cache' })
    ])).toBe('/reader/cache/cache-53339-3089')
  })

  it('falls back to detail when the local cache is not ready or mismatched', () => {
    expect(resolveContinueReadingTarget(progress(), [
      chapter({ id: 'missing', status: 'missing', cacheKind: 'reading_cache' }),
      chapter({ id: 'downloaded', status: 'ready', cacheKind: 'permanent_download' }),
      chapter({ id: 'other-volume', volumeId: '3090', status: 'ready', cacheKind: 'reading_cache' })
    ])).toBe('/comic/53339')
  })

  it('encodes reader and detail route ids', () => {
    expect(resolveContinueReadingTarget(progress({ comicId: 'id with space', volumeId: 'vol/1' }), [
      chapter({ id: 'cache id/1', comicId: 'id with space', volumeId: 'vol/1', status: 'ready', cacheKind: 'reading_cache' })
    ])).toBe('/reader/cache/cache%20id%2F1')

    expect(resolveContinueReadingTarget(progress({ comicId: 'id with space', volumeId: 'vol/1' }), [])).toBe('/comic/id%20with%20space')
  })
})

function progress(patch: Partial<ReadingProgress> = {}): ReadingProgress {
  return {
    id: '53339:3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    pageIndex: 12,
    pageCount: 180,
    progressPercent: 7,
    lastReadAt: '2026-05-24T10:00:00.000Z',
    finished: false,
    readingMode: 'paged',
    readingDirection: 'rtl',
    pageLayout: 'single',
    ...patch
  }
}

function chapter(patch: Partial<ChapterCacheRecord> = {}): ChapterCacheRecord {
  return {
    id: 'cache-53339-3089',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    cacheKind: 'reading_cache',
    sizeBytes: 2048,
    pageCount: 180,
    status: 'ready',
    lastAccessedAt: '2026-05-24T10:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T10:00:00.000Z',
    ...patch
  }
}
