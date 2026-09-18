"""fetch.py: pure helpers always; cached layers and stacks only when data/cache is populated."""

import re

import numpy as np
import pytest
from shapely.geometry import box

from bushel.fetch import (
    DEFAULT_CACHE,
    LEMMA_TO_CANONICAL,
    RES,
    VECTORS,
    demo_fires,
    grid_for,
    lemma_year,
    load_fire_vectors,
    load_stack,
    read_manifest,
    species_index,
)
from bushel.species import SPECIES

ACRE = 4046.8564224
FIRES = DEFAULT_CACHE / "fires"
BUILT = [f["id"] for f in demo_fires() if (FIRES / f["id"] / "stack.npz").exists()]
needs_cache = pytest.mark.skipif(not BUILT, reason="no cached stacks; run python -m bushel.fetch")


def test_lemma_mapping_covers_the_15_species():
    assert set(LEMMA_TO_CANONICAL.values()) == set(SPECIES)
    assert species_index("PSME") == SPECIES.index("Douglas Fir")
    assert species_index("QUKE") == -1  # black oak: not a species of interest


def test_lemma_model_year_is_pre_fire():
    assert [lemma_year(y) for y in (2018, 2020, 2021, 2022)] == [2017, 2017, 2017, 2021]


def test_grid_snaps_to_30m_with_1km_buffer():
    geom = box(1001.0, 2002.0, 5005.0, 9009.0)
    t, (h, w) = grid_for(geom)
    assert t.a == RES and t.e == -RES
    assert t.c % RES == 0 and t.f % RES == 0
    assert t.c <= 1001 - 1000 and t.f >= 9009 + 1000
    assert t.c + w * RES >= 5005 + 1000 and t.f - h * RES <= 2002 - 1000


def test_demo_fires_are_in_the_mtbs_window():
    fires = demo_fires()
    assert 6 <= len(fires) <= 8
    assert len({f["id"] for f in fires}) == len(fires)
    for f in fires:
        assert 2018 <= f["year"] <= 2023
        assert re.fullmatch(r"[a-z0-9-]+-\d{4}", f["id"]) and f["id"].endswith(str(f["year"]))


@needs_cache
def test_manifest_records_source_and_retrieval_time():
    manifest = read_manifest(DEFAULT_CACHE)
    for name in VECTORS:
        assert manifest[name]["source_url"].startswith("https://")
        assert manifest[name]["retrieved_at"]
    assert manifest["lemma_species"]["status"] == "obtained"


@needs_cache
@pytest.mark.parametrize("fire_id", BUILT)
def test_stack_shapes_and_value_ranges(fire_id):
    a, meta = load_stack(fire_id, DEFAULT_CACHE)
    shape = tuple(meta["shape"])
    assert meta["crs"] == "EPSG:3310" and len(meta["transform"]) == 6
    assert {"perimeter", "sra", "mtbs", "dem_m", "seed_zone", "species"} <= set(a)
    for arr in a.values():
        assert arr.shape == shape
    assert a["perimeter"].dtype == bool and a["sra"].dtype == bool
    assert a["mtbs"].dtype == np.uint8 and a["mtbs"].max() <= 6
    assert a["seed_zone"].dtype == np.int16
    zones = np.unique(a["seed_zone"])
    assert ((zones == -1) | ((zones >= 91) & (zones <= 998))).all()
    p = a["perimeter"]
    assert p.any() and ((a["mtbs"] == 4) & p).any()
    dem = a["dem_m"][p]
    assert a["dem_m"].dtype == np.float32 and np.isfinite(dem).all()
    assert -100 < dem.min() and dem.max() < 4500
    assert a["species"].dtype == np.int16
    assert a["species"].min() >= -1 and a["species"].max() < len(SPECIES)
    assert (a["species"][p] >= 0).mean() > 0.1  # LEMMA aligned: conifer inside every perimeter
    assert meta["layers"]["species"]["model_year"] == lemma_year(meta["year"])
    assert meta["gaps"] == []
    for layer in ("perimeters_2018_2024", "sra", "seed_zones", "mtbs", "dem_m", "species"):
        assert meta["layers"][layer]["retrieved_at"]


@needs_cache
@pytest.mark.parametrize("fire_id", BUILT)
def test_raster_matches_vector_acreage(fire_id):
    a, _ = load_stack(fire_id, DEFAULT_CACHE)
    per, sra = load_fire_vectors(fire_id, DEFAULT_CACHE)
    g = per.geometry.iloc[0]
    px = RES * RES / ACRE
    assert a["perimeter"].sum() * px == pytest.approx(g.area / ACRE, rel=0.01)
    retained = g.intersection(sra.union_all()).area / ACRE
    assert (a["perimeter"] & a["sra"]).sum() * px == pytest.approx(retained, rel=0.01, abs=50)
