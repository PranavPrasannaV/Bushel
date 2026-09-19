// The sheet beside the map for a state, a county or a searched address: what is there, in figures, and a
// ranked list to open. Every in-county figure is the county's share of whole fires, and says so.
import type { CSSProperties, ReactNode } from 'react'
import type { FireIndexEntry } from '../convert/types.ts'
import { fmt, type Address, type Counties, type County, type NearFire } from '../geo/places.ts'
import './RegionPanel.css'

const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : Math.round(km).toString())

function Ledger({ rows }: { rows: [label: ReactNode, value: ReactNode, key?: boolean][] }) {
  return (
    <dl className="ledger region-ledger">
      {rows.map(([label, value, key], i) => (
        <div key={i} data-key={key || undefined}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A ranked list with a bar per row, each sized against the first. */
function Ranked<T>({
  items,
  label,
  value,
  measure,
  onOpen,
  caption,
}: {
  items: T[]
  label: (x: T) => ReactNode
  value: (x: T) => ReactNode
  measure: (x: T) => number
  onOpen: (x: T) => void
  caption: string
}) {
  const top = Math.max(1, ...items.map(measure))
  return (
    <div className="ranked">
      <p className="caps">{caption}</p>
      <ol className="ranked-list">
        {items.map((x, i) => (
          <li key={i} style={{ '--share': measure(x) / top } as CSSProperties}>
            <button type="button" onClick={() => onOpen(x)}>
              <span className="ranked-label">{label(x)}</span>
              <span className="ranked-value">{value(x)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function StatePanel({
  counties,
  fires,
  onCounty,
  children,
}: {
  counties: Counties | null
  fires: FireIndexEntry[]
  onCounty: (fips: string) => void
  children?: ReactNode
}) {
  const list = counties ? Object.values(counties.counties).filter((c) => c.totals.fires > 0) : []
  const ranked = [...list].sort((a, b) => b.totals.interior_acres - a.totals.interior_acres).slice(0, 8)
  const interior = fires.reduce((s, f) => s + f.interior_acres, 0)
  const bushels = list.reduce((s, c) => s + c.totals.bushels, 0)
  return (
    <section className="region" aria-label="California">
      <header className="region-head">
        <p className="slip-kind">State brief</p>
        <h2 className="region-name">California</h2>
        <p className="stamp">
          <span>Built {counties?.coverage_years.join('–') ?? '2018–2023'}</span>
          <span>CAL FIRE perimeters of 1,000+ acres</span>
        </p>
      </header>
      <Ledger
        rows={[
          ['Fires built', fmt(fires.length)],
          ['Counties with a built fire', `${list.length} of 58`],
          ["Ground that can't reseed", `${fmt(interior)} ac`, true],
          ['Seed order, all fires', `${fmt(bushels)} bushels of cones`],
        ]}
      />
      {ranked.length > 0 && (
        <Ranked
          caption="Where the need is: counties by ground that can’t reseed"
          items={ranked}
          label={(c: County) => `${c.name} County`}
          value={(c: County) => `${fmt(c.totals.interior_acres)} ac`}
          measure={(c: County) => c.totals.interior_acres}
          onOpen={(c: County) => onCounty(c.fips)}
        />
      )}
      {children}
    </section>
  )
}

export function CountyPanel({
  county,
  fires,
  onFire,
  place,
  near,
}: {
  county: County
  fires: FireIndexEntry[]
  onFire: (id: string) => void
  place?: Address
  near?: NearFire[]
}) {
  const byId = new Map(fires.map((f) => [f.id, f]))
  const name = (id: string) => {
    const f = byId.get(id)
    return f ? (
      <>
        {f.name} <span className="ranked-year">{f.year}</span>
      </>
    ) : (
      id
    )
  }
  const inside = near?.find((n) => n.inside)
  const nearest = near?.[0]
  const t = county.totals
  return (
    <section className="region" aria-label={`${county.name} County`}>
      {place && (
        <div className="region-place">
          <p className="slip-kind">Searched place</p>
          <h2 className="region-place-name">{place.label}</h2>
          {place.detail && <p className="region-place-detail">{place.detail}</p>}
          <p className="region-verdict" data-inside={!!inside || undefined}>
            {inside ? (
              <>
                Inside the <strong>{byId.get(inside.id)?.name ?? inside.id}</strong> fire&rsquo;s perimeter (
                {byId.get(inside.id)?.year}).
              </>
            ) : nearest ? (
              <>
                The nearest built fire is <strong>{byId.get(nearest.id)?.name ?? nearest.id}</strong> (
                {byId.get(nearest.id)?.year}), about {fmtKm(nearest.km)} km away.
              </>
            ) : (
              'Looking for the nearest built fires…'
            )}
          </p>
          {near && near.length > 0 && (
            <Ranked
              caption="Nearest built fires"
              items={near}
              label={(n: NearFire) => name(n.id)}
              value={(n: NearFire) => (n.inside ? 'here' : `${fmtKm(n.km)} km`)}
              measure={(n: NearFire) => 1 / (1 + n.km)}
              onOpen={(n: NearFire) => onFire(n.id)}
            />
          )}
        </div>
      )}

      <header className="region-head">
        <p className="slip-kind">County brief</p>
        <h2 className="region-name">{county.name} County</h2>
        <p className="stamp">
          <span>California</span>
          <span>{fmt(county.area_acres)} acres</span>
        </p>
      </header>

      {t.fires === 0 ? (
        <p className="region-empty">
          No built fire burned here from 2018 to 2023: no CAL FIRE perimeter of 1,000+ acres with a burn-severity
          assessment crosses the county.
        </p>
      ) : (
        <>
          <Ledger
            rows={[
              ['Fires since 2018', fmt(t.fires)],
              ['Acres burned in the county', `${fmt(t.perimeter_acres)} ac`],
              ["Ground that can't reseed", `${fmt(t.interior_acres)} ac`, true],
              ['Seed order, county share', `≈ ${fmt(t.bushels)} bushels`],
            ]}
          />
          <Ranked
            caption="Fires here, by ground that can’t reseed in the county"
            items={county.fires}
            label={(f) => name(f.id)}
            value={(f) => `${fmt(f.interior_acres)} ac`}
            measure={(f) => f.interior_acres}
            onOpen={(f) => onFire(f.id)}
          />
          <p className="region-note">
            County figures are each fire&rsquo;s share inside the county line. A fire&rsquo;s full order, across
            every county it burned, opens with the fire.
          </p>
        </>
      )}
    </section>
  )
}

/** Report: every county with a built fire, ranked. */
export function CountiesReport({ counties, onCounty }: { counties: Counties; onCounty: (fips: string) => void }) {
  const list = Object.values(counties.counties)
    .filter((c) => c.totals.fires > 0)
    .sort((a, b) => b.totals.interior_acres - a.totals.interior_acres)
  return (
    <section className="region-report" aria-labelledby="counties-title">
      <h3 id="counties-title">Counties</h3>
      <p className="section-lede">
        {list.length} of California&rsquo;s 58 counties had a built fire from {counties.coverage_years.join(' to ')}.
        Select one to see its fires.
      </p>
      <div className="region-table-wrap">
        <table className="region-table">
          <thead>
            <tr>
              <th scope="col">County</th>
              <th scope="col" className="num">Fires</th>
              <th scope="col" className="num">Acres burned</th>
              <th scope="col" className="num">Can&rsquo;t reseed</th>
              <th scope="col" className="num">≈ Bushels of cones</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.fips}>
                <th scope="row">
                  <button type="button" className="line-button" onClick={() => onCounty(c.fips)}>
                    {c.name}
                  </button>
                </th>
                <td className="num">{c.totals.fires}</td>
                <td className="num">{fmt(c.totals.perimeter_acres)}</td>
                <td className="num">{fmt(c.totals.interior_acres)}</td>
                <td className="num">{fmt(c.totals.bushels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="region-note">{counties.method}</p>
    </section>
  )
}

/** Report: one county's fires, with each fire's share inside the county. */
export function CountyReport({
  county,
  fires,
  method,
  onFire,
}: {
  county: County
  fires: FireIndexEntry[]
  method: string
  onFire: (id: string) => void
}) {
  const byId = new Map(fires.map((f) => [f.id, f]))
  return (
    <section className="region-report" aria-labelledby="county-fires-title">
      <h3 id="county-fires-title">Fires in {county.name} County</h3>
      <p className="section-lede">
        Each fire&rsquo;s acres inside the county, beside its whole-fire figures. Open a fire for its full seed order.
      </p>
      {county.fires.length === 0 ? (
        <p className="region-empty">No built fire burned in this county from 2018 to 2023.</p>
      ) : (
        <div className="region-table-wrap">
          <table className="region-table">
            <thead>
              <tr>
                <th scope="col">Fire</th>
                <th scope="col" className="num">Year</th>
                <th scope="col" className="num">Share in county</th>
                <th scope="col" className="num">Can&rsquo;t reseed, here</th>
                <th scope="col" className="num">Can&rsquo;t reseed, whole fire</th>
                <th scope="col" className="num">≈ Bushels, here</th>
              </tr>
            </thead>
            <tbody>
              {county.fires.map((f) => {
                const e = byId.get(f.id)
                return (
                  <tr key={f.id}>
                    <th scope="row">
                      <button type="button" className="line-button" onClick={() => onFire(f.id)}>
                        {e?.name ?? f.id}
                      </button>
                    </th>
                    <td className="num">{e?.year}</td>
                    <td className="num">{Math.round(f.perimeter_share * 100)}%</td>
                    <td className="num">{fmt(f.interior_acres)}</td>
                    <td className="num">{e ? fmt(e.interior_acres) : '—'}</td>
                    <td className="num">{f.bushels.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="region-note">{method}</p>
    </section>
  )
}
