import { expect, type Page, test } from '@playwright/test'
import { installKmoeFixtureRoutes } from './fixtures/kmoeFixture'
import { installNativeReaderFixture, makeNativeReaderDownloadedFile } from './fixtures/nativeReaderFixture'

const visualProjects = new Set(['tablet-chromium', 'large-desktop-chromium'])
const mobileVisualProjects = new Set(['mobile-chromium'])
const iosLaunchProjects = new Set(['mobile-chromium', 'tablet-chromium'])

async function expectMountedPage(page: Page, heading: string) {
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page.getByRole('heading', { name: heading })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const scroller = document.querySelector('main.app-scrollbar') as HTMLElement | null
    const title = document.querySelector('.page-title')?.getBoundingClientRect()
    return {
      bodyOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      mainOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      scrollX: window.scrollX,
      mainScrollLeft: scroller?.scrollLeft ?? 0,
      titleLeft: title?.left ?? 0
    }
  })
  expect(metrics.bodyOverflow, `body horizontal overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(1)
  expect(metrics.mainOverflow, `main horizontal overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(1)
  expect(metrics.scrollX, `window horizontal scroll: ${JSON.stringify(metrics)}`).toBe(0)
  expect(metrics.mainScrollLeft, `main horizontal scroll: ${JSON.stringify(metrics)}`).toBe(0)
  expect(metrics.titleLeft, `page title clipped: ${JSON.stringify(metrics)}`).toBeGreaterThanOrEqual(0)
}

async function expectPhoneHorizontalScrollClamped(page: Page) {
  const metrics = await page.evaluate(async () => {
    const scroller = document.querySelector('main.app-scrollbar') as HTMLElement | null
    if (scroller) {
      scroller.scrollLeft = 48
      scroller.dispatchEvent(new Event('scroll'))
    }
    document.documentElement.scrollLeft = 48
    document.body.scrollLeft = 48
    window.scrollTo(48, window.scrollY)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return {
      scrollX: window.scrollX,
      mainScrollLeft: scroller?.scrollLeft ?? 0,
      documentScrollLeft: document.documentElement.scrollLeft,
      bodyScrollLeft: document.body.scrollLeft
    }
  })
  expect(metrics.scrollX, `window horizontal scroll was not clamped: ${JSON.stringify(metrics)}`).toBe(0)
  expect(metrics.mainScrollLeft, `main horizontal scroll was not clamped: ${JSON.stringify(metrics)}`).toBe(0)
  expect(metrics.documentScrollLeft, `document horizontal scroll was not clamped: ${JSON.stringify(metrics)}`).toBe(0)
  expect(metrics.bodyScrollLeft, `body horizontal scroll was not clamped: ${JSON.stringify(metrics)}`).toBe(0)
}

async function openPrimaryPage(page: Page, options: { directName: string; moreName?: string; heading: string }) {
  const directLink = page.getByRole('link', { name: options.directName }).first()
  if (await directLink.isVisible()) {
    await directLink.click()
  } else {
    await page.getByRole('button', { name: '更多' }).click()
    await page.getByRole('link', { name: options.moreName ?? options.directName }).click()
  }
  await expectMountedPage(page, options.heading)
}

async function seedShelfVisualState(page: Page) {
  await page.addInitScript(() => {
    const now = '2026-05-25T08:00:00.000Z'
    window.localStorage.setItem('kmoe-client-shelf', JSON.stringify({
      state: {
        categories: [
          { id: 'cat:reading', name: '追读', sortOrder: 0, createdAt: now, updatedAt: now }
        ],
        itemsByComicId: {
          '53339': {
            id: 'shelf:53339',
            comicId: '53339',
            comicTitle: '尖帽子的魔法工房',
            comicUrl: '/c/53339.htm',
            coverUrl: '/covers/witch-hat.png',
            author: '白浜鴎',
            status: '連載',
            latestVolume: '話 089-095',
            latestVolumeId: '3089',
            latestUpdatedAt: '2026-05-24T09:30:00.000Z',
            unreadCount: 4,
            categoryIds: ['cat:reading'],
            archived: false,
            cached: true,
            cacheStatus: 'downloaded',
            addedAt: '2026-05-20T08:00:00.000Z',
            updatedAt: now,
            lastReadAt: '2026-05-24T20:30:00.000Z',
            readingProgress: {
              id: 'progress:53339:3089',
              comicId: '53339',
              comicTitle: '尖帽子的魔法工房',
              volumeId: '3089',
              volumeTitle: '話 089-095',
              pageIndex: 31,
              pageCount: 94,
              progressPercent: 34,
              lastReadAt: '2026-05-24T20:30:00.000Z',
              finished: false,
              readingMode: 'paged',
              readingDirection: 'rtl',
              pageLayout: 'auto_double'
            }
          },
          '14140': {
            id: 'shelf:14140',
            comicId: '14140',
            comicTitle: '地下忍者',
            comicUrl: '/c/14140.htm',
            coverUrl: '/covers/under-ninja.png',
            author: '花澤健吾',
            status: '連載',
            latestVolume: '卷 01',
            latestUpdatedAt: '2026-05-23T13:00:00.000Z',
            unreadCount: 0,
            categoryIds: [],
            archived: false,
            cached: false,
            cacheStatus: 'none',
            addedAt: '2026-05-21T08:00:00.000Z',
            updatedAt: now
          }
        }
      },
      version: 0
    }))
  })
}

async function seedDownloadVisualState(page: Page) {
  await page.addInitScript(() => {
    const now = '2026-05-25T08:00:00.000Z'
    const taskBase = {
      comicId: '53339',
      comicTitle: '尖帽子的魔法工房',
      retryCount: 0,
      createdAt: '2026-05-25T07:00:00.000Z',
      updatedAt: now
    }
    window.localStorage.setItem('kmoe-client-downloads', JSON.stringify({
      state: {
        tasks: [
          {
            ...taskBase,
            id: 'visual-downloading',
            volId: '3089',
            volumeTitle: '話 089-095',
            format: 'epub',
            status: 'downloading',
            progress: 48,
            downloadedBytes: 10_240_000,
            totalBytes: 21_700_000
          },
          {
            ...taskBase,
            id: 'visual-queued',
            volId: '3001',
            volumeTitle: '話 001-006',
            format: 'source_zip',
            status: 'queued',
            progress: 0,
            downloadedBytes: 0,
            totalBytes: 51_000_000,
            createdAt: '2026-05-25T07:10:00.000Z'
          },
          {
            ...taskBase,
            id: 'visual-failed',
            volId: '3096',
            volumeTitle: '話 096-100',
            format: 'mobi',
            status: 'failed',
            progress: 22,
            downloadedBytes: 4_000_000,
            totalBytes: 18_000_000,
            retryCount: 1,
            errorMessage: '登录会话已失效，请重新登录后重试。',
            createdAt: '2026-05-25T07:20:00.000Z'
          },
          {
            ...taskBase,
            id: 'visual-completed',
            volId: '3086',
            volumeTitle: '話 080-088',
            format: 'epub',
            status: 'completed',
            progress: 100,
            downloadedBytes: 19_942_058,
            totalBytes: 19_942_058,
            localPath: '/tmp/kmoe-fixtures/witch-hat-080-088.epub',
            createdAt: '2026-05-25T07:30:00.000Z'
          }
        ],
        library: []
      },
      version: 0
    }))
  })
}

test.describe('visual breakpoints', () => {
  test.beforeEach(async ({ page }) => {
    await installKmoeFixtureRoutes(page)
  })

  test('settings layout remains stable', async ({ page }, testInfo) => {
    test.skip(!visualProjects.has(testInfo.project.name), 'visual snapshots target tablet and large desktop')

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
    await expect(page).toHaveScreenshot(`settings-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('search and filter layout remains stable', async ({ page }, testInfo) => {
    test.skip(!visualProjects.has(testInfo.project.name), 'visual snapshots target tablet and large desktop')

    await page.goto('/search')
    await expect(page.getByRole('heading', { name: '搜索与筛选' })).toBeVisible()
    await expect(page.getByText('排序')).toBeVisible()
    await expect(page).toHaveScreenshot(`search-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('download center layout remains stable', async ({ page }, testInfo) => {
    test.skip(!visualProjects.has(testInfo.project.name), 'visual snapshots target tablet and large desktop')

    await page.goto('/downloads')
    await expect(page.getByRole('heading', { name: '下载中心' })).toBeVisible()
    await expect(page).toHaveScreenshot(`download-center-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('download center task cards remain scannable', async ({ page }, testInfo) => {
    test.skip(!visualProjects.has(testInfo.project.name), 'visual snapshots target tablet and large desktop')

    await seedDownloadVisualState(page)
    await page.goto('/downloads')
    await expect(page.getByRole('heading', { name: '下载中心' })).toBeVisible()
    await expect(page.locator('.download-task-card').first()).toContainText('尖帽子的魔法工房')
    await expect(page).toHaveScreenshot(`download-center-tasks-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('local library layout remains stable', async ({ page }, testInfo) => {
    test.skip(!visualProjects.has(testInfo.project.name), 'visual snapshots target tablet and large desktop')

    await page.goto('/library')
    await expect(page.getByRole('heading', { name: '资料库' })).toBeVisible()
    await expect(page.getByLabel('搜索漫画、卷号、ID')).toBeVisible()
    await expect(page).toHaveScreenshot(`library-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('account quota layout remains stable', async ({ page }, testInfo) => {
    test.skip(!visualProjects.has(testInfo.project.name), 'visual snapshots target tablet and large desktop')

    await page.goto('/account')
    await expect(page.getByRole('heading', { name: '我的账号' })).toBeVisible()
    await expect(page.getByText('下载说明')).toBeVisible()
    await expect(page).toHaveScreenshot(`account-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('iOS simulator launch and route restore keep primary pages mounted', async ({ page }, testInfo) => {
    test.skip(!iosLaunchProjects.has(testInfo.project.name), 'iOS launch coverage targets mobile and tablet profiles')

    await page.goto('/')
    await expectMountedPage(page, '漫画浏览')

    await openPrimaryPage(page, { directName: '搜索', heading: '搜索与筛选' })
    await openPrimaryPage(page, { directName: '下载', heading: '下载中心' })
    await openPrimaryPage(page, { directName: '资料库', heading: '资料库' })
    await openPrimaryPage(page, { directName: '我的', moreName: '我的账号', heading: '我的账号' })
    await openPrimaryPage(page, { directName: '分类', heading: '分类' })
    await openPrimaryPage(page, { directName: '设置', heading: '设置' })

    await page.goto('/downloads/')
    await expectMountedPage(page, '下载中心')

    await page.goto('/account?ios-webview-restore=1')
    await expectMountedPage(page, '我的账号')
  })

  test('mobile more navigation exposes every primary surface', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile more navigation is mobile-specific')

    await page.goto('/')
    await expect(page.getByRole('button', { name: '更多' })).toBeVisible()
    await page.getByRole('button', { name: '更多' }).click()
    await expect(page.getByRole('navigation', { name: '移动端更多导航' })).toBeVisible()
    await expect(page.getByRole('link', { name: '我的账号' })).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-more-navigation-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 120
    })
  })

  test('mobile download center remains usable', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile download center is mobile-specific')

    await page.goto('/downloads')
    await expect(page.getByRole('heading', { name: '下载中心' })).toBeVisible()
    await expect(page.getByText('等待队列')).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-download-center-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile download task cards remain compact', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile download task density is mobile-specific')

    await seedDownloadVisualState(page)
    await page.goto('/downloads')
    await expect(page.getByRole('heading', { name: '下载中心' })).toBeVisible()
    await expect(page.locator('.download-task-card').first()).toContainText('尖帽子的魔法工房')
    await expect(page).toHaveScreenshot(`mobile-download-center-tasks-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile home catalog remains dense', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile home density is mobile-specific')

    await page.goto('/')
    await expectMountedPage(page, '漫画浏览')
    await expect(page.getByRole('heading', { name: '精选内容' })).toBeVisible()
    await expect(page.getByLabel('查看详情：尖帽子的魔法工房')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectPhoneHorizontalScrollClamped(page)
    await expect(page).toHaveScreenshot(`mobile-home-catalog-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile categories remain compact', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile categories density is mobile-specific')

    await page.goto('/categories')
    await expectMountedPage(page, '分类')
    await expect(page.getByRole('heading', { name: '全部题材' })).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-categories-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile search filters remain compact', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile search density is mobile-specific')

    await page.goto('/search')
    await expectMountedPage(page, '搜索与筛选')
    await expect(page.getByText('排序')).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-search-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile library records remain compact', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile library density is mobile-specific')

    await installNativeReaderFixture(page, {
      chapters: [],
      downloadedFiles: [
        makeNativeReaderDownloadedFile('3001', '話 001-006'),
        makeNativeReaderDownloadedFile('3089', '話 089-095')
      ]
    })
    await page.goto('/library')
    await expectMountedPage(page, '资料库')
    await expect(page.getByText('尖帽子的魔法工房').first()).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-library-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile account quota remains compact', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile account density is mobile-specific')

    await page.goto('/account')
    await expectMountedPage(page, '我的账号')
    await expect(page.getByText('reader-safe').first()).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-account-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile settings cache controls remain compact', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile settings density is mobile-specific')

    await page.goto('/settings')
    await expectMountedPage(page, '设置')
    await expect(page.getByRole('heading', { name: '阅读缓存' })).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-settings-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('mobile detail top section keeps reading actions above the fold', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile detail density is mobile-specific')

    await page.goto('/comic/53339')
    await expectMountedPage(page, '尖帽子的魔法工房')
    await expect(page.getByRole('button', { name: /加入书架|已在书架/ })).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-detail-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 200
    })
  })

  test('mobile shelf controls remain compact with saved items', async ({ page }, testInfo) => {
    test.skip(!mobileVisualProjects.has(testInfo.project.name), 'mobile shelf density is mobile-specific')

    await seedShelfVisualState(page)
    await page.goto('/shelf')
    await expectMountedPage(page, '书架')
    await expect(page.getByText('尖帽子的魔法工房').first()).toBeVisible()
    await expect(page).toHaveScreenshot(`mobile-shelf-${testInfo.project.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    })
  })
})
