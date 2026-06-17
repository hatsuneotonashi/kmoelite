package moe.kzo.client

import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    appWebView = webView
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

  private data class RemoteKey(val key: String, val code: String, val keyCode: Int)
}
