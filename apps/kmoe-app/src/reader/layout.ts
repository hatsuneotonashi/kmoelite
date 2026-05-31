import type { PageCacheRecord } from '../types/cache'
import type { ManualSpreadOverride, PageLayout, ReadingDirection } from '../types/reading'

export type ReaderSpreadReason =
  | 'single_layout'
  | 'auto_single_viewport'
  | 'manual_single'
  | 'manual_double'
  | 'cover_single'
  | 'wide_page'
  | 'wide_facing_page'
  | 'no_facing_page'
  | 'double_page'

export interface ReaderSpreadPlan {
  pageIndexes: number[]
  displayIndexes: number[]
  reason: ReaderSpreadReason
  spread: 'single' | 'double'
}

export interface PlanReaderSpreadInput {
  pages: PageCacheRecord[]
  pageIndex: number
  pageLayout: PageLayout
  direction: ReadingDirection
  viewportSupportsDouble: boolean
  manualOverrides?: Record<number, ManualSpreadOverride>
}

const WIDE_PAGE_RATIO = 1.18

export function planReaderSpread(input: PlanReaderSpreadInput): ReaderSpreadPlan {
  const pageIndexes = sortedAvailablePageIndexes(input.pages)
  const currentIndex = normalizeReaderSpreadPageIndex(input)
  const currentPage = input.pages.find((page) => page.pageIndex === currentIndex)
  const nextPageIndex = nextAvailablePageIndex(currentIndex, pageIndexes)
  const nextPage = input.pages.find((page) => page.pageIndex === nextPageIndex)
  const manualOverride = input.manualOverrides?.[currentIndex]

  if (manualOverride === 'force_single') return single(currentIndex, 'manual_single')
  if (manualOverride === 'force_double') {
    return nextPage
      ? double(currentIndex, nextPage.pageIndex, input.direction, 'manual_double')
      : single(currentIndex, 'no_facing_page')
  }
  if (input.pageLayout === 'single') return single(currentIndex, 'single_layout')
  if (input.pageLayout === 'auto_double' && !input.viewportSupportsDouble) return single(currentIndex, 'auto_single_viewport')
  if (currentIndex === 0) return single(currentIndex, 'cover_single')
  if (isWidePage(currentPage)) return single(currentIndex, 'wide_page')
  if (!nextPage) return single(currentIndex, 'no_facing_page')
  if (isWidePage(nextPage)) return single(currentIndex, 'wide_facing_page')

  return double(currentIndex, nextPage.pageIndex, input.direction, 'double_page')
}

export function normalizeReaderSpreadPageIndex(input: PlanReaderSpreadInput): number {
  const pageIndexes = sortedAvailablePageIndexes(input.pages)
  const currentIndex = clampToAvailablePage(input.pageIndex, pageIndexes)
  const currentPosition = pageIndexes.indexOf(currentIndex)
  const currentPage = input.pages.find((page) => page.pageIndex === currentIndex)
  const manualOverride = input.manualOverrides?.[currentIndex]

  if (manualOverride) return currentIndex
  if (currentPosition <= 0) return currentIndex

  const previousIndex = pageIndexes[currentPosition - 1]
  const previousPage = input.pages.find((page) => page.pageIndex === previousIndex)
  const previousOverride = input.manualOverrides?.[previousIndex]
  if (previousOverride === 'force_double' && !isWidePage(previousPage) && !isWidePage(currentPage)) {
    return previousIndex
  }
  if (input.pageLayout === 'single') return currentIndex
  if (input.pageLayout === 'auto_double' && !input.viewportSupportsDouble) return currentIndex
  if (currentPosition % 2 !== 0) return currentIndex
  if (!previousPage || previousOverride === 'force_single') return currentIndex
  if (isWidePage(previousPage) || isWidePage(currentPage)) return currentIndex

  return previousIndex
}

export function readerSpreadStep(plan: ReaderSpreadPlan): number {
  return Math.max(1, plan.pageIndexes.length)
}

export function readerLayoutLabel(layout: PageLayout, plan?: ReaderSpreadPlan): string {
  if (plan?.reason === 'manual_single') return '手动拆页'
  if (plan?.reason === 'manual_double') return '手动合页'
  if (layout === 'single') return '单页'
  if (layout === 'double') return plan?.spread === 'double' ? '双页' : '双页·单页显示'
  if (plan?.spread === 'double') return '双页'
  return '双页·单页显示'
}

export function readerSpreadPageLabel(plan: ReaderSpreadPlan, pageCount: number): string {
  if (plan.pageIndexes.length <= 1) return `第 ${Math.min(plan.pageIndexes[0] + 1, pageCount)} / ${pageCount} 页`
  const first = Math.min(...plan.pageIndexes) + 1
  const last = Math.max(...plan.pageIndexes) + 1
  return `第 ${first}-${last} / ${pageCount} 页`
}

function single(pageIndex: number, reason: ReaderSpreadReason): ReaderSpreadPlan {
  return {
    pageIndexes: [pageIndex],
    displayIndexes: [pageIndex],
    reason,
    spread: 'single'
  }
}

function double(
  leftPageIndex: number,
  rightPageIndex: number,
  direction: ReadingDirection,
  reason: ReaderSpreadReason
): ReaderSpreadPlan {
  const pageIndexesForSpread = [leftPageIndex, rightPageIndex]
  return {
    pageIndexes: pageIndexesForSpread,
    displayIndexes: direction === 'rtl' ? [...pageIndexesForSpread].reverse() : pageIndexesForSpread,
    reason,
    spread: 'double'
  }
}

function isWidePage(page?: PageCacheRecord): boolean {
  if (!page?.width || !page.height || page.height <= 0) return false
  return page.width / page.height >= WIDE_PAGE_RATIO
}

function sortedAvailablePageIndexes(pages: PageCacheRecord[]): number[] {
  return pages.map((page) => page.pageIndex).sort((left, right) => left - right)
}

function nextAvailablePageIndex(pageIndex: number, availablePageIndexes: number[]): number | undefined {
  const position = availablePageIndexes.indexOf(pageIndex)
  return position >= 0 ? availablePageIndexes[position + 1] : undefined
}

function clampToAvailablePage(pageIndex: number, availablePageIndexes: number[]): number {
  if (availablePageIndexes.length === 0) return 0
  const sorted = availablePageIndexes
  const clamped = Math.max(sorted[0], Math.min(Math.floor(pageIndex), sorted[sorted.length - 1]))
  return sorted.includes(clamped)
    ? clamped
    : sorted.reduce((best, current) => Math.abs(current - clamped) < Math.abs(best - clamped) ? current : best, sorted[0])
}
