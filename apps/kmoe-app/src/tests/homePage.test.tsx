import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../pages/HomePage'
import type { KmoeApi } from '../api/KmoeApi'
import type { CatalogPage } from '../types/domain'
import { sampleCatalog } from './fixtures/domainSamples'
import { useReadingStore } from '../store/readingStore'
import type { ReadingProgress } from '../types/reading'

const api = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  getSession: vi.fn()
}))

vi.mock('../hooks/useKmoeApi', () => ({
  useKmoeApi: () => api as unknown as KmoeApi
}))

describe('HomePage', () => {
  beforeEach(() => {
    api.getCatalog.mockReset()
    api.getSession.mockReset()
    api.getSession.mockResolvedValue({ authenticated: false, mode: 'live' })
    useReadingStore.setState({ progressById: {}, history: [] })
  })

  it('keeps existing catalog cards visible during background refreshes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0
        }
      }
    })
    const catalogPage: CatalogPage = {
      items: sampleCatalog,
      page: 1,
      source: 'data_list'
    }
    queryClient.setQueryData(['catalog', {
      keyword: '',
      status: undefined,
      language: undefined,
      category: undefined,
      page: 1
    }], catalogPage)
    api.getCatalog.mockReturnValue(new Promise(() => {}))

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByRole('link', { name: '查看详情：尖帽子的魔法工房' })).toBeInTheDocument()
    expect(container.querySelector('.skeleton')).not.toBeInTheDocument()
  })

  it('shows continue reading without implementation storage wording', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })
    const progress: ReadingProgress = {
      id: '53339:3089',
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      volumeId: '3089',
      volumeTitle: '話 089-095',
      pageIndex: 12,
      pageCount: 94,
      progressPercent: 14,
      lastReadAt: '2026-05-30T12:00:00.000Z',
      finished: false,
      readingMode: 'paged',
      readingDirection: 'rtl',
      pageLayout: 'single'
    }
    useReadingStore.setState({ progressById: { [progress.id]: progress }, history: [] })
    api.getCatalog.mockResolvedValue({
      items: [],
      page: 1,
      source: 'data_list'
    } satisfies CatalogPage)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByRole('heading', { name: '继续阅读' })).toBeInTheDocument()
    expect(screen.getByText('接着上次读到的位置继续。')).toBeInTheDocument()
    expect(screen.queryByText(/SQLite|原生/)).not.toBeInTheDocument()
  })
})
