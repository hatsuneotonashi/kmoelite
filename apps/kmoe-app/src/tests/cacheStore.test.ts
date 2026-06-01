import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CACHE_POLICY, cacheCleanupCandidates, cacheStats, storagePressureCleanupCandidates, useCacheStore } from '../store/cacheStore'
import type { CachePolicy, ChapterCacheRecord, PageCacheRecord } from '../types/cache'

describe('cacheStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useCacheStore.setState({
      policy: {
        ...useCacheStore.getState().policy,
        mode: 'balanced',
        keepPreviousChapters: 1,
        keepNextChapters: 1,
        maxRecentChapters: 3,
        maxCacheBytes: undefined
      },
      chaptersById: {},
      pagesByChapterId: {}
    })
  })

  it('updates cache policy presets for space saver and comfort modes', () => {
    expect(DEFAULT_CACHE_POLICY).toMatchObject({
      mode: 'balanced',
      keepPreviousChapters: 1,
      keepNextChapters: 1,
      wifiPrefetch: true
    })

    const spaceSaver = useCacheStore.getState().updatePolicy({ mode: 'space_saver' })
    expect(spaceSaver).toMatchObject({
      mode: 'space_saver',
      keepPreviousChapters: 0,
      keepNextChapters: 0,
      maxRecentChapters: 1
    })

    const comfort = useCacheStore.getState().updatePolicy({ mode: 'comfort' })
    expect(comfort).toMatchObject({
      mode: 'comfort',
      keepPreviousChapters: 2,
      keepNextChapters: 2,
      maxRecentChapters: 5
    })
  })

  it('tracks chapter cache, page cache, and storage statistics separately', () => {
    useCacheStore.getState().upsertChapter(sampleChapter('reading-old', 'reading_cache', 2048, '2026-05-24T08:00:00.000Z'))
    useCacheStore.getState().upsertChapter(sampleChapter('downloaded', 'permanent_download', 4096, '2026-05-24T09:00:00.000Z'))
    useCacheStore.getState().upsertChapter(sampleChapter('metadata', 'metadata_cache', 512, '2026-05-24T10:00:00.000Z'))
    useCacheStore.getState().registerPages('reading-old', [samplePage('reading-old', 1), samplePage('reading-old', 0)])

    expect(useCacheStore.getState().pagesByChapterId['reading-old'].map((page) => page.pageIndex)).toEqual([0, 1])
    expect(useCacheStore.getState().stats()).toEqual({
      totalBytes: 6656,
      permanentDownloadBytes: 4096,
      readingCacheBytes: 2048,
      metadataCacheBytes: 512,
      chapterCount: 3,
      pageCount: 2
    })
  })

  it('selects manual cleanup candidates by oldest reading cache access and preserves downloads', () => {
    useCacheStore.getState().upsertChapter(sampleChapter('reading-old', 'reading_cache', 2048, '2026-05-24T08:00:00.000Z'))
    useCacheStore.getState().upsertChapter(sampleChapter('reading-new', 'reading_cache', 2048, '2026-05-24T10:00:00.000Z'))
    useCacheStore.getState().upsertChapter(sampleChapter('downloaded', 'permanent_download', 4096, '2026-05-24T07:00:00.000Z'))

    const candidates = useCacheStore.getState().cleanupCandidates({ reason: 'manual', limit: 1 })
    expect(candidates.map((item) => item.chapter.id)).toEqual(['reading-old'])

    useCacheStore.getState().clearReadingCache(candidates.map((item) => item.chapter.id))
    expect(Object.keys(useCacheStore.getState().chaptersById).sort()).toEqual(['downloaded', 'reading-new'])
  })

  it('uses the default rolling window to keep previous, current, and next chapters', () => {
    const chapters = [
      sampleChapter('cache-001', 'reading_cache', 100, '2026-05-24T08:00:00.000Z', { volumeId: '001', volumeTitle: '話 001' }),
      sampleChapter('cache-002', 'reading_cache', 100, '2026-05-24T08:10:00.000Z', { volumeId: '002', volumeTitle: '話 002' }),
      sampleChapter('cache-003', 'reading_cache', 100, '2026-05-24T08:20:00.000Z', { volumeId: '003', volumeTitle: '話 003' }),
      sampleChapter('cache-004', 'reading_cache', 100, '2026-05-24T08:30:00.000Z', { volumeId: '004', volumeTitle: '話 004' }),
      sampleChapter('cache-005', 'reading_cache', 100, '2026-05-24T08:40:00.000Z', { volumeId: '005', volumeTitle: '話 005' }),
      sampleChapter('downloaded-001', 'permanent_download', 100, '2026-05-24T07:00:00.000Z', { volumeId: '001', volumeTitle: '話 001' })
    ]

    const candidates = cacheCleanupCandidates(chapters, {
      ...useCacheStore.getState().policy,
      mode: 'balanced',
      keepPreviousChapters: 1,
      keepNextChapters: 1,
      maxRecentChapters: 3
    }, {
      activeChapterId: 'cache-003',
      reason: 'policy',
      respectPolicy: true
    })

    expect(candidates.map((item) => item.chapter.id)).toEqual(['cache-001', 'cache-005'])
  })

  it('keeps only the active chapter in space saver policy cleanup', () => {
    const chapters = [
      sampleChapter('cache-001', 'reading_cache', 100, '2026-05-24T08:00:00.000Z', { volumeId: '001', volumeTitle: '話 001' }),
      sampleChapter('cache-002', 'reading_cache', 100, '2026-05-24T08:10:00.000Z', { volumeId: '002', volumeTitle: '話 002' }),
      sampleChapter('cache-003', 'reading_cache', 100, '2026-05-24T08:20:00.000Z', { volumeId: '003', volumeTitle: '話 003' })
    ]

    const candidates = cacheCleanupCandidates(chapters, {
      ...useCacheStore.getState().policy,
      mode: 'space_saver',
      keepPreviousChapters: 0,
      keepNextChapters: 0,
      maxRecentChapters: 1
    }, {
      activeChapterId: 'cache-002',
      reason: 'policy',
      respectPolicy: true
    })

    expect(candidates.map((item) => item.chapter.id)).toEqual(['cache-001', 'cache-003'])
  })

  it('cleans oldest ready reading caches under storage pressure and preserves downloads', () => {
    const policy = {
      ...useCacheStore.getState().policy,
      mode: 'space_saver' as const,
      keepPreviousChapters: 0,
      keepNextChapters: 0,
      maxRecentChapters: 1,
      maxCacheBytes: 250
    }
    const chapters = [
      sampleChapter('cache-001', 'reading_cache', 100, '2026-05-24T08:00:00.000Z', { volumeId: '001', volumeTitle: '話 001' }),
      sampleChapter('cache-002', 'reading_cache', 100, '2026-05-24T08:10:00.000Z', { volumeId: '002', volumeTitle: '話 002' }),
      sampleChapter('cache-003', 'reading_cache', 100, '2026-05-24T08:20:00.000Z', { volumeId: '003', volumeTitle: '話 003' }),
      sampleChapter('downloaded-001', 'permanent_download', 900, '2026-05-24T07:00:00.000Z', { volumeId: '001', volumeTitle: '話 001' })
    ]

    const candidates = useStoragePressure(chapters, policy, 'cache-003')

    expect(candidates.map((item) => item.chapter.id)).toEqual(['cache-001'])
    expect(candidates.every((item) => item.reason === 'storage_pressure')).toBe(true)
  })

  it('preserves the active chapter and trims the policy window only under hard storage pressure', () => {
    const policy = {
      ...useCacheStore.getState().policy,
      mode: 'balanced' as const,
      keepPreviousChapters: 1,
      keepNextChapters: 1,
      maxRecentChapters: 3,
      maxCacheBytes: 150
    }
    const chapters = [
      sampleChapter('cache-001', 'reading_cache', 100, '2026-05-24T08:00:00.000Z', { volumeId: '001', volumeTitle: '話 001' }),
      sampleChapter('cache-002', 'reading_cache', 100, '2026-05-24T08:10:00.000Z', { volumeId: '002', volumeTitle: '話 002' }),
      sampleChapter('cache-003', 'reading_cache', 100, '2026-05-24T08:20:00.000Z', { volumeId: '003', volumeTitle: '話 003' }),
      sampleChapter('cache-004', 'reading_cache', 100, '2026-05-24T08:30:00.000Z', { volumeId: '004', volumeTitle: '話 004' })
    ]

    const candidates = useStoragePressure(chapters, policy, 'cache-003')

    expect(candidates.map((item) => item.chapter.id)).toEqual(['cache-001', 'cache-002', 'cache-004'])
  })

  it('does not propose storage-pressure cleanup when no max cache limit is set', () => {
    const policy = { ...useCacheStore.getState().policy, maxCacheBytes: undefined }
    const chapters = [
      sampleChapter('cache-001', 'reading_cache', 100, '2026-05-24T08:00:00.000Z'),
      sampleChapter('cache-002', 'reading_cache', 100, '2026-05-24T08:10:00.000Z')
    ]

    expect(useStoragePressure(chapters, policy, 'cache-002')).toEqual([])
  })

  it('marks failed cache preparation without exposing internal paths', () => {
    useCacheStore.getState().upsertChapter(sampleChapter('reading-failed', 'reading_cache', 0, '2026-05-24T08:00:00.000Z'))

    const failed = useCacheStore.getState().markChapterStatus('reading-failed', 'failed', '当前章节暂时无法准备，请稍后重试。')

    expect(failed).toMatchObject({
      status: 'failed',
      errorMessage: '当前章节暂时无法准备，请稍后重试。'
    })
  })

  it('merges chapter snapshots by latest update time', () => {
    useCacheStore.getState().upsertChapter(sampleChapter('reading-old', 'reading_cache', 2048, '2026-05-24T10:00:00.000Z'))

    const changed = useCacheStore.getState().mergeChapterSnapshot([
      sampleChapter('reading-old', 'reading_cache', 4096, '2026-05-24T09:00:00.000Z'),
      sampleChapter('reading-new', 'reading_cache', 1024, '2026-05-24T11:00:00.000Z')
    ])

    expect(changed).toBe(1)
    expect(useCacheStore.getState().chaptersById['reading-old'].sizeBytes).toBe(2048)
    expect(useCacheStore.getState().chaptersById['reading-new'].sizeBytes).toBe(1024)
  })

  it('exports the pure stats helper for native snapshot tests', () => {
    const stats = cacheStats([sampleChapter('reading-old', 'reading_cache', 2048, '2026-05-24T08:00:00.000Z')], {
      'reading-old': [samplePage('reading-old', 0)]
    })

    expect(stats.readingCacheBytes).toBe(2048)
    expect(stats.pageCount).toBe(1)
  })
})

function sampleChapter(
  id: string,
  cacheKind: ChapterCacheRecord['cacheKind'],
  sizeBytes: number,
  lastAccessedAt: string,
  patch: Partial<ChapterCacheRecord> = {}
): ChapterCacheRecord {
  return {
    id,
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volumeId: id,
    volumeTitle: '話 089-095',
    format: 'source_zip',
    cacheKind,
    sizeBytes,
    pageCount: 2,
    status: 'ready',
    lastAccessedAt,
    createdAt: lastAccessedAt,
    updatedAt: lastAccessedAt,
    ...patch
  }
}

function samplePage(chapterCacheId: string, pageIndex: number): PageCacheRecord {
  return {
    id: `${chapterCacheId}:${pageIndex}`,
    chapterCacheId,
    comicId: '53339',
    volumeId: chapterCacheId,
    pageIndex,
    filePath: `/cache/${chapterCacheId}/${pageIndex}.jpg`,
    sizeBytes: 1024,
    createdAt: '2026-05-24T08:00:00.000Z',
    lastAccessedAt: '2026-05-24T08:00:00.000Z'
  }
}

function useStoragePressure(chapters: ChapterCacheRecord[], policy: CachePolicy, activeChapterId: string) {
  return storagePressureCleanupCandidates(chapters, policy, { activeChapterId })
}
