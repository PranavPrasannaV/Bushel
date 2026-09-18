"""T024 / SC-007: no cell ever merges two seed zones or two 500 ft elevation bands."""

import numpy as np
import pytest

from bushel.fetch import DEFAULT_CACHE, load_stack
from bushel.partition import PIXEL_ACRES, band_low_ft, partition

MULTI_ZONE = [
    "carr-2018",
    "north-complex-2020",
    "creek-2020",
    "caldor-2021",
    "dixie-2021",
    "mosquito-2022",
]
CACHED = [f for f in MULTI_ZONE if (DEFAULT_CACHE / "fires" / f / "stack.npz").exists()]
needs_cache = pytest.mark.skipif(len(CACHED) < 5, reason="needs >=5 cached multi-zone stacks")


def assert_no_merge(labels, cells, seed_zone, dem_m):
    inside = labels >= 0
    lab = labels[inside].astype(np.int64)
    zone = seed_zone[inside].astype(np.int64)
    band = band_low_ft(dem_m[inside])
    # Each label maps to exactly one (zone, band) pair ...
    triples = np.unique(np.stack([lab, zone, band], axis=1), axis=0)
    assert len(triples) == len(cells)
    assert np.array_equal(triples[:, 0], np.arange(len(cells)))
    # ... that pair is the one its cell_id names, and no two cells share a pair or an id.
    for (i, z, b), cell in zip(triples.tolist(), cells, strict=True):
        assert cell["cell_id"] == f"{z}_{b}", i
        assert cell["seed_zone"] == str(z)
        assert cell["elevation_band"] == f"{b}–{b + 500} ft"
    assert len({c["cell_id"] for c in cells}) == len(cells)
    assert len({(z, b) for _, z, b in triples.tolist()}) == len(cells)
    assert sum(c["pixels"] for c in cells) == int(inside.sum())


@needs_cache
def test_real_fires_have_zero_merged_cells():
    multi = 0
    for fire_id in CACHED:
        a, _ = load_stack(fire_id)
        # Species-free mask (no LEMMA yet): structure only, which is what this test is about.
        mask = (a["mtbs"] == 4) & a["perimeter"] & a["sra"]
        labels, cells, unpartitioned = partition(mask, a["seed_zone"], a["dem_m"])
        assert cells, fire_id
        assert_no_merge(labels, cells, a["seed_zone"], a["dem_m"])
        assert int(mask.sum()) == sum(c["pixels"] for c in cells) + unpartitioned
        zones = {c["seed_zone"] for c in cells}
        multi += len(zones) >= 2
        print(f"{fire_id}: {len(cells)} cells over zones {sorted(zones)}")
    assert multi >= 5, "SC-007 needs at least five multi-zone fires"


def test_straddling_band_is_split():
    # One zone; the west half sits at 1520 m (4987 ft), the east half at 1530 m (5020 ft):
    # the 5000 ft boundary runs between them, so the patch becomes two cells, never one.
    dem = np.full((4, 6), 1520.0, dtype=np.float32)
    dem[:, 3:] = 1530.0
    zone = np.full((4, 6), 522, dtype=np.int16)
    mask = np.ones((4, 6), dtype=bool)
    labels, cells, unpartitioned = partition(mask, zone, dem)
    assert unpartitioned == 0
    assert [(c["cell_id"], c["elevation_band"], c["pixels"]) for c in cells] == [
        ("522_4500", "4500–5000 ft", 12),
        ("522_5000", "5000–5500 ft", 12),
    ]
    assert_no_merge(labels, cells, zone, dem)


def test_straddling_zone_and_band_gives_four_cells():
    dem = np.full((4, 4), 1520.0, dtype=np.float32)
    dem[2:, :] = 1530.0
    zone = np.full((4, 4), 522, dtype=np.int16)
    zone[:, 2:] = 523
    labels, cells, _ = partition(np.ones((4, 4), dtype=bool), zone, dem)
    assert [c["cell_id"] for c in cells] == ["522_4500", "522_5000", "523_4500", "523_5000"]
    assert [c["pixels"] for c in cells] == [4, 4, 4, 4]
    assert_no_merge(labels, cells, zone, dem)


def test_unlabelled_pixels_are_counted_not_dropped():
    dem = np.full((3, 3), 1000.0, dtype=np.float32)
    zone = np.full((3, 3), 522, dtype=np.int16)
    zone[0, 0] = -1  # outside every Buck 1970 zone
    dem[1, 1] = np.nan  # DEM nodata
    mask = np.ones((3, 3), dtype=bool)
    mask[2, 2] = False
    labels, cells, unpartitioned = partition(mask, zone, dem)
    assert unpartitioned == 2
    assert cells[0]["pixels"] == 6
    assert labels[0, 0] == labels[1, 1] == labels[2, 2] == -1


def test_band_rule():
    ft = np.array([0.0, 499.9, 500.1, 5020.0, -10.0]) / 3.28084
    assert band_low_ft(ft).tolist() == [0, 0, 500, 5000, -500]
    assert PIXEL_ACRES == pytest.approx(900 / 4046.8564224)
