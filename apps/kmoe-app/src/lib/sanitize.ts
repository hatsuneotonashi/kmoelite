const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

export function sanitizeFilename(input: string, fallback = 'untitled'): string {
  const normalized = input
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim()

  const base = normalized.length > 0 ? normalized : fallback
  const stem = base.split('.')[0]?.toUpperCase() ?? ''
  const safe = WINDOWS_RESERVED_NAMES.has(stem)
    ? base.includes('.')
      ? `_${base}`
      : `${base}_file`
    : base
  return safe.slice(0, 180)
}

export function containsPathTraversal(path: string): boolean {
  return path.split(/[\\/]+/).some((part) => part === '..')
}

export function preventPathTraversal(path: string): string {
  return path
    .split(/[\\/]+/)
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => sanitizeFilename(part))
    .join('/')
}

export function buildLocalFilename(input: {
  comicTitle: string
  volumeTitle: string
  format: string
  suffix?: number
}): string {
  const suffix = input.suffix ? ` (${input.suffix})` : ''
  return sanitizeFilename(`${input.comicTitle} - ${input.volumeTitle}${suffix}.${input.format}`)
}
