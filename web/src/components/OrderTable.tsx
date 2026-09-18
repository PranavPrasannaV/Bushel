// T037: one row per line (cell × species). Rows are grouped visually by cell, but nothing is ever summed
// across cells here (FR-009, Provenance Lock). Rows are memoised so selecting a line re-renders only its row.
// T069: an assumption change touches every line, and the table's layout cost grows with its rows, so a large
// fire draws whole cells up to FIRST_LINES lines and states how many more there are, with "Show all". Lines
// are never merged or dropped: the totals and the export always cover every line.
import { Fragment, memo, useMemo, useState, type ReactNode } from 'react'
import { GAP_MESSAGE } from '../convert/computeOrder.ts'
import type { OrderLine } from '../convert/types.ts'
import './OrderTable.css'

// ---- Number formatting (shared by the other order components) -------------

const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const n1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const n2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const sig2 = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 2 })

/** Pounds and bushels: more decimals for small values so a 0.16 lb line doesn't read as zero. */
export function fmtQty(v: number | null): string {
  if (v === null) return '—'
  const a = Math.abs(v)
  if (a > 0 && a < 0.01) return sig2.format(v) // 0.0036 lb, not "0.00" beside a $1.79 cost
  return a >= 100 ? n0.format(v) : a >= 10 ? n1.format(v) : n2.format(v)
}

export function fmtAcres(v: number | null): string {
  if (v === null) return '—'
  // Two decimals under 10 ac: a one-pixel line is 0.22 ac, and "0.2 ac × 200 = 44 trees" reads as wrong.
  const a = Math.abs(v)
  return a >= 1000 ? n0.format(v) : a >= 10 || a === 0 ? n1.format(v) : n2.format(v)
}

export function fmtInt(v: number | null): string {
  return v === null ? '—' : n0.format(v)
}

export function fmtUsd(v: number | null): string {
  if (v === null) return '—'
  return Math.abs(v) >= 100 ? usd0.format(v) : usd2.format(v)
}

/** A factor value as published: grouping, up to 3 decimals, no padding. */
export function fmtPlain(v: number | null): string {
  return v === null ? '—' : plain.format(v)
}

export function lineKey(l: OrderLine): string {
  return `${l.cell_id}|${l.species}`
}

// ---- Table ------------------------------------------------------------------

const COLS = 9

/** Lines drawn before "Show all" (T069). Always whole cells, so a cell is never shown in part. */
export const FIRST_LINES = 200

const Row = memo(function Row({
  line,
  firstInCell,
  selected,
  onToggle,
}: {
  line: OrderLine
  firstInCell: boolean
  selected: boolean
  onToggle: (key: string) => void
}) {
  const key = lineKey(line)
  return (
    <tr
      className={`order-row${selected ? ' is-selected' : ''}${firstInCell ? '' : ' is-continued'}`}
      data-cell={line.cell_id}
      data-species={line.species}
      onClick={() => onToggle(key)}
    >
      <td className="col-zone">{line.seed_zone}</td>
      <td className="col-band">{line.elevation_band}</td>
      <th scope="row" className="col-species">
        <button type="button" className="line-button" aria-expanded={selected}>
          {line.species}
        </button>
      </th>
      <td className="num">{fmtAcres(line.acres.value)}</td>
      <td className="num">{fmtInt(line.trees.value)}</td>
      {line.gap !== null ? (
        <td colSpan={4} className="gap-cell" title={line.gap}>
          Not computable: no published seeds/lb or seed price
        </td>
      ) : (
        <>
          <td className="num">{fmtQty(line.pounds.value)}</td>
          <td className="num col-bushels">
            {fmtQty(line.bushels.value)}
            {line.used_fallback && (
              <span
                className="fallback-dagger"
                title="Table 2 fallback: species absent from AON Table 2, so the AON's 1 bushel = 1 lb rule is applied"
                aria-label="Table 2 fallback"
              >
                †
              </span>
            )}
          </td>
          <td className="num">{fmtUsd(line.cost_usd.value)}</td>
          <td className="col-priority">
            {line.priority !== null && (
              <span className="priority-badge" data-priority={line.priority} title={`AON collection priority ${line.priority}`}>
                {line.priority}
              </span>
            )}
          </td>
        </>
      )}
    </tr>
  )
})

export default function OrderTable({
  lines,
  selectedKey,
  onToggle,
  trail,
}: {
  lines: OrderLine[]
  selectedKey: string | null
  onToggle: (key: string) => void
  /** Renders the factor trail for the selected line, inline under its row. */
  trail: (line: OrderLine) => ReactNode
}) {
  // Consecutive lines share a cell (computeOrder emits them cell by cell).
  const groups = useMemo(() => {
    const out: { cellId: string; lines: OrderLine[] }[] = []
    for (const l of lines) {
      const last = out[out.length - 1]
      if (last && last.cellId === l.cell_id) last.lines.push(l)
      else out.push({ cellId: l.cell_id, lines: [l] })
    }
    return out
  }, [lines])

  const [showAll, setShowAll] = useState(false)
  const firstGroups = useMemo(() => {
    const out: typeof groups = []
    let n = 0
    for (const g of groups) {
      if (n >= FIRST_LINES) break
      out.push(g)
      n += g.lines.length
    }
    return out
  }, [groups])
  const firstCount = firstGroups.reduce((n, g) => n + g.lines.length, 0)
  const truncatable = firstCount < lines.length
  const shown = showAll || !truncatable ? groups : firstGroups

  const hasGap = lines.some((l) => l.gap !== null)
  const hasFallback = lines.some((l) => l.used_fallback && l.gap === null)

  return (
    <section className="order-table-section" aria-label="Order lines">
      <p className="table-intro">
        One line per species in each seed zone × 500-ft elevation band; the seed for each line is matched to that zone
        and band. Select a line to see every factor behind it.
      </p>
      <div className="order-table-wrap">
        <table className="order-table">
          <caption>Provenance Lock — cells are never merged.</caption>
          <thead>
            <tr>
              <th scope="col">Seed zone</th>
              <th scope="col">Elevation band</th>
              <th scope="col">Species</th>
              <th scope="col" className="num">Acres</th>
              <th scope="col" className="num">Trees</th>
              <th scope="col" className="num">lb clean seed</th>
              <th scope="col" className="num">Bushels of cones</th>
              <th scope="col" className="num">USD</th>
              <th scope="col" className="col-priority">
                <abbr title="AON collection priority">Pri.</abbr>
              </th>
            </tr>
          </thead>
          {shown.map((g) => (
            <tbody key={g.cellId} className="cell-group">
              {g.lines.map((l, i) => {
                const key = lineKey(l)
                const selected = key === selectedKey
                return (
                  <Fragment key={key}>
                    <Row line={l} firstInCell={i === 0} selected={selected} onToggle={onToggle} />
                    {selected && (
                      <tr className="trail-row">
                        <td colSpan={COLS}>
                          {trail(l)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>
      {truncatable && (
        <p className="table-legend" data-testid="lines-shown">
          {showAll
            ? `All ${fmtInt(lines.length)} lines shown. `
            : `Showing the first ${fmtInt(firstCount)} of ${fmtInt(lines.length)} lines (whole cells). The other ${fmtInt(lines.length - firstCount)} are not merged or dropped: the totals and the export include every line. `}
          <button type="button" className="button-quiet" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show the first ${fmtInt(firstCount)}` : `Show all ${fmtInt(lines.length)} lines`}
          </button>
        </p>
      )}
      <p className="table-legend">
        Priority is the AON collection priority index: <span className="priority-badge" data-priority="1">1</span> more
        than 100 bushels · <span className="priority-badge" data-priority="2">2</span> 11–100 ·{' '}
        <span className="priority-badge" data-priority="3">3</span> 10 or fewer.
        {hasFallback && (
          <>
            {' '}
            <span className="fallback-dagger">†</span> Table 2 fallback: species absent from AON Table 2 use the AON's 1
            bushel = 1 lb rule.
          </>
        )}
        {hasGap && <> Lines marked not computable: {GAP_MESSAGE}</>}
      </p>
    </section>
  )
}
