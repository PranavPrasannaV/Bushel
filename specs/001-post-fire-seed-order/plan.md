# Implementation Plan: Post-Fire Seed Order

**Branch**: `001-post-fire-seed-order` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-post-fire-seed-order/spec.md`

## Summary

For a selected California wildfire, produce the conifer seed order that would reforest the
acres unable to regenerate on their own — partitioned by seed zone and elevation band, in
CAL FIRE's own units, with every conversion factor shown beside its published source and the
three factors the agency does not publish surfaced as adjustable assumptions.

The technical approach splits at one boundary. An **offline Python pipeline** performs the
geospatial work — clip to State Responsibility Area, read MTBS severity, distance-transform
inward from live seed edges, intersect 85 seed zones with 500-foot elevation bands, allocate
species from LEMMA vegetation — and emits per-fire cell tables. A **static web application**
performs the conversion chain in the browser as pure arithmetic.

That split is not stylistic. Every adjustable factor sits downstream of acres-per-cell-per-
species, so precomputing to that point makes assumption adjustment an instant local
recalculation (FR-013), makes the numeric path trivially unit-testable in isolation (FR-014),
and leaves a deployed artifact with no backend to fail during judging.

## Technical Context

**Language/Version**: Python 3.11+ (pipeline); TypeScript 5.x on Node 20+ (web)

**Primary Dependencies**: Pipeline — geopandas, rasterio, shapely, pyproj, numpy, scipy
(`ndimage.distance_transform_edt` for the seed-limited interior). Web — a React-family
framework with a vector map renderer. No server framework: the application is static.

**Storage**: Static JSON and GeoJSON artifacts committed under `web/public/data`. No database.
Source layers cached locally under `data/cache` during the build and not committed.

**Testing**: pytest for the pipeline — geospatial invariants, unit discipline, jurisdiction,
no-merge, interior — plus a benchmark validation harness. Vitest for the web conversion chain
(purity and determinism) and a browser-level suite for the UI scenarios in
[quickstart.md](./quickstart.md).

**Target Platform**: Static hosting, modern evergreen browsers. Fully offline once artifacts
are built.

**Project Type**: Web application with an offline data pipeline.

**Performance Goals**: Order renders immediately on fire selection (geography precomputed).
Assumption adjustment recomputes and repaints in under 100 ms for a fire with up to ~2,000
cell-species lines. Pipeline build for the demo fire set completes in a single run without
manual intervention.

**Constraints**: No backend at demonstration time. No generative or probabilistic component
anywhere in the numeric path. Every displayed figure traceable to a recorded primary source.
Fire selection restricted to 2018–2023, the window where MTBS severity exists and the
benchmark applies.

**Scale/Scope**: 15 conifer species, 85 seed zones, 500-foot elevation bands, a curated demo
set of California fires from the benchmark window. One primary screen plus an export.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-Phase 0 | Post-Phase 1 |
|---|---|---|---|
| **I. Source-Traceable Claims** *(non-negotiable)* | Every displayed figure traces to a primary source; nothing in `docs/03-DO-NOT-CLAIM.md` appears | PASS | **PASS** — every factor carries `source_ref` and `status` through the conversion contract; provenance returned with each value |
| **II. Unit Integrity** *(non-negotiable)* | The four known hazards handled as distinct quantities; output in bushels and pounds | PASS | **PASS** — units carried on every quantity, enforced by `tests/test_units.py` rather than convention |
| **III. Deterministic Arithmetic** | No model in the numeric path; conversions unit-tested; chain visible | PASS | **PASS** — `computeOrder` is pure, no I/O, no network |
| **IV. Disclose the Gap, Never Fill It** | Unpublished factors surfaced, defaulted, bounded, adjustable; no supply-data dependency; least-favourable estimate as default | PASS | **PASS** — three unpublished factors modelled as first-class `Assumption` entities; Baker 90 m is the default threshold; no inventory dependency anywhere |
| **V. Scope Follows Verifiability** | California only; benchmark identified before any scope claim | PASS | **PASS** — fire selection bounded to 2018–2023 by data coverage, and the benchmark is modelled explicitly with its own upstream acreage checks |

**Violations**: none. Complexity Tracking is therefore empty and omitted.

**Notes on Phase 0 findings that strengthened compliance rather than breaching it:**

- Planting density moved from a disclosed assumption to a **published factor** (200 TPA, AON
  §E). Principle I is better served by citing than by disclosing, and a widely circulated
  "180 TPA" figure turned out to be absent from the document.
- A conflation between Baker's 21.9% and a distance-transform threshold was found and removed.
  21.9% is now a validation cross-check, never a multiplier. Leaving it would have been a
  Principle II defect — two different corrections applied as if complementary.
- The vegetation layer changed from LANDFIRE to **LEMMA 2023.1**, which is what the benchmark
  was computed from. Principle V: a different layer guarantees divergence from the total we
  are checked against.

## Project Structure

### Documentation (this feature)

```text
specs/001-post-fire-seed-order/
├── plan.md                        # This file
├── spec.md                        # Feature specification
├── research.md                    # Phase 0 output
├── data-model.md                  # Phase 1 output
├── quickstart.md                  # Phase 1 output
├── contracts/
│   └── pipeline-output.md         # Phase 1 output
├── checklists/
│   └── requirements.md            # Spec quality checklist
└── tasks.md                       # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
pipeline/
├── src/bushel/
│   ├── fetch.py                   # Cache source layers from docs/04-DATA-SOURCES.md
│   ├── jurisdiction.py            # Clip perimeter to State Responsibility Area
│   ├── severity.py                # MTBS thematic read, class 4 = High
│   ├── interior.py                # Distance transform inward from live edge, 90 m
│   ├── partition.py               # 85 seed zones x 500-ft DEM bands, never merged
│   ├── species.py                 # LEMMA 2023.1 dominant-species allocation
│   ├── factors.py                 # Published factors and unpublished assumptions
│   ├── build.py                   # Emit artifacts per contracts/pipeline-output.md
│   └── validate.py                # Benchmark comparison with gap attribution
└── tests/
    ├── test_jurisdiction.py
    ├── test_interior.py
    ├── test_no_merge.py
    ├── test_units.py
    └── test_invariants.py         # Contract invariants; build fails loudly on violation

web/
├── public/data/                   # Pipeline artifacts (committed)
├── src/
│   ├── convert/                   # Pure conversion chain — no I/O, no network
│   ├── components/                # Map, order table, factor trail, assumption panel
│   └── export/
└── tests/

data/
├── cache/                         # Source layers, not committed
└── *.csv                          # Extracted agency tables (committed)

reference/                         # Agency PDFs and extracted text (committed)
docs/                              # Brief, event, facts, do-not-claim, sources, method
```

**Structure Decision**: Two deliverables separated by the precompute boundary. `pipeline/`
owns everything above `CellSpeciesArea` and runs offline; `web/` owns everything below it and
ships static. They meet only at the artifacts specified in
[contracts/pipeline-output.md](./contracts/pipeline-output.md), which the pipeline validates
before writing — the build fails rather than emitting an artifact that breaks an invariant.

## Implementation gates

Two gates bind before code is written in their respective areas.

**Before any UI code**: the `design-stack` skill applies, and its Layer 1 — commit to a design
system before writing components — is not optional. Design is a full sixth of the scoring
rubric ([`docs/01-EVENT.md`](../../docs/01-EVENT.md)) and the demo climax is a visual.

**Before any figure reaches the interface**: it must exist in
[`docs/02-FACTS.md`](../../docs/02-FACTS.md) with a source, and must not match an entry in
[`docs/03-DO-NOT-CLAIM.md`](../../docs/03-DO-NOT-CLAIM.md). Principle I is non-negotiable and
excluded from the Complexity Tracking exception path.

## Build sequencing

Ordered by the named cut in [`docs/00-BRIEF.md`](../../docs/00-BRIEF.md), so that stopping at
any point leaves a coherent artifact.

1. **Jurisdiction and severity** — clip, read class 4, report retained and excluded acreage.
   Verifiable against the benchmark's published acreage before anything downstream exists.
2. **Interior** — the distance transform. The correctness requirement and the demo peak.
3. **Partition** — zones × elevation bands, species allocation. The technical claim.
4. **Conversion chain and interface** — arithmetic, provenance trail, assumption panel.
5. **Validation** — benchmark comparison with attributed gap.
6. **Export.**

If time runs short, cut species breadth first — four of the fifteen species exercise the
partition and the Table 2 fallback. Cut nothing from steps 1–3.

## Known unknowns carried into implementation

- **CAL FIRE's internal timberland boundary** may not be publicly reproducible. If it is not,
  retained acreage will exceed the agency's and the validation must attribute the difference
  rather than absorb it.
- **Per-fire MTBS URL scheme** is unconfirmed; the image service and bulk download are the
  fallbacks.
- **The AON's own known overestimate** — it does not exclude privately-owned industrial land —
  is a fixed caveat on every benchmark comparison, not a defect to fix.
