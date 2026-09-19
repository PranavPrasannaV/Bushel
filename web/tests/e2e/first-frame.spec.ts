// T081 / T080: the first frames, on a desktop and on a phone, against the real shipped data. The home page is
// the national map and one search; a fire's own link opens straight onto its lit interior and its order.
import { expect, test, type Page } from '@playwright/test'

const FEATURED = 'north-complex-2020'

/** Pixels in the map canvas that read as the luminous interior (bright green: high green, low red). */
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


// A returning visitor: the county question has already been answered (see first-run.spec.ts for the first visit).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bushel.asked-home-county', 'yes')
    } catch {
      // storage blocked: the app just asks again, which these tests don't exercise
    }
  })
})

// The relief and water tiles are scenery from a public server; tests draw without them.
test.beforeEach(async ({ page }) => {
  await page.route(/basemap\.nationalmap\.gov\//, (route) => route.abort())
})

test('the home page is the national map: California built and checked, the lower 48 live, and one search', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('which forest can’t grow back on its own')
  await expect(page.getByRole('img', { name: /Map of the United States/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Open California/ })).toBeVisible()
  await expect(page.locator('.nation-dots circle')).toHaveCount(237)
  await expect(page.locator('.nation-state[data-status="live"]')).toHaveCount(48) // the lower 48 and DC, less California
  await expect(page.locator('.nation-state[data-status="later"]')).toHaveCount(2) // Alaska and Hawaii
  await expect(page.getByRole('combobox', { name: 'Search a county, an address or a fire' })).toBeVisible()
})

test("a fire's own link opens with its interior lit and its order", async ({ page }) => {
  await page.goto(`/?fire=${FEATURED}`)
  await expect(page.getByLabel('Fire', { exact: true })).toHaveValue(FEATURED)
  await expect(page.locator('.burn-map')).toHaveAttribute('data-peak', 'revealed', { timeout: 15_000 })
  expect(await interiorPixels(page)).toBeGreaterThan(500)
  await expect(page.getByTestId('total-bushels')).toHaveText(/\d/)
  await expect(page.getByRole('navigation', { name: 'Where you are' })).toContainText('North Complex')
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
    await page.goto(`/?fire=${FEATURED}`)
    await expect(page.locator('.burn-map')).toHaveAttribute('data-peak', 'revealed', { timeout: 15_000 })
    expect(await interiorPixels(page)).toBeGreaterThan(300)

    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(375)

    // The fire picker sits above the map, so changing fire never means scrolling past it.
    const picker = await page.getByLabel('Fire', { exact: true }).boundingBox()
    const canvas = await page.locator('.burn-map__canvas').boundingBox()
    expect(picker!.y).toBeLessThan(canvas!.y)
    expect(canvas!.y).toBeLessThan(812)
  })

  test('the home page fits the phone: search first, then the map', async ({ page }) => {
    await page.goto('/')
    const search = await page.getByRole('combobox', { name: 'Search a county, an address or a fire' }).boundingBox()
    const map = await page.getByRole('img', { name: /Map of the United States/ }).boundingBox()
    expect(search!.y).toBeLessThan(map!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})

test('California shows every fire and its counties, and picking a county opens its brief', async ({ page }) => {
  await page.goto('/?view=all') // the old overview link lands on California
  const map = page.locator('.burn-map')
  await expect(map).toHaveAttribute('data-view', 'overview', { timeout: 8000 })
  await expect(page.getByRole('heading', { name: 'California, 2018–2023' })).toBeVisible()
  await expect(page.getByText(/fires, each one’s seed-limited interior lit/)).toBeVisible()
  await expect.poll(() => interiorPixels(page), { timeout: 8000 }).toBeGreaterThan(10)

  await page.getByRole('button', { name: /^Butte County/ }).click()
  await expect(page).toHaveURL(/county=06007/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Butte County')
  await expect(page.locator('.region')).toContainText('Fires since 2018')
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('California')
})
