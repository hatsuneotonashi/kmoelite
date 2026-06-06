import type { DownloadFormat, VolumeDownloadOption } from '../types/domain'
import { mbToBytes } from '../lib/format'

export function parseVolInfo(input: string, comicId: string): VolumeDownloadOption[] {
  return extractVolInfoPayloads(input)
    .map((payload) => parseVolInfoLine(payload, comicId))
    .filter((option): option is VolumeDownloadOption => Boolean(option))
}

export function parseVolInfoLine(payload: string, comicId: string): VolumeDownloadOption | undefined {
  const fields = payload.split(',')
  const volId = fields[0]?.trim() || ''
  if (!/^[A-Za-z0-9]+$/.test(volId) || fields.length < 10) return undefined
  const type = fields[3]?.trim()
  const displayTitle = fields[5]?.trim() || fields[4]?.trim() || `Vol ${volId}`
  const sourceZip = mbToBytes(fields[8])
  const mobi = mbToBytes(fields[9])
  const epub = mbToBytes(fields[11])
  const sourceZipAvailable = Boolean(sourceZip) || hasFormatMetadata(fields[14])
  const mobiAvailable = Boolean(mobi) || hasFormatMetadata(fields[15])
  const epubAvailable = Boolean(epub) || hasFormatMetadata(fields[16])
  const availableFormats: DownloadFormat[] = []
  if (mobiAvailable) availableFormats.push('mobi')
  if (epubAvailable) availableFormats.push('epub')
  if (sourceZipAvailable) availableFormats.push('source_zip')

  return {
    id: `${comicId}-${volId}`,
    comicId,
    volId,
    title: displayTitle,
    displayTitle,
    kind: type === '單行本' || type === '卷' ? 'volume' : type === '話' ? 'chapter_group' : 'unknown',
    pageCount: toNumber(fields[6]),
    docPageCount: toNumber(fields[7]),
    sizes: {
      mobi,
      epub,
      sourceZip
    },
    availableFormats,
    restrictions: availableFormats.length ? [] : ['文檔製作中或暫不可下載']
  }
}

function extractVolInfoPayloads(input: string): string[] {
  if (!input.includes('volinfo=')) return []
  const pattern = /volinfo=([^"'\r\n<)]*)/g
  const payloads: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input))) {
    const payload = match[1]?.trim()
    if (payload) payloads.push(payload)
  }
  return payloads
}

function toNumber(input: string | undefined): number | undefined {
  const parsed = Number.parseInt(input ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function hasFormatMetadata(input: string | undefined): boolean {
  const value = input?.trim()
  return Boolean(value && !/^[-0.]+$/.test(value) && /\d{3,5}x\d{3,5}|\d{4}-\d{2}-\d{2}/.test(value))
}
