// A grid in Web Mercator for one fire, and polygon rasterisation onto it. Every national service answers
// in EPSG:3857, so the grid is laid in 3857 and the map overlays it exactly. A 3857 metre is 1/cos(lat) of
// a ground metre, so the cell size is scaled by the fire's latitude to keep cells ~30 m on the ground.

export interface Grid {
  /** West, south, east, north in EPSG:3857. */
  bbox: [number, number, number, number]
  width: number
  height: number
  /** Cell size in 3857 units. */
  res: number
  /** Cell size on the ground, in metres (res × cos(latitude)). */
  groundRes: number
}

export type Ring = [number, number][]
export type Polygon = Ring[]

const R = 6378137
export const toLonLat = ([x, y]: [number, number]): [number, number] => [
  (x / R) * (180 / Math.PI),
  (Math.atan(Math.exp(y / R)) * 2 - Math.PI / 2) * (180 / Math.PI),
]

/** A grid covering `bbox` (3857) plus `padM` ground metres, ~`groundM` metres a cell, at most `maxCells`. */
export function makeGrid(
  bbox: [number, number, number, number],
  groundM = 30,
  padM = 300,
  maxCells = 9_000_000,
): Grid {
  const lat = toLonLat([0, (bbox[1] + bbox[3]) / 2])[1]
  const k = 1 / Math.cos((lat * Math.PI) / 180)
  const pad = padM * k
  const [w0, s0, e0, n0] = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad]
  let res = groundM * k
  let width = Math.ceil((e0 - w0) / res)
  let height = Math.ceil((n0 - s0) / res)
  // A very large fire is gridded more coarsely rather than exhausting the browser's memory.
  if (width * height > maxCells) {
    res *= Math.sqrt((width * height) / maxCells)
    width = Math.ceil((e0 - w0) / res)
    height = Math.ceil((n0 - s0) / res)
  }
  return { bbox: [w0, n0 - height * res, w0 + width * res, n0], width, height, res, groundRes: res / k }
}

/**
 * Rasterise polygons (rings in 3857) onto the grid: 1 where a cell's centre falls inside, by the even-odd
 * rule, so holes are honoured. Writes `value` into `out` (allocated if absent) and returns it.
 */
export function rasterize(polygons: Polygon[], grid: Grid, value = 1, out?: Uint8Array): Uint8Array {
  const { width, height, res, bbox } = grid
  const mask = out ?? new Uint8Array(width * height)
  const top = bbox[3]
  const left = bbox[0]
  const xs: number[] = []
  for (const poly of polygons) {
    // Row by row: crossings of the row's centre line with every edge of every ring of this polygon.
    let ymin = Infinity
    let ymax = -Infinity
    for (const ring of poly)
      for (const [, y] of ring) {
        ymin = Math.min(ymin, y)
        ymax = Math.max(ymax, y)
      }
    const r0 = Math.max(0, Math.floor((top - ymax) / res))
    const r1 = Math.min(height - 1, Math.ceil((top - ymin) / res))
    for (let row = r0; row <= r1; row++) {
      const y = top - (row + 0.5) * res
      xs.length = 0
      for (const ring of poly) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]
          const [xj, yj] = ring[j]
          if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi))
        }
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - left) / res - 0.5))
        const c1 = Math.min(width - 1, Math.floor((xs[k + 1] - left) / res - 0.5))
        for (let c = c0; c <= c1; c++) mask[row * width + c] = value
      }
    }
  }
  return mask
}
