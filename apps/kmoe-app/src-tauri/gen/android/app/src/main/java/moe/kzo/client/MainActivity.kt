package moe.kzo.client

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.MimeTypeMap
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import java.io.File

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  private var pendingRoute: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleDeepLinkIntent(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    appWebView = webView
    webView.addJavascriptInterface(AndroidFileBridge(this), "KmoeliteAndroidFile")
    webView.addJavascriptInterface(AndroidAppBridge(this), "KmoeliteAndroidApp")
    pendingRoute?.let { route -> navigateToAppRoute(route) }
  }

  override fun onNewIntent(intent: Intent) {
    setIntent(intent)
    if (handleDeepLinkIntent(intent)) return
    super.onNewIntent(intent)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN && dispatchRemoteKeyToWebView(event)) {
      return event.keyCode != KeyEvent.KEYCODE_DPAD_CENTER && event.keyCode != KeyEvent.KEYCODE_ENTER
    }
    return super.dispatchKeyEvent(event)
  }

  private fun dispatchRemoteKeyToWebView(event: KeyEvent): Boolean {
    val key = when (event.keyCode) {
      KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> RemoteKey("Enter", "Enter", 13)
      KeyEvent.KEYCODE_DPAD_LEFT -> RemoteKey("ArrowLeft", "ArrowLeft", 37)
      KeyEvent.KEYCODE_DPAD_UP -> RemoteKey("ArrowUp", "ArrowUp", 38)
      KeyEvent.KEYCODE_DPAD_RIGHT -> RemoteKey("ArrowRight", "ArrowRight", 39)
      KeyEvent.KEYCODE_DPAD_DOWN -> RemoteKey("ArrowDown", "ArrowDown", 40)
      else -> null
    } ?: return false

    appWebView?.post {
      appWebView?.evaluateJavascript(remoteKeyScript(key), null)
    }
    return true
  }

  private fun remoteKeyScript(key: RemoteKey): String {
    return """
      (() => {
        const target = document.activeElement || document.body || window;
        const event = new KeyboardEvent('keydown', {
          key: '${key.key}',
          code: '${key.code}',
          keyCode: ${key.keyCode},
          which: ${key.keyCode},
          bubbles: true,
          cancelable: true
        });
        target.dispatchEvent(event);
      })();
    """.trimIndent()
  }

  private fun handleDeepLinkIntent(intent: Intent?): Boolean {
    val route = routeFromDeepLink(intent) ?: return false
    navigateToAppRoute(route)
    return true
  }

  private fun routeFromDeepLink(intent: Intent?): String? {
    val uri = intent?.data ?: return null
    if (uri.scheme != "kmoelite" || uri.host != "comic") {
      return null
    }

    val comicId = uri.pathSegments.firstOrNull() ?: uri.getQueryParameter("id") ?: return null
    if (!isSafeRoutePart(comicId)) {
      return null
    }

    return "/comic/$comicId"
  }

  private fun navigateToAppRoute(route: String) {
    pendingRoute = route
    val webView = appWebView
    if (webView == null) return

    webView.post {
      webView.evaluateJavascript(appRouteScript(route), null)
    }
  }

  private fun appRouteScript(route: String): String {
    return """
      (() => {
        const route = '$route';
        window.__kmoeliteAndroidPendingRoute = route;
        if (window.location.pathname !== route) {
          window.history.pushState({}, '', route);
          window.dispatchEvent(new Event('popstate'));
        }
        window.dispatchEvent(new CustomEvent('kmoelite-android-deep-link-route', { detail: route }));
      })();
    """.trimIndent()
  }

  private fun isSafeRoutePart(value: String): Boolean {
    return value.matches(Regex("[A-Za-z0-9_-]{1,80}"))
  }

  fun takePendingRoute(): String {
    val route = pendingRoute ?: return ""
    pendingRoute = null
    return route
  }

  private data class RemoteKey(val key: String, val code: String, val keyCode: Int)
}

private class AndroidAppBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun takePendingRoute(): String {
    return activity.takePendingRoute()
  }
}

private class AndroidFileBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun shareFile(path: String?): String {
    return try {
      val file = validatedAppFile(path) ?: return "error:invalid-file"
      shareValidatedFile(file)
    } catch (error: Exception) {
      "error:${error.javaClass.simpleName.ifBlank { "share-failed" }}"
    }
  }

  @JavascriptInterface
  fun shareDebugTempFile(): String {
    if (!BuildConfig.DEBUG) return "error:debug-only"
    return try {
      val dir = File(activity.cacheDir, "share-smoke").apply { mkdirs() }
      val file = File(dir, "kmoelite-share-smoke.txt").apply {
        writeText("kmoelite Android share smoke\n")
      }
      shareValidatedFile(file.canonicalFile)
    } catch (error: Exception) {
      "error:${error.javaClass.simpleName.ifBlank { "share-failed" }}"
    }
  }

  private fun shareValidatedFile(file: File): String {
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
      type = mimeTypeFor(file)
      putExtra(Intent.EXTRA_STREAM, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(sendIntent, "导出文件")
    if (chooser.resolveActivity(activity.packageManager) == null) return "error:no-share-target"

    activity.runOnUiThread {
      activity.startActivity(chooser)
    }
    return "ok"
  }

  private fun validatedAppFile(path: String?): File? {
    if (path.isNullOrBlank()) return null
    val file = File(path).canonicalFile
    if (!file.isFile) return null

    val roots = listOf(activity.filesDir.canonicalFile, activity.cacheDir.canonicalFile)
    val allowed = roots.any { root ->
      file.path == root.path || file.path.startsWith(root.path + File.separator)
    }
    return if (allowed) file else null
  }

  private fun mimeTypeFor(file: File): String {
    val extension = file.extension.lowercase()
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "application/octet-stream"
  }
}
