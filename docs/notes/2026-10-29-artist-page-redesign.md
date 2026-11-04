# Artist page redesign (2026-10-29, v1.210.0, no flag, #866)

Founder said the artist page was "too chaotic and rough on the eyes even misleading". Mock approved the same day after three rounds: `docs/mocks/artist-page/mock.html`.

## What the page is now

- **Header**: photo (80px, a small neutral camera chip via `ProfilePhotoPicker quietBadge`), name, two status chips (the lit one is what is happening: rolling out X, X is out, making X), then **New record** (primary, first, founder call) and **Plan a rollout**.
- **Up next**: one card from `artistUpNext` in `lib/artist-overview.ts` (tested). Order: nearest planned rollout (countdown, tasks due this week, late), then a release just out that still has open tasks, then the record being made (finish it, plan it once every song is done, or add the first song), else start a record.
- **Music**: one line with three stops. In the making = records (`RecordRows`). Rolling out = planned plus just-out rollouts, with task progress. Out now = past rollouts plus imported catalogue rows (`ArtistCatalogueCard` now draws rows only and reports its count). The lit dot is where the artist is.
- **Posting plan**: removed from the artist page 2026-10-29 (#873, founder call). The page is one column again (`max-w-3xl`).

## Removed

- **What UrgAns remembers** card (`ArtistFactsCard`, `lib/artist-facts-client.ts`) is gone from the page. The facts, their API and UrgAns's use of them are untouched.
- **Social numbers** were mocked and dropped: Instagram and TikTok both need outside app approvals (Meta, TikTok). Do not re-add without the founder.

## Traps

- Up next and the progress bars read `useTaskStore`, which `loadCommandCenter` fills. A team member limited to some rollouts only sees their tasks, so counts are what they can see.
- "Out now" can show a rollout and an imported catalogue row for the same song. They are separate records today; fusing them is #865's territory.
- Analytics: `artist_page_action` gained `up_next` and `new_record`. Measure these before and after.

## Amended 2026-11-03 (#1067): the page on a phone

Oyin sent two phone screenshots: the Out now card "Songs out before Urganize?" had its words wrapping one per line beside the button, and the stage labels looked smudged.

- **The stage labels (`Stage`'s h3) carry `font-sans`.** The global `h1, h2, h3, h4` rule in globals.css sets the display serif, which has one weight, so `font-bold` drew faux bold. The mock has them in the sans, like the Up next eyebrow. Any heading element inside a page picks up that rule; say `font-sans` when a heading is a label.
- **The Out now card is a grid**: `[auto 1fr]` on a phone with Bring them in under the words, `[auto 1fr auto]` from sm up. The old `flex-wrap` never wrapped because the text column was `flex-1 min-w-0`, so it shrank to a few words a line instead. The picture is three faded sleeves in the record colours (`RECORD_COVER_COLORS`), not bordered boxes with a disc icon, which read as a toggle switch.
- **Catalogue rows (`ArtistCatalogueCard`) use the same grid.** On a phone the action (Grab a smart link, the link and Copy, Add code) sits under the words, so the title keeps the width; the codes wrap one per line instead of truncating.
- **The cover pencil on touch screens** (`CoverThumbEditor`) is a small chip in the corner of the cover, not a shade over the whole picture. `touch:` is a new Tailwind variant in `apps/web/tailwind.config.ts` (`@media (hover: none)`), for anything that only shows on hover and needs another way on a phone.
- **Tap targets:** the inline links in the empty lines (New record, Plan one) are 44px tall with a negative margin so the line keeps the height of its words; Show all is 40px; the small pills are 40px on a phone.
- Copy: "Bring in what X already released, once." now reads "Bring in what X already released. You only do this once." Not re-mocked: Oyin's "do everything" waiver covered this pass.

Checked in a local browser harness (the real component with stubbed data, not the app) at 390px and 1280px, light and dark, in five states: nothing yet, records in the making, a live rollout, a rollout out with the older-songs slot, and brought-in songs. The captures are in `docs/mocks/artist-page-phone/` (before and after, every state, dark). Not checked on a real phone.

## Amended 2026-11-04: the Up next card

Oyin did not like the 3px brand stripe on the card's left edge. The card is now a real shadcn/ui Card (`components/ui/card.tsx`, see `2026-11-04-shadcn-ui.md`): plain border, soft shadow, no stripe, with the whole card one link or button through a stretched control over it. Two options were rendered; he picked the one that keeps the big serif countdown on the left over a mono badge beside the label.
