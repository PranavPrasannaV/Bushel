// T061 + T066: the validation view. Bushel's own total beside CAL FIRE's published 55,978 bushels of
// cones, with the difference and its attributed causes; the upstream acreage checks, each over its OWN
// published period; coverage stated as partial when it is partial; the known-overestimate caveat; and the
// AON's cones-versus-seed self-contradiction as a footnote (FR-019, FR-020, FR-023, SC-004, SC-005).
// Leads with the interior cross-check (computed seed-limited share beside Baker's 21.9%), because that
// is the like-for-like comparison; the bushel roll-up follows with its scope stated, since CAL FIRE's
// total covers far more than fire.
// Reads reference/validation.json (written by `python -m bushel.validate`) and reference/benchmark.json.
import { useEffect, useState } from 'react'
import { getData } from '../data.ts'
import type { InteriorCrosscheck } from '../convert/types.ts'
import './Validation.css'

export interface Benchmark {
  total_bushels: number
  unit: string
  acres_burned_period: string
  high_severity_period: string
  period_note: string
  jurisdiction: string
  scope_note: string
  acres_burned: number
  high_severity_acres: number
  source_ref: string
  known_overestimate: string
  agency_self_contradiction: string
}

export type Coverage = 'full' | 'partial' | 'none'

export interface AcreageCheck {
  stage: string
  published: number
  period: string
  computed: number | null
  unit: string
  difference_pct: number | null
  tolerance_pct: number
  within_tolerance: boolean | null
  status: 'pass' | 'fail' | Coverage
  coverage: Coverage
  coverage_fraction?: number | null
  note: string
}

export type { InteriorCrosscheck }

export interface ValidationResult {
  generated_at: string
  computed_total_bushels: number | null
  difference_pct: number | null
  coverage: Coverage
  rollup: {
    published_total_bushels: number
    unit: string
    window: string
    window_note: string
    fires_included: string[]
    coverage: Coverage
    coverage_fraction: number | null
    statement: string
  }
  acreage_check: { acres_burned: AcreageCheck; high_severity: AcreageCheck }
  interior_crosscheck?: InteriorCrosscheck | null
  attributed_gap: string[]
}

// ---- Pure helpers (tested in web/tests/validation.test.ts) -------------------------------------

/** Percentage difference of computed from published, one decimal. Null when nothing was computed. */
export function differencePct(computed: number | null, published: number): number | null {
  if (computed === null || !Number.isFinite(computed) || published === 0) return null
  return Math.round(((computed - published) / published) * 1000) / 10
}

/** "+125.2%", "−51.9%" (true minus sign), "0.0%", or "—" when there is no difference to state. */
export function formatPct(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

export type VerdictTone = 'pass' | 'fail' | 'partial' | 'none'

/** Pass/fail against the tolerance, given only on full coverage. Partial coverage says so. */
export function verdict(
  check: Pick<AcreageCheck, 'coverage' | 'difference_pct' | 'tolerance_pct'>,
): { tone: VerdictTone; label: string } {
  if (check.coverage === 'none' || check.difference_pct === null) return { tone: 'none', label: 'Not computed' }
  if (check.coverage === 'partial') return { tone: 'partial', label: `Partial coverage: no ${check.tolerance_pct}% verdict` }
  return Math.abs(check.difference_pct) <= check.tolerance_pct
    ? { tone: 'pass', label: `Within ${check.tolerance_pct}%` }
    : { tone: 'fail', label: `Outside ${check.tolerance_pct}%` }
}

/** "+1.8 pts", "−0.4 pts" (true minus sign), or "—". */
export function formatPts(pts: number | null): string {
  if (pts === null) return '—'
  const sign = pts > 0 ? '+' : pts < 0 ? '−' : ''
  return `${sign}${Math.abs(pts).toFixed(1)} pts`
}

export function coverageLabel(coverage: Coverage, fraction?: number | null): string {
  if (coverage === 'none') return 'Coverage: none yet'
  if (coverage === 'full') return 'Coverage: full'
  return fraction == null ? 'Coverage: partial' : `Coverage: partial (${(fraction * 100).toFixed(1)}%)`
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const share = (f: number) => `${(f * 100).toFixed(1)}%`
const period = (p: string) => p.replace('-', '–')

// ---- View ----------------------------------------------------------------------------------------

function InteriorCheck({ check }: { check: InteriorCrosscheck }) {
  if (check.computed_fraction === null) return null
  return (
    <div className="validation-interior" data-testid="interior-crosscheck">
      <h4 className="caps">Like-for-like: the seed-limited interior</h4>
      <div className="validation-totals">
        <div className="validation-total">
          <p className="caps">Bushel, {check.fires.length} fires</p>
          <p className="validation-figure">{share(check.computed_fraction)}</p>
          <p className="validation-unit">of high-severity acres</p>
        </div>
        <div className="validation-total">
          <p className="caps">Baker (2023)</p>
          <p className="validation-figure">{share(check.reference_fraction)}</p>
          <p className="validation-unit">published, ~56M ha</p>
        </div>
        <div className="validation-total">
          <p className="caps">Difference</p>
          <p className="validation-figure">{formatPts(check.difference_pts)}</p>
        </div>
      </div>
      <p className="detail">
        The same measurement two ways: high-severity ground more than {check.threshold_m} m from a live seed
        edge.
        {check.interior_acres != null && check.high_severity_acres != null && (
          <>
            {' '}
            {fmt(check.interior_acres)} of {fmt(check.high_severity_acres)} high-severity acres, pooled.
          </>
        )}
      </p>
      {check.note && <p className="validation-small">{check.note}</p>}
    </div>
  )
}

function Check({ label, check }: { label: string; check: AcreageCheck }) {
  const v = verdict(check)
  return (
    <li className="validation-check">
      <div className="validation-check-head">
        <span className="validation-check-name">{label}</span>
        <span className="validation-period">{period(check.period)}</span>
        <span className="validation-verdict" data-tone={v.tone}>
          {v.label}
        </span>
      </div>
      <dl className="validation-figures">
        <div>
          <dt>Computed</dt>
          <dd>{check.computed === null ? '—' : `${fmt(check.computed)} ac`}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>{fmt(check.published)} ac</dd>
        </div>
        <div>
          <dt>Difference</dt>
          <dd>{formatPct(check.difference_pct)}</dd>
        </div>
      </dl>
      <p className="validation-small">{check.note}</p>
    </li>
  )
}

/** The panel for already-loaded data. `validation` is null when validation.json has not been computed. */
export function ValidationView({
  validation,
  benchmark,
}: {
  validation: ValidationResult | null
  benchmark: Benchmark
}) {
  const computed = validation?.computed_total_bushels ?? null
  const diff = differencePct(computed, benchmark.total_bushels)
  const roll = validation?.rollup

  return (
    <section className="validation" aria-labelledby="validation-title">
      <div className="validation-head">
        <p className="caps">Validation</p>
        <h3 id="validation-title">Checked against published figures</h3>
      </div>

      {validation?.interior_crosscheck && <InteriorCheck check={validation.interior_crosscheck} />}

      <div className="validation-head">
        <h4 className="caps">Against CAL FIRE's own total</h4>
        {roll && (
          <span className="validation-coverage" data-coverage={roll.coverage}>
            {coverageLabel(roll.coverage, roll.coverage_fraction)}
          </span>
        )}
      </div>
      <p className="detail">
        Not like-for-like, and not expected to match. The published figure is sized to reforest{' '}
        {benchmark.scope_note}
        {roll && roll.fires_included.length > 0 && (
          <> A roll-up of {roll.fires_included.length} fires' orders sits far below it by design.</>
        )}
      </p>

      <div className="validation-totals">
        <div className="validation-total">
          <p className="caps">Bushel, {period(roll?.window ?? benchmark.high_severity_period)}</p>
          <p className="validation-figure" data-testid="computed-total" data-pending={computed === null}>
            {computed === null
              ? 'Not yet computed'
              : computed.toLocaleString('en-US', { maximumFractionDigits: 1 })}
          </p>
          <p className="validation-unit">bushels of cones</p>
        </div>
        <div className="validation-total">
          <p className="caps">CAL FIRE AON 2025</p>
          <p className="validation-figure">
            {fmt(benchmark.total_bushels)}
            <sup>
              <a href="#validation-footnote" aria-label="Footnote on units">
                *
              </a>
            </sup>
          </p>
          <p className="validation-unit">bushels of cones</p>
        </div>
        <div className="validation-total">
          <p className="caps">Difference</p>
          <p className="validation-figure" data-testid="difference">
            {formatPct(diff)}
          </p>
        </div>
      </div>

      {validation === null ? (
        <p className="validation-missing" role="status">
          Validation not yet computed. Run <code>python -m bushel.validate</code> to write{' '}
          <code>reference/validation.json</code>.
        </p>
      ) : (
        <>
          <p className="detail">{validation.rollup.statement}</p>
          <p className="validation-small">{validation.rollup.window_note}</p>

          <h4 className="caps">Upstream acreage checks, each over its own period</h4>
          <ul className="validation-checks">
            <Check label="Acres burned, non-federal conifer forestland" check={validation.acreage_check.acres_burned} />
            <Check label="High-severity acres, non-federal conifer forestland" check={validation.acreage_check.high_severity} />
          </ul>

          <h4 className="caps">Most plausible causes of a difference</h4>
          <ul className="validation-causes">
            {validation.attributed_gap.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      )}

      <p className="validation-caveat">
        <strong>Known overestimate.</strong> {benchmark.known_overestimate}
      </p>
      <p className="validation-small">
        Source: {benchmark.source_ref}.
      </p>

      <p className="validation-footnote" id="validation-footnote">
        <sup>*</sup> The AON disagrees with itself on units. Its conclusion states the need as “bushels of
        conifer seed”; its methodology and Table 2, which converts cones to clean seed, establish bushels of
        cones. Bushel follows the methodology.
      </p>
    </section>
  )
}

type Load =
  | { status: 'loading' }
  | { status: 'no-benchmark'; message: string }
  | { status: 'ready'; validation: ValidationResult | null; benchmark: Benchmark }

export default function Validation() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      // A missing validation.json is a stated "not yet computed", never an error.
      getData<ValidationResult>('reference/validation.json', ctrl.signal).catch(() => null),
      getData<Benchmark>('reference/benchmark.json', ctrl.signal),
    ])
      .then(([validation, benchmark]) => setLoad({ status: 'ready', validation, benchmark }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setLoad({ status: 'no-benchmark', message: err instanceof Error ? err.message : String(err) })
      })
    return () => ctrl.abort()
  }, [])

  if (load.status === 'loading') {
    return (
      <section className="validation" aria-label="Validation">
        <p className="detail" role="status">
          Loading the validation against CAL FIRE's published total…
        </p>
      </section>
    )
  }
  if (load.status === 'no-benchmark') {
    return (
      <section className="validation" aria-label="Validation">
        <p className="validation-missing" role="status">
          Validation not available: the published benchmark could not be loaded. {load.message}
        </p>
      </section>
    )
  }
  return <ValidationView validation={load.validation} benchmark={load.benchmark} />
}
