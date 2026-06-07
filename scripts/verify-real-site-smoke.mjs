#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises'

const baseUrl = new URL(process.env.KMOE_SMOKE_BASE_URL || 'https://kxo.moe')
const email = process.env.KMOE_SMOKE_EMAIL || ''
const password = process.env.KMOE_SMOKE_PASSWORD || ''
const detailId = process.env.KMOE_SMOKE_DETAIL_ID || '53339'
const timeoutMs = Number.parseInt(process.env.KMOE_SMOKE_TIMEOUT_MS || '15000', 10)
const minDelayMs = Number.parseInt(process.env.KMOE_SMOKE_MIN_DELAY_MS || '850', 10)
const includeBookData = process.env.KMOE_SMOKE_INCLUDE_BOOK_DATA !== '0'
const browserUserAgent = process.env.KMOE_SMOKE_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 KmoeClientSmoke/0.1'

const cookieJar = new Map()
let lastRequestAt = 0

if (!email || !password) {
  console.error('Missing KMOE_SMOKE_EMAIL or KMOE_SMOKE_PASSWORD. Credentials must be provided only at runtime.')
  process.exit(2)
}

try {
  assertSafeBase(baseUrl)
  assertRuntimeEmail(email)
  assertSafeId(detailId)

  const loginPage = await request('/login.php')
  assertStatus(loginPage, 'login page')
  assertContains(loginPage.text, /login|登錄|登录|email/i, 'login page markers')

  const form = new URLSearchParams()
  form.set('email', email)
  form.set('passwd', password)
  form.set('keepalive', 'on')
  const login = await request('/login_do.php', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      referer: new URL('/login.php', baseUrl).toString()
    },
    body: form
  })
  assertStatus(login, 'login POST')

  const profile = await request('/my.php')
  assertStatus(profile, 'profile')
  assertContains(profile.text, /KMOE\s*ID|登錄郵箱|登录邮箱|退出|logout/i, 'authenticated profile markers')

  const catalog = await request('/data_list.php?p=1')
  assertStatus(catalog, 'catalog')
  const catalogJson = parseJson(catalog.text, 'catalog JSON')
  const catalogCount = Array.isArray(catalogJson.data) ? catalogJson.data.length : 0
  if (catalogCount <= 0) throw new Error('catalog JSON returned no data items')

  const detail = await request(`/c/${detailId}.htm`)
  assertStatus(detail, 'detail')
  assertContains(detail.text, /book_data\.php|volinfo|下載|下载|download/i, 'detail markers')

  let bookDataStatus = 'skipped'
  let bookDataMarkers = false
  if (includeBookData) {
    const bookDataPath = extractBookDataPath(detail.text)
    if (bookDataPath) {
      const bookData = await request(bookDataPath)
      assertStatus(bookData, 'book data')
      bookDataStatus = String(bookData.status)
      bookDataMarkers = /volinfo|mobi|epub|zip|download/i.test(bookData.text)
    } else {
      bookDataStatus = 'not_found_in_detail'
    }
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl: baseUrl.origin,
    checked: ['login_page', 'login_post', 'profile', 'catalog', 'detail', includeBookData ? 'book_data' : 'book_data_skipped'],
    catalogItems: catalogCount,
    detailId,
    bookDataStatus,
    bookDataMarkers,
    forbiddenEndpointsCalled: false
  }, null, 2))
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    message: sanitizeError(error)
  }, null, 2))
  process.exit(1)
}

async function request(path, init = {}, redirects = 3) {
  assertSafePath(path)
  await throttle()

  const url = new URL(path, baseUrl)
  const headers = new Headers(init.headers || {})
  headers.set('user-agent', browserUserAgent)
  headers.set('accept', headers.get('accept') || 'text/html,application/json;q=0.9,*/*;q=0.8')
  headers.set('accept-language', headers.get('accept-language') || 'zh-CN,zh;q=0.9,en;q=0.8')
  const cookies = cookieHeader()
  if (cookies) headers.set('cookie', cookies)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000)
  try {
    const response = await fetch(url, {
      ...init,
      headers,
      redirect: 'manual',
      signal: controller.signal
    })
    storeCookies(response.headers)

    const location = response.headers.get('location')
    if (redirects > 0 && response.status >= 300 && response.status < 400 && location) {
      return request(new URL(location, url).toString(), { method: 'GET' }, redirects - 1)
    }

    return {
      status: response.status,
      url: url.toString(),
      text: await response.text()
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function throttle() {
  const elapsed = Date.now() - lastRequestAt
  const waitMs = Math.max(0, minDelayMs - elapsed)
  if (waitMs > 0) await delay(waitMs)
  lastRequestAt = Date.now()
}

function storeCookies(headers) {
  const setCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : splitSetCookie(headers.get('set-cookie'))
  for (const header of setCookies) {
    const pair = header.split(';')[0]
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    if (!name || /[\s;]/.test(name)) continue
    cookieJar.set(name, value)
  }
}

function splitSetCookie(value) {
  if (!value) return []
  return value.split(/,(?=\s*[^;,]+=)/g)
}

function cookieHeader() {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function extractBookDataPath(html) {
  const match = html.match(/["'](\/book_data\.php\?h=[^"']+)["']/i)
    || html.match(/(\/book_data\.php\?h=[^\s"'<>]+)/i)
  if (!match) return ''
  const path = match[1].replace(/&amp;/g, '&')
  if (!path.startsWith('/book_data.php?h=') || path.includes('..')) return ''
  return path
}

function parseJson(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} could not be parsed`)
  }
}

function assertStatus(response, label) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} returned HTTP ${response.status}`)
  }
}

function assertContains(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`${label} were not found`)
}

function assertSafeBase(url) {
  if (url.protocol !== 'https:') throw new Error('smoke base URL must use HTTPS')
  if (url.hostname !== 'kxo.moe' && url.hostname !== 'kmoe.moe') {
    throw new Error('smoke base URL must stay on the known Kmoe host')
  }
}

function assertSafePath(path) {
  const url = new URL(path, baseUrl)
  if (url.origin !== baseUrl.origin) throw new Error('cross-origin smoke request blocked')
  const lower = `${url.pathname}?${url.searchParams}`.toLowerCase()
  if (
    lower.includes('getdownurl.php')
    || lower.includes('batch=')
    || lower.includes('vip=9')
    || lower.includes('update_book.php')
    || lower.includes('mycomic.php')
    || lower.includes('delete')
    || lower.includes('upload')
  ) {
    throw new Error('unsafe smoke request blocked')
  }
}

function assertSafeId(value) {
  if (!/^[0-9]{1,12}$/.test(value)) throw new Error('KMOE_SMOKE_DETAIL_ID must be a numeric comic id')
}

function assertRuntimeEmail(value) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /[^\x20-\x7E]/.test(value)) {
    throw new Error('KMOE_SMOKE_EMAIL must be a plain email address supplied at runtime')
  }
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(email, '[redacted-email]')
    .replace(password, '[redacted-password]')
    .replace(/https:\/\/[^/\s]+\/getdownurl\.php[^\s]*/gi, '[redacted-download-url]')
}
