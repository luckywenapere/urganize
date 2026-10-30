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

## No advice that feels compulsory (2026-10-31, v1.228.0, #919)

- **Every distribution warning is skippable now**: "Keep title" (`feat_in_title`, `title_all_caps`), "Leave splits" (`splits_not_100`). A test fails if a new warning is added without an entry in `SKIPPABLE_WARNINGS`. Errors never.
- **Leave splits reaches the other split surfaces**: the handoff row reads the splits as settled (`lib/handoff-server.ts`), and Metadata's "check the shares" and warning colour go quiet (it reads `skippedWarnings`, now on the distribution payload).
- **Other nags, kept in this browser** (`lib/hidden-nudges.ts`, localStorage `urganize.hidden.*`, optional days): Home's "Upgrade to Manager" card and "Start the next one early." (Not now, 30 days); "Set your release date" when nothing is blocked (Not now, per rollout; the version that builds the plan stays); the pinned "Confirm your release date" (Unpin); Smart link checklist suggestions (Skip, per rollout; blockers stay); plan "N suggested" items (No thanks).
- **Left alone on purpose**: cover art stores will reject, the "Start here" tag, billing strips, the press kit page's "questions left" and "release landed" proposals (that page has redirected to Artists since 17 Oct, so nobody sees them).
- **Known gap, not live**: a distributor rejection would show for good (`loadRejections` has no resolved filter). Nothing records rejections yet.
