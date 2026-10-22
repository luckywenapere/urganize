# Shows leaves beta (2026-09-25, v1.46.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The finish of the Events/Shows surface (branch `shows-beta-removal`) and the
removal of the Beta pill. Not a scope expansion: Shows shipped 2026-09-02
(v1.20.0), and this closes the gaps that made it feel like a demo. The detailed
readiness ledger — every area, its case count and where each lives, plus the
bugs the tests found — is `docs/shows-readiness.md`.

**The core promise now works.** A DJ pack delivered no files. The public pack
page (`/pack/[token]`) and the download route now resolve each set row's file
(its chosen version, else the song's default), sign a URL and redirect, with
no-JS download links so a DJ can save each track. Filenames are padded for
running order and kept under a byte limit a phone can save.

**Fixes that earned the tag removal:**
- Pack passcodes removed — set but enforced by neither the page nor the
  download route, so the assistant and UI no longer claim protection that did
  not exist (14 passcode lines gone).
- Rescheduling a show re-dates its run of show and its pack links instead of
  expiring them early; "reopen for 3 more days"; one pack per set.
- Run of show is editable (new `run-of-show` routes) rather than six seeded
  rows stuck on "—"; each step keeps its clock time and its day relative to the
  show when the show moves, correct across a DST change and a zone change.
- Songs get edit/delete routes (typos were unfixable); set-item writes verify a
  chosen version belongs to the row's song and stay inside the artist's
  catalog, dropping the old song's file on a swap.
- Shared `ensureArtistAccess` across the create routes: guests blocked, scoped
  teammates kept to their artist; the list returns the bookable artists.
- Artist-deletion blockers now count shows and songs (and clear the song
  catalog and its files), so the "This artist has rollouts now" message is
  truthful.
- `useEventsStore` and `useArtistRosterStore` reset on sign-out — the same
  privacy fix already made for UrgAns and scene data.
- Timezone-correct set times (a time typed inside the spring-forward skipped
  hour used to land an hour early in US zones); upcoming-first list ordering;
  the song upload UI wired to the existing 3-step signed-URL backend.

Screens were rebuilt for plain wording and reachable states (Shows list, Book a
show, the set builder, the song catalog, the Send-the-tracks card, the DJ pack
page), with shared `ConfirmDialog` / `TimezoneSelect` / `useSongFileUpload`
primitives.

**The Beta pill was still on the Shows nav row** when the fixes landed, even
though the ledger opens "when Shows left Beta." Removed here — `beta: true`
dropped from the Shows row in `WorkspaceIdentityPanel.tsx` (Pitching and
Directory stay beta) — so the code matches the claim.

**Verified** on the merged branch: `vitest run` 4,168 passed / 30 skipped;
`eslint .` at the 3-error / 78-warning baseline (all pre-existing in
`WorkspaceView.tsx`, zero in any Shows file); `next build` green by exit code
with every Shows route compiling and the static routes still static. Coverage:
531 named tests added (~16,500 generated combinations) plus 11 mutation tests
each caught — see the ledger.

**Not verified:** the gate cannot exercise a logged-in Shows session or a real
file upload, and no session is mintable here — so booking a show, uploading a
file, sending a pack and opening it on a phone, and a reschedule re-dating the
links are the remaining manual browser and phone pass (checklist in the ledger).
