import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KmoeApi } from '../api/KmoeApi'
import { CategoriesPage } from '../pages/CategoriesPage'
import type { CatalogQuery } from '../types/domain'
import { sampleCatalog } from './fixtures/domainSamples'

const api = vi.hoisted(() => ({
  search: vi.fn()
}))

vi.mock('../hooks/useKmoeApi', () => ({
  useKmoeApi: () => api as unknown as KmoeApi
}))

describe('CategoriesPage pagination', () => {
  beforeEach(() => {
    api.search.mockReset()
    api.search.mockImplementation(async (query: CatalogQuery) => ({
      items: sampleCatalog,
      page: query.page,
      totalPages: 4,
      source: 'data_list' as const
    }))
  })

  it('uses URL page state and pages category results', async () => {
    renderPage('/categories?category=%E9%AD%94%E5%B9%BB&page=2')

    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ category: '魔幻', page: 2 })))
    fireEvent.click(await screen.findByRole('button', { name: '下一页' }))
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ category: '魔幻', page: 3 })))
  })

  it('resets page to one when filters change', async () => {
    renderPage('/categories?category=%E9%AD%94%E5%B9%BB&page=3')

    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ category: '魔幻', page: 3 })))
    fireEvent.click(screen.getAllByRole('button', { name: '冒險' })[0])
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ category: '冒險', page: 1 })))
  })
})

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CategoriesPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
