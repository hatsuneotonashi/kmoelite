import type { DownloadAuthorizeInput, DownloadFormat, DownloadScope } from '../types/domain'

const FORMAT_TYPE: Record<DownloadFormat, 0 | 1 | 2> = {
  source_zip: 0,
  mobi: 1,
  epub: 2
}

export const DOWNLOAD_AUTHORIZE_LINES = [0, 1] as const

export type DownloadAuthorizeFallbackInput = Omit<DownloadAuthorizeInput, 'line'> & {
  line?: number
}

export function buildDownloadAuthorizeUrl(input: DownloadAuthorizeInput): string {
  assertDownloadAuthorizeInput(input.bookId, input.volId, input.line)
  const type = FORMAT_TYPE[input.format]
  return `/getdownurl.php?b=${encodeURIComponent(input.bookId)}&v=${encodeURIComponent(input.volId)}&mobi=${type}&vip=${input.line}&json=1`
}

export function buildDownloadAuthorizeUrlFallbacks(input: DownloadAuthorizeFallbackInput): string[] {
  const preferredLine = input.line ?? DOWNLOAD_AUTHORIZE_LINES[0]
  assertDownloadAuthorizeInput(input.bookId, input.volId, preferredLine)
  return [preferredLine, ...DOWNLOAD_AUTHORIZE_LINES.filter((line) => line !== preferredLine)].map((line) =>
    buildDownloadAuthorizeUrl({ ...input, line })
  )
}

export function assertDownloadAuthorizeInput(bookId: string, volId: string, line: number): void {
  if (!/^[A-Za-z0-9]+$/.test(bookId)) {
    throw new Error('Invalid book id')
  }
  if (!/^[A-Za-z0-9]+$/.test(volId)) {
    throw new Error('Invalid vol id')
  }
  if (!Number.isInteger(line) || line < 0 || line > 1) {
    throw new Error('Invalid download line')
  }
}

export function classifyDownloadScope(url: string): DownloadScope {
  const params = new URLSearchParams(url.split('?')[1] ?? '')
  if (params.has('batch')) return 'batch'
  if (params.get('vip') === '9') return 'whole_comic'
  const vol = params.get('v') ?? ''
  if (vol.includes(',') || vol.includes('|')) return 'batch'
  return vol ? 'single_volume' : 'unknown'
}
