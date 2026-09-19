/// <reference types="geojson" />
// The national map: every state, drawn in Albers USA (Alaska and Hawaii inset), shaded by what Bushel
// covers. California is built and checked, one dot per fire sized by its seed-limited interior; the rest of
// the lower 48 is built live on request; Alaska and Hawaii are not yet. SVG, no tiles: it draws before
// MapLibre loads.
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { geoAlbersUsa, geoPath } from 'd3-geo'
import { coverage, COVERAGE_COPY, type Coverage } from '../geo/coverage.ts'
import './NationMap.css'

const W = 975
const H = 610

export interface FirePoints {
  fields: string[]
  points: [id: string, lon: number, lat: number, interior: number][]
}

export default function NationMap({
  states,
  points,
  focus,
  onState,
}: {
  states: GeoJSON.FeatureCollection
  points: FirePoints | null
  /** A state to call out (a searched address outside California), by postal code. */
  focus?: string | null
  onState: (postal: string) => void
}) {
  const [hover, setHover] = useState<{ postal: string; name: string; x: number; y: number } | null>(null)
  const projection = useMemo(() => geoAlbersUsa().scale(1300).translate([W / 2, H / 2]), [])
  const path = useMemo(() => geoPath(projection), [projection])

  const shapes = useMemo(
    () =>
      states.features.map((f) => {
        const postal = f.properties?.postal as string
        return {
          postal,
          name: f.properties?.name as string,
          d: path(f) ?? '',
          centroid: path.centroid(f),
          status: coverage(postal) as Coverage,
        }
      }),
    [states, path],
  )

  const dots = useMemo(
    () =>
      (points?.points ?? [])
        .map(([id, lon, lat, interior]) => ({ id, xy: projection([lon, lat]), r: 1.2 + Math.sqrt(interior) / 14 }))
        .filter((d): d is { id: string; xy: [number, number]; r: number } => !!d.xy)
        .sort((a, b) => b.r - a.r),
    [points, projection],
  )

  const ca = shapes.find((s) => s.postal === 'CA')
  const tip = hover ? shapes.find((s) => s.postal === hover.postal) : null
  const track = (s: { postal: string; name: string }) => (e: ReactPointerEvent<SVGPathElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    setHover({ postal: s.postal, name: s.name, x: e.clientX - box.left, y: e.clientY - box.top })
  }

  return (
    <figure className="nation">
      <div className="nation-frame">
        <svg
          className="nation-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Map of the United States. California is built and checked; the rest of the lower 48 is built live on request; Alaska and Hawaii are not yet covered."
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <pattern id="nation-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="nation-hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="6" className="nation-hatch-line" />
            </pattern>
          </defs>
          <g>
            {shapes
              .filter((s) => s.postal !== 'CA')
              .map((s) => (
                <path
                  key={s.postal}
                  d={s.d}
                  className="nation-state"
                  data-status={s.status}
                  data-focus={focus === s.postal || undefined}
                  data-hover={hover?.postal === s.postal || undefined}
                  onPointerMove={track(s)}
                  onClick={() => onState(s.postal)}
                />
              ))}
          </g>
          {/* California on top, as the one open sheet: a link into the state. */}
          {ca && (
            <a
              href="?view=state"
              className="nation-ca"
              aria-label="Open California: 237 fires built"
              onClick={(e) => {
                e.preventDefault()
                onState('CA')
              }}
            >
              <path d={ca.d} className="nation-state" data-status="covered" onPointerMove={track(ca)} />
            </a>
          )}
          <g className="nation-dots" aria-hidden="true">
            {dots.map((d) => (
              <circle key={d.id} cx={d.xy[0]} cy={d.xy[1]} r={d.r} />
            ))}
          </g>
        </svg>

        {hover && tip && (
          <div
            className="nation-tip"
            style={{ left: `${Math.min(hover.x + 16, 9999)}px`, top: `${hover.y + 16}px` }}
            role="status"
          >
            <p className="nation-tip-name">{tip.name}</p>
            <p className="nation-tip-status" data-status={tip.status}>
              {COVERAGE_COPY[tip.status].label}
            </p>
            <p className="nation-tip-cta">
              {tip.status === 'covered' ? 'Open California →' : tip.status === 'live' ? 'Pick a fire to build →' : 'Why not yet →'}
            </p>
          </div>
        )}
      </div>

      <figcaption className="nation-key">
        <span className="nation-key-item" data-status="covered">
          <span className="nation-swatch" aria-hidden="true" />
          Built and checked: California
        </span>
        <span className="nation-key-item" data-status="live">
          <span className="nation-swatch" aria-hidden="true" />
          Built live on request: the lower 48
        </span>
        <span className="nation-key-item" data-status="later">
          <span className="nation-swatch" aria-hidden="true" />
          Not yet
        </span>
        <span className="nation-key-item nation-key-dots">
          <span className="nation-dot" aria-hidden="true" />
          One dot per fire, sized by the ground that can&rsquo;t reseed
        </span>
      </figcaption>
    </figure>
  )
}
