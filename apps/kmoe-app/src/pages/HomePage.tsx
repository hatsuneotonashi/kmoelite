import { useEffect, useMemo, useRef } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { ComicCard } from '../components/ComicCard'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { ProgressBar } from '../components/ProgressBar'
import { PageHeader } from '../components/layout/PageHeader'
import { CatalogPagination } from '../components/ui/CatalogPagination'
import { FilterChips } from '../components/ui/FilterChips'
import { CatalogSkeleton } from '../components/ui/Skeletons'
import { clampCatalogPage, cleanCatalogQueryValue } from '../catalog/catalogQuery'
import { useKmoeApi } from '../hooks/useKmoeApi'
import { readableAppMessage } from '../lib/format'
import { resolveContinueReadingTarget } from '../reading/continueTarget'
import { useCacheStore } from '../store/cacheStore'
import { useReadingStore } from '../store/readingStore'

const chips = ['連載', '繁體', '魔幻', '冒險', '幽默']

export function HomePage() {
  const api = useKmoeApi()
  const progressById = useReadingStore((state) => state.progressById)
  const chaptersById = useCacheStore((state) => state.chaptersById)
  const [params, setSearchParams] = useSearchParams()
  const paramsKey = params.toString()
  const resultsRef = useRef<HTMLElement | null>(null)
  const homeState = useMemo(() => homeStateFromParams(params), [paramsKey])
  const { keyword, chip, page } = homeState
  const query = useMemo(
    () => ({
      keyword,
      status: chip === '連載' ? chip : undefined,
      language: chip === '繁體' ? chip : undefined,
      category: chip && chip !== '連載' && chip !== '繁體' ? chip : undefined,
      page
    }),
    [chip, keyword, page]
  )
  const catalog = useQuery({
    queryKey: ['catalog', query],
    queryFn: () => api.getCatalog(query),
    placeholderData: keepPreviousData
  })
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api.getSession(),
    retry: false,
    staleTime: 30_000
  })
  const accountLink = session.data?.authenticated ? '/account' : '/login'
  const accountButtonLabel = session.data?.authenticated ? '账号中心' : '登录账号'
  const continueReading = useMemo(() => Object.values(progressById)
    .filter((item) => !item.finished)
    .sort((left, right) => right.lastReadAt.localeCompare(left.lastReadAt))
    .slice(0, 3), [progressById])
  const cachedChapters = useMemo(() => Object.values(chaptersById), [chaptersById])
  const showCatalogSkeleton = !catalog.data && (catalog.isLoading || catalog.isFetching)

  useEffect(() => {
    const totalPages = catalog.data?.totalPages
    if (totalPages && page > totalPages) {
      updateHomeState({ ...homeState, page: totalPages }, { replace: true, scroll: false })
    }
  }, [catalog.data?.totalPages, homeState, page])

  function updateHomeState(next: HomeCatalogState, options: { replace?: boolean; scroll?: boolean } = {}) {
    setSearchParams(homeStateToParams(next), { replace: options.replace ?? true })
    if (options.scroll) scrollResultsIntoView(resultsRef.current)
  }

  return (
    <div className="content-grid">
      <PageHeader
        title="漫画浏览"
        description="发现漫画、查看详情，并把想下载的卷/话加入下载队列。"
      />

      <section className="home-search-panel glass-toolbar grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3">
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
          <input
            aria-label="搜索标题、作者、标签"
            value={keyword}
            onChange={(event) => updateHomeState({ ...homeState, keyword: event.target.value, page: 1 })}
            className="liquid-input h-12 w-full rounded-full pl-11 pr-4 outline-none phone-touch-target"
          />
        </label>
        <Link to={accountLink} className="home-account-action">
          <Button variant="primary" className="home-account-button w-full md:w-auto">{accountButtonLabel}</Button>
        </Link>
      </section>

      {continueReading.length > 0 ? (
        <section className="home-continue-panel glass-panel grid gap-3 rounded-[var(--radius-panel)] p-4">
          <div className="home-continue-head flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">继续阅读</h2>
              <p className="mt-1 text-sm text-[var(--app-muted)]">接着上次读到的位置继续。</p>
            </div>
            <Link to="/shelf">
              <Button variant="ghost">打开书架</Button>
            </Link>
          </div>
          <div className="home-continue-list grid gap-3" data-count={continueReading.length}>
            {continueReading.map((item) => (
              <Link key={item.id} to={resolveContinueReadingTarget(item, cachedChapters)} className="home-continue-tile metric-tile interactive-lift grid gap-2 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{item.comicTitle}</div>
                    <div className="mt-1 truncate text-xs text-[var(--app-muted)]">{item.volumeTitle}</div>
                  </div>
                  <Badge tone="info">{Math.round(item.progressPercent)}%</Badge>
                </div>
                <ProgressBar value={item.progressPercent} />
                <div className="truncate text-xs text-[var(--app-muted)]">
                  第 {item.pageIndex + 1}{item.pageCount ? ` / ${item.pageCount}` : ''} 页
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <FilterChips items={chips} value={chip} onChange={(nextChip) => updateHomeState({ ...homeState, chip: nextChip, page: 1 })} />
        <div className="text-sm text-[var(--app-muted)]">
          {catalog.data ? `第 ${catalog.data.page}${catalog.data.totalPages ? ` / ${catalog.data.totalPages}` : ''} 页` : '正在加载最新列表'}
        </div>
      </section>

      <section ref={resultsRef} className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">精选内容</h2>
            <p className="mt-1 text-sm text-[var(--app-muted)]">最近更新与高评分作品。</p>
          </div>
        </div>
        {showCatalogSkeleton ? <CatalogSkeleton /> : null}
        {catalog.isError ? (
          <EmptyState title="加载失败">
            <div className="grid gap-3">
              <span>{readableAppMessage(catalog.error, '暂时无法加载漫画列表，请检查网络后重试。')}</span>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="primary" onClick={() => void catalog.refetch()}>
                  重试
                </Button>
                <Link to="/shelf">
                  <Button type="button" variant="secondary">打开书架</Button>
                </Link>
                <Link to="/downloads">
                  <Button type="button" variant="ghost">查看下载</Button>
                </Link>
              </div>
            </div>
          </EmptyState>
        ) : null}
        {!catalog.isLoading && !catalog.isFetching && catalog.data && catalog.data.items.length === 0 ? <EmptyState title="没有匹配结果">调整搜索词或筛选条件。</EmptyState> : null}
        {catalog.data ? (
          <div className="catalog-grid">
            {catalog.data.items.map((comic) => (
              <ComicCard key={comic.id} comic={comic} />
            ))}
          </div>
        ) : null}
        <CatalogPagination
          page={catalog.data?.page ?? query.page}
          totalPages={catalog.data?.totalPages}
          isFetching={catalog.isFetching}
          onPageChange={(nextPage) => updateHomeState({ ...homeState, page: nextPage }, { replace: false, scroll: true })}
        />
      </section>
    </div>
  )
}

interface HomeCatalogState {
  keyword: string
  chip: string
  page: number
}

function homeStateFromParams(params: URLSearchParams): HomeCatalogState {
  return {
    keyword: cleanCatalogQueryValue(params.get('keyword')) ?? '',
    chip: cleanCatalogQueryValue(params.get('chip')) ?? '',
    page: clampCatalogPage(params.get('page') ?? 1)
  }
}

function homeStateToParams(state: HomeCatalogState): URLSearchParams {
  const params = new URLSearchParams()
  const keyword = cleanCatalogQueryValue(state.keyword)
  const chip = cleanCatalogQueryValue(state.chip)
  const page = clampCatalogPage(state.page)
  if (keyword) params.set('keyword', keyword)
  if (chip) params.set('chip', chip)
  if (page > 1) params.set('page', String(page))
  return params
}

function scrollResultsIntoView(element: HTMLElement | null) {
  const scroll = () => {
    element?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(scroll)
  } else {
    scroll()
  }
}
