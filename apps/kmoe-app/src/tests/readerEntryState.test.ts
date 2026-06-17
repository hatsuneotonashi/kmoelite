import { describe, expect, it } from 'vitest'
import { resolveLibraryReaderEntryState, resolveReaderEntryState } from '../reading/readerEntry'
import type { ChapterCacheRecord } from '../types/cache'
import type { DownloadedFile, DownloadTask, VolumeDownloadOption } from '../types/domain'

describe('reader entry state resolver', () => {
  it('prefers ready cache over download and library states', () => {
    const state = resolveReaderEntryState({
      option: option(),
      chapters: [chapter()],
      library: [],
      tasks: [sourceTask({ status: 'queued' })]
    })

    expect(state.kind).toBe('continue_reading')
    expect(state.label).toBe('继续阅读')
    expect(state.cache?.id).toBe('cache-53339-3089')
  })

  it('shows source download status before offering a duplicate source task', () => {
    const state = resolveReaderEntryState({
      option: option(),
      chapters: [],
      library: [],
      tasks: [sourceTask({ status: 'downloading', progress: 42 })]
    })

    expect(state.kind).toBe('source_downloading')
    expect(state.label).toBe('下载中')
    expect(state.enabled).toBe(true)
  })

  it('offers EPUB as a reader archive when source ZIP is absent', () => {
    const state = resolveReaderEntryState({
      option: option({ availableFormats: ['mobi', 'epub'] }),
      chapters: [],
      library: [],
      tasks: []
    })

    expect(state.kind).toBe('queue_source_zip')
    expect(state.enabled).toBe(true)
    expect(state.readerFormat).toBe('epub')
    expect(state.label).toBe('获取 EPUB')
  })

  it('does not let metadata-only library records block online Reader download', () => {
    const state = resolveReaderEntryState({
      option: option({ availableFormats: ['mobi', 'epub'] }),
      chapters: [],
      library: [downloadedFile({ format: 'epub', localPath: 'Imported metadata only/book.epub' })],
      tasks: []
    })

    expect(state.kind).toBe('queue_source_zip')
    expect(state.readerFormat).toBe('epub')
    expect(state.label).toBe('获取 EPUB')
  })

  it('offers source ZIP reading even when metadata detected availability without a size', () => {
    const state = resolveReaderEntryState({
      option: option({
        sizes: { mobi: undefined, epub: undefined, sourceZip: undefined },
        availableFormats: ['source_zip']
      }),
      chapters: [],
      library: [],
      tasks: []
    })

    expect(state.kind).toBe('queue_source_zip')
    expect(state.enabled).toBe(true)
    expect(state.readerFormat).toBe('source_zip')
    expect(state.label).toBe('获取源图')
  })

  it('explains mobi-only rows as external file only', () => {
    const state = resolveReaderEntryState({
      option: option({ availableFormats: ['mobi'] }),
      chapters: [],
      library: [],
      tasks: []
    })

    expect(state.kind).toBe('not_supported_format')
    expect(state.enabled).toBe(false)
    expect(state.helper).toContain('MOBI')
  })

  it('uses policy-blocked state when source zip exists but restrictions block it', () => {
    const state = resolveReaderEntryState({
      option: option({ restrictions: ['Lv3 required'] }),
      chapters: [],
      library: [],
      tasks: []
    })

    expect(state.kind).toBe('blocked_by_policy')
    expect(state.enabled).toBe(false)
    expect(state.helper).toContain('Lv3 required')
  })

  it('lets library source zip and epub files prepare Reader cache while mobi remains file-only', () => {
    const sourceState = resolveLibraryReaderEntryState({
      file: downloadedFile({ format: 'source_zip' }),
      chapters: []
    })
    const epubState = resolveLibraryReaderEntryState({
      file: downloadedFile({ format: 'epub', localPath: '/tmp/book.epub' }),
      chapters: []
    })
    const mobiState = resolveLibraryReaderEntryState({
      file: downloadedFile({ format: 'mobi', localPath: '/tmp/book.mobi' }),
      chapters: []
    })
    const mobiWithSameVolumeCache = resolveLibraryReaderEntryState({
      file: downloadedFile({ format: 'mobi', localPath: '/tmp/book.mobi' }),
      chapters: [chapter()]
    })

    expect(sourceState.kind).toBe('prepare_from_local_source')
    expect(sourceState.enabled).toBe(true)
    expect(epubState.kind).toBe('prepare_from_local_source')
    expect(epubState.enabled).toBe(true)
    expect(epubState.readerFormat).toBe('epub')
    expect(mobiState.kind).toBe('not_supported_format')
    expect(mobiState.enabled).toBe(false)
    expect(mobiWithSameVolumeCache.kind).toBe('not_supported_format')
    expect(mobiWithSameVolumeCache.enabled).toBe(false)
  })
})

function option(patch: Partial<VolumeDownloadOption> = {}): VolumeDownloadOption {
  return {
    id: '53339-3089',
    comicId: '53339',
    volId: '3089',
    title: '話 089-095',
    displayTitle: '話 089-095',
    kind: 'chapter_group',
    pageCount: 180,
    docPageCount: 180,
    sizes: {
      mobi: 10,
      epub: 11,
      sourceZip: 12
    },
    availableFormats: ['mobi', 'epub', 'source_zip'],
    restrictions: [],
    ...patch
  }
}

function sourceTask(patch: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: '53339-3089-source_zip',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    status: 'queued',
    progress: 0,
    downloadedBytes: 0,
    retryCount: 0,
    createdAt: '2026-05-24T10:00:00.000Z',
    updatedAt: '2026-05-24T10:00:00.000Z',
    ...patch
  }
}

function downloadedFile(patch: Partial<DownloadedFile> = {}): DownloadedFile {
  return {
    id: 'file-source',
    taskId: 'task-source',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    localPath: '/tmp/book.zip',
    sizeBytes: 2048,
    downloadedAt: '2026-05-24T09:00:00.000Z',
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
    pageCount: 1,
    status: 'ready',
    lastAccessedAt: '2026-05-24T09:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T09:00:00.000Z',
    ...patch
  }
}
