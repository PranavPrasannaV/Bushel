"""Seed zone x 500-foot elevation band partition (T023).

Rule: every pixel is labelled by its own (Buck 1970 seed zone, 500 ft band of its own DEM value);
a cell is the set of pixels sharing one label, so an area that straddles a band or zone boundary is
split by construction and no cell can ever hold two zones or two bands (Provenance Lock). Pixels
with no seed zone (-1) or no elevation (NaN) cannot be labelled; they are counted and returned as
`unpartitioned_px`, never silently dropped.
"""

import numpy as np

from bushel.jurisdiction import ACRE_M2

FT_PER_M = 3.28084
BAND_FT = 500
PIXEL_ACRES = 30 * 30 / ACRE_M2


def acres(pixels) -> float:
    """Pixel count on the 30 m grid -> acres, as a plain float for JSON."""
    return round(float(pixels) * PIXEL_ACRES, 4)


def band_low_ft(dem_m: np.ndarray) -> np.ndarray:
    """Lower edge of each pixel's 500 ft elevation band, in feet."""
    return (np.floor(dem_m * FT_PER_M / BAND_FT) * BAND_FT).astype(np.int64)


def band_label(low_ft: int) -> str:
    return f"{low_ft}–{low_ft + BAND_FT} ft"


def partition(mask: np.ndarray, seed_zone: np.ndarray, dem_m: np.ndarray):
    """Split `mask` into zone x band cells.

    Returns (labels, cells, unpartitioned_px):
      labels  int32 array, the index into `cells` for each labelled pixel, -1 elsewhere
      cells   [{cell_id, seed_zone, elevation_band, pixels}] in (zone, band) order
      unpartitioned_px  pixels in `mask` with seed_zone -1 or NaN DEM
    """
    ok = mask & (seed_zone >= 0) & np.isfinite(dem_m)
    pairs = np.stack([seed_zone[ok].astype(np.int64), band_low_ft(dem_m[ok])], axis=1)
    keys, inverse = np.unique(pairs, axis=0, return_inverse=True)
    inverse = inverse.ravel()
    labels = np.full(mask.shape, -1, dtype=np.int32)
    labels[ok] = inverse
    counts = np.bincount(inverse, minlength=len(keys))
    cells = [
        {
            "cell_id": f"{zone}_{low}",
            "seed_zone": str(zone),
            "elevation_band": band_label(low),
            "pixels": int(n),
        }
        for (zone, low), n in zip(keys.tolist(), counts.tolist(), strict=True)
    ]
    return labels, cells, int(mask.sum() - ok.sum())
