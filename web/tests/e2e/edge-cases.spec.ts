// T065, in the browser: edge-case fires render a stated finding in the real app: no page error, no blank
// panel, no zero dressed as a result (SC-009). The mapping of every spec.md edge case to its handling and its
// proof is at the top of tests/edge-cases.test.ts. Records are test data derived here from tests/fixtures and
// served via page.route; nothing is written to public/data.
import { existsSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const FIXTURES = new URL('../fixtures/', import.meta.url)
const REFERENCE = new URL('../../public/data/reference/', import.meta.url)
const fixture = (name: string) => JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'))
const EMPTY_FC = { type: 'FeatureCollection', features: [] }

type Rec = Record<string, unknown> & { fire: Record<string, unknown> }

/** Serve one fire (record + an index listing it) and the real reference files; collect page errors. */
async function openFire(page: Page, id: string, record: Rec): Promise<string[]> {
  const index = fixture('index.json')
  index.fires = [{ ...index.fires[0], id, name: record.fire.name, provisional: record.fire.provisional }]
  const files: Record<string, string> = {
    'fires/index.json': JSON.stringify(index),
    [`fires/${id}.json`]: JSON.stringify({ ...record, fire: { ...record.fire, id } }),
    [`fires/${id}.geojson`]: JSON.stringify(EMPTY_FC),
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
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/?fire=${id}`)
  await expect(page.getByLabel('Fire', { exact: true })).toHaveValue(id)
  await expect(page.locator('.summary')).toBeVisible()
  return errors
}

const base = fixture('fire.json') as Rec & { retained: Record<string, unknown>; planting: Record<string, unknown> }
const cell = (zone: string, low: number, species: string, acres: number) => ({
  cell_id: `${zone}_${low}`,
  seed_zone: zone,
  elevation_band: `${low}–${low + 500} ft`,
  planting_acres: acres,
  species: [{ species, acres }],
})

for (const [result, message, retained] of [
  [
    'no_retained_area',
    'Entire perimeter lies outside State Responsibility Area.',
    { ...base.retained, retained_acres: 0, excluded_acres: 5000, high_severity_acres: 0, conifer_acres: 0 },
  ],
  ['no_conifer', 'No conifer species present in pre-fire vegetation.', { ...base.retained, conifer_acres: 0 }],
] as const) {
  test(`${result}: the finding is stated, with no order, no zero total and no error`, async ({ page }) => {
    const errors = await openFire(page, `fixture-${result}`, {
      fire: { ...base.fire, name: `${result} fixture (test data)` },
      retained,
      planting: { ...base.planting, interior_acres: 0, interior_fraction: 0 },
      cells: [],
      result,
      message,
    })
    const finding = page.locator(`.finding[data-result="${result}"]`)
    await expect(finding).toContainText(message)
    await expect(finding).toContainText('This is a stated result for this fire, not an error.')
    await expect(page.getByTestId('total-bushels')).toHaveCount(0)
    await expect(page.locator('tr.order-row')).toHaveCount(0)
    await expect(page.locator('.assumptions')).toHaveCount(0)
    await expect(page.getByTestId('excluded-acres')).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('a fire still burning is stamped with its perimeter date and flagged provisional', async ({ page }) => {
  const errors = await openFire(page, 'fixture-provisional', {
    ...base,
    fire: { ...base.fire, name: 'Provisional fixture (test data)', provisional: true, perimeter_source_date: '2021-08-15' },
  })
  const summary = page.locator('.summary')
  await expect(summary).toContainText('Perimeter data as of 2021-08-15')
  await expect(summary.locator('.provisional-flag')).toHaveText('Provisional: perimeter may still change')
  await expect(page.locator('tr.order-row')).toHaveCount(6)
  expect(errors).toEqual([])
})

test('a fire whose every line is a Terms of Sale gap shows unknown totals, not zero', async ({ page }) => {
  const errors = await openFire(page, 'fixture-all-gap', {
    ...base,
    fire: { ...base.fire, name: 'All-gap fixture (test data)' },
    planting: { ...base.planting, interior_acres: 20, interior_fraction: 0.02 },
    cells: [cell('522', 6000, 'Lodgepole Pine', 12), cell('522', 6500, 'Subalpine Fir', 8)],
  })
  await expect(page.getByTestId('total-bushels')).toHaveText('—')
  await expect(page.getByTestId('total-cost')).toHaveText('—')
  await expect(page.getByTestId('gap-note')).toContainText('2 lines not computable (Lodgepole Pine, Subalpine Fir).')
  await expect(page.getByTestId('gap-note')).toContainText('Their 4,000 trees are left out of the totals above.')
  await expect(page.locator('tr.order-row .gap-cell')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('a fire with more lines than the table draws says so, and "Show all" draws every line', async ({ page }) => {
  // 300 single-species cells: more than FIRST_LINES (200), so the table starts with whole cells only.
  const cells = Array.from({ length: 300 }, (_, i) => cell(String(500 + (i % 30)), 500 * Math.floor(i / 30), 'Ponderosa Pine', 5))
  const errors = await openFire(page, 'fixture-large', {
    ...base,
    fire: { ...base.fire, name: 'Large fixture (test data)' },
    planting: { ...base.planting, interior_acres: 1500, interior_fraction: 0.5 },
    retained: { ...base.retained, high_severity_acres: 3000 },
    cells,
  })
  await expect(page.locator('.order-actions .count')).toHaveText('300')
  await expect(page.locator('tr.order-row')).toHaveCount(200)
  const note = page.getByTestId('lines-shown')
  await expect(note).toContainText('Showing the first 200 of 300 lines (whole cells).')
  await expect(note).toContainText('not merged or dropped: the totals and the export include every line')
  await note.getByRole('button', { name: 'Show all 300 lines' }).click()
  await expect(page.locator('tr.order-row')).toHaveCount(300)
  await expect(note).toContainText('All 300 lines shown.')
  await note.getByRole('button', { name: 'Show the first 200' }).click()
  await expect(page.locator('tr.order-row')).toHaveCount(200)
  expect(errors).toEqual([])
})
