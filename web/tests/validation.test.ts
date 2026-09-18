// T061/T066: the validation view's pure helpers, and the copy it renders from real reference data.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  type AcreageCheck,
  type Benchmark,
  type ValidationResult,
  ValidationView,
  coverageLabel,
  differencePct,
  formatPct,
  verdict,
} from '../src/components/Validation.tsx'
import benchmarkJson from '../public/data/reference/benchmark.json'

const benchmark = benchmarkJson as Benchmark

describe('difference and verdict helpers', () => {
  it('states the percentage difference from the published figure', () => {
    expect(differencePct(61575.8, 55978)).toBe(10)
    expect(differencePct(50000, 55978)).toBe(-10.7)
    expect(differencePct(null, 55978)).toBeNull()
    expect(formatPct(125.2)).toBe('+125.2%')
    expect(formatPct(-51.9)).toBe('−51.9%')
    expect(formatPct(0)).toBe('0.0%')
    expect(formatPct(null)).toBe('—')
  })

  it('gives pass/fail against 10% only on full coverage; partial is stated as partial', () => {
    const base = { tolerance_pct: 10, coverage: 'full' as const }
    expect(verdict({ ...base, difference_pct: 9.9 }).tone).toBe('pass')
    expect(verdict({ ...base, difference_pct: -10 }).tone).toBe('pass')
    expect(verdict({ ...base, difference_pct: 125.2 })).toEqual({ tone: 'fail', label: 'Outside 10%' })
    expect(verdict({ ...base, coverage: 'partial', difference_pct: -51.9 }).tone).toBe('partial')
    expect(verdict({ ...base, coverage: 'none', difference_pct: null }).tone).toBe('none')
    expect(coverageLabel('partial', 0.2177)).toBe('Coverage: partial (21.8%)')
  })
})

describe('rendered copy', () => {
  const check = (over: Partial<AcreageCheck>): AcreageCheck => ({
    stage: 'x',
    published: 1507830,
    period: '2018-2024',
    computed: 3394989.9,
    unit: 'acres',
    difference_pct: 125.2,
    tolerance_pct: 10,
    within_tolerance: false,
    status: 'fail',
    coverage: 'full',
    note: 'upper bound',
    ...over,
  })
  const validation: ValidationResult = {
    generated_at: '2026-09-18T00:00:00Z',
    computed_total_bushels: null,
    difference_pct: null,
    coverage: 'none',
    rollup: {
      published_total_bushels: 55978,
      unit: 'bushels of cones',
      window: '2018-2023',
      window_note: "The published total's severity input stops at 2023.",
      fires_included: [],
      coverage: 'none',
      coverage_fraction: 0,
      statement: 'Not computed.',
    },
    acreage_check: {
      acres_burned: check({}),
      high_severity: check({
        published: 359182,
        period: '2018-2023',
        computed: 172783.4,
        difference_pct: -51.9,
        within_tolerance: null,
        status: 'partial',
        coverage: 'partial',
      }),
    },
    attributed_gap: ["CAL FIRE's timberland boundary", 'privately-owned industrial land'],
  }
  const render = (v: ValidationResult | null) =>
    renderToStaticMarkup(createElement(ValidationView, { validation: v, benchmark }))

  it('shows the published total in cones, each check over its own period, and the causes', () => {
    const html = render(validation)
    expect(html).toContain('55,978')
    expect(html).toContain('bushels of cones')
    expect(html).toContain('2018–2024')
    expect(html).toContain('2018–2023')
    expect(html).toContain('Outside 10%')
    expect(html).toContain('Partial coverage: no 10% verdict')
    expect(html).toContain('timberland boundary')
    expect(html).toContain('privately-owned industrial land')
  })

  it('never calls a bushel seed, except when quoting the AON contradicting itself', () => {
    const html = render(validation)
    expect(html.toLowerCase()).not.toContain('bushels of seed')
    expect(html.match(/bushels of\s+conifer seed/g)).toHaveLength(1)
    expect(html).toMatch(/id="validation-footnote"[^]*bushels of\s+conifer seed[^]*methodology/)
  })

  it('states "not yet computed" when validation.json is missing, not an error', () => {
    const html = render(null)
    expect(html).toContain('Validation not yet computed')
    expect(html).toContain('55,978')
    expect(html).toContain('validation-footnote')
  })

  it('leads with the like-for-like interior cross-check, before the bushel roll-up', () => {
    const html = render({
      ...validation,
      interior_crosscheck: {
        stage: 'Seed-limited interior as a share of high-severity acres',
        threshold_m: 90,
        reference_fraction: 0.219,
        reference_source: 'Baker 2023, Climate 11(11):214, a 90 m inward buffer across ~56M ha',
        computed_fraction: 0.2366,
        difference_pts: 1.8,
        interior_acres: 29329,
        high_severity_acres: 123966,
        fires: [{ id: 'a', interior_acres: 29329, high_severity_acres: 123966 }],
        note: 'A cross-check, never a multiplier.',
      },
    })
    expect(html).toContain('23.7%')
    expect(html).toContain('21.9%')
    expect(html).toContain('+1.8 pts')
    expect(html.indexOf('interior-crosscheck')).toBeLessThan(html.indexOf('55,978'))
    expect(html).toContain('Not like-for-like')
  })

  it('omits the interior cross-check when validation.json predates it', () => {
    expect(render(validation)).not.toContain('interior-crosscheck')
  })
})
