import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainActivitySource = readFileSync('src-tauri/gen/android/app/src/main/java/moe/kzo/client/MainActivity.kt', 'utf8')
const androidManifestSource = readFileSync('src-tauri/gen/android/app/src/main/AndroidManifest.xml', 'utf8')
const androidFilePathsSource = readFileSync('src-tauri/gen/android/app/src/main/res/xml/file_paths.xml', 'utf8')
const appSource = readFileSync('src/App.tsx', 'utf8')

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

describe('Android app links', () => {
  it('registers and handles safe kmoelite comic deep links inside the app WebView', () => {
    expect(androidManifestSource).toContain('android.intent.action.VIEW')
    expect(androidManifestSource).toContain('android.intent.category.BROWSABLE')
    expect(androidManifestSource).toContain('android:scheme="kmoelite"')
    expect(androidManifestSource).toContain('android:host="comic"')

    expect(mainActivitySource).toContain('override fun onNewIntent(intent: Intent)')
    expect(mainActivitySource).toContain('if (handleDeepLinkIntent(intent)) return')
    expect(mainActivitySource).toContain('super.onNewIntent(intent)')
    expect(mainActivitySource).toContain('handleDeepLinkIntent(intent)')
    expect(mainActivitySource).toContain('webView.addJavascriptInterface(AndroidAppBridge(this), "KmoeliteAndroidApp")')
    expect(mainActivitySource).toContain('fun takePendingRoute(): String')
    expect(mainActivitySource).toContain('uri.scheme != "kmoelite" || uri.host != "comic"')
    expect(mainActivitySource).toContain('return "/comic/$comicId"')
    expect(mainActivitySource).toContain('window.__kmoeliteAndroidPendingRoute = route')
    expect(mainActivitySource).toContain("window.history.pushState({}, '', route)")
    expect(mainActivitySource).toContain("window.dispatchEvent(new Event('popstate'))")
    expect(mainActivitySource).toContain("window.dispatchEvent(new CustomEvent('kmoelite-android-deep-link-route', { detail: route }))")
    expect(mainActivitySource).toContain('Regex("[A-Za-z0-9_-]{1,80}")')
    expect(appSource).toContain("if (typeof bridge?.takePendingRoute === 'function') return bridge.takePendingRoute() || undefined")
    expect(appSource).toContain('delete target.__kmoeliteAndroidPendingRoute')
    expect(appSource).toContain('delete (window as Window & { __kmoeliteAndroidPendingRoute?: string }).__kmoeliteAndroidPendingRoute')
  })
})

describe('Android file bridge', () => {
  it('shares only validated app-owned files through Android FileProvider', () => {
    expect(mainActivitySource).toContain('webView.addJavascriptInterface(AndroidFileBridge(this), "KmoeliteAndroidFile")')
    expect(mainActivitySource).toContain('@JavascriptInterface')
    expect(mainActivitySource).toContain('FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)')
    expect(mainActivitySource).toContain('Intent.ACTION_SEND')
    expect(mainActivitySource).toContain('val chooser = Intent.createChooser(sendIntent, "导出文件")')
    expect(mainActivitySource).toContain('chooser.resolveActivity(activity.packageManager)')
    expect(mainActivitySource).toContain('Intent.FLAG_GRANT_READ_URI_PERMISSION')
    expect(mainActivitySource).toContain('return "error:invalid-file"')
    expect(mainActivitySource).toContain('return "error:no-share-target"')
    expect(mainActivitySource).toContain('catch (error: Exception)')
    expect(mainActivitySource).toContain('activity.filesDir.canonicalFile')
    expect(mainActivitySource).toContain('activity.cacheDir.canonicalFile')
    expect(mainActivitySource).toContain('file.path.startsWith(root.path + File.separator)')
  })

  it('exposes a debug-only app-private share smoke through the same bridge', () => {
    expect(mainActivitySource).toContain('fun shareDebugTempFile(): String')
    expect(mainActivitySource).toContain('if (!BuildConfig.DEBUG) return "error:debug-only"')
    expect(mainActivitySource).toContain('File(activity.cacheDir, "share-smoke")')
    expect(mainActivitySource).toContain('File(dir, "kmoelite-share-smoke.txt")')
    expect(mainActivitySource).toContain('shareValidatedFile(file.canonicalFile)')
  })
})

describe('Android file export boundary', () => {
  it('limits FileProvider sharing roots to app-owned files and cache directories', () => {
    expect(androidFilePathsSource).toContain('<files-path name="app_files" path="." />')
    expect(androidFilePathsSource).toContain('<cache-path name="app_cache" path="." />')
    expect(androidFilePathsSource).not.toContain('<external-path')
  })
})
