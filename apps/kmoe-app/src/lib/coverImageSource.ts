import { nativeFetchCoverImage } from '../platform/nativeCommands'

const coverDataUrlCache = new Map<string, string>()
const pendingCoverFetches = new Map<string, Promise<string | undefined>>()
const MAX_NATIVE_COVER_CACHE_ENTRIES = 80
const MAX_NATIVE_COVER_CACHE_BYTES = 14 * 1024 * 1024
let coverDataUrlCacheBytes = 0

export async function resolveNativeCoverDataUrl(src: string | undefined): Promise<string | undefined> {
  if (!src || !isRemoteImageSource(src)) return undefined

  const cached = coverDataUrlCache.get(src)
  if (cached) return cached

  const pending = pendingCoverFetches.get(src)
  if (pending) return pending

  const request = nativeFetchCoverImage(src)
    .then((result) => {
      const value = result.ok && result.value?.startsWith('data:image/') ? result.value : undefined
      if (value) rememberCoverDataUrl(src, value)
      return value
    })
    .catch(() => undefined)
    .finally(() => {
      pendingCoverFetches.delete(src)
    })
  pendingCoverFetches.set(src, request)
  return request
}

export function isRemoteImageSource(src: string): boolean {
  return /^https?:\/\//i.test(src)
}

function rememberCoverDataUrl(src: string, value: string) {
  const existing = coverDataUrlCache.get(src)
  if (existing) coverDataUrlCacheBytes -= existing.length
  coverDataUrlCache.set(src, value)
  coverDataUrlCacheBytes += value.length
  trimCoverDataUrlCache()
}

function trimCoverDataUrlCache() {
  while (
    coverDataUrlCache.size > MAX_NATIVE_COVER_CACHE_ENTRIES
    || coverDataUrlCacheBytes > MAX_NATIVE_COVER_CACHE_BYTES
  ) {
    const oldest = coverDataUrlCache.keys().next().value
    if (!oldest) break
    const value = coverDataUrlCache.get(oldest)
    if (value) coverDataUrlCacheBytes -= value.length
    coverDataUrlCache.delete(oldest)
  }
}
