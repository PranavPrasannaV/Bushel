// T054 — quickstart Scenario 5: the seed-limited interior is legible at a glance (US2, SC-006, FR-005, FR-006).
// All /data/** requests are served from tests/fixtures (fire, index, geojson) and the real reference/*.json;
// nothing fabricated is ever written to public/data.
import { existsSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const FIXTURES = new URL('../fixtures/', import.meta.url)
const REFERENCE = new URL('../../public/data/reference/', import.meta.url)
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8')

// FR-005, verbatim (docs/03-DO-NOT-CLAIM.md).
const THRESHOLD = '90 m — Baker (2023), the published estimate least favourable to this conclusion.'
const NO_INTERIOR = 'All burned acres lie within natural seeding distance. No planting order required.'

/** Serve `files` (paths relative to /data/) and the real reference files; everything else under /data/ is 404. */
async function serve(page: Page, files: Record<string, string>) {
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

/** Pixels in the map canvas that read as the luminous interior (bright mint: high green, low red). */
async function interiorPixels(page: Page): Promise<number> {
  // Mask the legend: its interior swatch is the same colour.
  const shot = await page.locator('.burn-map__canvas canvas').screenshot({ mask: [page.locator('.burn-map__legend')] })
  const png = shot.toString('base64')
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
  }, png)
}

test('the interior is drawn as the luminous layer, with the threshold statement and a cross-check', async ({
  page,
}) => {
  const fire = fixture('fire.json')
  const id = (JSON.parse(fire) as { fire: { id: string } }).fire.id
  await serve(page, {
    'fires/index.json': fixture('index.json'),
    [`fires/${id}.json`]: fire,
    [`fires/${id}.geojson`]: fixture('fire.geojson'),
  })
  await page.goto('/')
  await page.getByLabel('Fire', { exact: true }).selectOption(id)

  const map = page.locator('.burn-map')
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible()

  // The legend names the interior first, apart from the rest of the burn: plain words first, the technical
  // name under them.
  const legend = page.getByRole('list', { name: 'Map legend' })
  await expect(legend.getByRole('listitem').first()).toContainText('Too far from surviving trees to reseed')
  await expect(legend.getByRole('listitem').first()).toContainText('Seed-limited interior')
  await expect(legend).toContainText('Rest of high-severity burn')
  await expect(legend).toContainText('Fire perimeter')
  await expect(legend).not.toContainText('Retained non-federal')

  // FR-005: the statement, exactly. Never "most conservative".
  await expect(page.getByText(THRESHOLD, { exact: true })).toBeVisible()
  await expect(page.getByText(/most conservative/i)).toHaveCount(0)

  // The computed fraction beside Baker's reference, as a cross-check. Fixture: 517 / 1000 acres = 51.7%.
  await expect(map).toContainText("51.7% of the badly burned conifer forest the state is responsible for can't reseed itself")
  await expect(map).toContainText('Computed interior 51.7% of high-severity conifer acres')
  await expect(map).toContainText('Published estimate: Baker 21.9% (cross-check, not a multiplier)')

  // The one peak: after the rest of the burn draws, the interior rises and lights up the canvas.
  await expect(map).toHaveAttribute('data-peak', 'revealed', { timeout: 10_000 })
  expect(await interiorPixels(page)).toBeGreaterThan(500)

  // FR-006: nothing on the map can change the threshold or the reference fraction. Its one control is the
  // "All fires" view toggle, which changes what is shown, never a value.
  const region = page.locator('.map-region')
  await expect(region.locator('input, select, textarea, [role="slider"]')).toHaveCount(0)
  await expect(region.locator('button')).toHaveCount(1)
  await expect(region.locator('button')).toHaveText('All fires')
})

test('a fire with no interior shows its perimeter and says so, without crashing', async ({ page }) => {
  const base = JSON.parse(fixture('fire.json')) as Record<string, unknown> & { fire: { id: string; name: string } }
  const id = 'fixture-no-interior'
  const index = JSON.parse(fixture('index.json')) as { fires: Record<string, unknown>[] }
  index.fires = [{ ...index.fires[0], id, name: 'No-Interior Fixture (test data)', interior_acres: 0 }]
  // An empty-result record: a stated finding in place of planting and cells (contract §2).
  const record = {
    fire: { ...base.fire, id, name: 'No-Interior Fixture (test data)' },
    retained: base.retained,
    result: 'no_interior',
    message: NO_INTERIOR,
  }
  const geo = JSON.parse(fixture('fire.geojson')) as { features: { properties: { layer: string } }[] }
  geo.features = geo.features.filter((f) => ['perimeter', 'retained', 'high_severity'].includes(f.properties.layer))

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await serve(page, {
    'fires/index.json': JSON.stringify(index),
    [`fires/${id}.json`]: JSON.stringify(record),
    [`fires/${id}.geojson`]: JSON.stringify(geo),
  })
  await page.goto('/')
  await page.getByLabel('Fire', { exact: true }).selectOption(id)

  const map = page.locator('.burn-map')
  await expect(map.locator('canvas.maplibregl-canvas')).toBeVisible()
  await expect(map).toContainText('No seed-limited interior on this fire.')
  await expect(page.getByText(THRESHOLD, { exact: true })).toBeVisible()
  await expect(page.getByText(NO_INTERIOR).first()).toBeVisible()
  await expect(map).toHaveAttribute('data-peak', 'none')
  expect(await interiorPixels(page)).toBeLessThan(50)
  expect(errors).toEqual([])
})
