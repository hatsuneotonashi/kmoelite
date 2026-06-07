export function extractComicIdFromUrl(url: string): string {
  const match = url.match(/\/c\/([A-Za-z0-9]+)(?:\.htm)?/)
  return match?.[1] ?? url
}

export function absoluteKmoeUrl(url: string, base = 'https://kxo.moe'): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#64;/g, '@')
    .replace(/\s+/g, ' ')
    .trim()
}

export function textAfterLabel(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escaped}\\s*[:：]?\\s*([^　\\n]+)`))
  return match?.[1]?.trim()
}

export function textBetweenLabels(text: string, label: string, nextLabels: string[]): string | undefined {
  const normalized = text.replace(/\s+/g, ' ')
  const start = normalized.indexOf(label)
  if (start < 0) return undefined
  const afterLabel = normalized.slice(start + label.length).replace(/^[:：]\s*/, '')
  const nextIndexes = nextLabels
    .map((next) => afterLabel.indexOf(next))
    .filter((index) => index >= 0)
  const end = nextIndexes.length ? Math.min(...nextIndexes) : afterLabel.length
  const value = afterLabel.slice(0, end).trim()
  return value || undefined
}
