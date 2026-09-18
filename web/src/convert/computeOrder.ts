// The conversion chain (contracts/pipeline-output.md "Conversion contract"). Pure: no I/O, no clock,
// no mutation of inputs. Same inputs -> identical output (SC-008).
//
//   trees            = acres × stocking_tpa
//   seedlings_per_lb = (seeds_per_lb ÷ seeds_per_pot) × nursery_survival_rate × probability_of_tree_in_nursery
//   pounds           = trees ÷ seedlings_per_lb
//   bushels          = pounds ÷ lbs_clean_seed_per_bushel      (bushels of CONES)
//   cost_usd         = pounds × price_per_lb_usd               (seed price list, $/lb)
//   priority         = bushels > 100 ? 1 : bushels >= 11 ? 2 : 3

import type {
  AssumptionUse,
  Assumptions,
  Cell,
  FactorUse,
  Factors,
  FireRecord,
  Order,
  OrderLine,
  Priority,
  PublishedFactor,
  Quantity,
  Totals,
  Unit,
} from './types.ts'

export const GAP_MESSAGE =
  "No 'Average Seeds/pounds' or seed price published for this species in CAL FIRE Terms of Sale (Feb 2026)."

export const TWO_YEAR_LABEL = 'two-year-equivalent'

export const UNPUBLISHED_NAMES = [
  'seeds_per_pot',
  'nursery_survival_rate',
  'probability_of_tree_in_nursery',
] as const

/** AON collection priority index (FR-021). */
export function priorityFor(bushels: number): Priority {
  return bushels > 100 ? 1 : bushels >= 11 ? 2 : 3
}

function q(value: number | null, unit: Unit): Quantity {
  return { value, unit }
}

function publishedFactor(factors: Factors, name: string): PublishedFactor {
  const f = factors.published.find((p) => p.name === name)
  if (!f) throw new Error(`factors.json has no published factor "${name}"`)
  return f
}

/**
 * Resolve every adjustable input: stocking_tpa (published, adjustable 50–200) and the three
 * unpublished nursery factors. Each requested value is clamped to [min, max]; the clamped value is the
 * one used and recorded.
 */
export function resolveAssumptions(factors: Factors, assumptions: Assumptions = {}): AssumptionUse[] {
  const stocking = publishedFactor(factors, 'stocking_tpa')
  if (stocking.value === undefined) throw new Error('stocking_tpa has no value')

  const specs = [
    {
      name: stocking.name,
      status: 'published' as const,
      unit: stocking.unit,
      default_value: stocking.value,
      min: stocking.min ?? stocking.value,
      max: stocking.max ?? stocking.value,
    },
    ...UNPUBLISHED_NAMES.map((name) => {
      const u = factors.unpublished.find((x) => x.name === name)
      if (!u) throw new Error(`factors.json has no unpublished factor "${name}"`)
      return {
        name,
        status: 'unpublished' as const,
        unit: u.unit,
        default_value: u.default_value,
        min: u.min,
        max: u.max,
      }
    }),
  ]

  return specs.map((s) => {
    const asked = assumptions[s.name]
    const requested = typeof asked === 'number' && Number.isFinite(asked) ? asked : s.default_value
    const current = Math.min(s.max, Math.max(s.min, requested))
    return { ...s, requested_value: requested, current_value: current, clamped: current !== requested }
  })
}

function sumLines(lines: OrderLine[]): Totals {
  let n = 0
  let trees = 0
  let pounds = 0
  let bushels = 0
  let cost = 0
  let gapLines = 0
  let gapTrees = 0
  for (const l of lines) {
    if (l.gap !== null) {
      gapLines += 1
      gapTrees += l.trees.value ?? 0
      continue
    }
    n += 1
    trees += l.trees.value ?? 0
    pounds += l.pounds.value ?? 0
    bushels += l.bushels.value ?? 0
    cost += l.cost_usd.value ?? 0
  }
  return {
    lines: n,
    trees: q(trees, 'trees'),
    pounds: q(pounds, 'lb clean seed'),
    bushels: q(bushels, 'bushels of cones'),
    cost_usd: q(cost, 'USD'),
    gap_lines: gapLines,
    gap_trees: q(gapTrees, 'trees'),
  }
}

function totalsBy(lines: OrderLine[], key: (l: OrderLine) => string): Record<string, Totals> {
  const groups: Record<string, OrderLine[]> = {}
  for (const l of lines) (groups[key(l)] ??= []).push(l)
  const out: Record<string, Totals> = {}
  for (const [k, group] of Object.entries(groups)) out[k] = sumLines(group)
  return out
}

/**
 * Compute the seed order. `input` is either a cell array or a whole fires/{id}.json record; an
 * empty-result record (`result: no_retained_area | no_conifer | no_interior`) yields zero lines and a
 * finding, never an exception. `computedAt` is supplied by the caller so this stays pure.
 */
export function computeOrder(
  input: Cell[] | FireRecord,
  factors: Factors,
  assumptions: Assumptions = {},
  computedAt: string | null = null,
): Order {
  const record: FireRecord = Array.isArray(input) ? { cells: input } : input
  const used = resolveAssumptions(factors, assumptions)
  const valueOf = (name: string) => used.find((a) => a.name === name)!.current_value
  const unpublishedByName = (name: string) => factors.unpublished.find((u) => u.name === name)!

  const tpa = valueOf('stocking_tpa')
  const seedsPerPot = valueOf('seeds_per_pot')
  const survival = valueOf('nursery_survival_rate')
  const probability = valueOf('probability_of_tree_in_nursery')

  const stockingF = publishedFactor(factors, 'stocking_tpa')
  const seedsF = publishedFactor(factors, 'seeds_per_lb')
  const priceF = publishedFactor(factors, 'price_per_lb_usd')
  const lbsF = publishedFactor(factors, 'lbs_clean_seed_per_bushel')

  const unpublishedTrail: FactorUse[] = UNPUBLISHED_NAMES.map((name) => {
    const u = unpublishedByName(name)
    return {
      name,
      value: valueOf(name),
      unit: u.unit,
      status: 'unpublished',
      source_ref: u.source_ref ?? `Not published by ${u.unpublished_by}`,
    }
  })

  function line(cell: Cell, species: string, acres: number): OrderLine {
    const seedsPerLb = seedsF.by_species?.[species] ?? null
    const price = priceF.by_species?.[species] ?? null
    const tableLbs = lbsF.by_species?.[species]
    const usedFallback =
      tableLbs === undefined ||
      lbsF.fallback_applied?.[species] === true ||
      (lbsF.fallback_species ?? []).includes(species)
    const lbsPerBushel = tableLbs ?? lbsF.fallback?.value
    if (lbsPerBushel === undefined) {
      throw new Error(`No lbs_clean_seed_per_bushel for "${species}" and no fallback rule`)
    }

    // Gap species (no Terms of Sale row): trees only; everything seed-denominated stays null.
    const published = seedsPerLb !== null && price !== null
    const trees = acres * tpa
    const seedlingsPerLb = published ? (seedsPerLb / seedsPerPot) * survival * probability : null
    const pounds = seedlingsPerLb === null ? null : trees / seedlingsPerLb
    const bushels = pounds === null ? null : pounds / lbsPerBushel
    const cost = pounds === null || price === null ? null : pounds * price
    const gap = published ? null : GAP_MESSAGE

    return {
      cell_id: cell.cell_id,
      seed_zone: cell.seed_zone,
      elevation_band: cell.elevation_band,
      species,
      acres: q(acres, 'acres'),
      trees: q(trees, 'trees'),
      seedlings_per_lb: {
        value: seedlingsPerLb,
        unit: 'seedlings/lb (two-year-equivalent)',
        label: TWO_YEAR_LABEL,
      },
      pounds: q(pounds, 'lb clean seed'),
      bushels: q(bushels, 'bushels of cones'),
      cost_usd: q(cost, 'USD'),
      priority: bushels === null ? null : priorityFor(bushels),
      used_fallback: usedFallback,
      gap,
      factors: [
        { name: 'stocking_tpa', value: tpa, unit: stockingF.unit, status: 'published', source_ref: stockingF.source_ref },
        { name: 'seeds_per_lb', value: seedsPerLb, unit: seedsF.unit, status: 'published', source_ref: seedsF.source_ref },
        ...unpublishedTrail.map((f) => ({ ...f })),
        {
          name: 'lbs_clean_seed_per_bushel',
          value: lbsPerBushel,
          unit: lbsF.unit,
          status: 'published',
          source_ref:
            usedFallback && lbsF.fallback ? `${lbsF.source_ref}; fallback: ${lbsF.fallback.rule}` : lbsF.source_ref,
          fallback_applied: usedFallback,
        },
        { name: 'price_per_lb_usd', value: price, unit: priceF.unit, status: 'published', source_ref: priceF.source_ref },
      ],
    }
  }

  const finding = record.result ? { result: record.result, message: record.message ?? '' } : null
  const cells = finding ? [] : (record.cells ?? [])
  const lines = cells.flatMap((cell) => cell.species.map((s) => line(cell, s.species, s.acres)))

  return {
    fire_id: record.fire?.id ?? null,
    perimeter_source_date: record.fire?.perimeter_source_date ?? null,
    computed_at: computedAt,
    lines,
    totals: {
      overall: sumLines(lines),
      by_species: totalsBy(lines, (l) => l.species),
      by_zone: totalsBy(lines, (l) => l.seed_zone),
    },
    assumptions_used: used,
    finding,
  }
}
