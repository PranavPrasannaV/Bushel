// A live build of any fire in the lower 48, in the browser, from national services at the moment it is
// asked for. It follows the California pipeline step for step (whose land, how badly it burned, the
// seed-limited interior, seed zone × 500 ft band cells, species by basal area) and returns the same fire
// record, so the order, its assumptions and its lines are computed by the same code.
//
// What differs from California, and is stated wherever a live build is shown:
//   whose land      non-federal land (PAD-US), not CAL FIRE's State Responsibility Area
//   species         USFS Individual Tree Species basal area, not LEMMA
//   conifer forest  FIA BIGMAP softwood forest type groups (pinyon–juniper excluded)
//   seed zones      the provisional national seed zones, not a state's own map
//   checked         against no published figure yet
import type { Cell, FireRecord } from '../convert/types.ts'
import { distanceTransform } from './edt.ts'
import { makeGrid, rasterize, toLonLat, type Grid, type Polygon } from './raster.ts'
import { firePerimeter, queryPolygons, SERVICES, type NationalFire, type SourceKey } from './api.ts'
import { exportImage } from './sources.ts'

export const THRESHOLD_M = 90
const HIGH = 4
const ACRE_M2 = 4046.8564224
const FT_PER_M = 3.28084
const BAND_FT = 500
// Softwood forest type groups (FIA 100–399), less pinyon–juniper woodland (180), which is not replanted
// from nursery seed.
const isConiferGroup = (g: number) => g >= 100 && g < 400 && g !== 180

/** Conifers the species layer is asked for: western species west of the 100th meridian, eastern ones east. */
const WEST = [
  'ponderosa_pine', 'Jeffrey_pine', 'sugar_pine', 'Douglas_fir', 'white_fir', 'grand_fir', 'California_red_fir',
  'Shasta_red_fir', 'noble_fir', 'Pacific_silver_fir', 'subalpine_fir', 'corkbark_fir', 'Engelmann_spruce',
  'blue_spruce', 'Sitka_spruce', 'lodgepole_pine', 'western_white_pine', 'whitebark_pine', 'limber_pine',
  'western_larch', 'incense_cedar', 'western_redcedar', 'Port_Orford_cedar', 'western_hemlock', 'mountain_hemlock',
  'giant_sequoia', 'redwood', 'knobcone_pine', 'Coulter_pine', 'bigcone_Douglas_fir', 'southwestern_white_pine',
]
const EAST = [
  'eastern_white_pine', 'red_pine', 'jack_pine', 'loblolly_pine', 'shortleaf_pine', 'longleaf_pine', 'slash_pine',
  'pitch_pine', 'Virginia_pine', 'pond_pine', 'sand_pine', 'spruce_pine', 'Table_Mountain_pine', 'balsam_fir',
  'Fraser_fir', 'red_spruce', 'white_spruce', 'black_spruce', 'eastern_hemlock', 'Carolina_hemlock',
  'northern_white_cedar', 'Atlantic_white_cedar', 'eastern_redcedar',
]

/** The names CAL FIRE's seed tables use, where a species is in them; anything else is named plainly. */
const TABLE_NAMES: Record<string, string> = {
  ponderosa_pine: 'Ponderosa Pine',
  Jeffrey_pine: 'Jeffrey Pine',
  sugar_pine: 'Sugar Pine',
  Douglas_fir: 'Douglas Fir',
  white_fir: 'White Fir',
  California_red_fir: 'Red Fir',
  Shasta_red_fir: 'Red Fir',
  subalpine_fir: 'Subalpine Fir',
  lodgepole_pine: 'Lodgepole Pine',
  western_white_pine: 'Western White Pine',
  incense_cedar: 'Incense Cedar',
  giant_sequoia: 'Giant Sequoia',
  redwood: 'Coast Redwood',
  knobcone_pine: 'Knobcone Pine',
  Coulter_pine: 'Coulter Pine',
  bigcone_Douglas_fir: 'Big-Cone Douglas Fir',
}
const speciesName = (v: string) =>
  TABLE_NAMES[v] ??
  v
    .split('_')
    .map((w) => (w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')

/** Forest type groups named for one species stand in for it where the species layer has no basal area. */
const GROUP_SPECIES: Record<number, string> = {
  200: 'Douglas Fir',
  220: 'Ponderosa Pine',
  240: 'Western White Pine',
  280: 'Lodgepole Pine',
  320: 'Western Larch',
  340: 'Coast Redwood',
}

/** Otherwise the pixel keeps its forest type group, which no seed table lists (a disclosed gap). */
const GROUP_NAMES: Record<number, string> = {
  100: 'White/red/jack pine group', 120: 'Spruce/fir group', 140: 'Longleaf/slash pine group',
  160: 'Loblolly/shortleaf pine group', 170: 'Other eastern softwoods', 200: 'Douglas-fir group',
  220: 'Ponderosa pine group', 240: 'Western white pine group', 260: 'Fir/spruce/mountain hemlock group',
  280: 'Lodgepole pine group', 300: 'Hemlock/Sitka spruce group', 320: 'Western larch group', 340: 'Redwood group',
  360: 'Other western softwoods', 370: 'California mixed conifer group', 380: 'Exotic softwoods', 390: 'Other softwoods',
}

export interface Step {
  key: SourceKey | 'compute'
  label: string
  source: string
  url: string
  status: 'waiting' | 'running' | 'done' | 'failed'
  ms?: number
  note?: string
}

export interface NationalBuild {
  fire: NationalFire
  record: FireRecord
  /** The perimeter, as a map layer. */
  geojson: GeoJSON.FeatureCollection
  /** Per cell: 0 outside, 1 retained burn, 2 rest of high severity, 3 seed-limited interior. */
  classes: { data: Uint8Array; width: number; height: number; coordinates: [number, number][] }
  groundRes: number
  steps: Step[]
  builtAt: string
}

export class NationalBuildError extends Error {}

export function initialSteps(): Step[] {
  const s = (key: SourceKey): Step => ({
    key,
    label: SERVICES[key].label,
    source: SERVICES[key].source,
    url: SERVICES[key].url,
    status: 'waiting',
  })
  return [
    s('perimeters'),
    s('severity'),
    s('ownership'),
    s('forestType'),
    s('elevation'),
    s('seedZones'),
    { key: 'compute', label: 'Seed-limited interior', source: 'In this browser: exact distance transform, 90 m from any tree that survived', url: '', status: 'waiting' },
    s('species'),
  ]
}

/** Build one MTBS fire. `onStep` receives the steps each time one changes. */
export async function buildNational(
  id: string,
  onStep: (steps: Step[]) => void,
  signal?: AbortSignal,
): Promise<NationalBuild> {
  const steps = initialSteps()
  const set = (key: Step['key'], patch: Partial<Step>) => {
    const i = steps.findIndex((s) => s.key === key)
    steps[i] = { ...steps[i], ...patch }
    onStep(steps.map((s) => ({ ...s })))
  }
  async function step<T>(key: Step['key'], work: () => Promise<T>): Promise<T> {
    const t0 = performance.now()
    set(key, { status: 'running' })
    try {
      const out = await work()
      set(key, { status: 'done', ms: Math.round(performance.now() - t0) })
      return out
    } catch (err) {
      set(key, { status: 'failed', note: err instanceof Error ? err.message : String(err) })
      throw err
    }
  }

  const { fire, polygon, bbox } = await step('perimeters', () => firePerimeter(id, signal))
  const grid = makeGrid(bbox)
  const n = grid.width * grid.height
  const pxAcres = (grid.groundRes * grid.groundRes) / ACRE_M2
  const perimeter = rasterize([polygon], grid)

  const [severity, federal, forest, dem, zones] = await Promise.all([
    step('severity', () =>
      exportImage(SERVICES.severity.url, grid, 'U8', { mosaicMethod: 'esriMosaicAttribute', where: `Year=${fire.year}`, sortField: 'Year' }, signal),
    ),
    step('ownership', async () => {
      const fed = await queryPolygons(SERVICES.ownership.url, grid, "Mang_Type='FED'", 'Mang_Type,Mang_Name', signal)
      return rasterize(
        fed.map((f) => f.polygon),
        grid,
      )
    }),
    step('forestType', () => exportImage(SERVICES.forestType.url, grid, 'U16', undefined, signal)),
    // Elevation on a 90 m grid: 500 ft bands need no finer, and resampling the 1 m source to 30 m over a
    // large fire is slow enough for the service to give up.
    step('elevation', () => exportImage(SERVICES.elevation.url, coarsen(grid, 3), 'F32', undefined, signal)),
    step('seedZones', async () => {
      const found = await queryPolygons(SERVICES.seedZones.url, grid, '1=1', 'seed_zone,LIII_Name', signal)
      const labels = rasterizeZones(found.map((f) => f.polygon), grid)
      return { labels, names: found.map((f) => zoneName(f.attributes)) }
    }),
  ])

  // How badly it burned: MTBS severity on all land inside the perimeter. No mapped burn means MTBS has not
  // published this fire's severity (the newest fires), which is said plainly rather than read as unburned.
  let assessed = 0
  const hsAll = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!perimeter[i]) continue
    if (severity[i] > 0) assessed++
    if (severity[i] === HIGH) hsAll[i] = 1
  }
  if (assessed === 0) {
    set('severity', { status: 'failed', note: 'no severity mapped for this fire' })
    throw new NationalBuildError(
      `MTBS has not published burn severity for the ${fire.name} fire (${fire.year}) yet, so its interior cannot be measured.`,
    )
  }

  // Whose land: the order covers non-federal land, as CAL FIRE's assessment does (federal land is the
  // Forest Service's and other agencies' to replant).
  const retained = new Uint8Array(n)
  const conifer = new Uint8Array(n)
  let perimeterPx = 0
  let retainedPx = 0
  let coniferPx = 0
  let highPx = 0
  for (let i = 0; i < n; i++) {
    if (!perimeter[i]) continue
    perimeterPx++
    if (!federal[i]) {
      retained[i] = 1
      retainedPx++
    }
    if (isConiferGroup(forest[i])) conifer[i] = 1
    if (retained[i] && conifer[i]) {
      coniferPx++
      if (hsAll[i]) highPx++
    }
  }

  // The seed-limited interior: high-severity ground more than 90 m from any ground that did not burn
  // severely, on any land (a live edge on federal land still drops seed), kept where it is retained conifer.
  const t0 = performance.now()
  set('compute', { status: 'running' })
  const distance = distanceTransform(hsAll, grid.width, grid.height)
  const interior = new Uint8Array(n)
  let interiorPx = 0
  for (let i = 0; i < n; i++) {
    if (hsAll[i] && retained[i] && conifer[i] && distance[i] * grid.groundRes > THRESHOLD_M) {
      interior[i] = 1
      interiorPx++
    }
  }

  set('compute', { status: 'done', ms: Math.round(performance.now() - t0) })

  // Species, only where there is interior to plant: the conifer with the most basal area at each pixel.
  const pixels: number[] = []
  for (let i = 0; i < n; i++) if (interior[i]) pixels.push(i)
  const species = await step('species', () => dominantSpecies(pixels, grid, bbox, signal))

  // Cells: seed zone × 500 ft band, each pixel labelled by its own zone and its own elevation.
  const demGrid = coarsen(grid, 3)
  const cells = new Map<string, { zone: string; low: number; px: number; species: Map<string, number> }>()
  let unpartitioned = 0
  for (let k = 0; k < pixels.length; k++) {
    const i = pixels[k]
    const zone = zones.labels[i]
    const elev = dem[coarseIndex(i, grid, demGrid, 3)]
    if (zone === 0 || !Number.isFinite(elev) || elev < -500) {
      unpartitioned++
      continue
    }
    const low = Math.floor((elev * FT_PER_M) / BAND_FT) * BAND_FT
    const key = `${zone}_${low}`
    let c = cells.get(key)
    if (!c) cells.set(key, (c = { zone: zones.names[zone - 1], low, px: 0, species: new Map() }))
    c.px++
    const name = species[k] ?? GROUP_SPECIES[forest[i]] ?? GROUP_NAMES[forest[i]] ?? 'Unidentified conifer'
    c.species.set(name, (c.species.get(name) ?? 0) + 1)
  }
  const round = (px: number) => Math.round(px * pxAcres * 10000) / 10000
  const cellList: Cell[] = [...cells.entries()]
    .sort(([, a], [, b]) => a.zone.localeCompare(b.zone) || a.low - b.low)
    .map(([key, c]) => ({
      cell_id: key,
      seed_zone: c.zone,
      elevation_band: `${c.low}–${c.low + BAND_FT} ft`,
      planting_acres: round(c.px),
      species: [...c.species.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, px]) => ({ species: name, acres: round(px) })),
    }))

  const classes = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (interior[i]) classes[i] = 3
    else if (hsAll[i] && retained[i] && conifer[i]) classes[i] = 2
    else if (retained[i]) classes[i] = 1
  }

  const interiorAcres = round(interiorPx - unpartitioned)
  const record: FireRecord = {
    fire: {
      id: `us-${fire.id.toLowerCase()}`,
      name: fire.name,
      year: fire.year,
      discovery_date: fire.igDate,
      perimeter_source_date: new Date().toISOString().slice(0, 10),
      provisional: false,
    },
    retained: {
      perimeter_acres: round(perimeterPx),
      retained_acres: round(retainedPx),
      excluded_acres: round(perimeterPx - retainedPx),
      excluded_reason: 'Federal land (PAD-US)',
      high_severity_acres: round(highPx),
      conifer_acres: round(coniferPx),
    },
  }
  if (retainedPx === 0) {
    record.result = 'no_retained_area'
    record.message = 'Entire perimeter lies on federal land.'
  } else if (coniferPx === 0) {
    record.result = 'no_conifer'
    record.message = 'No conifer forest in the pre-fire forest type map.'
  } else if (interiorAcres <= 0) {
    record.result = 'no_interior'
    record.message = 'All burned acres lie within natural seeding distance. No planting order required.'
  } else {
    record.planting = {
      interior_acres: interiorAcres,
      threshold_m: THRESHOLD_M,
      threshold_source: 'Baker 2023, Climate 11(11):214',
      interior_fraction: highPx ? interiorAcres / round(highPx) : 0,
      baker_reference_fraction: 0.219,
      note: '21.9% is a cross-check on the computed fraction, never a multiplier',
    }
    record.cells = cellList
  }

  const [w, s, e, nn] = grid.bbox
  const ring = polygon.map((r) => r.map((p) => toLonLat(p)))
  return {
    fire,
    record,
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { layer: 'perimeter' }, geometry: { type: 'Polygon', coordinates: ring } }],
    },
    classes: {
      data: classes,
      width: grid.width,
      height: grid.height,
      coordinates: [toLonLat([w, nn]), toLonLat([e, nn]), toLonLat([e, s]), toLonLat([w, s])],
    },
    groundRes: grid.groundRes,
    steps,
    builtAt: new Date().toISOString(),
  }
}

/** The same extent at `f` times the cell size, for layers modelled or needed at a coarser scale. */
function coarsen(grid: Grid, f: number): Grid {
  const width = Math.ceil(grid.width / f)
  const height = Math.ceil(grid.height / f)
  const res = grid.res * f
  return {
    width,
    height,
    res,
    groundRes: grid.groundRes * f,
    bbox: [grid.bbox[0], grid.bbox[3] - height * res, grid.bbox[0] + width * res, grid.bbox[3]],
  }
}

/** The index into a grid coarsened by `f` of each fine pixel. */
const coarseIndex = (i: number, grid: Grid, coarse: Grid, f: number) =>
  Math.floor(Math.floor(i / grid.width) / f) * coarse.width + Math.floor((i % grid.width) / f)

/** Zone polygons as labels 1..n on the grid (0 = no zone). */
function rasterizeZones(polygons: Polygon[], grid: Grid): Uint8Array {
  const out = new Uint8Array(grid.width * grid.height)
  polygons.forEach((p, i) => rasterize([p], grid, Math.min(i + 1, 255), out))
  return out
}

/** "25–30 °F · aridity < 2 · Sierra Nevada": the provisional zone's winter minimum, aridity and ecoregion. */
function zoneName(a: Record<string, string | number | null>): string {
  const [tmin, ahm] = String(a.seed_zone ?? '').split(' / ')
  const t = (tmin ?? '').replace(' Deg. F.', ' °F').replace(' - ', '–')
  const h = (ahm ?? '').replace(' - ', '–')
  return [t, h && `aridity ${h}`, a.LIII_Name].filter(Boolean).join(' · ')
}

/**
 * The dominant conifer at each interior pixel, by basal area. The species layer is asked for on a grid
 * three times coarser (it is modelled at that scale), one species at a time, keeping a running maximum.
 */
async function dominantSpecies(
  pixels: number[],
  grid: Grid,
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<(string | undefined)[]> {
  if (!pixels.length) return []
  const coarse = coarsen(grid, 3)
  const at = pixels.map((i) => coarseIndex(i, grid, coarse, 3))
  const lon = toLonLat([(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2])[0]
  const list = lon < -100 ? WEST : EAST
  const best = new Float32Array(pixels.length)
  const who: (string | undefined)[] = new Array(pixels.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const v = list[next++]
      const band = await exportImage(
        SERVICES.species.url,
        coarse,
        'F32',
        { mosaicMethod: 'esriMosaicNone', where: `variable='${v}' AND year=2011` },
        signal,
      )
      for (let k = 0; k < at.length; k++) {
        const ba = band[at[k]]
        if (ba > best[k]) {
          best[k] = ba
          who[k] = speciesName(v)
        }
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return who
}
