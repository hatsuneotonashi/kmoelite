import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebKmoeApi } from '../api/WebKmoeApi'

const nativeMocks = vi.hoisted(() => ({
  nativeFetchBookData: vi.fn(),
  nativeFetchComicDetailHtml: vi.fn(),
  nativeFetchKmoeCatalog: vi.fn(),
  nativeFetchUserProfileHtml: vi.fn(),
  nativeKmoeLogin: vi.fn()
}))

vi.mock('../platform/nativeCommands', () => ({
  nativeFetchBookData: nativeMocks.nativeFetchBookData,
  nativeFetchComicDetailHtml: nativeMocks.nativeFetchComicDetailHtml,
  nativeFetchKmoeCatalog: nativeMocks.nativeFetchKmoeCatalog,
  nativeFetchUserProfileHtml: nativeMocks.nativeFetchUserProfileHtml,
  nativeKmoeLogin: nativeMocks.nativeKmoeLogin,
  isNativeUnavailable: (result: { available: boolean }) => !result.available,
  nativeKmoeLogout: () => Promise.resolve({ ok: false, available: false, message: 'Native command unavailable in test.' })
}))

describe('WebKmoeApi native error handling', () => {
  afterEach(() => {
    nativeMocks.nativeFetchBookData.mockReset()
    nativeMocks.nativeFetchComicDetailHtml.mockReset()
    nativeMocks.nativeFetchKmoeCatalog.mockReset()
    nativeMocks.nativeFetchUserProfileHtml.mockReset()
    nativeMocks.nativeKmoeLogin.mockReset()
    vi.unstubAllGlobals()
  })

  it('does not fall back to browser fetch when a Tauri native catalog command fails', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    nativeMocks.nativeFetchKmoeCatalog.mockResolvedValue({
      ok: false,
      available: true,
      message: 'native catalog request failed'
    })

    await expect(api().getCatalog({ page: 1 })).rejects.toThrow('native catalog request failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the site search parameter for catalog keywords in browser fallback', async () => {
    nativeMocks.nativeFetchKmoeCatalog.mockResolvedValue({
      ok: false,
      available: false,
      message: 'native unavailable'
    })
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({
        nowpage: 1,
        data: [{
          url_book: '/c/10100.htm',
          name: '<b>鬼滅</b>之刃'
        }]
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api().search({ page: 1, keyword: ' 鬼滅之刃 ', sort: 'sortpoint' })).resolves.toMatchObject({
      items: [{ title: '鬼滅之刃' }]
    })

    const requestedUrl = fetchMock.mock.calls[0][0] as URL
    expect(requestedUrl.pathname).toBe('/data_list.php')
    expect(requestedUrl.searchParams.get('s')).toBe('鬼滅之刃')
    expect(requestedUrl.searchParams.has('k')).toBe(false)
  })

  it('reports native login command failures as login failures without browser fallback', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    nativeMocks.nativeKmoeLogin.mockResolvedValue({
      ok: false,
      available: true,
      message: 'native login request failed'
    })

    await expect(api().login({ email: 'user@example.invalid', password: 'secret' })).resolves.toEqual({
      ok: false,
      message: 'native login request failed'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts the current site m100 login success response', async () => {
    nativeMocks.nativeKmoeLogin.mockResolvedValue({
      ok: true,
      available: true,
      value: 'parent.display_codeinfo( "m100", 0 );',
      message: 'login response'
    })

    await expect(api().login({ email: 'user@example.invalid', password: 'secret', remember: true })).resolves.toEqual({
      ok: true,
      message: '登录成功。'
    })
  })

  it('does not fall back to browser fetch when a Tauri native detail command fails', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    nativeMocks.nativeFetchComicDetailHtml.mockResolvedValue({
      ok: false,
      available: true,
      message: 'native detail request failed'
    })

    await expect(api().getComicDetail('53339')).rejects.toThrow('native detail request failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fall back to browser fetch when native book_data fails after detail HTML is read', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    nativeMocks.nativeFetchComicDetailHtml.mockResolvedValue({
      ok: true,
      available: true,
      value: [
        '<html>',
        '<head><title>尖帽子的魔法工房 : Kmoe</title></head>',
        '<body>',
        '<div class="text_bglight_big">尖帽子的魔法工房</div>',
        '<script src="/book_data.php?h=abc123"></script>',
        '</body>',
        '</html>'
      ].join(''),
      message: 'detail ok'
    })
    nativeMocks.nativeFetchBookData.mockResolvedValue({
      ok: false,
      available: true,
      message: 'native book_data request failed'
    })

    await expect(api().getComicDetail('53339')).rejects.toThrow('native book_data request failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fall back to browser fetch when a Tauri native profile command fails', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    nativeMocks.nativeFetchUserProfileHtml.mockResolvedValue({
      ok: false,
      available: true,
      message: 'native profile request failed'
    })

    await expect(api().getUserProfile()).rejects.toThrow('native profile request failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function api() {
  return new WebKmoeApi()
}
