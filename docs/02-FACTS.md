# Verified fact base

Every claim here was checked at source. Anything not in this file is not verified — do not put it on screen.
Primary PDFs are in `../reference/`. Extracted AON text is `../reference/cal_fire_aon_2025_extracted.txt`.

---

## A. CAL FIRE Assessment of Needs (AON) 2025 — the ground truth

Source: *2025 Assessment of Needs for the State Seed Bank*, CAL FIRE Reforestation Services Program, signed 20 May 2025. Local copy: `reference/cal_fire_aon_2025.pdf` (30 pp).

- **55,978 bushels of conifer CONES** needed, down 900 from the 56,878 in the July 2024 edition.
- **Target = 25% of productive conifer forests on NON-FEDERAL lands, statewide.** Verbatim: *"how many bushels of seed need to be collected to reforest 25% of productive conifer forests on non-federal lands at any given time throughout the state of California."* Not 25% of burned acres.
- The need is driven by wildfire **plus** insect/disease mortality **plus** timber harvest — the AON folds in *"natural disturbance statistics, CAL FIRE timber harvesting operations, demonstration state forests, and parcel data within each seed zone and 500-elevation band."*
- Jurisdiction: **SRA + LRA only** (State and Local Responsibility Areas), all 85 seed zones.
- Partition unit: **seed zone × 500-foot elevation band**, species allocated inside cells.
- Collection priority index: >100 bushels = priority 1 (red); 11–100 = priority 2 (orange); ≤10 = priority 3 (yellow).
- Uses **MTBS** for high-severity burn patches, wildfires ≥1,000 acres.

### Planting density — 200 trees per acre (published)

Verbatim, AON §E: *"An average stocking requirement of 200 trees per acre (TPA) was applied to
targeted reforestation acres for all species found above. This number was derived as an
acceptable average carrying capacity for forestlands relative to CA Forest Practice Rule (FPR)
requirements that can range between 50 and 200 TPA depending on location and forest management
prescriptions ... with the assumption of each acre needing maximum stocking in the worst-case
hypothetical scenario."*

**Carry the caveat.** 200 TPA is a maximum-stocking worst case, not a point estimate. A "180
TPA" figure circulating in search results is **not in the document** — do not use it.

### Vegetation source — LEMMA 2023.1

Verbatim: *"we used most recent vegetation data hosted by the Landscape Ecology, Modeling,
Mapping, and Analysis (LEMMA) program at Oregon State University ... This data maps current
vegetation type, an attribute that identifies up to two dominant tree species based on basal
area."* The 2025 edition switched to LEMMA from USFS CalVeg. **Not LANDFIRE, not CWHR/FVEG.**

### Species of interest — 15, of which 11 have conversion factors

Big-Cone Douglas Fir · Coast Redwood · Coulter Pine · Douglas Fir · Giant Sequoia · Incense
Cedar · Jeffrey Pine · **Knobcone Pine** · **Lodgepole Pine** · Ponderosa Pine · Red Fir ·
**Subalpine Fir** · Sugar Pine · **Western White Pine** · White Fir

The four in bold are absent from Table 2 and fall under the agency's stated fallback of
**1 bushel = 1 lb**. Every line relying on it must be marked.

### Severity data currency

The AON states *"2023 is the most recent year of tree mortality and wildfire severity data
available at the time of publication."* Severity mapping runs 1–2 years behind, so 2025–2026
fires have none. The window 2018–2024 was chosen as *"more recent (and larger) fires that still
have reforestation potential."*

### Table 1 — disturbance statistics (see `data/aon_disturbance_table1.csv`)

**Total 2018–2024: 1,507,830 acres burned on non-federal conifer forestland, 359,182 at high severity, 22.5 million trees lost to insects and disease.**

### Table 2 — cones to clean seed (see `data/table2_cones_to_seed.csv`)

**Eleven species.** Douglas Fir 0.5 lb clean seed/bushel (900–1000 cones); Sugar Pine 1.4 (12–18 cones); Ponderosa 1.0 (90–100); Jeffrey 1.2; White Fir 1.1; Red Fir 0.9; Incense Cedar 0.7; Big-Cone Douglas Fir 0.75; Coast Redwood 0.75; Giant Sequoia 0.75; Coulter 0.9.
Species not in the table: the AON assumes **1 bushel = 1 lb**.

"Clean seed" = processed to >95% purity, <9% moisture, ready for long-term storage.

The unit: *"One bushel consists of 8 dry gallons of opened cones."* (AON, extracted text line 385.)

### Limitations the AON states about itself

- Known overestimate, verbatim (extracted text lines 36–39): *"The current version of the assessment does not explicitly exclude privately-owned industrial land ... The estimated seed collection need statistics therefore somewhat overestimate the actual need, which is lower due to industrial seed reserves."*
- Internal boundary, verbatim (line 27): *"Timberlands boundary is still mapped internally by CAL FIRE"* — not a public layer, so per-fire retained acreage cannot be restricted to the agency's productive timberland exactly.

### ⚠️ The agency contradicts itself

The AON **methodology** says "conifer cone bushels" and Table 2 is explicitly cones→clean seed. Its **conclusion section** says "55,978 bushels of conifer seed." **The methodology governs.** This is probably how American Forests came to publish the figure mislabelled as seed.

Put this in the writeup as a footnote — *the agency's own document disagrees with itself; we follow its method* is a credibility builder, not a caveat.

---

## B. CAL FIRE Terms of Sale (Feb 2026) — prices and deadlines

Source: *Seed and Seedlings Terms of Sale and Ordering Process*, CAL FIRE Reforestation Services Program, L.A. Moran Reforestation Center (LAMRC), Davis CA. Local copy: `reference/cal_fire_terms_of_sale_feb2026.pdf` (10 pp).

### The deadline

- Seed order form open **1 September – 31 December**.
- **Sugar Pine, Red Fir and White Fir must be ordered by 31 October** due to longer stratification needs.
- Seedling order form opens 1 April, closes 31 October **"or when the RSP nursery has reached projected capacity… capacity is commonly reached by mid-summer."**
- Seedlings are sown the **February and April of the year after the form closes**, then grown a **minimum of 9 months**. Order to planting ≈ 18 months.
- Requests under 1,000 seedlings may be denied.

### Sales priority (this names the user)

Priority 1: *"Projects intended to reforest land severely disturbed by fire, flooding, pest outbreaks, disease, or other natural events where a **Registered Professional Forester (RPF)** has been consulted and a management plan is in place."*

Ownership preference order: **1. privately-owned non-industrial and tribal lands → 2. state, regional, local government and public lands → 3. federal, privately-owned industrial and other lands.**

Federal is last. A national forest reforestation lead is bottom of this queue.

### Prices (see `data/seed_prices.csv`)

Seed is sold **by weight**, and the table header reads **"Average Seeds/pounds"** — seeds, not seedlings.
Douglas-Fir $497.00/lb (30,455 seeds/lb); Ponderosa $230.00 (9,240); Non-BRR Sugar Pine $334.00 (1,794); White Fir $223.00 (10,651); Red Fir $205.00 (5,113); Incense Cedar $420.00 (15,137); Coast Redwood $832.00 (95,364); Giant Sequoia $660.00 (79,203).

Conifer **seedlings**: $0.50 at 1,000+, $0.55 at 500–999, $0.60 under 500 — all sold as **one-year-old plugs**.
**Price off the seed list, not the seedling list** (see the unit traps in `03-DO-NOT-CLAIM.md`).

### CAST

CAL FIRE matches orders *"with seeds from the same seed zone and elevation as the planting site or using the most-suitable alternative according to the **Climate-Adapted Seed Tool**"* (CAL FIRE + USFS + UC Davis). CAST estimates percent decline in productivity from climate-mismatched seed. **It is prior art. Cite it, never claim climate-adapted matching as ours.**

---

## C. Seed zones

- **California: Buck et al. 1970** — 6 physiographic/climatic regions → 32 subregions → **85 zones**, three-digit XYZ codes. Map legend: *"use material within 500-foot elevation of planting location."* CAL FIRE operationalises this as 500-ft DEM-derived bands intersected with the zones.
- **One grid for all conifers.** Species are allocated inside cells, not given their own maps.
- **Federal: Bower, St.Clair & Erickson 2014** — also a **single generalized map**, 64 zones from winter minimum temperature and a heat:moisture index, an explicit generic substitute for any species. Provisional, built on climatic similarity, with tolerances rather than hard boundaries (Crow et al. 2018).
- Species-specific zone maps exist only in **Oregon and Washington**, for Douglas-fir and ponderosa.

---

## D. Regeneration failure — the premise

- **Stevens-Rumann et al.:** 70% of burned sites returned to **pre-fire density** before 2000, vs 46% after 2000; about a third show no conifer regeneration. *Density, not species mix.*
- **Gill et al. 2022, *BioScience*:** most wind-dispersed conifer seed falls within **200 m**; non-serotinous species rarely much farther than **100 m**. Do not use any other dispersal figure.
- Modern high-severity patches run 1,000–30,000 acres.
- **Davis et al. 2019, *PNAS*:** climate has crossed regeneration thresholds at most sites *independent of seed limitation* — the argument for why provenance matching has to exist at all.

### The counter-argument — goes inside the product

**Baker 2023, *Climate*** (~56M ha analysed): seed-limited interior area averages only **21.9%** of high-severity burn area, arguing regeneration failure is overstated. Single-author, MDPI, minority position — the strongest published counter-argument, which is why Bushel adopts its threshold.

**The 90 m threshold.** Verbatim, abstract (verified 2026-09-17 via FRAMES catalog 68660; MDPI blocks automated fetch): *"The vulnerable interior area averaged only 21.9% of total high-severity fire area, as 78.1% of burned area was within 90 m of live seed sources where successful tree regeneration is likely."* Scope: ~56 million ha, 11 western US states, 2000–2020. Citation: Baker, W.L. 2023. *Climate* 11(11):214.

**Run 90 m as the default threshold; 21.9% is a cross-check, never a multiplier** (superseded the earlier "run 21.9% as the default" — see `specs/001-post-fire-seed-order/research.md` R3: applying the 90 m buffer and then 21.9% double-counts one correction). On screen: *"90 m — Baker (2023), the published estimate least favourable to this conclusion."* One number, not a range, and no toggle.

---

## E. National context (use sparingly, and only as labelled)

- **Fargione et al. 2021, *Frontiers*:** US nurseries produce **1.3 billion** seedlings/yr (2019) against a need for **+1.7 billion/yr** — a 2.3× increase.
- **Dobrowski et al. 2024 ("Mind the Gap"):** high-severity fire 1984–2021 created 2.4M ha of reforestation need against 0.9M ha reforested — under 40% met. *Counts seedlings, not pounds.*
- **American Forests 2021:** 14 USFS nurseries closed, 6 remain; 8 states have shut theirs mostly since 2005. Fargione separately documents the South: 28 closures since 1995, −650M seedlings/yr.
- **NASEM 2023**, *An Assessment of Native Seed Needs and the Capacity for Their Supply* — qualitative authority that nobody tracks native seed supply: *"there were limits to the committee's ability to obtain a complete picture."*

**No national conifer-seed figure exists in pounds.** All national gap figures are seedlings or acres. California is the only jurisdiction publishing in the unit Bushel outputs.

---

## F. General reference defaults (label as general, not CAL FIRE's)

- Conifer seed commonly germinates above 90% under nursery conditions.
- Bareroot **field** survival runs roughly 80–90% with proper handling — this is survival *after outplanting*, which is **not** the AON's nursery survival factor.

---

## Dobrowski et al. 2024 — the western US reforestation gap (What's next only)

Dobrowski, S.Z. et al. 2024. "Mind the gap — reforestation needs vs. reforestation capacity in the western United States." *Frontiers in Forests and Global Change* 7:1402124. doi:10.3389/ffgc.2024.1402124. Fetched from the full text on 17 September 2026.

- **Scope:** 11 western states (AZ, CA, CO, ID, MT, NV, NM, OR, UT, WA, WY), MTBS fires over 4 km², 1984–2021.
- **Method:** reforestation need is high-severity area farther than about 100 m from a live seed source, estimated with an area-to-perimeter relationship (Collins et al. 2017). This is a statistical estimate, not a per-fire raster computation.
- **Headline:** 2.4M ha of reforestation need; a cumulative gap of 1.5M ha; a projected gap of about 3.3M ha by 2050.
- Used only in README "What's next". It is not an input to, or a check on, any California order.

