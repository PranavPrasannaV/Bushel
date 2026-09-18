// T036: pick one fire from fires/index.json, or one built live this session.
import type { FireIndexEntry } from '../convert/types.ts'
import { fmtAcres } from './OrderTable.tsx'
import './FireSelector.css'

const label = (f: FireIndexEntry) =>
  `${f.name} (${f.year}) — ${fmtAcres(f.perimeter_acres)} ac perimeter${f.provisional ? ' · provisional' : ''}`

export default function FireSelector({
  fires,
  liveFires = [],
  value,
  onChange,
}: {
  fires: FireIndexEntry[]
  liveFires?: FireIndexEntry[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="fire-selector">
      <label htmlFor="fire-select">Fire</label>
      <select id="fire-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose a fire…
        </option>
        <optgroup label="Pre-built">
          {fires.map((f) => (
            <option key={f.id} value={f.id}>
              {label(f)}
            </option>
          ))}
        </optgroup>
        {liveFires.length > 0 && (
          <optgroup label="Built live this session">
            {liveFires.map((f) => (
              <option key={f.id} value={f.id}>
                {label(f)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  )
}
