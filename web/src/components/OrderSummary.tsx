// T042 + T043: what this order covers and what it totals. Retained and excluded acres are both stated
// (FR-002); every result carries its perimeter date and, where it applies, the provisional flag (FR-024).
// An empty-result fire shows its finding as a stated result, not an error and not a blank.
import { GAP_MESSAGE } from '../convert/computeOrder.ts'
import type { FireIndexEntry, FireRecord, Order } from '../convert/types.ts'
import { fmtAcres, fmtInt, fmtQty, fmtUsd } from './OrderTable.tsx'
import './OrderSummary.css'

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
  const r = record.retained
  const p = record.planting
  const t = order.totals.overall
  // No computable line (every species a Terms of Sale gap): the totals are unknown, shown as "—", never as 0
  // (SC-009). The gap note below says why.
  const known = (v: number | null) => (t.lines === 0 ? null : v)
  const tpa = order.assumptions_used.find((a) => a.name === 'stocking_tpa')?.current_value
  const gapSpecies = [...new Set(order.lines.filter((l) => l.gap !== null).map((l) => l.species))]

  return (
    <section className="summary" aria-label="Order summary">
      <div className="summary-title">
        <h2 className="fire-name">{fire?.name ?? entry.name}</h2>
        <p className="stamp">
          <span>{fire?.year ?? entry.year}</span>
          <span>
            Perimeter data as of <time dateTime={fire?.perimeter_source_date}>{fire?.perimeter_source_date ?? 'unknown'}</time>
          </span>
          {(fire?.provisional ?? entry.provisional) && (
            <span className="provisional-flag">Provisional: perimeter may still change</span>
          )}
        </p>
      </div>

      {order.finding && (
        <div className="finding" role="status" data-result={order.finding.result}>
          <p className="caps">Finding</p>
          <p className="finding-message">{order.finding.message}</p>
          <p className="detail">This is a stated result for this fire, not an error. No seed order lines are produced.</p>
        </div>
      )}

      {r && (
        <dl className="acreage">
          <div>
            <dt>Perimeter</dt>
            <dd>{fmtAcres(r.perimeter_acres)} ac</dd>
          </div>
          <div>
            <dt>Retained: inside State Responsibility Area</dt>
            <dd data-testid="retained-acres">{fmtAcres(r.retained_acres)} ac</dd>
          </div>
          <div className="is-excluded">
            <dt>Excluded: {r.excluded_reason}</dt>
            <dd data-testid="excluded-acres">{fmtAcres(r.excluded_acres)} ac</dd>
          </div>
          {r.conifer_acres !== undefined && (
            <div>
              <dt>Retained conifer forest</dt>
              <dd>{fmtAcres(r.conifer_acres)} ac</dd>
            </div>
          )}
          <div>
            <dt>High severity (retained conifer)</dt>
            <dd>{fmtAcres(r.high_severity_acres)} ac</dd>
          </div>
          {p && (
            <div className="is-interior">
              <dt>
                <span className="interior-swatch" aria-hidden="true" />
                Seed-limited interior: more than {p.threshold_m} m inside high-severity patches
              </dt>
              <dd>{fmtAcres(p.interior_acres)} ac</dd>
            </div>
          )}
        </dl>
      )}

      {!order.finding && (
        <div className="totals">
          <div className="headline">
            <p className="headline-figure" data-testid="total-bushels">
              {fmtQty(known(t.bushels.value))}
            </p>
            <p className="headline-unit">{t.bushels.unit}</p>
          </div>
          <dl className="subtotals">
            <div>
              <dt>Clean seed</dt>
              <dd data-testid="total-pounds">
                {fmtQty(known(t.pounds.value))} <span className="unit">lb</span>
              </dd>
            </div>
            <div>
              <dt>Seed cost, CAL FIRE seed price list</dt>
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
