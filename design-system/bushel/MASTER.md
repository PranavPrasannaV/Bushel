# Bushel design contract: "survey sheet"

Bushel is set like a cartographer's sheet, not a SaaS dashboard: warm paper, ink, hairline rules, a
full-bleed map with a title block, and the order set as a requisition slip you could hand to a nursery.
Tokens live in `web/src/styles/tokens.css`; this file is the reasoning they follow.

## Principles

1. **One peak.** The seed-limited interior is the only saturated colour on the page (`sprout`). Nothing
   else glows, pulses or competes with it.
2. **Paper, not panels.** Surfaces are paper tones separated by hairline rules. No card grids, no
   `rounded-2xl shadow-lg`. Radii are 2–4 px; the one shadow is the slip lifting off the map.
3. **Say it like a document.** Serif for names and the headline figure, mono for stamps and ledger
   figures, sans for reading. Labels are small mono capitals with wide tracking.
4. **The map is the page.** On desktop the map is full-bleed under a thin top bar; the fire's name sits
   on it like a quad-sheet title, the key runs along its foot, and the slip floats at its right edge.
5. **The report reads down.** Everything after the order (funnel, assumptions, lines, validation) is a
   long-form report on paper, numbered 01–04, with a sticky contents list in the left margin.

## Layout

| Width | Top bar | Map stage | Slip | Report |
|---|---|---|---|---|
| ≥ 1100 px | wordmark · fire picker · find-a-fire · data mode | full width, `100vh − bar` | floats right, 376 px | margin contents + 46 rem column |
| 761–1099 px | same, search narrower | full width, 72vh | floats right, 336 px | single column |
| ≤ 760 px | wordmark row; picker + search row | 58vh, title overlaid | sheet under the map, overlapping it by 24 px | single column |

## Colour

| Role | Token | Value |
|---|---|---|
| Page | `--paper-100` | `#f5f2ea` |
| Sheet / slip | `--paper-50` | `#fbfaf6` |
| Map canvas | `--map-canvas` | `#ebe6da` with a 48 px survey grid |
| Ink | `--ink-900` | `#161915` |
| Muted text | `--ink-600` | `#52564c` |
| Hairline | `--paper-300` | `#e2dccd` |
| Action / focus | `--forest-700` | `#1f4332` |
| Burn | `--umber-300/600/900` | `#c4ae99` / `#7a5d4a` / `#2f241e` |
| Interior (reserved) | `--sprout-500` | `#16bf84`, edge `#07573b` |
| Unpublished factor (reserved) | `--amber-*` | `#b8741a` on `#fbefd9` |

## Type

- Display: **Instrument Serif** 400 (and italic). Fire name `clamp(44px, 5.2vw, 84px)`, headline
  figure 72 px, section heads 22–30 px.
- Reading: **IBM Plex Sans** 400/500/600, 15 px body, 13 px tables.
- Labels and figures: **IBM Plex Mono** 400/500, 11 px capitals, tracking 0.12em; ledger figures
  tabular.

## Signature moves

- The map title block: fire name in display serif, then a mono stamp line (year · acres · data date)
  over a 1 px ink rule, like a USGS quadrangle title.
- The requisition slip: a punched tag hole, mono header ("Seed requisition"), the 72 px figure, ledger
  rows with dotted leaders, a perforated divider above the action.
- The survey grid under the map: faint 48 px graticule on the canvas, so the empty sheet still reads as
  a map.
- Numbered report sections (`01 —`) with a sticky contents rail.

## Motion

Only two things move: the interior rises once when a fire draws (1.2 s), and the funnel bars grow once.
UI transitions are 150–240 ms on colour and transform. `prefers-reduced-motion` turns all of it off.

## References (Mobbin)

- komoot web route planner, Felt map editor: warm paper map, small floating key.
- Mercury invoice: serif document title, labelled ledger columns.
- Obvious report page: long-form report with a margin contents list and caps eyebrows.
- Transit (iOS): one plain sentence over a single share bar.
