"""Phase 2 seams between fetch.py (stacks), species.py (index order), build.py (validator), web."""

import json
import re
from pathlib import Path

import pytest

from bushel.build import validate_fire, write_fire, write_index
from bushel.fetch import (
    DEFAULT_CACHE,
    LEMMA_TO_CANONICAL,
    RES,
    demo_fires,
    load_fire_vectors,
    load_stack,
    species_index,
)
from bushel.species import SPECIES

ROOT = Path(__file__).resolve().parents[2]
NOTES = ROOT / "specs/001-post-fire-seed-order/contracts/implementation-notes.md"
WEB_FIRE = ROOT / "web/tests/fixtures/fire.json"
ACRE = 4046.8564224
BUILT = [
    f["id"] for f in demo_fires() if (DEFAULT_CACHE / "fires" / f["id"] / "stack.npz").exists()
]
# Keys of web/src/convert/types.ts FireIndexEntry.
WEB_INDEX_KEYS = {
    "id",
    "name",
    "year",
    "discovery_date",
    "perimeter_acres",
    "retained_acres",
    "interior_acres",
    "provisional",
}


def test_species_index_order_is_the_pinned_order():
    section = NOTES.read_text().split("## Species — canonical names", 1)[1]
    block = section.split("```", 2)[1]
    pinned = [s.strip() for s in block.replace("\n", " ").split(",") if s.strip()]
    assert list(SPECIES) == pinned
    # fetch.py writes stack `species` values through species_index -> SPECIES position.
    for symbol, name in LEMMA_TO_CANONICAL.items():
        assert SPECIES[species_index(symbol)] == name


def test_shared_web_fixture_is_a_valid_contract_record():
    record = json.loads(WEB_FIRE.read_text())
    validate_fire(record)
    for c in record["cells"]:
        low = int(c["cell_id"].split("_")[1])
        assert c["cell_id"] == f"{c['seed_zone']}_{low}"
        assert c["elevation_band"] == f"{low}–{low + 500} ft"


@pytest.mark.skipif(not BUILT, reason="no cached stacks; run python -m bushel.fetch")
@pytest.mark.parametrize("fire_id", BUILT)
def test_record_from_real_stack_validates_and_indexes(fire_id, tmp_path):
    a, meta = load_stack(fire_id, DEFAULT_CACHE)
    per, sra = load_fire_vectors(fire_id, DEFAULT_CACHE)
    g = per.geometry.iloc[0]
    perim = g.area / ACRE
    kept = g.intersection(sra.union_all()).area / ACRE
    # Only the record's shape is under test; cells come from the shared web fixture.
    hs = (a["mtbs"] == 4) & a["perimeter"] & a["sra"] & (a["species"] >= 0)
    high = float(hs.sum() * RES * RES / ACRE)
    shared = json.loads(WEB_FIRE.read_text())
    fire_keys = ("id", "name", "year", "discovery_date", "perimeter_source_date", "provisional")
    record = {
        "fire": {k: meta[k] for k in fire_keys},
        "retained": {
            "perimeter_acres": perim,
            "retained_acres": kept,
            "excluded_acres": perim - kept,
            "excluded_reason": "Outside State Responsibility Area",
            "high_severity_acres": high,
        },
        "planting": shared["planting"],
        "cells": shared["cells"],
        "geometry_ref": f"fires/{fire_id}.geojson",
    }
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["discovery_date"])
    write_fire(tmp_path, record, {"type": "FeatureCollection", "features": []})
    write_index(tmp_path, [record])
    index = json.loads((tmp_path / "fires" / "index.json").read_text())
    assert set(index["fires"][0]) == WEB_INDEX_KEYS
    assert index["coverage_years"] == [2018, 2023]
