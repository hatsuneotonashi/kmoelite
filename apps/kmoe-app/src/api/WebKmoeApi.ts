import type { KmoeApi } from './KmoeApi'
import type { CatalogPage, CatalogQuery, ComicDetail, DownloadFormat, DownloadTask, LoginInput, LoginResult, SessionState, UserProfile, VolumeDownloadOption } from '../types/domain'
import { KMOE_BASE_URL } from '../lib/config'
import { buildDownloadAuthorizeUrl } from '../parsers/downloadUrl'
import { parseDataList } from '../parsers/dataList'
import { extractBookDataPath, parseComicDetailHtml } from '../parsers/detailHtml'
import { parseVolInfo } from '../parsers/volInfo'
import { parseLinkInfo } from '../parsers/linkInfo'
import { parseUserProfileHtml } from '../parsers/userProfile'
import { makeOrderedDownloadTasks } from '../download/stateMachine'
import { isNativeUnavailable, nativeFetchBookData, nativeFetchComicDetailHtml, nativeFetchKmoeCatalog, nativeFetchUserProfileHtml, nativeKmoeLogin, nativeKmoeLogout } from '../platform/nativeCommands'

export class WebKmoeApi implements KmoeApi {
  async login(input: LoginInput): Promise<LoginResult> {
    const normalizedInput = { ...input, email: input.email.trim() }
    const native = await nativeKmoeLogin(normalizedInput)
    if (native.ok && native.value !== undefined) {
      const ok = isLoginOk(native.value)
      return {
        ok,
        message: ok ? '登录成功。' : decodeSiteMessage(native.value)
      }
    }
    if (!isNativeUnavailable(native)) return { ok: false, message: native.message }

    const body = new URLSearchParams()
    body.set('email', normalizedInput.email)
    body.set('passwd', normalizedInput.password)
    body.set('keepalive', 'on')

    const response = await fetch(`${KMOE_BASE_URL}/login_do.php`, {
      method: 'POST',
      body,
      credentials: 'include'
    })
    const text = await response.text()
    const ok = isLoginOk(text)
    return {
      ok,
      message: ok ? '登录成功。' : decodeSiteMessage(text)
    }
  }

  async logout(): Promise<void> {
    const native = await nativeKmoeLogout()
    if (native.ok) return
    if (!isNativeUnavailable(native)) throw new Error(native.message)

    await fetch(`${KMOE_BASE_URL}/logout.php`, { credentials: 'include' }).catch(() => undefined)
  }

  async getSession(): Promise<SessionState> {
    try {
      const user = await this.getUserProfile()
      const authenticated = Boolean(user.nickname || user.id || user.level || user.quotaNow !== undefined)
      return authenticated
        ? { authenticated, mode: 'live', user }
        : { authenticated: false, mode: 'live', error: '当前会话未登录或已过期。' }
    } catch (error) {
      return { authenticated: false, mode: 'live', error: error instanceof Error ? error.message : String(error) }
    }
  }

  async getCatalog(input: CatalogQuery): Promise<CatalogPage> {
    const native = await nativeFetchKmoeCatalog(input)
    if (native.ok && native.value !== undefined) {
      return parseDataList(native.value)
    }
    if (!isNativeUnavailable(native)) throw new Error(native.message)

    const url = new URL(`${KMOE_BASE_URL}/data_list.php`)
    const params = mapCatalogQuery(input)
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    })
    const response = await fetch(url, { credentials: 'include' })
    return parseDataList(await response.text())
  }

  async search(input: CatalogQuery): Promise<CatalogPage> {
    return this.getCatalog(input)
  }

  async getComicDetail(comicId: string): Promise<ComicDetail> {
    const nativeDetail = await nativeFetchComicDetailHtml(comicId)
    if (!nativeDetail.ok && !isNativeUnavailable(nativeDetail)) throw new Error(nativeDetail.message)
    const html =
      nativeDetail.value ??
      (await (await fetch(`${KMOE_BASE_URL}/c/${encodeURIComponent(comicId)}.htm`, { credentials: 'include' })).text())
    const detail = parseComicDetailHtml(html, `${KMOE_BASE_URL}/c/${comicId}.htm`)
    const bookDataPath = extractBookDataPath(html)
    if (bookDataPath) {
      const nativeBookData = await nativeFetchBookData(bookDataPath)
      if (!nativeBookData.ok && !isNativeUnavailable(nativeBookData)) throw new Error(nativeBookData.message)
      const bookData =
        nativeBookData.value ??
        (await (await fetch(`${KMOE_BASE_URL}${bookDataPath}`, { credentials: 'include' })).text())
      detail.downloadOptions = parseVolInfo(bookData, comicId)
      detail.relatedComics = parseLinkInfo(bookData)
    }
    return detail
  }

  async getDownloadOptions(comicId: string): Promise<VolumeDownloadOption[]> {
    return (await this.getComicDetail(comicId)).downloadOptions
  }

  async getUserProfile(): Promise<UserProfile> {
    const native = await nativeFetchUserProfileHtml()
    if (native.ok && native.value !== undefined) {
      return parseUserProfileHtml(native.value)
    }
    if (!isNativeUnavailable(native)) throw new Error(native.message)

    const response = await fetch(`${KMOE_BASE_URL}/my.php`, { credentials: 'include' })
    return parseUserProfileHtml(await response.text())
  }

  async createDownloadTasks(input: { comic: ComicDetail; selectedVolIds: string[]; format: DownloadFormat }): Promise<DownloadTask[]> {
    input.selectedVolIds.forEach((volId) => {
      buildDownloadAuthorizeUrl({ bookId: input.comic.id, volId, format: input.format, line: 0 })
    })
    return makeOrderedDownloadTasks(input)
  }
}

function mapCatalogQuery(input: CatalogQuery): Record<string, string | number | undefined> {
  const keyword = input.keyword?.trim()
  return {
    s: keyword || input.category,
    end: input.status,
    lang: input.language,
    blen: input.length,
    regn: input.region,
    by: input.sort,
    color: input.color ? 1 : undefined,
    hd: input.hd ? 1 : undefined,
    p: input.page
  }
}

function decodeSiteMessage(text: string): string {
  if (/display_codeinfo\(\s*["']m100["']|parent\.display_codeinfo\(\s*["']m100["']/.test(text)) return '登录成功。'
  if (text.includes('e400')) return '登录失败：站点没有接受这组邮箱和密码，请确认输入后重试。'
  if (/Forbidden/i.test(text)) return '站点拒绝访问或登录状态无效。'
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '请求失败，请稍后重试。'
}

function isLoginOk(text: string): boolean {
  return /do_call_action|location\.href|display_codeinfo\(\s*(?:""|["']m100["'])|parent\.display_codeinfo\(\s*["']m100["']/.test(text) && !/e400|e401|Forbidden/i.test(text)
}
