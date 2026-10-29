# Artist page redesign (2026-10-29, v1.210.0, no flag, #866)

Founder said the artist page was "too chaotic and rough on the eyes even misleading". Mock approved the same day after three rounds: `docs/mocks/artist-page/mock.html`.

## What the page is now

- **Header**: photo (80px, a small neutral camera chip via `ProfilePhotoPicker quietBadge`), name, two status chips (the lit one is what is happening: rolling out X, X is out, making X), then **New record** (primary, first, founder call) and **Plan a rollout**.
- **Up next**: one card from `artistUpNext` in `lib/artist-overview.ts` (tested). Order: nearest planned rollout (countdown, tasks due this week, late), then a release just out that still has open tasks, then the record being made (finish it, plan it once every song is done, or add the first song), else start a record.
- **Music**: one line with three stops. In the making = records (`RecordRows`). Rolling out = planned plus just-out rollouts, with task progress. Out now = past rollouts plus imported catalogue rows (`ArtistCatalogueCard` now draws rows only and reports its count). The lit dot is where the artist is.
- **Posting plan**: side column on desktop (320px), under Music on a phone.

## Removed

- **What UrgAns remembers** card (`ArtistFactsCard`, `lib/artist-facts-client.ts`) is gone from the page. The facts, their API and UrgAns's use of them are untouched.
- **Social numbers** were mocked and dropped: Instagram and TikTok both need outside app approvals (Meta, TikTok). Do not re-add without the founder.

## Traps

- Up next and the progress bars read `useTaskStore`, which `loadCommandCenter` fills. A team member limited to some rollouts only sees their tasks, so counts are what they can see.
- "Out now" can show a rollout and an imported catalogue row for the same song. They are separate records today; fusing them is #865's territory.
- Analytics: `artist_page_action` gained `up_next` and `new_record`. Measure these before and after.
