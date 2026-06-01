import { useEffect, useMemo, useRef } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Flame, Sparkles } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ComicCard } from '../components/ComicCard'
import { EmptyState } from '../components/EmptyState'
import { CatalogPagination } from '../components/ui/CatalogPagination'
import { CatalogSkeleton } from '../components/ui/Skeletons'
import { catalogQueryToParams, clampCatalogPage, cleanCatalogQueryValue } from '../catalog/catalogQuery'
import { useKmoeApi } from '../hooks/useKmoeApi'
import type { CatalogQuery } from '../types/domain'

type CategoryMood = {
  title: string
  description: string
  icon: 'spark' | 'book' | 'flame'
  categories: string[]
}

const categoryMoods: CategoryMood[] = [
  {
    title: '今天就想追下去',
    description: '长线连载、热血推进和大篇幅冒险，适合打开目录一路读。',
    icon: 'flame',
    categories: ['熱血', '冒險', '戰爭', '歷史', '少年', '魔幻']
  },
  {
    title: '轻松但不水',
    description: '通勤、睡前和碎片时间更适合的轻量题材。',
    icon: 'spark',
    categories: ['幽默', '生活', '校園', '美食', '治癒', '四格']
  },
  {
    title: '值得收藏整理',
    description: '题材辨识度高，适合加入书架或离线下载慢慢看。',
    icon: 'book',
    categories: ['愛情', '少女', '青年', '耽美', '百合', '輕改']
  }
]

const allCategories = [
  '全部', '幽默', '愛情', '競技', '熱血', '冒險', '恐怖', '懸疑', '歷史', '生活', '校園', '職場',
  '美食', '魔幻', '魔法', '奇幻', '治癒', '青年', '少年', '少女', '百合', '耽美', '穿越', '轉生',
  '輕改', '戰爭', '格鬥', '神鬼', '後宮', '四格'
]
const statusOptions = ['全部', '連載', '完結', '停更']
const languageOptions = ['全部', '繁體', '簡體', '日文', '英文']
const sortOptions = [
  { label: '默认', value: 'sortpoint' },
  { label: '评分', value: 'score' },
  { label: '热门', value: 'count_push' },
  { label: '最近更新', value: 'lastupdate' },
  { label: '新上架', value: 'newadd' }
]

export function CategoriesPage() {
  const api = useKmoeApi()
  const [params, setSearchParams] = useSearchParams()
  const paramsKey = params.toString()
  const resultsRef = useRef<HTMLElement | null>(null)
  const state = useMemo(() => categoryStateFromParams(params), [paramsKey])
  const { category, status, language, sort, page } = state

  const catalogQuery = useMemo<CatalogQuery>(() => ({
    page,
    sort,
    category: category === '全部' ? undefined : category,
    status: status === '全部' ? undefined : status,
    language: language === '全部' ? undefined : language
  }), [category, language, page, sort, status])

  const catalog = useQuery({
    queryKey: ['category-discovery', catalogQuery],
    queryFn: () => api.search(catalogQuery),
    placeholderData: keepPreviousData
  })

  const activeLabel = category === '全部' ? '全部题材' : category

  useEffect(() => {
    const totalPages = catalog.data?.totalPages
    if (totalPages && page > totalPages) {
      updateCategoryState({ ...state, page: totalPages }, { replace: true, scroll: false })
    }
  }, [catalog.data?.totalPages, page, state])

  function updateCategoryState(next: CategoryBrowserState, options: { replace?: boolean; scroll?: boolean } = {}) {
    setSearchParams(categoryStateToParams(next), { replace: options.replace ?? true })
    if (options.scroll) scrollResultsIntoView(resultsRef.current)
  }

  function updateFilter(patch: Partial<CategoryBrowserState>) {
    updateCategoryState({ ...state, ...patch, page: 1 })
  }

  return (
    <div className="category-discovery-page content-grid">
      <section className="category-discovery-hero">
        <div className="min-w-0">
          <div className="detail-eyebrow mb-3 text-xs font-semibold tracking-[0.16em] text-[var(--app-muted)]">分类发现</div>
          <h1 className="page-title">分类</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--app-muted)]">
            直接在分类页浏览题材、状态和语言结果，不再跳到搜索页打断浏览节奏。
          </p>
        </div>
        <div className="category-discovery-now">
          <span>当前浏览</span>
          <strong>{activeLabel}</strong>
          <small>{status === '全部' ? '全部状态' : status} · {language === '全部' ? '全部语言' : language}</small>
        </div>
      </section>

      <section className="category-mood-grid">
        {categoryMoods.map((group) => (
          <article key={group.title} className="category-mood-card">
            <div className="category-mood-icon">{renderMoodIcon(group.icon)}</div>
            <div className="min-w-0">
              <h2>{group.title}</h2>
              <p>{group.description}</p>
            </div>
            <div className="category-mood-tags">
              {group.categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="category-token"
                  data-selected={category === item ? 'true' : undefined}
                  onClick={() => updateFilter({ category: item })}
                >
                  {item}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="category-browser-panel">
        <div className="category-browser-header">
          <div>
            <h2>题材库</h2>
            <p>点击题材会在当前页面更新列表，保留你的浏览上下文。</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              updateCategoryState(defaultCategoryState())
            }}
          >
            重置
          </Button>
        </div>

        <div className="category-token-cloud" aria-label="题材筛选">
          {allCategories.map((item) => (
            <button
              key={item}
              type="button"
              className="category-token"
              data-selected={category === item ? 'true' : undefined}
              onClick={() => updateFilter({ category: item })}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="category-filter-strip">
          <Segment label="状态" value={status} options={statusOptions} onChange={(value) => updateFilter({ status: value })} />
          <Segment label="语言" value={language} options={languageOptions} onChange={(value) => updateFilter({ language: value })} />
          <label className="category-sort-select">
            <span>排序</span>
            <select value={sort} onChange={(event) => updateFilter({ sort: event.target.value })}>
              {sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section ref={resultsRef} className="category-results-panel">
        <div className="category-results-head">
          <div>
            <h2>{activeLabel}</h2>
            <p>{catalog.data ? `第 ${catalog.data.page} 页 · ${catalog.data.items.length} 部作品` : '正在读取作品列表'}</p>
          </div>
          <Badge tone="info">
            <ArrowUpRight className="h-3.5 w-3.5" />
            直接进入详情
          </Badge>
        </div>

        {!catalog.data && (catalog.isLoading || catalog.isFetching) ? <CatalogSkeleton /> : null}
        {catalog.isError ? (
          <EmptyState title="分类加载失败">
            <div className="grid gap-3">
              <span>暂时无法读取这个分类，请稍后重试。</span>
              <Button type="button" variant="secondary" onClick={() => void catalog.refetch()}>
                重试分类
              </Button>
            </div>
          </EmptyState>
        ) : null}
        {!catalog.isLoading && !catalog.isFetching && catalog.data?.items.length === 0 ? <EmptyState title="没有结果">换一个题材或筛选条件。</EmptyState> : null}
        {catalog.data ? (
          <div className="catalog-grid">
            {catalog.data.items.map((comic) => (
              <ComicCard key={comic.id} comic={comic} />
            ))}
          </div>
        ) : null}
        <CatalogPagination
          page={catalog.data?.page ?? catalogQuery.page}
          totalPages={catalog.data?.totalPages}
          isFetching={catalog.isFetching}
          onPageChange={(nextPage) => updateCategoryState({ ...state, page: nextPage }, { replace: false, scroll: true })}
        />
      </section>
    </div>
  )
}

interface CategoryBrowserState {
  category: string
  status: string
  language: string
  sort: string
  page: number
}

function defaultCategoryState(): CategoryBrowserState {
  return {
    category: '全部',
    status: '全部',
    language: '全部',
    sort: 'sortpoint',
    page: 1
  }
}

function categoryStateFromParams(params: URLSearchParams): CategoryBrowserState {
  const defaults = defaultCategoryState()
  return {
    category: choiceFromParam(params.get('category'), allCategories, defaults.category),
    status: choiceFromParam(params.get('status'), statusOptions, defaults.status),
    language: choiceFromParam(params.get('language'), languageOptions, defaults.language),
    sort: sortOptions.some((option) => option.value === params.get('sort')) ? params.get('sort') ?? defaults.sort : defaults.sort,
    page: clampCatalogPage(params.get('page') ?? 1)
  }
}

function categoryStateToParams(state: CategoryBrowserState): URLSearchParams {
  const query: CatalogQuery = {
    page: state.page,
    sort: state.sort,
    category: state.category === '全部' ? undefined : state.category,
    status: state.status === '全部' ? undefined : state.status,
    language: state.language === '全部' ? undefined : state.language
  }
  return catalogQueryToParams(query)
}

function choiceFromParam(value: string | null, options: string[], fallback: string): string {
  const cleaned = cleanCatalogQueryValue(value)
  return cleaned && options.includes(cleaned) ? cleaned : fallback
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

function Segment({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="category-segment">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            data-selected={value === option ? 'true' : undefined}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function renderMoodIcon(icon: CategoryMood['icon']) {
  if (icon === 'flame') return <Flame className="h-5 w-5" />
  if (icon === 'book') return <BookOpen className="h-5 w-5" />
  return <Sparkles className="h-5 w-5" />
}
