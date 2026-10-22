# Scenes opened to the team: one release-access rule (2026-08-29, v1.5.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder screenshot: the Collect metadata scene on a scoped release ("Ohema")
erroring with **"Release not found."** while the release sat right there in the
header. Root cause, confirmed end to end before touching anything: **the
workspace shows releases to every workspace member (whole-workspace visibility,
2026-07-23) and the release detail GET, tasks and pitching are all team-aware —
but every per-scene route group carried a LOCAL owner-only check**, so a
teammate (an email invite, a team login from the compulsory post-create step, an
artist-scoped member) could see a release everywhere and get a 404 inside any
scene. That exact string is produced only by those ownership checks — a DB error
on this path surfaces as a 500/501 with different copy — so the screenshot could
only be a non-owner member. v1.4.3's invite-join fix (its section above) put
more real teammates into workspaces the same week, which is why it surfaced now.

**Owner-only was a copy-propagation accident, not a decision.** Eight copies of
`ensureReleaseOwnership` existed (one shared + seven local clones), and every
clone's docstring justified the copy on schema-fallback-module-hygiene grounds —
a reason that turned out to misread the guard: `schema-fallback-guard.test.ts`
regex-matches the five deprecated helper NAMES in file text (comments included,
no import-path inspection), so importing a clean name from `releases/_shared.ts`
never tripped it. The only DELIBERATE owner-only rule on record is for the
release ROW itself ("teammates work through activities; the release object
itself stays the owner's to change").

**The one rule now (matches the tasks model exactly):** any workspace member may
use a release's scenes — reads AND writes — with `guest` members read-only;
only release-row mutations (PATCH/DELETE, archive, schedule) stay owner-only.

Six things worth knowing before editing this:

1. **`lib/release-access.ts` is the pure decision; `lib/release-access-server.ts`
   is the only wrapper.** `decideReleaseAccess` evaluates owner → visibility →
   artist scope → (writes only) role, and THAT ORDER IS A SECURITY PROPERTY:
   visibility outranks the role gate, so a non-member probing a write endpoint
   gets 404 `'Release not found.'` (never a 403 that confirms existence), and
   only someone who can already see a release can learn they are read-only in
   it. Mutation-tested four ways (inverted owner compare, deleted scope check,
   missing-role-defaults-allow, reordered gate — each fails a named test). The
   refusal string must also never become `'Not found.'`, which UrgAns's
   `isFlagGateOff` reads as "feature flag off". Guest writes get
   `buildReadOnlyResponse()`'s 403 — safe with `lib/access-redirect.ts`, which
   intercepts 402 only.
2. **`WorkspaceAccessContext` gained `memberRoleByOwnerId`** — the caller's role
   per workspace OWNER, derived in `resolveWorkspaceAccessContext` from rows
   already loaded (zero extra queries, first-wins over the owner-first
   membership sort). `resolveReleaseTaskWorkspace` was deliberately NOT reused
   as the access primitive: it has a write side effect
   (`createDefaultReleaseTaskGroups`).
3. **Eleven route groups now gate through the pair** — metadata (+
   predict-genre), credits (+ submissions), assets, song, cover-art, epk,
   capture (+ rotate), recap, generate-status, content-calendars,
   content-posts: GETs call `ensureReleaseTeamReadAccess`, every other method
   `ensureReleaseTeamWriteAccess`. The six local clones are deleted, and
   **`lib/release-access-guard.test.ts` freezes the rule** (comment-stripped
   source scan over an explicit directory list; bans
   `ensureReleaseOwnership|ensureOwnedRelease`; requires the shared pair in
   every route.ts; mutation-tested three ways). Enlisting a new scene group is
   a conscious edit to that list. `ensureReleaseReadAccess` in
   `releases/_shared.ts` is now an alias re-export of the shared read helper
   (one team-read implementation; its missing-table edge moved 501→500, the
   sanctioned ratchet direction), and `toReleaseSummary` moved to
   `lib/release-ops.ts`.
4. **Child rows are stamped with the RELEASE owner, never the acting teammate.**
   Five insert sites flipped (calendar, post, epk, capture, credits link;
   recap's `:306` was the INSERT stamp, not a read) — `assets`/`song`/
   `cover-art` already stamped the owner, which settled the convention. It is
   load-bearing, not cosmetic: those `owner_user_id` columns carry owner-scoped
   RLS, feed `account/export` and `delete-now`, and cascade from `auth.users` —
   a caller-stamped row would die with the teammate's account and hide from the
   owner's export. The credits link is the sharpest case: the public POST
   propagates `link.owner_user_id` into every submission. `assets.uploaded_by`
   still records the actor.
5. **Schedule and archive stay owner-only, gated client-side now.**
   `WorkspaceView` reads `scopedReleaseSlim.ownerUserId` and hides
   `SetReleaseDateCard` and the Archive/Restore action for non-owners (fail
   OPEN on missing data — the ReleasesSection legacy-cache pattern), because
   both were offered to teammates and 404'd on press. Schedule is genuinely
   unsafe to open up mechanically: its deferred template instantiation calls
   `ensureOwnedWorkspace(auth.user)`, so a teammate save would land 64 tasks in
   the TEAMMATE's own workspace. The plan group is DEFERRED owner-only (flag
   off in prod; draft rows owner-keyed in 8 places); collaborators is
   caller-less legacy, untouched.
6. **Two accepted semantics changes, said out loud:** the `metadata_viewed`
   stamp now fires for any member's view (team review is review; the payload
   records who), and UrgAns tools that proxy these routes (calendar tools, epk
   generate/revoke, recap, `generate_status_update`, song) now work for
   teammates as a free effect — `set_release_date`, planner tools and release
   PATCH/archive still refuse them.

Also fixed, the amplifier: `MetadataSection.tsx` rendered its error box on
`loadError` ALONE, hiding perfectly good cached data behind it (the store keeps
the payload on a failed revalidate, and since v1.3.0 metadata always
revalidates on open). The blocking box now renders only with `!data`; with
cached data on screen a slim banner reports the failure above the cards — the
CuratorLoadError blocking-vs-banner split, copied not imported.

**Verified:** the full suite green including 15 new `lib/release-access.test.ts`
cases and the ~50-case guard test; `eslint .` byte-identical to the measured
baseline (3 errors / 66 warnings, all pre-existing in `WorkspaceView.tsx`);
`next build` green by exit code with `/auth`, `/onboarding`, `/settings` still
`○ Static`; runtime probes in both flag states (flag off → the scene routes 404
with the flag body `'Not found.'`; flag on → 401, so auth still precedes any
release read). A raw `tsc --noEmit` shows 8 PRE-EXISTING errors in
`app/api/urgans/confirmed-action.test.ts` on main too (next build's checker
tolerates them) — do not attribute those to this work, and gate on the build's
exit code as always. **Not verified:** no real teammate session — this sandbox
cannot mint one — so the member/guest paths rest on the pure-core tests, the
guard test and traced call paths. Worth one live pass: as a teammate, open
Collect metadata and the Calendar on a shared release, save a metadata field,
create the credits link (its row's `owner_user_id` must be the release owner),
and as a guest confirm the view-only refusal on save.
