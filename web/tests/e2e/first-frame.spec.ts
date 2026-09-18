// T081 / T080 — the first frame is the peak, on a desktop and on a phone, against the real shipped data.
// A judge opens the link and touches nothing: the featured fire must already be drawn, its interior lit.
import { expect, test, type Page } from '@playwright/test'

const FEATURED = 'north-complex-2020'

/** Pixels in the map canvas that read as the luminous interior (bright mint: high green, low red). */
async function interiorPixels(page: Page): Promise<number> {
  const shot = await page.locator('.burn-map__canvas canvas').screenshot({ mask: [page.locator('.burn-map__legend')] })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 180 && d[i + 1] - d[i] > 100 && d[i + 2] > 120) n++
    return n
  }, shot.toString('base64'))
}

test('with no input, the featured fire opens with its interior lit and its own link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Fire', { exact: true })).toHaveValue(FEATURED)
  await expect(page.locator('.burn-map')).toHaveAttribute('data-peak', 'revealed', { timeout: 8000 })
  expect(await interiorPixels(page)).toBeGreaterThan(500)
  await expect(page).toHaveURL(new RegExp(`\\?fire=${FEATURED}$`))
})

test('a deep link opens that fire, and an unknown one falls back to the featured fire', async ({ page }) => {
  await page.goto('/?fire=dixie-2021')
  await expect(page.getByLabel('Fire', { exact: true })).toHaveValue('dixie-2021')
  await page.goto('/?fire=not-a-fire-1999')
  await expect(page.getByLabel('Fire', { exact: true })).toHaveValue(FEATURED)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('the interior is drawn without a resize, above the fold, and the page never scrolls sideways', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('.burn-map')).toHaveAttribute('data-peak', 'revealed', { timeout: 8000 })
    expect(await interiorPixels(page)).toBeGreaterThan(300)

    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(375)

    // The fire picker sits above the map, so changing fire never means scrolling past it.
    const picker = await page.getByLabel('Fire', { exact: true }).boundingBox()
    const canvas = await page.locator('.burn-map__canvas').boundingBox()
    expect(picker!.y).toBeLessThan(canvas!.y)
    expect(canvas!.y).toBeLessThan(812)
  })
})

test('All fires shows every interior over California, and picking one opens its order', async ({ page }) => {
  await page.goto('/?view=all')
  const map = page.locator('.burn-map')
  await expect(map).toHaveAttribute('data-view', 'overview', { timeout: 8000 })
  await expect(page.getByRole('heading', { name: 'California, 2018–2023' })).toBeVisible()
  await expect(page.getByText(/fires, each one's seed-limited interior lit/)).toBeVisible()
  await expect.poll(() => interiorPixels(page), { timeout: 8000 }).toBeGreaterThan(10)

  await page.getByRole('button', { name: /^Back to / }).click()
  await expect(map).toHaveAttribute('data-view', 'fire')
  await expect(page).not.toHaveURL(/view=all/)
})
