/// <reference types="geojson" />
// Places: California's counties and their fires (reference/counties.json, built by `python -m bushel.geo`),
// point-in-county for a searched address, distances to fires, and the address lookup itself.

export interface CountyFire {
  id: string
  /** Acres of the fire's perimeter inside the county. */
  perimeter_acres: number
  perimeter_share: number
  /** The fire's seed-limited interior inside the county (its total split by the drawn interior's share). */
  interior_acres: number
  /** The fire's default-factor order split the same way: an estimate by share. */
  bushels: number
}

export interface County {
  fips: string
  name: string
  bbox: [number, number, number, number]
  area_acres: number
  fires: CountyFire[]
  totals: { fires: number; perimeter_acres: number; interior_acres: number; bushels: number }
}

export interface Counties {
  generated_at: string
  coverage_years: [number, number]
  method: string
  counties: Record<string, County>
}

export interface Address {
  label: string
  detail: string
  lon: number
  lat: number
  state: string | null
}

type Ring = [number, number][]

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Whether [lon, lat] falls inside a Polygon or MultiPolygon (holes respected). */
export function inPolygon(point: [number, number], geometry: GeoJSON.Geometry): boolean {
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as Ring[]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as Ring[][])
        : []
  return polys.some(([outer, ...holes]) => inRing(point[0], point[1], outer) && !holes.some((h) => inRing(point[0], point[1], h)))
}

/** The county feature containing a point, if any. */
export function countyAt(point: [number, number], outlines: GeoJSON.FeatureCollection): string | null {
  const hit = outlines.features.find((f) => f.geometry && inPolygon(point, f.geometry))
  return (hit?.properties?.fips as string | undefined) ?? null
}

/** Great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export interface NearFire {
  id: string
  km: number
  /** The point lies inside the fire's (coarsened) perimeter. */
  inside: boolean
}

/** Built fires nearest a point: inside a perimeter first, then by distance to each fire's marker. */
export function firesNear(point: [number, number], overview: GeoJSON.FeatureCollection, limit = 5): NearFire[] {
  const inside = new Set(
    overview.features
      .filter((f) => f.properties?.layer === 'perimeter' && f.geometry && inPolygon(point, f.geometry))
      .map((f) => f.properties?.id as string),
  )
  return overview.features
    .filter((f) => f.properties?.layer === 'marker' && f.geometry?.type === 'Point')
    .map((f) => ({
      id: f.properties!.id as string,
      km: distanceKm(point, (f.geometry as GeoJSON.Point).coordinates as [number, number]),
      inside: inside.has(f.properties!.id as string),
    }))
    .sort((a, b) => Number(b.inside) - Number(a.inside) || a.km - b.km)
    .slice(0, limit)
}

const PHOTON = 'https://photon.komoot.io/api/'
// Results are held to the contiguous United States. An address outside California still comes back, and is
// shown against the national map as not yet covered.
const US_BBOX = '-125,24,-66,50'

/** Addresses and places for a query, from OpenStreetMap's Photon geocoder (no key; CORS-open). */
export async function geocode(query: string, signal?: AbortSignal): Promise<Address[]> {
  // Biased toward California's middle, so a name shared across states lists the California one first.
  const url = `${PHOTON}?q=${encodeURIComponent(query)}&limit=6&lang=en&bbox=${US_BBOX}&lat=37.5&lon=-119.5`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Address search failed (HTTP ${res.status})`)
  const doc = (await res.json()) as GeoJSON.FeatureCollection<GeoJSON.Point>
  const seen = new Set<string>()
  const out: Address[] = []
  for (const f of doc.features) {
    const p = (f.properties ?? {}) as Record<string, string | undefined>
    if (p.countrycode && p.countrycode !== 'US') continue
    const street = [p.housenumber, p.street].filter(Boolean).join(' ')
    const label = p.name && p.name !== street ? p.name : street || p.city || p.county || 'Unnamed place'
    const county = p.county && (/county/i.test(p.county) ? p.county : `${p.county} County`)
    const detail = [p.name && street && p.name !== street ? street : null, p.city, county, p.state]
      .filter((x, i, a) => x && a.indexOf(x) === i && x !== label)
      .join(', ')
    const key = `${label}|${detail}`
    if (seen.has(key)) continue
    seen.add(key)
    const [lon, lat] = f.geometry.coordinates
    out.push({ label, detail, lon, lat, state: p.state ?? null })
  }
  return out
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
