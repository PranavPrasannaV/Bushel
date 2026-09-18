"""T021: the SRA clip reconciles to the perimeter, and a fully federal burn is a stated finding."""

import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import box

from bushel.build import _close
from bushel.fetch import DEFAULT_CACHE, demo_fires, load_fire_vectors, load_stack
from bushel.jurisdiction import ACRE_M2, EXCLUDED_REASON, clip, finding, retained_geometry

CACHED = [f["id"] for f in demo_fires() if (DEFAULT_CACHE / "fires" / f["id"]).exists()]
needs_cache = pytest.mark.skipif(not CACHED, reason="no cached fires; run python -m bushel.fetch")


def gdf(*geoms) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(geometry=list(geoms), crs="EPSG:3310")


def test_half_in_sra_splits_exactly():
    perimeter = gdf(box(0, 0, 2000, 1000))
    sra = gdf(box(1000, -500, 5000, 1500))  # covers the east half
    c = clip(perimeter, sra)
    half = 1000 * 1000 / ACRE_M2
    assert c["perimeter_acres"] == pytest.approx(2 * half)
    assert c["retained_acres"] == pytest.approx(half)
    assert c["excluded_acres"] == pytest.approx(half)
    assert c["excluded_reason"] == EXCLUDED_REASON == "Outside State Responsibility Area"
    assert finding(c) is None
    assert retained_geometry(perimeter, sra).area == pytest.approx(1000 * 1000)


def test_fully_federal_burn_is_a_finding_not_an_empty_order():
    perimeter = gdf(box(0, 0, 2000, 1000))
    sra = gdf(box(10_000, 10_000, 12_000, 12_000))  # SRA exists nearby but misses the fire
    c = clip(perimeter, sra)
    assert c["retained_acres"] == 0
    assert c["excluded_acres"] == pytest.approx(c["perimeter_acres"])
    assert finding(c) == {
        "result": "no_retained_area",
        "message": "Entire perimeter lies outside State Responsibility Area.",
    }


def test_no_sra_polygons_at_all_is_a_finding():
    c = clip(gdf(box(0, 0, 2000, 1000)), gdf())
    assert c["retained_acres"] == 0
    assert finding(c)["result"] == "no_retained_area"


def test_rejects_geographic_crs():
    with pytest.raises(ValueError, match="EPSG:3310"):
        clip(gdf(box(0, 0, 1, 1)).set_crs("EPSG:4326", allow_override=True), gdf())


@needs_cache
@pytest.mark.parametrize("fire_id", CACHED)
def test_real_fire_sums_reconcile_to_perimeter(fire_id):
    perimeter, sra = load_fire_vectors(fire_id)
    c = clip(perimeter, sra)
    assert c["retained_acres"] > 0 and c["excluded_acres"] >= 0
    assert _close(c["retained_acres"] + c["excluded_acres"], c["perimeter_acres"])

    # The raster retained mask used downstream agrees with the exact vector clip (within 1%).
    arrays, _ = load_stack(fire_id)
    raster = np.count_nonzero(arrays["perimeter"] & arrays["sra"]) * 900 / ACRE_M2
    assert raster == pytest.approx(c["retained_acres"], rel=0.01)
