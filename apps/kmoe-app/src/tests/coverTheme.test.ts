import { describe, expect, it } from 'vitest'
import { sampleCoverThemePixels } from '../lib/coverTheme'

describe('cover theme sampling', () => {
  it('preserves warm cover hues instead of forcing them into a fixed accent', () => {
    const sampled = sampleCoverThemePixels([
      232, 136, 38, 255,
      228, 130, 32, 255,
      248, 238, 214, 255,
      31, 28, 24, 255
    ])

    expect(sampled).toBeDefined()
    expect(sampled?.r).toBeGreaterThan(sampled?.g ?? 0)
    expect(sampled?.g).toBeGreaterThan(sampled?.b ?? 0)
  })

  it('prefers saturated cover pixels over pale neutral pixels', () => {
    const sampled = sampleCoverThemePixels([
      236, 234, 230, 255,
      232, 231, 229, 255,
      22, 160, 110, 255,
      28, 150, 104, 255
    ])

    expect(sampled).toBeDefined()
    expect(sampled?.g).toBeGreaterThan(sampled?.r ?? 0)
    expect(sampled?.g).toBeGreaterThan(sampled?.b ?? 0)
  })

  it('uses the dominant cover color instead of a single accent pixel', () => {
    const sampled = sampleCoverThemePixels([
      76, 111, 128, 255,
      82, 116, 132, 255,
      73, 108, 126, 255,
      84, 118, 134, 255,
      236, 44, 58, 255
    ])

    expect(sampled).toBeDefined()
    expect(sampled?.b).toBeGreaterThan(sampled?.r ?? 0)
    expect(sampled?.g).toBeGreaterThan(sampled?.r ?? 0)
  })
})
