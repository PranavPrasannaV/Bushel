// Find a fire: search the pre-built fires instantly (works offline), and, when `python -m bushel.serve`
// answers, build any other 2018-2023 California fire live from the agency services. Without that server
// (a static deploy) it states plainly that the fires were pre-built, when, and from which services. It
// never implies live data it does not have.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FireIndexEntry } from '../convert/types.ts'
import { getApi } from '../data.ts'
import { fmtAcres } from './OrderTable.tsx'
import './LiveBuild.css'

interface Health {
  ok: boolean
  lemma: boolean
  years: [number, number]
}
interface Found {
  id: string
  frap_name: string
  name: string
  year: number
  gis_acres: number
}
interface Job {
  state: 'queued' | 'running' | 'done' | 'error'
  step: string
  error: string | null
  result?: { entry: FireIndexEntry; built_at: string }
}

type Server = { status: 'checking' } | { status: 'offline' } | { status: 'online'; health: Health }
type Build =
  | { status: 'idle' }
  | { status: 'running'; fire: Found; step: string }
  | { status: 'error'; fire: Found; message: string }
  | { status: 'done'; fire: Found; builtAt: string }

const POLL_MS = 700
const SHOWN = 6
const SOURCES = 'CAL FIRE perimeters, State Responsibility Area and seed zones; MTBS; USGS 3DEP'
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** True where `python -m bushel.serve` can be running: the local machine, or a host named at build time. */
export function canHostServer(hostname: string): boolean {
  const extra = import.meta.env.VITE_LIVE_HOST as string | undefined
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || (!!extra && hostname === extra)
}

/** Pre-built fires whose name (or year) matches every word of the query, largest interior first. */
export function matchFires(fires: FireIndexEntry[], query: string): FireIndexEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return fires
    .filter((f) => words.every((w) => f.name.toLowerCase().includes(w) || String(f.year) === w))
    .sort((a, b) => b.interior_acres - a.interior_acres)
}

export default function LiveBuild({
  prebuilt,
  generatedAt,
  onPick,
  onBuilt,
}: {
  prebuilt: FireIndexEntry[]
  generatedAt: string
  onPick: (id: string) => void
  onBuilt: (entry: FireIndexEntry) => void
}) {
  // A live-build server only ever runs on the machine serving the app. A static host has none, so it is
  // never asked (asking would log a 404 on every visit).
  const [server, setServer] = useState<Server>(() =>
    canHostServer(window.location.hostname) ? { status: 'checking' } : { status: 'offline' },
  )
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [build, setBuild] = useState<Build>({ status: 'idle' })
  const [open, setOpen] = useState(false)
  const polling = useRef(0)
  const rootRef = useRef<HTMLElement>(null)

  // A press anywhere outside the search closes its results.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  useEffect(() => {
    if (!canHostServer(window.location.hostname)) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 2000)
    getApi<Health>('health', { signal: ctrl.signal })
      .then((health) => setServer({ status: 'online', health }))
      .catch(() => setServer({ status: 'offline' }))
      .finally(() => window.clearTimeout(timer))
    return () => {
      ctrl.abort()
      window.clearTimeout(polling.current)
    }
  }, [])

  // Debounced live search against CAL FIRE's perimeter service, only when a server can build.
  useEffect(() => {
    if (server.status !== 'online' || query.trim().length < 2) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => {
      getApi<{ fires: Found[] }>(`search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal })
        .then((r) => {
          setFound(r.fires)
          setSearchError(null)
        })
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) setSearchError(message(err))
        })
    }, 300)
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [query, server.status])

  async function start(fire: Found) {
    setBuild({ status: 'running', fire, step: 'Starting' })
    const fail = (err: unknown) => setBuild({ status: 'error', fire, message: message(err) })
    try {
      const { job } = await getApi<{ job: string }>('build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frap_name: fire.frap_name, year: fire.year }),
      })
      const poll = async (): Promise<void> => {
        const state = await getApi<Job>(`jobs/${job}`)
        if (state.state === 'done' && state.result) {
          setBuild({ status: 'done', fire, builtAt: state.result.built_at })
          onBuilt(state.result.entry)
        } else if (state.state === 'error') {
          setBuild({ status: 'error', fire, message: state.error ?? 'The build failed.' })
        } else {
          setBuild({ status: 'running', fire, step: state.step })
          polling.current = window.setTimeout(() => void poll().catch(fail), POLL_MS)
        }
      }
      await poll()
    } catch (err) {
      fail(err)
    }
  }

  const typed = query.trim().length >= 2
  const local = useMemo(() => (typed ? matchFires(prebuilt, query) : []), [prebuilt, query, typed])
  // A live result duplicates a pre-built fire when the ids match apart from the `live-` prefix. Those are
  // still offered: rebuilding one live and comparing it with the pre-built record is the proof that
  // "pre-built" means built by the same pipeline, not made up.
  const prebuiltIds = useMemo(() => new Set(prebuilt.map((f) => f.id)), [prebuilt])
  const remote = server.status === 'online' && typed && found ? found : []
  const isPrebuilt = (f: Found) => prebuiltIds.has(f.id.replace(/^live-/, ''))
  const live = server.status === 'online'
  const busy = build.status === 'running'
  const [lo, hi] = live ? server.health.years : [2018, 2023]

  // The search lives in the top bar; its results, build progress and provenance open beneath it.
  const pick = (id: string) => {
    onPick(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <section
      className="live-build"
      aria-labelledby="find-fire-title"
      data-testid="find-fire"
      data-open={open}
      ref={rootRef}
      onFocus={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <h3 id="find-fire-title" className="visually-hidden">
        Find a fire
      </h3>
      <div className="live-field">
        <svg className="live-glass" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <label className="visually-hidden" htmlFor="fire-search">
          Find a fire: {prebuilt.length} California fires, {lo}–{hi}
        </label>
        <input
          id="fire-search"
          className="live-input"
          type="search"
          placeholder="Find a fire by name"
          value={query}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="live-badge" data-mode={live ? 'live' : 'prebuilt'}>
          {live ? 'Live' : 'Pre-built'}
        </span>
      </div>

      {busy && !open && (
        <p className="live-chip" role="status" aria-live="polite">
          <span className="live-pulse" aria-hidden="true" />
          Building {build.fire.name} ({build.fire.year})
        </p>
      )}

      {open && (
        <div className="live-pop">
          {typed && local.length > 0 && (
            <div className="live-group">
              <p className="caps">Pre-built</p>
              <ul className="live-results" aria-label="Pre-built fires found">
                {local.slice(0, SHOWN).map((f) => (
                  <li key={f.id}>
                    <button type="button" disabled={busy} onClick={() => pick(f.id)}>
                      <span>
                        {f.name} <span className="live-quiet">{f.year}</span>
                      </span>
                      <span className="live-quiet">{fmtAcres(f.interior_acres)} ac interior</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {remote.length > 0 && (
            <div className="live-group">
              <p className="caps">From CAL FIRE, built now</p>
              <ul className="live-results" aria-label="Fires to build live">
                {remote.slice(0, SHOWN).map((f) => (
                  <li key={f.id}>
                    <button type="button" disabled={busy} onClick={() => void start(f)}>
                      <span>
                        {f.name} <span className="live-quiet">{f.year}</span>
                      </span>
                      <span className="live-quiet">
                        {isPrebuilt(f) ? 'Rebuild live' : 'Build live'} · {fmtAcres(f.gis_acres)} ac
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {typed && local.length === 0 && remote.length === 0 && (found !== null || !live) && (
            <p className="live-small">
              No {lo}–{hi} fire by that name{live ? '' : ' among the pre-built fires'}.
            </p>
          )}
          {searchError && (
            <p className="live-note" role="alert">
              {searchError}
            </p>
          )}

          {build.status === 'running' && (
            <p className="live-status" role="status" aria-live="polite">
              <span className="live-pulse" aria-hidden="true" />
              Building {build.fire.name} ({build.fire.year}): {build.step}…
            </p>
          )}
          {build.status === 'error' && (
            <p className="live-note" role="alert">
              {build.fire.name} ({build.fire.year}) was not built. {build.message}
            </p>
          )}
          {build.status === 'done' && (
            <p className="live-status" role="status">
              Built {build.fire.name} ({build.fire.year}) live at{' '}
              {new Date(build.builtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. It is open
              now.
            </p>
          )}

          {live ? (
            <p className="live-small">
              Fires not yet built are fetched at build time from the agency services ({SOURCES}). LEMMA vegetation
              is read from the local download: it has no public service.
              {!server.health.lemma && (
                <>
                  {' '}
                  Builds need the LEMMA files in <code>data/cache/lemma</code>.
                </>
              )}
            </p>
          ) : (
            <p className="live-provenance" data-testid="data-provenance">
              Every fire here was built by Bushel's pipeline on {generatedAt.slice(0, 10)} from the agency services (
              {SOURCES}) and LEMMA vegetation.
              {server.status === 'offline' && (
                <>
                  {' '}
                  To build a fire live, run <code>python -m bushel.serve</code>.
                </>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
