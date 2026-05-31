import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ComicCard } from '../components/ComicCard'
import { useShelfStore } from '../store/shelfStore'
import type { ComicListItem } from '../types/domain'

describe('ComicCard', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useShelfStore.setState({ itemsByComicId: {}, categories: [] })
  })

  it('keeps catalog cards focused on detail navigation without a shelf quick action', () => {
    render(
      <MemoryRouter>
        <ComicCard comic={sampleComic} />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: '查看详情：A 完结漫画' })).toHaveAttribute('href', '/comic/10180')
    expect(screen.queryByRole('button', { name: /加入书架|从书架移除/ })).not.toBeInTheDocument()
    expect(useShelfStore.getState().itemsByComicId['10180']).toBeUndefined()
  })
})

const sampleComic: ComicListItem = {
  id: '10180',
  title: 'A 完结漫画',
  url: '/c/10180.htm',
  coverUrl: '/cover/10180.jpg',
  author: '井上坚二',
  status: '完結',
  language: '繁體中文',
  region: '日本',
  score: '9.2',
  latestVolume: '第 20 卷',
  tags: []
}
