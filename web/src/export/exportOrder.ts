// US4 export (T062, T063): the order leaves the tool intact (FR-027, quickstart Scenario 9).
//
// exportOrder and toCsv are pure: no I/O, no clock. Only downloadOrderExport touches the DOM and the
// clock. The export keeps the per-cell lines, every factor's source_ref + status + fallback flag, and
// every assumption with both its default and its current value, so an export made from defaults and
// one made after an adjustment can be told apart from their contents alone.

import type {
  AssumptionUse,
  Factors,
  Finding,
  FireRecord,
  Order,
  OrderLine,
  Priority,
  Quantity,
  Totals,
} from '../convert/types.ts'

export interface ExportFactor {
  name: string
  value: number | null
  unit: string
  status: 'published' | 'unpublished'
  source_ref: string
  fallback_applied: boolean
}

export interface ExportLine {
  cell_id: string
  seed_zone: string
  elevation_band: string
  species: string
  acres: Quantity
  trees: Quantity
  seedlings_per_lb: Quantity
  pounds: Quantity
  bushels: Quantity
  cost_usd: Quantity
  priority: Priority | null
  used_fallback: boolean
  gap: string | null
  factors: ExportFactor[]
}

export interface ExportAssumption {
  name: string
  status: 'published' | 'unpublished'
  unit: string
  default_value: number
  requested_value: number
  current_value: number
  min: number
  max: number
  clamped: boolean
  /** current_value !== default_value (FR-027). */
  adjusted: boolean
  source_ref: string
}

export interface ExportSource {
  name: string
  unit: string
  status: 'published' | 'unpublished'
  source_ref: string
}

export interface ExportDoc {
  format: 'bushel-order-export'
  version: 1
  exported_at: string
  computed_at: string | null
  fire: {
    id: string | null
    name: string | null
    year: number | null
    perimeter_source_date: string | null
    provisional: boolean | null
  }
  /** True when any assumption's current value differs from its default. */
  adjusted: boolean
  unit_notes: string[]
  assumptions: ExportAssumption[]
  sources: ExportSource[]
  finding: Finding | null
  lines: ExportLine[]
  totals: {
    overall: Totals
    by_species: Record<string, Totals>
    by_zone: Record<string, Totals>
  }
}

function sourceRefFor(factors: Factors, a: AssumptionUse): string {
  const f =
    a.status === 'published'
      ? factors.published.find((p) => p.name === a.name)
      : factors.unpublished.find((u) => u.name === a.name)
  if (!f) throw new Error(`factors.json has no factor "${a.name}"`)
  if ('unpublished_by' in f) return f.source_ref ?? `Not published by ${f.unpublished_by}`
  return f.source_ref
}

function unitNotes(factors: Factors): string[] {
  const ref = (name: string) => factors.published.find((p) => p.name === name)?.source_ref ?? name
  const lbs = factors.published.find((p) => p.name === 'lbs_clean_seed_per_bushel')
  const stocking = factors.published.find((p) => p.name === 'stocking_tpa')
  const notes = [
    `Bushels are bushels of cones, not seed: bushels = lb clean seed ÷ lb clean seed per bushel of cones (${ref('lbs_clean_seed_per_bushel')}).`,
    `Seeds per lb is the "Average Seeds/pounds" figure (${ref('seeds_per_lb')}): seeds, not seedlings.`,
    'Seedling figures are two-year-equivalent: the nursery survival factor is calibrated to a two-year seedling. Quantities are reported in lb clean seed and bushels of cones.',
    `Cost is priced from the seed price list in USD per lb of seed (${ref('price_per_lb_usd')}), never the seedling price list.`,
    'Assumptions with status "unpublished" are not published by CAL FIRE. Their defaults are general placeholders, not CAL FIRE\'s figures; current_value is the value used.',
    'Lines with a gap have no published seeds/lb or seed price: they carry trees only; seedlings/lb, lb clean seed, bushels, cost and priority are empty and excluded from totals.',
  ]
  if (lbs?.fallback) {
    notes.push(`Lines marked used_fallback apply the fallback rule "${lbs.fallback.rule}".`)
  }
  if (stocking?.caveat) notes.push(`Stocking (trees/acre): ${stocking.caveat}`)
  notes.push('Advisory: an order for a professional to review and submit. It is not an agency commitment.')
  return notes
}

/** Build the export document. Pure: the caller supplies `exportedAt`. */
export function exportOrder(order: Order, fire: FireRecord, factors: Factors, exportedAt: string): ExportDoc {
  const assumptions: ExportAssumption[] = order.assumptions_used.map((a) => ({
    name: a.name,
    status: a.status,
    unit: a.unit,
    default_value: a.default_value,
    requested_value: a.requested_value,
    current_value: a.current_value,
    min: a.min,
    max: a.max,
    clamped: a.clamped,
    adjusted: a.current_value !== a.default_value,
    source_ref: sourceRefFor(factors, a),
  }))

  const sources: ExportSource[] = [
    ...factors.published.map((p) => ({
      name: p.name,
      unit: p.unit,
      status: 'published' as const,
      source_ref: p.fallback ? `${p.source_ref}; fallback: ${p.fallback.rule}` : p.source_ref,
    })),
    ...factors.unpublished.map((u) => ({
      name: u.name,
      unit: u.unit,
      status: 'unpublished' as const,
      source_ref: u.source_ref ?? `Not published by ${u.unpublished_by}`,
    })),
  ]

  const lines: ExportLine[] = order.lines.map((l: OrderLine) => ({
    cell_id: l.cell_id,
    seed_zone: l.seed_zone,
    elevation_band: l.elevation_band,
    species: l.species,
    acres: { ...l.acres },
    trees: { ...l.trees },
    seedlings_per_lb: { ...l.seedlings_per_lb },
    pounds: { ...l.pounds },
    bushels: { ...l.bushels },
    cost_usd: { ...l.cost_usd },
    priority: l.priority,
    used_fallback: l.used_fallback,
    gap: l.gap,
    factors: l.factors.map((f) => ({
      name: f.name,
      value: f.value,
      unit: f.unit,
      status: f.status,
      source_ref: f.source_ref,
      fallback_applied: f.fallback_applied === true,
    })),
  }))

  return {
    format: 'bushel-order-export',
    version: 1,
    exported_at: exportedAt,
    computed_at: order.computed_at,
    fire: {
      id: fire.fire?.id ?? order.fire_id,
      name: fire.fire?.name ?? null,
      year: fire.fire?.year ?? null,
      perimeter_source_date: fire.fire?.perimeter_source_date ?? order.perimeter_source_date,
      provisional: fire.fire?.provisional ?? null,
    },
    adjusted: assumptions.some((a) => a.adjusted),
    unit_notes: unitNotes(factors),
    assumptions,
    sources,
    finding: order.finding ? { ...order.finding } : null,
    lines,
    totals: structuredClone(order.totals),
  }
}

// ---- CSV -------------------------------------------------------------------

const FACTOR_COLUMNS = [
  'stocking_tpa',
  'seeds_per_lb',
  'seeds_per_pot',
  'nursery_survival_rate',
  'probability_of_tree_in_nursery',
  'lbs_clean_seed_per_bushel',
  'price_per_lb_usd',
]

const LINE_COLUMNS = [
  'cell_id',
  'seed_zone',
  'elevation_band',
  'species',
  'acres',
  'trees',
  'seedlings_per_lb_two_year_equivalent',
  'lb_clean_seed',
  'bushels_of_cones',
  'cost_usd',
  'priority',
  'used_fallback',
  'gap',
  ...FACTOR_COLUMNS,
]

function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

function row(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(cell).join(',')
}

function totalsText(label: string, t: Totals): string {
  return (
    `# ${label}: ${t.lines} lines; ${t.trees.value} trees; ${t.pounds.value} lb clean seed; ` +
    `${t.bushels.value} bushels of cones; ${t.cost_usd.value} USD; ` +
    `gap lines excluded from sums: ${t.gap_lines} (${t.gap_trees.value} trees)`
  )
}

/** Flat CSV, one row per cell × species, with a commented (#) header block for assumptions and sources. */
export function toCsv(doc: ExportDoc): string {
  const f = doc.fire
  const out: string[] = [
    '# Bushel seed order export',
    `# Fire: ${f.name ?? ''} (id ${f.id ?? ''}), ${f.year ?? ''}; perimeter source date ${f.perimeter_source_date ?? ''}; provisional: ${f.provisional ?? ''}`,
    `# Exported at: ${doc.exported_at}; computed at: ${doc.computed_at ?? ''}`,
    `# Adjusted from defaults: ${doc.adjusted ? 'yes' : 'no'}`,
    '#',
    '# Notes:',
    ...doc.unit_notes.map((n) => `# - ${n}`),
    '#',
    '# Assumptions:',
    '# ' + row(['assumption', 'name', 'status', 'unit', 'default_value', 'current_value', 'requested_value', 'min', 'max', 'clamped', 'adjusted', 'source_ref']),
    ...doc.assumptions.map(
      (a) =>
        '# ' +
        row(['assumption', a.name, a.status, a.unit, a.default_value, a.current_value, a.requested_value, a.min, a.max, a.clamped, a.adjusted, a.source_ref]),
    ),
    '#',
    '# Sources:',
    '# ' + row(['source', 'name', 'status', 'unit', 'source_ref']),
    ...doc.sources.map((s) => '# ' + row(['source', s.name, s.status, s.unit, s.source_ref])),
    '#',
    totalsText('Totals', doc.totals.overall),
  ]
  if (doc.finding) out.push(`# Finding (${doc.finding.result}): ${doc.finding.message}`)
  out.push(row(LINE_COLUMNS))
  for (const l of doc.lines) {
    const factorValue = (name: string) => l.factors.find((x) => x.name === name)?.value ?? null
    out.push(
      row([
        l.cell_id,
        l.seed_zone,
        l.elevation_band,
        l.species,
        l.acres.value,
        l.trees.value,
        l.seedlings_per_lb.value,
        l.pounds.value,
        l.bushels.value,
        l.cost_usd.value,
        l.priority,
        l.used_fallback,
        l.gap,
        ...FACTOR_COLUMNS.map(factorValue),
      ]),
    )
  }
  return out.join('\n') + '\n'
}

// ---- Download (the only DOM/clock-touching function) ------------------------

function save(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Download bushel-order-<fireId>.json and .csv for the current order. */
export function downloadOrderExport(order: Order, fire: FireRecord, factors: Factors): void {
  const doc = exportOrder(order, fire, factors, new Date().toISOString())
  const id = (doc.fire.id ?? 'order').replace(/[^A-Za-z0-9_-]+/g, '-')
  save(`bushel-order-${id}.json`, JSON.stringify(doc, null, 2) + '\n', 'application/json')
  // BOM so spreadsheet apps read the UTF-8 (en dashes in elevation bands) correctly.
  save(`bushel-order-${id}.csv`, '﻿' + toCsv(doc), 'text/csv;charset=utf-8')
}
