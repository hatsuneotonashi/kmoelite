import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readerCss = [
  readFileSync('src/styles/detail.css', 'utf8'),
  readFileSync('src/styles/liquid-glass.css', 'utf8'),
  readFileSync('src/styles/reader-panels.css', 'utf8'),
  readFileSync('src/styles/reader.css', 'utf8')
].join('\n')

describe('Reader rendering performance CSS', () => {
  it('lets continuous reader pages skip off-screen rendering when the webview supports it', () => {
    expect(readerCss).toContain('.reader-continuous-page')
    expect(readerCss).toContain('.reader-continuous-spacer')
    expect(readerCss).toMatch(/content-visibility:\s*auto/)
    expect(readerCss).toMatch(/contain:\s*layout paint style/)
    expect(readerCss).toMatch(/contain-intrinsic-size:\s*780px 1080px/)
    expect(readerCss).toMatch(/--reader-spacer-size/)
  })

  it('does not dim non-current spread images or reference missing reader animations', () => {
    const mutedZoomShell = readerCss.match(/\.reader-zoom-shell\[data-muted="true"\]\s*\{[^}]*\}/)?.[0] ?? ''
    const pageImageRule = readerCss.match(/\.reader-page-image\s*\{[^}]*\}/)?.[0] ?? ''
    const pageAnimationRules = [
      'reader-page-enter',
      'reader-page-slide-forward',
      'reader-page-slide-back',
      'reader-page-curl-forward',
      'reader-page-curl-back',
      'reader-page-fade'
    ].map((name) => readerCss.match(new RegExp(`@keyframes\\s+${name}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] ?? '').join('\n')

    expect(mutedZoomShell).not.toMatch(/opacity:\s*\.72/)
    expect(pageImageRule).toContain('box-shadow: none')
    expect(pageImageRule).not.toContain('filter')
    expect(pageAnimationRules).not.toMatch(/filter:/)
    expect(pageAnimationRules).not.toMatch(/opacity:/)
    expect(readerCss).toMatch(/@keyframes\s+reader-page-slide-forward/)
    expect(readerCss).toMatch(/@keyframes\s+reader-page-curl-forward/)
    expect(readerCss).toMatch(/@keyframes\s+reader-page-fade/)
    expect(readerCss).toContain('[data-page-animation="curl"]')
    expect(readerCss).toMatch(/@keyframes\s+reader-controls-enter/)
  })

  it('keeps paged reader surfaces stable when chrome or panels are toggled', () => {
    expect(readerCss).toContain('--reader-stage-padding-top')
    expect(readerCss).toContain('--reader-stage-padding-bottom')
    expect(readerCss).toContain('height: calc(100dvh - var(--reader-stage-padding-top) - var(--reader-stage-padding-bottom))')
    expect(readerCss).not.toContain('max(108px')
    expect(readerCss).not.toContain('max(114px')
    expect(readerCss).not.toContain('max(164px')
    expect(readerCss).not.toContain('max(168px')
    expect(readerCss).toContain('width: auto')
    expect(readerCss).toContain('height: auto')
    expect(readerCss).toContain('container-type: size')
    expect(readerCss).toContain('.reader-page-single .reader-page-image[data-rotated-axis="true"]')
    expect(readerCss).toContain('100cqh')
    expect(readerCss).toContain('100cqw')
    expect(readerCss).toContain('place-items: center end')
    expect(readerCss).toContain('place-items: center start')
    expect(readerCss).toContain('@keyframes reader-panel-scrim-enter')
    expect(readerCss).not.toContain('height: calc(100dvh - 96px)')
  })

  it('keeps Reader chrome separated into compact HUD groups', () => {
    const bottomBarRule = readerCss.match(/\.reader-bottombar\s*\{[^}]*\}/)?.[0] ?? ''
    const bottomBarEnter = readerCss.match(/@keyframes\s+reader-bottombar-enter\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    const hiddenChromeRule = readerCss.match(/\.reader-topbar\[data-visible="false"\],[\s\S]*?\.reader-bottombar\[data-visible="false"\]\s*\{[^}]*\}/)?.[0] ?? ''
    const panelScrimRule = readerCss.match(/\.reader-panel-scrim\s*\{[^}]*\}/)?.[0] ?? ''

    expect(readerCss).toContain('.reader-topbar-actions')
    expect(readerCss).toContain('.reader-title-chip')
    expect(readerCss).toContain('.reader-bottom-details')
    expect(readerCss).toContain('.reader-chapter-navigation')
    expect(readerCss).toMatch(/@keyframes\s+reader-topbar-enter/)
    expect(readerCss).toMatch(/@keyframes\s+reader-bottombar-enter/)
    expect(readerCss).toContain('.reader-topbar[data-visible="false"]')
    expect(readerCss).toContain('.reader-bottombar[data-visible="false"]')
    expect(readerCss).toContain('transition:')
    expect(readerCss).toContain('.reader-topbar .liquid-button[aria-expanded="true"]')
    expect(hiddenChromeRule).not.toContain('filter')
    expect(panelScrimRule).toContain('background: transparent')
    expect(panelScrimRule).not.toContain('backdrop-filter')
    expect(bottomBarRule).toContain('margin-inline: auto')
    expect(bottomBarRule).not.toContain('translateX(-50%)')
    expect(bottomBarEnter).not.toContain('translate3d')
    expect(bottomBarEnter).not.toContain('transform:')
  })

  it('keeps detail and download surfaces adaptive for light and dark system modes', () => {
    const detailRule = readerCss.match(/\.detail-reading-page\s*\{[^}]*\}/)?.[0] ?? ''
    const moreMenuRule = readerCss.match(/\.detail-more-menu\s*\{[^}]*\}/)?.[0] ?? ''
    const directoryItemRule = readerCss.match(/\.reading-directory-item\s*\{[^}]*\}/)?.[0] ?? ''
    const downloadPanelRule = readerCss.match(/\.download-mode-panel\s*\{[^}]*\}/)?.[0] ?? ''
    const shellCoverThemeRule = readerCss.match(/html\[data-detail-cover-theme="true"\]\s*\{[^}]*\}/)?.[0] ?? ''
    const themedSidebarRule = readerCss.match(/html\[data-detail-cover-theme="true"\]\s+\.glass-sidebar\s*\{[^}]*\}/)?.[0] ?? ''
    const coverThemeRule = readerCss.match(/\.detail-reading-page\[data-cover-theme="true"\]\s*\{[^}]*\}/)?.[0] ?? ''

    expect(detailRule).toContain('--detail-card: var(--app-card-strong)')
    expect(detailRule).toContain('color: var(--app-fg)')
    expect(moreMenuRule).toContain('background: var(--detail-card)')
    expect(directoryItemRule).toContain('background: var(--detail-row)')
    expect(downloadPanelRule).toContain('background: var(--detail-card)')
    expect(shellCoverThemeRule).toContain('--app-fg: #ffffff')
    expect(shellCoverThemeRule).toContain('--cover-sidebar')
    expect(themedSidebarRule).toContain('var(--cover-sidebar')
    expect(coverThemeRule).toContain('color: white')
    expect(detailRule).not.toMatch(/#F5F5F7|#fff|#1d1d1f/)
  })
})
