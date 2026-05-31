import { useEffect } from 'react'
import { getNativeAppConfig } from '../platform/nativeCommands'
import { useSettingsStore } from '../store/settingsStore'

export function useNativeAppConfigSync() {
  const setDownloadDirectory = useSettingsStore((state) => state.setDownloadDirectory)

  useEffect(() => {
    let active = true

    void getNativeAppConfig().then((result) => {
      if (!active || !result.ok) return
      if (result.value?.downloadDirectory) {
        setDownloadDirectory(result.value.downloadDirectory)
      }
    })

    return () => {
      active = false
    }
  }, [setDownloadDirectory])
}
