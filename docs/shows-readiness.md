# Shows: readiness ledger

Written 2026-09-25, when Shows left Beta. The founder asked for at least 1,000
edge cases and use cases to be accounted for before the tag came off. This
ledger lists every area, how many cases it covers, and where each one lives, so
the claim can be checked rather than taken on trust.

**Totals:** 531 named tests added in this pass (plus the ~130 Shows tests that
already existed), checking about 16,500 generated combinations. 11 deliberate
breakages were each caught by a test. Every test is under `apps/web/lib/` and
runs with `pnpm --filter @urganize/web test`.

## Where the cases are

| Area | Named tests | Generated checks | File |
|---|---|---|---|
| Venue clock: typed time to real instant and back, 45 zones (whole, half and quarter hour offsets, both hemispheres, Lord Howe's 30 minute jump), every hour, 10 dates including each hemisphere's clock changes and New Year | 3 | 10,800 round trips, each also checked for "a repeated hour is the first one" | `events-time.test.ts` |
| Skipped and repeated hours, written out per zone | 13 | | `events-time.test.ts` |
| Festival days keep the same clock time across a clock change | 1 | 56 | `events-time.test.ts` |
| Year only when not this year, judged in the venue's zone; Today, Tomorrow, Yesterday on the venue's day; date tiles; day counting across years, leap days and clock changes | 23 | | `events-time.test.ts` |
| Moving a show: run-of-show steps keep clock time and day, across a clock change and a change of zone | 10 | 240 (12 months x 4 zones x 5 steps) | `events-time.test.ts` |
| Typing a length: clock, bare minutes, decimals, commas, units, prime marks, stray spaces, refusals with a sentence | 58 | 1,200 round trips (every second from 0:01 to 20:00) | `setlist-edge.test.ts` |
| Where a length comes from (row, file, song), every combination of good and bad values | 1 | 392 | `setlist-edge.test.ts` |
| The running total against the slot: tolerance edges, one-minute slots, partial sets never called on time, long festival sets | 15 | 53 | `setlist-edge.test.ts` |
| Which file a row sends: Original first, newest wins, deleted or foreign choices fall back | 13 | | `setlist-edge.test.ts` |
| Pack file names: running order when sorted, padding by set size, unsafe characters, accents, non-Latin scripts, emoji, byte limit a phone can save | 26 | 2,585 names across 11 set sizes | `setlist-edge.test.ts` |
| What a set row may hold: songs, talk, interludes, breaks, lengths, notes, every change of type | 34 | | `setlist-edge.test.ts` |
| Which files are accepted and what they are stored as | 12 | 260 (13 extensions x 20 browser types) | `song-files.test.ts` |
| Naming a file from its name (underscores, dashes, brackets, spellings) | 23 | | `song-files.test.ts` |
| The three step upload: progress, missing types, labels, refusals at each step, retry, token on every call | 14 | | `song-files.test.ts` |
| The song catalog: titles, lengths, BPM, keys, sparse edits, "in use" refusals | 22 | | `song-files.test.ts` |
| What a pack link shows (turned off, cancelled, expired, open) | 4 | 60 | `dj-pack-edge.test.ts` |
| When links stop working, reopening never shortens | 9 | 61 | `dj-pack-edge.test.ts` |
| What the manager is told before sending | 9 | 100 mixes of songs, files and cues | `dj-pack-edge.test.ts` |
| Refusing to delete a sent set, receipts, WhatsApp links, recipients | 25 | | `dj-pack-edge.test.ts`, `dj-pack.test.ts` |
| Status words and badges | 6 | | `events-list.test.ts` |
| The zone picker | 4 | 418 platform zones grouped and checked | `events-list.test.ts` |
| Booking a festival: days x artists caps, repeats, blanks, titles | 13 | 112 | `events-list.test.ts` |
| The shows list: date to confirm first, soonest next, past most recent first, a set that is still playing, festivals kept together | 5 | | `events-list.test.ts` |
| Run of show: ordering, set times shown on Set start and Set end, renamed steps, no date, ties, labels, times, day offsets | 46 | 32 typed times | `events-list.test.ts` |
| Every Shows route: switch before sign-in, access check after, write asks for write | 123 | 34 handlers | `events-routes-guard.test.ts` |
| Public pack routes: token only, file must be in the pack, switch checked first | 3 | | `events-routes-guard.test.ts` |
| House copy rules (no em dashes, no banned words) across every Shows file | extended | every Shows UI file, route and lib | `press-kit-copy-guard.test.ts` |

Who can do what (owner, teammate, guest, artist-scoped teammate, other team,
signed out) is decided by the shared rule in `lib/release-access.ts`, which has
its own tests. The routes guard above proves every Shows handler goes through
it and asks for the right kind of access.

## Found and fixed by these tests

1. **A set time typed inside the skipped hour on the night the clocks go
   forward landed an hour early in every American zone.** It resolved forward
   east of Greenwich and backward west of it. Now forward everywhere.
2. **A repeated hour (clocks going back) meant the second time in Europe and
   the first in the Americas.** Now always the first, the calendar rule.
3. **Moving a show across a clock change moved its run of show by an hour.**
   Steps now keep their clock time and their day relative to the show, which
   also keeps them right when the show changes zone.
4. **"Downloaded yesterday" meant "more than 24 hours ago".** It is the
   calendar day now, on the manager's clock, or the venue's for UrgAns.
5. **A file named with underscores ("Song_Instrumental.wav") was guessed as
   the Original,** which is the file a DJ is sent by default. Fixed, and
   "Acappella" with two p's is recognised.
6. **A very long title could make a file name a phone refuses to save.** Names
   are kept under 200 bytes, cut at whole characters, ending intact.
7. **Lengths typed as 3'30, 3′30″ or "3 : 30" were refused.** They are read.
8. Copy: "1 minutes" on one-minute sets, and "in the set for A and B".

The pack link's gate (turned off, then cancelled, then expired) was an unwritten
order inside the loader; it is a tested rule now (`decidePackGate`).

## Deliberate breakages (mutation tests)

Each was applied, confirmed applied, run, and restored byte for byte.

| Broken on purpose | Caught by |
|---|---|
| Skipped hour resolves backward | 8 tests |
| Repeated hour picks the second | 7 tests |
| Run of show moved by raw hours | 1 test |
| A turned-off link learns the show was cancelled | 2 tests |
| Receipts count 24 hours instead of days | 1 test |
| Underscored file names not read | 4 tests |
| No byte limit on pack file names | 4 tests |
| Prime marks not read | 5 tests |
| A route checks sign-in before the switch | 1 test |
| A write asks for read access | 1 test |
| "set" for every count of shows | 3 tests |

## Manual pass

The automated tests cannot see a screen. This is the pass run in the browser
preview, and what still needs a real phone.

See "Browser pass" below for results.

### Browser pass

Filled in after the run.
