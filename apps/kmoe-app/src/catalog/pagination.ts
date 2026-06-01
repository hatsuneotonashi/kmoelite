export type PaginationItem = number | 'ellipsis'

export function compactPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  const total = Math.max(1, Math.floor(totalPages))
  const current = Math.min(Math.max(1, Math.floor(currentPage)), total)
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)

  const pages = new Set<number>([1, total])
  for (let page = current - 1; page <= current + 1; page += 1) {
    if (page > 1 && page < total) pages.add(page)
  }
  if (current <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }
  if (current >= total - 2) {
    pages.add(total - 1)
    pages.add(total - 2)
    pages.add(total - 3)
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((left, right) => left - right)
  const items: PaginationItem[] = []
  for (const page of sorted) {
    const previous = items[items.length - 1]
    if (typeof previous === 'number' && page - previous > 1) items.push('ellipsis')
    items.push(page)
  }
  return items
}
