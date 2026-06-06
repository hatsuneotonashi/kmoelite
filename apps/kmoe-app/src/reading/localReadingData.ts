import { readableAppMessage } from '../lib/format'
import {
  deleteNativeLocalReadingData,
  isNativeUnavailable,
  type NativeDeleteLocalReadingDataInput,
  type NativeDeleteLocalReadingDataResult
} from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'
import { useDownloadStore } from '../store/downloadStore'
import { useShelfStore } from '../store/shelfStore'
import { isReaderArchiveFormat } from './sourceArchive'

export type LocalReadingDataDeleteInput = NativeDeleteLocalReadingDataInput

export type LocalReadingDataDeleteOutcome =
  | { ok: true; message: string; value: NativeDeleteLocalReadingDataResult }
  | { ok: false; message: string }

export async function deleteLocalReadingData(
  input: LocalReadingDataDeleteInput
): Promise<LocalReadingDataDeleteOutcome> {
  const result = await deleteNativeLocalReadingData({
    ...input,
    includeSourceFiles: input.includeSourceFiles ?? true
  })

  if (!result.ok || !result.value) {
    return {
      ok: false,
      message: isNativeUnavailable(result)
        ? '请在 kmoelite 客户端中删除本地阅读数据；浏览器预览无法删除设备文件。'
        : readableAppMessage(result.message, '暂时无法删除本地阅读数据，请稍后重试。')
    }
  }

  const affectedComicIds = affectedComicIdsForDelete(input, result.value)
  useCacheStore.getState().clearReadingCache(result.value.removedChapterIds)
  useDownloadStore.getState().replaceWithNativeSnapshot(
    { tasks: result.value.tasks, library: result.value.library },
    { recoverInterrupted: false }
  )
  syncShelfCacheStateAfterLocalReadingDataDelete(affectedComicIds)

  return {
    ok: true,
    message: result.message,
    value: result.value
  }
}

export function hasLocalReadingDataForComic(
  comicId: string,
  volumeIds?: string[]
): boolean {
  const volumeSet = volumeIds ? new Set(volumeIds) : undefined
  const cacheState = useCacheStore.getState()
  const downloadState = useDownloadStore.getState()
  return Object.values(cacheState.chaptersById).some((chapter) =>
    chapter.comicId === comicId
    && chapter.cacheKind === 'reading_cache'
    && (!volumeSet || volumeSet.has(chapter.volumeId))
  ) || downloadState.library.some((file) =>
    file.comicId === comicId
    && isReaderArchiveFormat(file.format)
    && (!volumeSet || volumeSet.has(file.volId))
  )
}

function syncShelfCacheStateAfterLocalReadingDataDelete(affectedComicIds: string[]) {
  const shelf = useShelfStore.getState()
  if (affectedComicIds.length === 0) return

  const remainingReadingCacheComicIds = new Set(Object.values(useCacheStore.getState().chaptersById)
    .filter((chapter) => chapter.cacheKind === 'reading_cache')
    .map((chapter) => chapter.comicId))
  const remainingDownloadedComicIds = new Set(useDownloadStore.getState().library
    .map((file) => file.comicId))

  for (const comicId of affectedComicIds) {
    const item = shelf.itemsByComicId[comicId]
    if (!item) continue
    if (remainingReadingCacheComicIds.has(comicId)) {
      shelf.batchUpdate([comicId], { type: 'set_cached', cached: true, cacheStatus: 'reading_cache' })
    } else if (remainingDownloadedComicIds.has(comicId)) {
      shelf.batchUpdate([comicId], { type: 'set_cached', cached: true, cacheStatus: 'downloaded' })
    } else {
      shelf.batchUpdate([comicId], { type: 'set_cached', cached: false, cacheStatus: 'none' })
    }
  }
}

function affectedComicIdsForDelete(
  input: LocalReadingDataDeleteInput,
  result: NativeDeleteLocalReadingDataResult
): string[] {
  const ids = new Set(input.comicIds?.filter(Boolean) ?? [])
  const cacheState = useCacheStore.getState()
  const downloadState = useDownloadStore.getState()
  const removedFileIds = new Set(result.removedFileIds)
  for (const chapterId of result.removedChapterIds) {
    const chapter = cacheState.chaptersById[chapterId]
    if (chapter) ids.add(chapter.comicId)
  }
  for (const file of downloadState.library) {
    if (removedFileIds.has(file.id)) ids.add(file.comicId)
  }
  return [...ids]
}
