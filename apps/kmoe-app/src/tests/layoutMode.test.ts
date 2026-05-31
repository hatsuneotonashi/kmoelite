import { describe, expect, it } from 'vitest'
import { getLayoutMode, getPlatformLayoutModel } from '../hooks/useLayoutMode'

describe('layout mode', () => {
  it('keeps compact iPad windows in tablet mode instead of phone mode', () => {
    expect(getLayoutMode(430, 'ipados')).toBe('tabletCompact')
    expect(getLayoutMode(430, 'ios')).toBe('phone')
    expect(getLayoutMode(844, 'ios')).toBe('phone')
  })

  it('uses tablet and desktop breakpoints for larger surfaces', () => {
    expect(getLayoutMode(834, 'ipados')).toBe('tablet')
    expect(getLayoutMode(1366, 'ipados')).toBe('tablet')
    expect(getLayoutMode(1440, 'macos')).toBe('desktop')
  })

  it('keeps desktop runtimes in desktop contracts even when the window is narrow', () => {
    expect(getPlatformLayoutModel({ width: 620, platform: 'macos' })).toMatchObject({
      layoutMode: 'desktop',
      layoutContract: 'macDesktop',
      deviceClass: 'desktop',
      windowClass: 'compact',
      inputClass: 'pointer',
      runtimeClass: 'macos'
    })
    expect(getPlatformLayoutModel({ width: 720, platform: 'windows' })).toMatchObject({
      layoutMode: 'desktop',
      layoutContract: 'windowsDesktop',
      deviceClass: 'desktop',
      windowClass: 'compact',
      runtimeClass: 'windows'
    })
  })

  it('classifies the required phone, tablet, desktop, and touch scenarios', () => {
    expect(getPlatformLayoutModel({ width: 390, platform: 'ios', maxTouchPoints: 5 })).toMatchObject({
      layoutMode: 'phone',
      layoutContract: 'phone',
      deviceClass: 'phone',
      inputClass: 'touch'
    })
    expect(getPlatformLayoutModel({ width: 834, platform: 'ipados', maxTouchPoints: 5 })).toMatchObject({
      layoutMode: 'tablet',
      layoutContract: 'tablet',
      deviceClass: 'tablet',
      inputClass: 'hybrid'
    })
    expect(getPlatformLayoutModel({ width: 507, platform: 'ipados', maxTouchPoints: 5 })).toMatchObject({
      layoutMode: 'tabletCompact',
      layoutContract: 'tabletCompact',
      deviceClass: 'tablet'
    })
    expect(getPlatformLayoutModel({ width: 1366, platform: 'ipados', maxTouchPoints: 5 })).toMatchObject({
      layoutMode: 'tablet',
      windowClass: 'wide'
    })
    expect(getPlatformLayoutModel({ width: 1366, platform: 'macos' })).toMatchObject({
      layoutContract: 'macDesktop',
      windowClass: 'wide'
    })
    expect(getPlatformLayoutModel({ width: 1366, platform: 'windows' })).toMatchObject({
      layoutContract: 'windowsDesktop',
      windowClass: 'wide'
    })
    expect(getPlatformLayoutModel({ width: 1280, platform: 'linux' })).toMatchObject({
      layoutMode: 'desktop',
      layoutContract: 'desktop',
      runtimeClass: 'linux'
    })
    expect(getPlatformLayoutModel({ width: 900, platform: 'unknown', maxTouchPoints: 5, coarsePointer: true })).toMatchObject({
      layoutMode: 'tablet',
      deviceClass: 'tablet',
      inputClass: 'touch'
    })
  })
})
