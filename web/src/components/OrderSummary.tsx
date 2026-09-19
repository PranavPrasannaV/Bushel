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
  const pctOf = (v: number) => `${Math.max(1, Math.round((v / allBushels) * 100))}%`

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
          </div>
          {allBushels > 0 && (
            <div className="mix">
              <p className="headline-label">What the bushels are</p>
              <p
                className="mix-bar"
                role="img"
                aria-label={mix.map((m) => `${m.species} ${pctOf(m.bushels)}`).join(', ')}
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
                    <span className="mix-pct">{pctOf(m.bushels)}</span>
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
export function AcreageFunnel({ record }: { record: FireRecord }) {
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
          <dt>Retained: inside State Responsibility Area</dt>
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
