// Phase 2 seam: the pipeline-built reference/factors.json, consumed by computeOrder exactly as written.
// No skip: web/public/data/reference/ is committed, so a missing or reshaped file must fail here.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeOrder, GAP_MESSAGE } from '../src/convert/computeOrder.ts'
import type { Cell, Factors, FireRecord } from '../src/convert/types.ts'
import fireJson from './fixtures/fire.json'

const real = JSON.parse(
  readFileSync(new URL('../public/data/reference/factors.json', import.meta.url), 'utf8'),
) as Factors

// Douglas Fir: Table 2 + Terms of Sale. Western White Pine: Terms of Sale, Table 2 fallback.
// Knobcone Pine: no Terms of Sale row (gap). Acres are test inputs, not figures.
const cells: Cell[] = [
  {
    cell_id: '522_4500',
    seed_zone: '522',
    elevation_band: '4500–5000 ft',
    planting_acres: 25,
    species: [
      { species: 'Douglas Fir', acres: 10 },
      { species: 'Western White Pine', acres: 5 },
      { species: 'Knobcone Pine', acres: 10 },
    ],
  },
]

describe('real factors.json -> computeOrder', () => {
  const o = computeOrder(cells, real)
  const line = (s: string) => o.lines.find((l) => l.species === s)!

  it('published species: hand arithmetic at defaults (200 TPA, 2 seeds/pot, 0.9, 0.9)', () => {
    const l = line('Douglas Fir')
    const spl = (30455 / 2) * 0.9 * 0.9 // Terms of Sale 30,455 seeds/lb
    const lb = 2000 / spl
    expect(l.trees.value).toBe(2000)
    expect(l.seedlings_per_lb.value).toBeCloseTo(spl, 6)
    expect(l.pounds.value).toBeCloseTo(lb, 9)
    expect(l.bushels.value).toBeCloseTo(lb / 0.5, 9) // Table 2: 0.5 lb/bushel
    expect(l.cost_usd.value).toBeCloseTo(lb * 497, 6) // $497.00/lb
    expect(l.used_fallback).toBe(false)
    expect(l.gap).toBeNull()
    expect(l.priority).toBe(3)
  })

  it('Table 2 fallback species: 1 bushel = 1 lb, flagged', () => {
    const l = line('Western White Pine')
    const lb = 1000 / ((13717 / 2) * 0.9 * 0.9)
    expect(l.pounds.value).toBeCloseTo(lb, 9)
    expect(l.bushels.value).toBeCloseTo(lb, 9)
    expect(l.cost_usd.value).toBeCloseTo(lb * 268, 6)
    expect(l.used_fallback).toBe(true)
    expect(l.factors.find((f) => f.name === 'lbs_clean_seed_per_bushel')!.fallback_applied).toBe(true)
  })

  it('gap species: trees only, gap disclosed, excluded from totals', () => {
    const l = line('Knobcone Pine')
    expect(l.trees.value).toBe(2000)
    for (const k of ['seedlings_per_lb', 'pounds', 'bushels', 'cost_usd'] as const) expect(l[k].value).toBeNull()
    expect(l.priority).toBeNull()
    expect(l.gap).toBe(GAP_MESSAGE)
    expect(o.totals.overall.lines).toBe(2)
    expect(o.totals.overall.gap_lines).toBe(1)
    expect(o.totals.overall.gap_trees.value).toBe(2000)
  })

  it('unpublished factors carry their source_ref from factors.json', () => {
    for (const name of ['seeds_per_pot', 'nursery_survival_rate', 'probability_of_tree_in_nursery']) {
      const f = line('Douglas Fir').factors.find((x) => x.name === name)!
      expect(f.status).toBe('unpublished')
      expect(f.source_ref).toBe(real.unpublished.find((u) => u.name === name)!.source_ref)
    }
  })

  it('consumes the shared contract-shaped fire record (also validated by pipeline test_seams.py)', () => {
    const fire = fireJson as FireRecord
    expect(fire.retained && fire.planting && fire.geometry_ref).toBeTruthy()
    const order = computeOrder(fire, real)
    expect(order.fire_id).toBe('fixture-fire')
    expect(order.lines.reduce((s, l) => s + (l.acres.value ?? 0), 0)).toBeCloseTo(fire.planting!.interior_acres, 9)
  })
})
