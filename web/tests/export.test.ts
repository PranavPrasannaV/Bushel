// T064: an export from defaults is distinguishable from an adjusted one by its contents alone
// (FR-027, quickstart Scenario 9). Uses the fixture fire and the real reference/factors.json.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeOrder, GAP_MESSAGE } from '../src/convert/computeOrder.ts'
import type { Factors, FireRecord } from '../src/convert/types.ts'
import { downloadOrderExport, exportOrder, toCsv, type ExportDoc } from '../src/export/exportOrder.ts'
import fireJson from './fixtures/fire.json'

const fire = fireJson as FireRecord
const factors = JSON.parse(
  readFileSync(new URL('../public/data/reference/factors.json', import.meta.url), 'utf8'),
) as Factors

const AT = '2026-09-18T12:00:00.000Z'
const UNPUBLISHED = ['seeds_per_pot', 'nursery_survival_rate', 'probability_of_tree_in_nursery']
const FACTOR_NAMES = [
  'stocking_tpa',
  'seeds_per_lb',
  ...UNPUBLISHED,
  'lbs_clean_seed_per_bushel',
  'price_per_lb_usd',
]

const exportWith = (assumptions = {}) =>
  exportOrder(computeOrder(fire, factors, assumptions, AT), fire, factors, AT)

const assumption = (doc: ExportDoc, name: string) => doc.assumptions.find((a) => a.name === name)!
const lineFor = (doc: ExportDoc, species: string) => doc.lines.find((l) => l.species === species)!

/** Minimal CSV row parser (quoted fields, doubled quotes). */
function parseRow(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

function csvTable(csv: string): { comments: string[]; rows: Record<string, string>[] } {
  const all = csv.split('\n').filter((l) => l !== '')
  const comments = all.filter((l) => l.startsWith('#'))
  const [header, ...data] = all.filter((l) => !l.startsWith('#')).map(parseRow)
  const rows = data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
  return { comments, rows }
}

describe('defaults vs adjusted are distinguishable by contents alone', () => {
  const defaults = exportWith()
  const adjusted = exportWith({ seeds_per_pot: 3 })

  it('carries a top-level adjusted flag', () => {
    expect(defaults.adjusted).toBe(false)
    expect(adjusted.adjusted).toBe(true)
  })

  it('records default_value (identical) and current_value (different) for the adjusted assumption', () => {
    const d = assumption(defaults, 'seeds_per_pot')
    const a = assumption(adjusted, 'seeds_per_pot')
    expect(d.default_value).toBe(a.default_value)
    expect(d.default_value).toBe(2)
    expect(d.current_value).toBe(2)
    expect(a.current_value).toBe(3)
    expect(d.adjusted).toBe(false)
    expect(a.adjusted).toBe(true)
    // The untouched assumptions stay unadjusted in both.
    for (const name of ['stocking_tpa', 'nursery_survival_rate', 'probability_of_tree_in_nursery']) {
      expect(assumption(adjusted, name).adjusted).toBe(false)
      expect(assumption(adjusted, name).current_value).toBe(assumption(adjusted, name).default_value)
    }
  })

  it('records every assumption with default, current, bounds and status', () => {
    for (const doc of [defaults, adjusted]) {
      expect(doc.assumptions.map((a) => a.name).sort()).toEqual(['stocking_tpa', ...UNPUBLISHED].sort())
      for (const a of doc.assumptions) {
        expect(a).toEqual(
          expect.objectContaining({
            default_value: expect.any(Number),
            current_value: expect.any(Number),
            min: expect.any(Number),
            max: expect.any(Number),
            clamped: expect.any(Boolean),
            adjusted: a.current_value !== a.default_value,
          }),
        )
        expect(a.status).toBe(UNPUBLISHED.includes(a.name) ? 'unpublished' : 'published')
        expect(a.source_ref.length).toBeGreaterThan(0)
      }
    }
  })

  it('a published adjustment (stocking) also flags the export', () => {
    const doc = exportWith({ stocking_tpa: 150 })
    expect(doc.adjusted).toBe(true)
    expect(assumption(doc, 'stocking_tpa')).toMatchObject({ default_value: 200, current_value: 150, adjusted: true })
  })

  it('a request clamped back to the default is recorded as clamped, not adjusted', () => {
    const doc = exportWith({ stocking_tpa: 999 })
    expect(assumption(doc, 'stocking_tpa')).toMatchObject({
      requested_value: 999,
      current_value: 200,
      clamped: true,
      adjusted: false,
    })
    expect(doc.adjusted).toBe(false)
  })

  it('the JSON and CSV texts differ, and the CSV header says which is which', () => {
    expect(JSON.stringify(defaults)).not.toBe(JSON.stringify(adjusted))
    const dCsv = toCsv(defaults)
    const aCsv = toCsv(adjusted)
    expect(dCsv).not.toBe(aCsv)
    expect(dCsv).toContain('# Adjusted from defaults: no')
    expect(aCsv).toContain('# Adjusted from defaults: yes')
  })
})

describe('the per-cell breakdown survives the export', () => {
  const order = computeOrder(fire, factors, { nursery_survival_rate: 0.7 }, AT)
  const doc = exportOrder(order, fire, factors, AT)

  it('keeps fire identity, perimeter date and provisional flag', () => {
    expect(doc.fire).toEqual({
      id: 'fixture-fire',
      name: 'Fixture Fire (test data)',
      year: 2021,
      perimeter_source_date: '2021-10-01',
      provisional: false,
    })
    expect(doc.exported_at).toBe(AT)
    expect(doc.computed_at).toBe(AT)
  })

  it('keeps one line per cell × species with quantities, units and priority', () => {
    expect(doc.lines).toHaveLength(order.lines.length)
    order.lines.forEach((l, i) => {
      const e = doc.lines[i]
      expect([e.cell_id, e.seed_zone, e.elevation_band, e.species]).toEqual([
        l.cell_id,
        l.seed_zone,
        l.elevation_band,
        l.species,
      ])
      expect(e.acres).toEqual(l.acres)
      expect(e.trees).toEqual(l.trees)
      expect(e.pounds).toEqual(l.pounds)
      expect(e.bushels).toEqual(l.bushels)
      expect(e.cost_usd).toEqual(l.cost_usd)
      expect(e.priority).toBe(l.priority)
      expect(e.bushels.unit).toBe('bushels of cones')
      expect(e.seedlings_per_lb.unit).toBe('seedlings/lb (two-year-equivalent)')
    })
    expect(doc.totals).toEqual(order.totals)
  })

  it('every line keeps source_ref, status and fallback_applied for every factor', () => {
    for (const l of doc.lines) {
      expect(l.factors.map((f) => f.name)).toEqual(FACTOR_NAMES)
      for (const f of l.factors) {
        expect(f.source_ref.length).toBeGreaterThan(0)
        expect(f.status).toBe(UNPUBLISHED.includes(f.name) ? 'unpublished' : 'published')
        expect(typeof f.fallback_applied).toBe('boolean')
      }
    }
  })

  it('preserves used_fallback per line, matching the lbs-per-bushel factor flag', () => {
    expect(lineFor(doc, 'Western White Pine').used_fallback).toBe(true)
    expect(lineFor(doc, 'Knobcone Pine').used_fallback).toBe(true)
    expect(lineFor(doc, 'Douglas Fir').used_fallback).toBe(false)
    order.lines.forEach((l, i) => {
      const e = doc.lines[i]
      expect(e.used_fallback).toBe(l.used_fallback)
      expect(e.factors.find((f) => f.name === 'lbs_clean_seed_per_bushel')!.fallback_applied).toBe(l.used_fallback)
    })
  })

  it('preserves gap lines with null seed quantities, through a JSON round trip', () => {
    const round = JSON.parse(JSON.stringify(doc)) as ExportDoc
    const gap = lineFor(round, 'Knobcone Pine')
    expect(gap.gap).toBe(GAP_MESSAGE)
    expect(gap.trees.value).toBe(10 * 200)
    expect(gap.seedlings_per_lb.value).toBeNull()
    expect(gap.pounds.value).toBeNull()
    expect(gap.bushels.value).toBeNull()
    expect(gap.cost_usd.value).toBeNull()
    expect(gap.priority).toBeNull()
    expect(gap.factors.find((f) => f.name === 'seeds_per_lb')!.value).toBeNull()
    expect(round).toEqual(doc)
  })

  it('carries the unit notes and never calls bushels seed', () => {
    const text = JSON.stringify(doc) + toCsv(doc)
    expect(doc.unit_notes.join(' ')).toMatch(/bushels of cones/)
    expect(doc.unit_notes.join(' ')).toMatch(/two-year-equivalent/)
    expect(doc.unit_notes.join(' ')).toMatch(/seed price list/)
    expect(text).not.toMatch(/bushels? of (conifer )?seed/i)
  })

  it('is pure: same inputs, same document; the order is not mutated', () => {
    const before = structuredClone(order)
    const again = exportOrder(order, fire, factors, AT)
    expect(again).toEqual(doc)
    again.lines[0].acres.value = -1
    again.totals.overall.lines = -1
    expect(order).toEqual(before)
  })
})

describe('CSV', () => {
  const doc = exportWith({ seeds_per_pot: 3 })
  const csv = toCsv(doc)
  const { comments, rows } = csvTable(csv)

  it('has one row per line', () => {
    expect(rows).toHaveLength(doc.lines.length)
    rows.forEach((r, i) => {
      expect(r.cell_id).toBe(doc.lines[i].cell_id)
      expect(r.species).toBe(doc.lines[i].species)
      expect(r.used_fallback).toBe(String(doc.lines[i].used_fallback))
    })
  })

  it('has a commented header block listing every assumption with default and current values', () => {
    expect(comments).toContain('# Assumptions:')
    const assumptionRows = comments
      .filter((c) => c.startsWith('# assumption,'))
      .map((c) => parseRow(c.slice(2)))
    const [head, ...body] = assumptionRows
    expect(head).toEqual(expect.arrayContaining(['default_value', 'current_value', 'adjusted']))
    const byName = Object.fromEntries(body.map((r) => [r[1], Object.fromEntries(head.map((h, i) => [h, r[i]]))]))
    expect(Object.keys(byName).sort()).toEqual(['stocking_tpa', ...UNPUBLISHED].sort())
    expect(byName.seeds_per_pot).toMatchObject({ status: 'unpublished', default_value: '2', current_value: '3', adjusted: 'true' })
    expect(byName.stocking_tpa).toMatchObject({ status: 'published', default_value: '200', current_value: '200', adjusted: 'false' })
  })

  it('lists sources in the header', () => {
    expect(comments).toContain('# Sources:')
    for (const p of factors.published) expect(csv).toContain(p.source_ref)
  })

  it('leaves gap quantities empty rather than zero', () => {
    const gap = rows.find((r) => r.species === 'Knobcone Pine')!
    expect(gap.gap).toBe(GAP_MESSAGE)
    expect(gap.trees).toBe('2000')
    expect(gap.lb_clean_seed).toBe('')
    expect(gap.bushels_of_cones).toBe('')
    expect(gap.cost_usd).toBe('')
    expect(gap.priority).toBe('')
  })

  it('an empty-result record exports its finding and no rows', () => {
    const empty: FireRecord = {
      fire: fire.fire,
      retained: fire.retained,
      result: 'no_interior',
      message: 'All burned acres lie within natural seeding distance. No planting order required.',
    }
    const d = exportOrder(computeOrder(empty, factors, {}, AT), empty, factors, AT)
    expect(d.lines).toEqual([])
    expect(d.finding).toEqual({ result: 'no_interior', message: empty.message })
    const t = csvTable(toCsv(d))
    expect(t.rows).toEqual([])
    expect(t.comments.some((c) => c.includes('no_interior'))).toBe(true)
  })
})

describe('downloadOrderExport', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads bushel-order-<fireId>.json and .csv stamped with the current time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(AT))
    const blobs: Blob[] = []
    const clicked: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blobs.push(b as Blob)
      return `blob:${blobs.length}`
    })
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('document', {
      createElement: () => {
        const a = { href: '', download: '', click: () => clicked.push(a.download), remove: () => {} }
        return a
      },
      body: { append: () => {} },
    })

    const order = computeOrder(fire, factors, { seeds_per_pot: 3 }, AT)
    downloadOrderExport(order, fire, factors)

    expect(clicked).toEqual(['bushel-order-fixture-fire.json', 'bushel-order-fixture-fire.csv'])
    const json = JSON.parse(await blobs[0].text()) as ExportDoc
    expect(json.exported_at).toBe(AT)
    expect(json.adjusted).toBe(true)
    expect(json).toEqual(exportOrder(order, fire, factors, AT))
    const csvText = (await blobs[1].text()).replace(/^﻿/, '')
    expect(csvText).toBe(toCsv(json))
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledTimes(2)
  })
})
