/// <reference types="geojson" />
// The national services a live build reads, all public, keyless and open to browsers (CORS), each asked
// for exactly one fire's extent at the moment of the build. Nothing here is bundled with the site.
// This module is light (no raster decoding), so the search can use it from the main bundle.
import type { Grid, Polygon, Ring } from './raster.ts'

export const SERVICES = {
  perimeters: {
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MTBS_01/MapServer/63',
    label: 'Fire perimeter',
    source: 'MTBS burned-area boundaries (USFS/USGS), 1984 onward',
  },
  severity: {
    url: 'https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation/USFS_EDW_MTBS_CONUS/ImageServer',
    label: 'Burn severity',
    source: 'MTBS thematic burn severity, class 4 = high (USFS/USGS)',
  },
  elevation: {
    url: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer',
    label: 'Elevation',
    source: 'USGS 3D Elevation Program (3DEP)',
  },
  forestType: {
    url: 'https://imagery.geoplatform.gov/iipp/rest/services/Vegetation/USFS_FIA_BIGMAP_CONUS_ForestTypeGroup_2018/ImageServer',
    label: 'Forest type',
    source: 'USFS FIA BIGMAP forest type groups, 2018, 30 m',
  },
  species: {
    url: 'https://imagery.geoplatform.gov/iipp/rest/services/Vegetation/USFS_EDW_FHP_TreeSpeciesMetrics_BasalArea/ImageServer',
    label: 'Tree species',
    source: 'USFS Individual Tree Species basal area (Forest Health Protection), 2011',
  },
  seedZones: {
    url: 'https://services1.arcgis.com/gGHDlz6USftL5Pau/arcgis/rest/services/Provisional_Seed_Zones/FeatureServer/2',
    label: 'Seed zones',
    source: 'Provisional seed zones for the US (Bower, St. Clair & Erickson 2014)',
  },
  ownership: {
    url: 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Type_PADUS/FeatureServer/0',
    label: 'Federal land',
    source: 'PAD-US manager type (USGS Protected Areas Database)',
  },
} as const

export type SourceKey = keyof typeof SERVICES

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** GET with retries: public map servers drop the odd request under load. */
export async function get(url: string, signal?: AbortSignal, tries = 3): Promise<Response> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal })
      if (res.ok) return res
      last = new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (signal?.aborted) throw err
      last = err
    }
    await new Promise((r) => setTimeout(r, 800 * 2 ** i))
  }
  throw new Error(`${new URL(url).host} did not answer (${message(last)})`)
}

export const qs = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

export async function getJson<T>(url: string, params: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
  const res = await get(`${url}?${qs({ ...params, f: 'json' })}`, signal)
  const body = await res.json()
  if (body?.error) throw new Error(`${new URL(url).host}: ${body.error.message ?? 'error'}`)
  return body as T
}

export interface EsriFeature {
  attributes: Record<string, string | number | null>
  geometry?: { rings?: Ring[] }
}

/** Polygons from a feature layer that intersect the grid, in 3857, generalised to half a cell. */
export async function queryPolygons(
  url: string,
  grid: Grid,
  where: string,
  outFields: string,
  signal?: AbortSignal,
): Promise<{ attributes: EsriFeature['attributes']; polygon: Polygon }[]> {
  const out: { attributes: EsriFeature['attributes']; polygon: Polygon }[] = []
  for (let offset = 0; ; ) {
    const page = await getJson<{ features: EsriFeature[]; exceededTransferLimit?: boolean }>(
      `${url}/query`,
      {
        where,
        geometry: grid.bbox.join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: 3857,
        outSR: 3857,
        spatialRel: 'esriSpatialRelIntersects',
        outFields,
        returnGeometry: 'true',
        geometryPrecision: 0,
        maxAllowableOffset: Math.round(grid.res / 2),
        resultOffset: offset,
      },
      signal,
    )
    for (const f of page.features) if (f.geometry?.rings?.length) out.push({ attributes: f.attributes, polygon: f.geometry.rings })
    if (!page.exceededTransferLimit || !page.features.length) break
    offset += page.features.length
  }
  return out
}

// ---- Finding a fire ------------------------------------------------------------------------------

export interface NationalFire {
  id: string
  name: string
  year: number
  acres: number
  state: string
  igDate: string
}

const FIELDS = 'fire_id,fire_name,year,acres,ig_date,fire_type'

function toFire(a: EsriFeature['attributes']): NationalFire {
  const ig = String(a.ig_date ?? '')
  const name = String(a.fire_name ?? 'Unnamed')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
  return {
    id: String(a.fire_id),
    name,
    year: Number(a.year),
    acres: Number(a.acres),
    state: String(a.fire_id).slice(0, 2),
    igDate: ig.length === 8 ? `${ig.slice(0, 4)}-${ig.slice(4, 6)}-${ig.slice(6)}` : '',
  }
}

// Wildfires in the lower 48 (the severity mosaic is CONUS-only), large enough to matter for replanting.
const WILDFIRES = "fire_type='Wildfire' AND fire_id NOT LIKE 'AK%' AND fire_id NOT LIKE 'HI%' AND fire_id NOT LIKE 'PR%'"

/** Fires whose name contains `query` (and a year, if one is typed), largest first. */
export async function searchFires(query: string, signal?: AbortSignal): Promise<NationalFire[]> {
  const year = query.match(/\b(19[89]\d|20[0-3]\d)\b/)?.[1]
  const words = query
    .replace(/\b(19[89]\d|20[0-3]\d)\b/, '')
    .replace(/\bfire\b/gi, '')
    .trim()
    .toUpperCase()
    .replace(/'/g, "''")
  if (words.length < 3) return []
  const where = `${WILDFIRES} AND UPPER(fire_name) LIKE '%${words}%'${year ? ` AND year=${year}` : ''}`
  const body = await getJson<{ features: EsriFeature[] }>(
    `${SERVICES.perimeters.url}/query`,
    { where, outFields: FIELDS, returnGeometry: 'false', orderByFields: 'acres DESC', resultRecordCount: 8 },
    signal,
  )
  return body.features.map((f) => toFire(f.attributes))
}

/** Esri rings as GeoJSON: an outer ring runs clockwise and starts a polygon; the holes after it run the other way. */
export function esriPolygon(rings: Ring[]): GeoJSON.MultiPolygon {
  const polygons: Ring[][] = []
  for (const ring of rings) {
    let twice = 0
    for (let i = 0; i < ring.length - 1; i++) twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    if (twice <= 0 || !polygons.length) polygons.push([ring])
    else polygons[polygons.length - 1].push(ring)
  }
  return { type: 'MultiPolygon', coordinates: polygons }
}

/** The first year a state's map lists fires from. */
export const STATE_SINCE = 2015

/**
 * A state's largest wildfires since STATE_SINCE, with their perimeters in lon/lat, simplified to ~400 m for a
 * state-wide map: each as a perimeter feature and a point at its centre, both carrying the fire's id.
 */
export async function stateFires(
  postal: string,
  signal?: AbortSignal,
): Promise<{ fires: NationalFire[]; features: GeoJSON.Feature[] }> {
  const body = await getJson<{ features: EsriFeature[] }>(
    `${SERVICES.perimeters.url}/query`,
    {
      where: `${WILDFIRES} AND fire_id LIKE '${postal.replace(/[^A-Z]/g, '')}%' AND year>=${STATE_SINCE} AND acres>=1000`,
      outFields: FIELDS,
      returnGeometry: 'true',
      outSR: 4326,
      maxAllowableOffset: 0.004,
      geometryPrecision: 4,
      orderByFields: 'acres DESC',
      resultRecordCount: 80,
    },
    signal,
  )
  const fires: NationalFire[] = []
  const features: GeoJSON.Feature[] = []
  for (const f of body.features) {
    const fire = toFire(f.attributes)
    fires.push(fire)
    const rings = f.geometry?.rings
    if (!rings?.length) continue
    const properties = { id: fire.id, name: fire.name, year: fire.year, acres: fire.acres }
    features.push({ type: 'Feature', properties: { ...properties, layer: 'perimeter' }, geometry: esriPolygon(rings) })
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of rings[0]) {
      w = Math.min(w, x)
      s = Math.min(s, y)
      e = Math.max(e, x)
      n = Math.max(n, y)
    }
    features.push({
      type: 'Feature',
      properties: { ...properties, layer: 'fire-point' },
      geometry: { type: 'Point', coordinates: [(w + e) / 2, (s + n) / 2] },
    })
  }
  return { fires, features }
}

/** Fires within ~`km` of a point, largest first. */
export async function firesAround(lon: number, lat: number, km = 40, signal?: AbortSignal): Promise<NationalFire[]> {
  const d = km / 111
  const body = await getJson<{ features: EsriFeature[] }>(
    `${SERVICES.perimeters.url}/query`,
    {
      where: `${WILDFIRES} AND year>=2000`,
      geometry: `${lon - d},${lat - d},${lon + d},${lat + d}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: 4326,
      outFields: FIELDS,
      returnGeometry: 'false',
      orderByFields: 'acres DESC',
      resultRecordCount: 6,
    },
    signal,
  )
  return body.features.map((f) => toFire(f.attributes))
}

/** One fire's attributes and its perimeter polygon in 3857. */
export async function firePerimeter(
  id: string,
  signal?: AbortSignal,
): Promise<{ fire: NationalFire; polygon: Polygon; bbox: [number, number, number, number] }> {
  const body = await getJson<{ features: EsriFeature[] }>(
    `${SERVICES.perimeters.url}/query`,
    { where: `fire_id='${id.replace(/[^A-Za-z0-9]/g, '')}'`, outFields: FIELDS, returnGeometry: 'true', outSR: 3857, geometryPrecision: 0 },
    signal,
  )
  const f = body.features.find((x) => x.geometry?.rings?.length)
  if (!f) throw new Error(`MTBS has no perimeter for fire ${id}.`)
  const polygon = f.geometry!.rings!
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const ring of polygon)
    for (const [x, y] of ring) {
      w = Math.min(w, x)
      s = Math.min(s, y)
      e = Math.max(e, x)
      n = Math.max(n, y)
    }
  return { fire: toFire(f.attributes), polygon, bbox: [w, s, e, n] }
}
