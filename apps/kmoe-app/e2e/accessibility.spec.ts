import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { installKmoeFixtureRoutes } from './fixtures/kmoeFixture'

const auditedRoutes = ['/', '/search', '/categories', '/comic/53339', '/settings', '/downloads', '/library']

test.describe('accessibility smoke audit', () => {
  test.beforeEach(async ({ page }) => {
    await installKmoeFixtureRoutes(page)
  })

  for (const route of auditedRoutes) {
    test(`has no serious axe violations on ${route}`, async ({ page }) => {
      await page.goto(route)
      await expect(page.getByRole('main')).toBeVisible()

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const serious = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')

      expect(
        serious.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          targets: violation.nodes.map((node) => node.target)
        }))
      ).toEqual([])
    })
  }
})

test.describe('keyboard workflows', () => {
  test.beforeEach(async ({ page }) => {
    await installKmoeFixtureRoutes(page)
  })

  test('can open the detail page from the first catalog card with the keyboard', async ({ page }) => {
    await page.goto('/')
    const firstDetailLink = page.getByRole('link', { name: /查看详情：/ }).first()

    await firstDetailLink.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: '尖帽子的魔法工房' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '目录' })).toBeVisible()
  })
})
