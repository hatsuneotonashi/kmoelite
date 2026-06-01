import { describe, expect, it } from 'vitest'
import { catalogFilterKey, catalogQueryFromParams, catalogQueryToParams, clampCatalogPage } from '../catalog/catalogQuery'

describe('catalog query helpers', () => {
  it('normalizes invalid page params and trims filters', () => {
    const params = new URLSearchParams('keyword=%20魔法%20&page=-8&color=1')
    const query = catalogQueryFromParams(params)

    expect(query).toMatchObject({
      keyword: '魔法',
      page: 1,
      sort: 'sortpoint',
      color: true
    })
  })

  it('serializes page only when it is outside the first page', () => {
    expect(catalogQueryToParams({ page: 1, sort: 'sortpoint', keyword: '魔法' }).toString()).toBe('keyword=%E9%AD%94%E6%B3%95')
    expect(catalogQueryToParams({ page: 3, sort: 'lastupdate', category: '冒險' }).toString()).toBe('category=%E5%86%92%E9%9A%AA&sort=lastupdate&page=3')
  })

  it('separates filter keys from page keys', () => {
    expect(catalogFilterKey({ page: 1, keyword: '魔法', sort: 'score' })).toBe(catalogFilterKey({ page: 9, keyword: '魔法', sort: 'score' }))
  })

  it('clamps page numbers to a positive integer', () => {
    expect(clampCatalogPage('2.8')).toBe(2)
    expect(clampCatalogPage('x')).toBe(1)
  })
})
