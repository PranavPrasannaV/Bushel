// The first screen a new visitor sees: one question, asked once. Bushel is for people who work a particular
// piece of ground, so it asks which county that is, opens there, and remembers it on the device. There is no
// account and nothing leaves the browser — the panel says so, because a question like this has to be honest.
import { useId, useMemo, useState } from 'react'
import { fmt, type Counties } from '../geo/places.ts'
import './FirstRun.css'

export default function FirstRun({
  counties,
  onCounty,
  onOutside,
  onSkip,
}: {
  counties: Counties | null
  onCounty: (fips: string) => void
  onOutside: () => void
  onSkip: () => void
}) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const listId = useId()

  const all = useMemo(
    () =>
      Object.values(counties?.counties ?? {})
        .map((c) => ({ fips: c.fips, name: c.name, fires: c.totals.fires, interior: c.totals.interior_acres }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [counties],
  )
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all.filter((c) => c.fires > 0).sort((a, b) => b.interior - a.interior).slice(0, 6)
    return all.filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 6)
  }, [all, query])
  const chosen = picked ?? (matches.length === 1 ? matches[0].fips : null)

  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <div className="first-run-sheet">
        <p className="caps">First time here</p>
        <h1 id="first-run-title" className="first-run-title">
          Which county do you work in?
        </h1>
        <p className="first-run-lede">
          Bushel opens on your county and keeps it for next time. No account, nothing sent anywhere: it is saved
          on this device, and you can change it whenever you like.
        </p>

        <label className="first-run-field">
          <span className="caps">California county</span>
          <input
            type="text"
            autoComplete="off"
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-label="Which county do you work in?"
            placeholder={counties ? 'Start typing: Plumas, Butte, Shasta…' : 'Loading counties…'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPicked(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && chosen) onCounty(chosen)
            }}
          />
        </label>

        <ul className="first-run-list" id={listId} role="listbox" aria-label="Counties">
          {matches.map((c) => (
            <li key={c.fips}>
              <button
                type="button"
                role="option"
                aria-selected={chosen === c.fips}
                data-picked={chosen === c.fips || undefined}
                onClick={() => onCounty(c.fips)}
                onMouseEnter={() => setPicked(c.fips)}
              >
                <span>{c.name} County</span>
                <span className="first-run-meta">
                  {c.fires === 0
                    ? 'no built fire'
                    : c.interior >= 0.5
                      ? `${fmt(c.interior)} ac can’t reseed`
                      : `${c.fires} fire${c.fires === 1 ? '' : 's'}, no order`}
                </span>
              </button>
            </li>
          ))}
          {query.trim() && matches.length === 0 && <li className="first-run-empty">No California county by that name.</li>}
        </ul>

        <div className="first-run-actions">
          <button type="button" className="button-quiet" onClick={onOutside}>
            I work outside California
          </button>
          <button type="button" className="first-run-skip" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </section>
  )
}
