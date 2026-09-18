// T093: searching the pre-built fires works offline, by name and year, largest interior first.
import { describe, expect, it } from 'vitest'
import { canHostServer, matchFires } from '../src/components/LiveBuild.tsx'
import type { FireIndexEntry } from '../src/convert/types.ts'

const fire = (id: string, name: string, year: number, interior: number): FireIndexEntry => ({
  id,
  name,
  year,
  discovery_date: `${year}-08-01`,
  perimeter_acres: 1000,
  retained_acres: 500,
  interior_acres: interior,
  provisional: false,
})

const FIRES = [
  fire('creek-2020', 'Creek', 2020, 594),
  fire('creek-2-2020', 'Creek', 2020, 12),
  fire('north-complex-2020', 'North Complex', 2020, 13507),
  fire('caldor-2021', 'Caldor', 2021, 2239),
]

describe('matchFires', () => {
  it('matches every word against the name, case-blind, largest interior first', () => {
    expect(matchFires(FIRES, 'creek').map((f) => f.id)).toEqual(['creek-2020', 'creek-2-2020'])
    expect(matchFires(FIRES, 'NORTH comp').map((f) => f.id)).toEqual(['north-complex-2020'])
  })

  it('treats a four-digit word as the year', () => {
    expect(matchFires(FIRES, '2021').map((f) => f.id)).toEqual(['caldor-2021'])
    expect(matchFires(FIRES, 'creek 2021')).toEqual([])
  })

  it('an empty query matches nothing rather than everything', () => {
    expect(matchFires(FIRES, '   ')).toEqual([])
  })
})

describe('canHostServer', () => {
  it('asks for a live server only where one can run', () => {
    expect(canHostServer('localhost')).toBe(true)
    expect(canHostServer('127.0.0.1')).toBe(true)
    expect(canHostServer('pranavprasannav.github.io')).toBe(false)
  })
})

