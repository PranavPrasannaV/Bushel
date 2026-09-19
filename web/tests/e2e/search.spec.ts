// The one search, and the places it opens: a county, a fire, an address inside California, and one outside.
// Counties and fires match on the device; the address route is driven with fixed points, so no geocoder is
// needed to test it.
import { expect, test, type Page } from '@playwright/test'

const SEARCH = { name: 'Search a county, an address or a fire' }

/** MTBS answers with one Oregon fire (a small square burn), and the geocoder with nothing: tests never call real services. */
async function stubMtbs(page: Page) {
  await page.route(/photon\.komoot\.io\//, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
    }),
  )
  await page.route(/apps\.fs\.usda\.gov\//, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        features: [
          {
            attributes: {
              fire_id: 'OR4482112218820200816',
              fire_name: 'BEACHIE CREEK',
              year: 2020,
              acres: 193573,
              ig_date: 20200816,
              fire_type: 'Wildfire',
            },
            geometry: {
              rings: [
                [
                  [-122.4, 44.7],
                  [-122.4, 44.9],
                  [-122.1, 44.9],
                  [-122.1, 44.7],
                  [-122.4, 44.7],
                ],
              ],
            },
          },
        ],
      }),
    }),
  )
}


// The relief and water tiles are scenery from a public server; tests draw without them.
test.beforeEach(async ({ page }) => {
  await page.route(/basemap\.nationalmap\.gov\//, (route) => route.abort())
})

test('typing a county name lists it, and choosing it opens the county', async ({ page }) => {
  await stubMtbs(page)
  await page.goto('/')
  const box = page.getByRole('combobox', SEARCH)
  await box.fill('plumas')
  const option = page.getByRole('option', { name: /Plumas County/ })
  await expect(option).toBeVisible()
  await expect(option).toContainText('fires')
  await box.press('Enter')
  await expect(page).toHaveURL(/county=06063/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plumas County')
  await expect(page.locator('.region-table')).toContainText('Dixie')
})

test('a fire found by name opens its order, from any page', async ({ page }) => {
  await stubMtbs(page)
  await page.goto('/?county=06063')
  await expect(page.getByRole('combobox', SEARCH)).toBeVisible()
  await page.keyboard.press('/')
  await expect(page.getByRole('combobox', SEARCH)).toBeFocused()
  await page.keyboard.type('caldor')
  // Local matches lead the list; Enter takes the first even while addresses are still arriving below it.
  await expect(page.getByRole('option', { name: /Caldor/ }).first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/fire=caldor-2021/)
  await expect(page.getByLabel('Fire', { exact: true })).toHaveValue('caldor-2021')
})

test('an address inside a burn says so, and names its county', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Paradise, CA' }).click()
  await expect(page).toHaveURL(/at=39\.760,-121\.622/)
  await expect(page.locator('.region-verdict')).toContainText('Inside the Camp fire')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Butte County')
  // The link carries the rounded point, never the address text.
  expect(page.url()).not.toContain('Paradise')
})

test('an address outside California opens its state, with the fires near it to build live', async ({ page }) => {
  await stubMtbs(page)
  await page.goto('/?at=45.515,-122.679&st=Oregon')
  const panel = page.locator('.region')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oregon')
  await expect(panel).toContainText('Built live on request')
  await expect(panel).toContainText('Fires within 60 km')
  await panel.getByRole('button', { name: /Beachie Creek/ }).first().click()
  await expect(page).toHaveURL(/us=OR4482112218820200816/)
})

test('any state on the national map opens its own map of fires; Alaska says why not yet', async ({ page }) => {
  await stubMtbs(page)
  await page.goto('/')
  await page.getByRole('link', { name: /^Texas/ }).click()
  await expect(page).toHaveURL(/state=TX/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Texas')
  await expect(page.getByRole('navigation', { name: 'Where you are' })).toContainText('Texas')
  await expect(page.locator('.region .ranked-list li')).toHaveCount(1)
  await expect(page.locator('.burn-map__legend')).toContainText('A fire, sized by the acres it burned')
  await page.goto('/?state=AK')
  await expect(page.locator('.region')).toContainText('Not yet')
  await expect(page.locator('.region')).toContainText('lower 48')
})

test('a state map is not locked to its state: it pans east across the country, and a click on another state opens it', async ({
  page,
}) => {
  await stubMtbs(page)
  await page.goto('/?view=state')
  const map = page.locator('.burn-map')
  await expect(map).toHaveAttribute('data-view', 'overview')
  type DevMap = { getCenter(): { lng: number }; getMaxBounds(): unknown; project(p: [number, number]): { x: number; y: number } }
  const dev = () => (window as unknown as { __bushelMap: DevMap }).__bushelMap
  const lon = () => page.evaluate(`(${dev})().getCenter().lng`) as Promise<number>
  // Fitted to California, with its leash set.
  const fitted = async () => {
    await expect.poll(() => page.evaluate(`!!(${dev})()?.getMaxBounds()`)).toBe(true)
    await page.waitForTimeout(400)
  }
  await fitted()
  const before = await lon()
  const canvas = page.locator('.burn-map__canvas canvas')
  const box = (await canvas.boundingBox())!
  // Drag the map west, twice: the view travels east, past California.
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.5, { steps: 12 })
    await page.mouse.up()
  }
  expect(await lon()).toBeGreaterThan(before + 5)
  if (process.env.BUSHEL_SHOT) await page.screenshot({ path: process.env.BUSHEL_SHOT })

  // Nevada, off California's edge: a click on it opens Nevada.
  await page.goto('/?view=state')
  await fitted()
  const nv = (await page.evaluate(`(${dev})().project([-116.2, 40.2])`)) as { x: number; y: number }
  await canvas.click({ position: { x: nv.x, y: nv.y } })
  await expect(page).toHaveURL(/state=NV/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nevada')
})

test('a county whose fires need no seed says why, fire by fire', async ({ page }) => {
  await page.goto('/?county=06059') // Orange County: chaparral and scrub
  await expect(page.locator('.region-verdict')).toContainText('No seed order here')
  await expect(page.locator('.region-verdict')).toContainText('burned no conifer forest')
  await expect(page.locator('.ranked-list')).toContainText('no conifer forest')
  await expect(page.locator('.title-stamp')).toContainText('No seed order needed')
})
