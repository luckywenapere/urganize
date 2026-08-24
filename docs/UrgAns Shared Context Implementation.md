# UrgAns Shared Context — Implementation Spec v2

Amended after the codebase audit on `feat/urgans-shared-context`. This replaces v1. Where the two disagree, this wins.

---

## What changed from v1, and why

The audit found the Layer 1 premise was already broken, and found that two v1 requirements have no foundation to build on.

- **A live defect sits in the exact code this feature touches.** `resolveChappiContext` discards `releaseOwnerIds` and the artist scopes, so `buildChappiSystemPrompt` and `list_releases` call `getReleasesForUser(ctx.user.id)` with no visible-owner list. An invited teammate sees zero releases in their snapshot while `list_tasks` returns the whole team's tasks. It fails closed, so nothing leaks — but shared context is already broken for exactly the multi-member teams this feature exists for. Fixing it is now Phase 0, ahead of everything else.
- **File content indexing is cut.** No pgvector, no embeddings, no chunking anywhere in the repo. The server never sees uploaded bytes — the browser PUTs straight to Storage. On top of that, `NEXT_PUBLIC_FEATURE_FILES` is off in production. That is a new subsystem serving a dark surface. It gets its own spec later, not a bullet in this one.
- **The server-side cache is cut.** There is no cache layer to hang invalidation on. Recomputing is two queries. Leave it.
- **Version history is cut back to `updated_by` / `updated_at` per section.** Full history is two tables plus a retention policy. Ship the audit trail people actually ask for first.

---

## Naming

Code, types, files and env vars use `Chappi`. Only rendered copy says `UrgAns`. Follow the existing split — do not rename anything.

In UI strings: never "workspace". The release surface is called **Catalog**. Whatever the brief editor is named, it is not "Team Brief for your Workspace".

---

## Phase 0 — Fix release scoping in the UrgAns context

This is the highest-value change in the whole build. It is small. Do it first, alone.

### The change

`resolveChappiContext` must carry through everything `loadWorkspaceAccessContext` returns — `workspaceIds`, `releaseOwnerIds`, `artistScopeByOwnerId`, `artistScopeByWorkspaceId` — not just `workspaceIds`.

Then update both call sites to use it:

- `buildChappiSystemPrompt` (`lib/chappi/system-prompt.ts:53`)
- the `list_releases` tool (`lib/chappi/tool-families/core.ts:27`)

Both are the same call, `getReleasesForUser(ctx.user.id)`. Line numbers drift —
grep the call rather than trusting them. (v2 shipped with `system-prompt.ts:68`,
which was a mis-cite in the audit; the call is at 53. Verified 2026-08-24.)

Both should resolve releases the same way `ReleaseService.getReleasesForUser` does for the rest of the app.

### Read this before you write the fix

**Passing `releaseOwnerIds` without applying `artistScopeByOwnerId` converts a fails-closed bug into a real leak.** An artist invited to a manager's team is scoped to their own releases. Hand the raw owner list to the snapshot and that artist sees the manager's entire roster — every release, every date, in the system prompt, with no UI anywhere to reveal it happened.

The artist scope is applied in JS after the query, because the per-owner OR-of-ANDs does not express as a single PostgREST filter. Replicate that. Do not attempt to fold it into the query.

### Tests

Model on `lib/pitching-rls.integration.test.ts` — real PostgREST calls as multiple signed-in users, positive controls first so a broken seed cannot make the negative assertions pass vacuously, env-gated so it skips offline.

Cases:

1. Owner sees their own releases in the snapshot. (positive control)
2. Invited teammate sees the owner's releases in the snapshot. (the bug — fails today)
3. Invited teammate sees the same releases from `list_releases` as from the snapshot. (the self-inconsistency)
4. **Artist with an `artist_scope_id` sees only their own releases, in both surfaces.** (the leak this fix could introduce)
5. A user in Workspace A can construct no prompt returning Workspace B data.

Case 4 is the one that matters. Write it before the fix, watch it fail correctly in both directions.

### Done when

All five pass, snapshot and `list_releases` agree for every member type, no other behaviour changed.

---

## Phase 1 — Workspace summary content

Only after Phase 0 is merged.

The snapshot today is up to 25 release lines: title, id, status, `done/total`, date. Add:

- **Overdue items** — tasks past `due_date` with `status` not complete, across visible releases.
- **Task counts by owner** — grouped by `assigned_to_user_id`, resolved to names.
- **Team member names and roles.**

### On roles

Two vocabularies exist. `workspace_members.role` is `owner|admin|member|guest` — permissions. `profiles.role` is `artist|manager|artist-team|artist-manager|team-member|viewer` — what the person does.

Use `profiles.role`. UrgAns needs to know it is talking to an A&R rather than an admin; permission level tells it nothing useful about how to answer. Include `workspace_members.role` only where it changes what UrgAns should suggest — for example, not proposing an action a `guest` cannot take.

### Budget

There is no token budget today, so do not invent one in this phase. But note what the audit found: fixed overhead is ~7,400 tokens per request, of which **~5,200 is the 47 tool schemas** — roughly 3.5× the system prompt. Capping the prompt string while ignoring tool schemas optimises the smaller half.

Keep the existing `.slice(0, 25)` row cap. Change the sort so it degrades by recency and activity rather than arbitrary order. Leave real budget work as a separate piece with its own measurement.

---

## Phase 2 — Team Brief

One brief per workspace. Sections, not a freeform blob — structure is what makes it fillable, reviewable and injectable in priority order.

| Section | Purpose |
|---|---|
| Roster | Artists the team works with, and where each one is right now |
| How we work | Rollout habits, cadence, what a release means here |
| Positioning | How the team talks about its artists and itself |
| Constraints | Budget reality, territories, platforms, things they don't do |
| Vocabulary | Internal shorthand UrgAns should understand and use |

### Schema

Follow existing migration patterns in `supabase/migrations/`. `workspace_id` foreign key, one row per section or one row with section columns — your call based on what fits the existing style. Per section: `content`, `updated_by`, `updated_at`. No history table.

RLS scoped to workspace membership, matching how other workspace-scoped tables are written. Server reads go through the service-role client with an explicit `.in('workspace_id', workspaceIds)` filter, consistent with the rest of the app.

### Prompt assembly

Inject into `buildChappiSystemPrompt` between `ROLE` and the snapshot, on every request.

Precedence when sources conflict: user's current message > release-scope block > snapshot > brief. The brief is standing background, not an override. If a task says the deadline moved, UrgAns trusts the task.

Omit empty sections entirely. Never inject a header with placeholder text — that teaches the model to hallucinate into the gap.

Cap each section at a fixed character length with a visible counter in the editor. A brief that grows without limit degrades every answer in the workspace, and there is no budget mechanism to catch it.

### Permissions

Any member reads. Any member edits by default. Add a setting restricting edits to `owner|admin`, off by default.

### Editor

**Not a fifth settings tab.** The tab row fits a 375px phone with ~42px spare; a fifth needs ~66px. Put the brief as a section inside the existing Workspace tab, or a page reached from it.

Section-by-section editing, inline save, "last edited by X" per section.

### Done when

Same prompt, same workspace, brief empty vs. filled produces a visibly more specific answer on a real workspace — not a rigged one. Member B benefits from a brief written entirely by Member A. Editing changes the next answer immediately.

---

## Phase 3 — Empty state and nudge

The brief starts genuinely empty. Do not pre-fill example content the user has to delete. Frame it as: their Catalog stays clean, UrgAns is what gets the head start. A short question per section ("Which artists are you working with right now?") as input placeholder text, never as saved content.

When UrgAns answers in a workspace with an empty brief, show a small dismissible affordance — "UrgAns doesn't know your team yet" — linking to the editor. A few times, then stop.

---

## Phase 4 — Attribution

When an answer was materially shaped by the brief, show an expandable marker listing which sections were used.

---

## Phase 5 — Onboarding

A flow walking a new team through the brief section by section, completable live on a call in under fifteen minutes. Track completion percentage per workspace, exposed in internal account views.

---

## Cut from this spec

- File content indexing, embeddings, chunking, pgvector. Separate spec, after `NEXT_PUBLIC_FEATURE_FILES` ships.
- Server-side summary caching with write invalidation.
- Full version history for brief sections.
- Shared visibility of other members' UrgAns threads. Threads stay private to their author. Do not leave hooks that assume otherwise.

---

## Working rules

- One phase per session. Open a PR, stop, wait.
- Do not refactor unrelated code. Report what you find instead of fixing it.
- Match existing patterns over the suggestions here. This describes intent, not house style.
- Every phase ships with tests. The Phase 0 isolation tests are non-negotiable.
- If a requirement here is wrong once you have seen more of the code, say so before implementing it.

---

## Open questions

- Does the brief apply per workspace or per artist? `workspaces.owner_id` is unique, so one workspace per owner — per-workspace is right for a small label. A services team running unrelated artists may need artist scoping, and `workspace_members.artist_scope_id` already exists as a hook. Build workspace-level. Do not make artist scoping impossible later.
- Should UrgAns propose edits to the brief from what it observes? That is the model writing its own instructions. Defer. Do not build toward it silently.
- What is the brief called in UI copy? Not "workspace". Decide before Phase 3.
