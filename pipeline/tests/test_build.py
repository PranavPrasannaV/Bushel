"""T027/T028/T030/T049/T051: the per-fire build, on real stacks with a SYNTHETIC species layer.

LEMMA (the real species layer) is not obtained yet, so these tests inject a made-up species array
(Douglas Fir below 1500 m, White Fir above) purely to exercise the wiring. Nothing here is written
to web/public/data.
"""

import json
import re

import numpy as np
import pytest

import bushel.build as build
from bushel.build import MissingSpeciesLayer, build_all, build_fire, validate_fire, write_fire
from bushel.fetch import DEFAULT_CACHE, load_stack
from bushel.species import ALLOCATION_SOURCE, SPECIES

DF, WF = SPECIES.index("Douglas Fir"), SPECIES.index("White Fir")
LAYERS = {"perimeter", "retained", "high_severity", "interior", "cell"}
SMALL, LARGE = "mosquito-2022", "dixie-2021"
needs = pytest.mark.skipif(
    not all((DEFAULT_CACHE / "fires" / f / "stack.npz").exists() for f in (SMALL, LARGE)),
    reason="needs cached stacks; run python -m bushel.fetch",
)


def synthetic_species(fire_id, cache_dir=DEFAULT_CACHE):
    arrays, meta = load_stack(fire_id, cache_dir)
    arrays["species"] = np.where(arrays["dem_m"] < 1500, DF, WF).astype(np.int16)
    return arrays, meta


@pytest.fixture
def with_species(monkeypatch):
    monkeypatch.setattr(build, "load_stack", synthetic_species)


def coords(geometry):
    def walk(c):
        if isinstance(c[0], (int, float)):
            yield c
        else:
            for x in c:
                yield from walk(x)

    return list(walk(geometry["coordinates"]))


@needs
def test_build_fire_record_passes_the_contract(with_species):
    record, geojson = build_fire(SMALL)
    validate_fire(record)
    fire, retained, planting = record["fire"], record["retained"], record["planting"]
    assert fire["id"] == SMALL and type(fire["year"]) is int and fire["year"] == 2022
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", fire["perimeter_source_date"])
    assert retained["excluded_reason"] == "Outside State Responsibility Area"
    assert 0 < retained["high_severity_acres"] <= retained["conifer_acres"]
    assert 0 < planting["interior_acres"] <= retained["high_severity_acres"]
    assert planting["interior_fraction"] == pytest.approx(
        planting["interior_acres"] / retained["high_severity_acres"]
    )
    assert planting["baker_reference_fraction"] == 0.219 and planting["threshold_m"] == 90
    assert "result" not in record and record["cells"]
    for c in record["cells"]:
        assert c["cell_id"] == f"{c['seed_zone']}_{c['elevation_band'].split('–')[0]}"
        assert c["allocation_source"] == ALLOCATION_SOURCE
        assert {s["species"] for s in c["species"]} <= {"Douglas Fir", "White Fir"}
    # Plain JSON types only (no numpy scalars) and a stable round trip.
    assert json.loads(json.dumps(record)) == record


@needs
def test_geojson_has_every_layer_in_wgs84(with_species):
    record, geojson = build_fire(SMALL)
    assert geojson["type"] == "FeatureCollection"
    layers = [f["properties"]["layer"] for f in geojson["features"]]
    assert set(layers) == LAYERS
    cells = {c["cell_id"]: c for c in record["cells"]}
    cell_features = [f for f in geojson["features"] if f["properties"]["layer"] == "cell"]
    assert sorted(f["properties"]["cell_id"] for f in cell_features) == sorted(cells)
    for f in cell_features:
        p = f["properties"]
        assert p["seed_zone"] == cells[p["cell_id"]]["seed_zone"]
        assert p["elevation_band"] == cells[p["cell_id"]]["elevation_band"]
    for f in geojson["features"]:
        for lon, lat in coords(f["geometry"]):
            assert -125 < lon < -114 and 32 < lat < 42.1  # California, EPSG:4326
            assert round(lon, 5) == lon and round(lat, 5) == lat


@needs
def test_write_fire_round_trip(with_species, tmp_path):
    record, geojson = build_fire(SMALL)
    write_fire(tmp_path, record, geojson)
    assert json.loads((tmp_path / "fires" / f"{SMALL}.json").read_text(encoding="utf-8")) == record
    assert (tmp_path / "fires" / f"{SMALL}.geojson").stat().st_size < 3_000_000


@needs
def test_dixie_geojson_stays_small(with_species):
    record, geojson = build_fire(LARGE)
    validate_fire(record)
    assert len(json.dumps(geojson)) < 3_000_000
    zones = {c["seed_zone"] for c in record["cells"]}
    assert len(zones) >= 2


@needs
def test_no_interior_record(with_species, monkeypatch):
    def tiny_patches(fire_id, cache_dir=DEFAULT_CACHE):
        arrays, meta = synthetic_species(fire_id, cache_dir)
        # Keep only every 4th row of high severity: no pixel is more than 30 m from a live edge.
        arrays["mtbs"] = arrays["mtbs"].copy()
        arrays["mtbs"][np.arange(arrays["mtbs"].shape[0]) % 4 != 0, :] = 3
        return arrays, meta

    monkeypatch.setattr(build, "load_stack", tiny_patches)
    record, geojson = build_fire(SMALL)
    assert record["result"] == "no_interior"
    assert record["message"] == (
        "All burned acres lie within natural seeding distance. No planting order required."
    )
    assert record["cells"] == [] and record["planting"]["interior_acres"] == 0
    assert record["retained"]["high_severity_acres"] > 0
    assert "interior" not in {f["properties"]["layer"] for f in geojson["features"]}


@needs
def test_no_conifer_record(monkeypatch):
    def no_conifer(fire_id, cache_dir=DEFAULT_CACHE):
        arrays, meta = load_stack(fire_id, cache_dir)
        arrays["species"] = np.full(arrays["perimeter"].shape, -1, dtype=np.int16)
        return arrays, meta

    monkeypatch.setattr(build, "load_stack", no_conifer)
    record, _ = build_fire(SMALL)
    assert record["result"] == "no_conifer" and record["cells"] == []
    assert record["message"] == "No conifer species present in pre-fire vegetation."


@needs
def test_out_of_window_year_is_refused(with_species, monkeypatch):
    def year_2024(fire_id, cache_dir=DEFAULT_CACHE):
        arrays, meta = synthetic_species(fire_id, cache_dir)
        return arrays, {**meta, "year": 2024}

    monkeypatch.setattr(build, "load_stack", year_2024)
    with pytest.raises(ValueError, match="2024 is outside 2018–2023"):
        build_fire(SMALL)


@needs
def test_missing_species_layer_stops_the_build(tmp_path, monkeypatch):
    def without_species(fire_id, cache_dir=DEFAULT_CACHE):
        arrays, meta = load_stack(fire_id, cache_dir)
        arrays.pop("species", None)
        return arrays, meta

    monkeypatch.setattr(build, "load_stack", without_species)
    with pytest.raises(MissingSpeciesLayer, match="LEMMA GNN 2023.1"):
        build_all(tmp_path)
    assert not (tmp_path / "fires").exists()  # no record, no index, nothing defaulted to -1


@needs
def test_build_all_writes_records_and_index(with_species, monkeypatch, tmp_path):
    monkeypatch.setattr(
        build, "demo_fires", lambda: [{"id": SMALL, "year": 2022}, {"id": "mckinney-2022"}]
    )
    records = build_all(tmp_path)
    index = json.loads((tmp_path / "fires" / "index.json").read_text(encoding="utf-8"))
    assert index["coverage_years"] == [2018, 2023]
    assert [f["id"] for f in index["fires"]] == [SMALL, "mckinney-2022"]
    for r, entry in zip(records, index["fires"], strict=True):
        assert entry["interior_acres"] == r["planting"]["interior_acres"]
        assert (tmp_path / r["geometry_ref"]).exists()
    assert (tmp_path / "reference" / "factors.json").exists()
