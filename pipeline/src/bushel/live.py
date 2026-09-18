"""Build any California fire on demand, from the agency services at request time.

The demo set (fetch.DEMO_FIRES) is built ahead of time from statewide downloads. This module does
the same work for one fire someone names: it finds the fire in CAL FIRE's perimeter service,
fetches only that fire's perimeter and the SRA and seed-zone features it touches, matches its MTBS
assessment by overlap, then runs the unchanged fetch.build_stack and build.build_fire.

Everything is fetched live except LEMMA, which has no public service and is read from the local
download in data/cache/lemma (fetch.LEMMA_ACCESS). Nothing here changes the method: a live build
and a demo build of the same fire go through the same code from the stack onward.
"""

import re
from pathlib import Path

import geopandas as gpd

from bushel.build import build_fire, write_fire
from bushel.fetch import (
    CRS,
    DEFAULT_CACHE,
    VECTORS,
    SchemaError,
    build_stack,
    get,
    get_json,
    layer_info,
    ms_to_date,
    now_iso,
)
from bushel.severity import COVERAGE_YEARS

FRAP = VECTORS["perimeters_2018_2024"]
MTBS = VECTORS["mtbs_perimeters"]
FIRST_YEAR, LAST_YEAR = min(COVERAGE_YEARS), max(COVERAGE_YEARS)
LIVE_DIR = "live"  # built records land in {cache}/live/fires/, beside the demo stacks
BBOX_PAD_DEG = 0.02
MIN_MTBS_OVERLAP = (
    0.3  # share of the FRAP perimeter an MTBS boundary must cover to count as a match
)
LEMMA_FILES = ("treeplba_codes.csv", "treeplba_2017.tif", "treeplba_2021.tif")


class LiveBuildError(RuntimeError):
    """A fire cannot be built live, with a reason a person can act on."""


def lemma_ready(cache: Path = DEFAULT_CACHE) -> bool:
    return all((Path(cache) / "lemma" / f).exists() for f in LEMMA_FILES)


def _quote(text: str) -> str:
    """A fire name for an ArcGIS where clause: letters, digits, space, hyphen, apostrophe only."""
    cleaned = re.sub(r"[^A-Za-z0-9 '\-]", "", text).strip().upper()
    return cleaned.replace("'", "''")


def fire_id(name: str, year: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"live-{slug}-{year}"


def search(q: str, limit: int = 25) -> list[dict]:
    """FRAP perimeters in the coverage window whose name contains `q`, largest first, one per
    (name, year). Attributes only: no geometry is fetched until a fire is built."""
    name = _quote(q)
    if len(name) < 2:
        return []
    data = get_json(
        f"{FRAP['url']}/query",
        {
            "where": (
                f"STATE='CA' AND YEAR_>={FIRST_YEAR} AND YEAR_<={LAST_YEAR} "
                f"AND UPPER(FIRE_NAME) LIKE '%{name}%'"
            ),
            "outFields": "FIRE_NAME,YEAR_,GIS_ACRES,ALARM_DATE",
            "orderByFields": "GIS_ACRES DESC",
            "returnGeometry": "false",
            "resultRecordCount": limit * 3,
        },
    )
    seen, out = set(), []
    for feat in data.get("features", []):
        a = feat["attributes"]
        frap_name, year = (a["FIRE_NAME"] or "").strip().upper(), int(a["YEAR_"])
        if not frap_name or (frap_name, year) in seen:
            continue
        seen.add((frap_name, year))
        out.append(
            {
                "id": fire_id(frap_name, year),
                "frap_name": frap_name,
                "name": frap_name.title(),
                "year": year,
                "gis_acres": round(float(a["GIS_ACRES"] or 0), 1),
                "discovery_date": ms_to_date(a["ALARM_DATE"]) if a.get("ALARM_DATE") else None,
            }
        )
    return out[:limit]


def _features(
    url: str, where: str, fields: list[str], bbox=None, page: int = 2000
) -> gpd.GeoDataFrame:
    """Page through a layer query as GeoJSON (EPSG:4326), optionally limited to a lon/lat bbox."""
    params = {
        "where": where,
        "outFields": ",".join(fields),
        "outSR": 4326,
        "geometryPrecision": 6,
        "f": "geojson",
    }
    if bbox is not None:
        params |= {
            "geometry": ",".join(f"{v:.6f}" for v in bbox),
            "geometryType": "esriGeometryEnvelope",
            "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
        }
    features, offset = [], 0
    while True:
        data = get(
            f"{url}/query", params | {"resultOffset": offset, "resultRecordCount": page}
        ).json()
        if "error" in data:
            raise SchemaError(f"{url}: {data['error']}")
        features += data["features"]
        offset += len(data["features"])
        if not data["features"] or not data.get("properties", {}).get("exceededTransferLimit"):
            break
    if not features:
        return gpd.GeoDataFrame({f: [] for f in fields}, geometry=[], crs="EPSG:4326").to_crs(CRS)
    return gpd.GeoDataFrame.from_features(features, crs="EPSG:4326").to_crs(CRS)


def _layer(url: str, fields: list[str]) -> dict:
    info = layer_info(url, fields)
    return {
        "source_url": url,
        "retrieved_at": now_iso(),
        "source_last_edit": info["source_last_edit"],
    }


def fetch_layers(frap_name: str, year: int, progress=print) -> tuple[dict, dict, dict]:
    """(fire, layers, manifest) for one fire, in the shape fetch.build_stack expects."""
    if not FIRST_YEAR <= year <= LAST_YEAR:
        raise LiveBuildError(
            f"{year} is outside {FIRST_YEAR}-{LAST_YEAR}, the window with MTBS severity and a "
            "published benchmark."
        )
    name = _quote(frap_name)
    progress("Perimeter from CAL FIRE's historic fire perimeters (FRAP)")
    perim = _features(
        FRAP["url"], f"STATE='CA' AND YEAR_={year} AND UPPER(FIRE_NAME)='{name}'", FRAP["fields"]
    )
    if perim.empty:
        raise LiveBuildError(f"No FRAP perimeter for {frap_name} {year}.")
    perim["FIRE_NAME"] = perim["FIRE_NAME"].str.strip().str.upper()
    largest = perim.sort_values("GIS_ACRES", ascending=False).iloc[0]
    geom = gpd.GeoSeries([largest.geometry], crs=CRS).make_valid().buffer(0).iloc[0]
    lon0, lat0, lon1, lat1 = gpd.GeoSeries([geom], crs=CRS).to_crs(4326).total_bounds
    bbox = (lon0 - BBOX_PAD_DEG, lat0 - BBOX_PAD_DEG, lon1 + BBOX_PAD_DEG, lat1 + BBOX_PAD_DEG)

    progress("State Responsibility Area and seed zones inside the fire's extent")
    sra = _features(VECTORS["sra"]["url"], "1=1", VECTORS["sra"]["fields"], bbox)
    zones = _features(VECTORS["seed_zones"]["url"], "1=1", VECTORS["seed_zones"]["fields"], bbox)
    if zones.empty:
        raise LiveBuildError("No California seed zone intersects this fire.")

    progress("Matching the fire's MTBS burn-severity assessment by overlap")
    mtbs = _features(MTBS["url"], f"fire_id LIKE 'CA%' AND year={year}", MTBS["fields"], bbox, 100)
    if mtbs.empty:
        raise LiveBuildError(
            f"MTBS has no {year} assessment near this fire "
            "(MTBS maps western fires of 1,000+ acres)."
        )
    overlap = mtbs.geometry.make_valid().buffer(0).intersection(geom).area / geom.area
    best = int(overlap.to_numpy().argmax())
    if overlap.iloc[best] < MIN_MTBS_OVERLAP:
        raise LiveBuildError(
            f"No MTBS {year} boundary covers at least {MIN_MTBS_OVERLAP:.0%} of this perimeter."
        )

    manifest = {
        "perimeters_2018_2024": _layer(FRAP["url"], FRAP["fields"]),
        "sra": _layer(VECTORS["sra"]["url"], VECTORS["sra"]["fields"]),
        "seed_zones": _layer(VECTORS["seed_zones"]["url"], VECTORS["seed_zones"]["fields"]),
        "mtbs_perimeters": _layer(MTBS["url"], MTBS["fields"]),
    }
    fire = {
        "id": fire_id(largest["FIRE_NAME"], year),
        "name": largest["FIRE_NAME"].title(),
        "frap_name": largest["FIRE_NAME"],
        "year": year,
        "mtbs_fire_id": mtbs.iloc[best]["fire_id"],
    }
    layers = {
        "perimeters_2018_2024": perim,
        "sra": sra,
        "seed_zones": zones,
        "mtbs_perimeters": mtbs,
    }
    return fire, layers, manifest


def index_entry(record: dict) -> dict:
    """The fires/index.json entry for a built record (contracts/pipeline-output.md §1)."""
    f, r = record["fire"], record["retained"]
    return {
        "id": f["id"],
        "name": f["name"],
        "year": f["year"],
        "discovery_date": f["discovery_date"],
        "perimeter_acres": r["perimeter_acres"],
        "retained_acres": r["retained_acres"],
        "interior_acres": (record.get("planting") or {}).get("interior_acres", 0.0),
        "provisional": f["provisional"],
    }


def build(frap_name: str, year: int, cache: Path = DEFAULT_CACHE, progress=print) -> dict:
    """Fetch, stack, build and write one fire. Returns its index entry plus provenance."""
    cache = Path(cache)
    if not lemma_ready(cache):
        raise LiveBuildError(
            "The LEMMA vegetation files are not in data/cache/lemma. LEMMA has no public service; "
            "download GNN.2023.1 TREEPLBA (California, model years 2017 and 2021) from "
            "https://lemmadownload.forestry.oregonstate.edu and place the files there."
        )
    fire, layers, manifest = fetch_layers(frap_name, year, progress)
    progress("Exporting MTBS severity and 3DEP elevation, reading LEMMA species")
    meta = build_stack(fire, cache, layers, manifest)
    progress("Seed-limited interior, seed zone x elevation cells, species allocation")
    record, geojson = build_fire(fire["id"], cache)
    write_fire(cache / LIVE_DIR, record, geojson)
    return {
        "entry": index_entry(record),
        "mtbs_fire_id": fire["mtbs_fire_id"],
        "sources": {k: v["source_url"] for k, v in meta["layers"].items()},
        "built_at": now_iso(),
    }
