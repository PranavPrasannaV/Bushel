<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0
Bump rationale: Initial ratification. No prior version existed; template placeholders
replaced with concrete governance for the Bushel project.

Principles defined (all new):
  I.   Source-Traceable Claims (NON-NEGOTIABLE)
  II.  Unit Integrity (NON-NEGOTIABLE)
  III. Deterministic Arithmetic
  IV.  Disclose the Gap, Never Fill It
  V.   Scope Follows Verifiability

Sections added:
  - Data and Verification Standards (replaces [SECTION_2_NAME])
  - Delivery Discipline (replaces [SECTION_3_NAME])
  - Governance

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — "Constitution Check" gate at line 39 is a
     generic placeholder that reads gates from this file; the five principles below are
     directly usable as gates. No edit required.
  ✅ .specify/templates/spec-template.md — no constitution references; no edit required.
  ✅ .specify/templates/tasks-template.md — no constitution references; no edit required.
  ✅ README.md — "Ground rules" section already aligns with Principles I, II and IV.
  ✅ docs/03-DO-NOT-CLAIM.md — promoted to binding status by Principle I.

Deferred TODOs: none.
-->

# Bushel Constitution

Bushel reimplements CAL FIRE's published post-fire reforestation seed calculation at
per-fire resolution. Its entire value rests on being checkable against a state agency's
own published total. Every principle below exists to protect that property.

During idea selection, six separate factual claims were killed after surviving multiple
rounds of review — each because nobody had asked what a number was actually counting.
This constitution encodes the discipline that caught them.

## Core Principles

### I. Source-Traceable Claims (NON-NEGOTIABLE)

Every number, figure, statistic and factual assertion that reaches a user — in the UI,
the README, the Devpost writeup, the video script, or code comments quoted in any of
those — MUST be traceable to a primary source recorded in `docs/02-FACTS.md`.

`docs/03-DO-NOT-CLAIM.md` is binding. A sentence matching an entry in that file is
defective and MUST NOT ship, regardless of how reasonable it sounds.

Before any figure is displayed, four questions MUST be answerable: what it counts, over
what population, in what jurisdiction, and for what year. Secondary sources MUST NOT be
cited where a primary source exists; where a primary source contradicts itself, its
methodology section governs and the contradiction MUST be disclosed rather than hidden.

**Rationale:** Plausibility is not evidence. Every killed claim in this project looked
obviously true before it was checked, and several were introduced while correcting a
previous error.

### II. Unit Integrity (NON-NEGOTIABLE)

Quantities MUST carry their unit through every transformation, and unit conversions MUST
be explicit, named, and individually tested. Four conversions in this domain are known
hazards and MUST be handled as distinct quantities that are never substituted for one
another:

- A bushel is 8 dry gallons of **cones**, not seed.
- "Average seeds per pound" is not "average **seedlings** per pound"; they differ by
  germination and nursery survival.
- CAL FIRE's AON survival factor is calibrated to a **two-year seedling**; LAMRC sells
  **one-year plugs**. Seedling figures MUST be labelled two-year-equivalent, and pricing
  MUST use the seed list rather than the seedling list.
- **Nursery** survival is not **field** survival after outplanting.

Reported output MUST be denominated in bushels and pounds — the units the benchmark uses.

**Rationale:** Three of the six killed claims were unit errors, one of them an
order-of-magnitude error inherited from a secondary source that had mislabelled cones as
seed.

### III. Deterministic Arithmetic

All quantities, conversions, currency and dates MUST be produced by deterministic,
unit-tested code. A language model MUST NOT appear anywhere in the numeric path.

The conversion chain MUST be visible to the user: every factor displayed alongside the
agency table it came from, so that the output reads as a calculation rather than an
assertion.

**Rationale:** The output is checkable against CAL FIRE's published total. That check is
meaningless if the arithmetic is non-reproducible, and a visible chain converts a fragile
number into a demonstrable one.

### IV. Disclose the Gap, Never Fill It

Where required data is not public, Bushel MUST show the gap explicitly rather than
estimate past it, relabel it, or quietly omit the step.

CAL FIRE's published method depends on three factors — seeds per pot, nursery survival
rate, and probability of a tree in nursery — drawn from internal unpublished datasets.
These MUST be surfaced as named, user-adjustable assumptions carrying explicit defaults
and labelled as not published by CAL FIRE. The formula MUST be shown on screen.

Seed availability and purchasable inventory data do not exist publicly anywhere. Bushel
is demand-side only; no feature may depend on a supply or inventory dataset.

Where the underlying science is contested, the published estimate least favourable to
Bushel's conclusion MUST be used as the default, and named on screen.

**Rationale:** A disclosed gap in an agency's method is a finding. A silently filled one
is a fabrication, and it is the failure mode this domain invites most strongly.

### V. Scope Follows Verifiability

Bushel's scope is California, because California is the only jurisdiction publishing a
benchmark in Bushel's own output unit, together with the conversion table, the price
list, and the seed-zone system the calculation requires.

Scope MUST NOT be widened for breadth alone. Any proposed expansion MUST first identify
the published ground truth the expanded scope would be checked against; absent that, the
expansion is rejected. Generalisation belongs in stated future work, not in claims about
what the software currently does.

**Rationale:** Reach is an impact argument. Being checkable is the project's only
durable asset, and it is jurisdiction-shaped.

## Data and Verification Standards

All data sources MUST be public, keyless and free of registration or login. Endpoints MUST
be recorded in `docs/04-DATA-SOURCES.md` with the date they were last verified live.

The burn perimeter MUST be clipped to State Responsibility Area before any computation, as
CAL FIRE's jurisdiction defines the benchmark's scope and the clip is what makes any
California fire comparable.

Burn severity MUST come from MTBS, the same source the AON uses, so that Bushel's
severity read stands on the same footing as the benchmark.

Output MUST be validated against CAL FIRE's published statewide total of 55,978 bushels,
with AON Table 1 (1,507,830 acres burned on non-federal conifer forestland 2018–2024,
359,182 at high severity) serving as an upstream check on the clip and severity stages
before the dispersal buffer runs.

CAL FIRE PDFs are not retrievable by ordinary fetch tooling; they MUST be downloaded via
`curl` and extracted with `pypdf`. Extracted text is retained in `reference/` so any figure
can be re-checked without re-downloading.

## Delivery Discipline

The scoring rubric in `docs/01-EVENT.md` has no Impact criterion and no Feasibility
criterion. Work that serves market size, business model, adoption or reach is out of scope
and MUST NOT consume build or video time.

Completion is scored. A narrower finished artifact beats a broader unfinished one, so the
build order and its named cut in `docs/00-BRIEF.md` are binding: the dispersal buffer and
the seed-zone × elevation partition ship before anything else, and species breadth is cut
first if time runs short.

The demonstration MUST have exactly one designed peak — the seed-limited interior lighting
up. Other stages resolve behind it. Controls a viewer cannot operate MUST NOT be built for
demonstration purposes.

Competitor counts, gallery statistics and any figure that decays before the submission
deadline are internal reasoning only and MUST NOT appear in shipped artifacts.

## Governance

This constitution supersedes other practices and conventions within this repository. Where
a spec, plan, task or implementation conflicts with it, this document wins and the
conflicting artifact MUST be amended.

Every plan MUST pass a Constitution Check against Principles I–V before Phase 0 research
and again after Phase 1 design. Violations MUST be recorded in the plan's Complexity
Tracking table with a justification and the rejected simpler alternative; an unjustified
violation blocks progression.

Amendments MUST be proposed as an edit to this file accompanied by an updated Sync Impact
Report, and MUST state the version bump and its rationale. Versioning is semantic: MAJOR
for removal or backward-incompatible redefinition of a principle, MINOR for a new
principle or materially expanded guidance, PATCH for clarification and wording.

Principles I and II are marked NON-NEGOTIABLE and MUST NOT be waived by the Complexity
Tracking exception path. A claim or unit defect is a correctness bug, not a trade-off.

Runtime development guidance lives in `docs/00-BRIEF.md` (product), `docs/05-METHOD.md`
(computation) and `docs/04-DATA-SOURCES.md` (data). `docs/02-FACTS.md` and
`docs/03-DO-NOT-CLAIM.md` are the compliance references for Principle I.

**Version**: 1.0.0 | **Ratified**: 2026-09-18 | **Last Amended**: 2026-09-18
