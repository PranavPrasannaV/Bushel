# Feature Specification: Post-Fire Seed Order

**Feature Branch**: `001-post-fire-seed-order`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "use your notes and full ideation research for this"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get the seed order for one fire (Priority: P1)

A Registered Professional Forester holds a post-fire management plan for a non-industrial
private landowner and an ordering deadline she cannot move: the state's seed bank requires
sugar pine, red fir and white fir orders by 31 October, and its seedling queue commonly
fills by mid-summer. Order to planting runs roughly eighteen months, so the quantity has to
be right the first time.

Today she derives it by hand over several weeks — reading the burn against seed-zone maps
and elevation, forest type by forest type, then converting to a quantity she can actually
order.

She selects the fire. Seedshed returns the order: how much seed, of which species, broken
out by seed zone and elevation band, expressed in the units the state's seed bank uses, with
every conversion factor shown next to the published table it came from. Factors the state's
own method requires but has never published are shown as adjustable assumptions, visibly
marked as unpublished.

**Why this priority**: This is the deliverable. Without it there is no product, and it is
the only story that on its own replaces weeks of manual work.

**Independent Test**: Select any California fire and receive a complete, itemised seed order
with per-factor sourcing. Delivers the forester's entire task even before the interior
refinement in Story 2 exists.

**Acceptance Scenarios**:

1. **Given** a California fire with a known perimeter, **When** the forester selects it,
   **Then** an itemised order is produced showing quantity, species, seed zone and elevation
   band, in the state's own units.
2. **Given** a produced order, **When** the forester inspects any quantity on it, **Then**
   every factor used to derive that quantity is visible with the published source it came
   from.
3. **Given** a factor the state does not publish, **When** it appears in a calculation,
   **Then** it is visually distinguished from published factors, labelled as unpublished,
   and adjustable by the forester.
4. **Given** a burn that crosses federal and non-federal land, **When** the order is
   computed, **Then** only the non-federal portion is included, and the excluded area is
   stated.
5. **Given** a burn spanning more than one seed zone or elevation band, **When** the order
   is produced, **Then** it is issued as separate lines per cell and the system does not
   combine them into a single quantity.

---

### User Story 2 - See which acres will not come back on their own (Priority: P2)

Not all of a burn needs planting. Where living trees remain close enough to seed into the
gap, the forest reseeds itself. Where the burn is wide enough that no surviving tree is
within seeding distance, it does not.

The forester needs to see that division before committing budget, because ordering for the
whole burn overstates the requirement — often severely — and ordering for none of it loses
a planting cycle.

**Why this priority**: It converts a defensible-in-principle number into a defensible one.
It is also the moment the fire visibly stops being a single object, which is what makes the
result legible at a glance.

**Independent Test**: Display any fire and confirm the acres beyond natural seeding distance
are distinguishable from those within it, and that the distinguished area is smaller than
the whole burn.

**Acceptance Scenarios**:

1. **Given** a burn perimeter with surviving forest along its edges, **When** the interior is
   computed, **Then** the acres beyond natural seeding distance are shown as a distinct area
   smaller than the full burn.
2. **Given** the science on natural regeneration is actively disputed, **When** the interior
   is computed, **Then** the published estimate least favourable to the conclusion that
   planting is needed is used by default, and that choice is stated on screen.
3. **Given** a computed interior, **When** the order from Story 1 is produced, **Then** the
   order covers only that interior and not the full burn.

---

### User Story 3 - Check the result against the state's own total (Priority: P3)

The state publishes one seed-need figure a year for its whole jurisdiction. A forester — or
anyone assessing whether to trust this tool — needs to know whether the same method, applied
fire by fire, reproduces that published total.

**Why this priority**: It is what separates a plausible estimate from a verified one. It is
not required to produce a usable order, so it follows Stories 1 and 2.

**Independent Test**: Run the calculation across the same period and jurisdiction the state's
published assessment covers, and compare the aggregate to the published figure.

**Acceptance Scenarios**:

1. **Given** the state's published assessment covers a defined period and jurisdiction,
   **When** the same period is aggregated, **Then** the result is presented alongside the
   published total with the difference stated.
2. **Given** burned and high-severity acreage are published for that period, **When**
   jurisdiction filtering and severity reading are applied, **Then** those intermediate
   totals are reported for comparison before any further calculation runs.
3. **Given** a discrepancy exists between the computed and published totals, **When** it is
   displayed, **Then** the unpublished assumptions most likely to account for it are
   identified.

---

### User Story 4 - Take the order away (Priority: P4)

The forester has to act on the result outside the tool — attach it to a management plan,
submit it against the state's ordering process, or share it with the landowner.

**Why this priority**: Real but not demonstrative. Everything above delivers value on screen;
this makes it portable.

**Independent Test**: Produce an order, export it, and confirm the exported artifact carries
the same quantities, cell breakdown, factor sources and unpublished-assumption markings.

**Acceptance Scenarios**:

1. **Given** a completed order, **When** it is exported, **Then** the export preserves the
   per-cell breakdown, every factor's source, and the marking on unpublished assumptions.
2. **Given** an exported order, **When** any assumption was adjusted from its default,
   **Then** the adjusted value and the default are both recorded.

---

### Edge Cases

- **A burn entirely on federal land.** The jurisdiction filter removes everything. The system
  must report a zero-area result and explain why, not present an empty order as a computed one.
- **A burn with no conifer forest before it burned.** No species can be allocated; the system
  must state that rather than emit a zero-quantity order.
- **A burn small enough that no interior exists.** Every acre is within natural seeding
  distance. The correct answer is that no planting order is required, and it must be stated
  as a finding rather than an error.
- **A species present in the burn but absent from the published conversion tables.** The
  state's own assessment substitutes a stated fallback; the system must apply the same
  fallback and mark every line that relied on it.
- **A fire still burning, with a perimeter that will change.** The result must be stamped
  with the perimeter's date and flagged as provisional.
- **A cell straddling an elevation band boundary.** The system must not resolve this by
  merging bands; it must split the area.
- **An assumption adjusted to an implausible value.** Bounds must be enforced and the
  resulting quantity must remain traceable to the value used.
- **Published source tables that disagree with each other.** Where the authoritative document
  contradicts itself, the method section governs and the contradiction must be surfaced to the
  user, not silently resolved.

## Requirements *(mandatory)*

### Functional Requirements

**Scope and jurisdiction**

- **FR-001**: System MUST restrict every calculation to the non-federal land within a burn
  perimeter, matching the jurisdiction of the published assessment it is checked against.
- **FR-002**: System MUST report the acreage excluded by that restriction alongside the
  acreage retained.
- **FR-003**: System MUST operate only within California, and MUST NOT present results for
  jurisdictions where no published benchmark exists to check them against.

**Determining what needs planting**

- **FR-004**: System MUST identify, within the retained area, the acres that lie beyond
  natural conifer seeding distance from surviving forest, and MUST base the order on those
  acres only.
- **FR-005**: System MUST derive the seed-limited area by computing distance from surviving
  seed source, using the distance threshold from the published study least favourable to the
  conclusion that planting is required, and MUST state that threshold and its source in the
  interface. System MUST NOT additionally scale the result by that study's reported area
  fraction; the fraction is a cross-check on the computed result, not a multiplier.
- **FR-006**: System MUST NOT offer a control that changes the headline quantity by switching
  between competing scientific estimates during a demonstration; alternative estimates MAY be
  inspectable but MUST NOT be the primary result.

**Partitioning**

- **FR-007**: System MUST divide the planting area into cells defined by the state's published
  seed zone system intersected with 500-foot elevation bands.
- **FR-008**: System MUST allocate species to each cell from the vegetation present before the
  fire, and MUST disclose the mapping used.
- **FR-009**: System MUST NOT merge cells, aggregate across seed zones, or combine elevation
  bands in order to simplify the result. Refusal to merge MUST be visible to the user as a
  deliberate behaviour rather than a limitation.

**Calculation and sourcing**

- **FR-010**: System MUST reproduce the published calculation method of the state seed bank
  rather than substituting its own.
- **FR-011**: System MUST display every conversion factor used, alongside an identification of
  the published table it was taken from.
- **FR-012**: System MUST visually distinguish factors that the published method requires but
  that the publishing agency has never released, MUST label them as unpublished, MUST carry an
  explicit default for each, and MUST allow the user to adjust them within bounded ranges.
- **FR-013**: System MUST recompute and redisplay dependent quantities when any assumption is
  adjusted.
- **FR-014**: System MUST derive all quantities, conversions and currency values by
  deterministic calculation, with no generative or probabilistic component in the numeric path.

**Units**

- **FR-015**: System MUST express the primary order in the volume and weight units used by the
  state seed bank, and MUST NOT report the volume unit as a measure of seed when the published
  definition measures cones.
- **FR-016**: System MUST keep seed counts and seedling counts distinct and MUST NOT substitute
  one for the other at any point in the chain.
- **FR-017**: System MUST label any seedling-denominated figure with the seedling age the
  underlying survival factor assumes.
- **FR-018**: System MUST derive monetary values from the published price list denominated in
  the same unit as the order, and MUST NOT price the order using a list denominated in a
  different unit.

**Verification**

- **FR-019**: System MUST be able to aggregate results across the period and jurisdiction
  covered by the state's published assessment and present the comparison with the published
  total.
- **FR-020**: System MUST report intermediate totals for retained acreage and severely burned
  acreage so that early stages can be checked independently of later ones.
- **FR-021**: System MUST apply the same collection-priority thresholds the published
  assessment uses when ranking cells.

**Claim discipline**

- **FR-022**: System MUST NOT display any figure, statistic or factual assertion that is not
  traceable to a recorded primary source.
- **FR-023**: System MUST surface, rather than silently resolve, contradictions between or
  within its authoritative published sources.
- **FR-024**: System MUST stamp every result with the date of the perimeter data it used, and
  MUST mark results derived from a still-changing perimeter as provisional.

**Exclusions**

- **FR-025**: System MUST NOT include any feature that depends on seed availability, nursery
  inventory or purchasable supply data, none of which is publicly obtainable. The product
  addresses demand only.
- **FR-026**: System MUST NOT require user accounts, authentication or the storage of personal
  data to produce a result.

**Output**

- **FR-027**: Users MUST be able to export a completed order preserving cell breakdown, factor
  sources, unpublished-assumption markings, and any adjusted values together with their
  defaults.

### Key Entities

- **Burn**: A single fire, identified by name and date, with a perimeter and a severity
  reading. Carries a provisional flag when its perimeter may still change.
- **Retained area**: The portion of a burn inside the jurisdiction the benchmark covers.
- **Planting area**: The portion of the retained area beyond natural seeding distance from
  surviving forest — the acres that will not regenerate unaided.
- **Cell**: The atomic unit of the order. One seed zone intersected with one 500-foot
  elevation band. Never merged with another cell.
- **Species allocation**: The conifer species attributed to a cell, derived from pre-fire
  vegetation, with the mapping disclosed.
- **Conversion factor**: A single named multiplier or divisor in the calculation chain,
  carrying its source and a published/unpublished status.
- **Assumption**: An unpublished conversion factor, carrying a default, bounds, an adjusted
  value where set, and a label identifying the agency that does not publish it.
- **Order line**: Quantity of one species for one cell, in the seed bank's units, with a
  priority rank and a monetary value.
- **Benchmark**: The state's published statewide total, its period, its jurisdiction, and the
  intermediate acreage figures used to check earlier stages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A forester obtains a complete, itemised seed order for a selected fire in under
  two minutes, replacing a manual process that currently takes weeks.
- **SC-002**: Every quantity displayed can be traced by the user to its constituent factors and
  their published sources without leaving the result view.
- **SC-003**: 100% of factors that the publishing agency does not release are visually marked
  as unpublished and are adjustable; none is presented as though it were published.
- **SC-004**: Aggregating the tool's per-fire results across the benchmark's period and
  jurisdiction produces a total that can be stated as a percentage difference from the state's
  published figure, with the unpublished assumptions responsible for the gap identified.
- **SC-005**: Retained acreage and severely burned acreage computed for the benchmark period
  fall within 10% of the corresponding published figures, verifying the early stages
  independently of the conversion chain.
- **SC-006**: A first-time viewer can identify which acres will not regenerate naturally, and
  distinguish them from the rest of the burn, within 10 seconds of the result appearing.
- **SC-007**: Orders spanning multiple seed zones or elevation bands are always issued as
  separate lines; the system produces zero merged cells across a test set covering at least
  five multi-zone fires.
- **SC-008**: An order produced for any fire in the benchmark jurisdiction is reproducible —
  the same inputs and assumptions yield identical quantities on every run.
- **SC-009**: Every edge case enumerated in this specification produces a stated finding rather
  than an error, a blank result, or a silently zeroed quantity.

## Assumptions

- **The deliverable is an interactive application** a user operates directly, because the
  primary result is spatial and must be legible at a glance. A batch report generator would not
  satisfy SC-006.
- **Fire selection is from a curated list of California fires** within the window where burn
  severity data exists and the benchmark applies. Severity mapping runs one to two years behind
  the fire season, so currently burning fires are out of scope for this version; ordering seed
  years after a fire is the normal case, so this costs nothing operationally. Users do not draw
  or upload their own perimeters.
- **Planting density is published, not assumed.** Phase 0 research located the figure in the
  agency's own method: a stocking requirement applied uniformly, derived from the state's forest
  practice range, and explicitly framed by the agency as a maximum-stocking worst case. It is
  therefore a cited factor rather than a disclosed assumption — but the worst-case framing MUST
  be stated, or an upper bound is silently presented as a point estimate. It remains adjustable
  across the published range.
- **Species allocation uses the same vegetation source the benchmark was computed from**, which
  carries dominant tree species directly rather than requiring an interpretive step from a
  vegetation type name. Where allocation within a cell still requires judgement, that judgement
  is stated in the interface rather than presented as the agency's.
- **Species coverage targets the fifteen conifer species of interest** named in the published
  assessment. Only eleven have published cones-to-seed conversion factors; the remaining four
  use the agency's own stated fallback, and every line relying on it is marked. A reduced set
  of four species is acceptable for an initial release provided the fallback behaviour and the
  cell partition are unaffected.
- **No user accounts, no persistence between sessions, and no personal data.** Exports are the
  only durable output.
- **Results are advisory.** The tool produces an order for a professional to review and submit;
  it does not place orders, integrate with any ordering system, or represent an agency
  commitment.
- **Underlying spatial and published-table data are treated as fixed inputs for this feature.**
  Their acquisition, refresh cadence and storage are implementation concerns, not requirements
  of this specification.
- **The verification story (User Story 3) depends on the benchmark period being fully covered
  by available perimeter and severity records.** Where coverage is partial, the comparison is
  reported as partial rather than suppressed.
