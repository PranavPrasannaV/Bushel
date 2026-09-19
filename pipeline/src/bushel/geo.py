"""Geography for navigation: the national map, California's counties, and each county's fires.

    python -m bushel.geo [--cache ../data/cache] [--out ../web/public/data]

Writes three files under reference/:
  us-states.geojson    every state, for the national map (Census cartographic boundary, 1:20M)
  ca-counties.geojson  California's 58 counties (Census 1:500k, simplified to 100 m)
  counties.json        per county: the built fires that burned in it, and how much of each
                       fire's perimeter and seed-limited interior lies inside it
  fire-points.json     one point per built fire (inside its perimeter), for the national map

A fire's acres inside a county are measured on its shipped map layers (fires/{id}.geojson), in
California Albers. The interior layer drops specks too small to draw, so the in-county interior is
the fire's interior acres times the share of its drawn interior that lies in the county. The
in-county bushels are the fire's default-factor order split the same way: an estimate by share,
stated as one wherever it is shown.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

import geopandas as gpd
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from bushel.factors import factors
from bushel.fetch import CRS, DEFAULT_CACHE
from bushel.statewide import _clean
from bushel.validate import DEFAULT_OUT, fire_bushels

CENSUS = "https://www2.census.gov/geo/tiger/GENZ2023/shp/"
STATES_ZIP = "cb_2023_us_state_20m.zip"
COUNTIES_ZIP = "cb_2023_us_county_500k.zip"
CA_FIPS = "06"
COUNTY_SIMPLIFY_M = 100
M2_PER_ACRE = 4046.8564224
# Puerto Rico and the island areas are outside the national map's Albers USA projection.
DROP_STATES = {"72", "60", "66", "69", "78"}


def download(name: str, cache: Path, tries: int = 5) -> Path:
    """A Census boundary zip, cached under cache/geo/."""
    path = cache / "geo" / name
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    for i in range(tries):
        try:
            with urllib.request.urlopen(CENSUS + name, timeout=120) as r:
                path.write_bytes(r.read())
            return path
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(5 * 2**i)
    return path


def _round(coords, places: int):
    if isinstance(coords, (list, tuple)) and coords and isinstance(coords[0], (int, float)):
        return [round(c, places) for c in coords]
    return [_round(c, places) for c in coords]


def _feature(geom, props: dict, places: int) -> dict:
    m = mapping(geom)
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": m["type"], "coordinates": _round(m["coordinates"], places)},
    }


def states(cache: Path) -> dict:
    """Every state and DC, as drawn on the national map."""
    gdf = gpd.read_file(f"zip://{download(STATES_ZIP, cache)}").to_crs("EPSG:4326")
    gdf = gdf[~gdf["STATEFP"].isin(DROP_STATES)].sort_values("NAME")
    features = [
        _feature(row.geometry, {"fips": row.STATEFP, "postal": row.STUSPS, "name": row.NAME}, 3)
        for row in gdf.itertuples()
    ]
    return {"type": "FeatureCollection", "features": features}


def ca_counties(cache: Path) -> gpd.GeoDataFrame:
    """California's counties in California Albers, full resolution (for measuring)."""
    gdf = gpd.read_file(f"zip://{download(COUNTIES_ZIP, cache)}")
    gdf = gdf[gdf["STATEFP"] == CA_FIPS].to_crs(CRS)
    return (
        gdf[["GEOID", "NAME", "geometry"]]
        .rename(columns={"GEOID": "fips", "NAME": "name"})
        .sort_values("name")
    )


def county_outlines(counties: gpd.GeoDataFrame) -> dict:
    simple = counties.copy()
    simple["geometry"] = simple.geometry.simplify(COUNTY_SIMPLIFY_M, preserve_topology=True)
    simple = simple.to_crs("EPSG:4326")
    features = [
        _feature(row.geometry, {"fips": row.fips, "name": row.name}, 4)
        for row in simple.itertuples()
    ]
    return {"type": "FeatureCollection", "features": features}


def _layer(fc: dict, layer: str):
    """One map layer of a fire, unioned, in California Albers (None when absent)."""
    geoms = [
        _clean(shape(f["geometry"]))
        for f in fc["features"]
        if f["properties"].get("layer") == layer
    ]
    geoms = [g for g in geoms if g is not None and not g.is_empty]
    if not geoms:
        return None
    g = unary_union(geoms)
    return gpd.GeoSeries([g], crs="EPSG:4326").to_crs(CRS).iloc[0]


def county_fires(counties: gpd.GeoDataFrame, out: Path) -> dict:
    """Per county, the built fires whose perimeter crosses it, with the in-county share of each."""
    index = json.loads((out / "fires" / "index.json").read_text(encoding="utf-8"))
    f = factors()
    by_county: dict[str, list[dict]] = {c: [] for c in counties["fips"]}
    for entry in index["fires"]:
        fc = json.loads((out / "fires" / f"{entry['id']}.geojson").read_text(encoding="utf-8"))
        record = json.loads((out / "fires" / f"{entry['id']}.json").read_text(encoding="utf-8"))
        perimeter = _layer(fc, "perimeter")
        if perimeter is None or perimeter.is_empty:
            continue
        interior = _layer(fc, "interior")
        bushels, _ = fire_bushels(record, f) if record.get("cells") else (0.0, 0.0)
        drawn_interior = interior.area if interior is not None else 0.0
        for row in counties[counties.intersects(perimeter)].itertuples():
            inside = perimeter.intersection(row.geometry).area
            if inside / perimeter.area < 0.001:  # a sliver along a shared border
                continue
            share = (
                interior.intersection(row.geometry).area / drawn_interior if drawn_interior else 0.0
            )
            by_county[row.fips].append(
                {
                    "id": entry["id"],
                    "perimeter_acres": round(inside / M2_PER_ACRE, 1),
                    "perimeter_share": round(inside / perimeter.area, 4),
                    "interior_acres": round(entry["interior_acres"] * share, 1),
                    "bushels": round(bushels * share, 2),
                }
            )
    result = {}
    for row in counties.itertuples():
        fires = sorted(by_county[row.fips], key=lambda x: -x["interior_acres"])
        w, s, e, n = gpd.GeoSeries([row.geometry], crs=CRS).to_crs("EPSG:4326").total_bounds
        result[row.fips] = {
            "fips": row.fips,
            "name": row.name,
            "bbox": [round(w, 3), round(s, 3), round(e, 3), round(n, 3)],
            "area_acres": round(row.geometry.area / M2_PER_ACRE),
            "fires": fires,
            "totals": {
                "fires": len(fires),
                "perimeter_acres": round(sum(x["perimeter_acres"] for x in fires), 1),
                "interior_acres": round(sum(x["interior_acres"] for x in fires), 1),
                "bushels": round(sum(x["bushels"] for x in fires), 1),
            },
        }
    return {
        "generated_at": index["generated_at"],
        "coverage_years": index["coverage_years"],
        "method": (
            "A fire's acres in a county are measured on its map layers in California Albers. "
            "In-county interior acres and bushels split the fire's totals by the share of its "
            "drawn interior inside the county, at default factors: an estimate, not a separate "
            "build."
        ),
        "counties": result,
    }


def fire_points(out: Path) -> dict:
    """One point inside each built fire's perimeter, with its interior acres (the national map)."""
    index = json.loads((out / "fires" / "index.json").read_text(encoding="utf-8"))
    points = []
    for entry in index["fires"]:
        fc = json.loads((out / "fires" / f"{entry['id']}.geojson").read_text(encoding="utf-8"))
        perimeter = _layer(fc, "perimeter")
        if perimeter is None or perimeter.is_empty:
            continue
        pt = gpd.GeoSeries([perimeter.representative_point()], crs=CRS).to_crs("EPSG:4326").iloc[0]
        points.append(
            [entry["id"], round(pt.x, 4), round(pt.y, 4), round(entry["interior_acres"], 1)]
        )
    return {"fields": ["id", "lon", "lat", "interior_acres"], "points": points}


def write(path: Path, doc: dict) -> None:
    path.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"{path.name}: {path.stat().st_size / 1024:.0f} kB")


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="artifact root (web/public/data)")
    args = ap.parse_args()
    ref = args.out / "reference"
    write(ref / "us-states.geojson", states(args.cache))
    counties = ca_counties(args.cache)
    write(ref / "ca-counties.geojson", county_outlines(counties))
    write(ref / "counties.json", county_fires(counties, args.out))
    write(ref / "fire-points.json", fire_points(args.out))


if __name__ == "__main__":
    main()
