import { useEffect } from 'react'
import {
  isNativeUnavailable,
  listNativeShelfItems,
  listNativeShelves,
  removeNativeShelfItems,
  upsertNativeShelf,
  upsertNativeShelfItem
} from '../platform/nativeCommands'
import {
  categoryToNativeShelf,
  makeDefaultNativeShelf,
  nativeShelfItemsToDomain,
  nativeShelvesToCategories,
  shelfItemToNativeRecords
} from '../shelf/nativeShelf'
import { useShelfStore } from '../store/shelfStore'
import type { ShelfCategory, ShelfItem } from '../types/shelf'

let nativeShelfSyncStarted = false
let nativeShelfWriteQueue = Promise.resolve()

export function useNativeShelfSync() {
  useEffect(() => {
    if (nativeShelfSyncStarted) return
    nativeShelfSyncStarted = true
    let active = true
    let unsubscribe: (() => void) | undefined

    const sync = async () => {
      const [shelvesResult, itemsResult] = await Promise.all([
        listNativeShelves(),
        listNativeShelfItems()
      ])
      if (!active) return

      const nativeUnavailable = isNativeUnavailable(shelvesResult) || isNativeUnavailable(itemsResult)
      if (nativeUnavailable) return
      if (!shelvesResult.ok || !itemsResult.ok || !shelvesResult.value || !itemsResult.value) {
        console.warn('[kmoe] native shelf sync failed:', shelvesResult.message || itemsResult.message)
        return
      }

      useShelfStore.getState().mergeShelfSnapshot({
        categories: nativeShelvesToCategories(shelvesResult.value),
        items: nativeShelfItemsToDomain(itemsResult.value)
      })

      await persistShelfSnapshot(useShelfStore.getState().categories, Object.values(useShelfStore.getState().itemsByComicId))
      if (!active) return

      unsubscribe = useShelfStore.subscribe((state, previous) => {
        enqueueNativeShelfWrite(() => persistShelfDelta(state.categories, previous.categories, state.itemsByComicId, previous.itemsByComicId))
      })
    }

    void sync()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])
}

export function resetNativeShelfSyncForTests() {
  nativeShelfSyncStarted = false
  nativeShelfWriteQueue = Promise.resolve()
}

async function persistShelfSnapshot(categories: ShelfCategory[], items: ShelfItem[]) {
  const now = new Date().toISOString()
  await upsertNativeShelf(makeDefaultNativeShelf(now))
  for (const category of categories) {
    await upsertNativeShelf(categoryToNativeShelf(category))
  }
  for (const item of items) {
    await persistShelfItem(item)
  }
}

async function persistShelfDelta(
  categories: ShelfCategory[],
  previousCategories: ShelfCategory[],
  itemsByComicId: Record<string, ShelfItem>,
  previousItemsByComicId: Record<string, ShelfItem>
) {
  for (const category of categories) {
    const previous = previousCategories.find((item) => item.id === category.id)
    if (!previous || previous.updatedAt !== category.updatedAt || previous.name !== category.name || previous.sortOrder !== category.sortOrder) {
      await upsertNativeShelf(categoryToNativeShelf(category))
    }
  }

  const deletedComicIds = Object.keys(previousItemsByComicId).filter((comicId) => !itemsByComicId[comicId])
  if (deletedComicIds.length > 0) {
    await removeNativeShelfItems(deletedComicIds)
  }

  for (const [comicId, item] of Object.entries(itemsByComicId)) {
    const previous = previousItemsByComicId[comicId]
    if (!previous || JSON.stringify(previous) !== JSON.stringify(item)) {
      await removeNativeShelfItems([comicId])
      await persistShelfItem(item)
    }
  }
}

async function persistShelfItem(item: ShelfItem) {
  for (const record of shelfItemToNativeRecords(item)) {
    await upsertNativeShelfItem(record)
  }
}

function enqueueNativeShelfWrite(work: () => Promise<void>) {
  nativeShelfWriteQueue = nativeShelfWriteQueue
    .then(work)
    .catch((error) => {
      console.warn('[kmoe] native shelf write failed:', error)
    })
  return nativeShelfWriteQueue
}
