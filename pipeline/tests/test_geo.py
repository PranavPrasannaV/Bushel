"""The navigation geography (python -m bushel.geo) reconciles with the fires it describes.

Every built fire lands in a county; a fire's county shares add up to the part of it inside
California (a fire that crossed into Oregon or Nevada comes back short by exactly that); and the
county roll-up of seed-limited acres equals the fire index's own total. Runs on the shipped files.
"""

import json
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely.validation import make_valid

from bushel.fetch import CRS
from bushel.geo import _layer

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
REF = DATA / "reference"


def load(name: str):
    path = REF / name
    if not path.exists():
        pytest.skip(f"{name} not built (python -m bushel.geo)")
    return json.loads(path.read_text(encoding="utf-8"))


def fires() -> list[dict]:
    return json.loads((DATA / "fires" / "index.json").read_text(encoding="utf-8"))["fires"]


def test_every_state_is_drawn_and_california_has_58_counties():
    states = load("us-states.geojson")
    postals = {f["properties"]["postal"] for f in states["features"]}
    assert len(postals) == 51 and {"CA", "OR", "WA", "DC", "AK", "HI"} <= postals
    outlines = load("ca-counties.geojson")
    assert len(outlines["features"]) == 58
    assert all(f["properties"]["fips"].startswith("06") for f in outlines["features"])


def test_county_shares_add_up_to_the_part_of_each_fire_in_california():
    counties = load("counties.json")["counties"]
    shares: dict[str, float] = defaultdict(float)
    for c in counties.values():
        for f in c["fires"]:
            shares[f["id"]] += f["perimeter_share"]
    assert set(shares) == {f["id"] for f in fires()}, "every built fire lies in some county"
    assert all(s <= 1.0001 for s in shares.values())

    # A fire short of whole must have crossed the state line by the missing share.
    outlines = load("ca-counties.geojson")
    state = gpd.GeoSeries(
        [unary_union([make_valid(shape(f["geometry"])) for f in outlines["features"]])],
        crs="EPSG:4326",
    ).to_crs(CRS)[0]
    short = {k: v for k, v in shares.items() if v < 0.99}
    for fire_id, share in short.items():
        fc = json.loads((DATA / "fires" / f"{fire_id}.geojson").read_text(encoding="utf-8"))
        g = _layer(fc, "perimeter")  # repaired and in California Albers, as the build measured it
        outside = g.difference(state).area / g.area
        assert outside == pytest.approx(1 - share, abs=0.03), fire_id


def test_county_rollup_equals_the_fire_index():
    counties = load("counties.json")["counties"]
    by_county = sum(c["totals"]["interior_acres"] for c in counties.values())
    assert by_county == pytest.approx(sum(f["interior_acres"] for f in fires()), abs=2.0)
    for c in counties.values():
        assert c["totals"]["fires"] == len(c["fires"])
        listed = sum(f["interior_acres"] for f in c["fires"])
        assert c["totals"]["interior_acres"] == pytest.approx(listed, abs=0.2)


def test_fire_points_lie_in_california():
    points = load("fire-points.json")["points"]
    assert len(points) == len(fires())
    for _, lon, lat, _ in points:
        assert -124.6 < lon < -114.0 and 32.4 < lat < 42.1
