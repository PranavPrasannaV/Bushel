"""US3 validation (T056-T059): check Bushel against CAL FIRE's own published totals.

    python -m bushel.validate [--out ../web/public/data] [--cache ../data/cache]

Writes reference/validation.json (data-model.md ValidationResult). Three comparisons, each against
its OWN published period, read from reference/benchmark.json:

  - acres burned        2018-2024 vs 1,507,830 (statewide FRAP perimeters ∩ SRA ∩ LEMMA conifer)
  - high-severity acres 2018-2023 vs   359,182 (demo-fire stacks only: coverage is partial)
  - bushels of cones    2018-2023 vs    55,978 (roll-up of real fires/{id}.json records, if any)

Comparing either acreage against the other's window is a defect, not a tolerance failure, so the
windows are parsed from benchmark.json and enforced in code. Every comparison carries its attributed
causes; a number is never written without them. Partial coverage is reported as partial.
"""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely
from rasterio.features import rasterize
from rasterio.windows import Window
from rasterio.windows import bounds as window_bounds
from rasterio.windows import transform as window_transform

from bushel.factors import factors
from bushel.fetch import (
    CRS,
    DEFAULT_CACHE,
    fortypba_lut,
    lemma_lookup,
    lemma_lut,
    lemma_year,
    load_fire_vectors,
    load_stack,
    open_lemma,
)
from bushel.interior import BAKER_REFERENCE_FRACTION, THRESHOLD_M, THRESHOLD_SOURCE

ACRE_M2 = 4046.8564224
PX_ACRES = 900 / ACRE_M2
TOLERANCE_PCT = 10.0
DEFAULT_OUT = Path(__file__).resolve().parents[3] / "web" / "public" / "data"
# AON: "2023 is the most recent year of tree mortality and wildfire severity data available at the
# time of publication." A severity window reaching past it is the wrong window.
SEVERITY_LAST_YEAR = 2023


class PeriodError(ValueError):
    """A comparison was asked to run over a window that is not its figure's own published period."""


def parse_period(text: str) -> tuple[int, int]:
    lo, hi = (int(x) for x in text.split("-"))
    return lo, hi


def pct_diff(computed: float, published: float) -> float:
    return round((computed - published) / published * 100, 1)


def _status(coverage: str, diff: float | None) -> tuple[bool | None, str]:
    """(within_tolerance, status). A tolerance verdict is only given on full coverage."""
    if coverage != "full" or diff is None:
        return None, coverage
    within = abs(diff) <= TOLERANCE_PCT
    return within, "pass" if within else "fail"


# ---- T056: period-aware upstream acreage checks -------------------------------------------------


def acres_burned_check(
    by_year: dict[int, float],
    benchmark: dict,
    all_cover: dict[int, float] | None = None,
    two_species: dict[int, float] | None = None,
) -> dict:
    """Burned SRA acres summed over the acres-burned period (2018-2024) only.

    `all_cover` given: `by_year` is the LEMMA conifer-filtered figure and `all_cover` the
    unfiltered SRA acreage it was cut from. `two_species`: the same filter on FORTYPBA (either of
    two dominant species), reported as a sensitivity. Neither replaces `computed`."""
    lo, hi = parse_period(benchmark["acres_burned_period"])
    years = range(lo, hi + 1)
    missing = [y for y in years if y not in by_year]
    computed = sum(by_year[y] for y in years if y in by_year)
    coverage = "partial" if missing else "full"
    diff = pct_diff(computed, benchmark["acres_burned"])
    within, status = _status(coverage, diff)
    note = (
        f"Every CAL FIRE (FRAP) perimeter {lo}-{hi}, unioned per year so overlapping records count "
        "once, intersected with State Responsibility Area in EPSG:3310. "
    )
    two = None
    if all_cover is None:
        note += (
            "No conifer forest filter is applied, so this is an upper bound for burned SRA conifer "
            "forestland, not a like-for-like figure."
        )
    else:
        note += (
            "Then restricted to 30 m pixels whose pre-fire LEMMA 2023.1 dominant species (by basal "
            "area) is one of the 15 species of interest: model year 2017 for 2018-2021 fires, 2021 "
            "for 2022-2024 fires. Burned SRA before the conifer filter: "
            f"{sum(all_cover.get(y, 0) for y in years):,.0f} acres."
        )
    if all_cover is not None and two_species is not None:
        two = sum(two_species.get(y, 0) for y in years)
        note += (
            " Counting a pixel when either of its two dominant species (LEMMA FORTYPBA, the 'up to "
            "two dominant tree species' attribute the AON describes) is one of the 15: "
            f"{two:,.0f} acres ({pct_diff(two, benchmark['acres_burned']):+}%)."
        )
    return {
        "stage": "Acres burned on non-federal conifer forestland",
        "published": benchmark["acres_burned"],
        "period": benchmark["acres_burned_period"],
        "computed": round(computed, 1),
        "unit": "acres",
        "difference_pct": diff,
        "tolerance_pct": TOLERANCE_PCT,
        "within_tolerance": within,
        "status": status,
        "coverage": coverage,
        "missing_years": missing,
        "by_year": {str(y): round(by_year[y], 1) for y in years if y in by_year},
        "conifer_filter": all_cover is not None,
        "two_species_sensitivity": None if two is None else round(two, 1),
        "note": note,
    }


def high_severity_check(
    fires: list[dict], burned_by_year: dict[int, float], benchmark: dict
) -> dict:
    """High-severity SRA acres over the severity period (2018-2023) for fires with a stack.

    `fires`: [{id, year, high_severity_acres, burned_sra_acres, conifer_filter}]. Fires outside the
    window are listed as excluded, never summed. Coverage is the fraction of the window's burned SRA
    acreage those fires represent.
    """
    lo, hi = parse_period(benchmark["high_severity_period"])
    if hi > SEVERITY_LAST_YEAR:
        raise PeriodError(
            f"high-severity window {lo}-{hi} runs past {SEVERITY_LAST_YEAR}: AON Table 1 carries "
            "no high-severity value after 2023"
        )
    inside = [f for f in fires if lo <= f["year"] <= hi]
    excluded = [
        {"id": f["id"], "year": f["year"], "reason": f"outside the {lo}-{hi} severity window"}
        for f in fires
        if not lo <= f["year"] <= hi
    ]
    window_burned = sum(v for y, v in burned_by_year.items() if lo <= y <= hi)
    covered = sum(f["burned_sra_acres"] for f in inside)
    fraction = round(covered / window_burned, 4) if window_burned else None
    if not inside:
        coverage = "none"
    else:
        coverage = "full" if fraction is not None and fraction >= 0.99 else "partial"
    computed = sum(f["high_severity_acres"] for f in inside)
    diff = pct_diff(computed, benchmark["high_severity_acres"]) if inside else None
    within, status = _status(coverage, diff)
    conifer = bool(inside) and all(f["conifer_filter"] for f in inside)
    return {
        "stage": "High-severity acres on non-federal conifer forestland",
        "published": benchmark["high_severity_acres"],
        "period": benchmark["high_severity_period"],
        "computed": round(computed, 1) if inside else None,
        "unit": "acres",
        "difference_pct": diff,
        "tolerance_pct": TOLERANCE_PCT,
        "within_tolerance": within,
        "status": status,
        "coverage": coverage,
        "coverage_fraction": fraction,
        "window_burned_sra_acres": round(window_burned, 1),
        "fires": [
            {k: f[k] for k in ("id", "year", "high_severity_acres", "burned_sra_acres")}
            for f in inside
        ],
        "excluded": excluded,
        "conifer_filter": conifer,
        "note": (
            f"MTBS class 4 (High) inside the perimeter and State Responsibility Area, {lo}-{hi} "
            f"fires only. Covers {len(inside)} demo fires, "
            f"{(fraction or 0) * 100:.1f}% of the burned SRA acreage in {lo}-{hi}; the published "
            "figure covers every fire in that window statewide, so no 10% verdict is given on "
            "partial coverage. "
            + (
                "Conifer-filtered (LEMMA 2023.1)."
                if conifer
                else "No conifer-forest filter (species layer not yet obtained): an upper bound "
                "for these fires."
            )
        ),
    }


# ---- T057: benchmark roll-up (same arithmetic as web/src/convert/computeOrder.ts) --------------


def fire_bushels(record: dict, f: dict) -> tuple[float, float]:
    """(bushels of cones, gap acres) for one fires/{id}.json record at default factors."""
    pub = {p["name"]: p for p in f["published"]}
    unp = {u["name"]: u["default_value"] for u in f["unpublished"]}
    tpa = pub["stocking_tpa"]["value"]
    seeds = pub["seeds_per_lb"]["by_species"]
    price = pub["price_per_lb_usd"]["by_species"]
    lbs = pub["lbs_clean_seed_per_bushel"]["by_species"]
    fallback = pub["lbs_clean_seed_per_bushel"]["fallback"]["value"]
    nursery = unp["nursery_survival_rate"] * unp["probability_of_tree_in_nursery"]
    bushels = gap = 0.0
    for cell in record.get("cells") or []:
        for s in cell["species"]:
            name, acres = s["species"], s["acres"]
            if name not in seeds or name not in price:  # no Terms of Sale row: disclosed gap
                gap += acres
                continue
            seedlings_per_lb = seeds[name] / unp["seeds_per_pot"] * nursery
            pounds = acres * tpa / seedlings_per_lb
            bushels += pounds / lbs.get(name, fallback)
    return bushels, gap


def rollup(records: list[dict], f: dict, benchmark: dict, burned_by_year: dict[int, float]) -> dict:
    lo, hi = parse_period(benchmark["high_severity_period"])
    window_note = (
        f"The published total's severity input stops at {hi}: the AON states that 2023 is the "
        "most recent year of tree mortality and wildfire severity data available at the time of "
        f"publication. The roll-up therefore aggregates {lo}-{hi} fires only."
    )
    inside = [r for r in records if lo <= r["fire"]["year"] <= hi]
    excluded = [
        {"id": r["fire"]["id"], "year": r["fire"]["year"], "reason": f"outside {lo}-{hi}"}
        for r in records
        if not lo <= r["fire"]["year"] <= hi
    ]
    base = {
        "published_total_bushels": benchmark["total_bushels"],
        "unit": "bushels of cones",
        "window": f"{lo}-{hi}",
        "window_note": window_note,
        "fires_included": [r["fire"]["id"] for r in inside],
        "fires_excluded": excluded,
    }
    if not inside:
        return base | {
            "computed_total_bushels": None,
            "difference_pct": None,
            "coverage": "none",
            "coverage_fraction": 0.0,
            "gap_acres": 0.0,
            "statement": (
                "Not computed: no per-fire records in the severity window exist yet. The per-fire "
                "build needs the LEMMA 2023.1 dominant-species layer, which has not been obtained. "
                "No bushel total is reported rather than an estimate."
            ),
        }
    per_fire = [fire_bushels(r, f) for r in inside]
    total = sum(b for b, _ in per_fire)
    window_burned = sum(v for y, v in burned_by_year.items() if lo <= y <= hi)
    covered = sum(r["retained"]["retained_acres"] for r in inside)
    fraction = round(covered / window_burned, 4) if window_burned else None
    coverage = "full" if fraction is not None and fraction >= 0.99 else "partial"
    return base | {
        "computed_total_bushels": round(total, 1),
        "difference_pct": pct_diff(total, benchmark["total_bushels"]),
        "coverage": coverage,
        "coverage_fraction": fraction,
        "gap_acres": round(sum(g for _, g in per_fire), 1),
        "statement": (
            f"{coverage.capitalize()}: {len(inside)} fires, "
            f"{(fraction or 0) * 100:.1f}% of the burned SRA acreage in {lo}-{hi}, at default "
            "factors. The published total covers every fire in its window statewide. Acres of "
            "species with no Terms of Sale row are counted as gap acres, not bushels."
        ),
    }


# ---- Interior cross-check: the computed seed-limited fraction beside Baker's published one -------


def interior_crosscheck(records: list[dict]) -> dict:
    """Pooled seed-limited interior as a share of high-severity acres, beside Baker (2023).

    Unlike the bushel roll-up, this is like-for-like: Baker's 21.9% is the share of high-severity
    area more than 90 m from a live seed edge, which is exactly what the interior step computes.
    It stays a cross-check. Nothing downstream multiplies by either fraction.
    """
    base = {
        "stage": "Seed-limited interior as a share of high-severity acres",
        "threshold_m": THRESHOLD_M,
        "reference_fraction": BAKER_REFERENCE_FRACTION,
        "reference_source": f"{THRESHOLD_SOURCE}, a 90 m inward buffer across ~56M ha",
    }
    fires = [
        {
            "id": r["fire"]["id"],
            "interior_acres": round(r["planting"]["interior_acres"], 1),
            "high_severity_acres": round(r["retained"]["high_severity_acres"], 1),
        }
        for r in records
        if r.get("planting") and r["retained"].get("high_severity_acres")
    ]
    high = sum(x["high_severity_acres"] for x in fires)
    if not high:
        return base | {"computed_fraction": None, "difference_pts": None, "fires": []}
    fraction = sum(x["interior_acres"] for x in fires) / high
    return base | {
        "computed_fraction": round(fraction, 4),
        "difference_pts": round((fraction - BAKER_REFERENCE_FRACTION) * 100, 1),
        "interior_acres": round(sum(x["interior_acres"] for x in fires), 1),
        "high_severity_acres": round(high, 1),
        "fires": fires,
        "note": (
            f"Pooled over {len(fires)} fires: total interior acres divided by total high-severity "
            "acres on retained non-federal conifer land. Baker's figure is an average over ~56M ha "
            "and these are California fires, so agreement is corroboration, not proof. A "
            "cross-check, never a multiplier."
        ),
    }


# ---- T058: gap attribution ---------------------------------------------------------------------


def attributed_gap(
    acres: dict, high: dict, roll: dict, f: dict, sra_edit: str | None, lra_acres: float | None
) -> list[str]:
    """The assumptions most plausibly responsible for any difference. Never empty."""
    d = {u["name"]: u["default_value"] for u in f["unpublished"]}
    fires = high["fires"]
    years = sorted(x["year"] for x in fires) or [None]
    n_roll = len(roll["fires_included"])
    partial = high["coverage"] != "full" or roll["coverage"] != "full"
    gaps = [
        "CAL FIRE's timberland boundary: the AON restricts its domain to productive conifer "
        "forestland using a timberlands boundary 'mapped internally by CAL FIRE'. Bushel does not "
        "have that layer, so it cannot apply it, and its retained acreage can exceed the AON's.",
        "Known overestimate in the benchmark: the AON does not explicitly exclude "
        "privately-owned industrial land and so, in its own words, somewhat overestimates need. "
        "Bushel does not exclude it either, so a total that matched 55,978 would share that "
        "overestimate.",
        "Unpublished nursery factors: seeds_per_pot, nursery_survival_rate and "
        "probability_of_tree_in_nursery are not published by CAL FIRE (the AON takes them from "
        "internal LAMRC nursery datasets). Bushel's defaults "
        f"({d['seeds_per_pot']:g}, {d['nursery_survival_rate']:g}, "
        f"{d['probability_of_tree_in_nursery']:g}) are general placeholders, not CAL FIRE's, "
        "and every pound and bushel depends on them directly.",
        "A current jurisdiction boundary on past fires: the State Responsibility Area layer used "
        f"was last edited {sra_edit or 'on an unrecorded date'} and is applied to fires from "
        "2018 onward; the SRA boundary in force when each fire burned may differ.",
        f"Scope: the published acres-burned figure covers every fire {acres['period']} and the "
        f"high-severity figure every fire {high['period']}, statewide, whatever its size. "
        f"Bushel's per-fire set is {len(fires)} fires from {years[0]}-{years[-1]}: CAL FIRE "
        "perimeters of 1,000+ acres with an MTBS assessment, because MTBS maps no smaller fire "
        "in the West.",
        "What 55,978 measures: the AON sizes the need to reforest 25% of productive conifer "
        "forest on non-federal land, statewide, driven by wildfire plus insect/disease mortality "
        "plus timber harvest. The target is not a per-burn figure, so a sum over burns alone is "
        "not expected to equal it.",
    ]
    if partial:
        gaps.append(
            "Fire coverage: the high-severity check covers "
            f"{len(fires)} fires ({(high['coverage_fraction'] or 0) * 100:.1f}% of the burned SRA "
            f"acreage in {high['period']}) and the bushel roll-up "
            + (
                f"covers {n_roll} fires ({(roll['coverage_fraction'] or 0) * 100:.1f}%)."
                if n_roll
                else "covers none yet (no per-fire records)."
            )
            + " The published figures cover every fire in their windows, statewide."
        )
    if lra_acres is not None:
        gaps.append(
            "SRA only: Bushel retains State Responsibility Area, while the AON's jurisdiction is "
            f"SRA plus Local Responsibility Area. LRA land inside {acres['period']} perimeters "
            f"adds {lra_acres:,.0f} acres (all cover types) that Bushel leaves out."
        )
    if not high["conifer_filter"]:
        gaps.append(
            "No conifer-forest filter yet: the LEMMA 2023.1 species layer has not been obtained, "
            "so both acreage checks count every cover type inside SRA and are upper bounds."
        )
    elif not acres["conifer_filter"]:
        gaps.append(
            "No conifer-forest filter on the statewide acres-burned check: it needs a statewide "
            "LEMMA 2023.1 species layer, so it counts every cover type inside SRA and is an upper "
            "bound."
        )
    two = acres.get("two_species_sensitivity")
    if acres["conifer_filter"] and two is not None:
        gaps.append(
            "Conifer definition: Bushel counts a 30 m pixel as conifer forest when LEMMA's single "
            "dominant species by basal area (TREEPLBA) is one of the 15. The AON describes LEMMA's "
            "vegetation type as 'an attribute that identifies up to two dominant tree species "
            "based on basal area'. Counting a pixel when either of the two is one of the 15 gives "
            f"{two:,.0f} acres burned ({pct_diff(two, acres['published']):+}%) instead of "
            f"{acres['computed']:,.0f}: the difference is stands whose dominant tree is not one of "
            "the 15 but whose second is."
        )
    return gaps


# ---- T059 + assembly ---------------------------------------------------------------------------


def build_result(
    acres: dict,
    high: dict,
    roll: dict,
    gaps: list[str],
    benchmark: dict,
    interior: dict | None = None,
) -> dict:
    """data-model.md ValidationResult. Refuses to emit a number without its attribution."""
    result = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "benchmark_ref": "reference/benchmark.json",
        "computed_total_bushels": roll["computed_total_bushels"],
        "difference_pct": roll["difference_pct"],
        "coverage": roll["coverage"],
        "rollup": roll,
        "acreage_check": {"acres_burned": acres, "high_severity": high},
        "interior_crosscheck": interior,
        "attributed_gap": gaps,
        "scope_note": benchmark["scope_note"],
        "known_overestimate": benchmark["known_overestimate"],
    }
    assert_attributed(result, benchmark)
    return result


def assert_attributed(result: dict, benchmark: dict) -> None:
    """Never a bare number, never the wrong window."""
    if not result["attributed_gap"]:
        raise ValueError("comparison has no attributed causes")
    checks = result["acreage_check"]
    for stage, key in (
        ("acres_burned", "acres_burned_period"),
        ("high_severity", "high_severity_period"),
    ):
        if checks[stage]["period"] != benchmark[key]:
            raise PeriodError(
                f"{stage} compared over {checks[stage]['period']}, not {benchmark[key]}"
            )
        if not checks[stage].get("note") or not checks[stage].get("coverage"):
            raise ValueError(f"{stage} check carries no note or coverage")
    if result["rollup"]["window"] != benchmark["high_severity_period"]:
        raise PeriodError("the bushel roll-up is not over the severity-covered window")
    if not result["rollup"].get("window_note") or not result["rollup"].get("statement"):
        raise ValueError("roll-up carries no window note or statement")


# ---- I/O (not unit-tested; tests use synthetic inputs) ------------------------------------------


def _union(geoms) -> shapely.Geometry:
    return shapely.union_all(np.asarray(geoms.make_valid().buffer(0)))


def burned_by_year(cache: Path, kinds: tuple[str, ...] = ("SRA", "LRA")) -> dict:
    """{kind: {year: acres}}: FRAP perimeters, unioned per year, inside each responsibility area."""
    perims = gpd.read_file(cache / "perimeters_2018_2024.geojson").to_crs(CRS)
    years = {int(y): _union(grp.geometry) for y, grp in perims.groupby("YEAR_")}
    areas = gpd.read_file(cache / "sra.geojson").to_crs(CRS)
    out = {}
    for kind in kinds:
        juris = _union(areas[areas["SRA"] == kind].geometry)
        shapely.prepare(juris)
        out[kind] = {y: shapely.intersection(g, juris).area / ACRE_M2 for y, g in years.items()}
    return out


def conifer_burned_by_year(cache: Path, strip_rows: int = 2048) -> dict[str, dict[int, float]]:
    """{attribute: {year: acres}} of burned SRA (as burned_by_year) on LEMMA conifer pixels of the
    pre-fire model year. "treeplba": the single dominant species is one of the 15 (the per-fire
    domain). "fortypba": either of up to two dominant species is (the attribute the AON names).
    Streams the statewide EPSG:5070 rasters in row strips; each year's burned SRA is rasterized
    per strip (pixel centres). Pixels are 30 m in an equal-area CRS, 900 m² each."""
    perims = gpd.read_file(cache / "perimeters_2018_2024.geojson").to_crs(CRS)
    years = {int(y): _union(grp.geometry) for y, grp in perims.groupby("YEAR_")}
    areas = gpd.read_file(cache / "sra.geojson").to_crs(CRS)
    sra = _union(areas[areas["SRA"] == "SRA"].geometry)
    shapely.prepare(sra)
    burned = gpd.GeoSeries(
        [shapely.intersection(g, sra) for g in years.values()], index=list(years), crs=CRS
    ).to_crs(5070)
    lut, lut2 = lemma_lut(cache), fortypba_lut(cache)
    out = {"treeplba": dict.fromkeys(years, 0.0), "fortypba": dict.fromkeys(years, 0.0)}
    for model_year in sorted({lemma_year(y) for y in years}):
        todo = {y: burned[y] for y in years if lemma_year(y) == model_year}
        with (
            open_lemma(model_year, cache) as src,
            open_lemma(model_year, cache, "fortypba") as src2,
        ):
            assert src.transform == src2.transform and src.shape == src2.shape
            for row in range(0, src.height, strip_rows):
                win = Window(0, row, src.width, min(strip_rows, src.height - row))
                rect = window_bounds(win, src.transform)
                parts = {y: shapely.clip_by_rect(g, *rect) for y, g in todo.items()}
                parts = {y: g for y, g in parts.items() if not g.is_empty}
                if not parts:
                    continue
                conifer = lemma_lookup(src.read(1, window=win), lut) >= 0
                codes2 = src2.read(1, window=win)
                conifer2 = np.zeros(codes2.shape, dtype=bool)
                ok = (codes2 >= 0) & (codes2 < len(lut2))
                conifer2[ok] = lut2[codes2[ok]]
                shape = (int(win.height), int(win.width))
                t = window_transform(win, src.transform)
                for y, g in parts.items():
                    mask = rasterize([(g, 1)], out_shape=shape, transform=t, dtype="uint8") == 1
                    out["treeplba"][y] += float((conifer & mask).sum()) * PX_ACRES
                    out["fortypba"][y] += float((conifer2 & mask).sum()) * PX_ACRES
    return out


def fire_high_severity(cache: Path, fires: list[dict]) -> list[dict]:
    """High-severity and burned-SRA acres for every built fire ({id, year}), from its stack."""
    out = []
    for fire in fires:
        arrays, _ = load_stack(fire["id"], cache)
        hs = (arrays["mtbs"] == 4) & arrays["perimeter"] & arrays["sra"]
        conifer = "species" in arrays  # never default a missing species layer to "no conifer"
        if conifer:
            hs &= arrays["species"] >= 0
        per, sra = load_fire_vectors(fire["id"], cache)
        burned = shapely.intersection(_union(per.geometry), _union(sra.geometry)).area / ACRE_M2
        out.append(
            {
                "id": fire["id"],
                "year": int(fire["year"]),
                "high_severity_acres": round(float(hs.sum()) * PX_ACRES, 1),
                "burned_sra_acres": round(float(burned), 1),
                "conifer_filter": conifer,
            }
        )
    return out


def load_records(out_dir: Path) -> list[dict]:
    paths = sorted((out_dir / "fires").glob("*.json"))
    return [json.loads(p.read_text(encoding="utf-8")) for p in paths if p.name != "index.json"]


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate Bushel against CAL FIRE's published totals.")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="artifact root (web/public/data)")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    args = ap.parse_args()

    bench_path = args.out / "reference" / "benchmark.json"
    if not bench_path.exists():
        raise SystemExit(
            f"{bench_path} missing: run `python -m bushel.build --out {args.out}` first"
        )
    benchmark = json.loads(bench_path.read_text(encoding="utf-8"))
    manifest_path = args.cache / "manifest.json"
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    )
    f = factors()

    print("Burned SRA acres by year (statewide FRAP perimeters) ...")
    burned = burned_by_year(args.cache)
    sra_by_year, lra_by_year = burned["SRA"], burned["LRA"]
    print("Conifer share of burned SRA (statewide LEMMA 2023.1, streamed) ...")
    conifer = conifer_burned_by_year(args.cache)
    records = load_records(args.out)
    print(f"High-severity acres on the {len(records)} built fires' stacks ...")
    fires = fire_high_severity(args.cache, [r["fire"] for r in records])

    acres = acres_burned_check(
        conifer["treeplba"], benchmark, all_cover=sra_by_year, two_species=conifer["fortypba"]
    )
    high = high_severity_check(fires, sra_by_year, benchmark)
    roll = rollup(records, f, benchmark, sra_by_year)
    lo, hi = parse_period(benchmark["acres_burned_period"])
    lra = sum(v for y, v in lra_by_year.items() if lo <= y <= hi)
    sra_edit = manifest.get("sra", {}).get("source_last_edit")
    result = build_result(
        acres,
        high,
        roll,
        attributed_gap(acres, high, roll, f, sra_edit, lra),
        benchmark,
        interior_crosscheck(records),
    )

    path = args.out / "reference" / "validation.json"
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for c in (acres, high):
        print(
            f"  {c['stage']} {c['period']}: computed {c['computed']} vs published "
            f"{c['published']} ({c['difference_pct']}%), {c['status']}, coverage {c['coverage']}"
        )
    print(f"  bushel roll-up {roll['window']}: {roll['statement']}")
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
