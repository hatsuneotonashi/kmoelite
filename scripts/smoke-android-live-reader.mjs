#!/usr/bin/env node
import http from 'node:http'

const port = Number(process.env.ANDROID_DEVTOOLS_PORT || 9222)
const email = process.env.KMOE_SMOKE_EMAIL || ''
const password = process.env.KMOE_SMOKE_PASSWORD || ''
const comicId = process.env.ANDROID_READER_COMIC_ID || '53339'
const volumeText = process.env.ANDROID_READER_VOLUME_TEXT || '089-095'

if (!email || !password) fail('missing-runtime-credentials')
if (!/^[A-Za-z0-9_-]{1,80}$/.test(comicId)) fail('unsafe-comic-id')
if (volumeText.length > 120) fail('unsafe-volume-text')

const ws = await connectDebugger()
let id = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  message.error ? reject(new Error(message.error.message)) : resolve(message.result)
})
await send('Runtime.enable')
await waitFor(`() => document.readyState === 'complete' && !!document.body`, 30_000)
const login = await evaluate(`(async () => {
  try {
    await window.__TAURI_INTERNALS__.invoke('kmoe_login', { input: { email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)}, remember: false } });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
})()`, 60_000)
if (!login?.ok) throw new Error(`login-failed ${login?.error || 'unknown'}`)
await evaluate(`location.href = '/'; true`)
await waitFor(`() => document.readyState === 'complete' && !!document.body`, 30_000)
await evaluate(`history.pushState({}, '', '/comic/${comicId}'); dispatchEvent(new Event('popstate')); true`)
await waitFor(`() => [...document.querySelectorAll('article.reading-directory-item')].some((item) => item.innerText.includes(${JSON.stringify(volumeText)}))`, 70_000)
await evaluate(`(() => {
  const article = [...document.querySelectorAll('article.reading-directory-item')].find((item) => item.innerText.includes(${JSON.stringify(volumeText)}));
  const button = [...article.querySelectorAll('button:not(:disabled)')].find((item) => item.innerText.includes('获取 EPUB') || item.innerText.includes('阅读'));
  if (!button) throw new Error('target read button not found');
  button.click();
  return true;
})()`)
await waitFor(`() => location.pathname.startsWith('/reader/cache/') || document.body.innerText.includes('下载仍在进行') || document.body.innerText.includes('阅读准备失败')`, 180_000, 1000)
let state = await evaluate(`({ path: location.pathname, text: document.body.innerText.slice(0, 1200), imageCount: document.images.length })`)
if (!state.path.startsWith('/reader/cache/')) {
  throw new Error(`reader-not-opened path=${state.path} text=${state.text.replace(/\s+/g, ' ').slice(0, 180)}`)
}
await waitFor(`() => document.querySelectorAll('img.reader-page-image').length > 0`, 30_000, 500)
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight', code:'ArrowRight', keyCode:39, which:39, bubbles:true })); true`)
await delay(1000)
state = await evaluate(`({ path: location.pathname, imageCount: document.querySelectorAll('img.reader-page-image').length })`)
console.log(`android_live_reader=passed comic=${comicId} volume=${volumeText} path=${state.path} images=${state.imageCount}`)
ws.close()

async function connectDebugger() {
  const pages = await getJson('/json/list')
  const page = pages.find((item) => item.webSocketDebuggerUrl)
  if (!page?.webSocketDebuggerUrl) fail('missing-webview-debugger')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  return socket
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (response) => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { data += chunk })
      response.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}

function send(method, params = {}) {
  const callId = ++id
  ws.send(JSON.stringify({ id: callId, method, params }))
  return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }))
}

async function evaluate(expression, timeout = 30_000) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluation-failed')
  }
  return result.result?.value
}

async function waitFor(source, timeoutMs, intervalMs = 500) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await evaluate(`Boolean((${source})())`).catch(() => false)
    if (ok) return
    await delay(intervalMs)
  }
  const state = await evaluate(`({ path: location.pathname, text: document.body.innerText.slice(0, 300) })`).catch(() => ({}))
  throw new Error(`timeout state=${JSON.stringify(state)}`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fail(reason) {
  console.error(`android_live_reader=failed reason=${reason}`)
  process.exit(1)
}
