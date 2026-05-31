import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ComicCard } from '../components/ComicCard'
import { SelectField, TextField } from '../components/Field'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/layout/PageHeader'
import { CatalogSkeleton } from '../components/ui/Skeletons'
import { useKmoeApi } from '../hooks/useKmoeApi'
import type { CatalogPage, CatalogQuery } from '../types/domain'

export function SearchPage() {
  const api = useKmoeApi()
  const [params, setSearchParams] = useSearchParams()
  const paramsKey = params.toString()
  const queryFromParams = useMemo(() => catalogQueryFromParams(params), [paramsKey])
  const [form, setForm] = useState<CatalogQuery>(queryFromParams)
  const [submitted, setSubmitted] = useState<CatalogQuery>(form)
  const normalizedForm = useMemo(() => normalizeCatalogQuery({ ...form, page: 1 }), [form])
  const normalizedFormKey = useMemo(() => catalogQueryKey(normalizedForm), [normalizedForm])
  const submittedKey = useMemo(() => catalogQueryKey(submitted), [submitted])
  const query = useQuery({
    queryKey: ['search', submittedKey],
    queryFn: () => api.search(submitted)
  })
  const results = useMemo(() => relevantCatalogPage(query.data, submitted), [query.data, submitted])
  const isPendingInput = normalizedFormKey !== submittedKey

  useEffect(() => {
    setForm(queryFromParams)
    setSubmitted(queryFromParams)
  }, [queryFromParams])

  useEffect(() => {
    if (normalizedFormKey === submittedKey) return
    const timer = window.setTimeout(() => {
      setSubmitted(normalizedForm)
      setSearchParams(catalogQueryToParams(normalizedForm), { replace: true })
    }, 520)
    return () => window.clearTimeout(timer)
  }, [normalizedForm, normalizedFormKey, setSearchParams, submittedKey])

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = normalizeCatalogQuery({ ...form, page: 1 })
    setSubmitted(next)
    setSearchParams(catalogQueryToParams(next), { replace: true })
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

      {query.isLoading || query.isFetching ? <CatalogSkeleton /> : null}
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
      <div className="catalog-grid">
        {results?.items.map((comic) => (
          <ComicCard key={comic.id} comic={comic} />
        ))}
      </div>
    </div>
  )
}

function catalogQueryFromParams(params: URLSearchParams): CatalogQuery {
  return normalizeCatalogQuery({
    page: Number(params.get('page')) || 1,
    sort: params.get('sort') ?? 'sortpoint',
    keyword: params.get('keyword') ?? undefined,
    category: params.get('category') ?? undefined,
    status: params.get('status') ?? undefined,
    language: params.get('language') ?? undefined,
    region: params.get('region') ?? undefined,
    length: params.get('length') ?? undefined,
    color: params.get('color') === '1',
    hd: params.get('hd') === '1'
  })
}

function normalizeCatalogQuery(query: CatalogQuery): CatalogQuery {
  return {
    ...query,
    page: query.page || 1,
    sort: query.sort || 'sortpoint',
    keyword: cleanQueryValue(query.keyword),
    category: cleanQueryValue(query.category),
    status: cleanQueryValue(query.status),
    language: cleanQueryValue(query.language),
    region: cleanQueryValue(query.region),
    length: cleanQueryValue(query.length),
    color: query.color || undefined,
    hd: query.hd || undefined
  }
}

function cleanQueryValue(value?: string): string | undefined {
  const cleaned = value?.trim()
  return cleaned || undefined
}

function catalogQueryToParams(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.keyword) params.set('keyword', query.keyword)
  if (query.category) params.set('category', query.category)
  if (query.status) params.set('status', query.status)
  if (query.language) params.set('language', query.language)
  if (query.region) params.set('region', query.region)
  if (query.length) params.set('length', query.length)
  if (query.sort && query.sort !== 'sortpoint') params.set('sort', query.sort)
  if (query.color) params.set('color', '1')
  if (query.hd) params.set('hd', '1')
  if (query.page > 1) params.set('page', String(query.page))
  return params
}

function catalogQueryKey(query: CatalogQuery): string {
  return JSON.stringify({
    keyword: cleanQueryValue(query.keyword),
    category: cleanQueryValue(query.category),
    status: cleanQueryValue(query.status),
    language: cleanQueryValue(query.language),
    region: cleanQueryValue(query.region),
    length: cleanQueryValue(query.length),
    sort: query.sort || 'sortpoint',
    color: Boolean(query.color),
    hd: Boolean(query.hd),
    page: query.page || 1
  })
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
