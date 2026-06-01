import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { compactPaginationItems } from '../catalog/pagination'
import { CatalogPagination } from '../components/ui/CatalogPagination'

describe('CatalogPagination', () => {
  it('builds compact page ranges with ellipses', () => {
    expect(compactPaginationItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    expect(compactPaginationItems(2, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('hides when total pages are unknown', () => {
    const { container } = render(<CatalogPagination page={1} onPageChange={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('disables boundary actions and emits page changes', () => {
    const onPageChange = vi.fn()
    render(<CatalogPagination page={1} totalPages={3} onPageChange={onPageChange} />)

    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: '第 3 页' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })
})
