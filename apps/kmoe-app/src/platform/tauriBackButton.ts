import { onBackButtonPress } from '@tauri-apps/api/app'
import type { PluginListener } from '@tauri-apps/api/core'
import { isTauriRuntime } from './tauri'

type TauriBackButtonPayload = {
  canGoBack?: boolean
}

type BackButtonHandler = (payload: TauriBackButtonPayload) => void

export function subscribeTauriBackButton(handler: BackButtonHandler): () => void {
  if (!isTauriRuntime()) return () => {}

  let disposed = false
  let listener: PluginListener | undefined

  void onBackButtonPress((payload) => {
    handler(payload ?? {})
  }).then((dispose) => {
    if (disposed) {
      void dispose.unregister()
      return
    }
    listener = dispose
  }).catch(() => {
    // Some web previews expose partial Tauri globals during startup.
  })

  return () => {
    disposed = true
    void listener?.unregister()
  }
}
