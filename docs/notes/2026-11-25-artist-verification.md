# Artist verification and the Verified badge (2026-11-25, v1.294.0, #1390, no flag)

Anyone can add an artist, bring in their releases and grab smart links. Nothing checked that the team manages that artist. Now every artist has a verification status, and the artist or the manager sends a screenshot of Spotify for Artists or Apple Music for Artists for the founder to approve. Founder approved the mock (`docs/mocks/artist-verification/mock.html`, five calm screens) on 2026-11-25.

## The rules, in the founder's words

- **It blocks nothing.** The banner only shows and we email and notify. Import, covers, UPC and ISRC, Grab a smart link, pitching and DJ packs all keep working while an artist is not verified.
- **Nothing is ever taken down by itself.** No timer, no sweep. Only an admin can set `taken_down`, by hand, and it hides rather than deletes.
- **The banner is compulsory and always visible**, like a bank asking you to finish verification, and it cannot be closed. It goes away when an admin approves.
- **Who sends the screenshot: the artist or the manager** (founder, in chat). The artist sending it from their own account is the strongest proof; the admin queue shows who sent it. This replaced an earlier relayed message that said artist only.

## How it works

- `artists.verification_status` is one of `unverified` (default for every artist, including all 80 that existed), `checking`, `needs_fix`, `verified`, `taken_down`, with `verification_note` (the reason the team reads), `verified_at`, `taken_down_at`. Migration `20261125100000_artist_verification.sql`, applied 2026-11-25 (backup table `artists_backup_20261125`, 80 rows).
- `artist_verifications` holds one row per screenshot sent (who, artist or manager, Spotify or Apple, the admin's answer). `artist_verification_events` is the audit trail of every status change. Both are written only by service-role routes.
- The pure rules, banner copy and admin transitions live in `lib/artist-verification.ts` (tests beside it). `lib/artist-verification-server.ts` does the writes and the notices.
- Screenshots reuse the artist photo upload under `artist/<id>/verification/` in the private release-assets bucket. `POST` signs, `PATCH` sends: `/api/workspace/artists/[artistId]/verification`.
- Admin: `/admin/artist-verification` (`/api/admin/artist-verification`). Tabs: Waiting, Needs a fix, Verified, Taken down. Actions: Approve, Ask again (needs a reason), Remove badge, Take down (needs a reason, asks first), Bring back. Not behind a flag, like Claims.
- Every action and every screenshot received emails the team's owner and whoever last sent a screenshot (template `artist_verification`, transactional, from notifications@) and sends a push. There is no bell entry: the bell only carries task notifications, so the banner itself is the in-app message.
- The roster API sends `verification` per artist, read in its own query so a failure leaves everyone "not verified" and never breaks the roster.

## Where it shows

The banner sits above Up next on the artist page. A green tick shows next to the name on the artist page, the artists list and the public press kit once verified. An unverified artist shows no badge and no warning on any public page.

## What taken down hides today

The artist page (banner only), the imported catalogue list, new smart links, and the public press kit (`/k/<slug>` reads as not found). Not yet: DJ packs, pitching, shows, the Directory. Add those if a takedown ever needs to reach them.

## Left for later

- A reminder email every few days until verified (proposed, never approved).
- A manager badge, and a bell entry (needs a notifications table that is not task-scoped).
- Altlink smart links open on Altlink's page, so a badge cannot go there.
- The onboarding "Who is the artist?" step and the Home streaming prompt do not mention verification yet; the banner is on the artist page only.
