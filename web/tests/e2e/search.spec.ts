// The one search, and the places it opens: a county, a fire, an address inside California, and one outside.
// Counties and fires match on the device; the address route is driven with fixed points, so no geocoder is
// needed to test it.
import { expect, test } from '@playwright/test'

const SEARCH = { name: 'Search a county, an address or a fire' }

test('typing a county name lists it, and choosing it opens the county', async ({ page }) => {
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

test('an address outside California is shown on the national map as not yet covered', async ({ page }) => {
  await page.goto('/?at=45.515,-122.679&st=Oregon')
  const notice = page.locator('.home-notice')
  await expect(notice).toContainText('Oregon')
  await expect(notice).toContainText('Next: the West')
  await notice.getByRole('button', { name: 'Open California instead' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('California')
})

test('a greyed state explains what it would take', async ({ page }) => {
  await page.goto('/?state=TX')
  await expect(page.locator('.home-notice')).toContainText('Texas')
  await expect(page.locator('.home-notice')).toContainText('Not yet')
})

test('a county whose fires need no seed says why, fire by fire', async ({ page }) => {
  await page.goto('/?county=06059') // Orange County: chaparral and scrub
  await expect(page.locator('.region-verdict')).toContainText('No seed order here')
  await expect(page.locator('.region-verdict')).toContainText('burned no conifer forest')
  await expect(page.locator('.ranked-list')).toContainText('no conifer forest')
  await expect(page.locator('.title-stamp')).toContainText('No seed order needed')
})
