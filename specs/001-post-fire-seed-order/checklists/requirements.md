# Specification Quality Checklist: Post-Fire Seed Order

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-18
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation Notes

**Iteration 1 — issues found and corrected before this file was finalised:**

1. *Named data sources appeared inside functional requirements.* MTBS, LANDFIRE, WFIGS and the
   specific agency layer names were removed from FR text and expressed as outcomes instead
   ("the vegetation present before the fire", "the state's published seed zone system"). Source
   names live in `docs/04-DATA-SOURCES.md`, which is implementation input, not specification.

2. *Two success criteria were implementation-shaped.* An earlier draft measured processing time
   per pipeline stage and file-format fidelity. Replaced with SC-001 (user-facing time to a
   complete order) and SC-006 (time for a first-time viewer to read the result).

3. *Planting density was initially an unflagged constant.* It is not a verified published
   figure, so under Constitution Principle IV it cannot be presented as one. Moved into
   Assumptions and given the same disclosed-assumption treatment as the agency's three
   unpublished nursery factors.

**Clarifications**: none outstanding. Four candidate ambiguities were resolved by documented
assumption rather than by asking, because each had a defensible default derivable from the
constitution or the brief: deliverable form (interactive, per SC-006), fire selection method,
planting density treatment, and species-allocation mapping.

**Constitution alignment** (`.specify/memory/constitution.md` v1.0.0):

| Principle | Covered by |
|---|---|
| I. Source-Traceable Claims | FR-011, FR-022, FR-023, SC-002 |
| II. Unit Integrity | FR-015 through FR-018, and the conflicting-table edge case |
| III. Deterministic Arithmetic | FR-014, SC-008 |
| IV. Disclose the Gap, Never Fill It | FR-005, FR-012, FR-013, FR-025, SC-003, and the density/mapping assumptions |
| V. Scope Follows Verifiability | FR-003, FR-019, SC-004, SC-005 |

**Status**: All items pass. Ready for `/speckit-plan`.
