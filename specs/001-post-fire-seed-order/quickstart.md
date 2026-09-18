# Quickstart: Validating Post-Fire Seed Order

How to prove the feature works end to end. Each scenario maps to a success criterion in [spec.md](./spec.md) and is runnable independently.

---

## Prerequisites

- Python 3.11+ with a geospatial stack for the pipeline
- Node 20+ for the web application
- Reference data present: `data/table2_cones_to_seed.csv`, `data/seed_prices.csv`, and the CAL FIRE PDFs in `reference/`
- Network access to the endpoints in [`docs/04-DATA-SOURCES.md`](../../docs/04-DATA-SOURCES.md) for the first pipeline run only. Once artifacts are generated, the application runs fully offline.

---

## Setup

```bash
# Pipeline dependencies
cd pipeline && pip install -e .

# Fetch and cache source layers (seed zones, SRA, perimeters, severity, vegetation, DEM)
python -m bushel.fetch --cache ../data/cache

# Generate artifacts for the demo fire set
python -m bushel.build --out ../web/public/data

# Web application
cd ../web && npm install && npm run dev
```

The build step writes the artifacts defined in [`contracts/pipeline-output.md`](./contracts/pipeline-output.md). It MUST fail loudly rather than emit an artifact that violates a stated invariant.

---

## Scenario 1 — An order appears, itemised and sourced (US1, SC-001, SC-002)

1. Open the application and select a fire from the list.
2. Confirm an itemised order appears showing quantity, species, seed zone and elevation band.
3. Click into any quantity.

**Expected**: Every factor that produced it is listed with the published table it came from. Nothing on the trail is unattributed.

**Timing**: From selection to a complete order in under two minutes — in practice, immediate, since geography is precomputed.

```bash
cd web && npm run test:e2e -- order-appears
```

---

## Scenario 2 — Unpublished factors are visibly unpublished (US1, SC-003, Constitution IV)

1. Produce an order.
2. Locate `seeds_per_pot`, `nursery_survival_rate` and `probability_of_tree_in_nursery`.

**Expected**: All three render visually distinct from published factors, are labelled as not published by CAL FIRE, and are adjustable.

3. Adjust one. **Expected**: dependent quantities recompute immediately; no page reload, no network request.
4. Adjust beyond its bounds. **Expected**: the bound is enforced and the resulting quantity still traces to the value actually used.

```bash
cd web && npm run test -- assumptions
```

---

## Scenario 3 — Jurisdiction is enforced and reported (US1, FR-001, FR-002)

1. Select a fire that crosses federal and non-federal land.

**Expected**: Only the non-federal portion is included, and the excluded acreage is stated on screen rather than silently dropped.

2. Select a fire entirely on federal land.

**Expected**: A stated finding — *"Entire perimeter lies outside State Responsibility Area"* — not an empty order presented as a computed one.

```bash
cd pipeline && pytest tests/test_jurisdiction.py
```

---

## Scenario 4 — Cells are never merged (US1, SC-007, FR-009)

1. Select a fire spanning multiple seed zones or elevation bands.

**Expected**: Separate order lines per cell. No line aggregates across a zone or band boundary.

```bash
cd pipeline && pytest tests/test_no_merge.py   # asserts zero merged cells across >=5 multi-zone fires
```

---

## Scenario 5 — The interior is legible at a glance (US2, SC-006)

1. Select a fire and let the result render.

**Expected**: The acres that will not regenerate naturally are visually distinct from the rest of the burn, and are a **smaller area than the full perimeter**. A first-time viewer identifies them within 10 seconds.

2. Confirm the threshold statement is on screen: *90 m, Baker (2023), the published estimate least favourable to this conclusion.*

3. Check the computed interior fraction against Baker's 21.9% reference.

**Expected**: In the same neighbourhood. This is a **cross-check, not a multiplier** — if the code multiplies by 0.219 anywhere, that is a defect (see [research.md](./research.md) R3).

```bash
cd pipeline && pytest tests/test_interior.py
```

---

## Scenario 6 — A burn needing no order says so (edge case)

1. Select a small fire where every acre lies within seeding distance.

**Expected**: *"All burned acres lie within natural seeding distance. No planting order required."* Stated as a finding. Not an error, not a blank screen, not a zero-quantity order.

---

## Scenario 7 — Units survive the chain (SC-009, FR-015 to FR-018, Constitution II)

```bash
cd pipeline && pytest tests/test_units.py
```

Asserts, as code rather than convention:

- The bushel unit is labelled as **cones**; no output labels a bushel as a quantity of seed.
- `seeds_per_lb` is never substituted for `seedlings_per_lb`.
- Any seedling-denominated figure carries the **two-year-equivalent** label.
- Cost derives from the **seed** price list in dollars per pound, never the seedling list.
- The four species absent from AON Table 2 — Knobcone Pine, Lodgepole Pine, Subalpine Fir, Western White Pine — use the agency's 1 bushel = 1 lb fallback, and every line relying on it is flagged.

---

## Scenario 8 — It reproduces the state's own total (US3, SC-004, SC-005)

```bash
cd pipeline && python -m bushel.validate   # periods are per-figure; see benchmark.json
```

**Expected output**: computed total in bushels beside the published **55,978**, with the percentage difference stated.

Upstream checks first, so early stages are verifiable independently of the conversion chain:

| Stage | Published | Period | Tolerance |
|---|---|---|---|
| Acres burned, non-federal conifer forestland | 1,507,830 | **2018–2024** | within 10% |
| High-severity acres | 359,182 | **2018–2023** | within 10% |

**The two figures cover different windows.** AON Table 1 has no 2024 severity value, and 2018–2023 sums to exactly 359,182. The 2024 acreage alone is 142,456 — **9.45%** of the acres-burned total — so comparing a 2018–2023 computation against 1,507,830 sits at the edge of the tolerance before any pipeline error exists.

If the totals diverge, the output MUST name the assumptions most plausibly responsible rather than report the number alone. Two known contributors are documented in [research.md](./research.md): CAL FIRE's internal timberland boundary may not be publicly reproducible, and the AON itself does not exclude privately-owned industrial land and so overestimates need.

Partial coverage is reported as partial, never suppressed.

---

## Scenario 9 — The order leaves the tool intact (US4, FR-027)

1. Produce an order, adjust one assumption, export.

**Expected**: The export carries the per-cell breakdown, every factor's source and published/unpublished status, fallback flags, and both the default and adjusted value for anything changed. An export from defaults is distinguishable from an adjusted one by its contents alone.

---

## Full validation run

```bash
cd pipeline && pytest                          # units, invariants, jurisdiction, interior, no-merge
cd pipeline && python -m bushel.validate     # benchmark comparison
cd web && npm run test && npm run test:e2e     # conversion purity, assumptions, UI scenarios
```

**Definition of done**: every scenario above passes, and the benchmark comparison reports a difference with its causes attributed rather than a bare number.
