import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KmoeApi } from '../api/KmoeApi'
import { SearchPage } from '../pages/SearchPage'
import type { CatalogQuery } from '../types/domain'
import { sampleCatalog } from './fixtures/domainSamples'

const api = vi.hoisted(() => ({
  search: vi.fn()
}))

vi.mock('../hooks/useKmoeApi', () => ({
  useKmoeApi: () => api as unknown as KmoeApi
}))

describe('SearchPage pagination', () => {
  beforeEach(() => {
    api.search.mockReset()
    api.search.mockImplementation(async (query: CatalogQuery) => ({
      items: sampleCatalog,
      page: query.page,
      totalPages: 5,
      source: 'data_list' as const
    }))
  })

  it('keeps filters while moving between result pages', async () => {
    renderPage('/search?keyword=%E9%AD%94%E6%B3%95&page=2')

    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '魔法', page: 2 })))
    fireEvent.click(await screen.findByRole('button', { name: '下一页' }))
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '魔法', page: 3 })))
  })

  it('resets to page one when a filter changes', async () => {
    renderPage('/search?keyword=%E9%AD%94%E6%B3%95&page=4')

    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '魔法', page: 4 })))
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: '冒險' } })
    await waitFor(() => expect(api.search).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '魔法', category: '冒險', page: 1 })), { timeout: 1200 })
  })
})

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SearchPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
