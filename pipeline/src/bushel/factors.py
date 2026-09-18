"""Published conversion factors and unpublished assumptions, as written to reference/factors.json.

Every figure comes from data/*.csv or docs/02-FACTS.md. Where CAL FIRE publishes nothing, the gap is
disclosed (missing_species, status "unpublished"), never filled with a guess.
"""

import csv
from pathlib import Path

from bushel.species import NO_TERMS_OF_SALE_ROW, SPECIES, TERMS_OF_SALE_ROW

DATA_DIR = Path(__file__).resolve().parents[3] / "data"

TERMS_OF_SALE_GAP = (
    "No 'Average Seeds/pounds' or seed price published for this species in CAL FIRE Terms of Sale "
    "(Feb 2026)."
)

_UNPUBLISHED_RATIONALE = (
    "No published value exists: the CAL FIRE AON sources this factor from internal, historical "
    "LAMRC nursery datasets. The default is a round general placeholder, not CAL FIRE's figure. "
    "The only related general figure is that conifer seed commonly germinates above 90% under "
    "nursery conditions, which is general and not CAL FIRE's. Adjust to your nursery's figures."
)


def _rows(filename: str) -> list[dict]:
    with open(DATA_DIR / filename, newline="") as f:
        return list(csv.DictReader(f))


def stocking_tpa() -> dict:
    """T010: 200 trees/acre, published in AON §E as a maximum-stocking worst case (research R1)."""
    return {
        "name": "stocking_tpa",
        "value": 200,
        "unit": "trees/acre",
        "status": "published",
        "source_ref": "CAL FIRE AON 2025 §E",
        "adjustable": True,
        "min": 50,
        "max": 200,
        "caveat": (
            "A maximum-stocking worst case, not a point estimate. CA Forest Practice Rule "
            "requirements range 50-200 TPA depending on location and forest management "
            "prescriptions."
        ),
    }


def lbs_clean_seed_per_bushel() -> dict:
    """T009 + T012: AON Table 2, with the 1 bushel = 1 lb fallback for species absent from it."""
    table2 = {
        r["species"]: float(r["lbs_clean_seed_per_bushel"])
        for r in _rows("table2_cones_to_seed.csv")
    }
    unknown = set(table2) - set(SPECIES)
    if unknown:
        raise ValueError(f"Table 2 species not in the 15 AON species: {sorted(unknown)}")
    fallback = 1.0
    return {
        "name": "lbs_clean_seed_per_bushel",
        "unit": "lb clean seed / bushel of cones",
        "status": "published",
        "source_ref": "CAL FIRE AON 2025 Table 2",
        "by_species": {s: table2.get(s, fallback) for s in SPECIES},
        "fallback": {
            "value": fallback,
            "rule": "AON: species absent from Table 2 assume 1 bushel = 1 lb",
        },
        "fallback_species": [s for s in SPECIES if s not in table2],
        "fallback_applied": {s: s not in table2 for s in SPECIES},
    }


def _terms_of_sale(name: str, column: str, cast, unit: str, source_ref: str, warning: str) -> dict:
    rows = {r["species"]: r for r in _rows("seed_prices.csv")}
    return {
        "name": name,
        "unit": unit,
        "status": "published",
        "source_ref": source_ref,
        "by_species": {
            s: cast(rows[TERMS_OF_SALE_ROW[s]][column]) for s in SPECIES if s in TERMS_OF_SALE_ROW
        },
        "source_names": {s: TERMS_OF_SALE_ROW[s] for s in SPECIES if s in TERMS_OF_SALE_ROW},
        "missing_species": {s: TERMS_OF_SALE_GAP for s in NO_TERMS_OF_SALE_ROW},
        "warning": warning,
    }


def seeds_per_lb() -> dict:
    return _terms_of_sale(
        "seeds_per_lb",
        "avg_seeds_per_lb",
        int,
        "seeds/lb",
        "CAL FIRE Terms of Sale Feb 2026, 'Average Seeds/pounds'",
        "Seeds per pound. NOT seedlings per pound.",
    )


def price_per_lb_usd() -> dict:
    return _terms_of_sale(
        "price_per_lb_usd",
        "price_per_lb_usd",
        float,
        "USD/lb",
        "CAL FIRE Terms of Sale Feb 2026, seed price list",
        "Seed list, denominated in pounds. Never the seedling price list.",
    )


def _unpublished(
    name: str, default: float, lo: float, hi: float, unit: str, extra: str = ""
) -> dict:
    return {
        "name": name,
        "default_value": default,
        "min": lo,
        "max": hi,
        "unit": unit,
        "status": "unpublished",
        "unpublished_by": "CAL FIRE",
        "source_ref": "Not published. CAL FIRE AON: historical LAMRC nursery datasets (internal)",
        "adjustable": True,
        "rationale": _UNPUBLISHED_RATIONALE + extra,
    }


def unpublished() -> list[dict]:
    """T011: the three factors the AON formula needs but CAL FIRE does not publish."""
    return [
        _unpublished("seeds_per_pot", 2, 1, 4, "seeds/pot"),
        _unpublished(
            "nursery_survival_rate",
            0.9,
            0.5,
            1.0,
            "fraction",
            " This is nursery survival to a two-year seedling, NOT field survival after "
            "outplanting.",
        ),
        _unpublished("probability_of_tree_in_nursery", 0.9, 0.5, 1.0, "fraction"),
    ]


def factors() -> dict:
    """The full reference/factors.json document (pipeline-output.md §4 + implementation-notes)."""
    return {
        "published": [
            stocking_tpa(),
            lbs_clean_seed_per_bushel(),
            seeds_per_lb(),
            price_per_lb_usd(),
        ],
        "unpublished": unpublished(),
    }
