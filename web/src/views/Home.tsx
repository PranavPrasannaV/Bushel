// Home: what Bushel is, one search for any place or fire, and the national map of what it covers.
// California is built ahead of time and checked; the rest of the lower 48 is built live on request.
import type { FireIndexEntry } from '../convert/types.ts'
import NationMap, { type FirePoints } from '../components/NationMap.tsx'
import SearchBar from '../components/SearchBar.tsx'
import { coverage, COVERAGE_COPY, type Coverage } from '../geo/coverage.ts'
import { fmt, type Address, type Counties } from '../geo/places.ts'
import type { NationalFire } from '../national/api.ts'
import './Home.css'

// A worked address for the "Try" row: the town the 2018 Camp Fire burned.
const PARADISE: Address = { label: 'Paradise', detail: 'Butte County, California', lat: 39.7596, lon: -121.6219, state: 'California' }

const STEPS: [string, string][] = [
  ['Whose land', 'The fire’s perimeter is clipped to the land the state is responsible for. Federal acres are shown, not counted.'],
  ['How badly it burned', 'The federal burn-severity record keeps the ground where the fire killed the trees.'],
  ['Too far to reseed', 'Ground more than 90 m from a surviving tree lights up: seed will not reach it on its own.'],
  ['The order', 'That ground, split by seed zone and elevation, becomes bushels of cones, pounds of seed and a price.'],
]

export default function Home({
  fires,
  counties,
  states,
  points,
  onState,
  onCounty,
  onFire,
  onAddress,
  onLive,
}: {
  fires: FireIndexEntry[]
  counties: Counties | null
  states: GeoJSON.FeatureCollection | null
  points: FirePoints | null
  onState: (postal: string) => void
  onCounty: (fips: string) => void
  onFire: (id: string) => void
  onAddress: (address: Address) => void
  onLive: (fire: NationalFire) => void
}) {
  const interior = fires.reduce((s, f) => s + f.interior_acres, 0)
  const withFires = counties ? Object.values(counties.counties).filter((c) => c.totals.fires > 0) : []
  const bushels = withFires.reduce((s, c) => s + c.totals.bushels, 0)
  const top = [...fires].sort((a, b) => b.interior_acres - a.interior_acres).slice(0, 5)
  const topMax = top[0]?.interior_acres ?? 1
  const statesBy = (c: Coverage) =>
    (states?.features ?? [])
      .filter((f) => coverage(f.properties?.postal as string) === c)
      .map((f) => f.properties?.name as string)

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-copy">
          <p className="caps">Post-fire reforestation · seed orders</p>
          <h1 className="home-title">
            After a wildfire, which forest can&rsquo;t grow back on its own, and what seed will it take?
          </h1>
          <p className="home-lede">
            Bushel finds the burned ground too far from surviving trees to reseed itself, and turns it into the order a
            state nursery would place: species, seed zone, bushels of cones and cost. Every California fire from
            2018 to 2023, checked against CAL FIRE&rsquo;s own published need.
          </p>
          <SearchBar
            size="hero"
            fires={fires}
            counties={counties}
            onFire={onFire}
            onCounty={onCounty}
            onAddress={onAddress}
            onLive={onLive}
            placeholder="Search a county, an address or a fire"
          />
          <p className="home-try">
            <span className="caps">Try</span>
            <button type="button" onClick={() => onCounty('06063')}>
              Plumas County
            </button>
            <button type="button" onClick={() => onAddress(PARADISE)}>
              Paradise, CA
            </button>
            <button type="button" onClick={() => onFire('dixie-2021')}>
              Dixie fire, 2021
            </button>
            <button type="button" onClick={() => onState('CA')}>
              All of California
            </button>
          </p>
        </div>

        <div className="home-map">
          {states ? (
            <NationMap states={states} points={points} onState={onState} />
          ) : (
            <div className="home-map-wait" role="status">
              Drawing the map…
            </div>
          )}
        </div>
      </section>

      <section className="home-figures" aria-label="Bushel in figures">
        <dl>
          <div>
            <dt>Fires built</dt>
            <dd>{fmt(fires.length)}</dd>
          </div>
          <div>
            <dt>Counties with a built fire</dt>
            <dd>{withFires.length || '—'}</dd>
          </div>
          <div data-key>
            <dt>Acres that can&rsquo;t reseed</dt>
            <dd>{fmt(interior)}</dd>
          </div>
          <div>
            <dt>Bushels of cones to replant them</dt>
            <dd>{bushels ? fmt(bushels) : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="home-section home-coverage" aria-labelledby="coverage-title">
        <h2 id="coverage-title" className="home-h2">
          Where it works
        </h2>
        <div className="home-tiers">
          {(['covered', 'live', 'later'] as Coverage[]).map((c) => {
            const names = statesBy(c)
            return (
              <article key={c} className="home-tier" data-status={c}>
                <p className="slip-kind">{COVERAGE_COPY[c].label}</p>
                <h3>
                  {c === 'covered' ? 'California' : c === 'live' ? `${names.length} more states and DC` : names.join(' and ')}
                </h3>
                <p>{COVERAGE_COPY[c].detail}</p>
                {c === 'covered' && (
                  <button type="button" className="button-primary" onClick={() => onState('CA')}>
                    Open California
                  </button>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="home-section" aria-labelledby="how-title">
        <h2 id="how-title" className="home-h2">
          How an order is made
        </h2>
        <ol className="home-steps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="report-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-section" aria-labelledby="start-title">
        <h2 id="start-title" className="home-h2">
          Start with a fire
        </h2>
        <ol className="home-fires">
          {top.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onFire(f.id)}>
                <span className="home-fire-name">
                  {f.name} <span className="ranked-year">{f.year}</span>
                </span>
                <span className="home-fire-bar" style={{ width: `${(f.interior_acres / topMax) * 100}%` }} aria-hidden="true" />
                <span className="home-fire-value">{fmt(f.interior_acres)} acres can&rsquo;t reseed</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <footer className="home-foot">
        <p>
          Data: CAL FIRE perimeters, State Responsibility Area and seed zones; MTBS burn severity; USGS 3DEP elevation;
          LEMMA vegetation (Oregon State University); US Census boundaries. Addresses: OpenStreetMap (Photon).
        </p>
        <p>
          Bushel does CAL FIRE&rsquo;s Assessment of Needs calculation for one fire. Three nursery factors CAL FIRE does
          not publish are shown in amber and can be adjusted.
        </p>
      </footer>
    </div>
  )
}
