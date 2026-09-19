// The demo video, recorded from the real site in a real (headed) Chrome window.
//   node scripts/demo-video.mjs [out-dir] [base-url]
//     out-dir   default ../../bushel-demo (outside the repo)
//     base-url  default https://pranavprasannav.github.io/Bushel/
//   FFMPEG=<path to a full ffmpeg build> (default: the one bundled with the imageio-ffmpeg Python package)
//
// Frames come from Chrome's own compositor (CDP screencast) at 1920×1080 and are piped into ffmpeg at a fixed
// 30 fps against the wall clock, so the video runs at real speed. Captions are drawn in a strip under the app,
// in the site's own type, and every figure in them is read off the screen at the moment it is shown. Headed,
// not headless: the national map services turn away headless browsers, and the live build is part of the demo.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const OUT = resolve(process.argv[2] ?? new URL('../../../bushel-demo', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const BASE = process.argv[3] ?? 'https://pranavprasannav.github.io/Bushel/'
const FFMPEG =
  process.env.FFMPEG ??
  execFileSync('python', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim()
mkdirSync(OUT, { recursive: true })

const W = 1440 // CSS pixels: the desktop layout
const H = 810
const DPR = 4 / 3 // → 1920×1080 frames
const BAND = 76 // the caption strip, in CSS pixels
const FPS = 30

// ---- The overlay: caption strip, title cards and a visible cursor. Injected into every document. ----------------
const OVERLAY = `(() => {
  if (window.__demo) return
  const css = \`
    .stage { height: calc(100svh - var(--header-height) - ${BAND}px) !important; min-height: 0 !important; }
    body { padding-bottom: ${BAND}px !important; }
    #demo-band { position: fixed; left: 0; right: 0; bottom: 0; height: ${BAND}px; z-index: 2147483000;
      display: flex; align-items: center; gap: 28px; padding: 0 40px; background: #161915; color: #fbfaf6;
      font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    #demo-band .ch { flex: none; min-width: 190px; padding-right: 26px; border-right: 1px solid rgb(251 250 246 / 0.22);
      font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
      color: #d3cbb8; }
    #demo-band .ch b { color: #fbfaf6; font-weight: 500; margin-right: 8px; }
    #demo-band .tx { font-size: 20px; line-height: 1.32; letter-spacing: -0.003em; transition: opacity 180ms ease; }
    #demo-band .tx em { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 23px; color: #fbfaf6; }
    #demo-card { position: fixed; inset: 0 0 ${BAND}px 0; z-index: 2147483100; display: grid; place-content: center; gap: 22px;
      padding: 0 12vw; background-color: #f5f2ea;
      background-image: linear-gradient(rgb(22 25 21 / 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgb(22 25 21 / 0.06) 1px, transparent 1px);
      background-size: 48px 48px; color: #161915; opacity: 0; transition: opacity 500ms ease; pointer-events: none; }
    #demo-card.on { opacity: 1; }
    #demo-card .k { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #52564c; }
    #demo-card .t { font-family: 'Instrument Serif', serif; font-size: 128px; line-height: 0.9; letter-spacing: -0.03em; }
    #demo-card .s { font-family: 'Instrument Serif', serif; font-size: 36px; line-height: 1.15; max-width: 22ch; }
    #demo-card .r { width: 420px; height: 1px; background: #161915; }
    #demo-card .m { font-family: 'IBM Plex Mono', monospace; font-size: 14px; line-height: 1.8; color: #52564c; }
    #demo-card .slide { display: grid; gap: 18px; animation: demo-in 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
    @keyframes demo-in { from { opacity: 0; transform: translateY(10px); } }
    #demo-card .big { display: flex; align-items: baseline; gap: 18px; font-family: 'Instrument Serif', serif; font-size: 150px;
      line-height: 0.85; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
    #demo-card .big .u { font-size: 46px; font-style: italic; letter-spacing: -0.01em; color: #52564c; }
    #demo-card .big.lit { color: #0a6b46; }
    #demo-card .s.wide { max-width: 30ch; }
    #demo-card .src { margin-top: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #7a7e72; }
    #demo-card .bars { display: grid; gap: 16px; width: min(900px, 70vw); margin-top: 6px; }
    #demo-card .bar { display: grid; grid-template-columns: 250px 1fr 150px; align-items: center; gap: 18px; }
    #demo-card .bar .lab { font-family: 'IBM Plex Sans', sans-serif; font-size: 17px; color: #161915; }
    #demo-card .bar .track { height: 26px; background: rgb(22 25 21 / 0.06); }
    #demo-card .bar i { display: block; height: 100%; width: calc(var(--w) * 100%); background: var(--c, #161915);
      transform-origin: left center; animation: demo-grow 1500ms cubic-bezier(0.2, 0.7, 0.2, 1) both; animation-delay: var(--d, 300ms); }
    #demo-card .bar .v { font-family: 'IBM Plex Mono', monospace; font-size: 17px; text-align: right; }
    @keyframes demo-grow { from { transform: scaleX(0); } }
    #demo-card .pair { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 44px; width: min(1100px, 76vw); margin-top: 8px; }
    #demo-card .pair div { display: grid; gap: 8px; padding-top: 14px; border-top: 1.5px solid #161915;
      animation: demo-in 600ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
    #demo-card .pair div:nth-child(2) { animation-delay: 350ms; }
    #demo-card .pair div:nth-child(3) { animation-delay: 700ms; }
    #demo-card .pair b { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 30px; line-height: 1.05; }
    #demo-card .pair span { font-family: 'IBM Plex Sans', sans-serif; font-size: 15px; line-height: 1.45; color: #3b3f36; }
    #demo-card .dot { display: inline-block; width: 12px; height: 12px; margin-right: 10px; vertical-align: -1px;
      background: #16bf84; box-shadow: inset 0 0 0 1px #07573b; }
    #demo-panel { position: fixed; inset: 0 0 ${BAND}px 0; z-index: 2147483050; display: grid; place-items: center;
      background: rgb(22 25 21 / 0.32); opacity: 0; transition: opacity 300ms ease; pointer-events: none; }
    #demo-panel.on { opacity: 1; }
    #demo-panel .sheet { width: 1040px; padding: 26px 30px 22px; background: #fbfaf6; border: 1px solid #161915;
      box-shadow: 0 18px 50px rgb(22 25 21 / 0.28); color: #161915; }
    #demo-panel .k { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #52564c; }
    #demo-panel .f { margin: 6px 0 14px; font-family: 'Instrument Serif', serif; font-size: 30px; }
    #demo-panel table { width: 100%; border-collapse: collapse; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
    #demo-panel th { text-align: left; font-weight: 500; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase;
      color: #52564c; border-bottom: 1.5px solid #161915; padding: 6px 10px 6px 0; }
    #demo-panel td { border-bottom: 1px solid #e2dccd; padding: 6px 10px 6px 0; }
    #demo-panel td.n, #demo-panel th.n { text-align: right; }
    #demo-panel .foot { margin-top: 12px; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: #52564c; }
    #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483200; width: 22px; height: 22px; pointer-events: none;
      transform: translate(-100px, -100px); filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); }
    #demo-ring { position: fixed; z-index: 2147483199; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      border: 2px solid #161915; pointer-events: none; opacity: 0; transform: scale(0.4); }
    #demo-ring.go { animation: demo-ring 420ms ease-out; }
    @keyframes demo-ring { 0% { opacity: 0.8; transform: scale(0.4); } 100% { opacity: 0; transform: scale(1.4); } }
  \`
  const mount = () => {
    if (document.getElementById('demo-band')) return
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style)
    const band = document.createElement('div'); band.id = 'demo-band'
    band.innerHTML = '<div class="ch"></div><div class="tx"></div>'; document.body.appendChild(band)
    const card = document.createElement('div'); card.id = 'demo-card'; document.body.appendChild(card)
    const panel = document.createElement('div'); panel.id = 'demo-panel'; document.body.appendChild(panel)
    const cur = document.createElement('div'); cur.id = 'demo-cursor'
    cur.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.2 L13.4 18.9 L10.4 12.6 L16.4 12.3 Z" fill="#161915" stroke="#fbfaf6" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.body.appendChild(cur)
    const ring = document.createElement('div'); ring.id = 'demo-ring'; document.body.appendChild(ring)
    addEventListener('mousemove', (e) => { cur.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)' }, true)
    addEventListener('mousedown', (e) => {
      ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'
      ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go')
    }, true)
  }
  window.__demo = {
    mount,
    caption(ch, html) {
      mount()
      const band = document.getElementById('demo-band')
      band.querySelector('.ch').innerHTML = ch
      const tx = band.querySelector('.tx')
      tx.style.opacity = '0'
      setTimeout(() => { tx.innerHTML = html; tx.style.opacity = '1' }, 180)
    },
    card(html) {
      mount()
      const c = document.getElementById('demo-card')
      c.innerHTML = '<div class="slide">' + html + '</div>'
      c.classList.add('on')
      document.getElementById('demo-cursor').style.visibility = 'hidden'
      // Figures count up once, like the rest of the site's one-time reveals.
      for (const el of c.querySelectorAll('[data-count]')) {
        const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), t0 = performance.now(), dur = 1500
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3)
          el.textContent = (to * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
          if (k < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    },
    uncard() { document.getElementById('demo-card')?.classList.remove('on'); document.getElementById('demo-cursor').style.visibility = '' },
    panel(html) { mount(); const p = document.getElementById('demo-panel'); p.innerHTML = '<div class="sheet">' + html + '</div>'; p.classList.add('on') },
    unpanel() { document.getElementById('demo-panel')?.classList.remove('on') },
  }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount)
})()`

// ---- Recording -------------------------------------------------------------------------------------------------
const browser = await chromium.launch({
  headless: false,
  args: [
    `--window-size=${W + 16},${H + 120}`,
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    '--hide-scrollbars',
  ],
})
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR })
await context.addInitScript(OVERLAY)
const page = await context.newPage()

const video = resolve(OUT, 'bushel-demo.mp4')
const ff = spawn(FFMPEG, [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-tune', 'animation', '-movflags', '+faststart',
  video,
], { stdio: ['pipe', 'inherit', 'inherit'] })

let latest = null
let recording = false
let start = 0
let written = 0
const cdp = await context.newCDPSession(page)
cdp.on('Page.screencastFrame', (f) => {
  latest = Buffer.from(f.data, 'base64')
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
})
// Against the wall clock: every tick writes the newest frame as many times as the clock says are due.
const ticker = setInterval(() => {
  if (!recording || !latest) return
  const due = Math.floor(((performance.now() - start) / 1000) * FPS)
  while (written < due) {
    ff.stdin.write(latest)
    written++
  }
}, 1000 / FPS / 2)

const captions = []
let chapter = ''
const now = () => (performance.now() - start) / 1000
const sleep = (ms) => page.waitForTimeout(ms)
const readMs = (text) => Math.max(3000, text.replace(/<[^>]+>/g, '').length * 70)

/** Show a caption, run what happens under it, and keep it up long enough to read. */
async function say(text, action, extra = 0) {
  const t0 = performance.now()
  await page.evaluate(([c, t]) => window.__demo.caption(c, t), [chapter, text])
  captions.push({ start: now(), text: text.replace(/<[^>]+>/g, '') })
  if (action) await action()
  const left = readMs(text) + extra - (performance.now() - t0)
  if (left > 0) await sleep(left)
  captions[captions.length - 1].end = now()
}
const setChapter = (n, name) => (chapter = `<b>${n}</b>${name}`)

// Cursor moves are eased, like a hand, not teleported.
let mx = W / 2
let my = H / 2
async function moveTo(x, y, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 16))
  const [x0, y0] = [mx, my]
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
    await sleep(16)
  }
  mx = x
  my = y
}
async function centre(locator, dx = 0.5, dy = 0.5) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  return [b.x + b.width * dx, b.y + b.height * dy]
}
async function hover(locator, ms) {
  const [x, y] = await centre(locator)
  await moveTo(x, y, ms)
}
async function click(locator, ms) {
  await hover(locator, ms)
  await sleep(180)
  await page.mouse.down()
  await sleep(70)
  await page.mouse.up()
}
async function type(text) {
  for (const ch of text) {
    await page.keyboard.type(ch)
    await sleep(85 + Math.random() * 60)
  }
}
/** Scroll smoothly so `selector` sits just under the top bar. */
async function scrollTo(selector, ms = 1300, offset = 76) {
  await page.evaluate(
    ([sel, dur, off]) =>
      new Promise((done) => {
        document.documentElement.style.scrollBehavior = 'auto'
        const el = typeof sel === 'number' ? null : document.querySelector(sel)
        const y0 = scrollY
        const y1 = el ? el.getBoundingClientRect().top + scrollY - off : sel
        const t0 = performance.now()
        const step = (t) => {
          const k = Math.min(1, (t - t0) / dur)
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
          scrollTo(0, y0 + (y1 - y0) * e)
          if (k < 1) requestAnimationFrame(step)
          else done()
        }
        requestAnimationFrame(step)
      }),
    [selector, ms, offset],
  )
}
const text = async (selector) => ((await page.locator(selector).first().textContent()) ?? '').replace(/\s+/g, ' ').trim()
const num = (s) => (s.match(/[\d,.]+/) ?? [''])[0]

// ---- The walkthrough -------------------------------------------------------------------------------------------
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForSelector('.nation-svg')
await page.evaluate(() =>
  window.__demo.card(`
    <p class="k">NextStep Hacks 2026 · Earth Forward</p>
    <p class="t">Bushel</p>
    <p class="s">After a wildfire, which forest can’t grow back on its own, and what will it take to replant it?</p>`),
)
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
await sleep(400)
start = performance.now()
recording = true

setChapter('00', 'Bushel')
await say('Bushel: the seed order to bring a burned forest back.', null, 1400)

// Every figure below is sourced on the slide itself; docs/03-DO-NOT-CLAIM.md applies to all of it.
const slide = (html) => page.evaluate((h) => window.__demo.card(h), html)
setChapter('01', 'The problem')
await say('In 2020 alone, wildfires burned more than ten million acres across the United States.', () =>
  slide(`
    <p class="k">01 · The scale</p>
    <p class="big"><span data-count="10122336">0</span><span class="u">acres</span></p>
    <p class="s wide">burned by wildfire in the United States in 2020.</p>
    <p class="src">National Interagency Fire Center, total wildland fires and acres, 2020</p>`),
)
await say('Nearly all the money and attention goes to stopping the fire. A sliver goes to what comes after.', () =>
  slide(`
    <p class="k">02 · Where the effort goes</p>
    <p class="s wide">Fighting the fire, against bringing the forest back.</p>
    <div class="bars">
      <div class="bar"><span class="lab">Federal firefighting, 2021</span><span class="track"><i style="--w:1"></i></span><span class="v">$4.39 billion</span></div>
      <div class="bar"><span class="lab">Federal replanting, per year</span><span class="track"><i style="--w:0.028;--c:#7a5d4a;--d:900ms"></i></span><span class="v">$123 million</span></div>
    </div>
    <p class="src">NIFC federal suppression costs, 2021 · REPLANT Act (2021), average annual reforestation funding</p>`),
  800,
)
await say('Seed from many conifers rarely travels much past 100 metres. Where a fire kills every tree, none arrives: in one major study, about a third of burned sites had no new conifers.', () =>
  slide(`
    <p class="k">03 · Why it doesn’t grow back</p>
    <p class="big"><span data-count="100">0</span><span class="u">metres</span></p>
    <p class="s wide">Seed from many conifers rarely travels much farther than 100 m. Where every tree died, the forest may not return on its own.</p>
    <p class="src">Gill et al. 2022, BioScience (non-serotinous conifers) · Stevens-Rumann et al. 2018, Ecology Letters</p>`),
)
await say('The Forest Service lists more than four million acres that may need replanting. Before 2021 it could address only 6% of its fire-caused need.', () =>
  slide(`
    <p class="k">04 · The backlog</p>
    <p class="big"><span data-count="4">0</span><span class="u">million acres +</span></p>
    <p class="s wide">of national forest in potential need of replanting. Before 2021, the Forest Service could address only 6% of its wildfire-caused need.</p>
    <p class="src">USDA Forest Service, Reforestation</p>`),
)
await say('And it isn’t only trees. The forest is habitat, and it guards the rivers: every rain after a fire washes ash and soil into the water that towns and farms rely on.', () =>
  slide(`
    <p class="k">05 · What a forest holds up</p>
    <div class="pair">
      <div><b>Wildlife</b><span>Severe fire is turning Sierra Nevada forest into shrubland, taking habitat from the California spotted owl.</span></div>
      <div><b>Rivers</b><span>“With every rain after the fires, sediment and ash flowed into the Poudre River.” Runoff harms fish and frogs downstream.</span></div>
      <div><b>Water and farms</b><span>Forests cover 36% of US land but yield 50% of its surface water. The Sierra supplies over 60% of California’s developed water.</span></div>
    </div>
    <p class="src">US Fish &amp; Wildlife Service · Coalition for the Poudre River Watershed; USGS · Environ. Res. Lett. 2021; CA Water Resilience Portfolio 2020</p>`),
  1600,
)
await say('For tribal nations, these forests are homelands. California’s own seed program puts tribal and small family lands first in line.', () =>
  slide(`
    <p class="k">06 · Whose forest</p>
    <p class="big"><span data-count="18">0</span><span class="u">million acres</span></p>
    <p class="s wide">of forest and woodland held in trust for tribal nations. CAL FIRE’s seed program serves tribal and small non-industrial lands first.</p>
    <p class="src">Intertribal Timber Council · CAL FIRE Assessment of Needs 2025</p>`),
)
await say('Replanting is how a burned forest, and everything that depends on it, comes back. It starts with the right seed, ordered about 18 months ahead.', () =>
  slide(`
    <p class="k">07 · Where recovery starts</p>
    <p class="t" style="font-size:96px;max-width:14ch">It starts with a seed order.</p>
    <p class="s wide">Which species, from which seed zone, how many bushels of cones: for every fire.</p>`),
  400,
)
await page.evaluate(() => window.__demo.uncard())

setChapter('02', 'Find a place')
await say('Bushel works that order out. It opens on the whole country: California is built and checked, every fire from 2018 to 2023.', () =>
  hover(page.locator('.nation-ca path'), 900),
)
await say('Every other state in the lower 48 is built live, on request, from national data.', () =>
  hover(page.locator('a[href="?state=OR"] path'), 900),
)
await say('One search finds any county, address or fire. Try an address: Paradise, California.', async () => {
  await click(page.getByRole('button', { name: 'Paradise, CA' }), 900)
  await page.waitForSelector('.region-verdict')
})
const verdict = (await text('.region-verdict')).replace(/\s*\(\d{4}\)\.?$/, '').replace(/\.$/, '')
await say(`${verdict}. The town is pinned on the map, with the nearest built fires listed beside it.`, () =>
  hover(page.locator('.region-verdict'), 900),
)
await say('Step out to California: every built fire at once, each one’s seed-limited ground lit, and counties ranked by need.', async () => {
  await click(page.getByRole('navigation', { name: 'Where you are' }).getByRole('link', { name: 'California' }), 800)
  await page.waitForSelector('.burn-map[data-view="overview"]')
  await sleep(600)
  await moveTo(W * 0.3, H * 0.45, 900)
  await sleep(600)
  await hover(page.locator('.region .ranked-list').first(), 800)
}, 400)
const top = page.locator('.topbar-search [role="combobox"]')
await click(page.locator('.region .ranked-list button', { hasText: 'Plumas County' }).first(), 800)
await page.waitForSelector('.region .ranked-list li')
const northRow = page.locator('.region .ranked-list button', { hasText: 'North Complex' }).first()
await say('Plumas County: every fire since 2018, ranked by the ground that can’t reseed.', async () => {
  await hover(page.locator('.region .ranked-list').first(), 900)
  await sleep(1200)
})

setChapter('03', 'The fire')
await click(northRow, 700)
await page.waitForSelector('.title-block .title-name')
const burned = num(await text('.title-stamp span'))
await say(`The North Complex Fire, 2020: ${burned} acres burned.`, async () => {
  await page.locator('.burn-map').waitFor()
  await moveTo(W * 0.3, H * 0.52, 900)
})
await say(
  'Bushel keeps the land the state is responsible for, and reads how badly each acre burned from the federal burn-severity record.',
  () => page.waitForSelector('.burn-map[data-peak="revealed"]', { timeout: 30_000 }),
)
const interior = num(await text('.title-stamp-key'))
const share = (await text('.burn-map__fraction')).match(/[\d.]+%/)?.[0] ?? ''
await say('Then it measures inward from every surviving tree. Everything more than 90 metres from live seed lights up.')
await say(
  `<em>${interior} acres</em> that will not come back on their own: ${share} of the badly burned conifer forest.`,
)
await say('Each patch is split by seed zone and 500-foot elevation band, because seed has to come from where it grew.', async () => {
  const box = await page.locator('.burn-map__canvas').boundingBox()
  const slip = await page.locator('.slip-region').boundingBox()
  const cx = (box.x + slip.x) / 2
  const cy = box.y + box.height * 0.55
  await moveTo(cx, cy, 700)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -120)
    await sleep(260)
  }
})
await say('Ninety metres is the published estimate least favourable to this result. Bushel uses the number that works against it.', async () => {
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120)
    await sleep(200)
  }
})

setChapter('04', 'The order')
const bushels = await text('[data-testid="total-bushels"]')
const pounds = num(await text('[data-testid="total-pounds"]'))
const cost = await text('[data-testid="total-cost"]')
await say(
  `The order, in the state’s own units: <em>${bushels} bushels of cones</em>, ${pounds} lb of clean seed, ${cost} at CAL FIRE prices, species by species.`,
  async () => {
    await hover(page.locator('.headline'), 900)
    await sleep(1400)
    await hover(page.locator('.mix-bar'), 700)
  },
)
const lines = num(await text('.slip-more'))
const downloads = []
page.on('download', (d) => downloads.push(d))
await say('Export it as CSV and JSON: every line, with each factor and the source it came from.', async () => {
  await click(page.getByRole('button', { name: 'Export order' }), 800)
  for (let i = 0; i < 40 && !downloads.some((d) => d.suggestedFilename().endsWith('.csv')); i++) await sleep(100)
  const csv = downloads.find((d) => d.suggestedFilename().endsWith('.csv'))
  const body = readFileSync(await csv.path(), 'utf8').replace(/^\uFEFF/, '')
  const split = (l) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, ''))
  const [head, ...data] = body.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map(split)
  const col = (name) => head.indexOf(name)
  const bushelCol = 'bushels_of_cones'
  const pick = ['seed_zone', 'elevation_band', 'species', 'acres', 'trees', 'lb_clean_seed', 'bushels_of_cones', 'cost_usd'].filter((c) => col(c) >= 0)
  const top6 = data
    .filter((r) => Number(r[col(bushelCol)]) > 0)
    .sort((a, b) => Number(b[col(bushelCol)]) - Number(a[col(bushelCol)]))
    .slice(0, 6)
  const isNum = (c) => c !== 'seed_zone' && c !== 'elevation_band' && c !== 'species'
  const cell = (c, v) =>
    `<td class="${isNum(c) ? 'n' : ''}">${isNum(c) && v !== '' ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) : v}</td>`
  const html =
    `<p class="k">${csv.suggestedFilename()} · ${data.length} lines</p><p class="f">The order, as a nursery would receive it</p>` +
    `<table><tr>${pick.map((c) => `<th class="${isNum(c) ? 'n' : ''}">${c.replace(/_/g, ' ')}</th>`).join('')}</tr>` +
    top6.map((r) => `<tr>${pick.map((c) => cell(c, r[col(c)])).join('')}</tr>`).join('') +
    `</table><p class="foot">The six largest lines by bushels. The file also carries every assumption, factor and source.</p>`
  await sleep(500)
  await page.evaluate((h) => window.__demo.panel(h), html)
}, 2600)
await page.evaluate(() => window.__demo.unpanel())
await sleep(400)
await say(`The report walks from ${burned} acres burned to ${lines} order lines, each a seed zone, an elevation band and a species. Open any line to see every factor and its source.`, async () => {
  await scrollTo('#from-fire', 1500)
  await sleep(1800)
  await scrollTo('#lines', 1500)
  await sleep(400)
  await click(page.locator('tr.order-row').first(), 800)
  await sleep(600)
  await scrollTo('.factor-trail', 1200, 140)
}, 2200)

setChapter('05', 'The unknowns')
const slider = page.locator('.assumption.unpublished input[type="range"]').first()
await say('Three factors in CAL FIRE’s formula aren’t published. Bushel shows them in amber, labelled, and lets you change them.', async () => {
  await scrollTo('#assumptions', 1500)
  await sleep(500)
  await hover(page.locator('.assumption.unpublished').first(), 800)
})
await say('Change one and the whole order recalculates instantly, in the browser.', async () => {
  const b = await slider.boundingBox()
  const [v, lo, hi] = await slider.evaluate((el) => [Number(el.value), Number(el.min), Number(el.max)])
  const x0 = b.x + b.width * ((v - lo) / (hi - lo))
  const y = b.y + b.height / 2
  await moveTo(x0, y, 700)
  await page.mouse.down()
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(x0 - (x0 - (b.x + b.width * 0.25)) * (i / 30), y)
    mx = x0 - (x0 - (b.x + b.width * 0.25)) * (i / 30)
    await sleep(40)
  }
  await page.mouse.up()
  await sleep(900)
  await click(page.locator('.assumptions-head button'), 700)
}, 800)

setChapter('06', 'Is it right?')
await scrollTo('#check', 1500)
const figures = await page.locator('[data-testid="interior-crosscheck"] .validation-figure').allTextContents()
await say(
  `Checked against published figures. Across every California fire, ${figures[0]} of high-severity ground is seed-limited; the published estimate is ${figures[1]}.`,
  () => hover(page.locator('[data-testid="interior-crosscheck"]'), 900),
  600,
)
await say('CAL FIRE’s statewide total also covers insect die-off and timber harvest, so a fire-only order sits below it. The report says exactly why.', () =>
  hover(page.getByText('Against CAL FIRE', { exact: false }).first(), 900),
)

setChapter('07', 'Anywhere in the US')
await scrollTo(0, 1200)
await say('Outside California, any fire in the lower 48 is built live, in the browser, from national data.', async () => {
  await click(top, 800)
  await type('Beachie Creek')
  await page.getByRole('option', { name: /Beachie Creek/ }).first().waitFor({ timeout: 30_000 })
  await sleep(600)
  await click(page.getByRole('option', { name: /Beachie Creek/ }).first(), 600)
})
await say('Burn severity, land ownership, forest type, tree species, seed zones and elevation, each fetched right now.', () =>
  hover(page.locator('.slip-region'), 800),
)
await page.locator('[data-testid="total-bushels"]').filter({ hasText: /\d/ }).waitFor({ timeout: 90_000 })
await page.waitForSelector('.burn-map[data-peak="revealed"]', { timeout: 30_000 }).catch(() => {})
const liveAcres = num(await text('.title-stamp-key'))
await say(`Beachie Creek, Oregon: <em>${liveAcres} acres</em> that can’t reseed, and the order for them, built as you watch.`, () =>
  moveTo(W * 0.32, H * 0.5, 900),
)
await say('It says where every number came from and how long each source took, and that this state has no published figure to check it against yet.', async () => {
  await scrollTo('#check', 1600)
  await sleep(300)
  await hover(page.locator('.live-sources tbody'), 800)
}, 800)
await scrollTo(0, 1100)
await say('Every state has its own map of fires, ready to build, and the map travels the whole country.', async () => {
  await click(page.getByRole('navigation', { name: 'Where you are' }).getByRole('link', { name: 'Oregon' }), 800)
  await page.waitForSelector('.region .ranked-list li', { timeout: 30_000 })
  await moveTo(W * 0.35, H * 0.5, 900)
  await sleep(900)
  await moveTo(W * 0.5, H * 0.5, 600)
  await page.mouse.down()
  for (let i = 1; i <= 40; i++) {
    mx = W * 0.5 - W * 0.38 * (i / 40)
    await page.mouse.move(mx, H * 0.5)
    await sleep(22)
  }
  await page.mouse.up()
  await sleep(500)
  await moveTo(W * 0.42, H * 0.45, 700)
})

setChapter('08', 'Bushel')
await say('Fire maps show where a fire burned. Bushel shows what to order to bring the forest back, and shows its working.', () =>
  click(page.locator('a.wordmark'), 900),
  600,
)
await page.evaluate(() =>
  window.__demo.card(`
    <p class="t">Bushel</p>
    <p class="s">The seed order to bring a burned forest back.</p>
    <div class="r"></div>
    <p class="m"><span class="dot"></span>pranavprasannav.github.io/Bushel<br/>github.com/PranavPrasannaV/Bushel<br/>Built for NextStep Hacks 2026 · Earth Forward</p>`),
)
await say('Try it: pranavprasannav.github.io/Bushel', null, 1600)

// ---- Finish ----------------------------------------------------------------------------------------------------
recording = false
clearInterval(ticker)
await cdp.send('Page.stopScreencast')
ff.stdin.end()
await new Promise((done) => ff.on('close', done))
await browser.close()

const stamp = (s) => {
  const ms = Math.round(s * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
writeFileSync(
  resolve(OUT, 'bushel-demo.srt'),
  captions.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end ?? c.start + 3)}\n${c.text}\n`).join('\n'),
)
console.log(`${video}\n${(written / FPS).toFixed(1)} s, ${written} frames, ${captions.length} captions`)
