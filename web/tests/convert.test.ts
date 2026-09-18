// T034: purity, determinism, formula spot checks, priority thresholds (SC-008, FR-021).
import { describe, expect, it } from 'vitest'
import { computeOrder, priorityFor } from '../src/convert/computeOrder.ts'
import type { Cell, Factors, FireRecord, Order } from '../src/convert/types.ts'
import factorsJson from './fixtures/factors.json'
import fireJson from './fixtures/fire.json'

const factors = factorsJson as Factors
const fire = fireJson as FireRecord

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

const lineFor = (order: Order, cellId: string, species: string) =>
  order.lines.find((l) => l.cell_id === cellId && l.species === species)!

// With every nursery factor at 1, seedlings/lb == seeds/lb, which makes exact bushel counts easy.
const unity = { seeds_per_pot: 1, nursery_survival_rate: 1, probability_of_tree_in_nursery: 1 }

describe('purity and determinism', () => {
  it('returns deep-equal output on repeated calls', () => {
    const first = computeOrder(fire, factors)
    for (let i = 0; i < 20; i++) expect(computeOrder(fire, factors)).toEqual(first)

    const adjusted = { stocking_tpa: 120, seeds_per_pot: 3, nursery_survival_rate: 0.7 }
    expect(computeOrder(fire, factors, adjusted)).toEqual(computeOrder(fire, factors, adjusted))
    expect(JSON.stringify(computeOrder(fire, factors, adjusted))).toBe(
      JSON.stringify(computeOrder(fire, factors, adjusted)),
    )
  })

  it('does not mutate its inputs', () => {
    const f = structuredClone(fire)
    const k = structuredClone(factors)
    const a = { stocking_tpa: 999, seeds_per_pot: 3 }
    computeOrder(f, k, a)
    expect(f).toEqual(fire)
    expect(k).toEqual(factors)
    expect(a).toEqual({ stocking_tpa: 999, seeds_per_pot: 3 })
  })

  it('works on deeply frozen inputs and gives the same answer', () => {
    const f = deepFreeze(structuredClone(fire))
    const k = deepFreeze(structuredClone(factors))
    const a = Object.freeze({ seeds_per_pot: 3 })
    expect(() => computeOrder(f, k, a)).not.toThrow()
    expect(computeOrder(f, k, a)).toEqual(computeOrder(fire, factors, { seeds_per_pot: 3 }))
  })

  it('does not read the clock: computed_at is whatever the caller passes', () => {
    expect(computeOrder(fire, factors).computed_at).toBeNull()
    expect(computeOrder(fire, factors, {}, '2026-09-18T00:00:00Z').computed_at).toBe('2026-09-18T00:00:00Z')
  })

  it('output objects are fresh: mutating one order does not leak into the next', () => {
    const a = computeOrder(fire, factors)
    a.lines[0].factors[0].value = -1
    a.assumptions_used[0].current_value = -1
    const b = computeOrder(fire, factors)
    expect(b.lines[0].factors[0].value).toBe(200)
    expect(b.assumptions_used[0].current_value).toBe(200)
  })
})

describe('formula spot checks (hand arithmetic, defaults 200 TPA, 2 seeds/pot, 0.9, 0.9)', () => {
  const order = computeOrder(fire, factors)

  it('Douglas Fir, 10 acres', () => {
    const l = lineFor(order, '522_4500', 'Douglas Fir')
    // trees = 10 × 200 = 2000
    expect(l.trees.value).toBe(2000)
    // seedlings/lb = (30455 ÷ 2) × 0.9 × 0.9 = 12334.275
    expect(l.seedlings_per_lb.value).toBeCloseTo(12334.275, 6)
    // pounds = 2000 ÷ 12334.275 = 0.162150
    expect(l.pounds.value).toBeCloseTo(0.1621498, 6)
    // bushels = 0.162150 ÷ 0.5 = 0.324300
    expect(l.bushels.value).toBeCloseTo(0.3242996, 6)
    // cost = 0.162150 × $497 = $80.59
    expect(l.cost_usd.value).toBeCloseTo(80.5884, 3)
    expect(l.priority).toBe(3)
  })

  it('Sugar Pine, 20 acres', () => {
    const l = lineFor(order, '522_4500', 'Sugar Pine')
    expect(l.trees.value).toBe(4000)
    expect(l.seedlings_per_lb.value).toBeCloseTo(726.57, 6) // (1794 ÷ 2) × 0.81
    expect(l.pounds.value).toBeCloseTo(5.5053195, 6) // 4000 ÷ 726.57
    expect(l.bushels.value).toBeCloseTo(3.9323711, 6) // ÷ 1.4
    expect(l.cost_usd.value).toBeCloseTo(1838.7767, 3) // × $334
  })

  it('Ponderosa Pine, 462 acres', () => {
    const l = lineFor(order, '526_3000', 'Ponderosa Pine')
    expect(l.trees.value).toBe(92400)
    expect(l.seedlings_per_lb.value).toBeCloseTo(3742.2, 6) // (9240 ÷ 2) × 0.81
    expect(l.pounds.value).toBeCloseTo(24.691358, 5) // 92400 ÷ 3742.2
    expect(l.bushels.value).toBeCloseTo(24.691358, 5) // ÷ 1.0
    expect(l.cost_usd.value).toBeCloseTo(5679.0123, 3) // × $230
    expect(l.priority).toBe(2)
  })

  it('follows adjusted assumptions', () => {
    const l = lineFor(computeOrder(fire, factors, { stocking_tpa: 100, ...unity }), '522_4500', 'Douglas Fir')
    expect(l.trees.value).toBe(1000)
    expect(l.seedlings_per_lb.value).toBe(30455)
    expect(l.pounds.value).toBeCloseTo(1000 / 30455, 12)
    expect(l.bushels.value).toBeCloseTo(1000 / 30455 / 0.5, 12)
  })
})

describe('AON priority index (FR-021)', () => {
  it('thresholds at 10 / 11 / 100 / 101', () => {
    expect(priorityFor(0)).toBe(3)
    expect(priorityFor(10)).toBe(3)
    expect(priorityFor(10.5)).toBe(3)
    expect(priorityFor(11)).toBe(2)
    expect(priorityFor(100)).toBe(2)
    expect(priorityFor(100.01)).toBe(1)
    expect(priorityFor(101)).toBe(1)
  })

  it('is applied per line from computed bushels', () => {
    // Ponderosa: bushels = acres × 200 ÷ 9240 ÷ 1.0 with unity nursery factors.
    const at = (acres: number) => {
      const cells: Cell[] = [
        { cell_id: 'z_0', seed_zone: 'z', elevation_band: '0–500 ft', planting_acres: acres, species: [{ species: 'Ponderosa Pine', acres }] },
      ]
      return computeOrder(cells, factors, unity).lines[0]
    }
    expect(at(462).bushels.value).toBe(10)
    expect(at(462).priority).toBe(3)
    expect(at(509).priority).toBe(2) // 11.02 bushels
    expect(at(4620).bushels.value).toBe(100)
    expect(at(4620).priority).toBe(2)
    expect(at(4621).priority).toBe(1) // 100.02 bushels
  })
})

describe('lines, totals and findings', () => {
  const order = computeOrder(fire, factors)

  it('one line per species per cell, never merged', () => {
    const expected = fire.cells!.reduce((n, c) => n + c.species.length, 0)
    expect(order.lines).toHaveLength(expected)
    // Douglas Fir in zone 522 appears in two bands and stays two lines.
    expect(order.lines.filter((l) => l.species === 'Douglas Fir').map((l) => l.cell_id)).toEqual([
      '522_4500',
      '522_5000',
    ])
  })

  it('totals sum computable lines only and report the gap separately', () => {
    const ok = order.lines.filter((l) => l.gap === null)
    const sum = (k: 'trees' | 'pounds' | 'bushels' | 'cost_usd') => ok.reduce((s, l) => s + (l[k].value ?? 0), 0)
    const t = order.totals.overall
    expect(t.lines).toBe(ok.length)
    expect(t.trees.value).toBeCloseTo(sum('trees'), 9)
    expect(t.pounds.value).toBeCloseTo(sum('pounds'), 9)
    expect(t.bushels.value).toBeCloseTo(sum('bushels'), 9)
    expect(t.cost_usd.value).toBeCloseTo(sum('cost_usd'), 9)
    expect(t.gap_lines).toBe(1)
    expect(t.gap_trees.value).toBe(2000) // Knobcone Pine, 10 acres × 200
  })

  it('totals by species and by zone', () => {
    const df = order.totals.by_species['Douglas Fir']
    expect(df.lines).toBe(2)
    expect(df.bushels.value).toBeCloseTo(2 * 0.3242996, 6)
    expect(Object.keys(order.totals.by_zone).sort()).toEqual(['522', '526'])
    expect(order.totals.by_zone['526'].bushels.value).toBeCloseTo(24.691358, 5)
    expect(order.totals.by_zone['522'].gap_lines).toBe(1)
    expect(order.totals.by_species['Knobcone Pine'].lines).toBe(0)
  })

  it('carries fire id and perimeter date', () => {
    expect(order.fire_id).toBe('fixture-fire')
    expect(order.perimeter_source_date).toBe('2021-10-01')
    expect(order.finding).toBeNull()
    expect(computeOrder(fire.cells!, factors).fire_id).toBeNull()
  })

  it.each([
    ['no_retained_area', 'Entire perimeter lies outside State Responsibility Area.'],
    ['no_conifer', 'No conifer species present in pre-fire vegetation.'],
    ['no_interior', 'All burned acres lie within natural seeding distance. No planting order required.'],
  ] as const)('empty-result record %s gives zero lines and a finding, never a throw', (result, message) => {
    const rec: FireRecord = { fire: fire.fire, result, message }
    const o = computeOrder(rec, factors)
    expect(o.lines).toEqual([])
    expect(o.finding).toEqual({ result, message })
    expect(o.totals.overall.bushels.value).toBe(0)
    expect(o.fire_id).toBe('fixture-fire')
  })
})
