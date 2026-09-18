// T045 — quickstart Scenario 2: unpublished factors are visibly unpublished (US1, SC-003, FR-012, FR-013).
// All /data/** requests are served from tests/fixtures (fire + index) and the real reference/*.json.
import { existsSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const FIXTURES = new URL('../fixtures/', import.meta.url)
const REFERENCE = new URL('../../public/data/reference/', import.meta.url)
const EMPTY_FC = JSON.stringify({ type: 'FeatureCollection', features: [] })
const UNPUBLISHED = ['seeds_per_pot', 'nursery_survival_rate', 'probability_of_tree_in_nursery']

const isData = (url: URL) => url.pathname.startsWith('/data/')

async function serveFixtures(page: Page) {
  const fire = readFileSync(new URL('fire.json', FIXTURES), 'utf8')
  const id = (JSON.parse(fire) as { fire: { id: string } }).fire.id
  const geo = new URL('fire.geojson', FIXTURES)
  const files: Record<string, string> = {
    'fires/index.json': readFileSync(new URL('index.json', FIXTURES), 'utf8'),
    [`fires/${id}.json`]: fire,
    [`fires/${id}.geojson`]: existsSync(geo) ? readFileSync(geo, 'utf8') : EMPTY_FC,
  }
  await page.route(isData, async (route) => {
    const rel = new URL(route.request().url()).pathname.slice('/data/'.length)
    let body = files[rel]
    if (body === undefined && rel.startsWith('reference/')) {
      const f = new URL(rel.slice('reference/'.length), REFERENCE)
      if (existsSync(f)) body = readFileSync(f, 'utf8')
    }
    if (body === undefined) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
    return route.fulfill({ status: 200, contentType: 'application/json', body })
  })
}

const number = (text: string | null) => Number((text ?? '').replace(/,/g, ''))

test.beforeEach(async ({ page }) => {
  await serveFixtures(page)
  await page.goto('/')
  await page.getByLabel('Fire', { exact: true }).selectOption('fixture-fire')
  await expect(page.locator('tr.order-row')).toHaveCount(6)
})

test('the three unpublished factors are amber, labelled, bounded and adjustable', async ({ page }) => {
  // The reserved amber token, resolved in the page, so the test tracks tokens.css rather than a hex value.
  const amber = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.borderLeftColor = 'var(--color-unpublished-border)'
    document.body.append(probe)
    const c = getComputedStyle(probe).borderLeftColor
    probe.remove()
    return c
  })

  for (const name of UNPUBLISHED) {
    const box = page.locator(`.assumption[data-name="${name}"]`)
    await expect(box).toHaveClass(/\bunpublished\b/)
    await expect(box).toContainText('Not published by CAL FIRE')
    await expect(box).toContainText('Default')
    await expect(box).toContainText('bounds')
    await expect(box).toHaveCSS('border-left-color', amber)
    await expect(box.locator('input[type="number"]')).toBeEditable()
    await expect(box.locator('input[type="range"]')).toBeEnabled()
    await expect(box.locator('.rationale')).toContainText('Why this default')
  }

  // Stocking is published: adjustable, not amber, with its maximum-stocking caveat beside the control.
  const stocking = page.locator('.assumption[data-name="stocking_tpa"]')
  await expect(stocking).toHaveClass(/\bpublished\b/)
  await expect(stocking).not.toHaveClass(/\bunpublished\b/)
  await expect(stocking).not.toHaveCSS('border-left-color', amber)
  await expect(stocking.locator('.caveat')).toContainText('maximum-stocking worst case, not a point estimate')
})

test('adjusting a factor recomputes the totals with no reload and no data request', async ({ page }) => {
  await page.waitForLoadState('networkidle')
  const total = page.getByTestId('total-bushels')
  const beforeText = (await total.textContent()) ?? ''
  const before = number(beforeText)
  expect(before).toBeGreaterThan(0)

  const dataRequests: string[] = []
  let navigations = 0
  page.on('request', (r) => {
    if (isData(new URL(r.url()))) dataRequests.push(r.url())
  })
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations += 1
  })
  await page.evaluate(() => {
    ;(window as unknown as { __bushelMarker: string }).__bushelMarker = 'same page'
  })

  // Survival 0.9 -> 0.6 multiplies every line's pounds and bushels by 1.5.
  await page.getByLabel('Nursery survival rate', { exact: true }).fill('0.6')
  await expect(page.getByTestId('used-nursery_survival_rate')).toHaveText('using 0.6')
  await expect(total).not.toHaveText(beforeText)
  const after = number(await total.textContent())
  expect(after).toBeCloseTo(before * 1.5, 0)

  expect(dataRequests).toEqual([])
  expect(navigations).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __bushelMarker?: string }).__bushelMarker)).toBe(
    'same page',
  )
})

test('an entry beyond the bounds is clamped and the trail shows the value used', async ({ page }) => {
  const total = page.getByTestId('total-bushels')
  const beforeText = (await total.textContent()) ?? ''
  const before = number(beforeText)

  await page.locator('tr.order-row').first().click()
  const trailValue = page.locator('.factor-trail [data-factor="seeds_per_pot"] .factor-value')
  await expect(trailValue).toHaveText(/^2\s*seeds\/pot$/)

  const input = page.getByLabel('Seeds per pot', { exact: true })
  await input.fill('9') // max is 4
  await expect(page.getByTestId('used-seeds_per_pot')).toHaveText('using 4')
  await expect(page.locator('.assumption[data-name="seeds_per_pot"]')).toContainText('9 is outside the bounds')
  await expect(trailValue).toHaveText(/^4\s*seeds\/pot$/)
  // 4 seeds/pot instead of 2 halves seedlings/lb, so bushels double.
  expect(number(await total.textContent())).toBeCloseTo(before * 2, 0)

  // Leaving the field snaps it to the bound actually used.
  await input.blur()
  await expect(input).toHaveValue('4')

  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(page.getByTestId('used-seeds_per_pot')).toHaveText('using 2')
  await expect(trailValue).toHaveText(/^2\s*seeds\/pot$/)
  await expect(total).toHaveText(beforeText)
  await expect(page.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled()
})
