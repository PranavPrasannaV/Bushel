// Types for the pipeline artifacts (contracts/pipeline-output.md + implementation-notes.md)
// and for the web-side conversion (computeOrder).

// ---- Pipeline artifacts ----------------------------------------------------

export interface FireIndexEntry {
  id: string
  name: string
  year: number
  discovery_date: string
  perimeter_acres: number
  retained_acres: number
  interior_acres: number
  provisional: boolean
}

export interface FireIndex {
  generated_at: string
  severity_source: string
  coverage_years: [number, number]
  fires: FireIndexEntry[]
}

export interface CellSpecies {
  species: string
  acres: number
}

export interface Cell {
  cell_id: string
  seed_zone: string
  elevation_band: string
  planting_acres: number
  species: CellSpecies[]
}

export type EmptyResult = 'no_retained_area' | 'no_conifer' | 'no_interior'

export interface Finding {
  result: EmptyResult
  message: string
}

/** fires/{id}.json. An empty-result record carries `result` + `message` instead of cells. */
export interface FireRecord {
  fire?: {
    id: string
    name: string
    year: number
    discovery_date: string
    perimeter_source_date: string
    provisional: boolean
  }
  retained?: {
    perimeter_acres: number
    retained_acres: number
    excluded_acres: number
    excluded_reason: string
    high_severity_acres: number
    conifer_acres?: number
  }
  planting?: {
    interior_acres: number
    threshold_m: number
    threshold_source: string
    interior_fraction: number
    baker_reference_fraction: number
    note: string
  }
  cells?: Cell[]
  result?: EmptyResult
  message?: string
  geometry_ref?: string
}

/** One entry of reference/factors.json `published`. Scalar factors carry `value`; per-species ones `by_species`. */
export interface PublishedFactor {
  name: string
  unit: string
  source_ref: string
  status: 'published'
  value?: number
  adjustable?: boolean
  min?: number
  max?: number
  caveat?: string
  by_species?: Record<string, number>
  fallback?: { value: number; rule: string }
  fallback_species?: string[]
  /** Per species, true where the Table 2 fallback applies. */
  fallback_applied?: Record<string, boolean>
  source_names?: Record<string, string>
  missing_species?: Record<string, string>
  warning?: string
}

/** One entry of reference/factors.json `unpublished`. */
export interface UnpublishedFactor {
  name: string
  default_value: number
  min: number
  max: number
  unit: string
  unpublished_by: string
  rationale: string
  status: 'unpublished'
  source_ref?: string
  adjustable?: boolean
}

export interface Factors {
  published: PublishedFactor[]
  unpublished: UnpublishedFactor[]
}

// ---- Conversion output -----------------------------------------------------

export type Unit =
  | 'acres'
  | 'trees'
  | 'seeds/lb'
  | 'seedlings/lb (two-year-equivalent)'
  | 'lb clean seed'
  | 'bushels of cones'
  | 'USD'

export interface Quantity {
  value: number | null
  unit: Unit
  label?: string
}

export interface FactorUse {
  name: string
  value: number | null
  unit: string
  status: 'published' | 'unpublished'
  source_ref: string
  fallback_applied?: boolean
}

/** Adjustable inputs by name, e.g. { stocking_tpa: 150, seeds_per_pot: 3 }. Missing names use defaults. */
export type Assumptions = Partial<Record<string, number>>

export interface AssumptionUse {
  name: string
  status: 'published' | 'unpublished'
  unit: string
  default_value: number
  /** What the caller asked for (the default if nothing was asked). */
  requested_value: number
  /** The value actually used: requested_value clamped to [min, max]. */
  current_value: number
  min: number
  max: number
  clamped: boolean
}

export type Priority = 1 | 2 | 3

export interface OrderLine {
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
  /** Set when the species has no published seeds/lb or seed price: the gap is disclosed, not filled. */
  gap: string | null
  factors: FactorUse[]
}

export interface Totals {
  /** Lines included in the sums. */
  lines: number
  trees: Quantity
  pounds: Quantity
  bushels: Quantity
  cost_usd: Quantity
  /** Lines excluded from the sums because a published factor is missing. */
  gap_lines: number
  gap_trees: Quantity
}

export interface Order {
  fire_id: string | null
  perimeter_source_date: string | null
  computed_at: string | null
  lines: OrderLine[]
  totals: {
    overall: Totals
    by_species: Record<string, Totals>
    by_zone: Record<string, Totals>
  }
  assumptions_used: AssumptionUse[]
  finding: Finding | null
}

/** reference/validation.json interior_crosscheck: pooled interior share beside Baker's 21.9%. */
export interface InteriorCrosscheck {
  stage: string
  threshold_m: number
  reference_fraction: number
  reference_source: string
  computed_fraction: number | null
  difference_pts: number | null
  interior_acres?: number
  high_severity_acres?: number
  fires: { id: string; interior_acres: number; high_severity_acres: number }[]
  note?: string
}
