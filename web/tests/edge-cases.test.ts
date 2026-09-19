// T065: every edge case in spec.md produces a STATED finding: no thrown error, no blank result, no silently
// zeroed quantity (SC-009). Records here are test data built from tests/fixtures; nothing is written to
// public/data. Rendering is server-side (renderToStaticMarkup): no DOM, no browser. The browser half is
// tests/e2e/edge-cases.spec.ts.
//
// | Edge case (spec.md, Edge Cases)          | Where it is handled                                                        | Proved by                                        |
// |------------------------------------------|----------------------------------------------------------------------------|--------------------------------------------------|
// | Burn entirely on federal land            | pipeline jurisdiction.py NO_RETAINED_AREA -> record.result; computeOrder   | here; pipeline test_jurisdiction.py::            |
// |   (no_retained_area)                     |   finding; OrderSummary .finding + retained/excluded acres; App hides the  |   test_fully_federal_burn_is_a_finding_not_an_   |
// |                                          |   assumptions and table                                                    |   empty_order; e2e edge-cases.spec.ts            |
// | No conifer before the fire (no_conifer)  | pipeline species.py NO_CONIFER; same web path as above                     | here; test_species.py::test_no_conifer_is_a_     |
// |                                          |                                                                            |   stated_finding; e2e edge-cases.spec.ts         |
// | No interior: all within seeding distance | pipeline interior.py NO_INTERIOR; same web path; BurnMap "No seed-limited  | here; test_interior.py::test_no_interior_is_a_   |
// |   (no_interior)                          |   interior on this fire."                                                  |   stated_finding; e2e interior.spec.ts           |
// | Species absent from Table 2              | factors.json fallback + fallback_species; computeOrder used_fallback and   | here                                             |
// |                                          |   trail fallback_applied + rule in source_ref; OrderTable dagger + legend  |                                                  |
// | Fire still burning (provisional)         | record.fire.provisional + perimeter_source_date; OrderSummary stamp and    | here; e2e edge-cases.spec.ts                     |
// |                                          |   provisional flag (also on empty results); exportOrder fire block         |                                                  |
// | Cell straddling an elevation band        | pipeline partition.py (per-pixel cells); computeOrder one line per cell x  | here; test_no_merge.py::test_straddling_band_is_ |
// |                                          |   species; OrderTable one tbody per cell                                   |   split, ::test_straddling_zone_and_band_gives_  |
// |                                          |                                                                            |   four_cells                                     |
// | Assumption set to an implausible value   | resolveAssumptions clamps to [min, max]; the clamped value is on every     | here; e2e assumptions.spec.ts ("an entry beyond  |
// |                                          |   line's trail; AssumptionPanel says "X is outside the bounds, so Y is     |   the bounds is clamped...")                     |
// |                                          |   used"                                                                    |                                                  |
// | Published source tables disagree         | pipeline build.py benchmark.agency_self_contradiction (bushels of seed vs  | validation.test.ts ("never calls a bushel seed,  |
// |                                          |   cones; methodology governs); Validation footnote; every order quantity   |   except when quoting..."); here (unit check)    |
// |                                          |   is in bushels of cones                                                   |                                                  |
// | (brief) Species with no Terms of Sale row| computeOrder gap line: trees computed, seed quantities null + GAP_MESSAGE; | here                                             |
// |                                          |   totals.gap_lines/gap_trees; OrderSummary gap-note; OrderTable "Not       |                                                  |
// |                                          |   computable"                                                              |                                                  |
// | (found) Every line a Terms of Sale gap   | OrderSummary shows the totals as "—", not 0, beside the gap note           | here                                             |
// | (brief) Fire outside 2018-2023           | pipeline severity.check_year; build refuses with the reason; write_index   | test_interior.py::test_years_outside_2018_2023_  |
// |                                          |   refuses it. Never reaches the web.                                       |   are_refused_with_a_reason; test_build.py::test_|
// |                                          |                                                                            |   out_of_window_year_is_refused; test_invariants |
// |                                          |                                                                            |   .py::test_write_index_rejects_fire_outside_    |
// |                                          |                                                                            |   coverage                                       |
// | (guard) Empty cells with no result, or a | pipeline validate_fire refuses the record, so the web never shows a        | test_invariants.py::test_empty_cells_without_    |
// |   result with no message                 |   computed-looking empty order or a blank finding                         |   result_fails, ::test_result_without_message_   |
// |                                          |                                                                            |   fails                                          |
// | (large fire) More lines than the table   | OrderTable draws whole cells up to FIRST_LINES and states how many more,   | perf.test.ts; e2e edge-cases.spec.ts             |
// |   draws at once                          |   with "Show all"; totals and export always include every line            |                                                  |
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AssumptionPanel from '../src/components/AssumptionPanel.tsx'
import FactorTrail from '../src/components/FactorTrail.tsx'
import OrderSummary, { AcreageFunnel } from '../src/components/OrderSummary.tsx'
import OrderTable from '../src/components/OrderTable.tsx'
import { computeOrder, GAP_MESSAGE } from '../src/convert/computeOrder.ts'
import type { Cell, EmptyResult, Factors, FireIndex, FireRecord, Order } from '../src/convert/types.ts'
import { exportOrder } from '../src/export/exportOrder.ts'
import benchmarkJson from '../public/data/reference/benchmark.json'
import factorsJson from './fixtures/factors.json'
import fireJson from './fixtures/fire.json'
import indexJson from './fixtures/index.json'

const factors = factorsJson as Factors
const fire = fireJson as FireRecord
const entry = (indexJson as FireIndex).fires[0]
const AT = '2026-09-18T12:00:00.000Z'

// The pipeline's own messages (jurisdiction.py, species.py, interior.py), verbatim.
const MESSAGES: Record<EmptyResult, string> = {
  no_retained_area: 'Entire perimeter lies outside State Responsibility Area.',
  no_conifer: 'No conifer species present in pre-fire vegetation.',
  no_interior: 'All burned acres lie within natural seeding distance. No planting order required.',
}

/** An empty-result record shaped as build.py writes it: cells emptied, result + message added. */
function emptyResult(result: EmptyResult): FireRecord {
  const retained =
    result === 'no_retained_area'
      ? { ...fire.retained!, retained_acres: 0, excluded_acres: 5000, high_severity_acres: 0, conifer_acres: 0 }
      : result === 'no_conifer'
        ? { ...fire.retained!, high_severity_acres: 0, conifer_acres: 0 }
        : fire.retained!
  return {
    fire: fire.fire,
    retained,
    planting: { ...fire.planting!, interior_acres: 0, interior_fraction: 0 },
    cells: [],
    result,
    message: MESSAGES[result],
    geometry_ref: fire.geometry_ref,
  }
}

const cell = (zone: string, low: number, species: [string, number][]): Cell => ({
  cell_id: `${zone}_${low}`,
  seed_zone: zone,
  elevation_band: `${low}–${low + 500} ft`,
  planting_acres: species.reduce((s, [, a]) => s + a, 0),
  species: species.map(([name, acres]) => ({ species: name, acres })),
})

const withCells = (cells: Cell[], over: Partial<FireRecord> = {}): FireRecord => ({ ...fire, cells, ...over })

// The slip (totals, finding, stamp) and the funnel (retained and excluded acres), as the page shows them.
const summary = (record: FireRecord, order: Order) =>
  renderToStaticMarkup(createElement(OrderSummary, { entry, record, order })) +
  renderToStaticMarkup(createElement(AcreageFunnel, { record }))
const table = (order: Order, selectedKey: string | null = null) =>
  renderToStaticMarkup(
    createElement(OrderTable, {
      lines: order.lines,
      selectedKey,
      onToggle: () => {},
      trail: (line) => createElement(FactorTrail, { line }),
    }),
  )
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0

/**
 * SC-009 on the data: every line with acres has trees; every seed quantity is either a positive number or
 * null on a line that states why (gap). A 0 standing in for "unknown" never appears.
 */
function expectNothingSilentlyZeroed(order: Order) {
  for (const l of order.lines) {
    expect(l.acres.value).toBeGreaterThan(0)
    expect(l.trees.value).toBeGreaterThan(0)
    for (const k of ['seedlings_per_lb', 'pounds', 'bushels', 'cost_usd'] as const) {
      if (l.gap === null) expect(l[k].value).toBeGreaterThan(0)
      else expect(l[k].value).toBeNull()
    }
    if (l.gap !== null) expect(l.gap).toBe(GAP_MESSAGE)
    expect(l.priority === null).toBe(l.gap !== null)
  }
}

describe('empty-result fires are stated findings (no_retained_area, no_conifer, no_interior)', () => {
  it.each(Object.keys(MESSAGES) as EmptyResult[])('%s: a finding, zero lines, no throw, no zero headline', (result) => {
    const record = emptyResult(result)
    let order: Order | undefined
    expect(() => {
      order = computeOrder(record, factors, {}, AT)
    }).not.toThrow()
    expect(order!.finding).toEqual({ result, message: MESSAGES[result] })
    expect(order!.lines).toEqual([])

    const html = summary(record, order!)
    expect(html).toContain(`data-result="${result}"`)
    expect(html).toContain(MESSAGES[result])
    expect(html).toContain('This is a stated result for this fire, not an error. No seed order lines are produced.')
    // Not presented as a computed order: no headline total, no totals block at all.
    expect(html).not.toContain('data-testid="total-bushels"')
    expect(html).not.toContain('class="totals"')
    // Still stamped with its perimeter date.
    expect(html).toContain('Perimeter data as of')
    expect(html).toContain(fire.fire!.perimeter_source_date)

    // The export carries the finding, not an empty order dressed as one.
    const doc = exportOrder(order!, record, factors, AT)
    expect(doc.finding).toEqual({ result, message: MESSAGES[result] })
    expect(doc.lines).toEqual([])
  })

  it('a fully federal burn still reports the excluded acreage and why (FR-002)', () => {
    const record = emptyResult('no_retained_area')
    const html = summary(record, computeOrder(record, factors))
    expect(html).toMatch(/data-testid="retained-acres">0\.0 ac</)
    expect(html).toMatch(/data-testid="excluded-acres">5,000 ac</)
    expect(html).toContain('Excluded: Outside State Responsibility Area')
  })
})

describe('species absent from Table 2: the AON fallback, flagged on every line that used it', () => {
  it('a species in fallback_species uses 1 lb per bushel and is flagged in data, trail and table', () => {
    const order = computeOrder(fire, factors)
    const wwp = order.lines.find((l) => l.species === 'Western White Pine')!
    expect(wwp.used_fallback).toBe(true)
    expect(wwp.gap).toBeNull()
    const lbs = wwp.factors.find((f) => f.name === 'lbs_clean_seed_per_bushel')!
    expect(lbs.value).toBe(1)
    expect(lbs.fallback_applied).toBe(true)
    expect(lbs.source_ref).toContain('fallback: AON: species absent from Table 2 assume 1 bushel = 1 lb')
    expect(wwp.bushels.value).toBeCloseTo(wwp.pounds.value!, 12)
    // Every other line in the fixture is on a Table 2 value, and says so.
    for (const l of order.lines.filter((x) => !['Western White Pine', 'Knobcone Pine'].includes(x.species))) {
      expect(l.used_fallback).toBe(false)
    }
    expectNothingSilentlyZeroed(order)

    const html = table(order, '522_5000|Western White Pine') // with its trail open
    expect(html).toMatch(/data-species="Western White Pine"[^]*?aria-label="Table 2 fallback"/)
    expect(text(html)).toContain("Table 2 fallback: species absent from AON Table 2 use the AON's 1 bushel = 1 lb rule.")
    expect(html).toContain('class="fallback-mark">fallback<') // the open trail marks it too
  })

  it('a species missing from Table 2 by_species entirely still gets the stated fallback, not a throw', () => {
    const k = structuredClone(factors)
    const lbsF = k.published.find((p) => p.name === 'lbs_clean_seed_per_bushel')!
    delete lbsF.by_species!['Western White Pine']
    lbsF.fallback_species = []
    const l = computeOrder(fire, k).lines.find((x) => x.species === 'Western White Pine')!
    expect(l.used_fallback).toBe(true)
    expect(l.factors.find((f) => f.name === 'lbs_clean_seed_per_bushel')).toMatchObject({
      value: 1,
      fallback_applied: true,
    })
    expect(l.bushels.value).toBeGreaterThan(0)
  })
})

describe('species with no Terms of Sale row: a disclosed gap line, never a zero', () => {
  it('the gap line keeps its trees; its seed quantities are null and the reason is stated', () => {
    const order = computeOrder(fire, factors)
    const kp = order.lines.find((l) => l.species === 'Knobcone Pine')!
    expect(kp.trees.value).toBe(2000)
    expect([kp.seedlings_per_lb.value, kp.pounds.value, kp.bushels.value, kp.cost_usd.value]).toEqual([
      null,
      null,
      null,
      null,
    ])
    expect(kp.priority).toBeNull()
    expect(kp.gap).toBe(GAP_MESSAGE)
    expect(order.totals.overall.gap_lines).toBe(1)
    expect(order.totals.overall.gap_trees.value).toBe(2000)
    expectNothingSilentlyZeroed(order)

    const s = text(summary(fire, order))
    expect(s).toContain('1 line not computable (Knobcone Pine).')
    expect(s).toContain('Their 2,000 trees are left out of the totals above.')
    const t = table(order)
    expect(t).toMatch(/data-species="Knobcone Pine"[^]*?Not computable: no published seeds\/lb or seed price/)
    expect(text(t)).toContain(`Lines marked not computable: ${GAP_MESSAGE}`)
  })

  it('a fire whose every line is a gap shows its totals as unknown, not as 0', () => {
    const record = withCells([cell('522', 6000, [['Lodgepole Pine', 12]]), cell('522', 6500, [['Subalpine Fir', 8]])])
    const order = computeOrder(record, factors)
    expect(order.lines).toHaveLength(2)
    expect(order.totals.overall.lines).toBe(0)
    expect(order.totals.overall.gap_lines).toBe(2)
    expect(order.totals.overall.gap_trees.value).toBe(4000)
    expectNothingSilentlyZeroed(order)

    const html = summary(record, order)
    expect(html).toMatch(/data-testid="total-bushels">—</)
    expect(html).toMatch(/data-testid="total-pounds">—/)
    expect(html).toMatch(/data-testid="total-cost">—</)
    expect(text(html)).not.toMatch(/\b0\.00\b|\$0/)
    expect(text(html)).toContain('2 lines not computable (Lodgepole Pine, Subalpine Fir).')
    expect(text(html)).toContain('Their 4,000 trees are left out of the totals above.')
  })
})

describe('a fire still burning: stamped with its perimeter date and flagged provisional (FR-024)', () => {
  const provisional = (r: FireRecord): FireRecord => ({
    ...r,
    fire: { ...r.fire!, provisional: true, perimeter_source_date: '2021-08-15' },
  })

  it('on an order', () => {
    const record = provisional(fire)
    const order = computeOrder(record, factors, {}, AT)
    expect(order.perimeter_source_date).toBe('2021-08-15')
    const html = summary(record, order)
    expect(html).toContain('<time dateTime="2021-08-15">2021-08-15</time>')
    expect(html).toContain('class="provisional-flag">Provisional: perimeter may still change<')
    expect(exportOrder(order, record, factors, AT).fire).toMatchObject({
      perimeter_source_date: '2021-08-15',
      provisional: true,
    })
  })

  it('on an empty-result finding too', () => {
    const record = provisional(emptyResult('no_interior'))
    const html = summary(record, computeOrder(record, factors))
    expect(html).toContain('Provisional: perimeter may still change')
    expect(html).toContain('2021-08-15')
    expect(html).toContain(MESSAGES.no_interior)
  })

  it('an unflagged fire does not show the flag', () => {
    expect(summary(fire, computeOrder(fire, factors))).not.toContain('provisional-flag')
  })
})

describe('a cell straddling an elevation band boundary is split, never merged (FR-009)', () => {
  it('the same species on both sides of 5000 ft gives two lines in two cells', () => {
    // What partition.py emits for test_no_merge.py::test_straddling_band_is_split: two cells, one per band.
    const record = withCells([cell('522', 4500, [['Douglas Fir', 12]]), cell('522', 5000, [['Douglas Fir', 12]])])
    const order = computeOrder(record, factors)
    expect(order.lines.map((l) => [l.cell_id, l.elevation_band, l.species, l.acres.value])).toEqual([
      ['522_4500', '4500–5000 ft', 'Douglas Fir', 12],
      ['522_5000', '5000–5500 ft', 'Douglas Fir', 12],
    ])
    // Totals by species/zone are sums shown beside the lines; they never replace them.
    expect(order.totals.by_species['Douglas Fir'].lines).toBe(2)
    expectNothingSilentlyZeroed(order)

    const html = table(order)
    expect(count(html, /<tbody class="cell-group"/g)).toBe(2)
    expect(count(html, /<tr class="order-row/g)).toBe(2)
    expect(html).toContain('data-cell="522_4500"')
    expect(html).toContain('data-cell="522_5000"')
    expect(html).toContain('Provenance Lock — cells are never merged.')
  })
})

describe('an assumption set to an implausible value is clamped, and the quantity traces to the value used', () => {
  const wild = { stocking_tpa: 10_000, seeds_per_pot: 9, nursery_survival_rate: -2, probability_of_tree_in_nursery: 1.5 }
  const bounds = { stocking_tpa: 200, seeds_per_pot: 4, nursery_survival_rate: 0.5, probability_of_tree_in_nursery: 1 }

  it('each value is clamped to its bound, recorded as clamped, and used on every line', () => {
    let order: Order | undefined
    expect(() => {
      order = computeOrder(fire, factors, wild)
    }).not.toThrow()
    for (const a of order!.assumptions_used) {
      expect(a.requested_value).toBe(wild[a.name as keyof typeof wild])
      expect(a.current_value).toBe(bounds[a.name as keyof typeof bounds])
      expect(a.clamped).toBe(true)
    }
    for (const l of order!.lines) {
      for (const [name, v] of Object.entries(bounds)) expect(l.factors.find((f) => f.name === name)!.value).toBe(v)
    }
    // Identical quantities to asking for the bounds directly: nothing was computed from the wild values.
    const atBounds = computeOrder(fire, factors, bounds)
    expect(order!.lines.map((l) => [l.trees.value, l.pounds.value, l.bushels.value, l.cost_usd.value])).toEqual(
      atBounds.lines.map((l) => [l.trees.value, l.pounds.value, l.bushels.value, l.cost_usd.value]),
    )
    expectNothingSilentlyZeroed(order!)
  })

  it('the panel says which value is used and the trail shows it', () => {
    const order = computeOrder(fire, factors, { seeds_per_pot: 9 })
    const panel = text(
      renderToStaticMarkup(
        createElement(AssumptionPanel, { factors, used: order.assumptions_used, onChange: () => {}, onReset: () => {} }),
      ),
    )
    expect(panel).toContain('using 4')
    expect(panel).toContain('9 is outside the bounds, so 4 is used')

    const trail = renderToStaticMarkup(createElement(FactorTrail, { line: order.lines[0] }))
    expect(trail).toMatch(/data-factor="seeds_per_pot"[^]*?class="factor-value">4 <span class="factor-unit">seeds\/pot</)
  })

  it('a non-numeric request falls back to the default rather than NaN', () => {
    const order = computeOrder(fire, factors, { stocking_tpa: Number.NaN, seeds_per_pot: Infinity })
    expect(order.assumptions_used.find((a) => a.name === 'stocking_tpa')!.current_value).toBe(200)
    expect(order.assumptions_used.find((a) => a.name === 'seeds_per_pot')!.current_value).toBe(2)
    expectNothingSilentlyZeroed(order)
  })
})

describe('published source tables that disagree: the method governs and the contradiction is surfaced', () => {
  it('benchmark.json carries the AON self-contradiction, resolved toward the methodology', () => {
    // The footnote rendering is proved in validation.test.ts; here, that the data states it.
    const b = benchmarkJson as { agency_self_contradiction: string }
    expect(b.agency_self_contradiction).toMatch(/bushels of conifer seed/)
    expect(b.agency_self_contradiction).toMatch(/Methodology governs/)
  })

  it('every order quantity follows the methodology: bushels of cones, never of seed', () => {
    const order = computeOrder(fire, factors)
    expect(order.totals.overall.bushels.unit).toBe('bushels of cones')
    for (const l of order.lines) expect(l.bushels.unit).toBe('bushels of cones')
    const html = summary(fire, order) + table(order)
    expect(html.toLowerCase()).not.toMatch(/bushels? of (conifer )?seed/)
  })
})
