// T035: unit discipline, enforced by code rather than convention (Constitution II, FR-015–FR-018).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeOrder, GAP_MESSAGE } from '../src/convert/computeOrder.ts'
import type { Factors, FireRecord, Order, Quantity } from '../src/convert/types.ts'
import factorsJson from './fixtures/factors.json'
import fireJson from './fixtures/fire.json'

const factors = factorsJson as Factors
const fire = fireJson as FireRecord
const order = computeOrder(fire, factors)

const published = (f: Factors, name: string) => f.published.find((p) => p.name === name)!
const trail = (l: Order['lines'][number], name: string) => l.factors.find((f) => f.name === name)!
const line = (o: Order, species: string) => o.lines.find((l) => l.species === species)!

/** Every Quantity anywhere in an order, with its path. */
function quantities(o: Order): [string, Quantity][] {
  const out: [string, Quantity][] = []
  const walk = (v: unknown, path: string) => {
    if (!v || typeof v !== 'object') return
    if ('unit' in v && 'value' in v && !('status' in v)) out.push([path, v as Quantity])
    for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`)
  }
  walk(o, 'order')
  return out
}

describe('bushels measure cones, never seed (FR-015)', () => {
  it('every bushels quantity says "bushels of cones" and never mentions seed', () => {
    const bushels = quantities(order).filter(([path]) => path.endsWith('.bushels'))
    expect(bushels.length).toBeGreaterThan(order.lines.length) // lines + every total
    for (const [, qty] of bushels) {
      expect(qty.unit).toBe('bushels of cones')
      expect(`${qty.unit} ${qty.label ?? ''}`).not.toMatch(/seed/i)
    }
  })

  it('pounds are pounds of clean seed', () => {
    for (const l of order.lines) expect(l.pounds.unit).toBe('lb clean seed')
  })
})

describe('seeds per pound is never substituted for seedlings per pound (FR-016)', () => {
  it('seedlings/lb differs from seeds/lb under defaults, for every computable line', () => {
    for (const l of order.lines.filter((x) => x.gap === null)) {
      const seeds = trail(l, 'seeds_per_lb')
      expect(seeds.unit).toBe('seeds/lb')
      expect(l.seedlings_per_lb.unit).not.toBe('seeds/lb')
      expect(l.seedlings_per_lb.value).not.toBe(seeds.value)
      expect(l.seedlings_per_lb.value).toBeCloseTo((seeds.value! / 2) * 0.9 * 0.9, 9)
    }
  })

  it('pounds divide trees by seedlings/lb, not by seeds/lb', () => {
    for (const l of order.lines.filter((x) => x.gap === null)) {
      const seeds = trail(l, 'seeds_per_lb').value!
      expect(l.pounds.value).toBeCloseTo(l.trees.value! / l.seedlings_per_lb.value!, 12)
      expect(l.pounds.value).not.toBeCloseTo(l.trees.value! / seeds, 6)
    }
  })
})

describe('seedling figures are two-year-equivalent (FR-017)', () => {
  it('every seedling-denominated quantity carries the label', () => {
    const seedling = quantities(order).filter(([, q]) => /seedling/i.test(q.unit))
    expect(seedling.length).toBe(order.lines.length)
    for (const [, q] of seedling) {
      expect(q.unit).toBe('seedlings/lb (two-year-equivalent)')
      expect(q.label).toBe('two-year-equivalent')
    }
  })
})

describe('cost comes from the seed price list, in dollars per pound (FR-018)', () => {
  const priceF = published(factors, 'price_per_lb_usd')

  it('cost = pounds × price_per_lb_usd, tagged USD, sourced to the seed list', () => {
    for (const l of order.lines.filter((x) => x.gap === null)) {
      const price = trail(l, 'price_per_lb_usd')
      expect(price.value).toBe(priceF.by_species![l.species])
      expect(price.unit).toBe('USD/lb')
      expect(price.source_ref).toMatch(/seed price list/i)
      expect(l.cost_usd.unit).toBe('USD')
      expect(l.cost_usd.value).toBeCloseTo(l.pounds.value! * price.value!, 9)
    }
  })

  it('changes when, and only when, the seed price changes', () => {
    const k = structuredClone(factors)
    published(k, 'price_per_lb_usd').by_species!['Douglas Fir'] = 994
    const a = line(order, 'Douglas Fir')
    const b = line(computeOrder(fire, k), 'Douglas Fir')
    expect(b.cost_usd.value).toBeCloseTo(a.cost_usd.value! * 2, 9)
    expect(b.pounds.value).toBe(a.pounds.value)
    expect(b.bushels.value).toBe(a.bushels.value)
  })
})

describe('Table 2 fallback lines are flagged (R5)', () => {
  it('fallback species use 1 bushel = 1 lb and say so; Table 2 species do not', () => {
    for (const species of ['Western White Pine', 'Knobcone Pine']) {
      const l = line(order, species)
      expect(l.used_fallback).toBe(true)
      expect(trail(l, 'lbs_clean_seed_per_bushel')).toMatchObject({ value: 1, fallback_applied: true })
      expect(trail(l, 'lbs_clean_seed_per_bushel').source_ref).toMatch(/1 bushel = 1 lb/)
    }
    const wwp = line(order, 'Western White Pine')
    expect(wwp.bushels.value).toBe(wwp.pounds.value)

    for (const species of ['Douglas Fir', 'Sugar Pine', 'Ponderosa Pine']) {
      const l = line(order, species)
      expect(l.used_fallback).toBe(false)
      expect(trail(l, 'lbs_clean_seed_per_bushel').fallback_applied).toBe(false)
    }
  })
})

describe('gap species are disclosed, never filled (Constitution IV)', () => {
  it('Knobcone Pine computes trees but nothing seed-denominated', () => {
    const l = line(order, 'Knobcone Pine')
    expect(l.gap).toBe(GAP_MESSAGE)
    expect(l.trees.value).toBe(2000)
    expect(l.seedlings_per_lb.value).toBeNull()
    expect(l.pounds.value).toBeNull()
    expect(l.bushels.value).toBeNull()
    expect(l.cost_usd.value).toBeNull()
    expect(l.priority).toBeNull()
    expect(trail(l, 'seeds_per_lb').value).toBeNull()
    // Units are still carried on null values.
    expect(l.bushels.unit).toBe('bushels of cones')
  })
})

describe('provenance trail', () => {
  it('marks the three nursery factors unpublished and the rest published', () => {
    for (const l of order.lines) {
      const status = Object.fromEntries(l.factors.map((f) => [f.name, f.status]))
      expect(status).toEqual({
        stocking_tpa: 'published',
        seeds_per_lb: 'published',
        seeds_per_pot: 'unpublished',
        nursery_survival_rate: 'unpublished',
        probability_of_tree_in_nursery: 'unpublished',
        lbs_clean_seed_per_bushel: 'published',
        price_per_lb_usd: 'published',
      })
      for (const f of l.factors) expect(f.source_ref.length).toBeGreaterThan(0)
    }
  })
})

describe('assumption bounds are enforced', () => {
  it('clamps every adjustable input and records the value actually used', () => {
    const o = computeOrder(fire, factors, {
      stocking_tpa: 500,
      seeds_per_pot: 0,
      nursery_survival_rate: 1.5,
      probability_of_tree_in_nursery: 0.1,
    })
    const used = Object.fromEntries(o.assumptions_used.map((a) => [a.name, a]))
    expect(used.stocking_tpa).toMatchObject({ requested_value: 500, current_value: 200, default_value: 200, clamped: true })
    expect(used.seeds_per_pot).toMatchObject({ requested_value: 0, current_value: 1, clamped: true })
    expect(used.nursery_survival_rate).toMatchObject({ requested_value: 1.5, current_value: 1, clamped: true })
    expect(used.probability_of_tree_in_nursery).toMatchObject({ requested_value: 0.1, current_value: 0.5, clamped: true })

    const l = line(o, 'Douglas Fir')
    expect(trail(l, 'stocking_tpa').value).toBe(200)
    expect(trail(l, 'seeds_per_pot').value).toBe(1)
    expect(trail(l, 'nursery_survival_rate').value).toBe(1)
    expect(trail(l, 'probability_of_tree_in_nursery').value).toBe(0.5)
    expect(l.trees.value).toBe(2000)
    expect(l.seedlings_per_lb.value).toBeCloseTo(30455 * 1 * 0.5, 9)
  })

  it('clamps stocking to the 50 TPA floor and ignores non-numbers', () => {
    const o = computeOrder(fire, factors, { stocking_tpa: 10, seeds_per_pot: Number.NaN })
    const used = Object.fromEntries(o.assumptions_used.map((a) => [a.name, a]))
    expect(used.stocking_tpa.current_value).toBe(50)
    expect(used.seeds_per_pot).toMatchObject({ current_value: 2, clamped: false })
  })

  it('defaults are unclamped and match factors.json', () => {
    for (const a of order.assumptions_used) {
      expect(a.clamped).toBe(false)
      expect(a.current_value).toBe(a.default_value)
    }
  })
})

// The real artifact is produced by the pipeline; run the same checks against it once it exists.
const realPath = new URL('../public/data/reference/factors.json', import.meta.url)
describe.skipIf(!existsSync(realPath))('against the pipeline-built reference/factors.json', () => {
  it('computes the fixture fire with gaps disclosed and fallbacks flagged', () => {
    const real = JSON.parse(readFileSync(realPath, 'utf8')) as Factors
    const o = computeOrder(fire, real)
    expect(line(o, 'Knobcone Pine').gap).toBe(GAP_MESSAGE)
    expect(line(o, 'Western White Pine').used_fallback).toBe(true)
    expect(line(o, 'Douglas Fir').used_fallback).toBe(false)
    expect(trail(line(o, 'Douglas Fir'), 'seeds_per_lb').value).toBe(30455)
    for (const l of o.lines.filter((x) => x.gap === null)) {
      expect(l.bushels.unit).toBe('bushels of cones')
      expect(l.seedlings_per_lb.value).not.toBe(trail(l, 'seeds_per_lb').value)
    }
    expect(computeOrder(fire, real)).toEqual(o)
  })
})
