// The first visit asks one question — which county do you work in — and never asks again. No account:
// the answer is kept in this browser only.
import { expect, test } from '@playwright/test'

// The relief and water tiles are scenery from a public server; tests draw without them.
test.beforeEach(async ({ page }) => {
  await page.route(/basemap\.nationalmap\.gov\//, (route) => route.abort())
})

test('a new visitor is asked for their county, lands there, and is greeted by it next time', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which county do you work in?')
  // Nothing here asks for an account or a password.
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0)
  await expect(page.locator('.first-run-sheet')).toContainText('saved on this device')

  await page.getByRole('combobox', { name: 'Which county do you work in?' }).fill('Plum')
  await page.getByRole('option', { name: /Plumas County/ }).click()
  await expect(page).toHaveURL(/county=06063/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plumas County')

  // Next visit: straight to the app, with the county remembered and one click away.
  await page.goto('/')
  await expect(page.locator('.first-run')).toHaveCount(0)
  const yours = page.locator('.home-yours')
  await expect(yours).toContainText('Plumas County')
  await yours.getByRole('button', { name: 'Plumas County' }).click()
  await expect(page).toHaveURL(/county=06063/)
})

test('the question can be skipped, and is not asked again', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(page.locator('.first-run')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('After a wildfire')
  await page.goto('/')
  await expect(page.locator('.first-run')).toHaveCount(0)
})
