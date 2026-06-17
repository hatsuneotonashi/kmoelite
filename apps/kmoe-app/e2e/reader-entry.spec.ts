import { expect, test } from '@playwright/test'
import { installKmoeFixtureRoutes } from './fixtures/kmoeFixture'
import {
  getNativeReaderCalls,
  installNativeReaderFixture,
  makeNativeReaderChapter,
  makeNativeReaderDownloadedFile,
  makeNativeReadingProgress
} from './fixtures/nativeReaderFixture'

test.describe('reader entry points', () => {
  test('Detail downloads a single EPUB task, prepares cache, and opens Reader', async ({ page }) => {
    await installKmoeFixtureRoutes(page)
    await installNativeReaderFixture(page, {
      chapters: [],
      downloadedFiles: []
    })
    await page.goto('/comic/53339')

    await expect(page.getByRole('heading', { name: '尖帽子的魔法工房' })).toBeVisible()
    await page.getByRole('heading', { name: '目录' }).scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 520)
    const targetRow = page.locator('.volume-option-card:visible', { hasText: '話 089-095' }).first()
    await targetRow.getByRole('button', { name: /阅读/ }).click()

    await expect(page.getByRole('heading', { name: '尖帽子的魔法工房 · 話 089-095' })).toBeAttached()
    await expect(page).toHaveURL(/\/reader\/cache\/cache-53339-3089/)
    await expect(page.getByAltText('第 1 页')).toBeVisible()
    const calls = await getNativeReaderCalls(page)
    const enqueueCall = calls.find((call) => call.cmd === 'enqueue_download_tasks')
    expect(enqueueCall?.args?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ format: 'epub', volId: '3089' })
    ]))
    expect(calls.some((call) => call.cmd === 'start_download_queue')).toBe(true)
    const prepareCall = calls.find((call) => call.cmd === 'prepare_reader_chapter_cache')
    expect(prepareCall?.args?.input).toEqual(expect.objectContaining({ format: 'epub', volumeId: '3089' }))
  })

  test('Library prepares a source ZIP cache and opens Reader', async ({ page }) => {
    await installNativeReaderFixture(page, {
      chapters: [],
      downloadedFiles: [makeNativeReaderDownloadedFile('3089', '話 089-095')]
    })

    await page.goto('/library')
    await expect(page.getByRole('heading', { name: '资料库' })).toBeVisible()
    await expect(page.getByText('尖帽子的魔法工房')).toBeVisible()

    await page.getByRole('button', { name: /准备阅读/ }).click()

    await expect(page.getByRole('heading', { name: '尖帽子的魔法工房 · 話 089-095' })).toBeAttached()
    await expect(page.getByAltText('第 1 页')).toBeVisible()
    const calls = await getNativeReaderCalls(page)
    expect(calls.some((call) => call.cmd === 'prepare_reader_chapter_cache')).toBe(true)
    expect(calls.some((call) => call.cmd === 'read_cached_reader_page' && call.args?.chapterCacheId === 'cache-53339-3089')).toBe(true)
  })

  test('Home Continue Reading opens the cached Reader directly', async ({ page }) => {
    await installKmoeFixtureRoutes(page)
    await installNativeReaderFixture(page, {
      chapters: [makeNativeReaderChapter('cache-53339-3089', '3089', '話 089-095', 6)],
      readingProgress: [makeNativeReadingProgress('3089', '話 089-095')]
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: '继续阅读' })).toBeVisible()
    await page.getByText('尖帽子的魔法工房').first().click()

    await expect(page.getByRole('heading', { name: '尖帽子的魔法工房 · 話 089-095' })).toBeAttached()
    await expect(page).toHaveURL(/\/reader\/cache\/cache-53339-3089/)
    await expect(page.getByAltText('第 2 页')).toBeVisible()
  })
})
