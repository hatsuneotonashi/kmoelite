import { useEffect } from 'react'
import { isNativeUnavailable, listNativeChapterCache } from '../platform/nativeCommands'
import { useCacheStore } from '../store/cacheStore'

let nativeChapterCacheSynced = false

export function useNativeChapterCacheSync() {
  useEffect(() => {
    if (nativeChapterCacheSynced) return
    nativeChapterCacheSynced = true

    const sync = async () => {
      const result = await listNativeChapterCache()
      if (!result.ok || !result.value) {
        if (!isNativeUnavailable(result)) {
          console.warn('[kmoe] native chapter cache sync failed:', result.message)
        }
        return
      }

      useCacheStore.getState().mergeChapterSnapshot(result.value)
    }

    void sync()
  }, [])
}

export function resetNativeChapterCacheSyncForTests() {
  nativeChapterCacheSynced = false
}
