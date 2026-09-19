// Raster exports from the national image services, decoded in the browser. Kept apart from api.ts so
// the GeoTIFF decoder loads only with a live build, never with the search.
import { fromArrayBuffer } from 'geotiff'
import { get, qs } from './api.ts'
import type { Grid } from './raster.ts'

/** One band of an ImageServer export over the grid, as a row-major typed array of width × height. */
export async function exportImage(
  url: string,
  grid: Grid,
  pixelType: 'U8' | 'U16' | 'F32',
  mosaicRule?: object,
  signal?: AbortSignal,
): Promise<ArrayLike<number>> {
  const params: Record<string, string | number> = {
    bbox: grid.bbox.join(','),
    bboxSR: 3857,
    imageSR: 3857,
    size: `${grid.width},${grid.height}`,
    format: 'tiff',
    pixelType,
    interpolation: 'RSP_NearestNeighbor',
    renderingRule: JSON.stringify({ rasterFunction: 'None' }),
    f: 'image',
  }
  if (mosaicRule) params.mosaicRule = JSON.stringify(mosaicRule)
  const res = await get(`${url}/exportImage?${qs(params)}`, signal)
  const buf = await res.arrayBuffer()
  const tiff = await fromArrayBuffer(buf)
  const image = await tiff.getImage()
  if (image.getWidth() !== grid.width || image.getHeight() !== grid.height) {
    throw new Error(`${new URL(url).host} returned a ${image.getWidth()}×${image.getHeight()} image`)
  }
  const [band] = (await image.readRasters({ samples: [0] })) as unknown as ArrayLike<number>[]
  return band
}

