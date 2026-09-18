# Seedshed

**For any burned place in California, Seedshed works out the seed order that would actually bring the forest back — which acres will never grow back on their own, which species, how much seed, zone by zone.**

California publishes that number once a year, for the whole state: **55,978 bushels of cones**. Seedshed computes it for one fire, on demand.

Built for [NextStep Hacks 2026](https://nextstep2026.devpost.com) — theme *Earth Forward*.

---

## Part 1 — The simple version

*This section assumes you know nothing about forestry. No jargon, or it gets explained.*

### Forests used to grow back by themselves

When a forest burned, some trees survived. Those survivors dropped seed. The seed blew into the burned patch, landed, and the forest came back. Nobody had to do anything.

That still happens after small or gentle fires. It increasingly doesn't happen after big severe ones, and the numbers show the shift clearly:

- Before 2000, **70%** of burned sites grew back to the tree density they had before the fire.
- After 2000, **46%**.
- About **a third** of burned sites now show no conifer regeneration at all.

### Why it stopped working

Two things changed at once.

**The survivors died.** A high-severity fire kills the trees that would have supplied the seed. No parent trees, no seed.

**The burns got too wide.** This is the part people miss. Conifer seed doesn't travel far — most of it lands within 200 metres of the tree that dropped it, and for many species rarely past 100 metres. Meanwhile modern high-severity patches run thousands of acres across.

So picture a burned patch several kilometres wide. Around the edge, surviving trees seed into the first hundred metres or so. Everything past that is out of range. **Nothing will reach it.** That middle part — the part beyond seeding distance — is the part a human has to plant, and it's the single most important number in this whole project.

### So you plant it. Why is that hard?

Because you can't plant just any seed.

A ponderosa pine from the hot dry foothills is a different animal from a ponderosa pine from a cold high ridge, even though they're the same species. Plant the wrong one and it dies, or it limps along and never becomes a forest.

California solved this in 1970 by dividing the state into **85 seed zones** — areas with similar climate, soil and terrain, where seed can be moved around safely. There's a second rule on top of it: stay within **500 feet of the elevation** you collected from. So a single big fire that spans several zones and climbs a mountainside isn't one planting job. It's a dozen separate ones, each needing its own seed, and they can't be pooled.

### And then there isn't enough seed

Seed comes from cones, and cones have to be physically collected off trees by people, in good years, from the right zone, at the right elevation.

California's seed bank publishes what it needs once a year. For 2025: **55,978 bushels of cones** — enough to replant a quarter of the productive conifer forest on the state's non-federal land.

That figure isn't only about fire. It answers for wildfire, insect and disease death, and timber harvest together. Between 2018 and 2024, **1.5 million acres** of non-federal conifer forest burned in California, and separately **22.5 million trees** died from insects and disease.

### What Seedshed does about it

The state calculates that number **once a year, for the entire state, as a single planning document.** That's the right tool for planning a statewide seed-collection season. It's the wrong tool if you're standing in front of one particular burn and need to know what *this* fire needs, now.

Seedshed does the same calculation, for one fire, in seconds.

---

## Part 2 — A real example

### The person

A **Registered Professional Forester** — a licensed forester, the person California requires you to involve for serious forest work — is managing a burned property for a private landowner.

She's not hypothetical. CAL FIRE's own seed-ordering rules put her at the front of the queue. Their first sales priority is, word for word:

> *"Projects intended to reforest land severely disturbed by fire ... where a Registered Professional Forester (RPF) has been consulted and a management plan is in place."*

And their landowner preference runs: **private non-industrial and tribal first, state and local second, federal last.**

### Her deadline is real and it is published

- The seed order window runs **1 September to 31 December**.
- **Sugar pine, red fir and white fir must be ordered by 31 October** — they need a longer cold-storage treatment before they'll germinate.
- The seedling queue opens 1 April and closes 31 October *"or when the nursery has reached projected capacity — capacity is commonly reached by mid-summer."*
- Seedlings are sown the **February after** the order closes, then grown at least nine months.

Add it up: **roughly eighteen months from placing an order to having something you can put in the ground.** Miss the window and you don't lose a week. You lose a year.

### The fire

Take the **Camp Fire** — Butte County, ignited 8 November 2018, **153,335 acres**, state responsibility. Those figures come straight from CAL FIRE's own perimeter record, which is one of the live data sources this project reads.

### What she does today

She works it out by hand, over weeks. Pull the burn perimeter. Work out which parts are state responsibility and which are federal. Read how severely each part burned. Look up which seed zones it crosses and what elevations. Work out what was growing there before. Estimate how many trees per acre. Convert trees to seed. Convert seed to cone bushels, because that's the unit the seed bank orders in. Do that separately for every species in every zone at every elevation band.

Then check her arithmetic, because an error here doesn't show up for eighteen months.

### What she does with Seedshed

She clicks the fire.

**First, the tool throws away everything it isn't allowed to count.** CAL FIRE only has jurisdiction over non-federal land, so the perimeter gets clipped to State Responsibility Area. The excluded acreage is reported, not silently dropped — if two-thirds of your fire was on National Forest land, you need to know that, not just get a smaller number with no explanation.

**Then it reads how badly each acre burned**, and keeps only the high-severity ground — the acres where the trees actually died.

**Then the moment that matters.** It measures inward from every edge where living forest survived, and lights up the interior — the acres beyond seeding range. *They are not the whole fire.* Usually they're a minority of it. This is the difference between ordering seed for 153,335 acres and ordering it for the acres that genuinely need it, and it is the single biggest source of error in doing this by hand.

**Then it splits the fire.** Not one job — one job per seed zone per 500-foot elevation band, with species assigned from what was growing there before the fire. The tool refuses to merge those cells together to make the number tidier. That refusal has a name in this codebase: **Provenance Lock**.

**Then it converts, showing its work.** Acres to trees. Trees to pounds of seed. Pounds to cone bushels. Bushels to dollars. Every single factor displayed next to the CAL FIRE table it came from — and three of them flagged in amber, for a reason that's the most interesting thing in this project (Part 4).

**And it lands next to the state's own number.** Her fire's requirement, beside California's 55,978.

---

## Part 3 — What makes it trustworthy

Anyone can build a calculator that produces a number. The question is whether the number is right.

**Seedshed reimplements CAL FIRE's own published method rather than inventing one.** The formula is lifted verbatim from the state's 2025 Assessment of Needs, which is included in this repo as a PDF.

**Which means it can be checked against the state's own answer.** Run the same calculation across the same period and jurisdiction the state covers, and compare the total to 55,978. That's not a claim of accuracy — it's a test that either passes or fails in public.

**There are upstream checks too**, so early stages can be verified before the conversion chain is even involved:

| Check | Published figure | Period |
|---|---|---|
| Acres burned, non-federal conifer forestland | 1,507,830 | 2018–2024 |
| High-severity acres | 359,182 | **2018–2023** |

Those two windows are different, and that isn't a typo. The state's Table 1 carries no 2024 severity value — the six years 2018–2023 sum to exactly 359,182 — while the acreage total does include 2024. Comparing either against the wrong window produces a failure that has nothing to do with the code.

**Where the science is contested, the tool takes the side that hurts it.** How much of a high-severity burn is genuinely beyond seeding range is actively disputed. Baker (2023) puts it at an average of 21.9%, which is the estimate least favourable to the conclusion that planting is needed. Seedshed uses Baker's method and threshold by default, and says so on screen.

---

## Part 4 — The gap, which is the point

CAL FIRE publishes its method. Here it is, word for word:

> *Average seedlings produced per pound = (average seed per pound / average seed per pot) × percent survival rate in nursery × average probability of a tree in nursery*

> *Number of pounds needed to collect = (number of trees in reforestation acres / average seedlings per pound)*

> *Number of bushels needed = (number of pounds needed to collect / average pounds of clean seed per bushel)*

Now look at the three factors on the right of that first line — **seeds per pot**, **nursery survival rate**, and **probability of a tree in nursery**. The document sources all three from *"Historical LAMRC nursery datasets."*

Those datasets are internal. **They are not published.**

So the state's published method cannot be reproduced from public data. Three numbers stand between a public price list and a reproducible estimate.

**Seedshed does not paper over this.** Those three factors appear in amber, carrying explicit defaults, clearly labelled as not published by CAL FIRE, and adjustable by the user. The formula stays on screen.

That's not the project disclosing its own weakness. It's the project disclosing the agency's, precisely, with the formula visible — and it makes the fix obvious. **Publish those three numbers and this becomes reproducible for every state.**

---

## Part 5 — Technical architecture

### The one design decision everything follows from

Every factor a user can adjust — planting density, and the three unpublished nursery factors — sits **downstream of acres-per-cell-per-species.**

That means you can precompute all the geography, stop at that boundary, and ship the remainder as arithmetic.

```
┌─────────────────────── OFFLINE (Python) ───────────────────────┐
│  perimeter → SRA clip → severity → interior → partition        │
│                                  → species allocation          │
└────────────────────────────┬───────────────────────────────────┘
                             │  static JSON artifacts
            ═══ PRECOMPUTE BOUNDARY ═══
                             │
┌────────────────────────────▼───── IN BROWSER (TypeScript) ─────┐
│  acres → trees → pounds → bushels → dollars                    │
│  pure arithmetic · no I/O · no network · no model              │
└────────────────────────────────────────────────────────────────┘
```

Four things fall out of that split:

- **Adjusting an assumption is instant.** It's a local recalculation over a small payload, not a server round-trip.
- **The numeric path is trivially testable.** It's a pure function with no dependencies.
- **The deployed artifact is static.** There's no backend to fall over while someone is looking at it.
- **The heavy geospatial stack never runs in production.** It runs once, at build time.

### Pipeline stages

| # | Stage | What it does | Why |
|---|---|---|---|
| 1 | **Jurisdiction clip** | Intersect the perimeter with State Responsibility Area; report retained *and* excluded acreage | CAL FIRE's jurisdiction defines the benchmark's scope. Without this, any comparison to 55,978 is invalid. |
| 2 | **Severity read** | MTBS thematic burn severity, class 4 = High | The same source the state's own assessment uses |
| 3 | **Interior** | Euclidean distance transform inward from high-severity patch edges, 90 m threshold | The acres beyond natural seeding range. A correctness requirement, not polish — skip it and you order seed for the whole burn. |
| 4 | **Partition** | Intersect 85 seed zones (Buck 1970) with 500-foot elevation bands from a DEM | Seed is matched to zone *and* elevation. Cells are never merged. |
| 5 | **Species allocation** | LEMMA 2023.1 vegetation, filtered to the 15 conifer species of interest | LEMMA carries up to two dominant species by basal area — and it's what the benchmark was computed from |

Stage 3 is where the technical difficulty lives, and stage 4 is where the constraint lives.

### The conversion chain

Runs in the browser, pure, per species per cell:

```
trees            = acres × 200 TPA                      ← AON §E
seedlings_per_lb = (seeds_per_lb ÷ seeds_per_pot)
                     × nursery_survival
                     × probability_of_tree               ← 3 AMBER FACTORS
pounds           = trees ÷ seedlings_per_lb
bushels          = pounds ÷ lbs_clean_seed_per_bushel    ← AON Table 2
cost_usd         = pounds × price_per_lb_usd             ← Terms of Sale
priority         = bushels > 100 ? 1 : ≥11 ? 2 : 3       ← AON priority index
```

Every factor carries its source and a published/unpublished status, so the interface can show the full trail for any quantity without recomputing anything.

### Unit discipline, enforced in code

This domain is full of near-identical quantities that are not interchangeable. Four of them are enforced by tests rather than by convention:

| Trap | The rule |
|---|---|
| A **bushel** is 8 dry gallons of **cones**, not seed | Douglas-fir yields ~0.5 lb of clean seed per bushel; sugar pine ~1.4 |
| **Seeds per pound ≠ seedlings per pound** | They differ by germination and nursery survival. Substituting them silently assumes 100% of both. |
| The AON's survival factor assumes a **two-year seedling**; the nursery sells **one-year plugs** | Any seedling figure is labelled two-year-equivalent |
| **Nursery survival ≠ field survival** | Field survival happens after planting and has no place in this chain |

### Data sources

Everything is public, keyless, and free of registration. All verified live.

| Layer | Source |
|---|---|
| Fire perimeters | CAL FIRE FRAP historical perimeters (1950+) |
| Active incidents | WFIGS national incident feed |
| Jurisdiction | CAL FIRE FRAP State Responsibility Area |
| Seed zones | California Seed Zones — Buck et al. 1970, 85 zones, via data.ca.gov |
| Elevation | USGS 3DEP |
| Burn severity | MTBS thematic burn severity |
| Pre-fire vegetation | LEMMA 2023.1 (Oregon State University) |
| Conversion factors | CAL FIRE 2025 Assessment of Needs, Table 2 |
| Prices | CAL FIRE Seed and Seedlings Terms of Sale, Feb 2026 |

Both CAL FIRE PDFs are committed to `reference/` along with extracted text, so every figure can be re-checked without a network call.

### Scope, and why it's California

Not timidity — verifiability. California is where the ground truth lives: a published benchmark denominated in the same unit as the output, with the conversion table, the price list, and the operational seed-zone system all from the same agency.

Nationally, none of that exists in one place. Gap figures are published in seedlings or acres, never in pounds of conifer seed; the federal seed-zone system is a different, generalized map; and there is no equivalent published total to check against. Going national would produce a bigger-sounding claim and remove the only thing that makes the number verifiable.

The method generalises. The ground truth doesn't — yet. See Part 4.

---

## Part 6 — Repository

```
seedshed/
├── docs/
│   ├── 00-BRIEF.md          Product: user, walkthrough, demo climax, build order
│   ├── 01-EVENT.md          Judging rubric verbatim, deadline, requirements
│   ├── 02-FACTS.md          Every verified claim with its source
│   ├── 03-DO-NOT-CLAIM.md   Binding. Six claims died in review; this is the list.
│   ├── 04-DATA-SOURCES.md   Endpoints, verified live, all keyless
│   └── 05-METHOD.md         CAL FIRE's formula and the pipeline
├── specs/001-post-fire-seed-order/
│   ├── spec.md              27 functional requirements, 9 success criteria
│   ├── plan.md              Architecture and constitution gates
│   ├── research.md          Phase 0 — what was checked and what it overturned
│   ├── data-model.md        Entities, split at the precompute boundary
│   ├── contracts/           The pipeline → web interface
│   ├── quickstart.md        Nine runnable validation scenarios
│   └── tasks.md             71 tasks across 7 phases
├── data/                    Extracted agency tables (CSV)
├── reference/               CAL FIRE PDFs and extracted text
├── pipeline/                Offline geospatial build (Python)
└── web/                     Static application (TypeScript)
```

### Running it

```bash
cd pipeline && pip install -e .
python -m seedshed.fetch --cache ../data/cache     # one-time, needs network
python -m seedshed.build --out ../web/public/data  # emits static artifacts

cd ../web && npm install && npm run dev
```

After the build, the application runs fully offline. Validation scenarios are in [`specs/001-post-fire-seed-order/quickstart.md`](specs/001-post-fire-seed-order/quickstart.md).

---

## Part 7 — Ground rules

This project killed six separate factual claims during design, each of which had survived several rounds of review. Every one died to the same question: **what is this number actually counting?** — its units, its population, its jurisdiction, its year.

Four rules came out of that, and they're enforced by the project constitution:

1. **Every figure on screen traces to a primary source.** If it isn't in `docs/02-FACTS.md`, it doesn't ship.
2. **Units are carried, never assumed.** Cones are not seed. Seeds are not seedlings.
3. **Arithmetic is deterministic.** No model anywhere in the numeric path.
4. **Gaps are disclosed, never filled.** Where data doesn't exist, the tool says so and shows the formula it can't complete.

Before adding anything user-facing, read [`docs/03-DO-NOT-CLAIM.md`](docs/03-DO-NOT-CLAIM.md). It's short, it's specific, and every entry is there because something that looked obviously true wasn't.

---

## Prior art, named up front

- **CAL FIRE's Assessment of Needs** already produces this artifact — annually, statewide, as a GIS analysis. Seedshed's contribution is doing it per fire, on demand. Nobody has built that.
- **Seedlot Selection Tool** (USFS PNW / Oregon State / Conservation Biology Institute) and **Climate-Smart Restoration Tool** (USFS RMRS) already do climate-adjusted provenance matching. Seedshed does not claim that capability.
- **CAST**, the Climate-Adapted Seed Tool, is CAL FIRE's own, built with USFS and UC Davis. It's what the agency uses when an exact zone match isn't available.
- **Terraware** covers reforestation and nursery operations.
- **Regenmapper** takes a burn perimeter but answers a different question: will this regenerate unaided?

None of them chains burn perimeter → seed-limited interior → zone and elevation → species → quantity. That chain is the gap.
