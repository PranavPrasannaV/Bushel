/// <reference types="geojson" />
// Burn map (T052, T053). Draws one fire's GeoJSON on a plain background: no basemap tiles, fully offline.
// The seed-limited interior is the one luminous layer and the one animation on screen (SC-006).
// The threshold and Baker's reference are fixed. Nothing here changes them (FR-006).
import { useEffect, useRef, useState, type JSX } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  setWorkerUrl,
  type FilterSpecification,
  type GeoJSONSource,
  type LayerSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FireRecord } from '../convert/types.ts'
import './BurnMap.css'

// MapLibre looks for its worker beside its own module, which Vite moves. Hand it a Vite-built worker instead.
// MapLibre always starts a module worker, so in dev ask Vite for the module form (the build is one bundle).
setWorkerUrl(import.meta.env.DEV ? workerUrl.replace('type=classic', 'type=module') : workerUrl)

// FR-005, verbatim from docs/03-DO-NOT-CLAIM.md. Never "most conservative".
const THRESHOLD_STATEMENT = '90 m — Baker (2023), the published estimate least favourable to this conclusion.'

const SOURCE = 'fire'
const OVERVIEW = 'statewide'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const FIRE_LAYERS = ['retained', 'high-severity', 'perimeter', 'interior-glow', 'interior-fill', 'cells', 'interior-edge']
const OVERVIEW_LAYERS = ['sw-state', 'sw-hit', 'sw-perimeter', 'sw-interior', 'sw-interior-edge', 'sw-marker']

// Layers that rise together as the one peak, and the opacity each reaches. They start at 0.
// Cells lie only inside the interior, so their divisions are drawn over it and rise with it.
const PEAK: [layer: string, prop: 'fill-opacity' | 'line-opacity', full: number][] = [
  ['interior-glow', 'line-opacity', 1],
  ['interior-fill', 'fill-opacity', 0.9],
  ['cells', 'line-opacity', 0.55],
  ['interior-edge', 'line-opacity', 0.9],
]

/** Layers bottom to top. Colours come from the design tokens (tokens.css `--map-*`). */
function mapLayers(token: (name: string) => string): LayerSpecification[] {
  const on = (layer: string): FilterSpecification => ['==', ['get', 'layer'], layer]
  return [
    {
      id: 'retained',
      type: 'fill',
      source: SOURCE,
      filter: on('retained'),
      paint: { 'fill-color': token('--map-burn-fill'), 'fill-opacity': 0.45 },
    },
    {
      id: 'high-severity',
      type: 'fill',
      source: SOURCE,
      filter: on('high_severity'),
      paint: { 'fill-color': token('--map-high-severity-fill'), 'fill-opacity': 0.85 },
    },
    {
      id: 'perimeter',
      type: 'line',
      source: SOURCE,
      filter: on('perimeter'),
      paint: { 'line-color': token('--map-perimeter-line'), 'line-width': 1.25, 'line-opacity': 0.75 },
    },
    // The peak: a blurred halo under a luminous fill with a bright edge.
    {
      id: 'interior-glow',
      type: 'line',
      source: SOURCE,
      filter: on('interior'),
      paint: { 'line-color': token('--map-interior-glow'), 'line-width': 14, 'line-blur': 10, 'line-opacity': 0 },
    },
    {
      id: 'interior-fill',
      type: 'fill',
      source: SOURCE,
      filter: on('interior'),
      paint: { 'fill-color': token('--map-interior-fill'), 'fill-opacity': 0 },
    },
    {
      id: 'cells',
      type: 'line',
      source: SOURCE,
      filter: on('cell'),
      paint: { 'line-color': token('--map-cell-line'), 'line-width': 1, 'line-opacity': 0, 'line-dasharray': [3, 2] },
    },
    {
      id: 'interior-edge',
      type: 'line',
      source: SOURCE,
      filter: on('interior'),
      paint: { 'line-color': token('--map-interior-line'), 'line-width': 1, 'line-opacity': 0 },
    },
  ]
}

/** Every fire at once, for one view of California: perimeters, and each fire's interior lit. */
function overviewLayers(token: (name: string) => string): LayerSpecification[] {
  const on = (layer: string): FilterSpecification => ['==', ['get', 'layer'], layer]
  const hidden = { visibility: 'none' as const }
  return [
    {
      id: 'sw-state',
      type: 'line',
      source: OVERVIEW,
      filter: on('state'),
      layout: hidden,
      paint: { 'line-color': token('--map-cell-line'), 'line-width': 1, 'line-opacity': 0.7 },
    },
    // A faint fill under each perimeter, so a click anywhere inside a fire opens it.
    {
      id: 'sw-hit',
      type: 'fill',
      source: OVERVIEW,
      filter: on('perimeter'),
      layout: hidden,
      paint: { 'fill-color': token('--map-burn-fill'), 'fill-opacity': 0.25 },
    },
    {
      id: 'sw-perimeter',
      type: 'line',
      source: OVERVIEW,
      filter: on('perimeter'),
      layout: hidden,
      paint: { 'line-color': token('--map-perimeter-line'), 'line-width': 0.75, 'line-opacity': 0.6 },
    },
    {
      id: 'sw-interior',
      type: 'fill',
      source: OVERVIEW,
      filter: on('interior'),
      layout: hidden,
      paint: { 'fill-color': token('--map-interior-fill'), 'fill-opacity': 0.9 },
    },
    {
      id: 'sw-interior-edge',
      type: 'line',
      source: OVERVIEW,
      filter: on('interior'),
      layout: hidden,
      paint: { 'line-color': token('--map-interior-line'), 'line-width': 0.75, 'line-opacity': 0.8 },
    },
    // One glow per fire, its area proportional to the fire's seed-limited acres. At state scale the
    // interiors are specks; the markers carry the picture, and fade out as the view zooms in.
    {
      id: 'sw-marker',
      type: 'circle',
      source: OVERVIEW,
      filter: on('marker'),
      layout: hidden,
      paint: {
        'circle-color': token('--map-interior-fill'),
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'interior_acres']], 0, 1.5, 120, 16],
        'circle-blur': 0.35,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.85, 8.5, 0],
        'circle-stroke-color': token('--map-interior-line'),
        'circle-stroke-width': 0.5,
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 8.5, 0],
      },
    },
  ]
}

/** Set the peak layers to `level` (0 hidden, 1 full) over `ms` milliseconds. */
function setPeak(map: MapLibreMap, level: 0 | 1, ms: number) {
  for (const [id, prop, full] of PEAK) {
    map.setPaintProperty(id, `${prop}-transition`, { duration: ms, delay: 0 })
    map.setPaintProperty(id, prop, full * level)
  }
}

/** Bounds of the state outline, else the perimeter features, else everything. */
function boundsOf(fc: GeoJSON.FeatureCollection): LngLatBounds | null {
  const bounds = new LngLatBounds()
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number') bounds.extend([c[0], c[1] as number])
    else c.forEach(walk)
  }
  const state = fc.features.filter((f) => f.properties?.layer === 'state')
  const perimeter = fc.features.filter((f) => f.properties?.layer === 'perimeter')
  for (const f of state.length ? state : perimeter.length ? perimeter : fc.features) {
    if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates)
  }
  return bounds.isEmpty() ? null : bounds
}

const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`

/** Below either size the full legend would cover the fire. */
const COMPACT_WIDTH = 760
const COMPACT_HEIGHT = 520

export default function BurnMap(props: {
  geojson: GeoJSON.FeatureCollection | null
  planting: FireRecord['planting'] | null
  fireName: string
  /** Every fire at once (reference/statewide.geojson); shown instead of the fire while `showOverview`. */
  overview?: GeoJSON.FeatureCollection | null
  showOverview?: boolean
  onPickFire?: (id: string) => void
}): JSX.Element {
  const { geojson, planting, fireName, overview = null, showOverview = false, onPickFire } = props
  const inOverview = showOverview && !!overview
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  // Compact: the map pane is too small for the fire to sit beside the full legend, so the legend becomes
  // a strip along the bottom and the fire is fitted above it instead of underneath it.
  const [compact, setCompact] = useState(false)
  // The canvas's own size. MapLibre only tracks window resizes, so a container that settles after the map
  // was created (the stacked phone layout) left the fire fitted to a stale size and drawn off-screen.
  const [box, setBox] = useState('')

  useEffect(() => {
    const root = rootRef.current!
    const canvas = canvasRef.current!
    const measure = () => {
      setCompact(root.clientWidth < COMPACT_WIDTH || root.clientHeight < COMPACT_HEIGHT)
      setBox(`${canvas.clientWidth}x${canvas.clientHeight}`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(canvas)
    measure()
    return () => observer.disconnect()
  }, [])

  // Create the map once. The style is a single background layer: no tiles, no network.
  useEffect(() => {
    const el = canvasRef.current!
    const css = getComputedStyle(el)
    const token = (name: string) => css.getPropertyValue(name).trim()
    const m = new MapLibreMap({
      container: el,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'canvas', type: 'background', paint: { 'background-color': token('--map-canvas') } }],
        transition: { duration: 0, delay: 0 }, // nothing animates except the interior reveal
      },
      center: [-119.5, 37.5],
      zoom: 5,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    })
    m.touchZoomRotate.disableRotation()
    if (import.meta.env.DEV) (window as unknown as { __bushelMap?: MapLibreMap }).__bushelMap = m
    m.on('error', (e) => console.error('map error:', e.error?.message ?? e))
    m.on('load', () => {
      m.addSource(SOURCE, { type: 'geojson', data: EMPTY })
      for (const layer of mapLayers(token)) m.addLayer(layer)
      m.addSource(OVERVIEW, { type: 'geojson', data: EMPTY })
      for (const layer of overviewLayers(token)) m.addLayer(layer)
      setMap(m)
    })
    return () => {
      setMap(null)
      m.remove()
    }
  }, [])

  // The overview: every fire at once. Its layers replace the fire's while it is shown.
  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>(OVERVIEW)?.setData(overview ?? EMPTY)
    for (const id of OVERVIEW_LAYERS) map.setLayoutProperty(id, 'visibility', inOverview ? 'visible' : 'none')
    for (const id of FIRE_LAYERS) map.setLayoutProperty(id, 'visibility', inOverview ? 'none' : 'visible')
    rootRef.current!.dataset.view = inOverview ? 'overview' : 'fire'
  }, [map, overview, inOverview])

  // In the overview, a click inside a fire opens it.
  useEffect(() => {
    if (!map || !onPickFire) return
    const pick = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const id = e.features?.[0]?.properties?.id
      if (typeof id === 'string') onPickFire(id)
    }
    const pointer = () => (map.getCanvas().style.cursor = 'pointer')
    const plain = () => (map.getCanvas().style.cursor = '')
    map.on('click', 'sw-hit', pick)
    map.on('mouseenter', 'sw-hit', pointer)
    map.on('mouseleave', 'sw-hit', plain)
    return () => {
      map.off('click', 'sw-hit', pick)
      map.off('mouseenter', 'sw-hit', pointer)
      map.off('mouseleave', 'sw-hit', plain)
    }
  }, [map, onPickFire])

  // Fit the fire clear of the legend: beside it when there is room, above the bottom strip when compact.
  useEffect(() => {
    const root = rootRef.current
    const target = inOverview ? overview : geojson
    const bounds = target && boundsOf(target)
    if (!map || !root || !bounds) return
    map.resize()
    const legend = legendRef.current
    const stacked = legend ? getComputedStyle(legend).position === 'static' : false
    const padding = { top: 40, right: 40, bottom: 40, left: 40 }
    if (legend && !stacked && compact) padding.bottom = legend.offsetHeight + 32
    else if (legend && !stacked) {
      const beside = legend.offsetWidth + 64
      if (root.clientWidth - beside >= 360) padding.left = beside
    }
    map.fitBounds(bounds, { padding, duration: 0 })
  }, [map, geojson, overview, inOverview, compact, box])

  // Draw the selected fire: the rest of the burn first, then the interior rises once the map is idle.
  useEffect(() => {
    const root = rootRef.current
    if (!map || !root) return
    map.getSource<GeoJSONSource>(SOURCE)?.setData(geojson ?? EMPTY)
    setPeak(map, 0, 0)

    const hasInterior = !!geojson?.features.some((f) => f.properties?.layer === 'interior')
    root.dataset.peak = hasInterior ? 'drawing' : 'none'
    if (!hasInterior) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const token = getComputedStyle(root).getPropertyValue('--duration-reveal').trim()
    const ms = reduce ? 0 : (parseFloat(token) || 1.2) * (token.endsWith('ms') ? 1 : 1000)
    let timer = 0
    const reveal = () => {
      setPeak(map, 1, ms)
      timer = window.setTimeout(() => (root.dataset.peak = 'revealed'), ms)
    }
    map.once('idle', reveal)
    return () => {
      map.off('idle', reveal)
      window.clearTimeout(timer)
    }
  }, [map, geojson])

  const fraction = planting && Number.isFinite(planting.interior_fraction) ? planting.interior_fraction : null

  return (
    <div className="burn-map" ref={rootRef} data-peak="none" data-compact={compact}>
      <div className="burn-map__canvas" ref={canvasRef} />

      <div className="burn-map__legend" ref={legendRef}>
        {inOverview ? (
          <h2 className="burn-map__name">California, 2018–2023</h2>
        ) : (
          fireName && <h2 className="burn-map__name">{fireName}</h2>
        )}

        <ul className="burn-map__keys" aria-label="Map legend">
          <li>
            <span className="burn-map__swatch burn-map__swatch--interior" aria-hidden="true" />
            <span>
              Seed-limited interior
              <span className="burn-map__sub">more than 90 m inside high-severity burn</span>
            </span>
          </li>
          {!inOverview && (
            <>
              <li>
                <span className="burn-map__swatch burn-map__swatch--severity" aria-hidden="true" />
                Rest of high-severity burn
              </li>
              <li>
                <span className="burn-map__swatch burn-map__swatch--retained" aria-hidden="true" />
                Retained non-federal (State Responsibility Area)
              </li>
            </>
          )}
          <li>
            <span className="burn-map__swatch burn-map__swatch--perimeter" aria-hidden="true" />
            Fire perimeter
          </li>
          {!inOverview && (
            <li>
              <span className="burn-map__swatch burn-map__swatch--cell" aria-hidden="true" />
              Seed zone × elevation band cell
            </li>
          )}
        </ul>

        <div className="burn-map__method">
          <p className="caps">Seed-limited interior threshold</p>
          <p className="burn-map__threshold">{THRESHOLD_STATEMENT}</p>
        </div>

        {inOverview ? (
          <p className="burn-map__fraction burn-map__sub" role="status">
            {new Set(overview!.features.map((f) => f.properties?.id).filter(Boolean)).size} fires, each one's seed-limited interior
            lit. Select a fire to open its order.
          </p>
        ) : planting ? (
          <p className="burn-map__fraction">
            <span>
              Computed interior: {fraction === null ? '—' : pct(fraction)} of high-severity conifer acres on
              non-federal land
            </span>
            <span className="burn-map__sub">
              Baker reference {pct(planting.baker_reference_fraction)} (cross-check, not a multiplier)
            </span>
          </p>
        ) : (
          <p className="burn-map__fraction burn-map__sub" role="status">
            {geojson
              ? 'No seed-limited interior on this fire. The finding is stated with the order.'
              : 'Select a fire to draw its perimeter and seed-limited interior.'}
          </p>
        )}
      </div>
    </div>
  )
}
