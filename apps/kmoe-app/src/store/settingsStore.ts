import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, DownloadFormat, ReaderPageTurnAnimation } from '../types/domain'
import { DEFAULT_SETTINGS, QUEUE_CONCURRENCY, normalizeConcurrency } from '../lib/config'

interface SettingsState extends AppSettings {
  setConcurrency: (value: number) => void
  setPreferredFormat: (format: DownloadFormat) => void
  setDownloadDirectory: (path: string) => void
  setColorizeDetailPage: (enabled: boolean) => void
  setReaderPageTurnAnimation: (animation: ReaderPageTurnAnimation) => void
  setShowReaderStatusBar: (visible: boolean) => void
  resetSafetyDefaults: () => void
}

const initialSettings: AppSettings = {
  ...DEFAULT_SETTINGS
}

const PREFERRED_DOWNLOAD_FORMATS: DownloadFormat[] = ['epub', 'source_zip', 'mobi']
const READER_PAGE_TURN_ANIMATIONS: ReaderPageTurnAnimation[] = ['slide', 'curl', 'fade']

export function sanitizePersistedSettings(stored: Partial<AppSettings>): Partial<AppSettings> {
  const preferredFormat = normalizePreferredFormat(stored.preferredFormat)

  return {
    concurrency: QUEUE_CONCURRENCY,
    preferredFormat,
    downloadDirectory: stored.downloadDirectory ?? DEFAULT_SETTINGS.downloadDirectory,
    colorizeDetailPage: stored.colorizeDetailPage ?? DEFAULT_SETTINGS.colorizeDetailPage,
    readerPageTurnAnimation: normalizeReaderPageTurnAnimation(stored.readerPageTurnAnimation),
    showReaderStatusBar: typeof stored.showReaderStatusBar === 'boolean' ? stored.showReaderStatusBar : DEFAULT_SETTINGS.showReaderStatusBar
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialSettings,
      setConcurrency: (concurrency) => set({ concurrency: normalizeConcurrency(concurrency) }),
      setPreferredFormat: (preferredFormat) => set({ preferredFormat: normalizePreferredFormat(preferredFormat) }),
      setDownloadDirectory: (downloadDirectory) => set({ downloadDirectory }),
      setColorizeDetailPage: (colorizeDetailPage) => set({ colorizeDetailPage }),
      setReaderPageTurnAnimation: (readerPageTurnAnimation) => set({ readerPageTurnAnimation: normalizeReaderPageTurnAnimation(readerPageTurnAnimation) }),
      setShowReaderStatusBar: (showReaderStatusBar) => set({ showReaderStatusBar }),
      resetSafetyDefaults: () => set(DEFAULT_SETTINGS)
    }),
    {
      name: 'kmoe-client-settings',
      partialize: (state) => ({
        preferredFormat: state.preferredFormat,
        downloadDirectory: state.downloadDirectory,
        colorizeDetailPage: state.colorizeDetailPage,
        readerPageTurnAnimation: state.readerPageTurnAnimation,
        showReaderStatusBar: state.showReaderStatusBar
      }),
      merge: (persisted, current) => {
        const stored = typeof persisted === 'object' && persisted && 'state' in persisted ? (persisted.state as Partial<AppSettings>) : {}
        return {
          ...current,
          ...sanitizePersistedSettings(stored)
        }
      }
    }
  )
)

function normalizePreferredFormat(format: unknown): DownloadFormat {
  return PREFERRED_DOWNLOAD_FORMATS.includes(format as DownloadFormat) ? (format as DownloadFormat) : DEFAULT_SETTINGS.preferredFormat
}

function normalizeReaderPageTurnAnimation(animation: unknown): ReaderPageTurnAnimation {
  return READER_PAGE_TURN_ANIMATIONS.includes(animation as ReaderPageTurnAnimation)
    ? (animation as ReaderPageTurnAnimation)
    : DEFAULT_SETTINGS.readerPageTurnAnimation
}
