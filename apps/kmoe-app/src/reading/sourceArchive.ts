import type { ChapterCacheRecord } from '../types/cache'
import type { DownloadedFile, DownloadFormat } from '../types/domain'

export type ReaderArchiveFormat = Extract<DownloadFormat, 'source_zip' | 'epub'>

export const READER_ARCHIVE_FORMATS: ReaderArchiveFormat[] = ['source_zip', 'epub']

export function isReaderArchiveFormat(format: DownloadFormat | string): format is ReaderArchiveFormat {
  return format === 'source_zip' || format === 'epub'
}

export function readerArchiveFormatLabel(format: ReaderArchiveFormat): string {
  return format === 'source_zip' ? '源图 ZIP' : 'EPUB'
}

export function isMetadataOnlyDownloadedFile(file: Pick<DownloadedFile, 'localPath'>): boolean {
  return file.localPath.startsWith('Imported metadata only/')
}

export function findReaderArchiveForVolume(
  library: DownloadedFile[],
  comicId: string,
  volumeId: string,
  preferredFormats: ReaderArchiveFormat[] = READER_ARCHIVE_FORMATS
): DownloadedFile | undefined {
  for (const format of preferredFormats) {
    const found = library.find((file) =>
      file.comicId === comicId
      && file.volId === volumeId
      && file.format === format
    )
    if (found) return found
  }
  return undefined
}

export function findUsableReaderArchiveForVolume(
  library: DownloadedFile[],
  comicId: string,
  volumeId: string,
  preferredFormats: ReaderArchiveFormat[] = READER_ARCHIVE_FORMATS
): DownloadedFile | undefined {
  for (const format of preferredFormats) {
    const found = library.find((file) =>
      file.comicId === comicId
      && file.volId === volumeId
      && file.format === format
      && !isMetadataOnlyDownloadedFile(file)
    )
    if (found) return found
  }
  return undefined
}

export function findSourceArchiveForVolume(
  library: DownloadedFile[],
  comicId: string,
  volumeId: string
): DownloadedFile | undefined {
  return findReaderArchiveForVolume(library, comicId, volumeId, ['source_zip'])
}

export function findUsableSourceArchiveForVolume(
  library: DownloadedFile[],
  comicId: string,
  volumeId: string
): DownloadedFile | undefined {
  return findUsableReaderArchiveForVolume(library, comicId, volumeId, ['source_zip'])
}

export function findReadyReadingCacheForVolume(
  chapters: ChapterCacheRecord[],
  comicId: string,
  volumeId: string
): ChapterCacheRecord | undefined {
  return chapters
    .filter((chapter) =>
      chapter.comicId === comicId
      && chapter.volumeId === volumeId
      && chapter.cacheKind === 'reading_cache'
      && chapter.status === 'ready'
      && (chapter.pageCount === undefined || chapter.pageCount > 0)
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}
