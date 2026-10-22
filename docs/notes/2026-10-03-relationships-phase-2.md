# Relationships, Phase 2 (2026-10-03, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Phase 2 of "Build order after the credits sprint": a team's own book of people, built ON the directory rather than beside it. Behind `NEXT_PUBLIC_FEATURE_RELATIONSHIPS` (needs `NEXT_PUBLIC_FEATURE_WORKSPACE` too). Migration `20261003100000_relationships.sql`, **not applied anywhere yet**. No changelog entry or version bump: they land at the flip.

### What it is

One person, one profile (`person_profiles`), plus each team's private layer (`team_relationships`). `person_profiles.user_id` is nullable now, so a producer a team works with every month, who has never heard of Urganize, gets an UNCLAIMED profile created by the team's own work. Pages at `/dashboard/relationships` (list) and `/dashboard/relationships/[personId]`, routes under `/api/relationships`, a nav row, page-search entry and prefetch entry.

### Things worth knowing before editing this

1. **An unclaimed profile is private, always, and the database says so.** Two constraints: `status = 'claimed'` exactly when `user_id` is set, and `visibility = 'private'` while unclaimed. Nobody is listed in the directory or served at `/p/{slug}` until they have claimed the profile and chosen to be.
2. **Identity is an email or a phone number, never a name.** `person_identifiers` holds the normalised values (`lib/person-identity.ts`) and is unique on `(kind, value)`, so two teams adding the same address land on ONE profile. A bare short number must have exactly 10 digits after the country code to count as Nigerian. A name match only raises a duplicate flag (`lib/person-match.ts`); nothing is merged automatically.
3. **A team only ever reads its own label and contact details for a person.** The profile's `display_name` for an unclaimed person is whatever the first team typed, and `person_identifiers` is shared, so both would leak one team's data to the next. `team_relationships` therefore carries its own `label`, `email` and `phone`, and the profile's name is shown only once the person has claimed AND listed it. The table has a team-members select policy and no write policy; every write is a service-role route.
4. **The team comes from the signed-in user, never from the request.** `resolveRelationshipsContext` is the one gate (flag, then auth, then team and write-role rules). `lib/relationships-guard.test.ts` reads the real route sources and fails on a workspace id taken from a body, query or path, on a route that skips the gate, and on a write not marked as one.
5. **The contact-detail update filters by team as well as row id.** It was safe without, since the row is found first, but a second scope costs nothing and the guard test caught it.
6. **Links back to the work are nullable columns**: `tasks.assigned_person_id` (who did the work, separate from `assigned_to_user_id`, the team member who owns it), `dj_pack_recipients.person_id`, `release_credit_submissions.person_id`. A team's history with somebody is meant to be derived from these, never typed. Nothing writes them yet.

### Not built in this phase

The claim flow (`person_claim_invites` exists, nothing issues or redeems a token), merging two confirmed duplicates, writing the work-link columns from tasks, pitches, DJ packs and credit submissions, and any sending of messages. Those are the rest of Phase 2.

### Verified

On a clean checkout of `main` at v1.63.0 plus this change: 6,256 tests pass (4 fail, see below), `tsc --noEmit` shows only the 8 documented `confirmed-action.test.ts` errors, `eslint .` is at 3 errors / 92 warnings with **no findings in any new file** and the same count as the committed copy for every modified one, and `next build` is green by exit code with the flag on and off with `/auth`, `/onboarding`, `/settings`, `/dashboard`, `/locked` and `/dashboard/relationships` all still `○ Static`. Runtime probes, rebuilt between flag states: flag on, `/api/relationships` and `/api/relationships/duplicates` answer 401 unauthenticated; flag off, both answer 404 `{"error":"Not found."}` while the ungated `/api/releases` still answers 401. The migration was run against a real Postgres engine (PGlite) in an earlier session, 30 checks including re-running it and keeping existing profiles intact; that run was not repeated.

**The 4 failing tests are an artefact of the worktree's folder name, not of this change.** `lib/press-kit-copy-guard.test.ts` picks its files with a regex over the ABSOLUTE path that includes `directory-`, so in a worktree called `directory-identity-matching-...` every file under `lib/` matches and is held to rules it was never meant for. The same file passes in a differently named worktree. Worth changing that filter to test the path relative to `apps/web`.

### Not verified

Nothing has run against a real database or a real session, and no screen has been seen in a browser, so the list, the person page, adding a contact and the duplicate flags are untested end to end. A first flag-off build in this session failed with a Turbopack PostCSS timeout while the machine was busy and passed unchanged on retry.

### Activation

1. Apply `20261003100000_relationships.sql`.
2. Set `NEXT_PUBLIC_FEATURE_RELATIONSHIPS=true` on the Vercel `Web` project with a commit that rebuilds `apps/web`.
3. Add a contact, add the same email again, and confirm you land on the same person; then add a different person with the same name and confirm a duplicate flag appears instead of a merge.
