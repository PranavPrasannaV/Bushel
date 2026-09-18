"""T009-T013, T017, T029: factor registries, species enum, and the reference artifacts."""

import json
from pathlib import Path

from bushel import factors as f
from bushel.build import benchmark, write_reference
from bushel.species import NO_TERMS_OF_SALE_ROW, SPECIES, TERMS_OF_SALE_ROW, Species

WEB_DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
FALLBACK = ["Knobcone Pine", "Lodgepole Pine", "Subalpine Fir", "Western White Pine"]


def by_name(doc: dict) -> dict:
    return {e["name"]: e for e in doc["published"] + doc["unpublished"]}


# T013


def test_fifteen_species_in_raster_index_order():
    assert len(SPECIES) == 15
    assert SPECIES[0] == "Big-Cone Douglas Fir" and SPECIES[-1] == "White Fir"
    assert list(SPECIES) == sorted(SPECIES)  # implementation-notes lists them alphabetically
    assert Species.DOUGLAS_FIR == "Douglas Fir"


def test_every_species_has_a_row_or_a_disclosed_gap():
    assert set(TERMS_OF_SALE_ROW) | set(NO_TERMS_OF_SALE_ROW) == set(SPECIES)
    assert not set(TERMS_OF_SALE_ROW) & set(NO_TERMS_OF_SALE_ROW)


# T009


def test_published_entries_are_cited():
    for e in f.factors()["published"]:
        assert e["status"] == "published"
        assert e["source_ref"] and e["unit"]


def test_table2_values_match_facts():
    t2 = f.lbs_clean_seed_per_bushel()["by_species"]
    assert t2["Douglas Fir"] == 0.5
    assert t2["Sugar Pine"] == 1.4
    assert t2["Ponderosa Pine"] == 1.0
    assert set(t2) == set(SPECIES)


def test_terms_of_sale_values_match_facts():
    seeds = f.seeds_per_lb()["by_species"]
    price = f.price_per_lb_usd()["by_species"]
    assert seeds["Douglas Fir"] == 30455 and price["Douglas Fir"] == 497.0
    assert seeds["Ponderosa Pine"] == 9240  # plain row, not NSTIA (7677)
    assert seeds["Sugar Pine"] == 1794 and price["Sugar Pine"] == 334.0  # Non-BRR row
    assert seeds["Big-Cone Douglas Fir"] == 4240


# T010


def test_stocking_tpa():
    s = f.stocking_tpa()
    assert (s["value"], s["min"], s["max"]) == (200, 50, 200)
    assert s["source_ref"] == "CAL FIRE AON 2025 §E"
    assert s["adjustable"] is True
    assert "worst case" in s["caveat"] and "50-200" in s["caveat"]


# T011


def test_unpublished_defaults_and_bounds():
    u = {e["name"]: e for e in f.unpublished()}
    assert set(u) == {"seeds_per_pot", "nursery_survival_rate", "probability_of_tree_in_nursery"}
    assert (u["seeds_per_pot"]["default_value"], u["seeds_per_pot"]["min"]) == (2, 1)
    assert u["seeds_per_pot"]["max"] == 4
    for name in ("nursery_survival_rate", "probability_of_tree_in_nursery"):
        assert (u[name]["default_value"], u[name]["min"], u[name]["max"]) == (0.9, 0.5, 1.0)
    for e in u.values():
        assert e["status"] == "unpublished" and e["unpublished_by"] == "CAL FIRE"
        assert e["min"] <= e["default_value"] <= e["max"]
        assert "LAMRC" in e["rationale"] and "not CAL FIRE's" in e["rationale"]
        assert "Adjust to your nursery" in e["rationale"]


def test_nursery_survival_is_not_field_survival():
    u = {e["name"]: e for e in f.unpublished()}
    assert "two-year seedling" in u["nursery_survival_rate"]["rationale"]
    assert "NOT field survival" in u["nursery_survival_rate"]["rationale"]


# T012


def test_fallback_rule():
    t2 = f.lbs_clean_seed_per_bushel()
    assert t2["fallback_species"] == FALLBACK
    for s in SPECIES:
        assert t2["fallback_applied"][s] is (s in FALLBACK)
    for s in FALLBACK:
        assert t2["by_species"][s] == t2["fallback"]["value"] == 1.0


# T017


def test_benchmark_periods_per_figure():
    b = benchmark()
    assert b["total_bushels"] == 55978
    assert (b["acres_burned"], b["acres_burned_period"]) == (1507830, "2018-2024")
    assert (b["high_severity_acres"], b["high_severity_period"]) == (359182, "2018-2023")
    assert "no 2024" in b["period_note"]
    assert "cones" in b["unit"]
    assert b["jurisdiction"] == "Non-federal (SRA and LRA)"
    assert "not 25% of burned" in b["scope_note"]
    assert "overestimates" in b["known_overestimate"]


# T029


def test_write_reference(tmp_path):
    write_reference(tmp_path)
    assert json.loads((tmp_path / "reference/factors.json").read_text()) == f.factors()
    assert json.loads((tmp_path / "reference/benchmark.json").read_text()) == benchmark()


def test_committed_reference_artifacts_are_current():
    """Re-run `python -m bushel.build --out ../web/public/data` if this fails."""
    assert json.loads((WEB_DATA / "reference/factors.json").read_text()) == f.factors()
    assert json.loads((WEB_DATA / "reference/benchmark.json").read_text()) == benchmark()
