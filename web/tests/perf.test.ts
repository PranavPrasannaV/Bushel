// T069: assumption-adjustment recompute time for a fire with ~2,000 cell-species lines (plan.md
// Performance Goals: recompute and repaint in under 100 ms). The record is synthetic, generated here, and
// never written anywhere: it exercises the conversion, it is not data about any fire.
//
// This times computeOrder only (the recompute): run with --reporter=verbose to see median and p95. The
// repaint half was measured in a real browser against a production build (vite build + vite preview, the same
// synthetic record served via page.route). The table's layout grew with its rows, so OrderTable draws whole
// cells up to FIRST_LINES and offers "Show all"; the last test checks that nothing is merged or dropped.
// Measured 2026-09-17, headless Chromium, one dev laptop, survival-rate change to next frame (median / p95):
//   computeOrder alone (this file, node)          ~0.5 / ~1.1 ms
//   first 200 lines drawn (default)                18 / 19 ms;   at 4x CPU throttle  21 / 23 ms
//   all 2,000 lines drawn ("Show all")             34 / 45 ms;   at 4x CPU throttle 146 / 180 ms
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OrderTable, { FIRST_LINES } from '../src/components/OrderTable.tsx'
import { computeOrder } from '../src/convert/computeOrder.ts'
import type { Assumptions, Cell, Factors, FireRecord } from '../src/convert/types.ts'
import factorsJson from './fixtures/factors.json'

const factors = factorsJson as Factors

// Every canonical species, so the run covers ordinary, Table 2 fallback and Terms of Sale gap lines.
const SPECIES = [
  'Big-Cone Douglas Fir',
  'Coast Redwood',
  'Coulter Pine',
  'Douglas Fir',
  'Giant Sequoia',
  'Incense Cedar',
  'Jeffrey Pine',
  'Knobcone Pine',
  'Lodgepole Pine',
  'Ponderosa Pine',
  'Red Fir',
  'Subalpine Fir',
  'Sugar Pine',
  'Western White Pine',
  'White Fir',
]

/** `nCells` cells over 40 zones × 25 bands, `perCell` species each: nCells × perCell lines. */
function syntheticRecord(nCells = 400, perCell = 5): FireRecord {
  const cells: Cell[] = []
  for (let i = 0; i < nCells; i++) {
    const zone = String(500 + (i % 40))
    const low = 500 * Math.floor(i / 40)
    const species = Array.from({ length: perCell }, (_, j) => ({
      species: SPECIES[(i + j) % SPECIES.length],
      acres: 1 + ((i * 7 + j * 13) % 50),
    }))
    cells.push({
      cell_id: `${zone}_${low}`,
      seed_zone: zone,
      elevation_band: `${low}–${low + 500} ft`,
      planting_acres: species.reduce((s, x) => s + x.acres, 0),
      species,
    })
  }
  return {
    fire: {
      id: 'synthetic-perf',
      name: 'Synthetic perf record (test data)',
      year: 2021,
      discovery_date: '2021-08-01',
      perimeter_source_date: '2021-10-01',
      provisional: false,
    },
    cells,
  }
}

const quantile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]

describe('assumption-adjustment recompute (T069)', () => {
  const record = syntheticRecord()

  it('the synthetic record has ~2,000 cell-species lines', () => {
    expect(computeOrder(record, factors).lines).toHaveLength(2000)
  })

  it('computeOrder recomputes 2,000 lines with a median under 100 ms', () => {
    // A slider drag: each step changes one assumption, as the UI does.
    const steps: Assumptions[] = []
    for (let i = 0; i < 60; i++) {
      steps.push({
        stocking_tpa: 50 + ((i * 5) % 151),
        seeds_per_pot: 1 + (i % 4),
        nursery_survival_rate: 0.5 + (i % 6) * 0.1,
      })
    }
    for (let i = 0; i < 10; i++) computeOrder(record, factors, steps[i]) // warm-up (JIT)

    const times: number[] = []
    let lines = 0
    for (const a of steps) {
      const t0 = performance.now()
      const order = computeOrder(record, factors, a)
      times.push(performance.now() - t0)
      lines = order.lines.length
    }
    times.sort((a, b) => a - b)
    const median = quantile(times, 0.5)
    const p95 = quantile(times, 0.95)
    console.info(
      `[T069] computeOrder, ${lines} lines, ${times.length} runs: median ${median.toFixed(2)} ms, ` +
        `p95 ${p95.toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms`,
    )
    expect(lines).toBe(2000)
    expect(median).toBeLessThan(100)
  })

  it('the table draws whole cells up to FIRST_LINES and states the rest; totals keep every line', () => {
    const order = computeOrder(record, factors)
    const html = renderToStaticMarkup(
      createElement(OrderTable, { lines: order.lines, selectedKey: null, onToggle: () => {}, trail: () => null }),
    )
    const rows = html.match(/<tr class="order-row/g)?.length ?? 0
    const cells = html.match(/<tbody class="cell-group"/g)?.length ?? 0
    // 5 lines per synthetic cell: exactly FIRST_LINES here, in 40 whole cells.
    expect(rows).toBe(FIRST_LINES)
    expect(cells * 5).toBe(rows)
    expect(html).toContain(`Showing the first 200 of 2,000 lines (whole cells). The other 1,800 are not merged or dropped`)
    expect(html).toContain('Show all 2,000 lines')
    // The totals are over all 2,000 lines, drawn or not.
    expect(order.totals.overall.lines + order.totals.overall.gap_lines).toBe(2000)
  })
})
