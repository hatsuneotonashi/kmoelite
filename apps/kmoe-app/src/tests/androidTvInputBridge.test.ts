import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainActivitySource = readFileSync('src-tauri/gen/android/app/src/main/java/moe/kzo/client/MainActivity.kt', 'utf8')

describe('Android TV input bridge', () => {
  it('bridges remote DPAD keys into the Tauri WebView without replacing native Back handling', () => {
    expect(mainActivitySource).toContain('override fun onWebViewCreate(webView: WebView)')
    expect(mainActivitySource).toContain('override fun dispatchKeyEvent(event: KeyEvent): Boolean')
    expect(mainActivitySource).toContain('KEYCODE_DPAD_CENTER')
    expect(mainActivitySource).toContain('KEYCODE_DPAD_LEFT')
    expect(mainActivitySource).toContain('KEYCODE_DPAD_RIGHT')
    expect(mainActivitySource).toContain('evaluateJavascript(remoteKeyScript(key), null)')
    expect(mainActivitySource).not.toContain('KEYCODE_BACK ->')
  })
})
