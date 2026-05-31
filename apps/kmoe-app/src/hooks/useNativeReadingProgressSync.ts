import { useEffect } from 'react'
import { isNativeUnavailable, listNativeReadingProgress } from '../platform/nativeCommands'
import { nativeReadingProgressListToDomain } from '../reading/nativeProgress'
import { useReadingStore } from '../store/readingStore'
import { useShelfStore } from '../store/shelfStore'

let nativeReadingProgressSynced = false

export function useNativeReadingProgressSync() {
  useEffect(() => {
    if (nativeReadingProgressSynced) return
    nativeReadingProgressSynced = true

    const sync = async () => {
      const result = await listNativeReadingProgress()
      if (!result.ok || !result.value) {
        if (!isNativeUnavailable(result)) {
          console.warn('[kmoe] native reading progress sync failed:', result.message)
        }
        return
      }

      const progressItems = nativeReadingProgressListToDomain(result.value)
      useReadingStore.getState().mergeProgressSnapshot(progressItems)

      const shelf = useShelfStore.getState()
      for (const progress of progressItems) {
        const item = shelf.itemsByComicId[progress.comicId]
        if (!item) continue
        shelf.updateShelfItem(progress.comicId, {
          lastReadAt: progress.lastReadAt,
          readingProgress: progress
        })
      }
    }

    void sync()
  }, [])
}

export function resetNativeReadingProgressSyncForTests() {
  nativeReadingProgressSynced = false
}
