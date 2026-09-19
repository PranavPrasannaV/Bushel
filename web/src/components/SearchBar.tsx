// One search for everything Bushel knows a place by: a county, a fire, or any address. Counties and fires
// match instantly on the device; addresses are looked up with OpenStreetMap's Photon geocoder as you type.
// Keyboard: "/" focuses it from anywhere, arrows move, Enter opens, Escape closes.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FireIndexEntry } from '../convert/types.ts'
import { geocode, type Address, type Counties, type County } from '../geo/places.ts'
import { matchFires } from './LiveBuild.tsx'
import { fmtAcres } from './OrderTable.tsx'
import './SearchBar.css'

type Result =
  | { kind: 'county'; county: County }
  | { kind: 'fire'; fire: FireIndexEntry }
  | { kind: 'address'; address: Address }

const LOCAL = 4
const ADDRESS_MIN = 3

function matchCounties(counties: Counties | null, query: string): County[] {
  const q = query.toLowerCase().replace(/\bcounty\b/g, '').trim()
  if (!counties || !q) return []
  return Object.values(counties.counties)
    .filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
}

export default function SearchBar({
  fires,
  counties,
  onFire,
  onCounty,
  onAddress,
  size = 'bar',
  placeholder = 'Search a county, an address or a fire',
}: {
  fires: FireIndexEntry[]
  counties: Counties | null
  onFire: (id: string) => void
  onCounty: (fips: string) => void
  onAddress: (address: Address) => void
  size?: 'hero' | 'bar'
  placeholder?: string
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Address results are kept with the query they answer, so a stale answer is never shown for a new query.
  const [found, setFound] = useState<{ q: string; list: Address[] } | null>(null)
  const [failed, setFailed] = useState<{ q: string; message: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const typed = query.trim()

  // "/" focuses the search from anywhere on the page, unless the user is already typing somewhere.
  useEffect(() => {
    if (size !== 'bar') return
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== '/' || t.closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [size])

  // A press outside closes the results.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  // Addresses, debounced. Nothing is sent until three characters are typed.
  useEffect(() => {
    if (typed.length < ADDRESS_MIN) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => {
      geocode(typed, ctrl.signal)
        .then((list) => setFound({ q: typed, list }))
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) setFailed({ q: typed, message: err instanceof Error ? err.message : String(err) })
        })
    }, 350)
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [typed])

  const addresses = found?.q === typed ? found.list : null
  const addressError = failed?.q === typed ? failed.message : null

  const results = useMemo<Result[]>(() => {
    if (!typed) return []
    return [
      ...matchCounties(counties, typed)
        .slice(0, LOCAL)
        .map((county): Result => ({ kind: 'county', county })),
      ...matchFires(fires, typed)
        .slice(0, LOCAL)
        .map((fire): Result => ({ kind: 'fire', fire })),
      ...(addresses ?? []).slice(0, 5).map((address): Result => ({ kind: 'address', address })),
    ]
  }, [typed, counties, fires, addresses])

  function choose(r: Result) {
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    if (r.kind === 'county') onCounty(r.county.fips)
    else if (r.kind === 'fire') onFire(r.fire.id)
    else onAddress(r.address)
  }

  const listId = `${id}-results`
  const optionId = (i: number) => `${id}-option-${i}`
  const showList = open && typed.length > 0
  const groups: [Result['kind'], string][] = [
    ['county', 'Counties'],
    ['fire', 'Fires'],
    ['address', 'Addresses'],
  ]

  return (
    <div className="search" data-size={size} ref={rootRef}>
      <div className="search-field">
        <svg className="search-glass" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          role="combobox"
          aria-label="Search a county, an address or a fire"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && results.length) {
              e.preventDefault()
              setActive((a) => (a + 1) % results.length)
            } else if (e.key === 'ArrowUp' && results.length) {
              e.preventDefault()
              setActive((a) => (a - 1 + results.length) % results.length)
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault()
              choose(results[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {size === 'bar' && !typed && (
          <kbd className="search-kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </div>

      {showList && (
        <div className="search-pop">
          <ul className="search-results" id={listId} role="listbox" aria-label="Search results">
            {groups.map(([kind, title]) => {
              const items = results.map((r, i) => [r, i] as const).filter(([r]) => r.kind === kind)
              if (!items.length) return null
              return (
                <li key={kind} role="presentation" className="search-group">
                  <p className="caps" role="presentation">
                    {title}
                  </p>
                  <ul role="presentation">
                    {items.map(([r, i]) => (
                      <li
                        key={i}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        className="search-option"
                        onPointerEnter={() => setActive(i)}
                        onPointerDown={(e) => {
                          e.preventDefault()
                          choose(r)
                        }}
                      >
                        {r.kind === 'county' && (
                          <>
                            <span className="search-name">{r.county.name} County</span>
                            <span className="search-meta">
                              {r.county.totals.fires
                                ? `${r.county.totals.fires} fire${r.county.totals.fires === 1 ? '' : 's'} · ${fmtAcres(r.county.totals.interior_acres)} ac can’t reseed`
                                : 'No built fires'}
                            </span>
                          </>
                        )}
                        {r.kind === 'fire' && (
                          <>
                            <span className="search-name">
                              {r.fire.name} <span className="search-year">{r.fire.year}</span>
                            </span>
                            <span className="search-meta">{fmtAcres(r.fire.interior_acres)} ac can’t reseed</span>
                          </>
                        )}
                        {r.kind === 'address' && (
                          <>
                            <span className="search-name">{r.address.label}</span>
                            <span className="search-meta">{r.address.detail}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
          {!results.length && (addresses !== null || typed.length < ADDRESS_MIN) && (
            <p className="search-empty">Nothing by that name. Try a county, a town, or a fire such as Dixie.</p>
          )}
          {typed.length >= ADDRESS_MIN && addresses === null && !addressError && (
            <p className="search-note">Looking up addresses…</p>
          )}
          {addressError && <p className="search-note">{addressError}. Counties and fires still match.</p>}
          <p className="search-note">Addresses are looked up with OpenStreetMap (Photon). Counties and fires stay on this device.</p>
        </div>
      )}
    </div>
  )
}
