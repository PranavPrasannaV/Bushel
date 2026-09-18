// Devpost gallery images (T084), captured from a running copy of the site with headless Chromium.
//   node scripts/gallery.mjs [base-url]      default http://localhost:5173/
// Writes docs/gallery/*.png at 1440×900. Every image is the real app on real data; nothing is staged.
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:5173/'
const out = new URL('../../docs/gallery/', import.meta.url)
mkdirSync(out, { recursive: true })
const file = (name) => new URL(name, out).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const peak = () => page.locator('.burn-map').getAttribute('data-peak')

async function open(query) {
  await page.goto(new URL(query, base).href)
  await page.waitForFunction(() => document.querySelector('.burn-map')?.dataset.peak === 'revealed', null, {
    timeout: 20_000,
  })
  await page.waitForTimeout(400)
}

// 1. The first frame: the featured fire, its interior lit, the order beside it.
await open('?fire=north-complex-2020')
await page.screenshot({ path: file('01-first-frame.png') })

// 2. The interior close up: the map pane alone.
await page.locator('.map-region').screenshot({ path: file('02-interior.png') })

// 3. The order summary: acres retained and excluded, the interior, bushels, pounds, dollars.
await page.locator('.summary').first().screenshot({ path: file('03-order.png') })

// 4. One order line's factor trail: every factor beside the CAL FIRE table it came from.
const firstLine = page.locator('.order-table tbody tr').first()
await firstLine.click()
await page.waitForTimeout(300)
await page.locator('.factor-trail').first().screenshot({ path: file('04-factor-trail.png') })

// 5. The three factors CAL FIRE doesn't publish, in amber.
await page.locator('.assumptions, .assumption-panel').first().screenshot({ path: file('05-unpublished-factors.png') })

// 6. Validation: the like-for-like check first.
await page.locator('.validation').screenshot({ path: file('06-validation.png') })

// 7. All fires over California.
await page.goto(new URL('?view=all', base).href)
await page.waitForFunction(() => document.querySelector('.burn-map')?.dataset.view === 'overview', null, {
  timeout: 20_000,
})
await page.waitForTimeout(1500)
await page.screenshot({ path: file('07-all-fires.png') })

console.log(`peak on last fire view: ${await peak()}; images in ${file('')}`)
await browser.close()
