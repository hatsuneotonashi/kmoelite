import type { ChapterCacheRecord } from '../types/cache'
import type { ReadingProgress } from '../types/reading'
import { findReadyReadingCacheForVolume } from './sourceArchive'

export function resolveContinueReadingTarget(progress: ReadingProgress, chapters: ChapterCacheRecord[]): string {
  const chapter = findReadyReadingCacheForVolume(chapters, progress.comicId, progress.volumeId)

  if (!chapter) return `/comic/${encodeURIComponent(progress.comicId)}`
  return `/reader/cache/${encodeURIComponent(chapter.id)}`
}
