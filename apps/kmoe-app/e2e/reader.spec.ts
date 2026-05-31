import { expect, test } from '@playwright/test'
import { getNativeReaderCalls, installNativeReaderFixture } from './fixtures/nativeReaderFixture'

test.describe('cached Reader flow', () => {
  test.beforeEach(async ({ page }) => {
    await installNativeReaderFixture(page)
  })

  test('opens a cached chapter and jumps through the TOC', async ({ page, isMobile }) => {
    await page.goto('/reader/cache/cache-53339-3089')

    await expect(page.getByRole('heading', { name: '尖帽子的魔法工房 · 話 089-095' })).toBeAttached()
    await expect(page.getByAltText('第 1 页')).toBeVisible()

    await expect.poll(async () => readPageIndexes(page)).toEqual(expect.arrayContaining([0, 1]))
    expect(await readPageIndexes(page)).not.toContain(5)

    await showReaderChrome(page)
    await page.getByRole('button', { name: '目录' }).click()
    await expect(page.getByLabel('目录和页面缩略图')).toBeVisible()
    await expect(page.getByRole('button', { name: '跳到第 1 页' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: '跳到第 6 页' })).toBeVisible()

    await page.getByRole('button', { name: '跳到第 6 页' }).click()

    await expect(page.getByAltText('第 6 页')).toBeVisible()
    await expect.poll(async () => readPageIndexes(page)).toContain(5)

    if (isMobile) {
      await expect(page.getByLabel('目录和页面缩略图')).toBeHidden()
    } else {
      await expect(page.getByRole('button', { name: '跳到第 6 页' })).toHaveAttribute('aria-current', 'page')
      await page.locator('.reader-panel-close').click()
    }

    await page.getByRole('button', { name: '下一章：話 096-100' }).click()
    await expect(page.getByRole('heading', { name: '尖帽子的魔法工房 · 話 096-100' })).toBeAttached()
    await expect.poll(async () => readPageCalls(page, 'cache-53339-3096')).toEqual(expect.arrayContaining([0, 1]))
  })

  test('keeps advanced reader controls in a dedicated panel', async ({ page }) => {
    await page.goto('/reader/cache/cache-53339-3089')

    await expect(page.getByAltText('第 1 页')).toBeVisible()
    await showReaderChrome(page)
    const layoutControls = page.getByRole('group', { name: '页面布局' })
    await expect(layoutControls.getByRole('button', { name: '单页' })).toBeVisible()
    await expect(layoutControls.getByRole('button', { name: '双页' })).toBeVisible()

    await layoutControls.getByRole('button', { name: '双页' }).click()
    await expect(layoutControls.getByRole('button', { name: '双页' })).toHaveAttribute('data-selected', 'true')

    await page.getByRole('button', { name: '高级' }).click()
    const controlsPanel = page.getByRole('complementary', { name: '阅读控制' })
    await expect(controlsPanel).toBeVisible()
    await expect(controlsPanel.getByRole('button', { name: '合下页' })).toBeVisible()
    await expect(controlsPanel.getByRole('button', { name: '自动裁边' })).toBeVisible()
    await page.locator('.reader-panel-close').click()
    await expect(controlsPanel).toBeHidden()
    await expect(page.getByRole('group', { name: '高级阅读控制' })).toBeVisible()
  })
})

async function readPageIndexes(page: import('@playwright/test').Page): Promise<number[]> {
  return readPageCalls(page)
}

async function showReaderChrome(page: import('@playwright/test').Page): Promise<void> {
  const shell = page.locator('.reader-shell')
  await shell.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2
    }))
  })
  await expect(shell).toHaveAttribute('data-controls-visible', 'true')
}

async function readPageCalls(page: import('@playwright/test').Page, chapterCacheId?: string): Promise<number[]> {
  const calls = await getNativeReaderCalls(page)
  return calls
    .filter((call) => call.cmd === 'read_cached_reader_page')
    .filter((call) => !chapterCacheId || call.args?.chapterCacheId === chapterCacheId)
    .map((call) => Number(call.args?.pageIndex))
}
