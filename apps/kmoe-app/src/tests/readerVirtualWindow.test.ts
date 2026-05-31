import { describe, expect, it } from 'vitest'
import { estimateContinuousPageSize, estimatePageIndexFromScroll, planReaderVirtualWindow } from '../reader/virtualWindow'

describe('reader virtual window planner', () => {
  it('renders only the active continuous window with leading and trailing spacer sizes', () => {
    const plan = planReaderVirtualWindow({
      pageCount: 120,
      pageIndex: 50,
      readingMode: 'vertical_scroll',
      viewportHeight: 1000
    })

    expect(plan.indexes[0]).toBe(47)
    expect(plan.indexes.at(-1)).toBe(56)
    expect(plan.indexes.length).toBeLessThan(120)
    expect(plan.leadingCount).toBe(47)
    expect(plan.trailingCount).toBe(63)
    expect(plan.leadingSize).toBe(plan.leadingCount * plan.estimatedPageSize)
    expect(plan.trailingSize).toBe(plan.trailingCount * plan.estimatedPageSize)
  })

  it('keeps webtoon and horizontal estimates stable enough for scroll position recovery', () => {
    expect(estimateContinuousPageSize({ readingMode: 'webtoon' })).toBeGreaterThan(600)
    expect(estimateContinuousPageSize({ readingMode: 'horizontal_scroll', viewportWidth: 1400 })).toBe(1008)
    expect(estimatePageIndexFromScroll({ scrollOffset: 1008 * 12, pageCount: 80, estimatedPageSize: 1008 })).toBe(12)
    expect(estimatePageIndexFromScroll({ scrollOffset: 1008 * 99, pageCount: 80, estimatedPageSize: 1008 })).toBe(79)
  })
})
