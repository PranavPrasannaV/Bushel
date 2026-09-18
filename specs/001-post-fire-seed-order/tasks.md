---
description: "Task list for post-fire seed order"
---

# Tasks: Post-Fire Seed Order

**Input**: Design documents from `/specs/001-post-fire-seed-order/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/pipeline-output.md](./contracts/pipeline-output.md), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED. Constitution Principle III requires the conversion chain to be unit-tested, and Principle II requires unit discipline enforced by code rather than convention. [quickstart.md](./quickstart.md) names the suites.

**Organization**: Grouped by user story. Each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable — different files, no dependency on incomplete work
- **[Story]**: US1–US4, on user story phases only

## Path Conventions

Two deliverables separated by the precompute boundary, per plan.md:

- **Pipeline** (offline, Python): `pipeline/src/seedshed/`, `pipeline/tests/`
- **Web** (static, TypeScript): `web/src/`, `web/tests/`, artifacts at `web/public/data/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization

- [ ] T001 Create `pipeline/` and `web/` package roots per the structure in plan.md
- [ ] T002 Initialize Python 3.11 project in `pipeline/pyproject.toml` with geopandas, rasterio, shapely, pyproj, numpy, scipy, pytest
- [ ] T003 Initialize TypeScript project in `web/package.json` with a React-family framework, a vector map renderer, and vitest
- [ ] T004 [P] Configure ruff and formatting in `pipeline/pyproject.toml`
- [ ] T005 [P] Configure eslint and formatting in `web/.eslintrc.json`
- [ ] T006 [P] Add `data/cache/` to `.gitignore` — source layers are fetched, never committed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story depends on

**⚠️ CRITICAL**: No user story work begins until this phase completes

- [ ] T007 Implement source layer fetch and cache in `pipeline/src/seedshed/fetch.py` for the endpoints in `docs/04-DATA-SOURCES.md` — SRA, California Seed Zones, FRAP perimeters, MTBS severity, LEMMA 2023.1 vegetation, USGS 3DEP elevation
- [ ] T008 Add fetch integrity checks in `pipeline/src/seedshed/fetch.py` — record retrieval date per layer and fail loudly on an unexpected schema
- [ ] T009 Implement the published factor registry in `pipeline/src/seedshed/factors.py` loading `data/table2_cones_to_seed.csv` and `data/seed_prices.csv`, each entry carrying `source_ref`, `unit` and `status: published`
- [ ] T010 Add the 200 TPA stocking factor to `pipeline/src/seedshed/factors.py` with `source_ref` "CAL FIRE AON 2025 §E", bounds 50–200, and the maximum-stocking-worst-case caveat string (research.md R1)
- [ ] T011 Implement the unpublished assumption registry in `pipeline/src/seedshed/factors.py` — `seeds_per_pot`, `nursery_survival_rate`, `probability_of_tree_in_nursery` — each with default, bounds, `unpublished_by: CAL FIRE`, and a rationale stating the default is general rather than agency-specific
- [ ] T012 Implement the Table 2 fallback rule in `pipeline/src/seedshed/factors.py` — 1 bushel = 1 lb for the four species absent from Table 2 — setting `fallback_applied` on every affected factor
- [ ] T013 Define the 15 AON species of interest as an enum in `pipeline/src/seedshed/species.py` (research.md R5)
- [ ] T014 Implement the artifact writer in `pipeline/src/seedshed/build.py` emitting the schemas in `contracts/pipeline-output.md`
- [ ] T015 Implement the contract invariant validator in `pipeline/src/seedshed/build.py` — acreage sums, interior ≤ high severity, cell species sums, unique cell ids, valid species — failing the build rather than emitting a violating artifact
- [ ] T016 [P] Write invariant tests in `pipeline/tests/test_invariants.py` covering every guarantee listed in `contracts/pipeline-output.md`
- [ ] T017 Write `reference/benchmark.json` from the verified figures in `docs/02-FACTS.md` — 55,978 bushels, 2018–2024, non-federal, 1,507,830 acres, 359,182 high severity, plus the scope note, the known-overestimate caveat and the agency self-contradiction note
- [ ] T018 Build the web app shell in `web/src/App.tsx` that loads `fires/index.json` and `reference/factors.json` with no backend call
- [ ] T019 **GATE** Run the `design-stack` skill and commit a design system before any component work — Layer 1 is not optional (plan.md Implementation gates; Design is a sixth of the rubric)

---

## Phase 3: User Story 1 — Get the seed order for one fire (Priority: P1) 🎯 MVP

**Goal**: Select a California fire and receive a complete, itemised seed order, partitioned by seed zone and elevation band, with every factor showing its published source and unpublished factors adjustable.

**Independent test**: Select any fire in the coverage window and receive an itemised order with per-factor sourcing. Delivers the forester's whole task before the interior refinement in US2 exists — this phase computes on high-severity acres, and US2 narrows that to the seed-limited interior.

### Pipeline

- [ ] T020 [US1] Implement SRA clip in `pipeline/src/seedshed/jurisdiction.py` returning retained acres, excluded acres and the exclusion reason
- [ ] T021 [P] [US1] Write jurisdiction tests in `pipeline/tests/test_jurisdiction.py` — sums reconcile to perimeter acres; a fully federal burn yields the `no_retained_area` finding, not an empty order
- [ ] T022 [US1] Implement MTBS severity read in `pipeline/src/seedshed/severity.py` selecting class 4 = High, rejecting fires outside 2018–2023 with a stated reason (research.md R4)
- [ ] T023 [US1] Implement the zone × elevation partition in `pipeline/src/seedshed/partition.py` — intersect the 85 Buck 1970 seed zones with 500-foot bands derived from the DEM, splitting areas that straddle a band boundary
- [ ] T024 [P] [US1] Write no-merge tests in `pipeline/tests/test_no_merge.py` asserting zero merged cells across at least five multi-zone fires (SC-007)
- [ ] T025 [US1] Implement species allocation in `pipeline/src/seedshed/species.py` from LEMMA 2023.1 dominant species by basal area, filtered to the 15 species of interest, recording `allocation_source` per cell
- [ ] T026 [US1] Emit the `no_conifer` finding in `pipeline/src/seedshed/species.py` when no conifer species is present, rather than a zero-quantity order
- [ ] T027 [US1] Wire the per-fire build in `pipeline/src/seedshed/build.py` producing `fires/{id}.json` and `fires/index.json`
- [ ] T028 [US1] Emit `fires/{id}.geojson` in `pipeline/src/seedshed/build.py` with `layer` tags for perimeter, retained, high_severity and cell
- [ ] T029 [US1] Emit `reference/factors.json` in `pipeline/src/seedshed/build.py` from the registries in T009–T012
- [ ] T030 [US1] Select and build the demo fire set in `pipeline/src/seedshed/build.py` — California fires from 2018–2023 only, each stamped with `perimeter_source_date`

### Web — conversion

- [ ] T031 [US1] Implement the pure conversion chain in `web/src/convert/computeOrder.ts` per the contract — trees, seedlings per pound, pounds, bushels, cost, priority — with no I/O and no network
- [ ] T032 [US1] Carry unit tags and the factor trail on every returned quantity in `web/src/convert/computeOrder.ts` so the UI can display provenance without recomputing
- [ ] T033 [US1] Implement the AON priority index in `web/src/convert/computeOrder.ts` — 1 if bushels > 100, 2 if 11–100, 3 if ≤ 10 (FR-021)
- [ ] T034 [P] [US1] Write purity and determinism tests in `web/tests/convert.test.ts` — identical inputs yield identical outputs across repeated invocations (SC-008)
- [ ] T035 [P] [US1] Write unit-discipline tests in `web/tests/units.test.ts` — bushels labelled as cones; `seeds_per_lb` never substituted for `seedlings_per_lb`; seedling figures carry the two-year-equivalent label; cost derives from the seed price list in dollars per pound; fallback lines flagged (Constitution II)

### Web — interface

- [ ] T036 [US1] Build the fire selector in `web/src/components/FireSelector.tsx` reading `fires/index.json`
- [ ] T037 [US1] Build the order table in `web/src/components/OrderTable.tsx` — one line per cell per species, never aggregating across a zone or band boundary
- [ ] T038 [US1] Build the factor trail in `web/src/components/FactorTrail.tsx` showing every factor with its `source_ref` when a quantity is inspected (FR-011, SC-002)
- [ ] T039 [US1] Build the assumption panel in `web/src/components/AssumptionPanel.tsx` rendering unpublished factors visually distinct from published ones, labelled as not published by CAL FIRE, adjustable within bounds (FR-012)
- [ ] T040 [US1] Wire instant recompute in `web/src/App.tsx` so adjusting any assumption recalculates locally with no reload and no network request (FR-013)
- [ ] T041 [US1] Display the 200 TPA maximum-stocking caveat beside the stocking control in `web/src/components/AssumptionPanel.tsx` — an upper bound must not read as a point estimate (research.md R1)
- [ ] T042 [US1] Render jurisdiction reporting in `web/src/components/OrderSummary.tsx` — retained and excluded acreage both stated (FR-002)
- [ ] T043 [US1] Render the perimeter date stamp and provisional flag in `web/src/components/OrderSummary.tsx` (FR-024)
- [ ] T044 [P] [US1] Write the order-appears browser test in `web/tests/e2e/order-appears.spec.ts` (quickstart Scenario 1)
- [ ] T045 [P] [US1] Write the assumptions browser test in `web/tests/e2e/assumptions.spec.ts` (quickstart Scenario 2)

**Checkpoint**: US1 complete. A forester can select a fire and get a fully sourced, itemised order.

---

## Phase 4: User Story 2 — See which acres will not come back on their own (Priority: P2)

**Goal**: Compute and display the seed-limited interior, and narrow the order to it.

**Independent test**: Display any fire and confirm the acres beyond natural seeding distance are visually distinct and smaller in area than the full burn.

- [ ] T046 [US2] Implement the seed-limited interior in `pipeline/src/seedshed/interior.py` as a Euclidean distance transform inward from high-severity patch edges at a 90 m threshold, using `scipy.ndimage.distance_transform_edt`
- [ ] T047 [US2] Record `threshold_m`, `threshold_source` and the computed `interior_fraction` in `pipeline/src/seedshed/interior.py`, alongside Baker's 0.219 as `baker_reference_fraction`
- [ ] T048 [US2] Emit the `no_interior` finding in `pipeline/src/seedshed/interior.py` when every burned acre lies within seeding distance — a stated result, not an error (edge case)
- [ ] T049 [US2] Insert the interior stage between severity and partition in `pipeline/src/seedshed/build.py` so the order covers only the interior
- [ ] T050 [P] [US2] Write interior tests in `pipeline/tests/test_interior.py` — interior never exceeds high-severity acres; computed fraction is compared to 0.219 as a cross-check; **assert no code path multiplies by 0.219** (research.md R3)
- [ ] T051 [US2] Add the `interior` layer to `fires/{id}.geojson` in `pipeline/src/seedshed/build.py`
- [ ] T052 [US2] Render the interior as the visually dominant layer in `web/src/components/BurnMap.tsx` — distinct from the rest of the burn, legible within 10 seconds (SC-006)
- [ ] T053 [US2] Display the threshold statement in `web/src/components/BurnMap.tsx` — 90 m, Baker (2023), the published estimate least favourable to this conclusion (FR-005)
- [ ] T054 [P] [US2] Write the interior browser test in `web/tests/e2e/interior.spec.ts` (quickstart Scenario 5)

**Checkpoint**: The order now covers only acres that will not regenerate unaided, and the division is the primary visual.

---

## Phase 5: User Story 3 — Check the result against the state's own total (Priority: P3)

**Goal**: Aggregate across the benchmark window and report the difference from CAL FIRE's published total with its causes attributed.

**Independent test**: Run the calculation across the benchmark period and jurisdiction, and compare the aggregate to the published figure.

- [ ] T055 [US3] Implement upstream acreage checks in `pipeline/src/seedshed/validate.py` — computed versus published acres burned and high-severity acres, within 10% (FR-020, SC-005)
- [ ] T056 [US3] Implement the benchmark roll-up in `pipeline/src/seedshed/validate.py` aggregating per-fire bushels across 2018–2024 and reporting the percentage difference from 55,978
- [ ] T057 [US3] Implement gap attribution in `pipeline/src/seedshed/validate.py` naming the assumptions most plausibly responsible, including the two documented contributors — CAL FIRE's internal timberland boundary and the AON's non-exclusion of privately-owned industrial land (FR-023, research.md Residual risks)
- [ ] T058 [US3] Report partial coverage as partial in `pipeline/src/seedshed/validate.py` rather than suppressing the comparison
- [ ] T059 [P] [US3] Write validation tests in `pipeline/tests/test_validate.py` asserting the comparison always carries attribution, never a bare number
- [ ] T060 [US3] Build the validation view in `web/src/components/Validation.tsx` showing the computed total beside 55,978 with the difference and its attributed causes

**Checkpoint**: The output is checkable against a state agency's own published total, in its own units.

---

## Phase 6: User Story 4 — Take the order away (Priority: P4)

**Goal**: Export an order that survives outside the tool intact.

**Independent test**: Produce an order, export it, and confirm quantities, cell breakdown, factor sources and unpublished markings are all preserved.

- [ ] T061 [US4] Implement export in `web/src/export/exportOrder.ts` preserving per-cell breakdown, each factor's `source_ref` and `status`, and `used_fallback` per line
- [ ] T062 [US4] Record both `default_value` and `current_value` for every assumption in `web/src/export/exportOrder.ts` (FR-027)
- [ ] T063 [P] [US4] Write export tests in `web/tests/export.test.ts` — an export from defaults is distinguishable from an adjusted one by its contents alone

**Checkpoint**: All four user stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T064 Verify every edge case in spec.md produces a stated finding in `web/src/components/OrderSummary.tsx` — no errors, no blank results, no silently zeroed quantities (SC-009)
- [ ] T065 Surface the AON's cones-versus-seed self-contradiction in `web/src/components/Validation.tsx` — the agency's own document disagrees with itself and we follow its methodology (FR-023)
- [ ] T066 **GATE** Audit all shipped copy against `docs/03-DO-NOT-CLAIM.md` — UI strings, README, and the writeup. Principle I is non-negotiable and excluded from the Complexity Tracking exception path
- [ ] T067 [P] Verify every displayed figure exists in `docs/02-FACTS.md` with a source (FR-022)
- [ ] T068 [P] Measure assumption-adjustment recompute time in `web/tests/perf.test.ts` — under 100 ms for a fire with up to ~2,000 cell-species lines
- [ ] T069 Run the full validation suite in [quickstart.md](./quickstart.md) and confirm every scenario passes
- [ ] T070 Write the Devpost submission page declaring what was built before versus during the event, per the rules in `docs/01-EVENT.md`

---

## Dependencies

```
Phase 1 Setup
    ↓
Phase 2 Foundational  ← BLOCKS everything below
    ↓
Phase 3 US1 (P1) ─── MVP ───┐
    ↓                        │
Phase 4 US2 (P2)             │  US2 narrows US1's input;
    ↓                        │  US1 stands alone without it
Phase 5 US3 (P3)             │
    ↓                        │
Phase 6 US4 (P4) ────────────┘
    ↓
Phase 7 Polish
```

**Story independence**: US1 is fully deliverable alone. US2 refines US1's input acreage from high-severity to seed-limited interior. US3 depends on US1 producing orders to aggregate. US4 depends on US1 producing an order to export. US2, US3 and US4 do not depend on each other.

**T019 blocks all component work** (T036–T045, T052–T054, T060). The design system comes before components, not after.

---

## Parallel execution examples

**Phase 2** — T016 runs alongside T014/T015 once the contract is fixed.

**Phase 3 pipeline** — T021 and T024 are independent test files; write them while their implementations land.

**Phase 3 web** — T034 and T035 are independent test files. T044 and T045 are independent browser specs.

**Phase 3 cross-cutting** — the pipeline block (T020–T030) and the web conversion block (T031–T035) touch different trees and can proceed in parallel once the contract in `contracts/pipeline-output.md` is fixed. That is the point of the precompute boundary.

**Phase 7** — T067 and T068 are independent.

---

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That produces a working, fully sourced seed order for a selected fire. It is demonstrable and it replaces the forester's manual process on its own.

**Then Phase 4 (US2)** — the interior. This is both a correctness requirement and the demo peak, so it is the first increment after MVP regardless of what else is outstanding.

**Then Phase 5 (US3)** — validation. This is what converts a plausible estimate into a verified one.

**Cut order if time runs short** (from `docs/00-BRIEF.md`): cut species breadth first — four of the fifteen species exercise both the partition and the Table 2 fallback. Cut nothing from the jurisdiction clip, the interior, or the partition.

**One peak**: the interior lighting up. The partition resolves behind it; the bushel and dollar figures land last. Do not build three visual events.
