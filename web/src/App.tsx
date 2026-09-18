import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import AssumptionPanel from './components/AssumptionPanel.tsx'
import BurnMap from './components/BurnMap.tsx'
import FactorTrail from './components/FactorTrail.tsx'
import FireSelector from './components/FireSelector.tsx'
import OrderSummary from './components/OrderSummary.tsx'
import OrderTable from './components/OrderTable.tsx'
import Validation from './components/Validation.tsx'
import { computeOrder } from './convert/computeOrder.ts'
import type { Assumptions, Factors, FireIndex, FireRecord, OrderLine } from './convert/types.ts'
import { getData } from './data.ts'
import { downloadOrderExport } from './export/exportOrder.ts'

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

export default function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [fireId, setFireId] = useState('')
  const [fire, setFire] = useState<FireLoad>({ status: 'idle' })
  // Only what the user changed; computeOrder fills in defaults and clamps to bounds.
  const [overrides, setOverrides] = useState<Assumptions>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const fireCtrl = useRef<AbortController | null>(null)

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

  function selectFire(id: string) {
    fireCtrl.current?.abort()
    const ctrl = new AbortController()
    fireCtrl.current = ctrl
    setFireId(id)
    setSelectedKey(null)
    setFire({ status: 'loading', id })
    let mapError: string | null = null
    Promise.all([
      getData<FireRecord>(`fires/${id}.json`, ctrl.signal),
      // The order does not depend on the map layers; a missing geojson is reported, not fatal.
      getData<GeoJSON.FeatureCollection>(`fires/${id}.geojson`, ctrl.signal).catch((err: unknown) => {
        if (ctrl.signal.aborted) throw err
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

  const entry = load.status === 'ready' ? load.index.fires.find((f) => f.id === fireId) : undefined
  const fireName = record?.fire?.name ?? entry?.name ?? ''
  const geojson = fire.status === 'ready' ? fire.geojson : null
  const planting = record?.planting ?? null

  // Memoised elements: moving a slider re-renders the order, not the map or the validation panel.
  const map = useMemo(
    () => (
      <MapBoundary>
        <BurnMap geojson={geojson} planting={planting} fireName={fireName} />
      </MapBoundary>
    ),
    [geojson, planting, fireName],
  )
  const validation = useMemo(() => <Validation />, [])

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="wordmark">Bushel</span>
        <span className="tagline">
          Computes the conifer seed order for one burned California fire (bushels of cones, pounds of clean seed and
          cost) using CAL FIRE's Assessment of Needs method.
        </span>
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

      {load.status === 'ready' && (
        <main className="shell-main">
          <section className="map-region" aria-label="Burn map">
            {map}
            {fire.status === 'ready' && fire.mapError && (
              <p className="map-note" role="status">
                Map layers not loaded: {fire.mapError}
              </p>
            )}
          </section>

          <aside className="order-region" aria-label="Seed order">
            <FireSelector fires={load.index.fires} value={fireId} onChange={selectFire} />

            {fire.status === 'idle' && (
              <div className="order-intro">
                <p className="caps">Seed order</p>
                <p className="detail">
                  {load.index.fires.length} fires, {load.index.coverage_years[0]}–{load.index.coverage_years[1]}.
                  Severity: {load.index.severity_source}. Choose one to compute its order.
                </p>
              </div>
            )}

            {fire.status === 'loading' && (
              <div className="order-intro" role="status">
                <div className="spinner" aria-hidden="true" />
                <p className="detail">Loading this fire's precomputed cells…</p>
              </div>
            )}

            {fire.status === 'error' && (
              <div className="state-card state-card--error" role="alert">
                <h2>Could not load this fire</h2>
                <p className="detail">{fire.message}</p>
              </div>
            )}

            {fire.status === 'ready' && order && entry && (
              <>
                <OrderSummary entry={entry} record={fire.record} order={order} />

                {!order.finding && (
                  <>
                    <AssumptionPanel
                      factors={load.factors}
                      used={order.assumptions_used}
                      onChange={onAssumption}
                      onReset={onReset}
                    />
                    <div className="order-actions">
                      <h3>
                        Order lines <span className="count">{order.lines.length}</span>
                      </h3>
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => downloadOrderExport(order, fire.record, load.factors)}
                      >
                        Export order
                      </button>
                    </div>
                    <OrderTable
                      lines={order.lines}
                      selectedKey={selectedKey}
                      onToggle={onToggleLine}
                      trail={renderTrail}
                    />
                  </>
                )}
              </>
            )}

            {validation}
          </aside>
        </main>
      )}
    </div>
  )
}
