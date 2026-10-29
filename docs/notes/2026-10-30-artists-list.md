# Artists list: spotlight and tracklist (2026-10-30, v1.214.0, no flag, #878)

Oyin said the Artists list "looks too bland" (a plain table: face, name, a rollout count). He asked for slight cues from Spotify, then a riff on them. Three directions were drawn; he approved B: `docs/mocks/artists-list/mock.html` (picture in `preview.png`).

## What the page is now

- **Next drop banner** on top: the planned rollout with the soonest date across the whole roster. Cover, title, artist, task progress, due this week and late, a big countdown and Open rollout. Dark green (`#1d2a21`) in both themes, like Spotify's artist banner. Hidden when nothing planned has a date.
- **Tracklist** under it, one row per artist: face (still the photo picker), status word, next rollout with its cover, the day it drops ("In 9 days"), and a task bar with due and late pills. Narrow screens fold this into one line plus the late pill.
- **Phone (swipe nav)**: the same banner in a compact form under the count line, and each row ends with the next rollout's cover.
- The logic is `artistsList` in `lib/artists-list.ts` (tested). Next rollout = nearest planned, else newest just out, the same buckets as the artist page (`bucketReleases`).

## Traps

- **Status is Rolling out, Out now or Quiet.** The mock also had "Making a record", but records load per artist (`useArtistRecords`), so the list would cost one request per artist. Left out on purpose; add a team-wide records read first if it is wanted.
- Task counts come from `useTaskStore`, which `loadCommandCenter` fills, so a member limited to some rollouts sees only their counts.
- A rollout with no cover shows a flat tile with a disc icon, never a gradient. On the banner it uses a translucent light tile, because the page tile glares on dark green.
- The desktop title comes from the shared layout and `lib/section-content-top-guard.test.ts` keeps the area under the tab row bare, so "Import past rollouts" stays under the list on desktop (the mock moved it up).
- Analytics: `artists_list_action` with `action: 'spotlight'` fires on a banner tap.
