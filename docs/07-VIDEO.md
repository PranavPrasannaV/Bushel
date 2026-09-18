# Bushel — demo video script

**Target 4:30, hard cap 5:00.** About 620 spoken words at a calm pace. One peak: the interior
lighting up. Statewide figures come from `web/public/data/reference/validation.json` and
`reference/statewide.json`; every other figure is from the North Complex record at default factors.

Record the site at 1440×900 in a normal browser window. Record the live build in a terminal beside
the app, running `python -m bushel.serve`.

---

## 0:00 — The problem (on screen: a photo-free title card, then the dark map)

> After a bad wildfire, parts of a conifer forest can't come back on their own. The trees that would
> have dropped seed are dead, and most conifer seed lands within about a hundred metres of the tree
> it fell from. So someone has to plant.
>
> Planting starts with a seed order, and the seed order runs on a strict clock. In California, sugar
> pine, red fir and white fir have to be ordered by the 31st of October. From order to planting is
> about eighteen months.
>
> CAL FIRE publishes how much seed the state needs — once a year, for the whole state. That number
> can't tell a forester what one fire needs. That's what Bushel does.

## 0:30 — The peak (on screen: open the site; North Complex loads by itself)

> This is the North Complex fire, 2020: 318,797 acres. Bushel keeps only state-responsibility land,
> because that's CAL FIRE's jurisdiction, and reads how badly each acre burned from the federal
> burn-severity record.
>
> *(pause while the interior rises)*
>
> Now it measures inward from every surviving patch of forest. Everything more than 90 metres from a
> living seed tree lights up. That's the forest that will not come back on its own: 13,507 acres.
> Not the whole fire — about a third of the badly burned ground.
>
> Ninety metres is the published estimate least favourable to our own conclusion. We chose the
> number that hurts us.

## 1:15 — The order (on screen: scroll to the totals, open one order line's trail)

> Then it splits that ground by seed zone and by 500-foot elevation band — because seed is matched to
> where it grew — and works out which species grew there before the fire.
>
> And it prints the order, in the state's own units: 637 bushels of cones, 575 pounds of clean seed,
> $182,072 at CAL FIRE's own seed prices.
>
> Every number shows where it came from. Acres to trees, trees to pounds, pounds to bushels, each
> factor next to the CAL FIRE table it's taken from. Bushels here are bushels of *cones* — not seed.
> The state's own report mixes those up once. We don't.

## 2:00 — The honest gap (on screen: the amber factors; drag "Nursery survival rate")

> Three numbers in CAL FIRE's formula aren't published anywhere. They come from internal nursery
> records. We didn't guess them silently: they're shown in amber, labelled "not published by CAL
> FIRE", and you can change them.
>
> *(drag the slider; the totals change instantly)*
>
> The whole order recalculates in the browser, instantly. If the state published these three
> numbers, this calculation would be fully reproducible — for every state.

## 2:40 — Is it right? (on screen: the validation panel)

> Is it right? Two checks, both against published figures.
>
> First, like for like. A peer-reviewed study measured how much of a high-severity burn is more than
> 90 metres from live seed: 21.9 percent. We compute the same thing pixel by pixel, across
> {{N_FIRES}} fires: {{POOLED_PCT}}.
>
> Second, CAL FIRE's own total. We built every fire in the state's own assessment window —
> {{N_FIRES}} fires — and put our total beside theirs, with the reasons they differ: the state's
> figure also covers insect die-off and timber harvest, and it uses an internal boundary it doesn't
> publish.

## 3:20 — Live (on screen: terminal + the "Find a fire" panel, Live badge)

> The site ships with every fire from 2018 to 2023 already built. But Bushel isn't a recording.
> Pick one — *(type "Monument", choose "Rebuild live")* — and it fetches that fire's perimeter,
> jurisdiction, seed zones, burn severity and elevation from the agency services right now, and runs
> the same pipeline.
>
> *(the build finishes; the live copy opens, interior lit; switch to the pre-built one)*
>
> Same acres, same interior, same order — identical, field for field. Pre-built means built by this
> pipeline, not made up.

## 4:00 — Close (on screen: zoom out to California, every interior lit)

> Every other tool tells you where a fire burned. Bushel tells you what to order to bring the forest
> back — which species, from which seed zone, how many bushels, by when — and shows you its working.
>
> Bushel. Built for NextStep Hacks 2026, Earth Forward.

---

## Fallbacks

- **Live build slow or an agency service down:** cut to a pre-recorded take of the same build. Say
  "recorded earlier today" if it is used.
- **Over time:** cut the "Bushels are cones" sentence at 1:15 first, then the second half of 2:00.
- **Numbers:** read every figure from the screen, not from this script, if the build has been re-run.
