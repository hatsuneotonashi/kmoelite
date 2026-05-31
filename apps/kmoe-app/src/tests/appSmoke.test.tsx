import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { useSettingsStore } from '../store/settingsStore'

const routes = [
  ['/', '漫画浏览'],
  ['/login', '登录'],
  ['/shelf', '书架'],
  ['/search', '搜索与筛选'],
  ['/categories', '分类'],
  ['/downloads', '下载中心'],
  ['/library', '资料库'],
  ['/account', '我的账号'],
  ['/settings', '设置']
] as const

describe('App route smoke tests', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useSettingsStore.getState().resetSafetyDefaults()
  })

  it.each(routes)('renders %s', async (path, heading) => {
    window.history.pushState({}, '', path)
    render(<App />)

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
  })

  it('redirects unknown routes to the catalog', async () => {
    window.history.pushState({}, '', '/missing-page')
    render(<App />)

    expect(await screen.findByRole('heading', { name: '漫画浏览', level: 1 })).toBeInTheDocument()
  })
})
