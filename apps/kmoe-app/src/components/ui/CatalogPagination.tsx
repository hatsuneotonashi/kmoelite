import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '../Button'
import { compactPaginationItems } from '../../catalog/pagination'

export function CatalogPagination({
  page,
  totalPages,
  isFetching = false,
  label = '漫画列表分页',
  className,
  onPageChange
}: {
  page: number
  totalPages?: number
  isFetching?: boolean
  label?: string
  className?: string
  onPageChange: (page: number) => void
}) {
  if (!totalPages || totalPages <= 1) return null

  const total = Math.max(1, Math.floor(totalPages))
  const current = Math.min(Math.max(1, Math.floor(page)), total)
  const canGoPrevious = current > 1
  const canGoNext = current < total
  const items = compactPaginationItems(current, total)

  return (
    <nav aria-label={label} className={clsx('glass-toolbar flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] p-2', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          aria-label="上一页"
          disabled={!canGoPrevious}
          onClick={() => canGoPrevious && onPageChange(current - 1)}
          className="h-10 px-3"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">上一页</span>
        </Button>
        <div className="flex min-w-0 flex-wrap items-center gap-1" aria-label="页码">
          {items.map((item, index) => {
            if (item === 'ellipsis') {
              return (
                <span key={`ellipsis-${index}`} className="inline-flex h-10 w-10 items-center justify-center text-[var(--app-muted)]" aria-hidden="true">
                  <MoreHorizontal className="h-4 w-4" />
                </span>
              )
            }
            const selected = item === current
            return (
              <Button
                key={item}
                type="button"
                variant={selected ? 'primary' : 'ghost'}
                aria-label={`第 ${item} 页`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => !selected && onPageChange(item)}
                className="h-10 min-w-10 px-3"
              >
                {item}
              </Button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="secondary"
          aria-label="下一页"
          disabled={!canGoNext}
          onClick={() => canGoNext && onPageChange(current + 1)}
          className="h-10 px-3"
        >
          <span className="hidden sm:inline">下一页</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="shrink-0 text-xs font-semibold text-[var(--app-muted)]" aria-live="polite">
        第 {current} / {total} 页{isFetching ? ' · 更新中' : ''}
      </div>
    </nav>
  )
}
