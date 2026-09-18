"""T060: the benchmark comparison always carries attribution, never a bare number (US3).

Synthetic inputs only; the statewide vector work in bushel.validate.main is not re-run here.
"""

import copy
import json
from pathlib import Path

import pytest

from bushel.build import benchmark
from bushel.factors import factors
from bushel.validate import (
    PeriodError,
    acres_burned_check,
    assert_attributed,
    attributed_gap,
    build_result,
    fire_bushels,
    high_severity_check,
    parse_period,
    rollup,
)

WEB_DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
BENCH = benchmark()
F = factors()
BURNED = {2018: 1000.0, 2019: 1000.0, 2020: 1000.0, 2021: 1000.0, 2022: 1000.0, 2023: 1000.0}
BURNED_2024 = BURNED | {2024: 50_000.0}


def fire(fid: str, year: int, high: float = 100.0, burned: float = 500.0) -> dict:
    return {
        "id": fid,
        "year": year,
        "high_severity_acres": high,
        "burned_sra_acres": burned,
        "conifer_filter": False,
    }


def record(fid: str, year: int, species: list[tuple[str, float]], retained: float = 500.0) -> dict:
    acres = sum(a for _, a in species)
    return {
        "fire": {"id": fid, "name": fid, "year": year},
        "retained": {"retained_acres": retained},
        "cells": [
            {
                "cell_id": "522_4500",
                "seed_zone": "522",
                "elevation_band": "4500–5000 ft",
                "planting_acres": acres,
                "species": [{"species": s, "acres": a} for s, a in species],
            }
        ],
    }


def full_result(records: list[dict], fires: list[dict]) -> dict:
    acres = acres_burned_check(BURNED_2024, BENCH)
    high = high_severity_check(fires, BURNED_2024, BENCH)
    roll = rollup(records, F, BENCH, BURNED_2024)
    gaps = attributed_gap(acres, high, roll, F, "2026-04-09", 1234.0)
    return build_result(acres, high, roll, gaps, BENCH)


# ---- periods -------------------------------------------------------------------------------------


def test_periods_come_from_the_published_benchmark():
    assert parse_period(BENCH["acres_burned_period"]) == (2018, 2024)
    assert parse_period(BENCH["high_severity_period"]) == (2018, 2023)
    shipped = WEB_DATA / "reference" / "benchmark.json"
    if shipped.exists():
        assert json.loads(shipped.read_text())["high_severity_period"] == "2018-2023"


def test_high_severity_comparison_never_includes_2024_fires():
    fires = [fire("a-2021", 2021, high=100.0), fire("b-2024", 2024, high=99_999.0, burned=9e6)]
    check = high_severity_check(fires, BURNED_2024, BENCH)
    assert check["computed"] == 100.0
    assert [f["id"] for f in check["fires"]] == ["a-2021"]
    assert check["excluded"][0]["id"] == "b-2024"
    # the coverage denominator is the 2018-2023 window too, never 2024 burned acreage
    assert check["window_burned_sra_acres"] == 6000.0
    assert all(f["year"] <= 2023 for f in check["fires"])


def test_a_severity_window_reaching_2024_is_refused():
    wrong = BENCH | {"high_severity_period": "2018-2024"}
    with pytest.raises(PeriodError):
        high_severity_check([fire("a", 2021)], BURNED_2024, wrong)


def test_acres_burned_is_compared_over_its_own_2018_2024_window():
    check = acres_burned_check(BURNED_2024 | {2017: 1e9}, BENCH)
    assert check["period"] == "2018-2024"
    assert check["computed"] == 56_000.0  # 2018-2024 inclusive, 2017 ignored
    assert check["coverage"] == "full"
    assert check["within_tolerance"] is False and check["status"] == "fail"


def test_bushel_rollup_is_over_the_severity_window_and_says_so():
    records = [
        record("in-2022", 2022, [("Douglas Fir", 10.0)]),
        record("out-2024", 2024, [("Douglas Fir", 1e6)]),
    ]
    roll = rollup(records, F, BENCH, BURNED_2024)
    assert roll["window"] == "2018-2023"
    assert roll["fires_included"] == ["in-2022"]
    assert roll["fires_excluded"][0]["id"] == "out-2024"
    assert "stops at 2023" in roll["window_note"]


def test_a_wrong_window_in_the_result_is_a_defect():
    result = full_result([], [fire("a", 2021)])
    result["acreage_check"]["high_severity"]["period"] = "2018-2024"
    with pytest.raises(PeriodError):
        assert_attributed(result, BENCH)


# ---- attribution --------------------------------------------------------------------------------


@pytest.mark.parametrize("with_records", [False, True])
def test_comparison_always_carries_attribution(with_records):
    records = [record("r", 2021, [("Douglas Fir", 30.0)])] if with_records else []
    result = full_result(records, [fire("a", 2021)])
    gaps = " ".join(result["attributed_gap"])
    for must in (
        "timberland",
        "privately-owned industrial land",
        "Partial fire coverage",
        "not published by CAL FIRE",
        "2026-04-09",
        "2018-2024",
        "not a per-burn figure",
        "Local Responsibility Area",
    ):
        assert must in gaps, must
    assert "25% of productive conifer forest on non-federal land, statewide" in gaps
    for check in result["acreage_check"].values():
        assert check["period"] and check["note"] and check["coverage"]
    assert result["rollup"]["window_note"] and result["rollup"]["statement"]
    if with_records:
        assert result["computed_total_bushels"] is not None
        assert result["difference_pct"] is not None


def test_a_bare_number_is_refused():
    result = full_result([record("r", 2021, [("Douglas Fir", 30.0)])], [fire("a", 2021)])
    bare = copy.deepcopy(result) | {"attributed_gap": []}
    with pytest.raises(ValueError):
        assert_attributed(bare, BENCH)


def test_bushels_are_never_called_seed():
    text = json.dumps(full_result([record("r", 2021, [("Douglas Fir", 30.0)])], [fire("a", 2021)]))
    assert "bushels of cones" in text
    assert "bushels of seed" not in text.lower()
    assert "bushels of conifer seed" not in text.lower()


# ---- partial coverage and the empty set ---------------------------------------------------------


def test_partial_coverage_is_reported_as_partial_not_suppressed():
    check = high_severity_check([fire("a", 2021, high=100.0, burned=1500.0)], BURNED, BENCH)
    assert check["coverage"] == "partial"
    assert check["coverage_fraction"] == 0.25
    assert check["computed"] == 100.0 and check["difference_pct"] is not None
    assert check["status"] == "partial" and check["within_tolerance"] is None

    roll = rollup([record("r", 2021, [("Douglas Fir", 30.0)], retained=600.0)], F, BENCH, BURNED)
    assert roll["coverage"] == "partial" and roll["coverage_fraction"] == 0.1
    assert roll["computed_total_bushels"] is not None
    assert roll["statement"].startswith("Partial")


def test_missing_year_makes_acres_burned_partial():
    check = acres_burned_check(BURNED, BENCH)  # no 2024
    assert check["coverage"] == "partial" and check["missing_years"] == [2024]
    assert check["status"] == "partial" and check["within_tolerance"] is None


def test_empty_fire_set_is_a_stated_finding_not_a_zero():
    result = full_result([], [])
    assert result["coverage"] == "none"
    assert result["computed_total_bushels"] is None and result["difference_pct"] is None
    assert "No bushel total is reported" in result["rollup"]["statement"]
    high = result["acreage_check"]["high_severity"]
    assert high["coverage"] == "none" and high["computed"] is None
    assert result["attributed_gap"]


# ---- arithmetic matches the web conversion ------------------------------------------------------


def test_fire_bushels_matches_the_contract_formula():
    r = record("r", 2021, [("Douglas Fir", 30.0), ("Ponderosa Pine", 10.0), ("Knobcone Pine", 5.0)])
    bushels, gap = fire_bushels(r, F)
    # trees = acres x 200; seedlings/lb = (seeds/lb / 2) x 0.9 x 0.9; bushels = lb / lb-per-bushel
    doug = 30 * 200 / (30455 / 2 * 0.81) / 0.5
    pond = 10 * 200 / (9240 / 2 * 0.81) / 1.0
    assert bushels == pytest.approx(doug + pond)
    assert gap == 5.0  # Knobcone Pine has no Terms of Sale row: disclosed gap, never bushels


def test_shipped_validation_json_is_consistent_if_present():
    path = WEB_DATA / "reference" / "validation.json"
    if not path.exists():
        pytest.skip("validation.json not generated yet")
    shipped = json.loads(path.read_text())
    assert_attributed(shipped, BENCH)


def test_conifer_filter_reports_unfiltered_and_two_species_but_compares_single_dominant():
    conifer = {y: v / 2 for y, v in BURNED_2024.items()}
    two = {y: v * 0.6 for y, v in BURNED_2024.items()}
    acres = acres_burned_check(conifer, BENCH, all_cover=BURNED_2024, two_species=two)
    assert acres["conifer_filter"] is True
    assert acres["computed"] == pytest.approx(sum(conifer.values()), abs=0.1)
    assert acres["two_species_sensitivity"] == pytest.approx(sum(two.values()), abs=0.1)
    assert f"{sum(BURNED_2024.values()):,.0f} acres" in acres["note"]
    high = high_severity_check([fire("a", 2020)], BURNED_2024, BENCH)
    gaps = attributed_gap(acres, high, rollup([], F, BENCH, BURNED_2024), F, None, None)
    assert any(g.startswith("Conifer definition") for g in gaps)
    assert not any("No conifer-forest filter on the statewide" in g for g in gaps)
