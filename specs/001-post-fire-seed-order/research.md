# Phase 0 Research: Post-Fire Seed Order

**Date**: 2026-09-18
**Sources**: CAL FIRE 2025 Assessment of Needs (read in full from `reference/cal_fire_aon_2025.pdf`), CAL FIRE Terms of Sale Feb 2026, plus targeted external research.

Four unknowns entered this phase. All four are resolved. Two overturned assumptions written into the specification, and one resolved a method conflation that would have double-counted.

---

## R1. Planting density — RESOLVED: published, not an assumption

**Decision**: Use **200 trees per acre**, cited to the AON.

**Verbatim from the AON, section E**:
> *"An average stocking requirement of 200 trees per acre (TPA) was applied to targeted reforestation acres for all species found above. This number was derived as an acceptable average carrying capacity for forestlands relative to CA Forest Practice Rule (FPR) requirements that can range between 50 and 200 TPA depending on location and forest management prescriptions. This stocking requirement was applied ... with the assumption of each acre needing maximum stocking in the worst-case hypothetical scenario."*

**Rationale**: The specification's Assumptions section treated density as a disclosed judgement call because no published figure had been verified. That was wrong — CAL FIRE publishes it, and reproducing the agency's method requires using the agency's number. It moves from amber assumption to cited published factor.

**Carry the caveat too**: 200 TPA is explicitly a *maximum-stocking worst case*, and the FPR range it derives from is 50–200. The interface must state that, or the order silently presents an upper bound as a point estimate. Density remains user-adjustable across the 50–200 range, but its default is published and labelled as such.

**Alternatives rejected**: California Forest Practice Rules minimum stocking (125 trees/acre on Site I–III, 100 on Site IV–V) is published but scoped to *timber harvest regeneration*, not post-fire replanting — an analogy, not a citation. A widely circulated "180 TPA" figure attributed to CAL FIRE appeared only in a search snippet and is **not in the document**; it would have been wrong by 10%.

---

## R2. Vegetation layer — RESOLVED: LEMMA, not LANDFIRE

**Decision**: Use **LEMMA** (Landscape Ecology, Modeling, Mapping and Analysis, Oregon State University), **version 2023.1**.

**Verbatim from the AON**:
> *"To identify areas of conifer vegetation, we used most recent vegetation data hosted by the Landscape Ecology, Modeling, Mapping, and Analysis (LEMMA) program at Oregon State University ... This data maps current vegetation type, an attribute that identifies up to two dominant tree species based on basal area."*

The AON's 2025 edition specifically **switched from USFS CalVeg to LEMMA** for higher resolution, noting the change made *"the entire AON area of interest ... derived from the same underlying LEMMA vegetation data source."*

**Rationale**: `docs/04-DATA-SOURCES.md` listed LANDFIRE EVT. That was a guess and it is wrong for this purpose — EVT yields a vegetation *type name*, requiring an uncited interpretive step to reach species. LEMMA carries up to two dominant species by basal area directly, which is the attribute the calculation needs, and it is what the benchmark was computed from. Using anything else guarantees a divergence from the total we are checked against.

**Alternatives rejected**: CWHR/FVEG names dominant species and is CAL FIRE's own layer, so it was the better guess — but the agency did not use it here. CalVeg is what the agency moved *away from*.

---

## R3. Seed-limited interior — RESOLVED, and a conflation corrected

**Decision**: Compute the interior as a **Euclidean distance transform inward from the edge of high-severity patches at a 90 m threshold**, matching Baker (2023). Treat **21.9% as a validation target, not a multiplier.**

**Rationale**: The specification carried two mechanisms that looked complementary and are not. Baker's 21.9% figure *is the result of* a 90 m inward buffer applied across ~56M ha of western US forest, 2000–2020. Applying a distance transform and then multiplying by 21.9% double-counts the same correction.

Resolving it improves the product. The interior becomes a genuine geospatial computation rather than a scalar multiply, which is where the technical difficulty actually lives, and 21.9% becomes a cross-check: our computed interior fraction should land near it.

**Method is standard but unpackaged**: distance-transform-from-live-edge is the established technique in the regeneration literature; no named USFS tool implements it. High severity is treated as uniformly seed-free except near patch edges — surviving individual stems inside high-severity patches are not separately accounted for, consistent with Baker.

**Threshold handling**: 90 m is the default because it is Baker's, and Baker is the published estimate least favourable to the conclusion that planting is needed. Gill et al. 2022 (most wind-dispersed conifer seed within 200 m; non-serotinous rarely past 100 m) is the scientific basis for why distance matters and is offered as an alternative threshold — **but 90 m and 200 m are different figures from different sources and must never be presented as one default.**

---

## R4. Burn severity source — RESOLVED: MTBS, with the demo fire inside the benchmark window

**Decision**: Use **MTBS thematic burn severity**, severity class **4 = High**. Restrict fire selection to the benchmark window.

**Class codes**: 0 Background · 1 Unburned-to-Low · 2 Low · 3 Moderate · **4 High** · 5 Increased Greenness · 6 Non-Mapping.

**Access**: ArcGIS image services queryable by geometry (USFS-hosted MTBS CONUS), plus bulk boundary and occurrence shapefiles from mtbs.gov's Direct Download. Per-fire GeoTIFFs follow `<Fire_ID>_<postfire_date>_nbr.tif`, though the exact per-fire URL scheme on burnseverity.cr.usgs.gov could not be confirmed (that host bot-blocks automated fetches).

**The lag, and why it does not matter here**: MTBS runs 1–2 years behind. The live 2026 California fires — Plaskett, Timber, MP18 — have no MTBS severity and will not for some time.

CAL FIRE hit the same wall and said so: *"2023 is the most recent year of tree mortality and wildfire severity data available at the time of publication."* The AON's window is 2018–2024, chosen because those are *"more recent (and larger) fires that still have reforestation potential."*

So the resolution is to select the demo fire from **2018–2023**, which puts the demonstration and the validation on one severity source and one pipeline. It costs nothing narratively: reforestation ordering happens years after a fire, so a forester ordering seed today against the 31 October deadline for a 2023 burn is the ordinary case.

**Alternative rejected**: BAER soil burn severity covers current fires within days but is a different product with four classes, is not always published for a given incident, and would put the demo on data the benchmark was never computed from. Deferred to future work.

---

## R5. Species scope — corrected from 11 to 15

The AON filters to **15 conifer species of interest**: Big-Cone Douglas Fir, Coast Redwood, Coulter Pine, Douglas Fir, Giant Sequoia, Incense Cedar, Jeffrey Pine, Knobcone Pine, Lodgepole Pine, Ponderosa Pine, Red Fir, Subalpine Fir, Sugar Pine, Western White Pine, White Fir.

AON Table 2 provides cones-to-clean-seed factors for only **11** of them. The four without published factors — **Knobcone Pine, Lodgepole Pine, Subalpine Fir, Western White Pine** — fall under the agency's own stated fallback of *one bushel equals one pound*.

This makes the specification's "species absent from the conversion table" edge case concrete and non-hypothetical: it affects four of fifteen species, and every line relying on the fallback must be marked.

---

## R6. Architecture — precompute the geography, ship the arithmetic

**Decision**: An offline Python pipeline emits per-fire cell tables; a static web application performs the conversion chain in the browser.

**Rationale**: FR-013 requires recomputation whenever an assumption is adjusted, and FR-014 requires a deterministic numeric path. Every adjustable factor — planting density, and the three unpublished nursery factors — sits *downstream* of acres-per-cell-per-species. Precomputing to that boundary makes the entire conversion chain pure arithmetic over a small payload: adjusting a factor is an instant local recalculation, the numeric path is trivially unit-testable in isolation, and the deployed artifact has no backend to fail during judging.

**Alternatives rejected**: A live server running geospatial operations per request adds a failure mode on demo day for no user-visible benefit. Doing the raster work in-browser is not viable at these data volumes.

---

## Residual risks

- **Timberland boundary.** The AON restricts to *productive* conifer forestland using a timberlands boundary *"mapped internally by CAL FIRE."* That internal layer may not be public. If it is not, our retained acreage will exceed theirs and the validation gap must attribute the difference rather than hide it.
- **Known agency overestimate.** The AON states it *"does not explicitly exclude privately-owned industrial land"* and therefore *"somewhat overestimates the actual need."* Any comparison to 55,978 must carry that caveat.
- **Per-fire MTBS URL scheme unconfirmed.** Falls back to the image service or bulk download; low risk, but it is an implementation unknown rather than a settled one.
