# Data sources

**The endpoints `python -m bushel.fetch` reads were verified live on 2026-09-17 (US Pacific) by that command. The other URLs below (WFIGS, bulk downloads, BAER) are listed for reference and are not read by the pipeline. All keyless: no API keys and no login, and all but one need no registration. The one exception is LEMMA (§6): its download form asks for a name, organisation and email, so it was downloaded by hand on 2026-09-17 and the pipeline reads the local files instead of fetching it.**

Per-layer retrieval times (UTC) and source URLs are written to `data/cache/manifest.json` on every fetch, and into each fire's `data/cache/fires/{id}/meta.json`.

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
Layer 0 = all perimeters, layer 1 = recent large fires (>5,000 acres), layer 2 = 1950+. The pipeline
queries layer 0 with `STATE='CA' AND YEAR_>=2018 AND YEAR_<=2024` (2,767 features) and caches it as
`data/cache/perimeters_2018_2024.geojson`. Fields used: `YEAR_`, `FIRE_NAME`, `GIS_ACRES`,
`ALARM_DATE`, `INC_NUM`, `IRWINID`, `AGENCY`.

`FIRE_NAME` can carry trailing spaces (`"CARR "`), and one name can match several fires in a year
(Camp 2018 has a 13-acre namesake). Match on the trimmed name plus year, then take the largest polygon.
Some source polygons are topologically invalid. Repair them (`make_valid`) before measuring area.

GeoJSON bulk download (redirects to the FeatureServer above):
```
https://gis.data.cnra.ca.gov/api/download/v1/items/c3c10388e3b24cec8a954ba10458039d/geojson?layers=0
```
Use this for a large, well-known demo fire with a real polygon.

---

## 2. State Responsibility Area — the jurisdiction clip

```
https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/State_Responsibility_Area/FeatureServer/0
```
CAL FIRE's own AGOL layer, **SRA26_1: SRA status as of 1 April 2026** (data last edited 2026-04-09).
One field, `SRA`, with values `SRA` (6,505 polygons), `LRA` (3,451) and `FRA` (10,543, federal).
The pipeline caches all three classes as `data/cache/sra.geojson`. The retained mask is `SRA == 'SRA'`.

**Vintage caveat:** this is the 2026 boundary applied to 2018–2023 fires. SRA lines move a little
every year (annexations, federal land transfers, the 5-year review), so a fire's retained area is
measured against today's jurisdiction, not the one in force when it burned. Some polygons self-intersect.
Repair them before clipping.

Dead, do not use: `https://egis.fire.ca.gov/arcgis/rest/services/FRAP/SRA/MapServer/0` (404) and the
CNRA download `https://gis.data.cnra.ca.gov/api/download/v1/items/5ac1dae3cb2544629a845d9a19e83991/geojson?layers=0` (403).

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

Field `SEED_ZONE` is a three-digit string (`"091"`, `"522"`); the pipeline stores it as an integer
(91, 522). The layer holds 92 polygons carrying **87 distinct codes**, while Buck 1970 and the AON say
85 zones. That difference has not been reconciled. Report the codes the layer carries, and do not
assert 85 from this layer.

Spot-check output against **CAL FIRE's Seed Zone and Elevation Lookup App**.

---

## 4. Elevation — 500-foot bands

USGS 3DEP ImageServer, keyless:
```
https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer
```
Request tiles from `exportImage` directly on the fire grid:
`bbox=<grid bounds>&bboxSR=3310&imageSR=3310&size=<w>,<h>&pixelType=F32&interpolation=RSP_BilinearInterpolation&format=tiff`.
Keep each request at 1,500 px per side or less. A single 3,920 × 3,486 request (Dixie) returned HTTP 500.

Derive 500-ft bands and intersect with the seed zones. This is how CAL FIRE operationalises the Buck 1970 legend note — *"use material within 500-foot elevation of planting location."*

---

## 5. Burn severity — MTBS

MTBS maps high-severity burn patches for fires ≥1,000 acres, 30 m, 1984–present. **The AON uses MTBS**, so using it keeps Bushel's severity read on the same footing as the benchmark.

**Severity raster (used):** annual CONUS thematic burn severity mosaics, USFS on the federal
imagery platform (IIPP):
```
https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation/USFS_EDW_MTBS_CONUS/ImageServer
```
One mosaic per year, `mtbs_CONUS_1984` … `mtbs_CONUS_2024`, 1 band, U8, 30 m. Classes: 0 background,
1 unburned to low, 2 low, 3 moderate, **4 high**, 5 increased greenness, 6 non-processing mask.
Select the fire's year and ask for raw values:
`exportImage?...&mosaicRule={"mosaicMethod":"esriMosaicAttribute","where":"year=2021","sortField":"year"}&renderingRule={"rasterFunction":"None"}&pixelType=U8&interpolation=RSP_NearestNeighbor`.
This host's TLS occasionally fails from Python (one bad handshake, then fine), so retry.

**Fire list and MTBS fire IDs (used):**
```
https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MTBS_01/MapServer/63
```
"Burned Area Boundaries (All Years)". Fields `fire_id` (e.g. `CA3858612053820210815`), `fire_name`,
`year`, `acres`, `ig_date`, `asmnt_type`. The pipeline caches California 2018–2024 (282 fires) as
`data/cache/mtbs_perimeters.geojson`. Page at **100 records**: a single request for all 282 geometries
fails with HTTP 500.

Also works: the bulk perimeter zip (390 MB), which carries the same Event IDs:
`https://edcintl.cr.usgs.gov/downloads/sciweb1/shared/MTBS_Fire/data/composite_data/burned_area_extent_shapefile/mtbs_perimeter_data.zip`.

Moved or closed:
- `https://www.mtbs.gov/direct-download` now points to `https://burnseverity.cr.usgs.gov/direct-download`, a browser page.
- `apps.fs.usda.gov/arcx/.../RDW_Wildfire/MTBS_CONUS` and `fsgisx01/.../RDW_Wildfire` return 403 "migrated to IIPP".
- `edcintl.cr.usgs.gov/.../MTBS_Fire/data/` directory listings return 403.

BAER products: `https://burnseverity.cr.usgs.gov/baer/home`

---

## 6. Pre-fire vegetation — LEMMA 2023.1

**LEMMA** (Landscape Ecology, Modeling, Mapping and Analysis, Oregon State University),
**version 2023.1**. Maps current vegetation type, carrying **up to two dominant tree species
by basal area** (the AON's description). Bushel's species allocation reads `TREEPLBA`, the single
species with the plurality of basal area; see below.

**Use this and nothing else.** The AON's 2025 edition switched from USFS CalVeg to LEMMA
specifically so its whole area of interest derived from one vegetation source. A different
layer guarantees divergence from the total we are checked against.

**Access: downloaded manually through the LEMMA form on 2026-09-17 (US Pacific).** That date is the
modification time of `data/cache/lemma/treeplba_*.tif`; each fire's `meta.json` records it in UTC,
as 2026-09-18. LEMMA 2023.1 is published as GNN.2023.1 (model years 1986–2021; years 2017 and 2021
are open to the public) through a single downloader:
```
https://lemmadownload.forestry.oregonstate.edu
```
The tool gives no key and no login, but **the request form requires first name, last name,
organisation and email** before anything is released. A pipeline cannot submit that on anyone's
behalf, so this is the one layer `fetch.py` does not download. There is no LEMMA ArcGIS service, and
no mirror was found: not on IIPP, not on lemma.forestry.oregonstate.edu (its static pages still offer
only a species map posted 2011 and a structure map built from 2012 imagery), and nothing turned up in
search.

What was requested. The download's own `readme.txt` confirms the release, the attributes, the model
years, the integer type, the scalar and the `-1` non-forest value; the attribute descriptions are
worded as the downloader words them.

| Setting | Value |
|---|---|
| Release | GNN.2023.1 (Gradient Nearest Neighbor) |
| Attributes | `TREEPLBA`, "Tree species with plurality of basal area"; `FORTYPBA`, "Forest type, which describes dominant tree species (based on basal area)" |
| Model years | 2017 and 2021 |
| Area preset | "California" |
| Format | single-band GeoTIFF, EPSG:5070, 30 m, signed 32-bit integer codes, scalar 1.0. Non-forest pixels are `-1`: GNN models forested areas only |

Per-species basal-area rasters (`PSME_BA`, `PIPO_BA`, …) are also offered; Bushel does not use them.

Local layout (git-ignored, never committed):
```
data/cache/lemma/
  treeplba_2017.tif  treeplba_2021.tif    per-fire species allocation and conifer mask
  fortypba_2017.tif  fortypba_2021.tif    statewide validation sensitivity only
  treeplba_codes.csv fortypba_codes.csv   raster code -> USDA PLANTS symbol(s)
  readme.txt  documentation/  accuracy_reports/   as distributed
```

**How each attribute is used.**
- **`TREEPLBA`: the per-fire species allocation and conifer mask.** `lemma_species` in
  `pipeline/src/bushel/fetch.py` reprojects the pre-fire TREEPLBA raster nearest-neighbour onto the
  fire's 30 m EPSG:3310 grid. `treeplba_codes.csv` turns each code into a USDA PLANTS symbol, and
  `LEMMA_TO_CANONICAL` maps the symbol to one of the AON's 15 species (symbols as LEMMA lists them:
  `ABPRSH` = red fir group, `ABGRC` = white/grand fir group). Any other species, and non-forest,
  becomes `-1`, "not conifer".
- **`FORTYPBA`: only the statewide validation sensitivity.** `validate.py` also counts a burned SRA
  pixel when either of FORTYPBA's up to two dominant species is one of the 15, and reports that next
  to the TREEPLBA figure in `reference/validation.json`. FORTYPBA never feeds a fire record or an
  order.

**Model year (decided).** `lemma_year()`: the 2017 map for 2018–2021 fires, because the 2021 map is
post-fire imagery for them; the 2021 map for 2022 fires. The statewide validation applies the same
rule, so 2022–2024 perimeters use 2021.

**Running it.** With the files in place, `python -m bushel.fetch --species-only` calls `add_species`
for every demo fire: it adds the `species` array to the stacks already in `data/cache/fires/` with no
network. A full `python -m bushel.fetch` reads LEMMA while it builds each stack, so the files must be
in place first. If a stack still has no `species` array, `build.py` raises `MissingSpeciesLayer` and
writes nothing, rather than treating a missing layer as "no conifer".

**Citation**, verbatim from the download's `readme.txt`:
> Landscape Ecology Modeling, Mapping, and Analysis (LEMMA) Team. 2023. Gradient Nearest Neighbor
> (GNN) raster dataset (version GNN.2023.1). Modeled forest vegetation data using direct gradient
> analysis and nearest neighbor imputation. Retrieved from https://lemmadownload.forestry.oregonstate.edu/.

The same file asks users to cite its guidance report as: Bell, D.M., Gregory, M.J., Palmer, M. and
Davis, R., 2023. *Guidance for forest management and landscape ecology applications of recent
gradient nearest neighbor imputation maps in California, Oregon, and Washington.* Gen. Tech. Rep.
PNW-GTR-1018. Portland, OR: US Department of Agriculture, Forest Service, Pacific Northwest Research
Station. 41 p.

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
