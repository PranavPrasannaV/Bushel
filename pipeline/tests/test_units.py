"""quickstart.md Scenario 7 (pipeline side): units survive into factors.json.

The unit traps in docs/03-DO-NOT-CLAIM.md, asserted as code rather than convention.
"""

import json
import re

import pytest

from bushel.build import write_reference

GAP = ["Knobcone Pine", "Lodgepole Pine", "Subalpine Fir"]
FALLBACK = ["Knobcone Pine", "Lodgepole Pine", "Subalpine Fir", "Western White Pine"]


@pytest.fixture(scope="module")
def doc(tmp_path_factory):
    out = tmp_path_factory.mktemp("data")
    write_reference(out)
    text = (out / "reference/factors.json").read_text()
    d = json.loads(text)
    d["_text"] = text
    d["_by_name"] = {e["name"]: e for e in d["published"] + d["unpublished"]}
    return d


def test_units_are_exact_strings(doc):
    units = {name: e["unit"] for name, e in doc["_by_name"].items()}
    assert units == {
        "stocking_tpa": "trees/acre",
        "lbs_clean_seed_per_bushel": "lb clean seed / bushel of cones",
        "seeds_per_lb": "seeds/lb",
        "price_per_lb_usd": "USD/lb",
        "seeds_per_pot": "seeds/pot",
        "nursery_survival_rate": "fraction",
        "probability_of_tree_in_nursery": "fraction",
    }


def test_bushel_counts_cones_never_seed(doc):
    assert "bushel of cones" in doc["_by_name"]["lbs_clean_seed_per_bushel"]["unit"]
    assert not re.search(r"bushels? of (conifer )?seed", doc["_text"], re.I)


def test_seeds_per_lb_is_not_seedlings_per_lb(doc):
    seeds = doc["_by_name"]["seeds_per_lb"]
    assert seeds["unit"] == "seeds/lb"
    assert "NOT seedlings per pound" in seeds["warning"]
    assert "Average Seeds/pounds" in seeds["source_ref"]
    # seedlings/lb is derived in the browser from the unpublished factors, never shipped as data.
    assert "seedlings_per_lb" not in doc["_by_name"]


def test_price_comes_from_the_seed_list(doc):
    price = doc["_by_name"]["price_per_lb_usd"]
    assert price["unit"] == "USD/lb"
    assert "seed price list" in price["source_ref"]
    assert "seedling" not in price["source_ref"].lower()
    assert "Never the seedling price list" in price["warning"]


def test_four_fallback_species_are_flagged(doc):
    t2 = doc["_by_name"]["lbs_clean_seed_per_bushel"]
    assert t2["fallback_species"] == FALLBACK
    assert [s for s, flagged in t2["fallback_applied"].items() if flagged] == FALLBACK
    assert "1 bushel = 1 lb" in t2["fallback"]["rule"]


@pytest.mark.parametrize("name", ["seeds_per_lb", "price_per_lb_usd"])
def test_gap_species_are_disclosed_not_filled(doc, name):
    e = doc["_by_name"][name]
    assert sorted(e["missing_species"]) == GAP
    for s in GAP:
        assert s not in e["by_species"]
        assert "Terms of Sale" in e["missing_species"][s]


def test_no_hybrid_stands_in_for_knobcone(doc):
    assert "Knobcone x Monterey" not in doc["_text"]
    for name in ("seeds_per_lb", "price_per_lb_usd"):
        assert "Knobcone Pine" not in doc["_by_name"][name]["source_names"]


def test_ponderosa_is_the_plain_row(doc):
    assert doc["_by_name"]["seeds_per_lb"]["source_names"]["Ponderosa Pine"] == "Ponderosa Pine"


def test_status_splits_published_from_unpublished(doc):
    assert {e["status"] for e in doc["published"]} == {"published"}
    assert {e["status"] for e in doc["unpublished"]} == {"unpublished"}
