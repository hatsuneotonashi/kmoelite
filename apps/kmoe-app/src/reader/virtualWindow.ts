import type { ReadingMode } from '../types/reading'

export interface ReaderVirtualWindowInput {
  pageCount: number
  pageIndex: number
  readingMode: ReadingMode
  viewportWidth?: number
  viewportHeight?: number
}

export interface ReaderVirtualWindowPlan {
  indexes: number[]
  startIndex: number
  endIndex: number
  leadingCount: number
  trailingCount: number
  estimatedPageSize: number
  leadingSize: number
  trailingSize: number
}

const VERTICAL_PAGE_ESTIMATE = 860
const WEBTOON_PAGE_ESTIMATE = 720
const MIN_HORIZONTAL_PAGE_ESTIMATE = 560

export function planReaderVirtualWindow(input: ReaderVirtualWindowInput): ReaderVirtualWindowPlan {
  const pageCount = Math.max(0, Math.floor(input.pageCount))
  const pageIndex = clamp(Math.floor(input.pageIndex), 0, Math.max(0, pageCount - 1))
  const estimatedPageSize = estimateContinuousPageSize(input)
  if (pageCount === 0) {
    return {
      indexes: [],
      startIndex: 0,
      endIndex: -1,
      leadingCount: 0,
      trailingCount: 0,
      estimatedPageSize,
      leadingSize: 0,
      trailingSize: 0
    }
  }

  const before = input.readingMode === 'webtoon' ? 4 : 3
  const after = input.readingMode === 'webtoon' ? 8 : 6
  const startIndex = clamp(pageIndex - before, 0, pageCount - 1)
  const endIndex = clamp(pageIndex + after, startIndex, pageCount - 1)
  const indexes = Array.from({ length: endIndex - startIndex + 1 }, (_item, offset) => startIndex + offset)
  const leadingCount = startIndex
  const trailingCount = Math.max(0, pageCount - endIndex - 1)

  return {
    indexes,
    startIndex,
    endIndex,
    leadingCount,
    trailingCount,
    estimatedPageSize,
    leadingSize: leadingCount * estimatedPageSize,
    trailingSize: trailingCount * estimatedPageSize
  }
}

export function estimateContinuousPageSize(input: Pick<ReaderVirtualWindowInput, 'readingMode' | 'viewportWidth' | 'viewportHeight'>): number {
  if (input.readingMode === 'horizontal_scroll') {
    return Math.max(MIN_HORIZONTAL_PAGE_ESTIMATE, Math.round((input.viewportWidth ?? 1280) * 0.72))
  }
  if (input.readingMode === 'webtoon') return WEBTOON_PAGE_ESTIMATE
  return Math.max(640, Math.min(980, Math.round((input.viewportHeight ?? VERTICAL_PAGE_ESTIMATE) * 0.82)))
}

export function estimatePageIndexFromScroll(input: {
  scrollOffset: number
  pageCount: number
  estimatedPageSize: number
}): number {
  if (input.pageCount <= 0 || input.estimatedPageSize <= 0) return 0
  return clamp(Math.round(input.scrollOffset / input.estimatedPageSize), 0, input.pageCount - 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}
