// Where the app is, as a URL. Every view has its own link, and the browser's back button walks the path.
//   (none)                   the national map
//   ?state=OR                the national map, with a state outside coverage called out
//   ?view=state              California (?view=all, the old overview link, lands here too)
//   ?county=06063            one county
//   ?at=lat,lon             a searched address: the point only, rounded to ~100 m. The address text
//                            stays in the page, never in a link that could be logged or shared.
//   ?fire=id                 one fire's order
//   ?us=MTBS_ID              any fire in the lower 48, built live in the browser from national data
import type { Address } from './geo/places.ts'

export type Route =
  | { view: 'nation'; state?: string }
  | { view: 'state' }
  | { view: 'county'; fips: string }
  | { view: 'place'; address: Address }
  | { view: 'fire'; id: string }
  | { view: 'live'; id: string }

export function parseRoute(search: string): Route {
  const q = new URLSearchParams(search)
  const fire = q.get('fire')
  if (fire) return { view: 'fire', id: fire }
  const us = q.get('us')
  if (us && /^[A-Za-z0-9]{10,40}$/.test(us)) return { view: 'live', id: us.toUpperCase() }
  const county = q.get('county')
  if (county && /^\d{5}$/.test(county)) return { view: 'county', fips: county }
  const at = q.get('at')?.split(',').map(Number)
  if (at && at.length === 2 && at.every(Number.isFinite)) {
    const [lat, lon] = at
    return {
      view: 'place',
      address: { label: 'Pinned place', detail: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon, state: q.get('st') },
    }
  }
  const view = q.get('view')
  if (view === 'state' || view === 'all') return { view: 'state' }
  const state = q.get('state')?.toUpperCase()
  return state && /^[A-Z]{2}$/.test(state) && state !== 'CA' ? { view: 'nation', state } : { view: 'nation' }
}

export function routeSearch(r: Route): string {
  const enc = encodeURIComponent
  if (r.view === 'nation') return r.state ? `?state=${enc(r.state)}` : ''
  if (r.view === 'state') return '?view=state'
  if (r.view === 'county') return `?county=${enc(r.fips)}`
  if (r.view === 'fire') return `?fire=${enc(r.id)}`
  if (r.view === 'live') return `?us=${enc(r.id)}`
  // The comma is left as is, so the point reads as one in the address bar.
  const at = `?at=${r.address.lat.toFixed(3)},${r.address.lon.toFixed(3)}`
  return r.address.state ? `${at}&st=${enc(r.address.state)}` : at
}
