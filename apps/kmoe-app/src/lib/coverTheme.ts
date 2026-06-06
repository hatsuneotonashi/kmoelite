export interface CoverTheme {
  r: number
  g: number
  b: number
}

export function sampleCoverTheme(image: HTMLImageElement): CoverTheme | undefined {
  const canvas = document.createElement('canvas')
  canvas.width = 28
  canvas.height = 28
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return undefined
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return sampleCoverThemePixels(context.getImageData(0, 0, canvas.width, canvas.height).data)
  } catch {
    return undefined
  }
}

export function sampleCoverThemePixels(data: ArrayLike<number>): CoverTheme | undefined {
  const buckets = new Map<string, {
    count: number
    r: number
    g: number
    b: number
    saturation: number
    brightness: number
  }>()

  for (let index = 0; index < data.length; index += 4) {
    const alpha = (data[index + 3] ?? 255) / 255
    if (alpha < 0.82) continue
    const r = data[index] ?? 0
    const g = data[index + 1] ?? 0
    const b = data[index + 2] ?? 0
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max - min
    const brightness = (r + g + b) / 3
    if (saturation < 18 || brightness < 30 || brightness > 238) continue

    const key = `${quantizeChannel(r)}:${quantizeChannel(g)}:${quantizeChannel(b)}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.saturation += saturation
      bucket.brightness += brightness
    } else {
      buckets.set(key, { count: 1, r, g, b, saturation, brightness })
    }
  }

  let best: CoverTheme | undefined
  let bestScore = -1
  for (const bucket of buckets.values()) {
    const saturation = bucket.saturation / bucket.count
    const brightness = bucket.brightness / bucket.count
    const brightnessWeight = 1 - Math.min(0.55, Math.abs(brightness - 132) / 220)
    const saturationWeight = 0.72 + Math.min(0.62, saturation / 180)
    const score = bucket.count * brightnessWeight * saturationWeight
    if (score > bestScore) {
      bestScore = score
      best = {
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count
      }
    }
  }
  return best ? normalizeCoverTheme(best) : undefined
}

export function fallbackCoverTheme(seed: string): CoverTheme {
  const palette: CoverTheme[] = [
    { r: 12, g: 111, b: 203 },
    { r: 168, g: 74, b: 54 },
    { r: 104, g: 92, b: 176 },
    { r: 25, g: 132, b: 100 },
    { r: 181, g: 126, b: 43 },
    { r: 160, g: 70, b: 112 }
  ]
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}

function normalizeCoverTheme(theme: CoverTheme): CoverTheme {
  const hsl = rgbToHsl(theme)
  return hslToRgb({
    h: hsl.h,
    s: clampNumber(hsl.s * 0.82 + 0.18, 0.38, 0.78),
    l: clampNumber(hsl.l * 0.38 + 0.20, 0.28, 0.48)
  })
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function quantizeChannel(value: number): number {
  return Math.round(value / 24) * 24
}

function rgbToHsl(theme: CoverTheme): { h: number; s: number; l: number } {
  const r = theme.r / 255
  const g = theme.g / 255
  const b = theme.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l }

  const delta = max - min
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h = 0
  if (max === r) {
    h = (g - b) / delta + (g < b ? 6 : 0)
  } else if (max === g) {
    h = (b - r) / delta + 2
  } else {
    h = (r - g) / delta + 4
  }

  return { h: h * 60, s, l }
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): CoverTheme {
  const normalizedHue = (((h % 360) + 360) % 360) / 360
  if (s === 0) {
    const channel = clampColorChannel(l * 255)
    return { r: channel, g: channel, b: channel }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: clampColorChannel(hueToRgb(p, q, normalizedHue + 1 / 3) * 255),
    g: clampColorChannel(hueToRgb(p, q, normalizedHue) * 255),
    b: clampColorChannel(hueToRgb(p, q, normalizedHue - 1 / 3) * 255)
  }
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t
  if (value < 0) value += 1
  if (value > 1) value -= 1
  if (value < 1 / 6) return p + (q - p) * 6 * value
  if (value < 1 / 2) return q
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
  return p
}
