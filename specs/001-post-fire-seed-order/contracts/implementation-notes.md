# Implementation notes — pinned decisions

Binding on every agent implementing tasks.md. These resolve ambiguities the contract leaves open so
parallel work cannot diverge. Where this file and `pipeline-output.md` disagree, this file wins; where
it adds a field, the addition is additive and `pipeline-output.md` still holds otherwise.

**Hackathon rule: write the simplest code that meets the requirement.** No abstractions for their own
sake, no plugin layers, no config systems. Plain functions, plain data.

---

## Environment

- Pipeline: `pipeline/.venv` (Python 3.12, installed with `uv pip install -e ".[dev]"`). Run tests with
  `cd pipeline && .venv/bin/pytest`. Package is `bushel` under `pipeline/src/bushel/`.
- Web: Vite + React 19 + TypeScript, `maplibre-gl` (no basemap tiles — draws GeoJSON on a plain
  background, fully offline), vitest (`npm run test`, files `web/tests/**/*.test.ts`), Playwright
  (`npm run test:e2e`, files `web/tests/e2e/*.spec.ts`, dev server on port 5173). Lint is `oxlint`.
- Artifact root: `web/public/data/`. Contract paths are relative to it:
  `web/public/data/fires/index.json`, `web/public/data/fires/{id}.json`,
  `web/public/data/fires/{id}.geojson`, `web/public/data/reference/factors.json`,
  `web/public/data/reference/benchmark.json`, `web/public/data/reference/validation.json` (US3, added).
- Source-layer cache: `data/cache/` (git-ignored). Never commit fetched layers.

## Species — canonical names

All artifacts, code and UI key species by exactly these 15 AON names (research.md R5):

```
Big-Cone Douglas Fir, Coast Redwood, Coulter Pine, Douglas Fir, Giant Sequoia, Incense Cedar,
Jeffrey Pine, Knobcone Pine, Lodgepole Pine, Ponderosa Pine, Red Fir, Subalpine Fir, Sugar Pine,
Western White Pine, White Fir
```

### Table 2 (`data/table2_cones_to_seed.csv`) → `lbs_clean_seed_per_bushel`

Names in Table 2 already match canonical names. The four absent species — **Knobcone Pine,
Lodgepole Pine, Subalpine Fir, Western White Pine** — use the AON fallback 1 bushel = 1 lb, with
`fallback_applied: true`.

### Terms of Sale (`data/seed_prices.csv`) → `seeds_per_lb`, `price_per_lb_usd`

| Canonical | Terms of Sale row |
|---|---|
| Big-Cone Douglas Fir | `Big Cone Douglas-Fir` |
| Douglas Fir | `Douglas-Fir` |
| Sugar Pine | `Non-BRR Sugar Pine` |
| Ponderosa Pine | `Ponderosa Pine` (NOT `NSTIA Ponderosa Pine`) |
| Coast Redwood, Giant Sequoia, White Fir, Red Fir, Incense Cedar, Coulter Pine, Jeffrey Pine, Western White Pine | same name |
| **Knobcone Pine, Lodgepole Pine, Subalpine Fir** | **no row — a disclosed gap** |

`Knobcone x Monterey Pine` is a hybrid and MUST NOT stand in for Knobcone Pine.

**The gap is disclosed, never filled (Constitution IV).** For the three species with no Terms of Sale
row there is no published seeds/lb and no price. Their order lines still compute `trees`, but
`seedlings_per_lb`, `pounds`, `bushels`, `cost_usd` and `priority` are `null` and the line carries
`gap: "No 'Average Seeds/pounds' or seed price published for this species in CAL FIRE Terms of Sale (Feb 2026)."`
Totals sum only computable lines and report `gap_lines` (count) and `gap_trees` separately.
Do not source a seeds/lb figure elsewhere.

## `reference/factors.json` — exact shape

As in `pipeline-output.md` §4, with these specifics:

- `by_species` is keyed by **canonical** names.
- `seeds_per_lb` and `price_per_lb_usd` entries also carry
  `source_names: {canonical: "Terms of Sale row name"}` and
  `missing_species: {canonical: "reason"}` for the three gap species.
- `lbs_clean_seed_per_bushel.by_species` covers all 15; the four fallback species are also listed in
  `fallback_species: [...]`.
- Every published entry has `status: "published"`; every unpublished entry has `status: "unpublished"`.
- Unpublished assumption defaults (general placeholders, NOT CAL FIRE's — say so in `rationale`):

| name | default | min | max | unit |
|---|---|---|---|---|
| `seeds_per_pot` | 2 | 1 | 4 | seeds/pot |
| `nursery_survival_rate` | 0.9 | 0.5 | 1.0 | fraction |
| `probability_of_tree_in_nursery` | 0.9 | 0.5 | 1.0 | fraction |

  Rationale text must say: no published value exists; the AON sources it from internal LAMRC nursery
  datasets; the default is a round general placeholder (the only related general figure in
  `docs/02-FACTS.md` §F is that conifer seed commonly germinates above 90% under nursery conditions —
  general, not CAL FIRE's); adjust to your nursery's figures. `nursery_survival_rate` rationale must
  also say it is nursery survival to a two-year seedling, NOT field survival after outplanting.

## Geography — per-fire raster grid

Keep the geospatial work raster-first on one grid per fire. It is simple and it is exact enough.

- CRS **EPSG:3310** (California Albers, metres). Resolution **30 m** (MTBS native). Extent = fire
  perimeter bounds buffered by 1 km, snapped to 30 m.
- Pixel area = 900 m². Acres = pixels × 900 / 4046.8564224.
- Per-fire aligned stack in `data/cache/fires/{id}/stack.npz` + `meta.json`, built by `fetch.py`:
  - `perimeter` (bool), `sra` (bool — inside State Responsibility Area)
  - `mtbs` (uint8 MTBS thematic class 0–6; 4 = High)
  - `dem_m` (float32 elevation, metres)
  - `species` (int16 index into the canonical species list above; −1 = no species of interest
    dominant / non-conifer / nodata)
  - `seed_zone` (int16 Buck 1970 zone code as integer, e.g. 522; −1 = none)
  - `meta.json`: `transform` (6 floats, rasterio affine order), `crs`, `shape`, fire attributes
    (id, name, year, discovery_date, perimeter_source_date, provisional), MTBS fire id, and per-layer
    `retrieved_at` + source URL.
- Vector acreages (`perimeter_acres`, `retained_acres`, `excluded_acres`) come from the vector clip in
  EPSG:3310 (exact); raster counts are used for everything below them.

### Domain definitions (match the AON's "non-federal conifer forestland")

- `retained` = perimeter ∩ SRA (vector for acres; raster mask for downstream).
- `conifer` = `species >= 0` (pre-fire LEMMA dominant species is one of the 15).
- `high_severity_acres` = pixels with `mtbs == 4` ∧ retained ∧ conifer.
- **Seed-limited interior**: high-severity patch mask `hs = (mtbs == 4) ∧ perimeter` (all land, both
  jurisdictions — live edges outside the SRA still disperse seed). Distance =
  `scipy.ndimage.distance_transform_edt(hs) * 30` (metres to the nearest non-high-severity pixel).
  `interior = (distance > 90) ∧ retained ∧ conifer`. Therefore interior ≤ high severity always.
  **Never multiply by 0.219 anywhere.**
- Elevation band: `band_low_ft = floor(dem_m * 3.28084 / 500) * 500`; label `"{low}–{low+500} ft"`.
- `cell_id = f"{seed_zone}_{band_low_ft}"`. Cells are formed per pixel, so a straddling area is split
  by construction and no cell ever merges two zones or bands (Provenance Lock).
- Species allocation: each interior pixel's acres go to its LEMMA dominant species. `allocation_source`
  = "LEMMA 2023.1 GNN, dominant tree species by basal area".
- Additive contract fields: `retained.conifer_acres` (retained ∩ conifer, all severities — the
  AON Table 1 "acres burned on non-federal conifer forestland" analogue) and
  `planting.interior_fraction = interior_acres / high_severity_acres`.

## Web — conversion types

- Every quantity: `{ value: number | null, unit: string, label?: string }`.
- Units strings: `"acres"`, `"trees"`, `"seeds/lb"`, `"seedlings/lb (two-year-equivalent)"`,
  `"lb clean seed"`, `"bushels of cones"`, `"USD"`.
- Each `OrderLine` carries `factors: FactorUse[]` where
  `FactorUse = { name, value, unit, status: 'published'|'unpublished', source_ref, fallback_applied? }`.
- Priority: `bushels > 100 ? 1 : bushels >= 11 ? 2 : 3` (use the contract formula exactly; ≤10 → 3).

## Copy rules (Constitution I, `docs/03-DO-NOT-CLAIM.md`)

- Never "bushels of seed" / "bushels of conifer seed". Always bushels **of cones**.
- Threshold statement verbatim: "90 m — Baker (2023), the published estimate least favourable to
  this conclusion." Never "most conservative".
- Seed zones: "is matched to", never "must match" / "cannot cross".
- Every figure shown must exist in `docs/02-FACTS.md`. No figure from memory.
