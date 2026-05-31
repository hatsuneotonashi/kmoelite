import { expect, test } from '@playwright/test'
import { installKmoeFixtureRoutes } from './fixtures/kmoeFixture'

const routes = [
  { path: '/', text: '漫画浏览' },
  { path: '/search', text: '搜索与筛选' },
  { path: '/categories', text: '分类' },
  { path: '/downloads', text: '下载中心' },
  { path: '/library', text: '资料库' },
  { path: '/account', text: '我的账号' },
  { path: '/settings', text: '设置' }
]

test.describe('responsive app shell', () => {
  test.beforeEach(async ({ page }) => {
    await installKmoeFixtureRoutes(page)
  })

  for (const route of routes) {
    test(`renders ${route.path}`, async ({ page }) => {
      await page.goto(route.path)
      await expect(page.getByRole('heading', { name: route.text })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })
  }

  test('renders Home for the packaged Tauri index.html entry path', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.getByRole('heading', { name: '漫画浏览' })).toBeVisible()
    await expect(page.getByLabel('搜索标题、作者、标签')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('search narrows catalog results from the keyword field', async ({ page }) => {
    await page.goto('/search')
    await page.getByLabel('关键词').fill('地下')
    await page.getByRole('button', { name: /搜索/ }).click()

    await expect(page.getByText('地下忍者').first()).toBeVisible()
    await expect(page.getByText('尖帽子的魔法工房')).toHaveCount(0)
    expect(new URL(page.url()).searchParams.get('keyword')).toBe('地下')
    await expectNoHorizontalOverflow(page)
  })

  test('mobile keeps bottom navigation available', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile navigation is viewport-specific')

    await page.goto('/')
    await expect(page.getByRole('link', { name: '首页' })).toBeVisible()
    await expect(page.getByRole('link', { name: '下载' })).toBeVisible()
    await expect(page.getByRole('button', { name: '更多' })).toBeVisible()
    await page.getByRole('link', { name: '下载' }).click()
    await expect(page.getByText('下载中心')).toBeVisible()

    await page.getByRole('button', { name: '更多' }).click()
    await expect(page.getByRole('navigation', { name: '移动端更多导航' })).toBeVisible()
    await expect(page.getByRole('link', { name: '分类' })).toBeVisible()
    await expect(page.getByRole('link', { name: '我的账号' })).toBeVisible()
    await expect(page.getByRole('link', { name: '设置' })).toBeVisible()
    await page.getByRole('link', { name: '我的账号' }).click()
    await expect(page.getByRole('heading', { name: '我的账号' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}
