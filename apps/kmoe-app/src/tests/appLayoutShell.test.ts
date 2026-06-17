import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appLayoutSource = readFileSync('src/layouts/AppLayout.tsx', 'utf8')
const appCss = readFileSync('src/styles/liquid-glass.css', 'utf8')

describe('AppLayout shell scrolling contract', () => {
  it('keeps desktop and tablet sidebars fixed while only the main pane scrolls', () => {
    expect(appLayoutSource).toContain("const shellViewportClass = 'h-dvh overflow-hidden'")
    expect(appLayoutSource).toContain('overflow-y-auto')
    expect(appLayoutSource).not.toContain("phoneLayout ? 'h-dvh overflow-hidden' : 'min-h-dvh'")
    expect(appCss).toMatch(/\.app-sidebar-nav\s*\{[^}]*overflow-y:\s*auto/)
    expect(appCss).toMatch(/\.glass-sidebar\s*\{[^}]*height:\s*100dvh/)
  })

  it('handles remote back navigation without changing desktop keyboard contracts', () => {
    expect(appLayoutSource).toContain("inputClass === 'remote' && isBackNavigationKey(event)")
    expect(appLayoutSource).toContain('navigate(-1)')
  })
})
