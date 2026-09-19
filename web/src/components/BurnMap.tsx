/// <reference types="geojson" />
// Burn map (T052, T053). Draws a fire, a county or the state over faint USGS relief and water; the fire's
// own layers need no network, so it still draws if the relief tiles can't load.
// The seed-limited interior is the one luminous layer and the one animation on screen (SC-006).
// The threshold and Baker's reference are fixed. Nothing here changes them (FR-006).
import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
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

const USGS = 'https://basemap.nationalmap.gov/arcgis/rest/services'
const SOURCE = 'fire'
const OVERVIEW = 'statewide'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const FIRE_LAYERS = ['retained', 'high-severity', 'perimeter', 'interior-glow', 'interior-fill', 'cells', 'interior-edge']
const OVERVIEW_LAYERS = ['sw-state', 'sw-hit', 'sw-perimeter', 'sw-interior', 'sw-interior-edge', 'sw-marker', 'sw-fire']
const COUNTIES = 'counties'
const COUNTY_LAYERS = ['ct-fill', 'ct-line', 'ct-focus']
const STATES = 'states'
// The lower 48, with a margin: a state's map can be panned anywhere across the country, never off it.
const LOWER_48: [number, number, number, number] = [-127.5, 23, -65, 50.5]

// Layers that rise together as the one peak, and the opacity each reaches. They start at 0.
// Cells lie only inside the interior, so their divisions are drawn over it and rise with it.
const PEAK: [layer: string, prop: 'fill-opacity' | 'line-opacity', full: number][] = [
  ['interior-glow', 'line-opacity', 1],
  ['interior-fill', 'fill-opacity', 0.9],
  ['cells', 'line-opacity', 0.55],
  ['interior-edge', 'line-opacity', 0.5],
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
      paint: { 'line-color': token('--map-interior-line'), 'line-width': 0.75, 'line-opacity': 0 },
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
      paint: { 'line-color': token('--map-state-line'), 'line-width': 1, 'line-opacity': 0.8 },
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
    // Outside California nothing is built until it is asked for: one dot per fire, its area proportional to the
    // acres burned, in the burn's colour. The sprout green stays for ground that has been worked out.
    {
      id: 'sw-fire',
      type: 'circle',
      source: OVERVIEW,
      filter: on('fire-point'),
      layout: hidden,
      paint: {
        'circle-color': token('--map-high-severity-fill'),
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'acres']], 30, 2.5, 700, 15],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.7, 9, 0],
        'circle-stroke-color': token('--map-perimeter-line'),
        'circle-stroke-width': 0.75,
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.9, 9, 0],
      },
    },
  ]
}

/** Every state's outline: hairlines, the others washed back, and a hover tint on a state you can move to. */
function stateLayers(token: (name: string) => string): LayerSpecification[] {
  const hidden = { visibility: 'none' as const }
  return [
    {
      id: 'us-dim',
      type: 'fill',
      source: STATES,
      layout: hidden,
      paint: { 'fill-color': token('--map-canvas'), 'fill-opacity': 0.55 },
    },
    {
      id: 'us-fill',
      type: 'fill',
      source: STATES,
      layout: hidden,
      paint: {
        'fill-color': token('--map-county-hover'),
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.45, 0],
      },
    },
    {
      id: 'us-line',
      type: 'line',
      source: STATES,
      layout: hidden,
      paint: { 'line-color': token('--map-state-line'), 'line-width': 0.9, 'line-opacity': 0.65 },
    },
  ]
}

/** California's counties, under the overview's fires: a hover tint, hairlines, and the chosen county in ink. */
function countyLayers(token: (name: string) => string): LayerSpecification[] {
  const hidden = { visibility: 'none' as const }
  return [
    {
      id: 'ct-fill',
      type: 'fill',
      source: COUNTIES,
      layout: hidden,
      paint: {
        'fill-color': token('--map-county-hover'),
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, 0],
      },
    },
    {
      id: 'ct-line',
      type: 'line',
      source: COUNTIES,
      layout: hidden,
      paint: { 'line-color': token('--map-county-line'), 'line-width': 0.75 },
    },
    {
      id: 'ct-focus',
      type: 'line',
      source: COUNTIES,
      layout: hidden,
      filter: ['==', ['get', 'fips'], ''],
      paint: { 'line-color': token('--map-county-focus'), 'line-width': 2 },
    },
  ]
}

/** Set the peak layers to `level` (0 hidden, 1 full) over `ms` milliseconds. */
function setPeak(map: MapLibreMap, level: 0 | 1, ms: number) {
  for (const [id, prop, full] of PEAK) {
    map.setPaintProperty(id, `${prop}-transition`, { duration: ms, delay: 0 })
    map.setPaintProperty(id, prop, full * level)
  }
  // A live national build draws its interior as a raster; it rises the same way.
  if (map.getLayer(NATIONAL_INTERIOR)) {
    map.setPaintProperty(NATIONAL_INTERIOR, 'raster-opacity-transition', { duration: ms, delay: 0 })
    map.setPaintProperty(NATIONAL_INTERIOR, 'raster-opacity', level)
  }
}

/** A live build's classes (1 retained burn, 2 rest of high severity, 3 interior) as two PNGs. */
export interface ClassRaster {
  data: Uint8Array
  width: number
  height: number
  /** Top-left, top-right, bottom-right, bottom-left, as [lon, lat]. */
  coordinates: [number, number][]
}
const NATIONAL_BASE = 'nat-base'
const NATIONAL_INTERIOR = 'nat-interior'

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}

/** Paint the classes into a base image (burn, high severity) and an interior image, in the map's colours. */
function paintClasses(c: ClassRaster, token: (name: string) => string): { base: string; interior: string } {
  const burn = hexRgb(token('--map-burn-fill'))
  const high = hexRgb(token('--map-high-severity-fill'))
  const lit = hexRgb(token('--map-interior-fill'))
  const draw = (pick: (v: number) => [number, number, number, number] | null) => {
    const canvas = document.createElement('canvas')
    canvas.width = c.width
    canvas.height = c.height
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(c.width, c.height)
    for (let i = 0; i < c.data.length; i++) {
      const px = pick(c.data[i])
      if (!px) continue
      img.data.set(px, i * 4)
    }
    ctx.putImageData(img, 0, 0)
    return canvas.toDataURL('image/png')
  }
  return {
    base: draw((v) => (v === 1 ? [...burn, 115] : v === 2 || v === 3 ? [...high, 217] : null)),
    interior: draw((v) => (v === 3 ? [...lit, 235] : null)),
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
  /** California's counties, drawn under the overview; a click on one (off any fire) picks it. */
  counties?: GeoJSON.FeatureCollection | null
  focusCounty?: string | null
  onPickCounty?: (fips: string) => void
  /** Fit the overview to this box [west, south, east, north] instead of the whole state. */
  fitBox?: [number, number, number, number] | null
  /** A searched address, pinned on the overview. */
  pin?: [number, number] | null
  overviewTitle?: string
  /** A live national build, drawn as a raster under the perimeter. */
  classes?: ClassRaster | null
  /** A live build outside California: the order's scope is non-federal land, not the state's area. */
  national?: boolean
  /** Every state's outline, so the map sits in the country and another state is one click away. */
  states?: GeoJSON.FeatureCollection | null
  /** The state shown, by postal code: the rest are washed back. */
  focusState?: string | null
  onPickState?: (postal: string) => void
}): JSX.Element {
  const {
    geojson,
    planting,
    overview = null,
    showOverview = false,
    onPickFire,
    counties = null,
    focusCounty = null,
    onPickCounty,
    fitBox = null,
    pin = null,
    overviewTitle = 'California, 2018–2023',
    classes = null,
    national = false,
    states = null,
    focusState = null,
    onPickState,
  } = props
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

  // Create the map once. The ground is USGS shaded relief with rivers and lakes (public domain, keyless),
  // laid faintly over the sheet's survey grid, so a fire sits in its landscape. If the tiles can't load
  // the map still draws: the fire's own layers need no network.
  useEffect(() => {
    const el = canvasRef.current!
    const css = getComputedStyle(el)
    const token = (name: string) => css.getPropertyValue(name).trim()
    const m = new MapLibreMap({
      container: el,
      style: {
        version: 8,
        sources: {
          relief: {
            type: 'raster',
            tiles: [`${USGS}/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}`],
            tileSize: 256,
            maxzoom: 16,
          },
          water: {
            type: 'raster',
            tiles: [`${USGS}/USGSHydroCached/MapServer/tile/{z}/{y}/{x}`],
            tileSize: 256,
            maxzoom: 15,
          },
        },
        layers: [
          { id: 'canvas', type: 'background', paint: { 'background-color': 'rgba(0, 0, 0, 0)' } },
          {
            id: 'relief',
            type: 'raster',
            source: 'relief',
            paint: { 'raster-opacity': 0.32, 'raster-saturation': -1, 'raster-contrast': 0.1, 'raster-fade-duration': 0 },
          },
          {
            id: 'water',
            type: 'raster',
            source: 'water',
            paint: { 'raster-opacity': 0.55, 'raster-saturation': -0.55, 'raster-fade-duration': 0 },
          },
        ],
        transition: { duration: 0, delay: 0 }, // nothing animates except the interior reveal
      },
      center: [-119.5, 37.5],
      zoom: 5,
      attributionControl: false,
      // Never wider than the country: a view's own leash (below) holds it tighter still.
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    })
    m.touchZoomRotate.disableRotation()
    if (import.meta.env.DEV) (window as unknown as { __bushelMap?: MapLibreMap }).__bushelMap = m
    // A relief or water tile that fails is scenery missing, not an error worth reporting.
    m.on('error', (e) => {
      const source = (e as unknown as { sourceId?: string }).sourceId
      if (source === 'relief' || source === 'water') return
      console.error('map error:', e.error?.message ?? e)
    })
    // The fire's own layers go on as soon as the style is parsed. MapLibre's "load" waits for the first
    // tiles, so a network that blocks the relief would otherwise leave the fire undrawn.
    const init = () => {
      if (m.getSource(SOURCE)) return
      m.addSource(STATES, { type: 'geojson', data: EMPTY, promoteId: 'postal' })
      for (const layer of stateLayers(token)) m.addLayer(layer)
      m.addSource(SOURCE, { type: 'geojson', data: EMPTY })
      for (const layer of mapLayers(token)) m.addLayer(layer)
      m.addSource(COUNTIES, { type: 'geojson', data: EMPTY, promoteId: 'fips' })
      for (const layer of countyLayers(token)) m.addLayer(layer)
      m.addSource(OVERVIEW, { type: 'geojson', data: EMPTY })
      for (const layer of overviewLayers(token)) m.addLayer(layer)
      setMap(m)
    }
    m.once('style.load', init)
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

  // Counties under the overview, the chosen one in ink.
  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>(COUNTIES)?.setData(counties ?? EMPTY)
    const show = !!counties
    for (const id of COUNTY_LAYERS) map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none')
    map.setLayoutProperty('ct-fill', 'visibility', show && inOverview ? 'visible' : 'none')
    map.setFilter('ct-focus', ['==', ['get', 'fips'], focusCounty ?? ''])
  }, [map, counties, focusCounty, inOverview])

  // Hover tints a county; a click off any fire picks it.
  useEffect(() => {
    if (!map || !onPickCounty) return
    let hovered: string | number | undefined
    const clear = () => {
      if (hovered !== undefined) map.setFeatureState({ source: COUNTIES, id: hovered }, { hover: false })
      hovered = undefined
    }
    const move = (e: { features?: { id?: string | number }[] }) => {
      const id = e.features?.[0]?.id
      if (id === hovered) return
      clear()
      hovered = id
      if (id !== undefined) map.setFeatureState({ source: COUNTIES, id }, { hover: true })
      map.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      clear()
      map.getCanvas().style.cursor = ''
    }
    const pick = (e: { point: { x: number; y: number }; features?: { properties?: Record<string, unknown> }[] }) => {
      if (map.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['sw-hit'] }).length) return
      const fips = e.features?.[0]?.properties?.fips
      if (typeof fips === 'string') onPickCounty(fips)
    }
    map.on('mousemove', 'ct-fill', move)
    map.on('mouseleave', 'ct-fill', leave)
    map.on('click', 'ct-fill', pick)
    return () => {
      map.off('mousemove', 'ct-fill', move)
      map.off('mouseleave', 'ct-fill', leave)
      map.off('click', 'ct-fill', pick)
    }
  }, [map, onPickCounty])

  // Every state's outline; in an overview the others are washed back, and one click away.
  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>(STATES)?.setData(states ?? EMPTY)
    map.setLayoutProperty('us-line', 'visibility', states ? 'visible' : 'none')
    for (const id of ['us-dim', 'us-fill']) map.setLayoutProperty(id, 'visibility', states && inOverview ? 'visible' : 'none')
    map.setFilter('us-dim', ['!=', ['get', 'postal'], focusState ?? ''])
  }, [map, states, focusState, inOverview])

  // In an overview, another state tints under the pointer, and a click there (off any fire or county) opens it.
  useEffect(() => {
    if (!map || !onPickState || !inOverview) return
    let hovered: string | undefined
    const other = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const postal = e.features?.[0]?.properties?.postal
      return typeof postal === 'string' && postal !== focusState ? postal : undefined
    }
    const set = (postal: string | undefined) => {
      if (postal === hovered) return
      if (hovered) map.setFeatureState({ source: STATES, id: hovered }, { hover: false })
      hovered = postal
      if (postal) map.setFeatureState({ source: STATES, id: postal }, { hover: true })
      map.getCanvas().style.cursor = postal ? 'pointer' : ''
    }
    const move = (e: { features?: { properties?: Record<string, unknown> }[] }) => set(other(e))
    const leave = () => set(undefined)
    const pick = (e: { point: { x: number; y: number }; features?: { properties?: Record<string, unknown> }[] }) => {
      if (map.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['sw-hit', 'sw-fire', 'ct-fill'] }).length) return
      const postal = other(e)
      if (postal) onPickState(postal)
    }
    map.on('mousemove', 'us-fill', move)
    map.on('mouseleave', 'us-fill', leave)
    map.on('click', 'us-fill', pick)
    return () => {
      set(undefined)
      map.off('mousemove', 'us-fill', move)
      map.off('mouseleave', 'us-fill', leave)
      map.off('click', 'us-fill', pick)
    }
  }, [map, onPickState, inOverview, focusState])

  // A searched address, as a pin.
  useEffect(() => {
    if (!map || !pin || !inOverview) return
    const el = document.createElement('div')
    el.className = 'burn-map__pin'
    const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat(pin).addTo(map)
    return () => {
      marker.remove()
    }
  }, [map, pin, inOverview])

  // In the overview, a click inside a fire opens it.
  useEffect(() => {
    if (!map || !onPickFire) return
    const pick = (e: { features?: { properties?: Record<string, unknown> }[] }) => {
      const id = e.features?.[0]?.properties?.id
      if (typeof id === 'string') onPickFire(id)
    }
    const pointer = () => (map.getCanvas().style.cursor = 'pointer')
    const plain = () => (map.getCanvas().style.cursor = '')
    for (const id of ['sw-hit', 'sw-fire']) {
      map.on('click', id, pick)
      map.on('mouseenter', id, pointer)
      map.on('mouseleave', id, plain)
    }
    return () => {
      for (const id of ['sw-hit', 'sw-fire']) {
        map.off('click', id, pick)
        map.off('mouseenter', id, pointer)
        map.off('mouseleave', id, plain)
      }
    }
  }, [map, onPickFire])

  // Fit the fire into the part of the canvas nothing covers: clear of the title block and the slip set on the
  // map (siblings in the stage) and of the map key. Tall covers take a side, wide ones the top or bottom.
  useEffect(() => {
    const root = rootRef.current
    const target = inOverview ? overview : geojson
    const bounds =
      inOverview && fitBox
        ? new LngLatBounds([fitBox[0], fitBox[1]], [fitBox[2], fitBox[3]])
        : target && boundsOf(target)
    if (!map || !root || !bounds) return
    map.resize()
    const c = canvasRef.current!.getBoundingClientRect()
    const pad = { top: 40, right: 40, bottom: 40, left: 40 }
    const stage = root.closest('.stage')
    const covers = [...(stage?.querySelectorAll<HTMLElement>('.title-block, .slip-region') ?? []), legendRef.current]
    for (const el of covers) {
      if (!el) continue
      const r = el.getBoundingClientRect()
      const w = Math.min(r.right, c.right) - Math.max(r.left, c.left)
      const h = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)
      if (w <= 0 || h <= 0) continue
      if (h >= w * 0.9) {
        if (c.right - r.right < r.left - c.left) pad.right = Math.max(pad.right, c.right - r.left + 32)
        else pad.left = Math.max(pad.left, r.right - c.left + 32)
      } else if (r.top - c.top < c.bottom - r.bottom) {
        pad.top = Math.max(pad.top, r.bottom - c.top + 24)
      } else {
        pad.bottom = Math.max(pad.bottom, c.bottom - r.top + 24)
      }
    }
    // Never squeeze the fire into a sliver: if the covers leave too little room, it runs under the map key
    // first, then under the rest.
    if (c.width - pad.left - pad.right < 240) pad.left = pad.right = 24
    if (c.height - pad.top - pad.bottom < 220) pad.bottom = 24
    if (c.height - pad.top - pad.bottom < 180) pad.top = 24
    // The leash. A fire is locked to the frame it opens on: at that zoom it hardly moves; zoomed in, it pans
    // anywhere inside the frame, never out of it. A state or county map can travel the lower 48 and zoom out to
    // all of it, but never off the country into empty paper.
    map.setMaxBounds(null)
    map.setMinZoom(0)
    map.fitBounds(bounds, { padding: pad, duration: 0 })
    const view = map.getBounds()
    const dx = (view.getEast() - view.getWest()) * 0.04
    const dy = (view.getNorth() - view.getSouth()) * 0.04
    let [w, s, e, n] = [view.getWest() - dx, view.getSouth() - dy, view.getEast() + dx, view.getNorth() + dy]
    let minZoom = map.getZoom() - 0.1
    if (inOverview) {
      ;[w, s, e, n] = [Math.min(w, LOWER_48[0]), Math.min(s, LOWER_48[1]), Math.max(e, LOWER_48[2]), Math.max(n, LOWER_48[3])]
      const country = map.cameraForBounds([w, s, e, n], { padding: 0 })
      if (country?.zoom !== undefined) minZoom = Math.min(minZoom, country.zoom)
    }
    map.setMinZoom(Math.max(0, minZoom))
    map.setMaxBounds([
      [w, s],
      [e, n],
    ])
  }, [map, geojson, overview, inOverview, compact, box, fitBox])

  // A live national build: its classes as two image layers under the perimeter line.
  useEffect(() => {
    if (!map || !classes) return
    const token = (name: string) => getComputedStyle(canvasRef.current!).getPropertyValue(name).trim()
    const { base, interior } = paintClasses(classes, token)
    const coordinates = classes.coordinates as [[number, number], [number, number], [number, number], [number, number]]
    map.addSource(NATIONAL_BASE, { type: 'image', url: base, coordinates })
    map.addSource(NATIONAL_INTERIOR, { type: 'image', url: interior, coordinates })
    map.addLayer(
      { id: NATIONAL_BASE, type: 'raster', source: NATIONAL_BASE, paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } },
      'perimeter',
    )
    map.addLayer(
      {
        id: NATIONAL_INTERIOR,
        type: 'raster',
        source: NATIONAL_INTERIOR,
        paint: { 'raster-resampling': 'nearest', 'raster-opacity': 0, 'raster-fade-duration': 0 },
      },
      'perimeter',
    )
    return () => {
      for (const id of [NATIONAL_INTERIOR, NATIONAL_BASE]) {
        if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(id)) map.removeSource(id)
      }
    }
  }, [map, classes])

  // Draw the selected fire: the rest of the burn first, then the interior rises once the map is idle.
  useEffect(() => {
    const root = rootRef.current
    if (!map || !root) return
    map.getSource<GeoJSONSource>(SOURCE)?.setData(geojson ?? EMPTY)
    setPeak(map, 0, 0)

    const hasInterior =
      !!geojson?.features.some((f) => f.properties?.layer === 'interior') || !!classes?.data.includes(3)
    root.dataset.peak = hasInterior ? 'drawing' : 'none'
    if (!hasInterior) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const token = getComputedStyle(root).getPropertyValue('--duration-reveal').trim()
    const ms = reduce ? 0 : (parseFloat(token) || 1.2) * (token.endsWith('ms') ? 1 : 1000)
    // The interior rises as soon as the fire's own layers are drawn, without waiting for the relief tiles.
    let timer = 0
    let done = false
    const ready = () =>
      map.isSourceLoaded(SOURCE) && (!classes || (map.getSource(NATIONAL_INTERIOR) && map.isSourceLoaded(NATIONAL_INTERIOR)))
    const reveal = () => {
      if (done || !ready()) return
      done = true
      map.off('render', reveal)
      setPeak(map, 1, ms)
      timer = window.setTimeout(() => (root.dataset.peak = 'revealed'), ms)
    }
    map.on('render', reveal)
    map.triggerRepaint()
    return () => {
      map.off('render', reveal)
      window.clearTimeout(timer)
    }
  }, [map, geojson, classes])

  const fraction = planting && Number.isFinite(planting.interior_fraction) ? planting.interior_fraction : null

  return (
    <div className="burn-map" ref={rootRef} data-peak="none" data-compact={compact}>
      <div className="burn-map__canvas" ref={canvasRef} />

      <div className="burn-map__legend" ref={legendRef}>
        {/* The fire's own name is set on the map as the stage's title block; the overview has no fire. */}
        {inOverview && <h2 className="burn-map__name">{overviewTitle}</h2>}

        {/* Each key leads with what it means on the ground; the technical name sits under it (and in the
            tooltip, since the compact strip drops the sub-lines). */}
        <ul className="burn-map__keys" aria-label="Map legend">
          {inOverview && national ? (
            <li title="MTBS burned-area boundaries, largest first">
              <span className="burn-map__swatch burn-map__swatch--fire" aria-hidden="true" />
              <span>
                A fire, sized by the acres it burned
                <span className="burn-map__sub">Not worked out yet: select it to build its order live</span>
              </span>
            </li>
          ) : (
            <li title="Seed-limited interior: high-severity burn more than 90 m from ground that did not burn severely">
              <span className="burn-map__swatch burn-map__swatch--interior" aria-hidden="true" />
              <span>
                Too far from surviving trees to reseed
                <span className="burn-map__sub">Seed-limited interior: more than 90 m inside high-severity burn</span>
              </span>
            </li>
          )}
          {!inOverview && (
            <>
              <li title="Rest of high-severity burn: within 90 m of surviving trees">
                <span className="burn-map__swatch burn-map__swatch--severity" aria-hidden="true" />
                <span>
                  Burned badly, but near enough to reseed
                  <span className="burn-map__sub">Rest of high-severity burn</span>
                </span>
              </li>
              <li title={national ? 'Land not managed by a federal agency (PAD-US)' : "Non-federal land in CAL FIRE's State Responsibility Area"}>
                <span className="burn-map__swatch burn-map__swatch--retained" aria-hidden="true" />
                <span>
                  {national ? 'Non-federal land' : 'Land the state is responsible for'}
                  <span className="burn-map__sub">
                    {national ? "Not federal in PAD-US: the order's scope" : "Non-federal, State Responsibility Area: the order's scope"}
                  </span>
                </span>
              </li>
            </>
          )}
          <li>
            <span className="burn-map__swatch burn-map__swatch--perimeter" aria-hidden="true" />
            Fire perimeter
          </li>
          {!inOverview && (
            <li title="Seed zone × 500 ft elevation band: seed must come from the same zone and band">
              <span className="burn-map__swatch burn-map__swatch--cell" aria-hidden="true" />
              <span>
                Each patch needs its own local seed
                <span className="burn-map__sub">Seed zone × 500 ft elevation band</span>
              </span>
            </li>
          )}
        </ul>

        <div className="burn-map__method">
          <p className="caps">Seed-limited interior threshold</p>
          <p className="burn-map__threshold">{THRESHOLD_STATEMENT}</p>
        </div>

        {inOverview && national ? (
          <p className="burn-map__fraction burn-map__sub" role="status">
            The {overview!.features.filter((f) => f.properties?.layer === 'fire-point').length} largest fires MTBS has
            mapped here. Select one to build its order live{onPickState ? ', or another state to move there' : ''}.
          </p>
        ) : inOverview ? (
          <p className="burn-map__fraction burn-map__sub" role="status">
            {new Set(overview!.features.map((f) => f.properties?.id).filter(Boolean)).size} fires, each one&rsquo;s
            seed-limited interior lit. Select a fire to open its order{counties ? ', or a county to see its fires' : ''}
            {onPickState ? ', or another state to move there' : ''}.
          </p>
        ) : planting ? (
          <p className="burn-map__fraction">
            <span>
              {fraction === null ? '—' : pct(fraction)} of the badly burned conifer forest {national ? 'on non-federal land' : 'the state is responsible for'}{' '}
              can't reseed itself
            </span>
            {fraction !== null && (
              // The same split as a bar: lit interior against the rest of the badly burned forest.
              <span
                className="burn-map__share"
                style={{ '--share': Math.min(1, Math.max(0, fraction)) } as CSSProperties}
                aria-hidden="true"
              />
            )}
            <span className="burn-map__sub">
              Computed interior {fraction === null ? '—' : pct(fraction)} of high-severity conifer acres on
              non-federal land. Published estimate: Baker {pct(planting.baker_reference_fraction)} (cross-check, not
              a multiplier)
            </span>
          </p>
        ) : (
          <p className="burn-map__fraction burn-map__sub" role="status">
            {geojson
              ? 'No seed-limited interior on this fire. The finding is stated with the order.'
              : 'Select a fire to draw its perimeter and seed-limited interior.'}
          </p>
        )}
        <p className="burn-map__credit">Relief and water: USGS The National Map</p>
      </div>
    </div>
  )
}
