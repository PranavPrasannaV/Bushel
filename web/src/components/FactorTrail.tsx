// T038: the full chain behind one order line (FR-011, SC-002). Every factor is listed with its value, unit,
// status and source_ref; unpublished factors are amber and say so. Nothing on the trail is unattributed.
import type { FactorUse, OrderLine } from '../convert/types.ts'
import { fmtAcres, fmtInt, fmtPlain, fmtQty, fmtUsd } from './OrderTable.tsx'
import './FactorTrail.css'

export const FACTOR_LABELS: Record<string, string> = {
  stocking_tpa: 'Stocking',
  seeds_per_lb: 'Seeds per pound',
  seeds_per_pot: 'Seeds per pot',
  nursery_survival_rate: 'Nursery survival rate',
  probability_of_tree_in_nursery: 'Probability of a tree in nursery',
  lbs_clean_seed_per_bushel: 'Clean seed per bushel of cones',
  price_per_lb_usd: 'Seed price per pound',
}

export const AON_FORMULA =
  'seedlings/lb = (seeds/lb ÷ seeds/pot) × nursery survival × probability of a tree in nursery'

/** A factor's value inside a formula, amber when CAL FIRE has not published it. */
function V({ f, fmt = fmtPlain }: { f: FactorUse | undefined; fmt?: (v: number | null) => string }) {
  if (!f) return <>—</>
  return <span className={f.status === 'unpublished' ? 'unpublished-value' : 'published-value'}>{fmt(f.value)}</span>
}

export default function FactorTrail({ line }: { line: OrderLine }) {
  const f = (name: string) => line.factors.find((x) => x.name === name)
  const computable = line.gap === null

  return (
    <div className="factor-trail" aria-label={`Factor trail for ${line.species}, cell ${line.cell_id}`}>
      <p className="caps">
        Factor trail · seed zone {line.seed_zone} · {line.elevation_band} · {line.species}
      </p>

      {line.gap !== null && <p className="trail-gap">{line.gap} Trees are computed; nothing seed-denominated is.</p>}

      <ol className="trail-steps">
        <li>
          <span className="step-formula">trees = acres × stocking</span>
          <span className="step-math">
            {fmtAcres(line.acres.value)} ac × <V f={f('stocking_tpa')} /> trees/acre ={' '}
            <strong>{fmtInt(line.trees.value)} trees</strong>
          </span>
        </li>
        <li>
          <span className="step-formula">{AON_FORMULA}</span>
          <span className="step-math">
            (<V f={f('seeds_per_lb')} /> ÷ <V f={f('seeds_per_pot')} />) × <V f={f('nursery_survival_rate')} /> ×{' '}
            <V f={f('probability_of_tree_in_nursery')} /> ={' '}
            <strong>
              {computable ? fmtInt(line.seedlings_per_lb.value) : 'not computable'} {line.seedlings_per_lb.unit}
            </strong>
          </span>
        </li>
        <li>
          <span className="step-formula">lb clean seed = trees ÷ seedlings/lb</span>
          <span className="step-math">
            <strong>{computable ? `${fmtQty(line.pounds.value)} ${line.pounds.unit}` : 'not computable'}</strong>
          </span>
        </li>
        <li>
          <span className="step-formula">bushels of cones = lb clean seed ÷ lb clean seed per bushel of cones</span>
          <span className="step-math">
            {computable && (
              <>
                {fmtQty(line.pounds.value)} ÷ <V f={f('lbs_clean_seed_per_bushel')} /> ={' '}
              </>
            )}
            <strong>{computable ? `${fmtQty(line.bushels.value)} ${line.bushels.unit}` : 'not computable'}</strong>
            {line.used_fallback && <span className="fallback-mark">fallback</span>}
          </span>
        </li>
        <li>
          <span className="step-formula">cost = lb clean seed × seed price per lb</span>
          <span className="step-math">
            {computable && (
              <>
                {fmtQty(line.pounds.value)} × <V f={f('price_per_lb_usd')} fmt={fmtUsd} /> ={' '}
              </>
            )}
            <strong>{computable ? fmtUsd(line.cost_usd.value) : 'not computable'}</strong>
          </span>
        </li>
        <li>
          <span className="step-formula">priority = bushels &gt; 100 → 1 · 11–100 → 2 · 10 or fewer → 3 (AON)</span>
          <span className="step-math">
            {line.priority !== null ? (
              <span className="priority-badge" data-priority={line.priority}>
                {line.priority}
              </span>
            ) : (
              <strong>not computable</strong>
            )}
          </span>
        </li>
      </ol>

      <p className="trail-input">
        Input: {fmtAcres(line.acres.value)} acres of seed-limited interior in this cell whose pre-fire dominant species is{' '}
        {line.species}, precomputed by the pipeline.
      </p>

      <ul className="trail-factors">
        {line.factors.map((x) => (
          <li
            key={x.name}
            className={`trail-factor note ${x.status === 'unpublished' ? 'unpublished' : 'published'}`}
            data-factor={x.name}
            data-status={x.status}
          >
            <div className="factor-head">
              <span className="factor-name">{FACTOR_LABELS[x.name] ?? x.name}</span>
              <span className="factor-value">
                {x.value === null ? 'no published value' : fmtPlain(x.value)} <span className="factor-unit">{x.unit}</span>
              </span>
            </div>
            <div className="factor-meta">
              <span className="factor-status">
                {x.status === 'unpublished'
                  ? 'Not published by CAL FIRE'
                  : x.value === null
                    ? 'No value published for this species'
                    : 'Published'}
              </span>
              {x.fallback_applied && <span className="fallback-mark">fallback</span>}
              <span className="source-ref">{x.source_ref}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
