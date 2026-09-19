// The sheet beside the map for a state, a county or a searched address: what is there, in figures, and a
// ranked list to open. Every in-county figure is the county's share of whole fires, and says so.
import type { CSSProperties, ReactNode } from 'react'
import type { FireIndexEntry } from '../convert/types.ts'
import { COVERAGE_COPY, type Coverage } from '../geo/coverage.ts'
import { fmt, OUTCOME, type Address, type Counties, type County, type CountyFire, type NearFire } from '../geo/places.ts'
import { STATE_SINCE, type NationalFire } from '../national/api.ts'
import './RegionPanel.css'

const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : Math.round(km).toString())

/** A county fire's figure: its acres that can't reseed here, or, when there are none, why. */
const outcome = (f: CountyFire) =>
  f.interior_acres >= 0.5 ? `${fmt(f.interior_acres)} ac` : f.result === 'order' ? 'planting is next door' : OUTCOME[f.result]

/** Why a county with burned ground has no seed order, from its fires' outcomes. */
function whyNoOrder(fires: CountyFire[]): string {
  const n = (r: CountyFire['result']) => fires.filter((f) => f.result === r).length
  const parts = [
    n('order') && `${n('order')} needs planting only in a neighbouring county`,
    n('no_conifer') && `${n('no_conifer')} burned no conifer forest (shrub, grass or oak, which regrow from their roots)`,
    n('no_interior') && `${n('no_interior')} burned conifers that are all close enough to surviving trees to reseed`,
    n('no_retained_area') && `${n('no_retained_area')} burned only federal land, which the Forest Service replants, not the state`,
  ].filter(Boolean)
  const of = fires.length === 1 ? 'The one fire here' : `Of the ${fires.length} fires here,`
  return `${of} ${parts.join('; ')}.`
}

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
  tone,
}: {
  items: T[]
  label: (x: T) => ReactNode
  value: (x: T) => ReactNode
  measure: (x: T) => number
  onOpen: (x: T) => void
  caption: string
  /** 'burn' when the bars are acres burned: the sprout green is kept for ground that can't reseed. */
  tone?: 'burn'
}) {
  const top = Math.max(1, ...items.map(measure))
  return (
    <div className="ranked" data-tone={tone}>
      <p className="caps">{caption}</p>
      <ol className="ranked-list">
        {items.map((x, i) => (
          <li key={i} style={{ '--share': measure(x) / top } as CSSProperties} data-zero={measure(x) <= 0 || undefined}>
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
          ['Seed order, all fires', `${fmt(bushels)} bushels`],
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

/** A state outside California: nothing built ahead, so its largest fires, each one built live when picked. */
export function NationalStatePanel({
  name,
  status,
  fires,
  error,
  address,
  near,
  onFire,
  onCalifornia,
  onRetry,
}: {
  name: string
  status: Coverage
  /** The state's largest fires; null while MTBS is asked. */
  fires: NationalFire[] | null
  error?: string | null
  /** A searched address in this state, and the fires near it. */
  address?: string | null
  near?: NationalFire[] | null
  onFire: (f: NationalFire) => void
  onCalifornia: () => void
  onRetry: () => void
}) {
  const list = (items: NationalFire[], caption: string) => (
    <Ranked
      caption={caption}
      items={items.slice(0, 10)}
      label={(f: NationalFire) => (
        <>
          {f.name} <span className="ranked-year">{f.year}</span>
        </>
      )}
      value={(f: NationalFire) => `${fmt(f.acres)} ac`}
      measure={(f: NationalFire) => f.acres}
      onOpen={onFire}
      tone="burn"
    />
  )
  return (
    <section className="region" aria-label={name}>
      <header className="region-head">
        <p className="slip-kind">{COVERAGE_COPY[status].label}</p>
        <h2 className="region-name">{name}</h2>
        <p className="stamp">
          <span>{status === 'live' ? `MTBS fires since ${STATE_SINCE}` : 'Outside the severity mosaic'}</span>
          <span>{status === 'live' ? 'Not yet checked' : 'Lower 48 only'}</span>
        </p>
      </header>

      {address && (
        <p className="region-verdict">
          {address} is in {name}. {status === 'live' ? 'Pick a fire near it to build its order live.' : ''}
        </p>
      )}

      {status === 'later' ? (
        <>
          <p className="region-empty">{COVERAGE_COPY.later.detail}</p>
          <button type="button" className="button-quiet" onClick={onCalifornia}>
            Open California instead
          </button>
        </>
      ) : error ? (
        <div className="region-verdict" role="alert">
          <p>MTBS did not answer: {error}</p>
          <button type="button" className="button-quiet" onClick={onRetry}>
            Ask again
          </button>
        </div>
      ) : fires === null ? (
        <p className="region-empty" role="status">
          Asking MTBS for {name}&rsquo;s fires…
        </p>
      ) : (
        <>
          {address && near && near.length > 0 && list(near, 'Fires within 60 km · build one live')}
          {fires.length > 0 ? (
            <>
              <Ledger
                rows={[
                  [`Fires of 1,000+ acres since ${STATE_SINCE}`, fmt(fires.length) + (fires.length >= 80 ? '+' : '')],
                  ['Acres they burned', `${fmt(fires.reduce((s, f) => s + f.acres, 0))} ac`],
                  ["Ground that can't reseed", 'when built'],
                ]}
              />
              {list(fires, 'Largest fires · build one live')}
            </>
          ) : (
            <p className="region-empty">
              MTBS has mapped no wildfire of 1,000+ acres here since {STATE_SINCE}. Search a fire by name for older
              ones.
            </p>
          )}
          <p className="region-note">{COVERAGE_COPY.live.detail}</p>
        </>
      )}
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

      {t.fires > 0 && t.interior_acres < 0.5 && (
        <div className="region-verdict">
          <p>
            <strong>No seed order here.</strong> Bushel orders conifer seed for burned forest on land the state is
            responsible for, where no surviving tree is close enough to reseed it. {whyNoOrder(county.fires)}
          </p>
        </div>
      )}

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
            value={outcome}
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
                <th scope="col">Outcome</th>
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
                    <td className="region-outcome" data-result={f.result}>
                      {OUTCOME[f.result]}
                    </td>
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
