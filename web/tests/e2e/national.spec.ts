// A live national build, end to end in the browser, against stand-in national services. The stand-ins
// serve one synthetic fire: a 6 km square burn whose central 3 km square burned at high severity, all of it
// ponderosa pine forest on non-federal land. The seed-limited interior is then that central square less
// 90 m on each side, so the expected acres follow from geometry alone.
//
// The real services are never called from tests: they are public infrastructure, and their load balancer
// turns away headless browsers.
import { expect, test, type Page, type Route } from '@playwright/test'
import { writeArrayBuffer } from 'geotiff'

const ID = 'OR4400012300020200801'
const CX = -13400000 // centre of the burn, EPSG:3857
const CY = 5600000
const K = 1 / Math.cos((2 * Math.atan(Math.exp(CY / 6378137)) - Math.PI / 2)) // 3857 units per ground metre
const PERIMETER = 3000 * K // half-width of the 6 km burn
const CORE = 1500 * K // half-width of the 3 km high-severity core
const square = (h: number) => [
  [CX - h, CY - h],
  [CX - h, CY + h],
  [CX + h, CY + h],
  [CX + h, CY - h],
  [CX - h, CY - h],
]
const ACRE_M2 = 4046.8564224
// The core less 90 m a side, on the 30 m grid: whole cells whose centre lies more than 90 m inside.
const EXPECTED_INTERIOR_ACRES = ((3000 - 2 * 90) * (3000 - 2 * 90)) / ACRE_M2

const ATTRS = { fire_id: ID, fire_name: 'TEST RIDGE', year: 2020, acres: 8896, ig_date: 20200801, fire_type: 'Wildfire' }

async function tiff(url: URL): Promise<Buffer> {
  const [w, h] = (url.searchParams.get('size') ?? '1,1').split(',').map(Number)
  const [west, , , north] = (url.searchParams.get('bbox') ?? '0,0,0,0').split(',').map(Number)
  const [, south, east] = (url.searchParams.get('bbox') ?? '0,0,0,0').split(',').map(Number)
  const rx = (east - west) / w
  const ry = (north - south) / h
  const path = url.pathname
  const mosaic = url.searchParams.get('mosaicRule') ?? ''
  const pixelType = url.searchParams.get('pixelType')
  const Ctor = pixelType === 'F32' ? Float32Array : pixelType === 'U16' ? Uint16Array : Uint8Array
  const v = new Ctor(w * h)
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const x = west + (c + 0.5) * rx
      const y = north - (r + 0.5) * ry
      const inCore = Math.abs(x - CX) < CORE && Math.abs(y - CY) < CORE
      let value = 0
      if (path.includes('MTBS_CONUS')) value = inCore ? 4 : 2 // high severity in the core, low around it
      else if (path.includes('ForestTypeGroup')) value = 220 // ponderosa pine group
      else if (path.includes('3DEPElevation')) value = 1500 // metres: the 4,500–5,000 ft band
      else if (path.includes('TreeSpeciesMetrics')) value = mosaic.includes("'ponderosa_pine'") ? 50 : 0
      v[r * w + c] = value
    }
  const bits = Ctor === Float32Array ? 32 : Ctor === Uint16Array ? 16 : 8
  const buf = await writeArrayBuffer(v, {
    width: w,
    height: h,
    BitsPerSample: [bits],
    SampleFormat: [Ctor === Float32Array ? 3 : 1],
    SamplesPerPixel: 1,
    PhotometricInterpretation: 1,
  })
  return Buffer.from(buf)
}

async function nationalServices(page: Page) {
  const cors = { 'Access-Control-Allow-Origin': '*' }
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(/(apps\.fs\.usda\.gov|imagery\.geoplatform\.gov|elevation\.nationalmap\.gov|services1?\.arcgis\.com)\//, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/exportImage')) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'image/tiff', body: await tiff(url) })
    }
    if (url.pathname.includes('EDW_MTBS_01/MapServer/63/query')) {
      const withGeometry = url.searchParams.get('returnGeometry') === 'true'
      return json(route, {
        features: [{ attributes: ATTRS, ...(withGeometry ? { geometry: { rings: [square(PERIMETER)] } } : {}) }],
      })
    }
    if (url.pathname.includes('Provisional_Seed_Zones')) {
      return json(route, {
        features: [
          {
            attributes: { seed_zone: '20 - 25 Deg. F. / < 2', LIII_Name: 'Test Range' },
            geometry: { rings: [square(PERIMETER * 3)] },
          },
        ],
      })
    }
    if (url.pathname.includes('Manager_Type_PADUS')) return json(route, { features: [] })
    return route.fulfill({ status: 404, headers: cors, body: 'not stubbed' })
  })
}

/** Pixels in the map canvas that read as the lit interior (bright green: high green, low red). */
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


// The relief and water tiles are scenery from a public server; tests draw without them.
test.beforeEach(async ({ page }) => {
  await page.route(/basemap\.nationalmap\.gov\//, (route) => route.abort())
})

test('a fire outside California is built live in the browser, step by step, into an order', async ({ page }) => {
  await nationalServices(page)
  await page.goto(`/?us=${ID}`)

  // The order appears once every source has answered.
  await expect(page.getByTestId('total-bushels')).toHaveText(/\d/, { timeout: 30_000 })
  await expect(page.getByRole('navigation', { name: 'Where you are' })).toContainText('Oregon')
  await expect(page.locator('.title-kicker')).toContainText('built live from national data')

  // The interior is the core less 90 m a side, within a cell's rounding.
  const stamp = await page.locator('.title-stamp-key').innerText()
  const acres = Number(stamp.replace(/[^\d]/g, ''))
  expect(Math.abs(acres - EXPECTED_INTERIOR_ACRES) / EXPECTED_INTERIOR_ACRES).toBeLessThan(0.06)

  // It is all ponderosa pine, in one seed zone × band, so every line is computable.
  await expect(page.locator('tr.order-row')).toHaveCount(1)
  await expect(page.locator('tr.order-row')).toContainText('Ponderosa Pine')
  await expect(page.locator('tr.order-row .col-band')).toHaveText('4500–5000 ft')
  await expect(page.getByTestId('gap-note')).toHaveCount(0)

  // The interior rises on the map, drawn from the build's own raster.
  await expect(page.locator('.burn-map')).toHaveAttribute('data-peak', 'revealed', { timeout: 10_000 })
  expect(await interiorPixels(page)).toBeGreaterThan(200)
  if (process.env.BUSHEL_SHOT) await page.screenshot({ path: process.env.BUSHEL_SHOT })

  // The report says where every number came from, and that this is not a checked build.
  const sources = page.locator('.live-sources')
  await expect(sources).toContainText('Where these numbers came from')
  await expect(sources).toContainText('No published figure yet')
  await expect(sources.locator('tbody tr')).toHaveCount(8)
})

test('any US fire is found by name in the search and opens as a live build', async ({ page }) => {
  await nationalServices(page)
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Search a county, an address or a fire' }).fill('test ridge')
  const option = page.getByRole('option', { name: /Test Ridge/ })
  await expect(option).toContainText('build live')
  await option.click()
  await expect(page).toHaveURL(new RegExp(`us=${ID}`))
  await expect(page.getByTestId('total-bushels')).toHaveText(/\d/, { timeout: 30_000 })
})
