"""MTBS severity (T022): class 4 = High, and only for fires inside the 2018-2023 window (R4)."""

import numpy as np

HIGH = 4  # MTBS thematic class: 0 Background, 1 Unburned-Low, 2 Low, 3 Moderate, 4 High, ...
COVERAGE_YEARS = (2018, 2023)


def check_year(year) -> str | None:
    """None if the fire is inside the severity window; otherwise the stated reason to refuse it."""
    lo, hi = COVERAGE_YEARS
    if isinstance(year, int) and not isinstance(year, bool) and lo <= year <= hi:
        return None
    return (
        f"Fire year {year} is outside {lo}–{hi}, the burn-severity window this build covers. "
        "The CAL FIRE AON states that 2023 is the most recent year of wildfire severity data "
        "available at the time of publication, and its window starts in 2018."
    )


def high_severity(arrays: dict) -> np.ndarray:
    """High-severity patches inside the perimeter, on ALL land (both jurisdictions).

    Live edges outside the SRA still disperse seed, so the interior distance is measured on this
    mask. The reported high_severity_acres restricts it further to retained ∩ conifer.
    """
    return (arrays["mtbs"] == HIGH) & arrays["perimeter"]
