# Seedshed

For any burned place in California, Seedshed produces the order that would actually bring the forest back — which acres will never reseed themselves, which species, how many cone bushels, by seed zone and elevation band.

California publishes that figure once a year for the whole state: **55,978 bushels of cones**. Seedshed computes it for one fire, on demand.

Built for [NextStep Hacks 2026](https://nextstep2026.devpost.com) — theme *Earth Forward*.

---

## Read before writing any code or copy

| Doc | What it's for |
|---|---|
| [`docs/00-BRIEF.md`](docs/00-BRIEF.md) | The product. User, walkthrough, demo climax, build order. |
| [`docs/01-EVENT.md`](docs/01-EVENT.md) | Rubric verbatim, deadline, submission requirements. **No Impact or Feasibility criterion** — don't build for them. |
| [`docs/02-FACTS.md`](docs/02-FACTS.md) | Every verified claim with its source. If it isn't here, it isn't verified. |
| [`docs/03-DO-NOT-CLAIM.md`](docs/03-DO-NOT-CLAIM.md) | **Binding.** Six claims died in review; this is the list. |
| [`docs/04-DATA-SOURCES.md`](docs/04-DATA-SOURCES.md) | Endpoints, all verified live and keyless on 2026-09-18. |
| [`docs/05-METHOD.md`](docs/05-METHOD.md) | CAL FIRE's formula and the five-stage pipeline. |

## The pipeline

```
burn perimeter → clip to State Responsibility Area → read MTBS burn severity
→ buffer inward from living seed edges → partition across 85 seed zones × 500-ft
elevation bands → convert to trees, pounds, bushels, dollars in CAL FIRE's own factors
→ compare against the state's 55,978
```

## The thing that makes it worth building

CAL FIRE publishes its method but not three of the numbers the method requires:

> *Average seedlings produced per pound = (average seed per pound / average seed per pot) × percent survival rate in nursery × average probability of a tree in nursery*

All three right-hand factors come from internal, unpublished LAMRC nursery datasets. **Seedshed shows them in amber, with defaults, labelled as unpublished.** Publish those three and this becomes reproducible for every state.

## Data

| Path | Source |
|---|---|
| `data/table2_cones_to_seed.csv` | AON 2025 Table 2 — 11 species, cones/bushel → lbs clean seed |
| `data/seed_prices.csv` | Terms of Sale Feb 2026 — 18 species, $/lb and seeds/lb |
| `data/aon_disturbance_table1.csv` | AON 2025 Table 1 — acres burned and high-severity, 2018–2024 |
| `reference/*.pdf` | The two CAL FIRE primary sources, downloaded |

## Ground rules

1. **Check what a number counts** — units, population, jurisdiction, year — before it goes on screen. Six claims died to that question during selection, and every one looked obviously true first.
2. **Bushels are cones.** Seeds per pound is not seedlings per pound. Nursery survival is not field survival. The AON's two-year seedling is not LAMRC's one-year plug.
3. **Demand side only.** No seed-availability screen — that data isn't public anywhere.
4. **One peak.** The seed-limited interior lighting up. Everything else resolves behind it.
