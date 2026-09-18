"""T050: the seed-limited interior is a computed mask; 0.219 is only ever a reported reference."""

import ast
from pathlib import Path

import numpy as np
import pytest

from bushel.fetch import DEFAULT_CACHE, demo_fires, load_stack
from bushel.interior import (
    BAKER_REFERENCE_FRACTION,
    NO_INTERIOR,
    finding,
    planting,
    seed_limited_interior,
)
from bushel.severity import check_year, high_severity

SRC = Path(__file__).resolve().parents[1] / "src" / "bushel"
CACHED = [f["id"] for f in demo_fires() if (DEFAULT_CACHE / "fires" / f["id"]).exists()]


def square(n: int, grid: int = 41) -> np.ndarray:
    hs = np.zeros((grid, grid), dtype=bool)
    o = (grid - n) // 2
    hs[o : o + n, o : o + n] = True
    return hs


def everywhere(hs: np.ndarray) -> np.ndarray:
    return np.ones_like(hs)


def test_square_patch_matches_the_analytic_interior():
    # In an n x n patch the nearest live pixel is straight across the nearest side, so a pixel k
    # rows in (0-based) is (k + 1) * 30 m from a live edge. > 90 m means k >= 3 on every side:
    # the interior is the (n - 6) x (n - 6) core.
    hs = square(21)
    interior = seed_limited_interior(hs, everywhere(hs), everywhere(hs))
    assert interior.sum() == 15 * 15
    rows, cols = np.nonzero(interior)
    assert rows.min() == 10 + 3 and rows.max() == 10 + 17
    assert cols.min() == 10 + 3 and cols.max() == 10 + 17


def test_exactly_90_m_is_not_interior():
    hs = square(7)  # only the centre pixel is 4 pixels = 120 m in; every other pixel is <= 90 m
    interior = seed_limited_interior(hs, everywhere(hs), everywhere(hs))
    assert interior.sum() == 1
    small = square(5)  # centre is exactly 3 pixels = 90 m from a live edge: not > 90
    assert not seed_limited_interior(small, everywhere(small), everywhere(small)).any()


def test_live_edges_on_federal_land_count_but_federal_acres_do_not():
    hs = square(21)
    retained = np.zeros_like(hs)
    retained[:, 20:] = True  # the SRA line runs through the patch, not along a live edge
    interior = seed_limited_interior(hs, retained, everywhere(hs))
    # The SRA line is not a live edge: interior runs up to it (column 20), core rows 13..27.
    assert interior.sum() == 15 * 8
    assert not (interior & ~retained).any()


def test_interior_never_exceeds_high_severity():
    rng = np.random.default_rng(7)
    hs = rng.random((200, 200)) < 0.9
    retained = rng.random((200, 200)) < 0.7
    conifer = rng.random((200, 200)) < 0.8
    interior = seed_limited_interior(hs, retained, conifer)
    high = hs & retained & conifer
    assert interior.any()
    assert not (interior & ~high).any()
    assert interior.sum() <= high.sum()


def test_fraction_is_computed_and_reported_beside_baker():
    hs = square(21)
    interior = seed_limited_interior(hs, everywhere(hs), everywhere(hs))
    p = planting(float(interior.sum()), float(hs.sum()), 0.0)
    assert p["interior_fraction"] == pytest.approx(225 / 441)
    assert p["interior_fraction"] != pytest.approx(BAKER_REFERENCE_FRACTION)
    assert p["interior_acres"] == 225
    assert p["baker_reference_fraction"] == 0.219
    assert p["threshold_m"] == 90
    assert p["threshold_source"] == "Baker 2023, Climate 11(11):214"
    assert p["note"] == "21.9% is a cross-check on the computed fraction, never a multiplier"
    assert p["unpartitioned_acres"] == 0.0
    assert planting(0.0, 0.0, 0.0)["interior_fraction"] == 0.0


def test_no_interior_is_a_stated_finding():
    assert finding(0.0) == {
        "result": "no_interior",
        "message": (
            "All burned acres lie within natural seeding distance. No planting order required."
        ),
    }
    assert finding(0.0) is not NO_INTERIOR  # a copy; the constant cannot be mutated downstream
    assert finding(12.5) is None


def test_years_outside_2018_2023_are_refused_with_a_reason():
    for year in (2018, 2021, 2023):
        assert check_year(year) is None
    for year in (2017, 2024, 2026, "2021", None, 2021.0):
        reason = check_year(year)
        assert reason and "2018–2023" in reason


def test_high_severity_is_class_4_inside_the_perimeter():
    mtbs = np.array([[0, 1, 2, 3, 4, 5, 6, 4]], dtype=np.uint8)
    perimeter = np.array([[1, 1, 1, 1, 1, 1, 1, 0]], dtype=bool)
    hs = high_severity({"mtbs": mtbs, "perimeter": perimeter})
    assert hs.tolist() == [[False, False, False, False, True, False, False, False]]


@pytest.mark.skipif(not CACHED, reason="no cached stacks")
@pytest.mark.parametrize("fire_id", CACHED)
def test_real_interior_is_a_subset_of_high_severity(fire_id):
    a, _ = load_stack(fire_id)
    hs_all = high_severity(a)
    retained = a["perimeter"] & a["sra"]
    conifer = np.ones_like(retained)  # species-free: no LEMMA layer yet
    interior = seed_limited_interior(hs_all, retained, conifer)
    high = hs_all & retained
    assert not (interior & ~high).any()
    fraction = interior.sum() / high.sum()
    print(f"{fire_id}: interior fraction {fraction:.3f} (Baker reference {0.219})")
    assert 0 < fraction < 1


# ---- R3: nothing multiplies by 0.219 ----------------------------------------------------------


def _is_baker(node) -> bool:
    if isinstance(node, ast.Constant) and isinstance(node.value, float):
        return node.value in (0.219, 21.9)
    name = getattr(node, "id", None) or getattr(node, "attr", None)
    return name == "BAKER_REFERENCE_FRACTION"


def test_no_code_path_multiplies_by_0219():
    offenders = []
    for path in sorted(SRC.glob("*.py")):
        text = path.read_text()
        for n, line in enumerate(text.splitlines(), 1):
            if "0.219" in line and not line.startswith("BAKER_REFERENCE_FRACTION = 0.219"):
                offenders.append(f"{path.name}:{n}: {line.strip()}")
        for node in ast.walk(ast.parse(text)):
            ops = (ast.Mult, ast.Div, ast.MatMult)
            if isinstance(node, ast.BinOp) and isinstance(node.op, ops):
                if _is_baker(node.left) or _is_baker(node.right):
                    offenders.append(f"{path.name}:{node.lineno}: arithmetic with Baker's 0.219")
            if isinstance(node, ast.AugAssign) and isinstance(node.op, ops):
                if _is_baker(node.value):
                    offenders.append(f"{path.name}:{node.lineno}: arithmetic with Baker's 0.219")
    assert not offenders, "0.219 is a reference, never a multiplier:\n" + "\n".join(offenders)
    # The constant is defined exactly once, in interior.py.
    defs = [p.name for p in SRC.glob("*.py") if "BAKER_REFERENCE_FRACTION = 0.219" in p.read_text()]
    assert defs == ["interior.py"]


def test_the_scan_would_catch_a_multiplier():
    bad = ast.parse("interior_acres = high_severity_acres * BAKER_REFERENCE_FRACTION")
    binop = next(n for n in ast.walk(bad) if isinstance(n, ast.BinOp))
    assert _is_baker(binop.right)
    assert _is_baker(ast.parse("0.219 * x").body[0].value.left)
