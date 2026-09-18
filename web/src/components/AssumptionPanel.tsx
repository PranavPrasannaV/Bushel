// T039 + T041: the adjustable inputs. The three factors CAL FIRE has not published render amber and say so
// (FR-012, Constitution IV); stocking is published and adjustable, with its maximum-stocking caveat right
// beside the control (research.md R1). Every control shows the value actually used, after clamping.
import { useState, type ReactNode } from 'react'
import type { AssumptionUse, Factors } from '../convert/types.ts'
import { FACTOR_LABELS } from './FactorTrail.tsx'
import { fmtPlain } from './OrderTable.tsx'
import './AssumptionPanel.css'

function stepFor(unit: string): number {
  if (unit === 'fraction') return 0.01
  if (unit === 'seeds/pot') return 0.1
  return 1
}

function Control({
  use,
  onChange,
  children,
}: {
  use: AssumptionUse
  onChange: (name: string, value: number) => void
  children?: ReactNode
}) {
  // What the user is typing (may be mid-edit, e.g. "0."); null shows the requested value.
  const [draft, setDraft] = useState<string | null>(null)
  const unpublished = use.status === 'unpublished'
  const label = FACTOR_LABELS[use.name] ?? use.name
  const id = `assumption-${use.name}`
  const step = stepFor(use.unit)

  return (
    <div className={`assumption note ${unpublished ? 'unpublished' : 'published'}`} data-name={use.name}>
      <div className="assumption-head">
        <label htmlFor={id}>{label}</label>
        <span className="assumption-status">{unpublished ? 'Not published by CAL FIRE' : 'Published'}</span>
      </div>
      <div className="assumption-inputs">
        <input
          type="range"
          aria-label={`${label} (slider)`}
          min={use.min}
          max={use.max}
          step={step}
          value={use.current_value}
          onChange={(e) => onChange(use.name, Number(e.target.value))}
        />
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={use.min}
          max={use.max}
          step={step}
          value={draft ?? String(use.requested_value)}
          onChange={(e) => {
            setDraft(e.target.value)
            const v = e.target.valueAsNumber
            if (Number.isFinite(v)) onChange(use.name, v)
          }}
          onBlur={() => {
            setDraft(null)
            // Snap an out-of-bounds entry to the bound actually used.
            if (use.clamped) onChange(use.name, use.current_value)
          }}
        />
        <span className="assumption-unit">{use.unit}</span>
      </div>
      <p className="assumption-meta">
        Default {fmtPlain(use.default_value)} · bounds {fmtPlain(use.min)}–{fmtPlain(use.max)} ·{' '}
        <strong className="assumption-used" data-testid={`used-${use.name}`}>
          using {fmtPlain(use.current_value)}
        </strong>
        {use.clamped && (
          <span className="assumption-clamped">
            {' '}
            — {fmtPlain(use.requested_value)} is outside the bounds, so {fmtPlain(use.current_value)} is used
          </span>
        )}
      </p>
      {children}
    </div>
  )
}

export default function AssumptionPanel({
  factors,
  used,
  onChange,
  onReset,
}: {
  factors: Factors
  used: AssumptionUse[]
  onChange: (name: string, value: number) => void
  onReset: () => void
}) {
  const stocking = used.find((u) => u.name === 'stocking_tpa')
  const stockingFactor = factors.published.find((p) => p.name === 'stocking_tpa')
  const unpublished = used.filter((u) => u.status === 'unpublished')
  const changed = used.some((u) => u.requested_value !== u.default_value)

  return (
    <section className="assumptions" aria-labelledby="assumptions-title">
      <div className="assumptions-head">
        <h3 id="assumptions-title">Assumptions</h3>
        <button type="button" className="button-quiet" onClick={onReset} disabled={!changed}>
          Reset to defaults
        </button>
      </div>

      {stocking && (
        <Control use={stocking} onChange={onChange}>
          <p className="assumption-source">{stockingFactor?.source_ref}</p>
          {stockingFactor?.caveat && <p className="caveat">{stockingFactor.caveat}</p>}
        </Control>
      )}

      <p className="assumptions-formula">
        CAL FIRE's method converts seed to seedlings with{' '}
        <span className="formula">
          seedlings/lb = (seeds/lb ÷ <span className="unpublished-value">seeds/pot</span>) ×{' '}
          <span className="unpublished-value">nursery survival</span> ×{' '}
          <span className="unpublished-value">probability of a tree in nursery</span>
        </span>
        . The three highlighted factors come from internal LAMRC nursery datasets and are not published. The defaults
        below are general placeholders, not CAL FIRE's figures: set them to your nursery's.
      </p>

      {unpublished.map((u) => {
        const f = factors.unpublished.find((x) => x.name === u.name)
        return (
          <Control key={u.name} use={u} onChange={onChange}>
            {u.name === 'nursery_survival_rate' && (
              <p className="assumption-hint">Survival in the nursery to a two-year seedling, not field survival after outplanting.</p>
            )}
            {f?.rationale && (
              <details className="rationale">
                <summary>Why this default</summary>
                <p>{f.rationale}</p>
              </details>
            )}
          </Control>
        )
      })}
    </section>
  )
}
