import type { ComicListItem } from '../types/domain'
import { absoluteKmoeUrl, extractComicIdFromUrl } from './common'

export function parseDesktopListHtml(html: string): ComicListItem[] {
  const calls = html.match(/disp_divinfo\(([\s\S]*?)\);/g) ?? []
  return calls.map(parseDispDivInfoCall).filter((item): item is ComicListItem => Boolean(item))
}

function parseDispDivInfoCall(call: string): ComicListItem | undefined {
  const args = readJsStringArgs(call)
  if (args.length < 12) return undefined
  const url = absoluteKmoeUrl(args[1] ?? '')
  const id = extractComicIdFromUrl(url)
  return {
    id,
    url,
    coverUrl: args[2] ? absoluteKmoeUrl(args[2]) : undefined,
    title: args[9] || `Kmoe ${id}`,
    author: args[10],
    score: args[8],
    status: args[11],
    region: args[5],
    language: args[6],
    lastUpdate: args[12],
    tags: [args[5], args[6], args[7], args[11]].filter(Boolean)
  }
}

function readJsStringArgs(call: string): string[] {
  const args: string[] = []
  const pattern = /'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(call))) {
    args.push(decodeJsString(match[1] ?? match[2] ?? ''))
  }
  return args
}

function decodeJsString(value: string): string {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\(['"\\/bfnrt])/g, (_, char: string) => {
      const escapes: Record<string, string> = {
        "'": "'",
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t'
      }
      return escapes[char] ?? char
    })
}
