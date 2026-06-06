import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('shows up to six recent continue-reading items in a stable grid', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })
    const progress = Array.from({ length: 7 }, (_, index): ReadingProgress => ({
      id: `comic-${index + 1}:vol-1`,
      comicId: `comic-${index + 1}`,
      comicTitle: `继续阅读 ${index + 1}`,
      volumeId: 'vol-1',
      volumeTitle: `超长章节标题 ${index + 1}`,
      pageIndex: 1200 + index,
      pageCount: 2400 + index,
      progressPercent: 20 + index,
      lastReadAt: `2026-05-30T12:0${6 - index}:00.000Z`,
      finished: false,
      readingMode: 'paged',
      readingDirection: 'rtl',
      pageLayout: 'single'
    }))
    useReadingStore.setState({
      progressById: Object.fromEntries(progress.map((item) => [item.id, item])),
      history: []
    })
    api.getCatalog.mockResolvedValue({
      items: [],
      page: 1,
      source: 'data_list'
    } satisfies CatalogPage)

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByRole('heading', { name: '继续阅读' })).toBeInTheDocument()
    expect(container.querySelector('.home-continue-list')).toHaveAttribute('data-count', '6')
    expect(screen.getByText('继续阅读 1')).toBeInTheDocument()
    expect(screen.getByText('继续阅读 6')).toBeInTheDocument()
    expect(screen.queryByText('继续阅读 7')).not.toBeInTheDocument()
    expect(screen.getByText('第 1201 / 2400 页')).toHaveClass('home-continue-page')
  })

  it('paginates catalog results through URL-backed state', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })
    api.getCatalog.mockImplementation(async (query) => ({
      items: sampleCatalog,
      page: query.page,
      totalPages: 3,
      source: 'data_list'
    } satisfies CatalogPage))

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => expect(api.getCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })))
    fireEvent.click(await screen.findByRole('button', { name: '下一页' }))
    await waitFor(() => expect(api.getCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })
})
