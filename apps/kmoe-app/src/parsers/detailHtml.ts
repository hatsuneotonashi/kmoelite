import type { ComicDetail } from '../types/domain'
import { absoluteKmoeUrl, extractComicIdFromUrl, stripHtml } from './common'

export function parseComicDetailHtml(html: string, fallbackUrl = ''): ComicDetail {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const titleText = doc.querySelector('title')?.textContent ?? ''
  const url = fallbackUrl || doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
  const bookIdInput =
    doc.querySelector<HTMLInputElement>('input[name="bookid"]')?.value ||
    doc.querySelector<HTMLInputElement>('input#bookid')?.value ||
    html.match(/bookid["']?\s+value=["']?([A-Za-z0-9]+)/)?.[1] ||
    html.match(/value=["']?([A-Za-z0-9]+)["']?\s+name=["']?bookid/)?.[1] ||
    ''
  const id = extractComicIdFromUrl(url || bookIdInput)
  const coverUrl =
    doc.querySelector('meta[name="og:image"]')?.getAttribute('content') ??
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ??
    doc.querySelector('img.img_book')?.getAttribute('src') ??
    undefined

  const title = (doc.querySelector('.text_bglight_big')?.textContent || titleText.split(':')[0] || '').trim()
  const detailRoot = findDetailRoot(doc)
  const detailBlocks = detailTextBlocks(detailRoot)
  const allText = stripHtml(doc.body?.innerHTML ?? html)
  const aliasLine = findAliasLine(detailBlocks, title)
  const metadataText = normalizeDetailText(visibleText(detailRoot) || allText)

  return {
    id,
    url: absoluteKmoeUrl(url || `/c/${id}.htm`),
    title,
    aliases: parseAliases(aliasLine, title),
    coverUrl: coverUrl ? absoluteKmoeUrl(coverUrl) : undefined,
    authors: parseAuthors(detailRoot, metadataText),
    status: parseMetadataField(metadataText, '狀態', ['地區', '語言', '最後出版', '更新', '版本', '訂閱', '收藏', '讀過', '热度', '熱度']),
    region: parseMetadataField(metadataText, '地區', ['語言', '最後出版', '更新', '版本', '訂閱', '收藏', '讀過', '热度', '熱度']),
    language: parseMetadataField(metadataText, '語言', ['最後出版', '更新', '版本', '訂閱', '收藏', '讀過', '热度', '熱度', '分類']),
    categories: parseCategories(detailRoot, metadataText),
    tags: parseTags(doc),
    rating: parseScore(doc, metadataText),
    heat: parseHeat(metadataText),
    description: parseDescription(html, doc),
    quotaHint: parseQuotaHint(allText),
    isRestricted: /Lv2|Lv3|真實驗證|VIP|屏蔽|里區/.test(allText),
    downloadOptions: []
  }
}

export function extractBookDataPath(html: string): string | undefined {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const attrCandidate = Array.from(doc.querySelectorAll('[src], [href]'))
    .map((node) => node.getAttribute('src') || node.getAttribute('href') || '')
    .find((value) => value.includes('/book_data.php?h='))
  return normalizeBookDataPath(attrCandidate) ?? normalizeBookDataPath(html)
}

function normalizeBookDataPath(input: string | undefined): string | undefined {
  if (!input) return undefined
  const decoded = input.replace(/&amp;/g, '&')
  const match = decoded.match(/\/book_data\.php\?h=[A-Za-z0-9_-]+(?:&[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]+)*/)
  return match?.[0]
}

const DETAIL_NOISE_PATTERN = /(訂閱|订阅|收藏|讀過|读过|VOTE|全分類|全部分類|维护者|維護者|扫者|掃者|水印|屏蔽|請訪問|请访问|目前可用額度|目前可用额度|評論|评论|下載|下载|上傳|上传|管理)/

function findDetailRoot(doc: Document): ParentNode {
  const titleElement = doc.querySelector('.text_bglight_big')
  return titleElement?.closest('td.author') ?? titleElement?.closest('td') ?? titleElement?.parentElement ?? doc.body ?? doc
}

function detailTextBlocks(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('.text_bglight'))
    .filter((node) => !node.querySelector('.text_bglight_big'))
    .map((node) => normalizeDetailText(visibleText(node)))
    .filter(Boolean)
}

function findAliasLine(blocks: string[], title: string): string {
  return blocks.find((block) =>
    block !== title &&
    !DETAIL_NOISE_PATTERN.test(block) &&
    !/(作者|狀態|状态|地區|地区|語言|语言|最後出版|更新|版本|熱度|热度|分類|分类)[:：]/.test(block)
  ) ?? ''
}

function parseAuthors(root: ParentNode, metadataText: string): string[] {
  const authorBlock = findDetailBlockByLabel(root, '作者')
  const authorLinks = authorBlock
    ? uniqueCleanList(Array.from(authorBlock.querySelectorAll('a[href*="list.php?s="]'))
        .filter(isVisibleElement)
        .map((node) => cleanMetadataValue(visibleText(node))))
    : []
  if (authorLinks.length) return authorLinks

  const labeledAuthors = parseMetadataField(metadataText, '作者', ['狀態', '状态', '地區', '地区', '語言', '语言', '最後出版', '更新', '版本', '訂閱', '收藏'])
  if (labeledAuthors) {
    return splitCleanList(labeledAuthors)
  }
  return uniqueCleanList(Array.from(root.querySelectorAll('a[href*="list.php?s="]'))
    .filter(isVisibleElement)
    .map((node) => cleanMetadataValue(visibleText(node))))
    .slice(0, 8)
}

function findDetailBlockByLabel(root: ParentNode, label: string): Element | undefined {
  return Array.from(root.querySelectorAll('.text_bglight'))
    .find((node) => normalizeDetailText(visibleText(node)).startsWith(`${label}：`) || normalizeDetailText(visibleText(node)).startsWith(`${label}:`))
}

function uniqueCleanList(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values
    .filter((value): value is string => Boolean(value && !DETAIL_NOISE_PATTERN.test(value)))
  ))
}

function parseAliases(aliasLine: string, title: string): string[] {
  return aliasLine
    .replace(/\)\s+/g, '),')
    .replace(title, '')
    .split(/[　,，]/)
    .map((value) => value.trim().replace(/[()]/g, ''))
    .filter(Boolean)
}

function parseCategories(root: ParentNode, metadataText: string): string[] {
  const categoryBlock = findDetailBlockByLabel(root, '分類')
  if (categoryBlock) {
    const categories = uniqueCleanList(Array.from(categoryBlock.querySelectorAll('font'))
      .filter((node) => isVisibleElement(node) && isCategoryNode(node))
      .map((node) => cleanMetadataValue(ownText(node))))
    if (categories.length) return categories.slice(0, 12)

    const labeledCategories = parseMetadataField(normalizeDetailText(visibleText(categoryBlock)), '分類', [])
    if (labeledCategories) {
      const fallbackCategories = splitCleanList(labeledCategories)
      if (fallbackCategories.length) return fallbackCategories
    }
  }

  const labeledCategories = parseMetadataField(metadataText, '分類', ['VOTE', '目前可用額度', '目前可用额度', '下載', '下载', '評論', '评论', '維護', '维护'])
  if (labeledCategories) {
    const categories = splitCleanList(labeledCategories)
    if (categories.length) return categories
  }

  return uniqueCleanList(Array.from(root.querySelectorAll('font'))
    .filter((node) => isVisibleElement(node) && isCategoryNode(node))
    .map((node) => cleanMetadataValue(ownText(node))))
    .slice(0, 12)
}

function isCategoryNode(node: Element): boolean {
  return node.getAttribute('color')?.toLowerCase() === '#000000' || node.classList.contains('status')
}

function parseTags(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('.hd_logo'))
    .map((node) => node.textContent?.replace(/[\[\]]/g, '').trim())
    .filter((value): value is string => Boolean(value))
}

function parseScore(doc: Document, text: string): string | undefined {
  const scorePanelText = normalizeDetailText(visibleText(doc.querySelector('.book_score')))
  const panelScore = scorePanelText.match(/^([0-9]+(?:\.[0-9]+)?)\s*分/)?.[1]
  if (panelScore) return panelScore
  return text.match(/評價[:：]\s*([0-9.]+)/)?.[1] ?? text.match(/评分[:：]\s*([0-9.]+)/)?.[1]
}

function parseHeat(text: string): string | undefined {
  return text.match(/熱度[:：]?\s*([0-9]+)/)?.[1]
}

export function parseDescription(html: string, doc = new DOMParser().parseFromString(html, 'text/html')): string | undefined {
  const scriptedDescription = extractAssignedDescriptionHtml(html)
  if (scriptedDescription) return cleanDescriptionHtml(scriptedDescription)

  const directDescription = doc.querySelector('#div_desc_content')?.innerHTML
  const cleanedDirectDescription = directDescription ? cleanDescriptionHtml(directDescription) : undefined
  if (cleanedDirectDescription && !/請訪問\s+https?:\/\//.test(cleanedDirectDescription)) return cleanedDirectDescription

  const labeledCandidate = Array.from(doc.querySelectorAll('td, div, font'))
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .find((text) =>
      /^簡介[:：]/.test(text) &&
      !/(分類[:：]|評價[:：]|熱度[:：]|作者[:：]|狀態[:：]|地區[:：]|語言[:：]|訂閱[:：])/.test(text)
    )
  return labeledCandidate ? cleanDescriptionText(labeledCandidate.replace(/^簡介[:：]\s*/, '')) : undefined
}

function extractAssignedDescriptionHtml(html: string): string | undefined {
  const match = html.match(/document\.getElementById\(\s*["']div_desc_content["']\s*\)\.innerHTML\s*=\s*("(?:(?:\\.|[^"\\])*)"|'(?:(?:\\.|[^'\\])*)')/)
  if (!match) return undefined
  return decodeJsStringLiteral(match[1])
}

function decodeJsStringLiteral(literal: string): string | undefined {
  const quote = literal[0]
  const raw = literal.slice(1, -1)
  if (quote === '"') {
    try {
      return JSON.parse(literal) as string
    } catch {
      return raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
  }
  return raw
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
}

function cleanDescriptionHtml(input: string): string | undefined {
  const normalizedBreaks = input.replace(/<br\s*\/?>/gi, '\n')
  const text = new DOMParser().parseFromString(`<body>${normalizedBreaks}</body>`, 'text/html').body.textContent ?? ''
  return cleanDescriptionText(text)
}

function cleanDescriptionText(input: string): string | undefined {
  const value = input
    .replace(/\u00a0/g, ' ')
    .replace(/　/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s*(?:【[^】]{1,40}】)?\s*\d{1,3}-\d{1,3}\s*$/g, '')
    .replace(/\s*【[^】]*(?:卷|話|话)[^】]*】\s*$/g, '')
    .replace(/^簡介[:：]\s*/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !DETAIL_NOISE_PATTERN.test(line))
    .join('\n')
    .trim()
  if (!value || /請訪問\s+https?:\/\//.test(value)) return undefined
  return value
}

function parseQuotaHint(text: string): string | undefined {
  return cleanMetadataValue(text.match(/目前可用額度\s*[:：]\s*([^。；;\n]+?)(?:\s+(?:VIP|下載|下载|訂閱|收藏|讀過|分類)|$)/)?.[1])
}

function normalizeDetailText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMetadataField(text: string, label: string, nextLabels: string[]): string | undefined {
  const labelPattern = `${escapeRegExp(label)}\\s*[:：]\\s*`
  const match = text.match(new RegExp(labelPattern))
  if (!match || match.index === undefined) return undefined
  const start = match.index + match[0].length
  const tail = text.slice(start)
  const boundaryPattern = nextLabels
    .map((next) => `${escapeRegExp(next)}\\s*[:：]?`)
    .join('|')
  const boundary = boundaryPattern ? tail.search(new RegExp(boundaryPattern)) : -1
  const rawValue = boundary >= 0 ? tail.slice(0, boundary) : tail
  return cleanMetadataValue(rawValue)
}

function cleanMetadataValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  const noiseIndex = value.search(DETAIL_NOISE_PATTERN)
  const trimmed = (noiseIndex >= 0 ? value.slice(0, noiseIndex) : value)
    .replace(/[｜|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:：,，;；/]+|[\s:：,，;；/]+$/g, '')
    .trim()
  return trimmed || undefined
}

function splitCleanList(value: string): string[] {
  return Array.from(new Set(
    value
      .replace(/\([^)]*\)/g, '')
      .split(/[,\uFF0C、/|｜\s]+/)
      .map((item) => cleanMetadataValue(item))
      .filter((item): item is string => Boolean(item && !DETAIL_NOISE_PATTERN.test(item)))
  )).slice(0, 12)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function visibleText(node: Node | null | undefined): string {
  if (!node) return ''
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''

  const element = node as Element
  if (!isVisibleElement(element)) return ''
  if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return ''
  if (element.tagName === 'BR') return ' '
  return Array.from(element.childNodes).map((child) => visibleText(child)).join(' ')
}

function ownText(element: Element): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent ?? '')
    .join(' ')
}

function isVisibleElement(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (/\bdisplay\s*:\s*none\b/i.test(current.getAttribute('style') ?? '')) return false
    current = current.parentElement
  }
  return true
}
