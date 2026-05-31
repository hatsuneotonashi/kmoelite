import { describe, expect, it } from 'vitest'
import {
  normalizeReaderSpreadPageIndex,
  planReaderSpread,
  readerLayoutLabel,
  readerSpreadPageLabel,
  readerSpreadStep
} from '../reader/layout'
import type { PageCacheRecord } from '../types/cache'

describe('reader layout planner', () => {
  it('keeps single layout as one page regardless of viewport', () => {
    const plan = planReaderSpread({
      pages: [page(0), page(1)],
      pageIndex: 1,
      pageLayout: 'single',
      direction: 'ltr',
      viewportSupportsDouble: true
    })

    expect(plan).toMatchObject({
      pageIndexes: [1],
      displayIndexes: [1],
      reason: 'single_layout',
      spread: 'single'
    })
    expect(readerSpreadStep(plan)).toBe(1)
    expect(readerLayoutLabel('single', plan)).toBe('单页')
  })

  it('uses auto single on phone-sized viewports', () => {
    const plan = planReaderSpread({
      pages: [page(0), page(1), page(2)],
      pageIndex: 1,
      pageLayout: 'auto_double',
      direction: 'rtl',
      viewportSupportsDouble: false
    })

    expect(plan).toMatchObject({
      pageIndexes: [1],
      reason: 'auto_single_viewport',
      spread: 'single'
    })
    expect(readerLayoutLabel('auto_double', plan)).toBe('双页·单页显示')
  })

  it('keeps the cover page single and pairs later pages in RTL display order', () => {
    const cover = planReaderSpread({
      pages: [page(0), page(1), page(2)],
      pageIndex: 0,
      pageLayout: 'auto_double',
      direction: 'rtl',
      viewportSupportsDouble: true
    })
    const spread = planReaderSpread({
      pages: [page(0), page(1), page(2)],
      pageIndex: 1,
      pageLayout: 'auto_double',
      direction: 'rtl',
      viewportSupportsDouble: true
    })

    expect(cover).toMatchObject({ pageIndexes: [0], reason: 'cover_single', spread: 'single' })
    expect(spread).toMatchObject({
      pageIndexes: [1, 2],
      displayIndexes: [2, 1],
      reason: 'double_page',
      spread: 'double'
    })
    expect(readerSpreadStep(spread)).toBe(2)
    expect(readerSpreadPageLabel(spread, 3)).toBe('第 2-3 / 3 页')
  })

  it('normalizes restored even pages to the previous spread anchor after the cover', () => {
    const input = {
      pages: [page(0), page(1), page(2), page(3), page(4)],
      pageIndex: 2,
      pageLayout: 'double' as const,
      direction: 'rtl' as const,
      viewportSupportsDouble: true
    }
    const spread = planReaderSpread(input)

    expect(normalizeReaderSpreadPageIndex(input)).toBe(1)
    expect(spread).toMatchObject({
      pageIndexes: [1, 2],
      displayIndexes: [2, 1],
      reason: 'double_page',
      spread: 'double'
    })
    expect(readerSpreadPageLabel(spread, 5)).toBe('第 2-3 / 5 页')
  })

  it('does not pair wide pages or a normal page with a wide facing page', () => {
    const wideCurrent = planReaderSpread({
      pages: [page(0), page(1, { width: 1800, height: 1000 }), page(2)],
      pageIndex: 1,
      pageLayout: 'double',
      direction: 'ltr',
      viewportSupportsDouble: true
    })
    const wideFacing = planReaderSpread({
      pages: [page(0), page(1), page(2, { width: 1800, height: 1000 })],
      pageIndex: 1,
      pageLayout: 'double',
      direction: 'ltr',
      viewportSupportsDouble: true
    })

    expect(wideCurrent).toMatchObject({ pageIndexes: [1], reason: 'wide_page', spread: 'single' })
    expect(wideFacing).toMatchObject({ pageIndexes: [1], reason: 'wide_facing_page', spread: 'single' })
    expect(readerLayoutLabel('double', wideFacing)).toBe('双页·单页显示')
  })

  it('supports manual split and merge overrides for the current page', () => {
    const manualSplit = planReaderSpread({
      pages: [page(0), page(1), page(2)],
      pageIndex: 1,
      pageLayout: 'double',
      direction: 'rtl',
      viewportSupportsDouble: true,
      manualOverrides: { 1: 'force_single' }
    })
    const manualMerge = planReaderSpread({
      pages: [page(0), page(1, { width: 1800, height: 1000 }), page(2)],
      pageIndex: 1,
      pageLayout: 'auto_double',
      direction: 'rtl',
      viewportSupportsDouble: false,
      manualOverrides: { 1: 'force_double' }
    })

    expect(manualSplit).toMatchObject({
      pageIndexes: [1],
      reason: 'manual_single',
      spread: 'single'
    })
    expect(readerLayoutLabel('double', manualSplit)).toBe('手动拆页')
    expect(manualMerge).toMatchObject({
      pageIndexes: [1, 2],
      displayIndexes: [2, 1],
      reason: 'manual_double',
      spread: 'double'
    })
    expect(readerSpreadStep(manualMerge)).toBe(2)
    expect(readerLayoutLabel('auto_double', manualMerge)).toBe('手动合页')
  })
})

function page(pageIndex: number, overrides?: Partial<PageCacheRecord>): PageCacheRecord {
  return {
    id: `page-${pageIndex}`,
    chapterCacheId: 'cache-53339-3089',
    comicId: '53339',
    volumeId: '3089',
    pageIndex,
    sizeBytes: 1024,
    createdAt: '2026-05-24T00:00:00.000Z',
    lastAccessedAt: '2026-05-24T00:00:00.000Z',
    ...overrides
  }
}
