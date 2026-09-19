// T044 — quickstart Scenario 1: an order appears, itemised and sourced (US1, SC-001, SC-002).
// All /data/** requests are served from tests/fixtures (fire + index) and the real reference/*.json;
// nothing fabricated is ever written to public/data.
import { existsSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const FIXTURES = new URL('../fixtures/', import.meta.url)
const REFERENCE = new URL('../../public/data/reference/', import.meta.url)
const EMPTY_FC = JSON.stringify({ type: 'FeatureCollection', features: [] })

async function serveFixtures(page: Page) {
  const fire = readFileSync(new URL('fire.json', FIXTURES), 'utf8')
  const id = (JSON.parse(fire) as { fire: { id: string } }).fire.id
  const geo = new URL('fire.geojson', FIXTURES)
  const files: Record<string, string> = {
    'fires/index.json': readFileSync(new URL('index.json', FIXTURES), 'utf8'),
    [`fires/${id}.json`]: fire,
    [`fires/${id}.geojson`]: existsSync(geo) ? readFileSync(geo, 'utf8') : EMPTY_FC,
  }
  await page.route(
    (url) => url.pathname.startsWith('/data/'),
    async (route) => {
      const rel = new URL(route.request().url()).pathname.slice('/data/'.length)
      let body = files[rel]
      if (body === undefined && rel.startsWith('reference/')) {
        const f = new URL(rel.slice('reference/'.length), REFERENCE)
        if (existsSync(f)) body = readFileSync(f, 'utf8')
      }
      if (body === undefined) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' })
      return route.fulfill({ status: 200, contentType: 'application/json', body })
    },
  )
}

test.beforeEach(async ({ page }) => {
  await serveFixtures(page)
  await page.goto('/?fire=fixture-fire')
  await expect(page.getByLabel('Fire', { exact: true })).toHaveValue('fixture-fire')
})

test('selecting a fire shows one line per cell × species with zone, band, species and bushels', async ({ page }) => {
  const rows = page.locator('tr.order-row')
  // Fixture: 522_4500 {Douglas Fir, Sugar Pine}, 522_5000 {Douglas Fir, Western White Pine, Knobcone Pine},
  // 526_3000 {Ponderosa Pine}. Six lines in three cells, none merged.
  await expect(rows).toHaveCount(6)
  await expect(page.locator('tbody.cell-group')).toHaveCount(3)
  await expect(page.getByText('Provenance Lock — cells are never merged.')).toBeVisible()

  const expected = [
    ['522', '4500–5000 ft', 'Douglas Fir'],
    ['522', '4500–5000 ft', 'Sugar Pine'],
    ['522', '5000–5500 ft', 'Douglas Fir'],
    ['522', '5000–5500 ft', 'Western White Pine'],
    ['522', '5000–5500 ft', 'Knobcone Pine'],
    ['526', '3000–3500 ft', 'Ponderosa Pine'],
  ]
  for (const [i, [zone, band, species]] of expected.entries()) {
    const row = rows.nth(i)
    await expect(row.locator('.col-zone')).toHaveText(zone)
    await expect(row.locator('.col-band')).toHaveText(band)
    await expect(row.locator('.col-species')).toHaveText(species)
  }

  // Bushels of cones, per line. Ponderosa: 462 ac × 200 TPA ÷ ((9,240 ÷ 2) × 0.9 × 0.9) ÷ 1.0 lb/bushel ≈ 24.7.
  const ponderosa = rows.nth(5)
  await expect(ponderosa.locator('.col-bushels')).toHaveText('24.7')
  await expect(ponderosa.locator('.priority-badge')).toHaveAttribute('data-priority', '2')
  await expect(page.locator('thead')).toContainText('Bushels of cones')

  // Table 2 fallback flagged; the Terms of Sale gap disclosed, not filled.
  await expect(rows.nth(3).locator('.fallback-dagger')).toHaveAttribute('aria-label', 'Table 2 fallback')
  await expect(rows.nth(4).locator('.gap-cell')).toContainText('Not computable')
  await expect(page.getByTestId('gap-note')).toContainText('1 line not computable')

  // Headline totals in bushels of cones, never "of seed".
  await expect(page.getByTestId('total-bushels')).toHaveText(/\d/)
  await expect(page.locator('.summary')).toContainText('bushels of cones')
  for (const region of ['.summary', '.assumptions', '.order-table-section']) {
    await expect(page.locator(region)).not.toContainText(/bushels? of (conifer )?seed/i)
  }
})

test('retained and excluded acres, the perimeter date and the provisional state are stated', async ({ page }) => {
  const summary = page.locator('.summary')
  await expect(page.getByTestId('retained-acres')).toHaveText('3,000 ac')
  await expect(page.getByTestId('excluded-acres')).toHaveText('2,000 ac')
  // The acreage lives in the report's funnel; the slip carries the date and the provisional flag.
  await expect(page.locator('.funnel')).toContainText('Outside State Responsibility Area')
  await expect(summary).toContainText('Perimeter data as of 2021-10-01')
  await expect(summary.locator('.provisional-flag')).toHaveCount(0) // fixture is not provisional
})

test("opening a line's trail lists every factor with its source", async ({ page }) => {
  await page.locator('tr.order-row').first().click()
  const trail = page.locator('.factor-trail')
  await expect(trail).toBeVisible()
  await expect(trail).toContainText(
    'seedlings/lb = (seeds/lb ÷ seeds/pot) × nursery survival × probability of a tree in nursery',
  )

  const factors = trail.locator('.trail-factor')
  await expect(factors).toHaveCount(7)
  for (let i = 0; i < 7; i++) {
    const f = factors.nth(i)
    await expect(f.locator('.source-ref')).toHaveText(/\S/)
    if ((await f.getAttribute('data-status')) === 'unpublished') {
      await expect(f).toHaveClass(/\bunpublished\b/)
      await expect(f).toContainText('Not published by CAL FIRE')
    } else {
      await expect(f).toHaveClass(/\bpublished\b/)
    }
  }
  await expect(trail.locator('[data-factor="seeds_per_lb"] .source-ref')).toContainText('Terms of Sale')
  await expect(trail.locator('[data-factor="lbs_clean_seed_per_bushel"] .source-ref')).toContainText('Table 2')
  await expect(trail.locator('[data-factor="stocking_tpa"] .source-ref')).toContainText('AON')
  await expect(trail.locator('.trail-factor.unpublished')).toHaveCount(3)

  // Clicking the same line again closes it.
  await page.locator('tr.order-row').first().click()
  await expect(trail).toHaveCount(0)
})
