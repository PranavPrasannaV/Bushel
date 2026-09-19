// The browser's distance transform against brute force: exact Euclidean distance to the nearest outside
// pixel, the quantity the pipeline gets from scipy.ndimage.distance_transform_edt.
import { describe, expect, it } from 'vitest'
import { distanceTransform } from '../src/national/edt.ts'

function brute(mask: Uint8Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      let best = Infinity
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++)
          if (!mask[yy * w + xx]) best = Math.min(best, Math.hypot(xx - x, yy - y))
      out[y * w + x] = best
    }
  return out
}

function random(w: number, h: number, p: number, seed: number): Uint8Array {
  let s = seed
  const m = new Uint8Array(w * h)
  for (let i = 0; i < m.length; i++) {
    s = (s * 1103515245 + 12345) % 2 ** 31
    m[i] = s / 2 ** 31 < p ? 1 : 0
  }
  // A background border, as the live build pads its grid.
  for (let x = 0; x < w; x++) m[x] = m[(h - 1) * w + x] = 0
  for (let y = 0; y < h; y++) m[y * w] = m[y * w + w - 1] = 0
  return m
}

describe('distanceTransform', () => {
  it('is exact against brute force on random masks', () => {
    for (const [w, h, p, seed] of [
      [23, 17, 0.7, 1],
      [40, 9, 0.9, 2],
      [15, 31, 0.5, 3],
      [30, 30, 0.97, 4],
    ] as const) {
      const m = random(w, h, p, seed)
      const got = distanceTransform(m, w, h)
      const want = brute(m, w, h)
      for (let i = 0; i < got.length; i++) expect(got[i]).toBeCloseTo(want[i], 9)
    }
  })

  it('a square of burn 9 pixels wide has its centre 5 pixels from the edge', () => {
    const w = 11
    const m = new Uint8Array(w * w)
    for (let y = 1; y < 10; y++) for (let x = 1; x < 10; x++) m[y * w + x] = 1
    const d = distanceTransform(m, w, w)
    expect(d[5 * w + 5]).toBe(5)
    expect(d[1 * w + 1]).toBe(1)
    expect(d[0]).toBe(0)
  })
})
