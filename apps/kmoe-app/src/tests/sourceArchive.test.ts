import { describe, expect, it } from 'vitest'
import {
  findReaderArchiveForVolume,
  findReadyReadingCacheForVolume,
  findSourceArchiveForVolume,
  findUsableReaderArchiveForVolume,
  findUsableSourceArchiveForVolume,
  isMetadataOnlyDownloadedFile
} from '../reading/sourceArchive'
import type { ChapterCacheRecord } from '../types/cache'
import type { DownloadedFile } from '../types/domain'

describe('reader source archive resolution', () => {
  it('detects metadata-only library rows', () => {
    expect(isMetadataOnlyDownloadedFile({ localPath: 'Imported metadata only/title.zip' })).toBe(true)
    expect(isMetadataOnlyDownloadedFile({ localPath: '/Users/example/Downloads/Kmoe/title.zip' })).toBe(false)
  })

  it('finds source ZIP records and filters usable archives', () => {
    const library = [
      downloadedFile({ id: 'mobi', format: 'mobi', localPath: '/tmp/book.mobi' }),
      downloadedFile({ id: 'metadata', localPath: 'Imported metadata only/book.zip' })
    ]

    expect(findSourceArchiveForVolume(library, '53339', '3089')?.id).toBe('metadata')
    expect(findUsableSourceArchiveForVolume(library, '53339', '3089')).toBeUndefined()

    const usable = downloadedFile({ id: 'zip', localPath: '/tmp/book.zip' })
    expect(findUsableSourceArchiveForVolume([...library, usable], '53339', '3089')?.id).toBe('zip')
  })

  it('prefers source ZIP but falls back to EPUB for reader-capable archives', () => {
    const epub = downloadedFile({ id: 'epub', format: 'epub', localPath: '/tmp/book.epub' })
    const source = downloadedFile({ id: 'zip', format: 'source_zip', localPath: '/tmp/book.zip' })

    expect(findReaderArchiveForVolume([epub], '53339', '3089')?.id).toBe('epub')
    expect(findReaderArchiveForVolume([epub, source], '53339', '3089')?.id).toBe('zip')
    expect(findUsableReaderArchiveForVolume([downloadedFile({ id: 'metadata', format: 'epub', localPath: 'Imported metadata only/book.epub' }), epub], '53339', '3089')?.id).toBe('epub')
  })

  it('finds the newest ready reading cache for a volume', () => {
    const chapters = [
      chapter({ id: 'old-ready', updatedAt: '2026-05-24T09:00:00.000Z' }),
      chapter({ id: 'failed', status: 'failed', updatedAt: '2026-05-24T12:00:00.000Z' }),
      chapter({ id: 'new-ready', updatedAt: '2026-05-24T11:00:00.000Z' })
    ]

    expect(findReadyReadingCacheForVolume(chapters, '53339', '3089')?.id).toBe('new-ready')
    expect(findReadyReadingCacheForVolume(chapters, '53339', 'missing')).toBeUndefined()
  })
})

function downloadedFile(patch: Partial<DownloadedFile> = {}): DownloadedFile {
  return {
    id: 'zip',
    taskId: 'task-zip',
    comicId: '53339',
    comicTitle: '尖帽子的魔法工房',
    volId: '3089',
    volumeTitle: '話 089-095',
    format: 'source_zip',
    localPath: '/tmp/book.zip',
    sizeBytes: 1024,
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
    sizeBytes: 1024,
    pageCount: 2,
    status: 'ready',
    lastAccessedAt: '2026-05-24T09:00:00.000Z',
    createdAt: '2026-05-24T09:00:00.000Z',
    updatedAt: '2026-05-24T09:00:00.000Z',
    ...patch
  }
}
