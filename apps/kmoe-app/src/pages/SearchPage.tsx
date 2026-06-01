import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ComicCard } from '../components/ComicCard'
import { SelectField, TextField } from '../components/Field'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/layout/PageHeader'
import { CatalogPagination } from '../components/ui/CatalogPagination'
import { CatalogSkeleton } from '../components/ui/Skeletons'
import { catalogFilterKey, catalogQueryFromParams, catalogQueryKey, catalogQueryToParams, normalizeCatalogQuery } from '../catalog/catalogQuery'
import { useKmoeApi } from '../hooks/useKmoeApi'
import type { CatalogPage, CatalogQuery } from '../types/domain'

export function SearchPage() {
  const api = useKmoeApi()
  const [params, setSearchParams] = useSearchParams()
  const paramsKey = params.toString()
  const queryFromParams = useMemo(() => catalogQueryFromParams(params), [paramsKey])
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const [form, setForm] = useState<CatalogQuery>({ ...queryFromParams, page: 1 })
  const [submitted, setSubmitted] = useState<CatalogQuery>(queryFromParams)
  const normalizedForm = useMemo(() => normalizeCatalogQuery({ ...form, page: 1 }), [form])
  const normalizedFormKey = useMemo(() => catalogFilterKey(normalizedForm), [normalizedForm])
  const submittedFilterKey = useMemo(() => catalogFilterKey(submitted), [submitted])
  const submittedKey = useMemo(() => catalogQueryKey(submitted), [submitted])
  const query = useQuery({
    queryKey: ['search', submittedKey],
    queryFn: () => api.search(submitted),
    placeholderData: keepPreviousData
  })
  const results = useMemo(() => relevantCatalogPage(query.data, submitted), [query.data, submitted])
  const isPendingInput = normalizedFormKey !== submittedFilterKey

  useEffect(() => {
    setForm({ ...queryFromParams, page: 1 })
    setSubmitted(queryFromParams)
  }, [queryFromParams])

  useEffect(() => {
    if (normalizedFormKey === submittedFilterKey) return
    const timer = window.setTimeout(() => {
      setSubmitted(normalizedForm)
      setSearchParams(catalogQueryToParams(normalizedForm), { replace: true })
    }, 520)
    return () => window.clearTimeout(timer)
  }, [normalizedForm, normalizedFormKey, setSearchParams, submittedFilterKey])

  useEffect(() => {
    const totalPages = results?.totalPages
    if (totalPages && submitted.page > totalPages) {
      goToPage(totalPages, false)
    }
  }, [results?.totalPages, submitted.page])

  function submit(event: FormEvent) {
    event.preventDefault()
    submitQuery(normalizedForm, true)
  }

  function submitQuery(next: CatalogQuery, replace: boolean, scroll = false) {
    const normalized = normalizeCatalogQuery(next)
    setSubmitted(normalized)
    setSearchParams(catalogQueryToParams(normalized), { replace })
    if (scroll) scrollResultsIntoView(resultsRef.current)
  }

  function goToPage(page: number, scroll = true) {
    submitQuery({ ...submitted, page }, false, scroll)
  }

  return (
    <div className="content-grid">
      <PageHeader
        title="搜索与筛选"
        description="按标题、分类、状态和语言快速缩小结果。"
      />

      <form onSubmit={submit} className="search-filter-panel glass-panel grid gap-3 rounded-[var(--radius-panel)] p-4 md:grid-cols-3 xl:grid-cols-4">
        <TextField
          label="关键词"
          type="search"
          value={form.keyword ?? ''}
          onChange={(event) => setForm({ ...form, keyword: event.target.value })}
        />
        <SelectField label="分类" value={form.category ?? ''} onChange={(event) => setForm({ ...form, category: event.target.value })}>
          <option value="">全部</option>
          <option value="魔幻">魔幻</option>
          <option value="冒險">冒險</option>
          <option value="幽默">幽默</option>
          <option value="青年">青年</option>
        </SelectField>
        <SelectField label="状态" value={form.status ?? ''} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="">全部</option>
          <option value="連載">連載</option>
          <option value="完結">完結</option>
        </SelectField>
        <SelectField label="语言" value={form.language ?? ''} onChange={(event) => setForm({ ...form, language: event.target.value })}>
          <option value="">全部</option>
          <option value="繁體">繁體</option>
          <option value="簡體">簡體</option>
          <option value="日語">日語</option>
          <option value="英文">英文</option>
        </SelectField>
        <SelectField label="地区" value={form.region ?? ''} onChange={(event) => setForm({ ...form, region: event.target.value })}>
          <option value="">全部</option>
          <option value="日本">日本</option>
          <option value="韓國">韓國</option>
          <option value="中國">中國</option>
        </SelectField>
        <SelectField label="篇幅" value={form.length ?? ''} onChange={(event) => setForm({ ...form, length: event.target.value })}>
          <option value="">全部</option>
          <option value="l">長篇</option>
          <option value="s">短篇</option>
        </SelectField>
        <SelectField label="排序" value={form.sort ?? ''} onChange={(event) => setForm({ ...form, sort: event.target.value })}>
          <option value="sortpoint">默认</option>
          <option value="score">评价</option>
          <option value="count_push">热门</option>
          <option value="newadd">新上</option>
          <option value="lastupdate">更新</option>
        </SelectField>
        <div className="search-filter-actions flex items-end gap-2">
          <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-glass)] px-3 text-sm font-semibold">
            <input type="checkbox" checked={Boolean(form.color)} onChange={(event) => setForm({ ...form, color: event.target.checked })} />
            彩色
          </label>
          <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-glass)] px-3 text-sm font-semibold">
            <input type="checkbox" checked={Boolean(form.hd)} onChange={(event) => setForm({ ...form, hd: event.target.checked })} />
            HD
          </label>
          <Button type="submit" variant="primary">
            {isPendingInput ? '立即搜索' : '搜索'}
          </Button>
        </div>
      </form>

      {!query.data && (query.isLoading || query.isFetching) ? <CatalogSkeleton /> : null}
      {query.isError ? (
        <EmptyState title="搜索失败">
          <div className="grid gap-3">
            <span>暂时无法读取搜索结果，请稍后重试。</span>
            <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
              重试搜索
            </Button>
          </div>
        </EmptyState>
      ) : null}
      {!query.isLoading && !query.isFetching && results?.items.length === 0 ? <EmptyState title="没有结果">调整关键词或筛选条件。</EmptyState> : null}
      <div ref={resultsRef} className="catalog-grid">
        {results?.items.map((comic) => (
          <ComicCard key={comic.id} comic={comic} />
        ))}
      </div>
      <CatalogPagination
        page={results?.page ?? submitted.page}
        totalPages={results?.totalPages}
        isFetching={query.isFetching}
        onPageChange={goToPage}
      />
    </div>
  )
}

function relevantCatalogPage(page: CatalogPage | undefined, query: CatalogQuery) {
  if (!page || !query.keyword) return page
  const needle = searchComparable(query.keyword)
  if (!needle) return page
  const filtered = page.items.filter((item) => {
    const haystack = searchComparable([
      item.title,
      item.author,
      item.latestVolume,
      item.status,
      item.language,
      ...item.tags
    ].filter(Boolean).join(' '))
    return haystack.includes(needle)
  })
  return { ...page, items: filtered, totalItems: filtered.length }
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

const simplifiedToTraditional: Record<string, string> = {
  书: '書',
  侠: '俠',
  儿: '兒',
  册: '冊',
  剑: '劍',
  势: '勢',
  单: '單',
  双: '雙',
  后: '後',
  国: '國',
  图: '圖',
  圣: '聖',
  声: '聲',
  头: '頭',
  学: '學',
  宫: '宮',
  师: '師',
  异: '異',
  强: '強',
  恶: '惡',
  恋: '戀',
  战: '戰',
  护: '護',
  无: '無',
  时: '時',
  术: '術',
  杀: '殺',
  权: '權',
  梦: '夢',
  樱: '櫻',
  气: '氣',
  灭: '滅',
  灵: '靈',
  炼: '煉',
  点: '點',
  热: '熱',
  爱: '愛',
  独: '獨',
  猫: '貓',
  画: '畫',
  种: '種',
  简: '簡',
  组: '組',
  绘: '繪',
  绝: '絕',
  绿: '綠',
  缘: '緣',
  网: '網',
  罗: '羅',
  胜: '勝',
  艺: '藝',
  节: '節',
  药: '藥',
  蓝: '藍',
  虫: '蟲',
  见: '見',
  觉: '覺',
  说: '說',
  话: '話',
  谜: '謎',
  贝: '貝',
  车: '車',
  转: '轉',
  这: '這',
  连: '連',
  进: '進',
  远: '遠',
  里: '裡',
  链: '鏈',
  镜: '鏡',
  间: '間',
  队: '隊',
  阳: '陽',
  难: '難',
  风: '風',
  飞: '飛',
  马: '馬',
  鬼: '鬼',
  龙: '龍'
}

function searchComparable(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[，。！？、・·\s()[\]{}<>《》「」『』"'“”‘’:：;；.,!?_-]+/g, '')
    .replace(/[\u4e00-\u9fff]/g, (character) => simplifiedToTraditional[character] ?? character)
}
