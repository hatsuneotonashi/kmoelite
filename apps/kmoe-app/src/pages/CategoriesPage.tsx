import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, BookOpen, Flame, Sparkles } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ComicCard } from '../components/ComicCard'
import { EmptyState } from '../components/EmptyState'
import { CatalogSkeleton } from '../components/ui/Skeletons'
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
  const [category, setCategory] = useState('全部')
  const [status, setStatus] = useState('全部')
  const [language, setLanguage] = useState('全部')
  const [sort, setSort] = useState('sortpoint')

  const catalogQuery = useMemo<CatalogQuery>(() => ({
    page: 1,
    sort,
    category: category === '全部' ? undefined : category,
    status: status === '全部' ? undefined : status,
    language: language === '全部' ? undefined : language
  }), [category, language, sort, status])

  const catalog = useQuery({
    queryKey: ['category-discovery', catalogQuery],
    queryFn: () => api.search(catalogQuery)
  })

  const activeLabel = category === '全部' ? '全部题材' : category

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
                  onClick={() => setCategory(item)}
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
              setCategory('全部')
              setStatus('全部')
              setLanguage('全部')
              setSort('sortpoint')
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
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="category-filter-strip">
          <Segment label="状态" value={status} options={statusOptions} onChange={setStatus} />
          <Segment label="语言" value={language} options={languageOptions} onChange={setLanguage} />
          <label className="category-sort-select">
            <span>排序</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="category-results-panel">
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

        {catalog.isLoading || catalog.isFetching ? <CatalogSkeleton /> : null}
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
      </section>
    </div>
  )
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
