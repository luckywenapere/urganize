# Slim phone rollout header (2026-10-31, #929)

Founder approved the staff designer's mock on 2026-10-31 ("I prefer the second way of showing it, minimalist").

What changed on a phone (below lg; the computer is unchanged):

- `RolloutPhoneHeader` is one sticky line (`SlimTitle`: back, title, `done/total`, Delivered mark, search on the timeline, menu icon), held under the top bar with the same `topBarBottom` measurement the folded header used. Under it, a line that scrolls away: artist name, `rolloutMetaLine`, and the List / Timeline switch.
- Gone: the 55px cover tile beside the title, the artist eyebrow and face, the progress bar, the scroll-triggered compact bar (its IntersectionObserver) and the separate folded header. Folded (#898) now just hides the second line and `below`, and shows the Menu pill dock (#926).
- The Brief card (`BriefEntryCard`) shows whenever the main view shows, planned or not. It takes a `cover` slot: on the phone that is `RolloutCoverTile` at size 44, so the cover is still edited on the cover itself. The designer's mock assumed a "Cover art" row in the menu; there is none since #847 (Oct 29), so the tile moved to the Brief card instead. With the brief flag off, the card renders the tile alone.
- Add idea, Select activities and Group by (Phase / Status) moved into the phone Rollout menu sheet (`tools` slot under the list, at the thumb end). Group by and Select show only when the Activities list is the body (`listShowing`).
- The search box and Filter above the Activities list are hidden below lg (`data-activities-phone-search-hidden`). The timeline keeps its header search icon.

Guards: `lib/rollout-phone-declutter-guard.test.ts`, `lib/just-planned-cuts-guard.test.ts`.
