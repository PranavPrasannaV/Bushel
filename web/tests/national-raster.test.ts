// The national build's grid and rasteriser: cells stay ~30 m on the ground at any latitude, and polygons
// (with holes) fill exactly the cells whose centres they contain.
import { describe, expect, it } from 'vitest'
import { makeGrid, rasterize, toLonLat, type Grid } from '../src/national/raster.ts'

const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
]

describe('makeGrid', () => {
  it('keeps cells ~30 m on the ground at 40° N', () => {
    const y = 4865942 // ≈ 40° N in 3857
    const g = makeGrid([-13400000, y, -13390000, y + 10000])
    expect(g.groundRes).toBeCloseTo(30, 0)
    expect(g.res).toBeGreaterThan(38) // 30 / cos(40°) ≈ 39.2 in 3857 units
    expect(toLonLat([0, y])[1]).toBeCloseTo(40, 1)
  })

  it('coarsens a huge fire to stay within the cell budget', () => {
    const g = makeGrid([-13500000, 4800000, -13300000, 5000000], 30, 0, 1_000_000)
    expect(g.width * g.height).toBeLessThanOrEqual(1_010_000)
    expect(g.groundRes).toBeGreaterThan(100)
  })
})

describe('rasterize', () => {
  const grid: Grid = { bbox: [0, 0, 10, 10], width: 10, height: 10, res: 1, groundRes: 1 }
  const count = (m: Uint8Array) => m.reduce((s, v) => s + (v ? 1 : 0), 0)

  it('fills the cells whose centres lie inside', () => {
    expect(count(rasterize([[square(2, 2, 6, 5)]], grid))).toBe(12) // 4 columns × 3 rows
  })

  it('honours holes', () => {
    const m = rasterize([[square(0, 0, 10, 10), square(3, 3, 7, 7)]], grid)
    expect(count(m)).toBe(100 - 16)
    expect(m[5 * 10 + 5]).toBe(0)
  })

  it('writes a label value into an existing grid', () => {
    const out = new Uint8Array(100)
    rasterize([[square(0, 0, 5, 10)]], grid, 3, out)
    rasterize([[square(5, 0, 10, 10)]], grid, 7, out)
    expect(out[0]).toBe(3)
    expect(out[9]).toBe(7)
  })
})
