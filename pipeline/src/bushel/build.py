"""Artifact writer and contract validator (contracts/pipeline-output.md).

    python -m bushel.build --out ../web/public/data

Acreage tolerance, one rule for every "sums to" invariant: two acreages agree when they differ by at
most max(0.5 acre, 0.1% of the larger). 0.5 acre is ~2 pixels at 30 m; 0.1% absorbs vector-vs-raster
and rounding drift on large fires. `interior <= high severity` is exact (interior is a subset mask).
"""

import argparse
import csv
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer
from rasterio import Affine
from rasterio.features import shapes
from shapely.geometry import MultiPolygon, mapping, shape

from bushel.factors import DATA_DIR, factors
from bushel.fetch import DEFAULT_CACHE, demo_fires, load_fire_vectors, load_stack
from bushel.interior import finding as interior_finding
from bushel.interior import planting, seed_limited_interior
from bushel.jurisdiction import clip, retained_geometry
from bushel.jurisdiction import finding as jurisdiction_finding
from bushel.partition import acres, partition
from bushel.severity import COVERAGE_YEARS, check_year, high_severity
from bushel.species import (
    ALLOCATION_SOURCE,
    SPECIES,
    allocate,
    check_species,
    conifer,
    no_conifer_finding,
)

EMPTY_RESULTS = ("no_retained_area", "no_conifer", "no_interior")
GEOJSON_LAYERS = ("perimeter", "retained", "high_severity", "interior", "cell")


class ContractViolation(Exception):
    """A per-fire artifact broke a pipeline-output.md invariant. The build must stop."""


class MissingSpeciesLayer(RuntimeError):
    """The cached stack has no LEMMA species array. The build must stop, not guess."""


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(0.5, 0.001 * max(abs(a), abs(b)))


def _year_ok(year) -> bool:
    return isinstance(year, int) and COVERAGE_YEARS[0] <= year <= COVERAGE_YEARS[1]


def validate_fire(record: dict) -> None:
    """Raise ContractViolation listing every broken invariant in a fires/{id}.json record."""
    errors = []
    missing = [k for k in ("fire", "retained", "geometry_ref") if k not in record]
    if missing:
        raise ContractViolation(f"missing sections: {missing}")

    fire, retained = record["fire"], record["retained"]
    fid = fire.get("id")
    if not _year_ok(fire.get("year")):
        errors.append(f"fire year {fire.get('year')} outside coverage {list(COVERAGE_YEARS)}")
    if record["geometry_ref"] != f"fires/{fid}.geojson":
        errors.append(f"geometry_ref {record['geometry_ref']!r} != 'fires/{fid}.geojson'")

    perim, kept, out = (
        retained.get(k, 0.0) for k in ("perimeter_acres", "retained_acres", "excluded_acres")
    )
    if not _close(kept + out, perim):
        errors.append(f"retained {kept} + excluded {out} != perimeter {perim}")

    cells = record.get("cells") or []
    result = record.get("result")
    if result is not None:
        if result not in EMPTY_RESULTS:
            errors.append(f"unknown result {result!r}; expected one of {EMPTY_RESULTS}")
        if not record.get("message"):
            errors.append(f"result {result!r} carries no message")
        if cells:
            errors.append(f"result {result!r} but {len(cells)} cells present")
    elif not cells:
        errors.append("no cells and no result+message: an empty array alone is not allowed")

    planting = record.get("planting")
    if planting is None and result is None:
        errors.append("missing planting section")
    if planting is not None:
        interior = planting.get("interior_acres", 0.0)
        high = retained.get("high_severity_acres", 0.0)
        if interior > high:
            errors.append(f"interior {interior} > high severity {high}")
        total = sum(c.get("planting_acres", 0.0) for c in cells)
        if not _close(total, interior):
            errors.append(f"sum of cell planting_acres {total} != interior {interior}")

    seen = set()
    for c in cells:
        cid = c.get("cell_id")
        if cid in seen:
            errors.append(f"duplicate cell_id {cid!r}")
        seen.add(cid)
        species = c.get("species") or []
        total = sum(s.get("acres", 0.0) for s in species)
        if not _close(total, c.get("planting_acres", 0.0)):
            errors.append(
                f"cell {cid}: species acres {total} != planting {c.get('planting_acres')}"
            )
        for s in species:
            if s.get("species") not in SPECIES:
                errors.append(f"cell {cid}: {s.get('species')!r} is not one of the 15 AON species")

    if errors:
        raise ContractViolation(f"fire {fid}: " + "; ".join(errors))


def _write_json(path: Path, obj, indent: int | None = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=indent, ensure_ascii=False) + "\n", encoding="utf-8")


def write_fire(out_dir: Path, record: dict, geojson: dict) -> None:
    """Validate, then write fires/{id}.json and fires/{id}.geojson. Writes nothing on failure."""
    validate_fire(record)
    if geojson.get("type") != "FeatureCollection":
        raise ContractViolation("geojson is not a FeatureCollection")
    bad = {f.get("properties", {}).get("layer") for f in geojson.get("features", [])}
    bad -= set(GEOJSON_LAYERS)
    if bad:
        raise ContractViolation(f"geojson layers {bad} not in {GEOJSON_LAYERS}")
    fid = record["fire"]["id"]
    _write_json(Path(out_dir) / "fires" / f"{fid}.json", record)
    _write_json(Path(out_dir) / "fires" / f"{fid}.geojson", geojson, indent=None)


def write_index(out_dir: Path, records: list[dict]) -> None:
    """Write fires/index.json (§1). Every record is re-validated; coverage years are asserted."""
    for r in records:
        validate_fire(r)
    fires = [
        {
            "id": r["fire"]["id"],
            "name": r["fire"]["name"],
            "year": r["fire"]["year"],
            "discovery_date": r["fire"]["discovery_date"],
            "perimeter_acres": r["retained"]["perimeter_acres"],
            "retained_acres": r["retained"]["retained_acres"],
            "interior_acres": (r.get("planting") or {}).get("interior_acres", 0.0),
            "provisional": r["fire"].get("provisional", False),
        }
        for r in records
    ]
    _write_json(
        Path(out_dir) / "fires" / "index.json",
        {
            "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "severity_source": "MTBS thematic burn severity, class 4 = High",
            "coverage_years": list(COVERAGE_YEARS),
            "fires": fires,
        },
    )


def benchmark() -> dict:
    """reference/benchmark.json (§5). Figures from docs/02-FACTS.md and AON Table 1 CSV."""
    with open(DATA_DIR / "aon_disturbance_table1.csv", newline="") as f:
        rows = {r["year"]: r for r in csv.DictReader(f)}
    total = rows.pop("TOTAL")
    acres = int(total["acres_burned"])
    high = int(total["high_severity_acres"])
    # Assert the published totals against their own periods rather than trusting them.
    if sum(int(r["acres_burned"]) for r in rows.values()) != acres:
        raise ValueError("Table 1 acres_burned 2018-2024 does not sum to its published total")
    if sum(int(r["high_severity_acres"]) for y, r in rows.items() if y != "2024") != high:
        raise ValueError(
            "Table 1 high_severity_acres 2018-2023 does not sum to its published total"
        )
    return {
        "total_bushels": 55978,
        "unit": "bushels of conifer cones",
        "acres_burned_period": "2018-2024",
        "high_severity_period": "2018-2023",
        "period_note": (
            "The two published totals cover different windows. AON Table 1 carries no 2024 "
            "severity value, and the six years 2018-2023 sum to exactly 359,182. Compare each "
            "figure against its own period; comparing either against the wrong window is a "
            "defect, not a tolerance failure."
        ),
        "jurisdiction": "Non-federal (SRA and LRA)",
        "scope_note": (
            "25% of productive conifer forest on non-federal land, statewide - not 25% of burned "
            "acres. Driven by wildfire plus insect/disease mortality plus timber harvest."
        ),
        "acres_burned": acres,
        "high_severity_acres": high,
        "source_ref": "CAL FIRE 2025 Assessment of Needs, signed 2025-05-20",
        "known_overestimate": (
            "The AON does not explicitly exclude privately-owned industrial land and therefore "
            "somewhat overestimates need."
        ),
        "agency_self_contradiction": (
            "The AON conclusion says 'bushels of conifer seed'; its methodology and Table 2 "
            "establish cones. Methodology governs."
        ),
    }


def write_reference(out_dir: Path) -> None:
    """Write reference/factors.json (T029) and reference/benchmark.json (T017)."""
    _write_json(Path(out_dir) / "reference" / "factors.json", factors())
    _write_json(Path(out_dir) / "reference" / "benchmark.json", benchmark())


# ---- Per-fire build (T027, T028, T030, T049, T051) ----------------------------------------------

SIMPLIFY_M = 45  # map geometry only: 1.5 pixels, keeps each .geojson small; acreages use pixels
TO_WGS84 = Transformer.from_crs("EPSG:3310", "EPSG:4326", always_xy=True)


def _species(arrays: dict, fire_id: str) -> np.ndarray:
    """The LEMMA species array, or a loud stop. A missing layer is never read as 'no conifer'."""
    if "species" not in arrays:
        raise MissingSpeciesLayer(
            f"{fire_id}: the cached stack has no 'species' array. The LEMMA GNN 2023.1 "
            "dominant-species layer (TREEPLBA, dominant tree species by basal area) has not been "
            "obtained, so no fire record can be built: a missing layer is not the same as 'no "
            f"conifer'. Add the species array to data/cache/fires/{fire_id}/stack.npz "
            "(bushel.fetch) and rebuild."
        )
    check_species(arrays["species"], arrays["perimeter"].shape)
    return arrays["species"]


def _feature(geom, properties: dict) -> dict | None:
    """Simplify in metres, reproject to EPSG:4326, round to 4 decimals (~10 m, under the 45 m
    simplification)."""
    if geom is None or geom.is_empty:
        return None
    geom = geom.simplify(SIMPLIFY_M)

    def to_wgs84(xy):
        lon, lat = TO_WGS84.transform(xy[:, 0], xy[:, 1])
        return np.round(np.column_stack([lon, lat]), 4)

    geom = shapely.transform(geom, to_wgs84)
    return {"type": "Feature", "geometry": mapping(geom), "properties": properties}


def _polygonize(values: np.ndarray, mask: np.ndarray, transform: Affine) -> dict:
    """{value: MultiPolygon} for the masked pixels of an integer raster (EPSG:3310)."""
    parts: dict[int, list] = {}
    for geom, value in shapes(values, mask=mask, transform=transform):
        parts.setdefault(int(value), []).append(shape(geom))
    return {v: MultiPolygon(polys) for v, polys in parts.items()}


def fire_geojson(perimeter, retained, high, labels, cells, transform) -> dict:
    """fires/{id}.geojson (§3): one FeatureCollection, every feature tagged with its layer."""
    inside = labels >= 0
    rasters = {
        "high_severity": _polygonize(high.astype(np.uint8), high, transform).get(1),
        "interior": _polygonize(inside.astype(np.uint8), inside, transform).get(1),
    }
    features = [
        _feature(perimeter, {"layer": "perimeter"}),
        _feature(retained, {"layer": "retained"}),
        _feature(rasters["high_severity"], {"layer": "high_severity"}),
        _feature(rasters["interior"], {"layer": "interior"}),
    ]
    for i, geom in sorted(_polygonize(labels, inside, transform).items()):
        c = cells[i]
        features.append(
            _feature(
                geom,
                {
                    "layer": "cell",
                    "cell_id": c["cell_id"],
                    "seed_zone": c["seed_zone"],
                    "elevation_band": c["elevation_band"],
                },
            )
        )
    return {"type": "FeatureCollection", "features": [f for f in features if f]}


def build_fire(fire_id: str, cache_dir: Path | str = DEFAULT_CACHE) -> tuple[dict, dict]:
    """(record, geojson) for one cached fire: jurisdiction -> severity -> interior -> partition ->
    species. The record is validated before it is returned."""
    arrays, meta = load_stack(fire_id, cache_dir)
    reason = check_year(meta.get("year"))
    if reason:
        raise ValueError(f"{fire_id}: refused. {reason}")
    if not meta.get("perimeter_source_date"):
        raise ContractViolation(f"{fire_id}: meta.json carries no perimeter_source_date")
    species = _species(arrays, fire_id)

    # Jurisdiction: vector acres (exact), raster mask for everything downstream.
    perimeter_gdf, sra_gdf = load_fire_vectors(fire_id, cache_dir)
    clipped = clip(perimeter_gdf, sra_gdf)
    retained = arrays["perimeter"] & arrays["sra"]
    is_conifer = conifer(species)

    # Severity: high on all land for the distance transform; the reported acres are the domain.
    hs_all = high_severity(arrays)
    high = hs_all & retained & is_conifer

    # Interior (US2) sits between severity and partition, so the order covers only the interior.
    interior = seed_limited_interior(hs_all, retained, is_conifer)
    labels, cells, unpartitioned_px = partition(interior, arrays["seed_zone"], arrays["dem_m"])
    allocation = allocate(labels, species, len(cells))

    high_acres = acres(high.sum())
    interior_acres = acres((labels >= 0).sum())
    record = {
        "fire": {
            "id": fire_id,
            "name": meta["name"],
            "year": int(meta["year"]),
            "discovery_date": meta["discovery_date"],
            "perimeter_source_date": meta["perimeter_source_date"],
            "provisional": bool(meta.get("provisional", False)),
        },
        "retained": {
            "perimeter_acres": round(clipped["perimeter_acres"], 4),
            "retained_acres": round(clipped["retained_acres"], 4),
            "excluded_acres": round(clipped["excluded_acres"], 4),
            "excluded_reason": clipped["excluded_reason"],
            "high_severity_acres": high_acres,
            "conifer_acres": acres((retained & is_conifer).sum()),
        },
        "planting": planting(interior_acres, high_acres, acres(unpartitioned_px)),
        "cells": [
            {
                "cell_id": c["cell_id"],
                "seed_zone": c["seed_zone"],
                "elevation_band": c["elevation_band"],
                "planting_acres": acres(c["pixels"]),
                "allocation_source": ALLOCATION_SOURCE,
                "species": allocation[i],
            }
            for i, c in enumerate(cells)
        ],
        "geometry_ref": f"fires/{fire_id}.geojson",
    }
    found = (
        jurisdiction_finding(clipped)
        or no_conifer_finding(species, retained)
        or interior_finding(interior_acres)
    )
    if found:
        record["cells"] = []
        record.update(found)
    validate_fire(record)

    geojson = fire_geojson(
        perimeter_gdf.union_all(),
        retained_geometry(perimeter_gdf, sra_gdf),
        high,
        labels,
        cells,
        Affine(*meta["transform"]),
    )
    return record, geojson


def build_all(out_dir: Path, cache_dir: Path | str = DEFAULT_CACHE) -> list[dict]:
    """Reference artifacts, every demo fire (T030: the cached 2018-2023 set), then the index."""
    write_reference(out_dir)
    # Per-fire builds. Every fire is built and validated before any is written, so one failure
    # (a missing LEMMA species layer, an out-of-window year, a broken invariant) writes no fire.
    built = []
    for fire in demo_fires():
        start = time.perf_counter()
        built.append(build_fire(fire["id"], cache_dir))
        print(f"  built {fire['id']} in {time.perf_counter() - start:.1f} s")
    for record, geojson in built:
        write_fire(out_dir, record, geojson)
    records = [record for record, _ in built]
    write_index(out_dir, records)
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Bushel's static data artifacts.")
    parser.add_argument(
        "--out", type=Path, required=True, help="artifact root, e.g. web/public/data"
    )
    build_all(parser.parse_args().out)


if __name__ == "__main__":
    main()
