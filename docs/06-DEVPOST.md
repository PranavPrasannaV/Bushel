# Bushel: Devpost submission

> **Before submitting, replace every remaining `[fill …]` and `[confirm …]` marker.** The build
> figures are filled in from the real build's artifacts in `web/public/data/` (8 fires, LEMMA
> GNN.2023.1); each remaining marker stands for a URL, date or decision the repository cannot
> establish. Do not fill any of them with an estimate. Figures labelled as Bushel's output are at the
> default factors: 200 trees per acre, seeds per pot 2, nursery survival 0.9, probability of a tree
> in nursery 0.9. If the build is re-run, re-read them from the artifacts.

**Video:** [fill: video URL] · **Repo:** [fill: repo URL] · **Live site:** [fill: deployed URL, or delete]

**Elevator pitch:** The conifer seed order for one burned California fire: which acres won't
reseed themselves, which species, how many bushels of cones, by seed zone and elevation band.

---

## Inspiration

Forests used to come back on their own after fire, and increasingly they don't. Stevens-Rumann et
al. found that before 2000, 70% of burned sites returned to their pre-fire tree density. After 2000
the figure was 46%, and about a third of sites show no conifer regeneration at all. A high-severity
fire kills the trees that would have supplied the seed. Non-serotinous conifer seed rarely lands much
farther than 100 m from a living tree (Gill et al. 2022), and modern high-severity patches run 1,000
to 30,000 acres.

So the middle of a large burn has to be planted. Seed is matched to the planting site's seed zone and
to within 500 feet of its elevation. The state seed bank measures how much it needs to collect in
bushels of cones.

California writes the requirement down. CAL FIRE's 2025 *Assessment of Needs for the State Seed Bank*
(the AON) puts it at **55,978 bushels of cones**. That is the amount needed to reforest 25% of the
productive conifer forest on non-federal land, statewide, and it covers wildfire, insect and disease
mortality, and timber harvest together. The AON's own Table 1 counts 1,507,830 acres of non-federal
conifer forestland burned from 2018 to 2024, and 22.5 million trees lost to insects and disease.

The AON is a GIS analysis, run once a year for the whole state. That suits planning a statewide
collection season, but it can't tell a forester what one fire needs. Bushel runs the same method for
a single fire, whenever someone asks for it.

We built it for a Registered Professional Forester holding a post-fire management plan for a
non-industrial private or tribal landowner. That is CAL FIRE's sales priority 1, and that ownership
class comes first in its preference order. Her deadlines are published. Sugar pine, red fir and white
fir seed must be ordered by 31 October because those species need longer stratification. The seedling
order form closes on 31 October or when the nursery reaches capacity, which, in CAL FIRE's words, "is
commonly reached by mid-summer." From order to planting takes about eighteen months.

## What it does

The forester opens Bushel and picks a fire: the North Complex, 2020. The list only offers
California fires from 2018 to 2023, because the AON says 2023 is the most recent year of wildfire
severity data it had, and Bushel reads severity from the same source.

1. **Jurisdiction.** The perimeter is clipped to State Responsibility Area. The AON's scope is
   non-federal land (State plus Local Responsibility Area); Bushel keeps the State part and the
   validation panel lists the Local part it leaves out. Retained and excluded acres are both shown, so
   nothing disappears without explanation.
2. **Severity.** Bushel reads MTBS burn severity, the source the AON uses, and keeps class 4 (High).
3. **The seed-limited interior.** The demo is built around this step. The map starts as a dark canvas
   with the burn in muted browns. Then the acres more than 90 m from any live edge fade in as one
   bright layer, and the fire stops looking like a single shape. The interior is only part of the
   fire. The threshold appears on screen as *"90 m — Baker (2023), the published estimate least
   favourable to this conclusion."* Across about 56 million hectares, Baker found the seed-limited
   interior averages 21.9% of high-severity burn area. Bushel shows the fraction it computed for this
   fire next to Baker's figure. The 21.9% is only a cross-check and is never used as a multiplier.
   For the North Complex, Bushel's output is 13,507 interior acres out of 38,436 high-severity acres
   on retained conifer ground: an interior fraction of 35.1%.
4. **Partition.** Behind the interior, faint dashed lines mark the seed zone × 500-foot elevation band
   cells. The order has one line per species per cell, with species taken from pre-fire LEMMA 2023.1
   vegetation. Bushel won't merge cells to make the numbers tidier, and the table caption says so:
   *"Provenance Lock — cells are never merged."*
5. **Conversion.** Selecting an order line opens its factor trail:
   - Acres become trees at 200 trees per acre. That is the AON §E figure, labelled on screen as its
     maximum-stocking worst case.
   - Trees become pounds of clean seed through CAL FIRE's seedlings-per-pound formula.
   - Pounds become bushels of cones through AON Table 2.
   - Pounds become dollars at the Terms of Sale seed price.

   Every factor cites the table it came from. Three are shown in amber with the label *"Not published
   by CAL FIRE"* and adjustable defaults. Changing one recomputes the order in the browser without a
   network request.
6. **The order.** Totals come last: bushels of cones, pounds of clean seed and dollars. For the North
   Complex at the default factors, Bushel's output is 636.8 bushels of cones, 575.3 lb of clean seed
   and $182,072, from 126 order lines across 26 seed zone × elevation band cells. Two more lines,
   knobcone pine and lodgepole pine, show trees only.
   - Each line gets the AON's collection-priority colour: over 100 bushels is priority 1, 11–100 is
     priority 2, and 10 or fewer is priority 3.
   - Lines that use the AON's 1 bushel = 1 lb fallback are marked.
   - Knobcone pine, lodgepole pine and subalpine fir have no seed price and no seeds-per-pound figure
     in the Terms of Sale. Their lines show trees and say "Not computable" rather than use a figure
     from another source.
   - The order exports as JSON and CSV. The export includes every factor's source and status, and the
     default and current value of each assumption.
7. **The benchmark.** The validation panel leads with the like-for-like check: pooled over the eight
   demo fires, the seed-limited interior is 23.7% of high-severity acres (29,329 of 123,966), against
   Baker's published 21.9%, a difference of 1.8 points. Eight fires are not Baker's ~56M ha, so this
   corroborates rather than proves, and 21.9% is still never a multiplier. Below it, the panel shows
   Bushel's roll-up next to CAL FIRE's 55,978 bushels of cones, labelled not like-for-like, with the
   difference and a list of the most likely causes. Bushel's roll-up at the default
   factors is 1,334.8 bushels of cones over the eight demo fires (Camp, Carr, North Complex, Creek,
   Caldor, Dixie, Mosquito, McKinney), -97.6% against 55,978. The panel marks this partial and gives
   no pass or fail: those fires hold 21.8% of the burned SRA acreage in 2018–2023, and 55,978 also
   covers insect and disease mortality, timber harvest and Local Responsibility Area land. The
   high-severity check is partial for the same reason: 123,966 acres on the demo fires against
   359,182 statewide.

Sometimes there is nothing to order: the fire is entirely federal, it held none of the AON's 15
conifer species, or every burned acre is within seeding distance. Bushel says which case applies
instead of showing a zero.

## How we built it

**The precompute boundary.** Every factor a user can change (stocking density and the three
unpublished nursery factors) comes after the "acres per species per cell" step. So the geography runs
offline in Python, once, and stops at that point. The browser loads static JSON and does the
arithmetic, with no backend. Changing an assumption is a local recalculation, and the whole numeric
path is one pure function that can be tested on its own.

**Live builds.** The eight demo fires ship pre-built, and the app labels them that way. Any other
2018–2023 California fire can be built on request: `python -m bushel.serve` searches CAL FIRE's
perimeter service, fetches that fire's perimeter, jurisdiction, seed zones, MTBS severity and 3DEP
elevation from the agency services at request time, and runs the same pipeline code on them (about
30 s for a large fire). LEMMA is the one exception: it has no public service, so it is read from the
local download. A live build of Caldor matches the pre-built Caldor's perimeter and retained acres
exactly.

**Pipeline (Python: geopandas, shapely, rasterio, NumPy, SciPy).** `fetch.py` downloads each source
layer from its public endpoint, except LEMMA, which it reads from the manually downloaded files, and
records the URL and retrieval time in a manifest. If a layer's
schema changes, it fails with an error. It then builds one aligned raster stack per fire in California
Albers (EPSG:3310) on the MTBS grid. The stack holds perimeter, SRA, MTBS class, 3DEP elevation, seed
zone and LEMMA species. `build.py` runs these stages:

- `jurisdiction.py` intersects the perimeter with SRA as vectors, so retained and excluded acres are
  exact.
- `severity.py` keeps MTBS class 4. It rejects any fire outside 2018–2023 and states why.
- `interior.py` runs `scipy.ndimage.distance_transform_edt` over the high-severity mask and keeps
  pixels more than 90 m from the nearest pixel that isn't high severity. Distance is measured across
  all land inside the perimeter, because a live edge on federal land still drops seed. The result is
  then limited to retained conifer ground.
- `partition.py` labels each pixel with its own seed zone and its own 500-foot band, and a cell is the
  set of pixels that share a label. That means no cell can hold two zones or two bands. Pixels with no
  zone or no elevation are counted and reported as unpartitioned.
- `species.py` assigns each cell's acres to the LEMMA dominant species, limited to the AON's 15 species
  of interest.

A validator checks the output contract before anything is written. Retained plus excluded acres must
equal the perimeter, the interior can't exceed the high-severity area, species acres must add up to
cell acres, cell ids must be unique, and every species must be one of the 15. If any check fails, the
build stops. It also stops when the species layer is missing, instead of treating a missing layer as
"no conifers".

`validate.py` compares the results with the AON three times: acres burned over 2018–2024,
high-severity acres over 2018–2023, and the bushel roll-up over 2018–2023. Each comparison lists the
most likely causes of any difference, and a test fails if a comparison is ever written without them.

**The conversion chain (TypeScript).** `web/src/convert/computeOrder.ts` implements CAL FIRE's
formula:

```
trees            = acres × 200 TPA                                     AON §E
seedlings per lb = (seeds per lb ÷ seeds per pot)
                   × nursery survival × probability of a tree          three unpublished factors
pounds           = trees ÷ seedlings per lb
bushels of cones = pounds ÷ lb clean seed per bushel                   AON Table 2
dollars          = pounds × seed price per lb                          Terms of Sale, Feb 2026
priority         = over 100 → 1, 11–100 → 2, 10 or fewer → 3           AON priority index
```

The function does no I/O, reads no clock and calls no model. Each quantity carries a unit string, and
each order line carries its full factor trail, so the interface can show where a number came from
without recalculating it. Tests enforce the units:

- bushels are always "bushels of cones"
- seeds per pound never stands in for seedlings per pound
- seedling figures carry the label "two-year-equivalent"
- cost always comes from the seed price list, in dollars per pound

**Provenance Lock.** The partition creates separate cells, and the order table keeps them separate:
rows are grouped by cell, and nothing is added up across cells. Pipeline tests check real multi-zone
fires, plus synthetic cases that straddle a zone or band boundary, and confirm that no cells were
merged.

**Tests for the easy mistakes.** Two tests exist because the likeliest errors here produce no visible
failure. The first scans the pipeline source and fails if Baker's 0.219 is ever used in arithmetic,
since it may only be reported. The second fails if any control on screen can change the 90 m threshold
or the Baker reference.

**Design system.** Before building any component we wrote `web/src/styles/tokens.css`, which assigns
each colour one meaning:

- The canvas is dark, so the interior can be the only bright thing on screen. The green-teal `regen`
  scale is reserved for it.
- The rest of the burn uses the muted `char` scale.
- Amber is reserved for the three unpublished factors.
- Red, orange and yellow appear only on the AON priority badges.

The map is MapLibre GL drawing GeoJSON on a plain background, without basemap tiles. The interior
reveal is the only animation on the map, and it is turned off when the viewer has reduced motion
enabled. Type
is Newsreader for headings and figures and Public Sans for the interface.

**Process.** We wrote the rules before any code. First came a fact base with every figure checked
against its source, a list of claims we had caught as wrong, and a project constitution. Then the
spec, plan, output contract and task list (Spec Kit), and then the implementation.

## Data sources

Every source is public, and all but one can be used without registering.

| Layer | Source | Access |
|---|---|---|
| Fire perimeters | CAL FIRE FRAP California Historic Fire Perimeters (ArcGIS FeatureServer) | keyless |
| Jurisdiction | CAL FIRE State Responsibility Area (ArcGIS Online FeatureServer) | keyless |
| Seed zones | California Seed Zones, Buck et al. 1970 (data.ca.gov, ArcGIS FeatureServer) | keyless |
| Elevation | USGS 3DEP ImageServer | keyless |
| Burn severity | MTBS CONUS thematic burn severity mosaics (USFS, federal imagery platform ImageServer); MTBS burned-area boundaries (USFS EDW MapServer) | keyless |
| Pre-fire vegetation | LEMMA GNN 2023.1, Oregon State University | **download form: name, organisation, email**; downloaded manually |
| Stocking, conversion factors, benchmark | CAL FIRE 2025 Assessment of Needs (§E, Table 1, Table 2) | public PDF |
| Seed prices, seeds per pound, deadlines | CAL FIRE Seed and Seedlings Terms of Sale, Feb 2026 | public PDF |

**The LEMMA exception.** In its 2025 edition the AON switched to LEMMA 2023.1, which records up to
two dominant tree species by basal area. Using any other vegetation layer would guarantee a mismatch
with the total we check against. LEMMA is distributed only through Oregon State's downloader, and the
downloader requires a first name, last name, organisation and email before it releases anything. We
found no API and no mirror. We downloaded the layer manually through that form on 17 September 2026
(GNN.2023.1, attributes TREEPLBA and FORTYPBA, preset California, model years 2017 and 2021), and the
pipeline reads the local files. Each fire uses the map from before it burned: 2017 for the 2018–2021
fires, because the 2021 map is post-fire imagery for them, and 2021 for the 2022 fires. TREEPLBA, the
species with the plurality of basal area, drives the per-fire species allocation and conifer mask.
FORTYPBA is used only for one sensitivity figure in the statewide validation. No other part of the
build needs an account.

Both CAL FIRE PDFs, the AON's extracted text, and the three agency tables as CSV are in the repo, so every
figure can be rechecked offline.

## Challenges we ran into

**Unit traps.** Four pairs of quantities in this domain look interchangeable but aren't.

- A bushel measures cones, not seed. Douglas-fir yields 0.5 lb of clean seed per bushel, and sugar
  pine yields 1.4.
- The Terms of Sale column is headed "Average Seeds/pounds", which counts seeds, while CAL FIRE's
  formula needs seedlings. Using one in place of the other quietly assumes every seed germinates and
  survives.
- The AON's nursery survival factor is calibrated to a two-year seedling, but the state nursery sells
  one-year plugs. So we price from the seed list and label any seedling figure "two-year-equivalent".
- Nursery survival is not field survival after outplanting.

Each of these is now a test.

**The agency contradicts itself.** The AON's methodology and Table 2 work in bushels of cones, but its
conclusion says "55,978 bushels of conifer seed". We follow the methodology. The validation panel
points out the contradiction in a footnote.

**Three factors the method needs that CAL FIRE doesn't publish.** CAL FIRE's seedlings-per-pound formula uses
seeds per pot, nursery survival rate and probability of a tree in nursery. All three come from
"Historical LAMRC nursery datasets", which are internal, so the published method can't be reproduced
from public data. We didn't fill the gap with guesses. The three factors are shown in amber, labelled
"Not published by CAL FIRE", and can be adjusted. Their defaults are general placeholders, and the
formula stays on screen.

**A dead SRA endpoint.** The first State Responsibility Area service we found, the FRAP MapServer on
egis.fire.ca.gov, returned 404, and the CNRA download returned 403. CAL FIRE's own ArcGIS Online layer
worked, but it holds the current 2026 boundary. That means a 2018 fire is clipped against today's
jurisdiction rather than the one in force when it burned. The validation panel lists this as one
possible cause of a difference.

**Getting LEMMA.** The download is behind the form described above. When the species layer is
missing, the pipeline builds no fire at all rather than substituting another layer, because a missing
layer is not the same as a fire with no conifers. Until the layer arrived, the web app and its tests
ran against a hand-built fixture fire, and the validation panel read "Not yet computed". Once the
layer was in place, the real build ran for all eight demo fires.

**87 seed zone codes, not 85.** Buck 1970 and the AON describe 85 seed zones, but the California Seed
Zones layer we use contains 87 distinct zone codes. We haven't worked out why. Bushel reports the codes
the layer actually contains and doesn't claim 85 on the layer's behalf.

**An acres-burned check that comes in low.** AON Table 1 counts 1,507,830 burned acres of
non-federal *conifer* forestland, 2018–2024. Our statewide check unions every FRAP perimeter in
those years, intersects it with SRA, and keeps the 30 m pixels whose pre-fire LEMMA dominant species
(TREEPLBA) is one of the AON's 15. Bushel's output is 830,011 acres, -45.0%, outside the 10%
tolerance, and the panel lists the likely causes. Two of them can be sized. Bushel keeps SRA only,
while the AON counts SRA plus LRA, and LRA land inside those perimeters adds 134,963 acres across
all cover types. The AON also describes LEMMA's attribute as up to two dominant species: counting a
pixel when either species in FORTYPBA is one of the 15 gives 906,745 acres (-39.9%). Table 1's two
totals also cover different periods.
Acres burned (1,507,830) covers 2018–2024. There is no 2024 severity value, and the 2018–2023 rows add
up to exactly 359,182. So each check runs over its own period.

**Not counting Baker twice.** Our spec first listed two mechanisms: compute a buffer, then apply
Baker's 21.9%. But Baker's 21.9% is itself the result of a 90 m inward buffer, so doing both counts
the same correction twice. We compute the interior and use 21.9% only as a cross-check.

## Accomplishments that we're proud of

- The interior is computed from real severity data with a distance transform. It is not a percentage
  applied to the burn.
- Every figure on screen traces to a primary source. The AON's formula is on screen as the agency
  wrote it, and each factor names the table it came from.
- The gap in CAL FIRE's method is disclosed exactly: Bushel names the three numbers between the
  published method and a reproducible one.
- Results can be checked against a state agency's own total, in the agency's own units. When coverage
  is partial, Bushel says so and gives no pass or fail verdict.
- The build refuses to write bad data. It checks the contract invariants, checks the period of every
  comparison, and stops if the species layer is missing.
- We identified the prior art before building and limited our claim to what is new: a calculation
  for one fire, available whenever it's needed.

**Prior art.** CAL FIRE's AON already does this calculation as a GIS analysis, once a year, for the
whole state. Climate-adapted seed matching is **CAST**, the Climate-Adapted Seed Tool (CAL FIRE, USFS
and UC Davis), which CAL FIRE uses when an exact zone and elevation match isn't available. Bushel does
not do climate matching. The **Seedlot Selection Tool** (St.Clair et al. 2022) and the USFS
**Climate-Smart Restoration Tool** already handle climate-adjusted provenance. **Terraware** covers
forestry and nursery operations. **Regenmapper** takes a burn perimeter but answers a different
question: whether the area will regenerate on its own. We don't know of another tool that starts
from one fire's perimeter, finds the seed-limited interior, splits it by seed zone and elevation, and
ends with a quantity of cones.

## What we learned

- Before a number goes anywhere, ask what it counts: the units, the population, the jurisdiction and
  the year. Several claims we were sure of fell apart under that question.
- Agency documents are worth reading in full. The 200 trees-per-acre figure is published in the AON,
  and a "180" figure circulating online is not in it. The AON's vegetation source is LEMMA, not the
  layer we first assumed.
- Public GIS endpoints move and fail in particular ways. The SRA service was gone. MTBS services had
  migrated to a new host. One MapServer errored on large geometry pages. The elevation service
  returned 500 on oversized tile requests. One TLS handshake failed once and then worked. We now use
  small pages, tile our requests and retry.
- A contested estimate belongs inside the product, not outside it. Using the estimate least favourable
  to our own conclusion made the result easier to defend.
- Stopping the precompute at "acres per species per cell" made testing, recalculation and deployment
  simpler.

## What's next for Bushel

- **Publish the three nursery factors and this becomes reproducible for every state.** They are seeds
  per pot, nursery survival to a two-year seedling, and probability of a tree in nursery. With them,
  every step from a public price list to a bushel count would be public.
- Current fires: MTBS severity runs one to two years behind, so 2025–2026 fires have no severity data
  yet. BAER soil burn severity is a different product and would need its own validation first.
- Close the acres-burned gap. The check already filters every 2018–2024 perimeter to LEMMA conifer;
  next are Local Responsibility Area land and CAL FIRE's timberland boundary, which we would use if
  it were published (the AON uses an internal one).
- Work out why the seed zone layer has 87 codes when Buck 1970 describes 85.

## Built before vs during the event

The rules allow prior work only if it is declared. **[confirm event start date: it is not recorded
anywhere in the repo.]**

What the repository shows (git commit times, US Pacific):

| When (PDT) | Commit | What |
|---|---|---|
| 17 Sep 2026, 13:11 | `4c8469a` | Product brief, event notes, verified fact base, do-not-claim list, data sources, method; CAL FIRE PDFs, extracted text, the three agency tables as CSV |
| 17 Sep 2026, 13:20 | `e83a4d2` | Project constitution; Spec Kit initialised |
| 17 Sep 2026, 13:24 | `bc84f05` | Feature spec |
| 17 Sep 2026, 17:10 | `43e7e78` | Plan, research, data model, pipeline output contract, quickstart |
| 17 Sep 2026, 17:23–17:28 | `44bf052`, `fae0e36` | Task list; fixes from a consistency analysis |
| 17 Sep 2026, 17:40–17:51 | `7d267a2`, `17277b7` | README; rename from Seedshed to Bushel |
| 17 Sep 2026, from 18:31 | not yet committed when this page was drafted | `pipeline/` and `web/`: all code, tests and design tokens (from file creation times). Source layers fetched 18:47–18:58 |
| 17 Sep 2026, 19:36 | not committed (git-ignored) | LEMMA GNN.2023.1 rasters downloaded manually through the LEMMA form (modification times of `data/cache/lemma/*.tif`) |
| 17 Sep 2026, 21:13–21:24 | not yet committed when this page was drafted | Real build: 8 fire records (`fires/index.json` `generated_at`), then `reference/validation.json` (`generated_at`) |

[fill: commit hashes and times for `pipeline/` and `web/` once committed]

What that means:

- **During (according to the repo):** all code. That covers the pipeline, the web app, the tests and
  the design system, and all of it was written after the repository's first commit. None of it
  predates the repo.
- **Before that first commit:** the research. The first commit already contains a finished research
  base (the verified fact base, the do-not-claim list, the reference PDFs and tables), so that work
  happened earlier, and git can't show how much earlier. **[confirm whether this idea-selection and
  fact-checking research happened before or after the event opened.]**
- **Not ours:** the Spec Kit templates and scripts (`.specify/`, `.claude/skills/speckit-*`), the Vite
  React starter the web app was generated from, and the open-source libraries listed below. The CAL
  FIRE documents and tables belong to the agency.
- The implementation was written with Claude Code, working from the spec, contracts and task list in
  `specs/001-post-fire-seed-order/`.

## Built with

Python 3.12 · geopandas · shapely · rasterio · pyproj · NumPy · SciPy · requests · pytest · ruff ·
TypeScript · React 19 · Vite · MapLibre GL JS · Vitest · Playwright · oxlint · Spec Kit · Claude Code ·
ArcGIS REST services (CAL FIRE, USFS, USGS) · MTBS · USGS 3DEP · LEMMA GNN 2023.1
