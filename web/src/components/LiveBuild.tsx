// Live builds: search CAL FIRE's perimeter service for any 2018-2023 fire and build its order on request,
// through `python -m bushel.serve`. Without that server (a static deploy), this states plainly that the
// listed fires were pre-built, when, and from which services. It never implies live data it does not have.
import { useEffect, useRef, useState } from 'react'
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
const SOURCES = 'CAL FIRE perimeters, State Responsibility Area and seed zones; MTBS; USGS 3DEP'
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export default function LiveBuild({
  prebuilt,
  generatedAt,
  onBuilt,
}: {
  prebuilt: number
  generatedAt: string
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

  // Debounced live search against CAL FIRE's perimeter service.
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

  if (server.status !== 'online') {
    return (
      <p className="live-provenance" data-testid="data-provenance">
        <span className="live-badge" data-mode="prebuilt">
          Pre-built
        </span>{' '}
        These {prebuilt} fires were built by Bushel's pipeline on {generatedAt.slice(0, 10)} from the agency
        services ({SOURCES}) and LEMMA vegetation.
        {server.status === 'offline' && (
          <>
            {' '}
            To build any California fire from 2018 to 2023 live, run <code>python -m bushel.serve</code>.
          </>
        )}
      </p>
    )
  }

  const { health } = server
  const busy = build.status === 'running'
  const shown = query.trim().length >= 2 ? found : null
  return (
    <section className="live-build" aria-labelledby="live-build-title" data-testid="live-build">
      <div className="live-build-head">
        <span className="live-badge" data-mode="live">
          Live
        </span>
        <h3 id="live-build-title">Build any fire</h3>
      </div>
      <p className="live-small">
        Searches CAL FIRE's perimeter service, then fetches the fire's perimeter, jurisdiction, seed zones, MTBS
        severity and 3DEP elevation at build time. LEMMA vegetation is read from the local download: it has no
        public service.
      </p>

      {!health.lemma && (
        <p className="live-note" role="status">
          Builds need the LEMMA files in <code>data/cache/lemma</code>. Search works; a build will say what is
          missing.
        </p>
      )}

      <label className="live-label" htmlFor="live-search">
        California fire, {health.years[0]}–{health.years[1]}
      </label>
      <input
        id="live-search"
        className="live-input"
        type="search"
        placeholder="Fire name, e.g. Monument"
        value={query}
        autoComplete="off"
        disabled={busy}
        onChange={(e) => setQuery(e.target.value)}
      />

      {searchError && (
        <p className="live-note" role="alert">
          {searchError}
        </p>
      )}
      {shown && shown.length === 0 && <p className="live-small">No 2018–2023 California fire by that name.</p>}
      {shown && shown.length > 0 && (
        <ul className="live-results" aria-label="Fires found">
          {shown.slice(0, 6).map((f) => (
            <li key={f.id}>
              <button type="button" disabled={busy} onClick={() => void start(f)}>
                <span>
                  {f.name} <span className="live-quiet">{f.year}</span>
                </span>
                <span className="live-quiet">{fmtAcres(f.gis_acres)} ac</span>
              </button>
            </li>
          ))}
        </ul>
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
    </section>
  )
}
