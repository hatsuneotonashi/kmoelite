import type { CatalogQuery } from '../types/domain'

export function catalogQueryFromParams(params: URLSearchParams, defaults: Partial<CatalogQuery> = {}): CatalogQuery {
  return normalizeCatalogQuery({
    page: pageFromParam(params.get('page')) ?? defaults.page ?? 1,
    sort: params.get('sort') ?? defaults.sort ?? 'sortpoint',
    keyword: params.get('keyword') ?? defaults.keyword,
    category: params.get('category') ?? defaults.category,
    status: params.get('status') ?? defaults.status,
    language: params.get('language') ?? defaults.language,
    region: params.get('region') ?? defaults.region,
    length: params.get('length') ?? defaults.length,
    color: params.has('color') ? params.get('color') === '1' : defaults.color,
    hd: params.has('hd') ? params.get('hd') === '1' : defaults.hd
  })
}

export function normalizeCatalogQuery(query: CatalogQuery): CatalogQuery {
  return {
    ...query,
    page: clampCatalogPage(query.page),
    sort: query.sort || 'sortpoint',
    keyword: cleanCatalogQueryValue(query.keyword),
    category: cleanCatalogQueryValue(query.category),
    status: cleanCatalogQueryValue(query.status),
    language: cleanCatalogQueryValue(query.language),
    region: cleanCatalogQueryValue(query.region),
    length: cleanCatalogQueryValue(query.length),
    color: query.color || undefined,
    hd: query.hd || undefined
  }
}

export function catalogQueryToParams(query: CatalogQuery): URLSearchParams {
  const normalized = normalizeCatalogQuery(query)
  const params = new URLSearchParams()
  if (normalized.keyword) params.set('keyword', normalized.keyword)
  if (normalized.category) params.set('category', normalized.category)
  if (normalized.status) params.set('status', normalized.status)
  if (normalized.language) params.set('language', normalized.language)
  if (normalized.region) params.set('region', normalized.region)
  if (normalized.length) params.set('length', normalized.length)
  if (normalized.sort && normalized.sort !== 'sortpoint') params.set('sort', normalized.sort)
  if (normalized.color) params.set('color', '1')
  if (normalized.hd) params.set('hd', '1')
  if (normalized.page > 1) params.set('page', String(normalized.page))
  return params
}

export function catalogQueryKey(query: CatalogQuery): string {
  const normalized = normalizeCatalogQuery(query)
  return JSON.stringify({
    keyword: normalized.keyword,
    category: normalized.category,
    status: normalized.status,
    language: normalized.language,
    region: normalized.region,
    length: normalized.length,
    sort: normalized.sort,
    color: Boolean(normalized.color),
    hd: Boolean(normalized.hd),
    page: normalized.page
  })
}

export function catalogFilterKey(query: CatalogQuery): string {
  return catalogQueryKey({ ...query, page: 1 })
}

export function clampCatalogPage(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric < 1) return 1
  return Math.max(1, Math.floor(numeric))
}

export function cleanCatalogQueryValue(value?: string | null): string | undefined {
  const cleaned = value?.trim()
  return cleaned || undefined
}

function pageFromParam(value: string | null): number | undefined {
  if (value === null) return undefined
  return clampCatalogPage(value)
}
