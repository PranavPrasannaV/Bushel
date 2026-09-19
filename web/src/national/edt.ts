// Exact Euclidean distance transform on a grid, in the browser: for every pixel inside `mask`, the distance
// to the nearest pixel outside it. The same quantity as scipy.ndimage.distance_transform_edt, which the
// California pipeline uses, so a live build here and a pipeline build agree on the seed-limited interior.
// Felzenszwalb & Huttenlocher (2012), "Distance transforms of sampled functions": two passes of an exact
// 1-D squared-distance transform (lower envelope of parabolas), O(width × height).

const INF = 1e20

/** 1-D squared distance transform of f (length n) into d; v and z are scratch buffers. */
function dt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

/**
 * Distance, in pixels, from each pixel of `mask` (non-zero) to the nearest pixel outside it; 0 outside.
 * Row-major, `width` × `height`. Like scipy's EDT, the grid's own edge is not a boundary: a mask that fills
 * the grid has no outside pixel and every distance stays infinite, so callers pad the grid with background.
 */
export function distanceTransform(mask: Uint8Array, width: number, height: number): Float64Array {
  const n = Math.max(width, height)
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  const grid = new Float64Array(width * height)
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? INF : 0

  // Columns, then rows.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]
    dt1(f, height, d, v, z)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]
  }
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) f[x] = grid[row + x]
    dt1(f, width, d, v, z)
    for (let x = 0; x < width; x++) grid[row + x] = Math.sqrt(d[x])
  }
  return grid
}
