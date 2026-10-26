# Artist import in onboarding (2026-10-26, v1.180.0, NEXT_PUBLIC_FEATURE_ARTIST_IMPORT ships on)

Founder approved the mock ("alright build"). A new onboarding step, right after "What are you working on?" and before the account: type an artist's name, pick the profile, watch their releases arrive, then "Add another artist?". Skippable at every point.

## How it works

- **Order**: persona, working on, **artist import (step id 11)**, falls apart, ..., opt-in, account, paywall, welcome, invite. The id is stable and not a position; `isPostAccountStep` and `lastQuestionStep` in `lib/onboarding-steps.ts` now name the post-account steps explicitly, because id 11 is greater than the account id and the old `step > account` rule would have called it post-account. Held by `lib/artist-import/onboarding-steps.test.ts`.
- **Sources** (`lib/artist-import/providers.ts`, pure parsers; `fetch.ts`, the calls): Deezer first (no key, has release type, cover and fan count), Apple iTunes lookup when Deezer finds nothing. Spotify is NOT used: new-app approval limits could block us at launch. Measured 2026-10-26: both return real data (Burna Boy: 82 releases on Deezer).
- **Public lookups before the account**: `GET /api/artist-import/search?q=` and `GET /api/artist-import/releases?provider=&id=`. Open on purpose, a per-address in-memory limit (`rate-limit.ts`, 40 a minute, best effort per server instance), cached an hour. Source ids are digits only (`isSafeSourceId`).
- **Held until the account exists**: the picked artists (provider, id, name, count) sit in localStorage `urganize.onboarding.artist-imports` (`pending.ts`). NOT in the onboarding draft: that also rides in the email-confirmation metadata. A confirmation link opened on another device loses them; the person adds the artist from its page later.
- **Saved at the hand-off**: `runPostSignupHandoff` calls `saveImportedArtists` before the rollout is made, so the rollout's artist lookup finds the same artist. `POST /api/artist-import` takes only `{provider, id, name}` and pulls the releases AGAIN on the server; the browser never sends a list of releases to store. Best effort and bounded (12 s): a failure never strands the sign-up.
- **Where they live**: new table `artist_catalogue_releases` (migration `20261026150000`, applied to live 2026-10-26, RLS select for team members, writes service-role only, upsert on `(artist_id, source, source_id)`). **Not `releases`**: rollout counts, plan limits, the Home "plan a rollout" card and the scoreboard all count `releases`, and 80 past singles would make each of them lie. Shown on the artist page in `ArtistCatalogueCard` (renders nothing when empty). Read by `GET /api/workspace/artists/[artistId]/catalogue`.
- **Artist limit**: `importArtistCatalogue` uses `checkArtistAllowance`; over the limit it saves nothing for that artist.
- **Last screen** ("last released X months ago, plan the next one?") shows only for "Nothing planned yet" and only when release dates exist. "Plan the next release" turns the answer into a single for that artist and moves on; the step list then grows by the rollout steps.
- Kill switch: `NEXT_PUBLIC_FEATURE_ARTIST_IMPORT=false` removes the step. Analytics: `onboarding_artist_import_viewed`, `_picked`, `_imported`, `_import_skipped`, `_plan_next`.

## Traps

- Covers are remote URLs (Deezer, Apple), never copied. The step and the card use plain `<img>`, not `next/image`.
- `components/` must not contain the word "workspace" (house-copy ratchet): the catalogue fetch lives in `lib/artist-import/client.ts`.
- Not verified here: the post-account save (`saveImportedArtists`, `POST /api/artist-import`) was type-checked and reasoned through but not run end to end, because a test sign-up on this machine writes to the live database. Manual pass: sign up with an artist picked, check the artist page's Catalogue card and that the roster has one artist, not two.
- A Deezer outage at search time falls back to Apple for that search; the edge cache keeps that answer for an hour.
- 19 unrelated guard tests in `pnpm test` fail on this Windows checkout (CRLF reads in file-scanning tests); they failed before this change.
