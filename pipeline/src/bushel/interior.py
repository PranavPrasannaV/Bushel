"""Seed-limited interior (T046-T048): high-severity ground more than 90 m from a live edge.

A Euclidean distance transform inward from the edge of each high-severity patch (research.md R3).
Baker's 21.9% is reported beside the computed fraction as a cross-check. It is never a multiplier:
the interior is always the computed mask, nothing else.
"""

import numpy as np
from scipy.ndimage import distance_transform_edt

THRESHOLD_M = 90
THRESHOLD_SOURCE = "Baker 2023, Climate 11(11):214"
BAKER_REFERENCE_FRACTION = 0.219  # reported constant only; see test_interior.py
NOTE = "21.9% is a cross-check on the computed fraction, never a multiplier"
NO_INTERIOR = {
    "result": "no_interior",
    "message": (
        "All burned acres lie within natural seeding distance. No planting order required."
    ),
}


def seed_limited_interior(
    hs_all: np.ndarray, retained: np.ndarray, conifer: np.ndarray, res_m: float = 30
) -> np.ndarray:
    """interior = (distance to the nearest non-high-severity pixel > 90 m) ∧ retained ∧ conifer.

    hs_all is high severity on all land, so a patch edge on federal land still counts as a live
    edge. The result is a subset of hs_all ∧ retained ∧ conifer, so interior ≤ high severity.
    """
    distance_m = distance_transform_edt(hs_all) * res_m
    return (distance_m > THRESHOLD_M) & retained & conifer


def planting(interior_acres: float, high_severity_acres: float, unpartitioned_acres: float) -> dict:
    """The contract's `planting` section; interior_fraction = interior / high severity."""
    fraction = interior_acres / high_severity_acres if high_severity_acres > 0 else 0.0
    return {
        "interior_acres": interior_acres,
        "threshold_m": THRESHOLD_M,
        "threshold_source": THRESHOLD_SOURCE,
        "interior_fraction": fraction,
        "baker_reference_fraction": BAKER_REFERENCE_FRACTION,
        "note": NOTE,
        # Interior pixels with no Buck 1970 seed zone or no DEM elevation cannot be placed in a
        # zone x band cell. They are stated here and left out of interior_acres, never dropped.
        "unpartitioned_acres": unpartitioned_acres,
    }


def finding(interior_acres: float) -> dict | None:
    """The no_interior finding when no acre is seed-limited: a stated result, not an error."""
    return dict(NO_INTERIOR) if interior_acres <= 0 else None
