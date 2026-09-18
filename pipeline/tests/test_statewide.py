"""Statewide batch (T090): candidates, MTBS matching by overlap, ids and the shipped summary."""

import geopandas as gpd
from shapely.geometry import box

from bushel import statewide
from bushel.fetch import CRS

KM = 1000.0


def frap(rows):
    return gpd.GeoDataFrame(
        [{"FIRE_NAME": n, "YEAR_": y, "GIS_ACRES": a} for n, y, a, _ in rows],
        geometry=[g for *_, g in rows],
        crs=CRS,
    )


def mtbs(rows):
    return gpd.GeoDataFrame(
        [{"fire_id": i, "year": y} for i, y, _ in rows], geometry=[g for *_, g in rows], crs=CRS
    )


def layers(f, m):
    return {"perimeters_2018_2024": f, "mtbs_perimeters": m}


def test_matching_is_by_overlap_not_name_and_the_window_and_size_are_enforced():
    f = frap(
        [
            ("BIG ", 2020, 50_000, box(0, 0, 10 * KM, 10 * KM)),
            ("TINY", 2020, 500, box(20 * KM, 0, 21 * KM, 1 * KM)),  # under MIN_ACRES
            ("OLD", 2017, 9_000, box(0, 0, 5 * KM, 5 * KM)),  # outside the window
            ("NOMATCH", 2021, 9_000, box(50 * KM, 0, 55 * KM, 5 * KM)),
        ]
    )
    m = mtbs([("CA-ANY-NAME", 2020, box(1 * KM, 1 * KM, 9 * KM, 9 * KM))])
    got = {c["id"]: c for c in statewide.candidates(layers(f, m))}
    assert set(got) == {"big-2020", "nomatch-2021"}
    assert got["big-2020"]["mtbs_fire_id"] == "CA-ANY-NAME" and "skip" not in got["big-2020"]
    assert got["nomatch-2021"]["skip"] == "no MTBS assessment overlaps this perimeter"


def test_a_sliver_of_overlap_is_not_a_match():
    f = frap([("EDGE", 2021, 9_000, box(0, 0, 10 * KM, 10 * KM))])
    m = mtbs([("CA-X", 2021, box(9 * KM, 0, 20 * KM, 10 * KM))])  # 10% of the perimeter
    (c,) = statewide.candidates(layers(f, m))
    assert c["mtbs_fire_id"] is None and "under 30%" in c["skip"]


def test_repeated_names_keep_the_plain_id_for_the_largest():
    f = frap(
        [
            ("CREEK", 2020, 2_000, box(30 * KM, 0, 32 * KM, 2 * KM)),
            ("CREEK", 2020, 300_000, box(0, 0, 20 * KM, 20 * KM)),
        ]
    )
    m = mtbs(
        [("A", 2020, box(0, 0, 20 * KM, 20 * KM)), ("B", 2020, box(30 * KM, 0, 32 * KM, 2 * KM))]
    )
    ids = [c["id"] for c in statewide.candidates(layers(f, m))]
    assert ids == ["creek-2020", "creek-2-2020"]


def test_the_summary_names_every_fire_not_built_and_why():
    cands = [
        {"id": "a-2020", "name": "A", "year": 2020, "gis_acres": 5000.0},
        {"id": "b-2020", "name": "B", "year": 2020, "gis_acres": 4000.0, "skip": "no MTBS"},
        {"id": "c-2021", "name": "C", "year": 2021, "gis_acres": 3000.0},
    ]
    results = {"a-2020": {"status": "built"}, "c-2021": {"status": "failed", "reason": "boom"}}
    s = statewide.summary(cands, results)
    assert (s["candidates"], s["built"]) == (3, 1)
    assert {x["id"]: x["reason"] for x in s["not_built"]} == {"b-2020": "no MTBS", "c-2021": "boom"}
