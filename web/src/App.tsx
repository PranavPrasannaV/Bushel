import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import AssumptionPanel from './components/AssumptionPanel.tsx'
import FactorTrail from './components/FactorTrail.tsx'
import FireSelector from './components/FireSelector.tsx'
import LiveBuild from './components/LiveBuild.tsx'
import type { FirePoints } from './components/NationMap.tsx'
import OrderSummary, { AcreageFunnel } from './components/OrderSummary.tsx'
import OrderTable from './components/OrderTable.tsx'
import { CountiesReport, CountyPanel, CountyReport, StatePanel } from './components/RegionPanel.tsx'
import SearchBar from './components/SearchBar.tsx'
import Validation from './components/Validation.tsx'
import { computeOrder } from './convert/computeOrder.ts'
import type { Assumptions, Factors, FireIndex, FireIndexEntry, FireRecord, OrderLine } from './convert/types.ts'
import { getData, getFireData, isLive } from './data.ts'
import { downloadOrderExport } from './export/exportOrder.ts'
import { countyAt, firesNear, fmt, type Address, type Counties, type NearFire } from './geo/places.ts'
import { parseRoute, routeSearch, type Route } from './route.ts'
import Home from './views/Home.tsx'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: FireIndex; factors: Factors }

type FireLoad =
  | { status: 'idle' }
  | { status: 'loading'; id: string }
  | { status: 'error'; id: string; message: string }
  | {
      status: 'ready'
      id: string
      record: FireRecord
      geojson: GeoJSON.FeatureCollection | null
      mapError: string | null
    }

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** A map that cannot draw (no WebGL, say) must not take the order down with it. */
class MapBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(err: unknown) {
    return { error: errorText(err) }
  }
  render() {
    if (this.state.error) return <div className="placeholder">The map could not be drawn: {this.state.error}</div>
    return this.props.children
  }
}

const renderTrail = (line: OrderLine) => <FactorTrail line={line} />

/** The fire a bad or stale `?fire=` link falls back to: the strongest order. */
export const FEATURED_FIRE = 'north-complex-2020'

// MapLibre is most of the JavaScript. It is its own chunk, and its download starts when this module runs,
// so it arrives while the home page is read, before anyone opens a map.
const burnMapChunk = import('./components/BurnMap.tsx')
const BurnMap = lazy(() => burnMapChunk)

/** A fire's two files, fetched once. A deep-linked fire is asked for before the index arrives. */
type FireFiles = { record: Promise<FireRecord>; geojson: Promise<GeoJSON.FeatureCollection> }
const fireFiles = new Map<string, FireFiles>()
function fetchFire(id: string): FireFiles {
  let files = fireFiles.get(id)
  if (!files) {
    files = { record: getFireData<FireRecord>(id, 'json'), geojson: getFireData(id, 'geojson') }
    // A failed prefetch is retried on selection, never cached as the answer.
    files.record.catch(() => fireFiles.delete(id))
    files.geojson.catch(() => fireFiles.delete(id))
    fireFiles.set(id, files)
  }
  return files
}
const firstRoute = parseRoute(window.location.search)
if (firstRoute.view === 'fire') fetchFire(firstRoute.id)

/** One reference file, loaded the first time a view needs it and kept. */
function useReference<T>(path: string, wanted: boolean): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    if (!wanted || value) return
    const ctrl = new AbortController()
    getData<T>(path, ctrl.signal)
      .then(setValue)
      .catch(() => {}) // a missing reference file leaves its view with less, never broken
    return () => ctrl.abort()
  }, [path, wanted, value])
  return value
}

export default function App() {
  const [route, setRoute] = useState<Route>(firstRoute)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [fireId, setFireId] = useState('')
  const [fire, setFire] = useState<FireLoad>({ status: 'idle' })
  // Fires built live this session (python -m bushel.serve), listed after the pre-built set.
  const [liveFires, setLiveFires] = useState<FireIndexEntry[]>([])
  // Only what the user changed; computeOrder fills in defaults and clamps to bounds.
  const [overrides, setOverrides] = useState<Assumptions>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // The address text of a search, kept in the page (the link carries only the rounded point).
  const [placeText, setPlaceText] = useState<Address | null>(null)
  const fireCtrl = useRef<AbortController | null>(null)

  const regional = route.view === 'state' || route.view === 'county' || route.view === 'place'
  const national = route.view === 'nation' || route.view === 'place'
  const counties = useReference<Counties>('reference/counties.json', true)
  const states = useReference<GeoJSON.FeatureCollection>('reference/us-states.geojson', national)
  const points = useReference<FirePoints>('reference/fire-points.json', national)
  const outlines = useReference<GeoJSON.FeatureCollection>('reference/ca-counties.geojson', regional)
  const overview = useReference<GeoJSON.FeatureCollection>('reference/statewide.geojson', regional)

  const navigate = useCallback((next: Route, replace = false) => {
    const url = `${window.location.pathname}${routeSearch(next)}`
    if (replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    setRoute(next)
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const pop = () => setRoute(parseRoute(window.location.search))
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      getData<FireIndex>('fires/index.json', ctrl.signal),
      getData<Factors>('reference/factors.json', ctrl.signal),
    ])
      .then(([index, factors]) => setLoad({ status: 'ready', index, factors }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setLoad({ status: 'error', message: errorText(err) })
      })
    return () => {
      ctrl.abort()
      fireCtrl.current?.abort()
    }
  }, [])

  const selectFire = useCallback((id: string) => {
    fireCtrl.current?.abort()
    const ctrl = new AbortController()
    fireCtrl.current = ctrl
    setFireId(id)
    setSelectedKey(null)
    setFire({ status: 'loading', id })
    let mapError: string | null = null
    const files = fetchFire(id)
    Promise.all([
      files.record,
      // The order does not depend on the map layers; a missing geojson is reported, not fatal.
      files.geojson.catch((err: unknown) => {
        mapError = errorText(err)
        return null
      }),
    ])
      .then(([record, geojson]) => {
        if (!ctrl.signal.aborted) setFire({ status: 'ready', id, record, geojson, mapError })
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setFire({ status: 'error', id, message: errorText(err) })
      })
  }, [])

  // The fire view follows the route. An unknown pre-built id falls back to the featured fire.
  const routeFire = route.view === 'fire' ? route.id : null
  useEffect(() => {
    if (load.status !== 'ready' || !routeFire || routeFire === fireId) return
    const known = isLive(routeFire) || load.index.fires.some((f) => f.id === routeFire)
    if (known) selectFire(routeFire)
    else navigate({ view: 'fire', id: FEATURED_FIRE }, true)
  }, [load, routeFire, fireId, navigate, selectFire])

  const openFire = useCallback((id: string) => navigate({ view: 'fire', id }), [navigate])
  const openCounty = useCallback((fips: string) => navigate({ view: 'county', fips }), [navigate])
  const openState = useCallback(
    (postal: string) => navigate(postal === 'CA' ? { view: 'state' } : { view: 'nation', state: postal }),
    [navigate],
  )
  const openAddress = useCallback(
    (a: Address) => {
      setPlaceText(a)
      navigate({ view: 'place', address: a })
    },
    [navigate],
  )

  function onBuilt(built: FireIndexEntry) {
    setLiveFires((list) => [...list.filter((f) => f.id !== built.id), built])
    openFire(built.id)
  }

  const factors = load.status === 'ready' ? load.factors : null
  const record = fire.status === 'ready' ? fire.record : null

  // FR-013: every adjustment recomputes here, in the browser. No reload, no request.
  const order = useMemo(
    // The time of this computation, so the export's computed_at is not blank.
    () => (record && factors ? computeOrder(record, factors, overrides, new Date().toISOString()) : null),
    [record, factors, overrides],
  )

  const onAssumption = useCallback((name: string, value: number) => {
    setOverrides((o) => ({ ...o, [name]: value }))
  }, [])
  const onReset = useCallback(() => setOverrides({}), [])
  const onToggleLine = useCallback((key: string) => setSelectedKey((k) => (k === key ? null : key)), [])

  const prebuilt = useMemo(() => (load.status === 'ready' ? load.index.fires : []), [load])
  const allFires = useMemo(() => [...prebuilt, ...liveFires], [prebuilt, liveFires])
  const entry = allFires.find((f) => f.id === fireId)
  const fireName = record?.fire?.name ?? entry?.name ?? ''
  const geojson = fire.status === 'ready' ? fire.geojson : null
  const planting = record?.planting ?? null

  // Place: the searched point, its county, and the fires nearest it.
  const place = route.view === 'place' ? route.address : null
  const placeShown =
    place && placeText && Math.abs(placeText.lat - place.lat) < 1e-3 && Math.abs(placeText.lon - place.lon) < 1e-3
      ? placeText
      : place
  const placeCounty = place && outlines ? countyAt([place.lon, place.lat], outlines) : null
  const near: NearFire[] | undefined = useMemo(
    () => (place && overview ? firesNear([place.lon, place.lat], overview) : undefined),
    [place, overview],
  )

  // A searched address outside California goes to the national map, its state called out.
  const outside = place && ((place.state && place.state !== 'California') || (outlines && !placeCounty)) ? place : null
  const stateByName = useMemo(() => {
    const m = new Map<string, { postal: string; name: string }>()
    for (const f of states?.features ?? []) {
      const s = { postal: f.properties?.postal as string, name: f.properties?.name as string }
      m.set(s.name, s)
    }
    return m
  }, [states])
  const stateByPostal = useMemo(() => new Map([...stateByName.values()].map((s) => [s.postal, s])), [stateByName])

  // Where the fire sits: the county holding most of its perimeter.
  const fireCounty = useMemo(() => {
    if (!counties || !fireId) return null
    let best: { fips: string; name: string; share: number } | null = null
    for (const c of Object.values(counties.counties)) {
      const hit = c.fires.find((f) => f.id === fireId)
      if (hit && (!best || hit.perimeter_share > best.share)) best = { fips: c.fips, name: c.name, share: hit.perimeter_share }
    }
    return best
  }, [counties, fireId])

  const county =
    route.view === 'county' ? counties?.counties[route.fips] : placeCounty ? counties?.counties[placeCounty] : undefined

  const view = outside ? 'nation' : route.view

  // One map for the state, county, place and fire views. Memoised: a slider moves the order, not the map.
  const fitBox = view === 'county' || view === 'place' ? (county?.bbox ?? null) : null
  const pin = useMemo<[number, number] | null>(
    () => (place && !outside ? [place.lon, place.lat] : null),
    [place, outside],
  )
  const overviewTitle = view === 'state' ? 'California, 2018–2023' : county ? `${county.name} County` : 'California'
  const focusCounty = county?.fips ?? null
  const map = useMemo(
    () => (
      <MapBoundary>
        <Suspense fallback={<div className="placeholder">Loading the map…</div>}>
          <BurnMap
            geojson={geojson}
            planting={planting}
            fireName={fireName}
            overview={overview}
            showOverview={view !== 'fire'}
            onPickFire={openFire}
            counties={outlines}
            focusCounty={focusCounty}
            onPickCounty={openCounty}
            fitBox={fitBox}
            pin={pin}
            overviewTitle={overviewTitle}
          />
        </Suspense>
      </MapBoundary>
    ),
    [geojson, planting, fireName, overview, view, openFire, outlines, focusCounty, openCounty, fitBox, pin, overviewTitle],
  )
  const validation = useMemo(() => <Validation />, [])

  // ---- Chrome ---------------------------------------------------------------------------------------

  const crumbs: [string, (() => void) | null][] = [
    ['United States', view === 'nation' ? null : () => navigate({ view: 'nation' })],
  ]
  if (view !== 'nation') crumbs.push(['California', view === 'state' ? null : () => navigate({ view: 'state' })])
  if (view === 'county' && county) crumbs.push([`${county.name} County`, null])
  if (view === 'place' && county) crumbs.push([`${county.name} County`, () => openCounty(county.fips)])
  if (view === 'place') crumbs.push([placeShown?.label ?? 'Place', null])
  if (view === 'fire') {
    if (fireCounty) crumbs.push([`${fireCounty.name} County`, () => openCounty(fireCounty.fips)])
    crumbs.push([fireName || 'Fire', null])
  }

  const year = record?.fire?.year ?? entry?.year
  const perimeterAcres = record?.retained?.perimeter_acres ?? entry?.perimeter_acres
  const hasOrder = view === 'fire' && fire.status === 'ready' && !!order && !order.finding
  const sections = [
    { id: 'from-fire', title: 'From the fire to the order', show: fire.status === 'ready' && !!record?.retained },
    { id: 'assumptions', title: 'Assumptions', show: hasOrder },
    { id: 'lines', title: 'Order lines', show: hasOrder },
    { id: 'check', title: 'Checked against published figures', show: true },
  ].filter((x) => x.show)
  const num = (id: string) => String(sections.findIndex((x) => x.id === id) + 1).padStart(2, '0')

  const outsideState = outside?.state ? stateByName.get(outside.state) : null
  const nationFocus =
    outside && outsideState
      ? { ...outsideState, address: placeShown?.label }
      : route.view === 'nation' && route.state
        ? (stateByPostal.get(route.state) ?? null)
        : null

  return (
    <div className="shell" data-view={view}>
      <header className="topbar">
        <a
          className="wordmark"
          href={import.meta.env.BASE_URL}
          onClick={(e) => {
            e.preventDefault()
            navigate({ view: 'nation' })
          }}
        >
          Bushel
        </a>
        {view === 'nation' ? (
          <p className="topbar-tag">Post-fire seed orders</p>
        ) : (
          <nav className="crumbs" aria-label="Where you are">
            <ol>
              {crumbs.map(([label, go], i) => (
                <li key={i}>
                  {go ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault()
                        go()
                      }}
                    >
                      {label}
                    </a>
                  ) : (
                    <span aria-current="page">{label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {load.status === 'ready' && view !== 'nation' && (
          <div className="topbar-controls">
            {view === 'fire' && (
              <FireSelector fires={load.index.fires} liveFires={liveFires} value={fireId} onChange={openFire} />
            )}
            <div className="topbar-search">
              <SearchBar
                fires={allFires}
                counties={counties}
                onFire={openFire}
                onCounty={openCounty}
                onAddress={openAddress}
              />
            </div>
          </div>
        )}
      </header>

      {load.status === 'loading' && (
        <div className="state" role="status">
          <div className="state-card">
            <div className="spinner" aria-hidden="true" />
            <p>Loading the fire index and published factors…</p>
          </div>
        </div>
      )}

      {load.status === 'error' && (
        <div className="state" role="alert">
          <div className="state-card state-card--error">
            <h2>Could not load the data</h2>
            <p className="detail">{load.message}</p>
          </div>
        </div>
      )}

      {load.status === 'ready' && view === 'nation' && (
        <main className="shell-main">
          <Home
            fires={prebuilt}
            counties={counties}
            states={states}
            points={points}
            focus={nationFocus}
            onState={openState}
            onCounty={openCounty}
            onFire={openFire}
            onAddress={openAddress}
            onDismiss={() => navigate({ view: 'nation' })}
          />
        </main>
      )}

      {load.status === 'ready' && view !== 'nation' && (
        <main className="shell-main">
          <div className="stage" data-view={view === 'fire' ? 'fire' : 'overview'}>
            <section className="map-region" aria-label="Burn map">
              {map}
              {view === 'fire' && fire.status === 'ready' && fire.mapError && (
                <p className="map-note" role="status">
                  Map layers not loaded: {fire.mapError}
                </p>
              )}
            </section>

            {/* The sheet's title block: the place's name set on the map, like a quadrangle title. */}
            {view === 'fire' && fireName && (
              <div className="title-block">
                <p className="title-kicker">
                  Burned {year}
                  {fireCounty ? ` · ${fireCounty.name} County` : ''}
                </p>
                <h1 className="title-name">{fireName}</h1>
                {perimeterAcres !== undefined && (
                  <p className="title-stamp">
                    <span>{fmt(perimeterAcres)} acres burned</span>
                    {record?.planting && (
                      <span className="title-stamp-key">{fmt(record.planting.interior_acres)} acres can&rsquo;t reseed</span>
                    )}
                  </p>
                )}
              </div>
            )}
            {view === 'state' && (
              <div className="title-block">
                <p className="title-kicker">United States · built</p>
                <h1 className="title-name">California</h1>
                <p className="title-stamp">
                  <span>{prebuilt.length} fires, 2018–2023</span>
                  <span className="title-stamp-key">
                    {fmt(prebuilt.reduce((s, f) => s + f.interior_acres, 0))} acres can&rsquo;t reseed
                  </span>
                </p>
              </div>
            )}
            {(view === 'county' || view === 'place') && county && (
              <div className="title-block">
                <p className="title-kicker">California</p>
                <h1 className="title-name">{county.name} County</h1>
                <p className="title-stamp">
                  <span>
                    {county.totals.fires} fire{county.totals.fires === 1 ? '' : 's'} since 2018
                  </span>
                  {county.totals.interior_acres >= 0.5 ? (
                    <span className="title-stamp-key">{fmt(county.totals.interior_acres)} acres can&rsquo;t reseed</span>
                  ) : (
                    <span>No seed order needed</span>
                  )}
                </p>
              </div>
            )}

            <aside className="slip-region" aria-label={view === 'fire' ? 'Seed order' : 'Brief'}>
              {view === 'state' && (
                <StatePanel counties={counties} fires={prebuilt} onCounty={openCounty}>
                  <div className="region-live">
                    <p className="caps">Build a fire from the agency services</p>
                    <LiveBuild
                      prebuilt={load.index.fires}
                      generatedAt={load.index.generated_at}
                      onPick={openFire}
                      onBuilt={onBuilt}
                    />
                  </div>
                </StatePanel>
              )}
              {(view === 'county' || view === 'place') &&
                (county ? (
                  <CountyPanel
                    county={county}
                    fires={allFires}
                    onFire={openFire}
                    place={view === 'place' ? (placeShown ?? undefined) : undefined}
                    near={view === 'place' ? near : undefined}
                  />
                ) : (
                  <div className="order-intro" role="status">
                    <div className="spinner" aria-hidden="true" />
                    <p className="detail">{counties ? 'Finding the county…' : 'Loading California’s counties…'}</p>
                  </div>
                ))}

              {view === 'fire' && fire.status === 'loading' && (
                <div className="order-intro" role="status">
                  <div className="spinner" aria-hidden="true" />
                  <p className="detail">Loading this fire&rsquo;s cells…</p>
                </div>
              )}
              {view === 'fire' && fire.status === 'error' && (
                <div className="state-card state-card--error" role="alert">
                  <h2>Could not load this fire</h2>
                  <p className="detail">{fire.message}</p>
                </div>
              )}
              {view === 'fire' && fire.status === 'ready' && order && entry && (
                <>
                  <OrderSummary entry={entry} record={fire.record} order={order} />
                  <div className="slip-actions">
                    {!order.finding && (
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => downloadOrderExport(order, fire.record, load.factors)}
                      >
                        Export order
                      </button>
                    )}
                    <a className="slip-more" href={order.finding ? '#from-fire' : '#lines'}>
                      {order.finding ? 'See the acreage' : `All ${order.lines.length} lines`}
                      <span aria-hidden="true"> ↓</span>
                    </a>
                  </div>
                </>
              )}
            </aside>
          </div>

          {view === 'fire' && (
            <div className="report">
              <nav className="report-contents" aria-label="Report contents">
                <p className="caps">The order, in full</p>
                <ol>
                  {sections.map((x) => (
                    <li key={x.id}>
                      <a href={`#${x.id}`}>
                        <span className="report-num">{num(x.id)}</span>
                        {x.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="report-body">
                {fire.status === 'ready' && record?.retained && (
                  <section className="report-section" id="from-fire">
                    <span className="report-num">{num('from-fire')}</span>
                    <AcreageFunnel record={record} />
                  </section>
                )}

                {fire.status === 'ready' && order && hasOrder && (
                  <>
                    <section className="report-section" id="assumptions">
                      <span className="report-num">{num('assumptions')}</span>
                      <AssumptionPanel
                        factors={load.factors}
                        used={order.assumptions_used}
                        onChange={onAssumption}
                        onReset={onReset}
                      />
                    </section>

                    <section className="report-section" id="lines">
                      <span className="report-num">{num('lines')}</span>
                      <div className="lines">
                        <div className="order-actions">
                          <h3>
                            Order lines <span className="count">{order.lines.length}</span>
                          </h3>
                        </div>
                        <OrderTable
                          lines={order.lines}
                          selectedKey={selectedKey}
                          onToggle={onToggleLine}
                          trail={renderTrail}
                        />
                      </div>
                    </section>
                  </>
                )}

                <section className="report-section" id="check">
                  <span className="report-num">{num('check')}</span>
                  {validation}
                </section>
              </div>
            </div>
          )}

          {view === 'state' && (
            <div className="report report--single">
              <div className="report-body">
                {counties && (
                  <section className="report-section" id="counties">
                    <span className="report-num">01</span>
                    <CountiesReport counties={counties} onCounty={openCounty} />
                  </section>
                )}
                <section className="report-section" id="check">
                  <span className="report-num">02</span>
                  {validation}
                </section>
              </div>
            </div>
          )}

          {(view === 'county' || view === 'place') && county && counties && (
            <div className="report report--single">
              <div className="report-body">
                <section className="report-section" id="county-fires">
                  <span className="report-num">01</span>
                  <CountyReport county={county} fires={allFires} method={counties.method} onFire={openFire} />
                </section>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
