# Phase 1 Data Model: Post-Fire Seed Order

Derived from the Key Entities in [spec.md](./spec.md) and the decisions in [research.md](./research.md).

The model divides at one boundary: **everything up to `CellSpeciesArea` is precomputed geography; everything after it is arithmetic.** That split is what makes assumption adjustment instant and the numeric path unit-testable (FR-013, FR-014).

---

## Precomputed entities

### Fire

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable identifier |
| `name` | string | Incident name as published |
| `year` | integer | Must fall in 2018–2023 (MTBS coverage, R4) |
| `discovery_date` | date | From the perimeter record |
| `perimeter_acres` | decimal | Full perimeter, before any filtering |
| `perimeter_source_date` | date | Stamped on every result (FR-024) |
| `provisional` | boolean | True if the perimeter may still change (FR-024) |

**Validation**: `year` outside 2018–2023 is rejected with a stated reason, not silently accepted.

### RetainedArea

The portion inside the benchmark's jurisdiction (FR-001, FR-002).

| Field | Type | Notes |
|---|---|---|
| `fire_id` | string | → Fire |
| `retained_acres` | decimal | Inside State Responsibility Area |
| `excluded_acres` | decimal | Outside it — always reported, never dropped silently |
| `high_severity_acres` | decimal | MTBS class 4 within retained area |

**Validation**: `retained_acres + excluded_acres` equals `perimeter_acres` within rounding tolerance. `retained_acres = 0` produces a stated finding (edge case: burn entirely on federal land), not an empty order.

### PlantingArea

The acres beyond natural seeding distance (FR-004, FR-005).

| Field | Type | Notes |
|---|---|---|
| `fire_id` | string | → Fire |
| `interior_acres` | decimal | Result of the distance transform |
| `threshold_m` | integer | Default 90 (Baker 2023) |
| `threshold_source` | string | Displayed on screen |
| `interior_fraction` | decimal | `interior_acres / high_severity_acres` |

**Validation**: `interior_acres ≤ high_severity_acres` always. `interior_fraction` is compared against Baker's 21.9% as a cross-check, **not** used as a multiplier (R3). `interior_acres = 0` is a valid finding — the burn is small enough to reseed unaided.

### Cell

The atomic unit. Never merged (FR-009).

| Field | Type | Notes |
|---|---|---|
| `cell_id` | string | Composite of zone and band |
| `seed_zone` | string | One of 85, Buck 1970 three-digit code |
| `elevation_band` | string | 500-foot band |
| `planting_acres` | decimal | Interior acres within this cell |

**Validation**: No operation may combine two cells. Cells straddling a band boundary are split by area, never merged (edge case).

### CellSpeciesArea

Species allocation within a cell (FR-008). **This is the precompute boundary.**

| Field | Type | Notes |
|---|---|---|
| `cell_id` | string | → Cell |
| `species` | enum | One of the 15 AON species of interest (R5) |
| `acres` | decimal | Share of the cell attributed to this species |
| `allocation_source` | string | LEMMA 2023.1 vegetation type, dominant species by basal area |

**Validation**: Species acres within a cell sum to that cell's `planting_acres`. A cell with no conifer species present produces a stated finding, not a zero-quantity line.

---

## Factor entities

### ConversionFactor

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. `lbs_clean_seed_per_bushel` |
| `species` | enum or null | Null when species-independent |
| `value` | decimal | |
| `unit` | string | Explicit, carried through every operation (FR-015–FR-018) |
| `status` | enum | `published` \| `unpublished` |
| `source_ref` | string | The table it came from |
| `fallback_applied` | boolean | True where the agency's 1 bushel = 1 lb substitution was used |

Published factors, all cited:

| Factor | Value | Source |
|---|---|---|
| `stocking_tpa` | 200 | AON §E — a maximum-stocking worst case; FPR range 50–200 |
| `lbs_clean_seed_per_bushel` | per species, 11 of 15 | AON Table 2 |
| `seeds_per_lb` | per species | Terms of Sale, "Average Seeds/pounds" |
| `price_per_lb_usd` | per species | Terms of Sale seed price list |

### Assumption

Unpublished factors the agency's method requires (FR-012, Constitution IV).

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `default_value` | decimal | |
| `current_value` | decimal | User-adjusted; both retained on export (FR-027) |
| `min` / `max` | decimal | Bounds enforced (edge case) |
| `unpublished_by` | string | The agency that does not publish it |
| `rationale` | string | Where the default came from, and that it is general rather than agency-specific |

The three from the AON formula: `seeds_per_pot`, `nursery_survival_rate`, `probability_of_tree_in_nursery`.

`stocking_tpa` is **not** an Assumption — it is published (R1) — but remains adjustable across 50–200 with its published default.

---

## Computed entities

### OrderLine

One species, one cell (FR-009).

| Field | Type | Derivation |
|---|---|---|
| `cell_id`, `species` | | → CellSpeciesArea |
| `trees` | decimal | `acres × stocking_tpa` |
| `seedlings_per_lb` | decimal | `(seeds_per_lb ÷ seeds_per_pot) × nursery_survival × probability_of_tree` |
| `pounds` | decimal | `trees ÷ seedlings_per_lb` |
| `bushels` | decimal | `pounds ÷ lbs_clean_seed_per_bushel` |
| `cost_usd` | decimal | `pounds × price_per_lb_usd` |
| `priority` | enum | 1 if bushels > 100; 2 if 11–100; 3 if ≤ 10 (FR-021) |
| `used_fallback` | boolean | Marked on the line (R5) |

**Unit rules, enforced in code, not convention:**
- `bushels` measures **cones**. It MUST NOT be labelled as a quantity of seed (FR-015).
- `seeds_per_lb` and `seedlings_per_lb` are distinct quantities and MUST NOT be substituted (FR-016).
- Any seedling-denominated figure carries a **two-year-equivalent** label, because the AON's survival factor is calibrated to a two-year seedling while the nursery sells one-year plugs (FR-017).
- `cost_usd` derives from the **seed** price list, denominated in pounds — never the seedling price list (FR-018).

### Order

| Field | Type | Notes |
|---|---|---|
| `fire_id` | string | |
| `lines` | OrderLine[] | |
| `totals` | object | By species, by zone, and overall — in bushels, pounds and dollars |
| `computed_at` | timestamp | |
| `perimeter_source_date` | date | Carried from Fire (FR-024) |
| `assumptions_used` | Assumption[] | Defaults and adjusted values both (FR-027) |

### Benchmark

The published figure being checked against (FR-019, FR-020).

| Field | Type | Value |
|---|---|---|
| `total_bushels` | integer | 55,978 |
| `period` | string | 2018–2024 |
| `jurisdiction` | string | Non-federal, SRA and LRA |
| `scope_note` | string | 25% of productive conifer forest on non-federal land — not 25% of burned acres |
| `acres_burned` | integer | 1,507,830 — upstream check |
| `high_severity_acres` | integer | 359,182 — upstream check |
| `known_overestimate` | string | The AON does not exclude privately-owned industrial land |

### ValidationResult

| Field | Type | Notes |
|---|---|---|
| `computed_total_bushels` | decimal | |
| `difference_pct` | decimal | Against `Benchmark.total_bushels` |
| `acreage_check` | object | Computed vs published, both stages (FR-020, SC-005) |
| `attributed_gap` | string[] | Which assumptions most plausibly account for the difference (FR-023) |
| `coverage` | enum | `full` \| `partial` — partial is reported, never suppressed |

---

## Entity relationships

```
Fire ─1:1─ RetainedArea ─1:1─ PlantingArea
                                   │
                                  1:N
                                   ▼
                                 Cell ─1:N─ CellSpeciesArea
                                                  │
                    ══════ precompute boundary ═══╪══════
                                                  │
                                                 1:1
                                                  ▼
  ConversionFactor ──┐                       OrderLine ──N:1── Order
  Assumption ────────┴──── feed ────────────────┘

  Order ──compared to──> Benchmark ──produces──> ValidationResult
```

## State transitions

An **Order** moves through: `computed` → `adjusted` (any assumption changed from default) → `exported`. Adjustment never mutates precomputed geography; it recomputes only from `CellSpeciesArea` forward. `exported` records both the default and the adjusted value for every factor touched.
