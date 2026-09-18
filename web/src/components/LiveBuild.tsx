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
  const [server, setServer] = useState<Server>({ status: 'checking' })
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [build, setBuild] = useState<Build>({ status: 'idle' })
  const polling = useRef(0)

  useEffect(() => {
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
  // A live result duplicates a pre-built fire when the ids match apart from the `live-` prefix.
  const prebuiltIds = useMemo(() => new Set(prebuilt.map((f) => f.id)), [prebuilt])
  const remote =
    server.status === 'online' && typed && found
      ? found.filter((f) => !prebuiltIds.has(f.id.replace(/^live-/, '')))
      : []
  const live = server.status === 'online'
  const busy = build.status === 'running'
  const [lo, hi] = live ? server.health.years : [2018, 2023]

  return (
    <section className="live-build" aria-labelledby="find-fire-title" data-testid="find-fire">
      <div className="live-build-head">
        <span className="live-badge" data-mode={live ? 'live' : 'prebuilt'}>
          {live ? 'Live' : 'Pre-built'}
        </span>
        <h3 id="find-fire-title">Find a fire</h3>
      </div>

      <label className="live-label" htmlFor="fire-search">
        {prebuilt.length} California fires, {lo}–{hi}
      </label>
      <input
        id="fire-search"
        className="live-input"
        type="search"
        placeholder="Fire name, e.g. Caldor"
        value={query}
        autoComplete="off"
        disabled={busy}
        onChange={(e) => setQuery(e.target.value)}
      />

      {typed && local.length > 0 && (
        <ul className="live-results" aria-label="Pre-built fires found">
          {local.slice(0, SHOWN).map((f) => (
            <li key={f.id}>
              <button type="button" disabled={busy} onClick={() => onPick(f.id)}>
                <span>
                  {f.name} <span className="live-quiet">{f.year}</span>
                </span>
                <span className="live-quiet">{fmtAcres(f.interior_acres)} ac interior</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {remote.length > 0 && (
        <ul className="live-results" aria-label="Fires to build live">
          {remote.slice(0, SHOWN).map((f) => (
            <li key={f.id}>
              <button type="button" disabled={busy} onClick={() => void start(f)}>
                <span>
                  {f.name} <span className="live-quiet">{f.year}</span>
                </span>
                <span className="live-quiet">Build live · {fmtAcres(f.gis_acres)} ac</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {typed && local.length === 0 && remote.length === 0 && (
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
          {new Date(build.builtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. It is selected
          above.
        </p>
      )}

      {live ? (
        <p className="live-small">
          Fires not yet built are fetched at build time from the agency services ({SOURCES}). LEMMA vegetation is
          read from the local download: it has no public service.
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
    </section>
  )
}
