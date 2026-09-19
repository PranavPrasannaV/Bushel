// The one search, and the places it opens: a county, a fire, an address inside California, and one outside.
// Counties and fires match on the device; the address route is driven with fixed points, so no geocoder is
// needed to test it.
import { expect, test, type Page } from '@playwright/test'

const SEARCH = { name: 'Search a county, an address or a fire' }

/** MTBS answers with one Oregon fire, and the geocoder with nothing: tests never call real services. */
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

test('an address outside California offers the fires near it, to build live', async ({ page }) => {
  await stubMtbs(page)
  await page.goto('/?at=45.515,-122.679&st=Oregon')
  const notice = page.locator('.home-notice')
  await expect(notice).toContainText('Oregon')
  await expect(notice).toContainText('Built live on request')
  await notice.getByRole('button', { name: /Beachie Creek/ }).click()
  await expect(page).toHaveURL(/us=OR4482112218820200816/)
})

test('a state in the lower 48 lists its largest fires; Alaska says why not yet', async ({ page }) => {
  await stubMtbs(page)
  await page.goto('/?state=TX')
  await expect(page.locator('.home-notice')).toContainText('Texas')
  await expect(page.locator('.home-notice-fires li')).toHaveCount(1)
  await page.goto('/?state=AK')
  await expect(page.locator('.home-notice')).toContainText('Not yet')
  await expect(page.locator('.home-notice')).toContainText('lower 48')
})

test('a county whose fires need no seed says why, fire by fire', async ({ page }) => {
  await page.goto('/?county=06059') // Orange County: chaparral and scrub
  await expect(page.locator('.region-verdict')).toContainText('No seed order here')
  await expect(page.locator('.region-verdict')).toContainText('burned no conifer forest')
  await expect(page.locator('.ranked-list')).toContainText('no conifer forest')
  await expect(page.locator('.title-stamp')).toContainText('No seed order needed')
})
