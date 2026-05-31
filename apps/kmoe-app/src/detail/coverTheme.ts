import { useEffect, useState } from 'react'
import { resolveNativeCoverDataUrl } from '../lib/coverImageSource'
import { fallbackCoverTheme, sampleCoverTheme, type CoverTheme } from '../lib/coverTheme'

export function useCoverTheme(coverUrl: string | undefined, seed: string, enabled = true): CoverTheme {
  const [theme, setTheme] = useState<CoverTheme>(() => fallbackCoverTheme(seed))

  useEffect(() => {
    let cancelled = false
    const fallback = fallbackCoverTheme(seed)
    setTheme(fallback)
    if (!enabled || !coverUrl || typeof Image === 'undefined' || typeof document === 'undefined') return undefined

    void (async () => {
      const nativeCoverSource = await resolveNativeCoverDataUrl(coverUrl)
      if (cancelled) return
      const sampled = await sampleCoverThemeFromSource(nativeCoverSource ?? coverUrl)
      if (!cancelled) setTheme(sampled ?? fallback)
    })()

    return () => {
      cancelled = true
    }
  }, [coverUrl, enabled, seed])

  return theme
}

export function cssCoverImageValue(url: string | undefined): string {
  if (!url) return 'none'
  return `url("${url.replace(/["\\]/g, '\\$&')}")`
}

export function ensureThemeColorMeta(): HTMLMetaElement | undefined {
  if (typeof document === 'undefined') return undefined
  const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (existing) return existing
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  document.head.append(meta)
  return meta
}

export function coverThemeColor(theme: CoverTheme): string {
  const r = clampColorChannel(theme.r * 0.70 + 28)
  const g = clampColorChannel(theme.g * 0.70 + 28)
  const b = clampColorChannel(theme.b * 0.70 + 28)
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function clearDocumentCoverTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  delete root.dataset.detailCoverTheme
  root.style.removeProperty('--active-cover-accent-rgb')
  root.style.removeProperty('--active-cover-image')
}

function sampleCoverThemeFromSource(src: string): Promise<CoverTheme | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      resolve(sampleCoverTheme(image))
    }
    image.onerror = () => {
      resolve(undefined)
    }
    image.src = src
  })
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
