# The computation

Seedshed reimplements CAL FIRE's published method at per-fire resolution. Every factor is either agency-published or flagged amber as an unpublished agency factor.

---

## CAL FIRE's formula, verbatim from the AON

> *Average seedlings produced per pound = (average seed per pound / average seed per pot) × percent survival rate in nursery × average probability of a tree in nursery*

> *Number of pounds needed to collect = (number of trees in reforestation acres / average seedlings per pound)*

> *Number of bushels needed = (number of pounds needed to collect / average pounds of clean seed per bushel)*

The AON sources the three right-hand factors of the first line from *"Historical LAMRC nursery datasets"*:

- **i. number of seeds per pot** — determined based on the germination calculations
- **ii. percent survival in nursery** — seed that germinated and grew to a **two-year seedling**
- **iii. average probability of a tree in nursery** — seedlings that were thinned and were able to be transplanted

**None of the three is published.** Show them in amber, with defaults, adjustable, labelled *not published by CAL FIRE*.

---

## The pipeline

```
fire perimeter (WFIGS active, or FRAP historic polygon)
  │
  ├─1─ CLIP to State Responsibility Area ──────────► non-federal acres only
  │       (why: CAL FIRE's jurisdiction = the AON's scope)
  │
  ├─2─ READ burn severity (MTBS) ──────────────────► high-severity acres
  │
  ├─3─ BUFFER inward from living seed edges ───────► SEED-LIMITED INTERIOR
  │       Euclidean distance transform inward from high-severity patch edges
  │       threshold 90 m (Baker 2023) — least-favourable published estimate
  │       21.9% is a CROSS-CHECK on the computed fraction, NEVER a multiplier
  │       ** THIS IS THE DEMO PEAK — the interior lights up **
  │
  ├─4─ PARTITION: 85 seed zones × 500-ft elevation bands ──► cells
  │       species allocated per cell from LEMMA 2023.1 pre-fire vegetation
  │       PROVENANCE LOCK: refuses to merge cells
  │
  └─5─ CONVERT per cell, per species, each step citing its source:
          acres  ──► trees            × 200 TPA  [AON §E, max-stocking worst case]
          trees  ──► pounds           ÷ avg seedlings per pound  [3 AMBER FACTORS]
          pounds ──► bushels          ÷ lbs clean seed/bushel     [AON Table 2]
          pounds ──► dollars          × $/lb                      [Terms of Sale]

       ROLL UP ──► compare against CAL FIRE's statewide 55,978 bushels
```

---

## Step 3 — why the buffer is a correctness requirement, not polish

Non-serotinous conifer seed rarely lands much farther than 100 m from a living tree, while high-severity patches run thousands of acres. **Without buffering inward from living seed edges, the tool implicitly orders seed for the entire burn** — most of which will reseed naturally. The buffer is what makes the number defensible.

It is also the strongest image in the product: the moment the fire stops being one thing.

**Compute the interior; do not multiply by a fraction.** Baker (2023) derived 21.9% by running a **90 m fixed-distance inward buffer** from high-severity patch edges across ~56M ha. So the distance transform and the 21.9% are two forms of the *same* correction — applying both double-counts.

Use **90 m as the threshold**, stated on screen as *"Baker (2023), the published estimate least favourable to this conclusion."* Then **21.9% becomes a cross-check**: our computed interior fraction should land near it. That turns a scalar into a validation, and keeps the geospatial work as the actual technical claim.

Gill et al. 2022 (200 m general, 100 m non-serotinous) is the scientific basis for why distance matters and is available as an alternative threshold — but 90 m and 200 m come from different sources and must never be presented as one default.

One number on screen, not a range. No toggle: nobody can operate a control in a video, and a moving headline number reads as uncertainty.

---

## Step 4 — the Technology claim, stated accurately

The partition is **85 seed zones × 500-foot elevation bands**, with species allocated inside cells from pre-fire vegetation.

It is **not** a zone map per species. California uses one grid (Buck 1970) and the federal Bower system is also a single generalized map. Species-specific zone maps exist only in Oregon and Washington. Do not justify the work with that premise — the four chained geospatial operations stand on their own.

---

## Unit discipline

- Report in **bushels and pounds**. Those are CAL FIRE's units and the ones the benchmark is denominated in.
- Price off the **seed** list ($/lb), not the seedling list. The seedling list is one-year plugs; the AON's survival factor is calibrated to two-year seedlings, and crossing them is a silent unit error.
- Label any seedling figure **"two-year-equivalent."**
- A bushel is **8 dry gallons of opened cones**, not seed.

---

## Validation — this is the Q6 story

Roll the per-fire output up across all fires in the AON's window and compare to CAL FIRE's own **55,978 bushels**. You are checkable against a state agency's published total, in its own units, with its own conversion table.

Secondary check: the AON's Table 1 gives 1,507,830 acres burned on non-federal conifer forestland 2018–2024 with **359,182 at high severity** — a validation target for steps 1 and 2 before the buffer ever runs.

Spot-check individual cells against CAL FIRE's Seed Zone and Elevation Lookup App.

---

## Priority index (free, matches the agency)

The AON colour-codes collection priority: **>100 bushels = priority 1 (red), 11–100 = priority 2 (orange), ≤10 = priority 3 (yellow)**. Using the same thresholds makes the output read as a continuation of the state's own document rather than a parallel invention.
