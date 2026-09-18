"""Build every MTBS-assessed California fire in the benchmark window, not a chosen few (T090).

    python -m bushel.statewide --out ../web/public/data [--cache ../data/cache] [--workers 3]

Candidates are CAL FIRE (FRAP) perimeters, 2018-2023, of at least MIN_ACRES, each matched to its
MTBS assessment by overlap in the same year (as live.py does), never by name: one FRAP complex can
span several MTBS fire ids, and names repeat. Each fire goes through the unchanged
fetch.build_stack and build.build_fire and is written as soon as it builds.

Resumable: data/cache/statewide_manifest.json records every fire's outcome, and a rerun skips fires
already built. One fire failing is recorded with its reason and never stops the batch. The shipped
summary, reference/statewide.json, states how many fires were attempted, built and why any were not.
"""

import argparse
import json
import re
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import geopandas as gpd
from shapely import make_valid
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

from bushel.build import build_fire, write_fire, write_index
from bushel.fetch import CRS, DEFAULT_CACHE, build_stack, load_layers, now_iso, read_manifest
from bushel.severity import COVERAGE_YEARS

MIN_ACRES = 1000  # MTBS maps western fires of 1,000+ acres; smaller perimeters have no severity
MIN_OVERLAP = 0.3  # share of the FRAP perimeter an MTBS boundary must cover
DEFAULT_OUT = Path(__file__).resolve().parents[3] / "web" / "public" / "data"
MANIFEST = "statewide_manifest.json"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def candidates(layers: dict) -> list[dict]:
    """FRAP perimeters in the window, largest first, each with its MTBS match or why it has none.

    Ids follow the demo set's scheme, {slug}-{year}. When a name repeats in a year, the largest
    keeps the plain id and the others get -2, -3, so the demo fires keep their ids."""
    lo, hi = COVERAGE_YEARS
    frap = layers["perimeters_2018_2024"]
    frap = frap[(frap["YEAR_"] >= lo) & (frap["YEAR_"] <= hi) & (frap["GIS_ACRES"] >= MIN_ACRES)]
    frap = frap.sort_values("GIS_ACRES", ascending=False)
    mtbs = layers["mtbs_perimeters"]
    mtbs = mtbs.set_geometry(mtbs.geometry.make_valid().buffer(0))
    seen: dict[str, int] = {}
    out = []
    for idx, row in frap.iterrows():
        name = str(row["FIRE_NAME"]).strip().upper()
        year = int(row["YEAR_"])
        base = f"{slug(name)}-{year}"
        seen[base] = seen.get(base, 0) + 1
        fid = base if seen[base] == 1 else f"{slug(name)}-{seen[base]}-{year}"
        geom = gpd.GeoSeries([row.geometry], crs=CRS).make_valid().buffer(0).iloc[0]
        near = mtbs[(mtbs["year"] == year) & mtbs.intersects(geom)]
        cand = {
            "id": fid,
            "frap_index": int(idx),
            "name": name.title(),
            "frap_name": name,
            "year": year,
            "gis_acres": round(float(row["GIS_ACRES"]), 1),
            "mtbs_fire_id": None,
        }
        if near.empty:
            cand["skip"] = "no MTBS assessment overlaps this perimeter"
        else:
            share = near.geometry.intersection(geom).area / geom.area
            best = int(share.to_numpy().argmax())
            if share.iloc[best] < MIN_OVERLAP:
                cand["skip"] = (
                    f"best MTBS overlap {share.iloc[best]:.0%} is under {MIN_OVERLAP:.0%}"
                )
            else:
                cand["mtbs_fire_id"] = near.iloc[best]["fire_id"]
        out.append(cand)
    return out


_LAYERS: dict | None = None
_MANIFEST: dict | None = None


def _init(cache: str) -> None:
    global _LAYERS, _MANIFEST
    _LAYERS = load_layers(Path(cache))
    _MANIFEST = read_manifest(Path(cache))


def build_one(cand: dict, cache: str, out: str) -> dict:
    """Stack, build and write one candidate. Runs in a worker process with the layers preloaded."""
    start = time.perf_counter()
    try:
        layers = dict(_LAYERS)
        frap = layers["perimeters_2018_2024"]
        one = frap.loc[[cand["frap_index"]]].copy()
        one["FIRE_NAME"] = cand["frap_name"]  # build_stack selects by trimmed name and year
        layers["perimeters_2018_2024"] = one
        mtbs = layers["mtbs_perimeters"]
        layers["mtbs_perimeters"] = mtbs[mtbs["fire_id"] == cand["mtbs_fire_id"]]
        fire = {k: cand[k] for k in ("id", "name", "frap_name", "year", "mtbs_fire_id")}
        build_stack(fire, Path(cache), layers, _MANIFEST)
        record, geojson = build_fire(cand["id"], Path(cache))
        write_fire(Path(out), record, geojson)
        return {"status": "built", "seconds": round(time.perf_counter() - start, 1)}
    except Exception as e:  # recorded, never fatal to the batch
        return {
            "status": "failed",
            "reason": f"{type(e).__name__}: {e}"[:500],
            "seconds": round(time.perf_counter() - start, 1),
        }


# One view of California, not a fire view: display geometry only. Acres come from the records.
OVERVIEW = {
    "interior": {"close_m": 60, "min_ha": 20, "simplify_m": 200},
    "perimeter": {"close_m": 0, "min_ha": 0, "simplify_m": 500},
}


def _polygons(geom) -> list:
    """Every Polygon inside a geometry, however it is nested."""
    if geom.geom_type == "Polygon":
        return [geom]
    return [p for g in getattr(geom, "geoms", []) for p in _polygons(g)]


def _coarse(geom, close_m: float, min_ha: float, simplify_m: float):
    """Merge specks closer than close_m, drop parts under min_ha, simplify. EPSG:3310 in and out."""
    if close_m:
        geom = geom.buffer(close_m).buffer(-close_m)
    # make_valid can leave stray lines and points beside the polygons; keep polygons only.
    parts = [p for p in _polygons(geom) if p.area >= min_ha * 1e4]
    geom = MultiPolygon(parts) if len(parts) > 1 else (parts[0] if parts else Polygon())
    return geom.simplify(simplify_m)


def _rounded(coords):
    """Four decimal places of a degree is about 11 m: finer than the 200 m simplification."""
    if isinstance(coords, (list, tuple)) and coords and isinstance(coords[0], (int, float)):
        return [round(c, 4) for c in coords]
    return [_rounded(c) for c in coords]


def overview(out: Path) -> dict:
    """reference/statewide.geojson: every built fire's interior and perimeter, coarsened for one
    view of California. Built from the shipped per-fire artifacts, so it cannot disagree."""
    index = json.loads((out / "fires" / "index.json").read_text(encoding="utf-8"))
    features = []
    for entry in index["fires"]:
        fc = json.loads((out / "fires" / f"{entry['id']}.geojson").read_text(encoding="utf-8"))
        for layer, how in OVERVIEW.items():
            geoms = [
                make_valid(shape(f["geometry"]))  # map geometry is simplified, so may self-touch
                for f in fc["features"]
                if f["properties"].get("layer") == layer
            ]
            if not geoms:
                continue
            g = gpd.GeoSeries([unary_union(geoms)], crs="EPSG:4326").to_crs(CRS).iloc[0]
            g = _coarse(g, **how)
            if g.is_empty:
                continue
            g = mapping(gpd.GeoSeries([g], crs=CRS).to_crs("EPSG:4326").iloc[0])
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "layer": layer,
                        "id": entry["id"],
                        "name": entry["name"],
                        "year": entry["year"],
                        "interior_acres": round(entry["interior_acres"], 1),
                    },
                    "geometry": {"type": g["type"], "coordinates": _rounded(g["coordinates"])},
                }
            )
    return {"type": "FeatureCollection", "features": features}


def write_overview(out: Path) -> Path:
    path = out / "reference" / "statewide.geojson"
    path.write_text(json.dumps(overview(out), separators=(",", ":")) + "\n", encoding="utf-8")
    return path


def summary(cands: list[dict], results: dict) -> dict:
    built = [c for c in cands if results.get(c["id"], {}).get("status") == "built"]
    failed = [c for c in cands if results.get(c["id"], {}).get("status") == "failed"]
    skipped = [c for c in cands if c.get("skip")]
    return {
        "generated_at": now_iso(),
        "window": list(COVERAGE_YEARS),
        "min_perimeter_acres": MIN_ACRES,
        "selection": (
            f"Every CAL FIRE (FRAP) perimeter {COVERAGE_YEARS[0]}-{COVERAGE_YEARS[1]} of at least "
            f"{MIN_ACRES:,} acres, matched to its MTBS assessment by overlap in the same year."
        ),
        "candidates": len(cands),
        "built": len(built),
        "not_built": [
            {
                "id": c["id"],
                "name": c["name"],
                "year": c["year"],
                "gis_acres": c["gis_acres"],
                "reason": c.get("skip") or results[c["id"]]["reason"],
            }
            for c in skipped + failed
        ],
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Build every MTBS-assessed California fire, 2018-2023."
    )
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--limit", type=int, default=0, help="build only the N largest (0 = all)")
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument(
        "--overview-only", action="store_true", help="rewrite reference/statewide.geojson only"
    )
    args = ap.parse_args()
    if args.overview_only:
        print(f"wrote {write_overview(args.out)}")
        return

    manifest_path = args.cache / MANIFEST
    results = (
        json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    )
    cands = candidates(load_layers(args.cache))
    if args.limit:
        cands = cands[: args.limit]
    todo = [
        c
        for c in cands
        if not c.get("skip")
        and (results.get(c["id"], {}).get("status") != "built")
        and (args.retry_failed or results.get(c["id"], {}).get("status") != "failed")
    ]
    print(
        f"{len(cands)} candidates, {sum(1 for c in cands if c.get('skip'))} without MTBS, "
        f"{len(todo)} to build with {args.workers} workers"
    )

    with ProcessPoolExecutor(args.workers, initializer=_init, initargs=(str(args.cache),)) as pool:
        futures = {pool.submit(build_one, c, str(args.cache), str(args.out)): c for c in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            c = futures[fut]
            results[c["id"]] = fut.result() | {"name": c["name"], "year": c["year"]}
            manifest_path.write_text(json.dumps(results, indent=1), encoding="utf-8")
            r = results[c["id"]]
            print(
                f"[{i}/{len(todo)}] {c['id']}: {r['status']} {r['seconds']} s {r.get('reason', '')}"
            )

    fires = args.out / "fires"
    records = [
        json.loads((fires / f"{c['id']}.json").read_text(encoding="utf-8"))
        for c in cands
        if results.get(c["id"], {}).get("status") == "built"
        and (fires / f"{c['id']}.json").exists()
    ]
    write_index(args.out, records)
    ref = args.out / "reference" / "statewide.json"
    ref.write_text(json.dumps(summary(cands, results), indent=2) + "\n", encoding="utf-8")
    print(f"index: {len(records)} fires; summary at {ref}; overview at {write_overview(args.out)}")


if __name__ == "__main__":
    main()
