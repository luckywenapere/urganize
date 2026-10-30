# Skip the pitch warning (2026-10-31, v1.226.0, no flag)

Founder: "Release day is under 35 days away. That's tight for a Spotify pitch." read as a must, with only a Fix button. A team that has missed the window should be able to say so and stop seeing it.

- **Words:** a "Skip pitch" button beside Fix; after it, the toast "Got it. No Spotify pitch for this one."
- **Team-wide, per rollout:** `releases.skipped_distribution_warnings text[]` (migration `20261031040000`). `POST /api/releases/[id]/distribution/skip { code }`, same access as ordering (any member, not a guest).
- **Only advice can be skipped:** `SKIPPABLE_WARNINGS` in `lib/distribution-rules.ts` lists the codes (today only `pitch_window_tight`) and their words. `checkDistributionFacts` drops a skipped warning, so the rollout strip, the Distribute scene, the order route (no "Order anyway" needed for it) and the handoff all agree. An error is never skipped, whatever the column holds.
- **Fails open to showing:** the skipped list is its own read in `loadDistributionFacts`; if it fails (or the column is not there yet) the warning just shows again.
- **No undo yet.** To bring it back, remove the code from the column. Moving the release day does not clear a skip.
- Not checked in a browser: the session had no local app and no production access.

## Keep date (2026-10-31, v1.226.1)

`release_date_tight` ("Stores can take up to 14 working days...", or the date has passed) is skippable too: "Keep date", toast "Got it. Keeping this date." Same column and route; no new SQL.
