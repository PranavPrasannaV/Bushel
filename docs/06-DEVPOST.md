# Bushel — Devpost submission

**Video:** https://www.youtube.com/watch?v=xdiB-Ic4ztI · **Repo:** https://github.com/PranavPrasannaV/Bushel · **Live site:** https://pranavprasannav.github.io/Bushel/

**Elevator pitch:** After a wildfire, Bushel works out the seed order that would bring the forest back:
which acres can't reseed themselves, which conifer species, how many bushels of cones from which seed
zone, and what it costs. Every California fire from 2018 to 2023 is built and checked against the
state's own figures; any other fire in the lower 48 is built live in the browser.

---

## The short version

Fire maps tell you where a fire burned. **Bushel tells you what to order to bring the forest
back.** It is a reforestation tool — protecting forest ecosystems after fire. We looked for another
tool that turns one fire's perimeter into a seed order and found none; the nearest tools, named under
Prior art, answer different questions.

## Inspiration

Forests used to come back on their own after fire. Increasingly they don't. Before 2000, 70% of burned
sites returned to their pre-fire tree density; after 2000, 46% did, and about a third of sites show no
conifer regeneration at all (Stevens-Rumann et al.). The reason is simple: a severe fire kills the trees
that would have dropped the seed, and most conifer seed lands within 100–200 m of the tree it fell from
(Gill et al. 2022). Modern high-severity patches run to thousands of acres. **The middle of a big burn has
to be planted.**

Planting runs on a strict supply chain. Seed is collected as cones, ordered in *bushels of cones*, and
matched to the planting site's seed zone and to within 500 feet of its elevation. In California, sugar
pine, red fir and white fir must be ordered by **31 October**, and order to planting takes about eighteen
months.

CAL FIRE publishes the need once a year, for the whole state: **55,978 bushels of cones** (2025
*Assessment of Needs*). That is the right number for planning a collection season. It can't tell a
forester what one fire needs. Bushel does the state's calculation for one fire, whenever someone asks.

## What it does

Bushel opens on a map of the United States. California is built and checked, one dot per fire. Every other
state in the lower 48 is **built live**: search any fire there and Bushel builds it in your browser from
national services, at that moment. One search finds any county, address or fire, and the app works down
from there. Take the North Complex fire (2020), 318,797 acres:

1. **Whose land.** The perimeter is clipped to CAL FIRE's State Responsibility Area, because that is the
   state's jurisdiction. The federal acres it leaves out are shown, not hidden.
2. **How badly it burned.** Bushel reads the federal burn-severity record (MTBS) — the source the state
   uses — and keeps the high-severity ground.
3. **Where the forest can't come back on its own.** *This is the moment the fire stops being one shape.*
   Bushel measures inward from every surviving patch of forest, and the ground more than 90 m from a
   living seed tree lights up. For the North Complex that is **13,507 acres** — about a third of the
   badly burned conifer ground, not the whole fire. The 90 m threshold is Baker (2023): *the published
   estimate least favourable to our own conclusion.* We picked the number that hurts us.
4. **Where the seed must come from.** That ground is split by seed zone and 500-foot elevation band, with
   the species that grew there before the fire. Bushel will not merge cells to make the numbers tidier —
   we call that the **Provenance Lock**.
5. **The order.** In the state's own units: **637 bushels of cones, 575 lb of clean seed, $182,072** at
   CAL FIRE's seed prices, enough for about 2.7 million trees. Every figure shows the CAL FIRE table it
   came from.
6. **The honest gap.** Three numbers in CAL FIRE's formula are not published anywhere; they come from
   internal nursery records. Bushel doesn't guess them silently: they're **amber**, labelled *"Not
   published by CAL FIRE"*, and adjustable. Slide one and the whole order recalculates instantly, in the
   browser.
7. **Any place.** Search a county and see its fires ranked by ground that can't reseed, with the county's
   share of the order. Search an address and Bushel says which fire's perimeter it lies in, or how far the
   nearest built fire is. Every view has its own link; a searched address never goes into one.
8. **Any fire in the lower 48, live.** Type "Beachie Creek" and Bushel pulls the perimeter and burn severity
   from MTBS, federal land from PAD-US, forest type and tree species from the Forest Service, seed zones
   from the national provisional map and elevation from USGS, then runs the same interior and seed-zone
   steps in the browser: a 200,000-acre fire in 6–25 seconds. On the Caldor fire it finds 2,250 acres that
   can't reseed where the California pipeline finds 2,239.

## How we built it

**Every fire, not a chosen few.** The pipeline built **237 fires** — every CAL FIRE perimeter
from 2018 to 2023 of 1,000+ acres with a burn-severity assessment (5 more were attempted
and are listed with their reasons). The site covers the state's whole assessment window.

**One pipeline, run ahead of time or live.** A Python pipeline (geopandas, shapely, rasterio, NumPy,
SciPy) does the geography; a static React site does the arithmetic.

- It fetches each layer from the agency's public service: CAL FIRE perimeters, State Responsibility
  Area and seed zones, MTBS severity, USGS 3DEP elevation. The one exception is LEMMA pre-fire
  vegetation, which is download-only.
- The **seed-limited interior** is a Euclidean distance transform (`scipy.ndimage.distance_transform_edt`)
  over the severity raster: every pixel more than 90 m from ground that isn't high severity. Distance is
  measured across all land, because a live edge on federal land still drops seed.
- **Live builds:** `python -m bushel.serve` searches CAL FIRE's perimeter service for any fire and builds
  it from the agency services on request. A live build of a fire we'd pre-built comes out **identical,
  field for field**.
- The build **refuses to write bad data**: retained plus excluded acres must equal the perimeter, the
  interior can't exceed the high-severity area, species acres must add up, and a missing vegetation layer
  stops the build instead of reading as "no conifers".

**The precompute boundary.** Everything a user can change comes after the step "acres of each species in
each cell". So the geography runs once, offline, and the browser does the rest as pure arithmetic —
which is why sliding a factor is instant, and why the site has no backend to fall over while you look at
it.

```
trees            = acres × 200 per acre                       CAL FIRE AON §E
seedlings per lb = (seeds per lb ÷ seeds per pot)
                   × nursery survival × probability of a tree three factors CAL FIRE doesn't publish
pounds of seed   = trees ÷ seedlings per lb
bushels of cones = pounds ÷ lb of clean seed per bushel       AON Table 2
dollars          = pounds × price per lb                      CAL FIRE seed price list, Feb 2026
```

**No model anywhere in the numbers.** Every quantity is deterministic, unit-tested arithmetic over public
data. Units are enforced by tests, not convention: bushels are always *bushels of cones*; seeds per pound
never stands in for seedlings per pound.

**Tested end to end:** 170+ pipeline tests, 90+ unit tests and 24 browser tests: the interior visible on a
phone from a fire's own link, search from any page, an address inside a burn, and one outside California.
A test also holds the county figures to the fire index: each fire's county shares add back up to the whole
fire, except the part that crossed into Oregon or Nevada, which is measured.

## Is it right? Checked against published figures

- **Like for like.** Baker (2023) measured the share of high-severity burn area more than 90 m from live
  seed across ~56 million hectares: **21.9%**. Bushel computes the same quantity pixel by pixel. Pooled
  across all 237 California fires (53,638 of 239,581 high-severity acres, from the
  99 fires with high-severity conifer ground on state land) it gets **22.4%**
  (+0.5 points from the published figure). An independent computation
  landing near a published figure is corroboration — and 21.9% is never used as a multiplier.
- **Against CAL FIRE's own totals.** High-severity acres on non-federal conifer land, 2018–2023: Bushel
  **239,581 acres** against the state's 359,182 (−33.3%, 96.7% of burned state land covered).
  Bushel's total order: **2,143.8 bushels of cones** beside the state's 55,978. They are not expected to
  match: the state's figure also covers insect and disease die-off and timber harvest, and uses a
  timberland boundary it maps internally and does not publish. The panel lists every known cause.

## Challenges we ran into

- **Four unit traps.** A bushel measures cones, not seed. "Seeds per pound" is not seedlings per pound.
  The state's survival factor is for two-year seedlings; the nursery sells one-year plugs. Nursery
  survival is not survival after planting. Each is now a test.
- **The agency contradicts itself.** Its methodology works in bushels of cones; its conclusion says
  "bushels of conifer seed". We follow the methodology and footnote the contradiction on screen.
- **Not counting a correction twice.** Our first plan buffered the fire *and* applied Baker's 21.9% — but
  21.9% is itself the result of a 90 m buffer. We compute the buffer and use 21.9% only as a check.
- **An acres-burned check that comes in low.** Our statewide count of burned non-federal conifer land is
  830,011 acres against the state's 1,507,830 (−45%). The causes are specific and listed: the state also
  counts Local Responsibility Area land, and restricts to a timberland boundary it doesn't publish.
- **Fragile public services.** A retired State Responsibility Area endpoint, an image service that fails
  on oversized tiles, a map server that errors on large pages. We page, tile and retry.
- **A blank map on phones.** The map fitted the fire before its container had settled. Found in our own
  audit, fixed, and now covered by a phone-sized browser test.

## Accomplishments that we're proud of

- The seed-limited interior is **computed**, not a percentage applied to the burn.
- **Every fire in the state's window**, not a hand-picked demo set, and the site says which fires
  couldn't be built and why.
- **Live builds match pre-built ones exactly**, so "pre-built" never means "made up".
- **The agency's gap is disclosed precisely**: three named numbers stand between CAL FIRE's published
  method and a reproducible one.

## What we learned

**Where we started.** Our earlier hackathon projects were web apps built on documents: Reclaim drafts
appeals against insurance claim denials, and FoolProof is a scam-training simulator. Neither touched a
map. Bushel is the first time either of us worked with geospatial data: rasters, projections, polygon
geometry, a web map.

**What was new to us, and what it taught us:**

- **Coordinate systems.** A degree of longitude is not a fixed distance, so nothing can be measured in
  latitude and longitude. Every layer is reprojected to California Albers (EPSG:3310), an equal-area
  projection in metres, before a single acre or a 90 m distance is computed.
- **Grids versus shapes.** Burn severity is a 30 m grid; perimeters, ownership and seed zones are
  polygons. We learned when to switch between them. The 90 m threshold is three pixels in a distance
  transform, measured from every surviving patch at once.
- **Real geometry is messy.** Merging agency polygons produces slivers, self-intersections and mixed
  shape collections that crash later steps. Repairing geometry became a pipeline step of its own.
- **Public services fail.** We learned to page, tile and retry with backoff. 18 of the statewide builds
  still died on dropped connections; a resumable retry finished them.
- **Web maps and performance.** Drawing layers in MapLibre, and why a map fitted before its container
  settles comes out blank on phones. Loading the map code on demand cut first-load JavaScript from
  1,283 kB to 267 kB; dropping shapes too small to see cut the map data from 24 MB to 14 MB, and a test
  now caps the shipped data size.

**How we worked.** We wrote the spec, data contracts and task list first (Spec Kit), then built with an
AI coding agent (Claude Code). Code came quickly, which moved the hard part to deciding what is true and
proving it. Every figure traces to a source table, and a test fails if a unit drifts.

**What the research taught us:**

- Ask what a number counts — its units, population, jurisdiction and year — before it goes anywhere.
  Several claims we were sure of fell apart under that question.
- Read agency documents in full: the 200 trees-per-acre figure is in the state's report; a "180" figure
  circulating online is not.
- Put the contested estimate inside the product, and pick the one least favourable to you.

## Prior art

CAL FIRE's own *Assessment of Needs* does this calculation once a year for the whole state. Climate-
adapted seed matching is CAST (CAL FIRE, USFS and UC Davis); the Seedlot Selection Tool and the
Climate-Smart Restoration Tool handle climate-adjusted provenance; Terraware covers nursery operations;
Regenmapper takes a burn perimeter but asks whether it will regenerate on its own. Bushel does none of
those things. It starts from one fire and ends with a quantity of cones.

## What's next for Bushel

- **Publish three numbers, and this becomes reproducible anywhere.** CAL FIRE's seeds per pot, nursery
  survival and probability of a tree in the nursery.
- **The rest of the West.** Every California-only layer has a public national counterpart (provisional
  seed zones, LANDFIRE vegetation, PAD-US ownership), and Dobrowski et al. (2024) estimated eleven western
  states' reforestation need with the same seed-limited idea — a published total to check against.
- **Current fires,** once rapid post-fire severity products are validated for this use.

## Built before vs during the event

The submission window ran from 20 August 2026 (21:00 PDT) to 20 September 2026 (14:00 PDT). **Everything
in Bushel was made during it.** Idea research and fact-checking ran on 16–17 September; the repository's
first commit is 17 September 2026; all code, tests, data builds and the design system followed. Nothing
was carried over from an earlier project.

Not ours, and credited: the CAL FIRE reports and tables (in `reference/`), the public agency data, LEMMA
GNN 2023.1 (Oregon State University), the Spec Kit templates, the Vite React starter, and the open-source
libraries below. The implementation was written with Claude Code from our written spec, contracts and
task list (`specs/001-post-fire-seed-order/`).

## Data sources

| Layer | Source | Access |
|---|---|---|
| Fire perimeters | CAL FIRE FRAP California Historic Fire Perimeters | public service, keyless |
| Jurisdiction | CAL FIRE State Responsibility Area | public service, keyless |
| Seed zones | California Seed Zones (Buck et al. 1970) | public service, keyless |
| Elevation | USGS 3DEP | public service, keyless |
| Burn severity | MTBS thematic burn severity and burned-area boundaries (USFS) | public service, keyless |
| Pre-fire vegetation | LEMMA GNN 2023.1, Oregon State University — the layer CAL FIRE's own assessment uses | download form; cited as the LEMMA team asks |
| Stocking, conversion factors, benchmark | CAL FIRE 2025 Assessment of Needs (§E, Tables 1 and 2) | public PDF, in the repo |
| Seed prices, seeds per pound, deadlines | CAL FIRE Seed and Seedlings Terms of Sale, Feb 2026 | public PDF, in the repo |
| State and county boundaries | US Census cartographic boundary files, 2023 (1:20M states, 1:500k counties) | public download, keyless |
| Address search | OpenStreetMap, through the Photon geocoder (komoot) | public service, keyless; only the typed query is sent |
| Live builds outside California | MTBS perimeters and severity; PAD-US manager type; FIA BIGMAP forest type groups; USFS Individual Tree Species basal area; provisional national seed zones (Bower et al. 2014); USGS 3DEP | public services, keyless, called from the browser at build time |

## Built with

Python · geopandas · shapely · rasterio · pyproj · NumPy · SciPy · pytest · TypeScript · React · Vite ·
MapLibre GL JS · Vitest · Playwright · Spec Kit · Claude Code · ArcGIS REST services (CAL FIRE, USFS,
USGS) · MTBS · USGS 3DEP · LEMMA GNN 2023.1
