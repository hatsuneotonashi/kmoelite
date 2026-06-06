import { useMemo } from 'react'
import { createKmoeApi } from '../api/createKmoeApi'
import { useSettingsStore } from '../store/settingsStore'

export function useKmoeApi() {
  const settings = useSettingsStore()
  return useMemo(
    () =>
      createKmoeApi({
        concurrency: settings.concurrency,
        preferredFormat: settings.preferredFormat,
        downloadDirectory: settings.downloadDirectory,
        colorizeDetailPage: settings.colorizeDetailPage,
        readerPageTurnAnimation: settings.readerPageTurnAnimation,
        showReaderStatusBar: settings.showReaderStatusBar
      }),
    [
      settings.concurrency,
      settings.preferredFormat,
      settings.downloadDirectory,
      settings.colorizeDetailPage,
      settings.readerPageTurnAnimation,
      settings.showReaderStatusBar
    ]
  )
}
