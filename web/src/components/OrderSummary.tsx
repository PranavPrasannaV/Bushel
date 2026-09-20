// T042 + T043: what this order totals (the slip) and what it covers (the funnel). Retained and excluded acres
// are both stated (FR-002); every result carries its perimeter date and, where it applies, the provisional
// flag (FR-024).
// An empty-result fire shows its finding as a stated result, not an error and not a blank.
import { GAP_MESSAGE } from '../convert/computeOrder.ts'
import type { CSSProperties } from 'react'
import type { FireIndexEntry, FireRecord, Order } from '../convert/types.ts'
import { fmtAcres, fmtInt, fmtQty, fmtUsd } from './OrderTable.tsx'
import './OrderSummary.css'

/** The species in an order, darkest first: ink and burn tones, never the interior's green. */
const MIX_TONES = ['var(--ink-900)', 'var(--umber-600)', 'var(--umber-300)', 'var(--paper-400)']

/** Below this share of the trees, the coverage line is set loud beside the headline figure; at or above it,
 *  one quiet line. A display threshold only: the figure shown is the measured one either way. */
const COVERAGE_LOUD_BELOW = 0.95

/**
 * The mix's shares as whole percents that add up, by largest remainder (Hamilton): floor every share, then
 * hand the points left over to the largest remainders. Two guards on top of that, because this row is read
 * as a mix and a mix has to behave like one:
 *   - a share under half a point reads "<1%", never "1%" (which overstates it, and pushed the old row to
 *     101%) and never "0%" (which reads as none). One whole point is held back for those shares, so the
 *     largest cannot read "100%" while another species is listed beside it.
 *   - a named share that still floors to nothing borrows a point from the largest.
 * A one-species mix is the only row that reads "100%", and there it is true.
 */
function shareLabels(values: number[]): string[] {
  const total = values.reduce((sum, v) => sum + v, 0)
  if (!(total > 0)) return values.map(() => '—')
  const exact = values.map((v) => (v / total) * 100)
  const named = exact.map((p, i) => (p >= 0.5 ? i : -1)).filter((i) => i >= 0)
  const budget = named.length === values.length ? 100 : 99
  const namedTotal = named.reduce((sum, i) => sum + exact[i], 0)
  const scaled = named.map((i) => (exact[i] / namedTotal) * budget)
  const whole = scaled.map((v) => Math.floor(v))
  let left = budget - whole.reduce((sum, v) => sum + v, 0)
  for (const { k } of scaled.map((v, k) => ({ k, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break
    whole[k] += 1
    left -= 1
  }
  for (let k = 0; k < whole.length; k += 1) {
    if (whole[k] > 0) continue
    const biggest = whole.indexOf(Math.max(...whole))
    if (whole[biggest] < 2) break
    whole[biggest] -= 1
    whole[k] = 1
  }
  const labels = values.map(() => '<1%')
  named.forEach((i, k) => {
    labels[i] = `${whole[k]}%`
  })
  return labels
}

/**
 * A coverage share, rounded so it never claims more ground than the order covers: while a line is excluded
 * the figure reads ">99.9%", never "100%", and a sliver reads "<1%", never "0%". A true zero — not one line
 * computable — is stated as 0%, which is measured, not a 0 standing in for unknown (SC-009).
 */
function coverageFigure(fraction: number): string {
  const pct = fraction * 100
  if (pct <= 0) return '0%'
  if (pct < 1) return '<1%'
  if (pct < 99) return `${Math.round(pct)}%`
  const tenths = Math.round(pct * 10) / 10
  return tenths >= 100 ? '>99.9%' : `${tenths.toFixed(1)}%`
}

export default function OrderSummary({
  entry,
  record,
  order,
}: {
  entry: FireIndexEntry
  record: FireRecord
  order: Order
}) {
  const fire = record.fire
  const t = order.totals.overall
  // No computable line (every species a Terms of Sale gap): the totals are unknown, shown as "—", never as 0
  // (SC-009). The gap note below says why.
  const known = (v: number | null) => (t.lines === 0 ? null : v)
  const tpa = order.assumptions_used.find((a) => a.name === 'stocking_tpa')?.current_value
  const gapSpecies = [...new Set(order.lines.filter((l) => l.gap !== null).map((l) => l.species))]
  // What the bushels are made of: the four largest species and the rest, as shares of the total.
  const bySpecies = Object.entries(order.totals.by_species)
    .map(([species, totals]) => ({ species, bushels: totals.bushels.value ?? 0 }))
    .filter((x) => x.bushels > 0)
    .sort((a, b) => b.bushels - a.bushels)
  const allBushels = bySpecies.reduce((sum, x) => sum + x.bushels, 0)
  const mix = bySpecies.slice(0, MIX_TONES.length)
  const rest = bySpecies.slice(MIX_TONES.length).reduce((sum, x) => sum + x.bushels, 0)
  if (rest > 0) mix.push({ species: `${bySpecies.length - MIX_TONES.length} more`, bushels: rest })
  const mixPct = shareLabels(mix.map((m) => m.bushels))

  // What the order covers. sumLines() counts a line's trees in `trees` only when the line is computable and
  // in `gap_trees` when it is not, so the trees to plant on this fire are trees + gap_trees and the order
  // covers the first of the two. Both figures come straight from the totals; neither is new.
  const orderTrees = t.trees.value ?? 0
  const excludedTrees = t.gap_trees.value ?? 0
  const allTrees = orderTrees + excludedTrees
  const covered = t.gap_lines > 0 && allTrees > 0 ? orderTrees / allTrees : null

  // The order as a requisition slip: what it is for, the headline figure, then the ledger.
  return (
    <section className="summary slip" aria-label="Order summary">
      <header className="slip-head">
        <p className="slip-kind">Seed requisition</p>
        <h2 className="slip-fire">
          {fire?.name ?? entry.name} <span className="slip-year">{fire?.year ?? entry.year}</span>
        </h2>
        <p className="stamp">
          <span>
            Perimeter data as of <time dateTime={fire?.perimeter_source_date}>{fire?.perimeter_source_date ?? 'unknown'}</time>
          </span>
          {(fire?.provisional ?? entry.provisional) && (
            <span className="provisional-flag">Provisional: perimeter may still change</span>
          )}
        </p>
      </header>

      {order.finding && (
        <div className="finding" role="status" data-result={order.finding.result}>
          <p className="caps">Finding</p>
          <p className="finding-message">{order.finding.message}</p>
          <p className="detail">This is a stated result for this fire, not an error. No seed order lines are produced.</p>
        </div>
      )}

      {!order.finding && (
        <div className="totals">
          <div className="headline">
            <p className="headline-label">To order</p>
            <p className="headline-figure" data-testid="total-bushels">
              {fmtQty(known(t.bushels.value))}
            </p>
            <p className="headline-unit">{t.bushels.unit}</p>
            {/* A partial order says so where the figure is, not only in the note under the ledger: the share
                covered sits in the same band, and the bar under it is that share, so the treatment scales
                with the data — near-full it is one quiet line, at a quarter it is unmissable. */}
            {covered !== null && (
              <p
                className="headline-covers"
                data-testid="coverage"
                data-level={covered < COVERAGE_LOUD_BELOW ? 'partial' : 'most'}
              >
                <span className="covers-label">Covers</span>
                <span className="covers-figure">{coverageFigure(covered)}</span>
                <span className="covers-of">
                  of the {fmtInt(allTrees)} trees to plant — {fmtInt(excludedTrees)} are not in this order.
                </span>
                <span
                  className="covers-bar"
                  aria-hidden="true"
                  style={{ '--covered': covered } as CSSProperties}
                />
              </p>
            )}
          </div>
          {allBushels > 0 && (
            <div className="mix">
              <p className="headline-label">What the bushels are</p>
              <p
                className="mix-bar"
                role="img"
                aria-label={mix.map((m, i) => `${m.species} ${mixPct[i]}`).join(', ')}
              >
                {mix.map((m, i) => (
                  <span key={m.species} style={{ flexGrow: m.bushels, background: MIX_TONES[i] } as CSSProperties} data-rest={i >= MIX_TONES.length || undefined} />
                ))}
              </p>
              <ul className="mix-key">
                {mix.map((m, i) => (
                  <li key={m.species}>
                    <span className="mix-swatch" style={{ background: MIX_TONES[i] } as CSSProperties} data-rest={i >= MIX_TONES.length || undefined} aria-hidden="true" />
                    <span className="mix-name">{m.species}</span>
                    <span className="mix-pct">{mixPct[i]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <dl className="ledger">
            <div>
              <dt>Clean seed</dt>
              <dd data-testid="total-pounds">
                {fmtQty(known(t.pounds.value))} <span className="unit">lb</span>
              </dd>
            </div>
            <div>
              <dt>Seed cost, CAL FIRE price list</dt>
              <dd data-testid="total-cost">{fmtUsd(known(t.cost_usd.value))}</dd>
            </div>
            <div>
              <dt>Trees at {tpa} per acre</dt>
              <dd>{fmtInt(known(t.trees.value))}</dd>
            </div>
          </dl>
          {t.gap_lines > 0 && (
            <p className="gap-note" data-testid="gap-note">
              <strong>
                {t.gap_lines} {t.gap_lines === 1 ? 'line' : 'lines'} not computable
              </strong>{' '}
              ({gapSpecies.join(', ')}). {GAP_MESSAGE} Their {fmtInt(t.gap_trees.value)} trees are left out of the
              totals above.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/** From the fire to the order: each step's acres, with a bar sized to its share of the perimeter, so the fire
 *  visibly narrows to the one lit row. Retained and excluded acres are both stated (FR-002). */
export function AcreageFunnel({ record, national = false }: { record: FireRecord; national?: boolean }) {
  const r = record.retained
  const p = record.planting
  if (!r) return null
  const share = (acres: number | undefined): CSSProperties | undefined =>
    r.perimeter_acres > 0 && acres !== undefined
      ? ({ '--share': Math.min(1, Math.max(0, acres / r.perimeter_acres)) } as CSSProperties)
      : undefined

  return (
    <section className="funnel" aria-labelledby="funnel-title">
      <h3 id="funnel-title">From the fire to the order</h3>
      <p className="section-lede">
        Each step keeps only the ground the next one needs. What is left at the bottom is the ground that has to be
        planted.
      </p>
      <dl className="acreage">
        <div style={share(r.perimeter_acres)}>
          <dt>Perimeter</dt>
          <dd>{fmtAcres(r.perimeter_acres)} ac</dd>
        </div>
        <div style={share(r.retained_acres)}>
          {/* Outside California the order's scope is non-federal land (PAD-US), not the state's area. */}
          <dt>{national ? 'Retained: non-federal land' : 'Retained: inside State Responsibility Area'}</dt>
          <dd data-testid="retained-acres">{fmtAcres(r.retained_acres)} ac</dd>
        </div>
        <div className="is-excluded" style={share(r.excluded_acres)}>
          <dt>Excluded: {r.excluded_reason}</dt>
          <dd data-testid="excluded-acres">{fmtAcres(r.excluded_acres)} ac</dd>
        </div>
        {r.conifer_acres !== undefined && (
          <div style={share(r.conifer_acres)}>
            <dt>Retained conifer forest</dt>
            <dd>{fmtAcres(r.conifer_acres)} ac</dd>
          </div>
        )}
        <div className="is-severity" style={share(r.high_severity_acres)}>
          <dt>High severity (retained conifer)</dt>
          <dd>{fmtAcres(r.high_severity_acres)} ac</dd>
        </div>
        {p && (
          <div className="is-interior" style={share(p.interior_acres)}>
            <dt>
              <span className="interior-swatch" aria-hidden="true" />
              <span>
                Too far from surviving trees to reseed
                <span className="acreage-sub">
                  Seed-limited interior: more than {p.threshold_m} m inside high-severity patches
                </span>
              </span>
            </dt>
            <dd>{fmtAcres(p.interior_acres)} ac</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
