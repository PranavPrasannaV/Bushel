# Data sources

**Every endpoint below was hit live on 2026-09-18 and returned HTTP 200. All keyless — no API keys, no registration, no login.**

---

## 1. Fire perimeters

### Active fires — WFIGS (national, keyless)

```
https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query
```
Useful fields: `IncidentName`, `IncidentSize`, `PercentContained`, `FireDiscoveryDateTime`, `POOState`, `POOCounty`, `IncidentComplexityLevel`, `TotalIncidentPersonnel`.

Example — California fires over 5,000 acres:
```
?where=POOState='US-CA' AND IncidentSize>5000&outFields=*&f=json
```

**Live California fires as of 2026-09-18** (verified, safe to demo):
| Name | Acres | Discovered | Contained |
|---|---|---|---|
| Plaskett | 29,993 | 2026-08-26 | 97% |
| Timber | 25,435 | 2026-08-09 | 44% |
| MP18 | 7,599 | 2026-08-07 | 100% |

`WFIGS_Incident_Locations_Current` holds **points for active incidents only**. For polygons and past fires use the next source.

### Historical perimeters — CAL FIRE FRAP (polygons, 1950+)

```
https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/California_Historic_Fire_Perimeters/FeatureServer/0
```
Layer 2 = 1950+. GeoJSON bulk download:
```
https://gis.data.cnra.ca.gov/api/download/v1/items/c3c10388e3b24cec8a954ba10458039d/geojson?layers=0
```
Use this for a large, well-known demo fire with a real polygon.

---

## 2. State Responsibility Area — the jurisdiction clip

```
https://egis.fire.ca.gov/arcgis/rest/services/FRAP/SRA/MapServer/0
```
GeoJSON: `https://gis.data.cnra.ca.gov/api/download/v1/items/5ac1dae3cb2544629a845d9a19e83991/geojson?layers=0`
Shapefile: same item id, `/shapefile?layers=0`

**Clip the burn perimeter to this before computing anything.** CAL FIRE's jurisdiction — and therefore the AON's scope — is non-federal land. This is what makes the comparison against 55,978 valid for *any* California fire, and it removes the need to hunt for a fire that happens to be mostly non-federal.

---

## 3. California Seed Zones — Buck 1970, 85 zones

data.ca.gov package: `california-seed-zones` · publisher CALFIRE-Forestry

```
REST:     https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/California_Seed_Zones/FeatureServer/0
GeoJSON:  https://gis.data.cnra.ca.gov/api/download/v1/items/cd7030ec307b4e449751829efde53f75/geojson?layers=0
Shapefile: .../cd7030ec307b4e449751829efde53f75/shapefile?layers=0
GeoPackage: .../cd7030ec307b4e449751829efde53f75/geoPackage?layers=0
```
Also available: CSV, KML, FileGDB, SQLite, Excel.

Spot-check output against **CAL FIRE's Seed Zone and Elevation Lookup App**.

---

## 4. Elevation — 500-foot bands

USGS 3DEP ImageServer, keyless:
```
https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer
```
Derive 500-ft bands and intersect with the seed zones. This is how CAL FIRE operationalises the Buck 1970 legend note — *"use material within 500-foot elevation of planting location."*

---

## 5. Burn severity — MTBS

```
Direct download: https://www.mtbs.gov/direct-download
BAER products:   https://burnseverity.cr.usgs.gov/baer/home
```
MTBS maps high-severity burn patches for fires ≥1,000 acres, 30 m, 1984–present. **The AON uses MTBS**, so using it keeps Bushel's severity read on the same footing as the benchmark.

---

## 6. Pre-fire vegetation — LEMMA 2023.1

**LEMMA** (Landscape Ecology, Modeling, Mapping and Analysis, Oregon State University),
**version 2023.1**. Maps current vegetation type, carrying **up to two dominant tree species
by basal area** — which is the attribute the species allocation actually needs.

**Use this and nothing else.** The AON's 2025 edition switched from USFS CalVeg to LEMMA
specifically so its whole area of interest derived from one vegetation source. A different
layer guarantees divergence from the total we are checked against.

Earlier drafts of this file named LANDFIRE EVT. That was a guess and it was wrong: EVT gives a
vegetation *type name* and reaching species from it requires an uncited interpretive step.
CWHR/FVEG names dominant species and is CAL FIRE's own layer, but the agency did not use it
here.

---

## 7. Conversion factors and prices — local files

| File | Source | Contents |
|---|---|---|
| `data/table2_cones_to_seed.csv` | AON 2025 Table 2 | 11 species, cones/bushel and lbs clean seed/bushel |
| `data/seed_prices.csv` | Terms of Sale, Feb 2026 | 18 species, $/lb and avg seeds/lb |
| `data/aon_disturbance_table1.csv` | AON 2025 Table 1 | acres burned + high-severity acres by year, 2018–2024 |
| `reference/cal_fire_aon_2025.pdf` | CAL FIRE | 30 pp, the full assessment |
| `reference/cal_fire_terms_of_sale_feb2026.pdf` | CAL FIRE | 10 pp, prices, deadlines, sales priority |
| `reference/cal_fire_aon_2025_extracted.txt` | extracted | plain text of the AON, greppable |

**Note:** WebFetch-style tools return undecodable binary on both CAL FIRE PDFs. They were downloaded with `curl` and read with `pypdf`. If you need to re-extract, do the same.

---

## 8. Not available — plan around these

- **CAL FIRE's three nursery factors** (seeds per pot, nursery survival rate, probability of a tree in nursery) — from internal LAMRC datasets, unpublished. This is the feature, not the bug. See `03-DO-NOT-CLAIM.md`.
- **Seed availability / purchasable inventory** — BLM Seed Warehouse System is not public; Seeds of Success is login-gated; commercial vendors publish no aggregated inventory. Bushel is **demand-side only**. Do not design a screen that needs a supply database.
- **Parcel data** in the AON is behind a restricted access agreement.
- **National conifer seed figures in pounds** — do not exist. National gap numbers are seedlings or acres.
