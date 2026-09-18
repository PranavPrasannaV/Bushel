// T036: pick one fire from fires/index.json.
import type { FireIndexEntry } from '../convert/types.ts'
import { fmtAcres } from './OrderTable.tsx'
import './FireSelector.css'

export default function FireSelector({
  fires,
  value,
  onChange,
}: {
  fires: FireIndexEntry[]
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
        {fires.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} ({f.year}) — {fmtAcres(f.perimeter_acres)} ac perimeter{f.provisional ? ' · provisional' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
