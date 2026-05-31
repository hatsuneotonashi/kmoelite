import type { CatalogPage, ComicListItem } from '../types/domain'
import { absoluteKmoeUrl, extractComicIdFromUrl } from './common'

interface RawDataListItem {
  status?: string
  lang?: string
  url_book?: string
  url_cover?: string
  newvol?: string
  name?: string
  author?: string
  score?: string
  lastupdate?: string
}

interface RawDataListResponse {
  uin?: string
  total?: number
  totalpage?: number
  nowcount?: number
  nowpage?: number
  data?: RawDataListItem[]
}

export function parseDataList(input: string | RawDataListResponse): CatalogPage {
  const raw: RawDataListResponse = typeof input === 'string' ? JSON.parse(input) : input
  const items = Array.isArray(raw.data) ? raw.data.map(parseDataListItem).filter(Boolean) : []

  return {
    items,
    page: Number(raw.nowpage) || 1,
    totalPages: Number(raw.totalpage) || undefined,
    totalItems: Number(raw.total) || undefined,
    source: 'data_list'
  }
}

function parseDataListItem(item: RawDataListItem): ComicListItem {
  const url = absoluteKmoeUrl(item.url_book ?? '')
  const id = extractComicIdFromUrl(url)
  const status = cleanInlineText(item.status)
  const language = cleanInlineText(item.lang)
  const latestVolume = cleanInlineText(item.newvol)
  const tags = [status, language, latestVolume].filter((value): value is string => Boolean(value))

  return {
    id,
    title: cleanInlineText(item.name) || `Kmoe ${id}`,
    url,
    coverUrl: item.url_cover ? absoluteKmoeUrl(item.url_cover) : undefined,
    author: cleanInlineText(item.author),
    status,
    language,
    score: item.score,
    latestVolume,
    lastUpdate: cleanInlineText(item.lastupdate),
    tags
  }
}

function cleanInlineText(value?: string): string | undefined {
  const cleaned = value
    ?.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#64;/g, '@')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || undefined
}
