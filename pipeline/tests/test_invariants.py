"""T016: every guarantee in contracts/pipeline-output.md §1-§2 fails the build when broken."""

import copy
import json

import pytest

from bushel.build import ContractViolation, validate_fire, write_fire, write_index


def valid_record() -> dict:
    return {
        "fire": {
            "id": "test_fire",
            "name": "Test Fire",
            "year": 2021,
            "discovery_date": "2021-08-01",
            "perimeter_source_date": "2021-10-01",
            "provisional": False,
        },
        "retained": {
            "perimeter_acres": 1000.0,
            "retained_acres": 800.0,
            "excluded_acres": 200.0,
            "excluded_reason": "Outside State Responsibility Area",
            "high_severity_acres": 300.0,
        },
        "planting": {
            "interior_acres": 60.0,
            "threshold_m": 90,
            "threshold_source": "Baker 2023, Climate 11(11):214",
            "interior_fraction": 0.2,
            "baker_reference_fraction": 0.219,
            "note": "21.9% is a cross-check on the computed fraction, never a multiplier",
        },
        "cells": [
            {
                "cell_id": "522_4500",
                "seed_zone": "522",
                "elevation_band": "4500–5000 ft",
                "planting_acres": 40.0,
                "species": [
                    {"species": "Douglas Fir", "acres": 30.0},
                    {"species": "Ponderosa Pine", "acres": 10.0},
                ],
            },
            {
                "cell_id": "522_5000",
                "seed_zone": "522",
                "elevation_band": "5000–5500 ft",
                "planting_acres": 20.0,
                "species": [{"species": "Knobcone Pine", "acres": 20.0}],
            },
        ],
        "geometry_ref": "fires/test_fire.geojson",
    }


def empty_record(result: str = "no_interior") -> dict:
    r = valid_record()
    r["planting"]["interior_acres"] = 0.0
    r["cells"] = []
    r["result"] = result
    r["message"] = (
        "All burned acres lie within natural seeding distance. No planting order required."
    )
    return r


GEOJSON = {
    "type": "FeatureCollection",
    "features": [{"type": "Feature", "geometry": None, "properties": {"layer": "perimeter"}}],
}


def broken(mutate) -> dict:
    r = copy.deepcopy(valid_record())
    mutate(r)
    return r


def test_valid_record_passes():
    validate_fire(valid_record())


def test_acreage_sum_within_tolerance_passes():
    r = valid_record()
    r["retained"]["excluded_acres"] = 200.4  # 0.4 acre drift, under the 0.5 acre floor
    validate_fire(r)


def test_retained_plus_excluded_must_equal_perimeter():
    r = broken(lambda r: r["retained"].update(excluded_acres=250.0))
    with pytest.raises(ContractViolation, match="perimeter"):
        validate_fire(r)


def test_interior_cannot_exceed_high_severity():
    r = broken(lambda r: r["retained"].update(high_severity_acres=50.0))
    with pytest.raises(ContractViolation, match="high severity"):
        validate_fire(r)


def test_cell_planting_acres_must_sum_to_interior():
    r = broken(lambda r: r["planting"].update(interior_acres=70.0))
    with pytest.raises(ContractViolation, match="sum of cell planting_acres"):
        validate_fire(r)


def test_cell_species_acres_must_sum_to_cell():
    r = broken(lambda r: r["cells"][0]["species"][0].update(acres=25.0))
    with pytest.raises(ContractViolation, match="species acres"):
        validate_fire(r)


def test_cell_ids_are_unique():
    r = broken(lambda r: r["cells"][1].update(cell_id="522_4500"))
    with pytest.raises(ContractViolation, match="duplicate cell_id"):
        validate_fire(r)


@pytest.mark.parametrize("name", ["Knobcone x Monterey Pine", "Douglas-Fir", "Bishop Pine", None])
def test_species_must_be_one_of_the_15(name):
    r = broken(lambda r: r["cells"][1]["species"][0].update(species=name))
    with pytest.raises(ContractViolation, match="15 AON species"):
        validate_fire(r)


@pytest.mark.parametrize("year", [2017, 2024, 2026])
def test_fire_year_must_be_in_coverage(year):
    r = broken(lambda r: r["fire"].update(year=year))
    with pytest.raises(ContractViolation, match="coverage"):
        validate_fire(r)


def test_geometry_ref_points_at_own_geojson():
    r = broken(lambda r: r.update(geometry_ref="fires/other.geojson"))
    with pytest.raises(ContractViolation, match="geometry_ref"):
        validate_fire(r)


def test_every_violation_is_listed():
    def mutate(r):
        r["retained"]["excluded_acres"] = 999.0
        r["cells"][1]["cell_id"] = "522_4500"

    with pytest.raises(ContractViolation) as e:
        validate_fire(broken(mutate))
    assert "perimeter" in str(e.value) and "duplicate cell_id" in str(e.value)


# Empty-result records: a reason, never an empty array alone.


@pytest.mark.parametrize("result", ["no_retained_area", "no_conifer", "no_interior"])
def test_empty_result_with_message_passes(result):
    validate_fire(empty_record(result))


def test_empty_result_may_omit_planting():
    r = empty_record("no_retained_area")
    del r["planting"]
    validate_fire(r)


def test_empty_cells_without_result_fails():
    r = empty_record()
    del r["result"], r["message"]
    with pytest.raises(ContractViolation, match="empty array alone"):
        validate_fire(r)


def test_result_without_message_fails():
    r = empty_record()
    r["message"] = ""
    with pytest.raises(ContractViolation, match="no message"):
        validate_fire(r)


def test_unknown_result_code_fails():
    r = empty_record()
    r["result"] = "nothing_here"
    with pytest.raises(ContractViolation, match="unknown result"):
        validate_fire(r)


def test_result_with_cells_fails():
    r = valid_record()
    r["result"], r["message"] = "no_interior", "No planting order required."
    with pytest.raises(ContractViolation, match="cells present"):
        validate_fire(r)


def test_empty_result_with_nonzero_interior_fails():
    r = empty_record()
    r["planting"]["interior_acres"] = 60.0
    with pytest.raises(ContractViolation, match="sum of cell planting_acres"):
        validate_fire(r)


# Writers: validate first, write nothing on failure.


def test_write_fire_writes_both_files(tmp_path):
    write_fire(tmp_path, valid_record(), GEOJSON)
    assert json.loads((tmp_path / "fires/test_fire.json").read_text(encoding="utf-8"))["cells"][0][
        "cell_id"
    ]
    assert (
        json.loads((tmp_path / "fires/test_fire.geojson").read_text(encoding="utf-8"))["type"]
        == "FeatureCollection"
    )


def test_write_fire_refuses_violating_record(tmp_path):
    r = broken(lambda r: r["retained"].update(high_severity_acres=1.0))
    with pytest.raises(ContractViolation):
        write_fire(tmp_path, r, GEOJSON)
    assert not (tmp_path / "fires").exists()


def test_write_fire_refuses_unknown_geojson_layer(tmp_path):
    bad = {"type": "FeatureCollection", "features": [{"properties": {"layer": "burn"}}]}
    with pytest.raises(ContractViolation, match="layers"):
        write_fire(tmp_path, valid_record(), bad)


def test_write_index(tmp_path):
    write_index(tmp_path, [valid_record(), empty_record()])
    index = json.loads((tmp_path / "fires/index.json").read_text(encoding="utf-8"))
    assert index["coverage_years"] == [2018, 2023]
    assert index["severity_source"] == "MTBS thematic burn severity, class 4 = High"
    assert index["fires"][0] == {
        "id": "test_fire",
        "name": "Test Fire",
        "year": 2021,
        "discovery_date": "2021-08-01",
        "perimeter_acres": 1000.0,
        "retained_acres": 800.0,
        "interior_acres": 60.0,
        "provisional": False,
    }


def test_write_index_rejects_fire_outside_coverage(tmp_path):
    r = broken(lambda r: r["fire"].update(year=2024))
    with pytest.raises(ContractViolation, match="coverage"):
        write_index(tmp_path, [valid_record(), r])
    assert not (tmp_path / "fires/index.json").exists()
