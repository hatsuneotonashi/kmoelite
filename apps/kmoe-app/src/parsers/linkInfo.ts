import type { ComicListItem } from '../types/domain'
import { absoluteKmoeUrl, extractComicIdFromUrl } from './common'

export function parseLinkInfo(input: string): ComicListItem[] {
  return extractLinkInfoPayloads(input)
    .flatMap(parseLinkInfoLine)
}

function parseLinkInfoLine(payload: string): ComicListItem[] {
  const fields = payload.split(',').map((field) => field.trim()).filter(Boolean)
  if (fields.length >= 2 && fields.length % 2 === 0 && fields.every((field, index) => index % 2 === 1 || isComicIdLike(field))) {
    return parseLinkInfoPairs(fields)
  }

  const urlField = fields.find((field) => /\/c\/[A-Za-z0-9]+\.htm/.test(field))
  const id = fields.find((field) => /^[A-Za-z0-9]+$/.test(field) && /\d/.test(field)) ?? extractComicIdFromUrl(urlField ?? '')
  if (!id) return []

  const url = urlField ? absoluteKmoeUrl(urlField) : `https://kzo.moe/c/${id}.htm`
  const coverUrl = fields.find((field) => /^https?:\/\//.test(field) && /\.(jpg|jpeg|png|webp|gif)(!|$|\?)/i.test(field))
  const title =
    fields.find((field) => field !== id && field !== urlField && field !== coverUrl && !/^https?:\/\//.test(field) && !/^\d+(\.\d+)?$/.test(field)) ??
    `Comic ${id}`
  const score = fields.find((field) => /^\d+(\.\d+)?$/.test(field) && Number(field) <= 10)

  return [{
    id,
    title,
    url,
    coverUrl,
    score,
    tags: fields.filter((field) => ['連載', '完結', '繁體', '简体', '日本', '欧美'].includes(field)).slice(0, 4)
  }]
}

function parseLinkInfoPairs(fields: string[]): ComicListItem[] {
  const items: ComicListItem[] = []
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const id = fields[index]
    const title = fields[index + 1]
    if (!isComicIdLike(id) || !title) continue
    items.push({
      id,
      title,
      url: `https://kzo.moe/c/${id}.htm`,
      tags: []
    })
  }
  return items
}

function isComicIdLike(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value) && /\d/.test(value)
}

function extractLinkInfoPayloads(input: string): string[] {
  if (!input.includes('linkinfo=')) return []
  const pattern = /linkinfo=([^"'\r\n<)]*)/g
  const payloads: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input))) {
    const payload = match[1]?.trim()
    if (payload) payloads.push(payload)
  }
  return payloads
}
