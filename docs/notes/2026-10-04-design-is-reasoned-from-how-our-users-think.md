# Design is reasoned from how our users think (2026-10-04)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder rule, for everything and not only icons: every design choice (icons, menu order, copy, placement, motion, defaults, empty states, the billing wall) is justified by how Urganize's users think and behave, and the reasoning is stated. The audience is Gen Z and very critical millennials, mostly on a phone, who spot anything generic at once.

- **No click data exists** (PostHog is not capturing usage), so an ordering is a reasoned prediction. Say so, and name what to measure.
- **Distinct beats generic.** The areas carry a piece of the music trade: a studio (Home), a record (Catalogue), a patch cable (Relationships), a stage light (Opportunities), headphones (Audience), a stage microphone (Shows), a diamond holding equaliser bars (UrgAns), a stack of records (Credits). Legibility still wins over character for controls like close, check and chevrons.
- **Motion only when it tells the truth.** The phone's bottom bar folds only on a real scroll of a page that overflows (`lib/bar-collapse.ts`): never on a short page, never on a rubber-band stretch, never in UrgAns.
- **One search.** The top bar's search is the only one. With a rollout open it finds that rollout's activities first, then rollouts and pages. The phone's rollout menu is one labelled button, and its list is drawn upside down (`orderForThumb`) so the most-used rows sit nearest the thumb.
- **UrgAns opens ready.** The full chat page focuses its box on arrival (the Urganize app allows it; a mobile browser may still refuse a keyboard that no tap asked for). The chat box shows no credits line: the top-bar chip and the low-credit banner carry the balance.
- **Font:** still Space Grotesk, Fraunces and Space Mono. Options are in `docs/design/font-options.html`, waiting on the founder's pick.
