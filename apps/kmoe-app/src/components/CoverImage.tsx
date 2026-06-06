import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { isRemoteImageSource, resolveNativeCoverDataUrl } from '../lib/coverImageSource'

export function CoverImage({
  src,
  title,
  className,
  priority = false
}: {
  src?: string
  title: string
  subtitle?: string
  className?: string
  priority?: boolean
}) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const nativeAttemptedRef = useRef(false)
  const mountedRef = useRef(true)
  const [displaySrc, setDisplaySrc] = useState(src)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const mark = useMemo(() => title.replace(/\s+/g, '').slice(0, 2) || 'K', [title])

  useEffect(() => {
    nativeAttemptedRef.current = false
    setDisplaySrc(src)
    setFailed(false)
    setLoaded(false)
  }, [src])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const acceptLoadedImage = useCallback((image: HTMLImageElement) => {
    if (image.naturalWidth <= 2 || image.naturalHeight <= 2) {
      setFailed(true)
      setLoaded(false)
      return false
    }
    setLoaded(true)
    setFailed(false)
    return true
  }, [])

  const recoverFromFailedSource = useCallback(async () => {
    if (!src || !isRemoteImageSource(src) || nativeAttemptedRef.current || displaySrc?.startsWith('data:')) {
      setFailed(true)
      setLoaded(false)
      return
    }

    nativeAttemptedRef.current = true
    const fallbackSrc = await resolveNativeCoverDataUrl(src)
    if (!mountedRef.current) return

    if (!fallbackSrc) {
      setFailed(true)
      setLoaded(false)
      return
    }

    setDisplaySrc(fallbackSrc)
    setFailed(false)
    setLoaded(false)
  }, [displaySrc, src])

  useEffect(() => {
    const image = imageRef.current
    if (!image || !displaySrc || failed || !image.complete) return
    if (!acceptLoadedImage(image)) {
      void recoverFromFailedSource()
    }
  }, [acceptLoadedImage, displaySrc, failed, recoverFromFailedSource])

  return (
    <div className={clsx('relative h-full w-full overflow-hidden', className)}>
      {(!displaySrc || failed || !loaded) ? <CoverFallback mark={mark} /> : null}
      {displaySrc && !failed ? (
        <img
          ref={imageRef}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          src={displaySrc}
          alt={title}
          className={clsx(
            'relative z-[1] h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={(event) => {
            if (!acceptLoadedImage(event.currentTarget)) {
              void recoverFromFailedSource()
            }
          }}
          onError={() => {
            void recoverFromFailedSource()
          }}
        />
      ) : null}
    </div>
  )
}

function CoverFallback({ mark }: { mark: string }) {
  return (
    <div aria-hidden="true" className="cover-fallback absolute inset-0 grid place-items-center bg-[linear-gradient(160deg,#fbfbfc,#eceef1_58%,#dddfe4)]">
      <div className="absolute inset-x-4 top-5 h-px bg-black/10" />
      <div className="absolute inset-x-4 bottom-5 h-px bg-white/70" />
      <div className="absolute -right-10 top-8 h-28 w-28 rounded-full border border-black/5 bg-white/26 blur-sm" />
      <div className="px-4 text-center">
        <div className="cover-fallback-mark mx-auto grid h-16 w-16 place-items-center rounded-[24px] border border-black/10 bg-white/50 text-2xl font-black tracking-tight text-[var(--cover-fallback-fg,#1d1d1f)] shadow-[0_14px_34px_rgb(21_21_22_/_0.09)]">
          {mark}
        </div>
      </div>
    </div>
  )
}
