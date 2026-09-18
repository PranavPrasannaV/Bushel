# Contract: Pipeline Output

The interface between the offline geospatial pipeline and the web application. This is the **precompute boundary** from [data-model.md](../data-model.md) — everything above it is geography, everything below it is arithmetic.

Two artifacts per fire, plus three shared reference artifacts.

---

## 1. `fires/index.json` — the selectable set

```jsonc
{
  "generated_at": "2026-09-18T00:00:00Z",
  "severity_source": "MTBS thematic burn severity, class 4 = High",
  "coverage_years": [2018, 2023],
  "fires": [
    {
      "id": "string",
      "name": "string",
      "year": 2023,
      "discovery_date": "YYYY-MM-DD",
      "perimeter_acres": 0.0,
      "retained_acres": 0.0,
      "interior_acres": 0.0,
      "provisional": false
    }
  ]
}
```

`coverage_years` is asserted, not assumed: a fire outside it must not appear.

---

## 2. `fires/{id}.json` — one fire's cell table

```jsonc
{
  "fire": {
    "id": "string",
    "name": "string",
    "year": 2023,
    "discovery_date": "YYYY-MM-DD",
    "perimeter_source_date": "YYYY-MM-DD",
    "provisional": false
  },

  "retained": {
    "perimeter_acres": 0.0,
    "retained_acres": 0.0,
    "excluded_acres": 0.0,
    "excluded_reason": "Outside State Responsibility Area",
    "high_severity_acres": 0.0
  },

  "planting": {
    "interior_acres": 0.0,
    "threshold_m": 90,
    "threshold_source": "Baker 2023, Climate 11(11):214",
    "interior_fraction": 0.0,
    "baker_reference_fraction": 0.219,
    "note": "21.9% is a cross-check on the computed fraction, never a multiplier"
  },

  "cells": [
    {
      "cell_id": "string",
      "seed_zone": "string",
      "elevation_band": "string",
      "planting_acres": 0.0,
      "species": [
        { "species": "Douglas Fir", "acres": 0.0 }
      ]
    }
  ],

  "geometry_ref": "fires/{id}.geojson"
}
```

**Invariants the web app may rely on** — the pipeline MUST guarantee them and fail loudly rather than emit a violating artifact:

- `retained_acres + excluded_acres == perimeter_acres` (within rounding tolerance)
- `interior_acres <= high_severity_acres`
- `sum(cells[].planting_acres) == interior_acres`
- `sum(cells[].species[].acres) == cells[].planting_acres` per cell
- No two objects in `cells` share a `cell_id`
- Every `species` value is one of the 15 AON species of interest

**Empty-result cases carry a reason, never an empty array alone:**

```jsonc
{ "result": "no_retained_area", "message": "Entire perimeter lies outside State Responsibility Area." }
{ "result": "no_conifer", "message": "No conifer species present in pre-fire vegetation." }
{ "result": "no_interior", "message": "All burned acres lie within natural seeding distance. No planting order required." }
```

---

## 3. `fires/{id}.geojson` — the map layers

One FeatureCollection. Each feature carries `layer` ∈ `perimeter` · `retained` · `high_severity` · `interior` · `cell`, so the interior can be drawn distinctly from the rest of the burn (SC-006). Cell features carry `cell_id`, `seed_zone` and `elevation_band`.

---

## 4. `reference/factors.json` — published factors and unpublished assumptions

```jsonc
{
  "published": [
    {
      "name": "stocking_tpa",
      "value": 200,
      "unit": "trees/acre",
      "source_ref": "CAL FIRE AON 2025 §E",
      "adjustable": true,
      "min": 50,
      "max": 200,
      "caveat": "A maximum-stocking worst case. FPR range is 50-200 TPA."
    },
    {
      "name": "lbs_clean_seed_per_bushel",
      "unit": "lb clean seed / bushel of cones",
      "source_ref": "CAL FIRE AON 2025 Table 2",
      "by_species": { "Douglas Fir": 0.5, "Sugar Pine": 1.4 },
      "fallback": { "value": 1.0, "rule": "AON: species absent from Table 2 assume 1 bushel = 1 lb" }
    },
    {
      "name": "seeds_per_lb",
      "unit": "seeds/lb",
      "source_ref": "CAL FIRE Terms of Sale Feb 2026, 'Average Seeds/pounds'",
      "by_species": { "Douglas-Fir": 30455, "Ponderosa Pine": 9240 },
      "warning": "Seeds per pound. NOT seedlings per pound."
    },
    {
      "name": "price_per_lb_usd",
      "unit": "USD/lb",
      "source_ref": "CAL FIRE Terms of Sale Feb 2026, seed price list",
      "by_species": { "Douglas-Fir": 497.0, "Ponderosa Pine": 230.0 },
      "warning": "Seed list, denominated in pounds. Never the seedling price list."
    }
  ],

  "unpublished": [
    {
      "name": "seeds_per_pot",
      "default_value": 0.0,
      "min": 0.0,
      "max": 0.0,
      "unit": "seeds/pot",
      "unpublished_by": "CAL FIRE",
      "rationale": "AON sources this from internal LAMRC nursery datasets. Default is a general reference value, not CAL FIRE's."
    },
    { "name": "nursery_survival_rate", "unit": "fraction", "unpublished_by": "CAL FIRE" },
    { "name": "probability_of_tree_in_nursery", "unit": "fraction", "unpublished_by": "CAL FIRE" }
  ]
}
```

Every entry in `unpublished` MUST render visually distinct from `published` and MUST be adjustable within bounds (FR-012).

---

## 5. `reference/benchmark.json`

```jsonc
{
  "total_bushels": 55978,
  "unit": "bushels of conifer cones",
  "period": "2018-2024",
  "jurisdiction": "Non-federal (SRA and LRA)",
  "scope_note": "25% of productive conifer forest on non-federal land, statewide - not 25% of burned acres. Driven by wildfire plus insect/disease mortality plus timber harvest.",
  "acres_burned": 1507830,
  "high_severity_acres": 359182,
  "source_ref": "CAL FIRE 2025 Assessment of Needs, signed 2025-05-20",
  "known_overestimate": "The AON does not explicitly exclude privately-owned industrial land and therefore somewhat overestimates need.",
  "agency_self_contradiction": "The AON conclusion says 'bushels of conifer seed'; its methodology and Table 2 establish cones. Methodology governs."
}
```

---

## Conversion contract (web-side, pure)

A single deterministic function, no I/O, no network, no generative component (FR-014):

```
computeOrder(cells, factors, assumptions) -> Order
```

Per species per cell:

```
trees            = acres × stocking_tpa
seedlings_per_lb = (seeds_per_lb ÷ seeds_per_pot) × nursery_survival_rate × probability_of_tree_in_nursery
pounds           = trees ÷ seedlings_per_lb
bushels          = pounds ÷ lbs_clean_seed_per_bushel
cost_usd         = pounds × price_per_lb_usd
priority         = bushels > 100 ? 1 : bushels >= 11 ? 2 : 3
```

Contract guarantees:

- **Pure.** Same inputs produce identical outputs on every invocation (SC-008).
- **Traceable.** Each output value returns the factor list that produced it, with `source_ref` and `status`, so the UI can display provenance without recomputing (FR-011, SC-002).
- **Never merges cells.** Aggregates are presented as totals over lines; the lines themselves remain per cell (FR-009).
- **Unit-tagged.** Every returned quantity carries its unit. A seedling-denominated value carries the two-year-equivalent label (FR-017).

---

## Export contract

Exports preserve cell breakdown, per-factor `source_ref` and `status`, `used_fallback` per line, and every assumption as `{default_value, current_value}` (FR-027). An export produced from defaults and one produced after adjustment must be distinguishable from their contents alone.
