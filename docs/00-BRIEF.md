# Seedshed — product brief

**Read this first. `03-DO-NOT-CLAIM.md` is binding on every line of UI copy, README text and video script.**

## In one sentence

For any burned place in California, Seedshed produces the order that would actually bring the forest back — which acres will never reseed themselves, which species, how many cone bushels, by seed zone and elevation band — the assessment the state publishes once a year for the whole state, computed for a single fire in seconds.

## The problem

Forests used to grow back on their own. Increasingly they don't: before 2000, 70% of burned sites returned to pre-fire tree density; after 2000, 46%, and about a third show no conifer regeneration at all. The parent trees are dead and high-severity patches run thousands of acres, while non-serotinous conifer seed rarely lands much farther than 100 metres from a living tree.

So you plant. But seed is matched to the planting site's seed zone and to within 500 feet of its elevation, and there isn't enough of it.

Between 2018 and 2024, 1.5 million acres of non-federal conifer forest burned in California, 359,182 of them at high severity, and 22.5 million more trees were killed by insects and disease. Against all of that, plus timber harvest, the state publishes a single figure once a year: **55,978 bushels of cones**, the amount needed to reforest a quarter of the productive conifer forest on its non-federal land.

One number, statewide, annually. Seedshed computes it for one fire, on demand.

## The user

A **Registered Professional Forester** with a post-fire management plan for a non-industrial private or tribal landowner. This is CAL FIRE sales priority 1, and this ownership class is first in CAL FIRE's preference order (federal is last).

Her forcing function is published and dated: **sugar pine, red fir and white fir must be ordered by 31 October** because they need longer stratification, and the seedling queue commonly fills by mid-summer. Order to planting runs about eighteen months.

Today she works this out by hand over weeks, forest type by forest type, against seed-zone maps and a nursery catalog.

## The walkthrough

She clicks the scar. Seedshed:

1. **Clips the perimeter to State Responsibility Area** — CAL FIRE's jurisdiction is non-federal land, so this is what makes the comparison valid for any California fire.
2. **Reads burn severity** from MTBS.
3. **Buffers inward from every living seed edge** at conifer dispersal distance — *the acres that will never reseed themselves light up, and they are not the whole fire.*
4. Uses **Baker (2023)**, the published estimate least favourable to this conclusion, and says so on screen.
5. **Partitions across the 85 seed zones and 500-foot elevation bands**, species allocated from pre-fire vegetation. The order splits with it. **Provenance Lock** refuses to merge cells.
6. **Converts step by visible step in CAL FIRE's own formula** — trees, pounds, bushels, dollars at the published seed price — each factor citing the agency table it came from, and **three factors shown in amber because CAL FIRE's method requires them and does not publish them**.
7. Lands beside the state's own **55,978**.

## Demo climax

**One peak: the seed-limited interior lighting up** — the moment the fire stops being one thing. The partition resolves quietly behind it. The bushel and dollar figures land last. Under 90 seconds.

Do not build three peaks. Peak-end rule: one designed peak, and the video ends on it.

## Restraint mechanism

**Provenance Lock** — refuses to merge seed zone × elevation cells by default. Named, visible, and on screen. It is a refusal, not a warning.

## What's next (goes in the writeup)

Publish the three nursery factors and this becomes reproducible for every state.

## Build order (3 days)

- **Must ship:** SRA clip → severity read → dispersal buffer → zone × elevation partition → conversion chain → one fire, bushels + dollars.
- **Cut first if Friday goes badly:** species breadth. Four of the eleven species in AON Table 2 show the partition working — the three with the 31 October deadline (sugar pine, red fir, white fir) plus one common conifer (ponderosa or Douglas-fir).
- **Already cut, deliberately:** the climate-distance tolerance model. CAST already does climate-adapted matching; cite it, don't rebuild it.

Freeze the stack day 1. Buffer and partition day 2. Record Friday. Submit Saturday morning.
