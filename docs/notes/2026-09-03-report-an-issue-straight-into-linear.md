# Report an issue, straight into Linear (2026-09-03, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: let users report bugs and make requests from inside Urganize,
and have each one create a Linear issue automatically.

**What the support path actually was before this**, which is most of the reason
it was worth building: the `?` HelpMenu offering Docs, a raw
`mailto:contact@urganize.app`, and a WhatsApp community link — and that menu is
`hidden md:block`, so **on a phone there was no support surface at all**. The
dedicated "Report a bug" affordance had been the WhatsApp pill in
`components/support/SupportChat.tsx`, deleted 2026-08-17 (`d9c9fa68`) along with
`lib/support-contact.ts` and the dock/rail footer links. Nothing replaced it.
The External services entry above described that pill as live until this pass
corrected it, and the `profiles.artist_name` reader count in the artists section
was one too high for the same reason — both flagged rather than silently fixed.

**Not a scope expansion in the out-of-scope sense** — the nearest line,
"third-party music platform integrations", is not crossed (Linear is not a DSP)
and this is not the v2 notifications inbox. It IS, like Notes, deliberately
**global rather than release-scoped**: a bug report is about the product, not
about a release. Behind `NEXT_PUBLIC_FEATURE_REPORT_ISSUE`, default `false`.

**Founder decisions taken before building:** entry points are the HelpMenu plus
a Settings → Account section (no new floating chrome — the bottom-right slot is
already contested by the UrgAns dock, the install card and the notification
ask); a report is stored in Urganize FIRST and pushed to Linear second; and the
attached context is page + app version, name + email, team + plan + role, and
the scoped release.

### Eight things worth knowing before editing this

1. **`POST /api/issue-reports` is deliberately NOT behind the paywall**, and a
   source-reading test enforces it. It uses `getAuthenticatedUser`, never
   `requireActiveAuthenticatedUser` — the `app/api/account/export` call, for a
   stronger version of the same reason: the gated helper runs
   `requireActiveAccount`, which answers **402**, which `lib/access-redirect.ts`
   turns into a browser redirect to `/locked`. A walled or read-only team would
   be ejected from the app **by the act of reporting that it ejected them**. The
   property rests on one import and a comment cannot defend it, so
   `lib/issue-reports-route-guard.test.ts` comment-strips the route source and
   fails if any paywall wrapper appears (mutation-tested).
2. **Identity is resolved server-side; the client sends only what only it
   knows.** The browser supplies the page path, and a release id it read off its
   own URL. Name, email, team, plan and role are read from the database against
   the authenticated user id in `resolveReporterContext`. Accepting a plan tier
   from a request body would let anyone write whatever they liked onto the
   Linear board, and the same guard test asserts no identity field is ever read
   off the payload.
3. **`lib/issue-reports-server.ts` does its own narrow reads rather than calling
   `loadWorkspaceAccessContext`.** That resolver carries provision-on-miss
   WRITES and a fair amount of machinery, and this is the one endpoint that has
   to keep working when the rest of the app does not. A support path should
   depend on as little of the thing being reported as possible. Every field
   degrades independently and an unreadable one is left ABSENT, never set to a
   misleading value — `buildIssueDescription` omits absent fields entirely, so a
   Linear issue simply does not claim a team rather than claiming an unknown
   one (the `buildTeamAlertContext` posture).
4. **Linear never fails the submission.** The row is written first and is the
   durable record; the push is a follow-up whose outcome lands in `status`
   (`pending` / `synced` / `failed`), retryable from `/admin/issue-reports`. The
   reporter is told we have it either way, because by then we do. With
   `LINEAR_API_KEY` unset the whole feature still works — reports just sit
   `failed` until somebody configures it and retries.
5. **The personal API key goes in `Authorization` with NO `Bearer` prefix.**
   A `lin_api_…` key is passed raw; prefixing it fails auth with a 401 that
   looks exactly like a bad key. It is the single easiest thing to get wrong
   here, so it has its own unit test, mutation-tested. (OAuth access tokens are
   the ones that take Bearer — we do not use those.)
6. **GraphQL answers HTTP 200 for a rejected mutation.** Reading `response.ok`
   alone would record a `synced` report that does not exist in Linear, so the
   body is parsed and inspected for an `errors` array and a `success: false`
   before anything is called a success. Also tested.
7. **There is a per-user rate limit, and it is the only one in this repo.**
   Ten reports per rolling hour, counted off the table itself — no new infra.
   Principle 6 says build for the case we have, and everywhere else that means
   no rate limiting; this endpoint earns one because it is authenticated but
   open to every user and each call writes to a third party. It **fails open**
   on an unreadable count, like every other counter here (seats, releases,
   UrgAns actions): wrongly refusing somebody's bug report is worse than
   wrongly allowing an eleventh.

### Smaller decisions

- **Two entry points, one dialog, one store.** `useReportIssueStore` bridges
  them because the HelpMenu and Settings live in different ownership islands —
  the `usePlannerStore` reasoning verbatim. The Settings section is what makes
  the feature reachable on a phone at all, via the "You" tab.
- **`ReportIssueSection` sits mid-tab in Account**, not in the
  password/sign-out/delete tail: reporting a bug is not a rare
  high-consequence account action. It is there for the same structural reason
  `AdminSection` is — that tab is the only mobile surface it can be reached
  from.
- **The dialog portals to `document.body`** (AppShell's `lazy-fade` transform
  breaks `position: fixed` for descendants — the `DeleteReleaseDialog` trap) and
  owns Escape, because unlike the UrgAns rail it is a real modal.
- **`/admin/issue-reports` is deliberately NOT flag-gated** — the `/admin/teams`
  precedent. A report that failed to reach Linear must stay visible whether or
  not the reporting feature is currently switched on.
- **Migration `20260903150000_issue_reports.sql`** — RLS on, **zero policies**
  (the `pricing_validation_responses` / `mcp_oauth_*` posture; every path is
  service-role). Three different delete rules, each argued in the file header:
  reporter CASCADE, workspace and release SET NULL.
- **Only the `NEXT_PUBLIC_` flag goes in `turbo.json`.** `LINEAR_API_KEY`,
  `LINEAR_TEAM_ID` and the two optional label ids are server-only request-time
  reads — the `CHAPPI_API_KEY` / `RESEND_API_KEY` / `GENRE_PREDICTION_URL`
  precedent.

### Verified

`vitest run` — **2302 passing** (42 new across `lib/issue-reports.test.ts`,
`lib/linear-server.test.ts` and `lib/issue-reports-route-guard.test.ts`), 30
env-gated skips unchanged. `eslint .` at **3 errors / 75 warnings** against a
measured clean-tree baseline of 3 / 73 — the two new warnings are both the
documented React-19 `set-state-in-effect` downgrade and both match an existing
finding byte-for-byte (the admin page's fetch-on-mount mirrors
`TeamsAdminPageClient.tsx`; the dialog's portal mount guard mirrors
`DeleteReleaseDialog.tsx`, confirmed by linting those two files). `next build`
green **by exit code** in BOTH flag states with `/auth`, `/onboarding` and
`/settings` still `○ Static` in each.

Runtime probes against `next start`, rebuilding between flag states because
`NEXT_PUBLIC_*` is inlined at build time even server-side: **flag on**,
`POST /api/issue-reports` **401**s unauthenticated (so auth precedes everything
after the gate); **flag off**, it **404**s with body exactly `{"error":"Not
found."}` while the ungated `/api/releases` still **401**s — that 404-vs-401
discrimination is what proves the gate rather than a routing accident. The admin
route answers the same `ADMIN_EMAILS is not configured` 500 as the pre-existing
`/api/admin/teams` under this sandbox's env, verified side by side rather than
assumed.

**Three mutation passes**, each failing exactly its own test and nothing else:
adding a `Bearer` prefix to the Authorization header, importing
`requireActiveAuthenticatedUser` into the route, and (checked while writing) the
absent-field omission in the description builder.

**Sandbox note for the next session:** `next build`'s static-export step needs a
`.env.local` that does not exist here. A throwaway one with
`NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co` plus an anon and a
service-role placeholder is enough to get a real exit code and real runtime
probes; it is gitignored, and it was removed again afterwards.

### LIVE in production (2026-09-03, v1.23.0)

The founder applied the migration, set `LINEAR_API_KEY` + `LINEAR_TEAM_ID`
(team `URG`, `02b3afe2-cd3a-4479-9eb6-272870aa1648`), flipped
`NEXT_PUBLIC_FEATURE_REPORT_ISSUE=true`, and **filed a real report that created
a real Linear issue.** The ledger entry and the bump across all 10
`package.json` files landed with the flip, per the EPK precedent. So the
sandbox's "no Linear issue has ever been created" caveat, which this section
carried at merge, is discharged — the happy path is exercised end to end.

**What is still unexercised**, and it is the half that only matters when
something is wrong: the FAILURE path. No report has ever been saved as
`failed`, and the retry button in `/admin/issue-reports` has never run. The
five-minute check is in the activation checklist below. The two optional label
ids are also still unset, so every issue arrives unlabelled.

### Activation checklist — DONE, except the failure path

1. ~~Apply `supabase/migrations/20260903150000_issue_reports.sql`.~~ Done.
2. ~~In Linear: **Settings → Security & access → API** for a personal key, and
   copy the target team's UUID.~~ Done. The optional "bug" and "request" labels
   were NOT created, so `LINEAR_BUG_LABEL_ID` / `LINEAR_REQUEST_LABEL_ID` are
   unset and every issue arrives unlabelled — cosmetic, and a two-minute fix
   whenever the board wants it.
3. ~~Set `LINEAR_API_KEY`, `LINEAR_TEAM_ID` on the Vercel `Web` project.~~ Done.
4. ~~Set `NEXT_PUBLIC_FEATURE_REPORT_ISSUE=true` **with a commit that actually
   rebuilds `apps/web`**~~ — done; the documented `turbo-ignore` trap did not
   bite, since the version bump touches `apps/web/package.json`.
5. ~~Changelog entry + minor version bump across all 10 `package.json` files~~ —
   done as **v1.23.0**, at the flip rather than at merge (the EPK precedent).
6. **PARTLY DONE.** A real report was filed and reached Linear, so the happy
   path plus the whole context block is confirmed. **Still open:** unset
   `LINEAR_API_KEY`, file one more, confirm it saves as `failed`, restore the
   key and confirm Retry in `/admin/issue-reports` syncs it. That is the only
   part of this feature that has never run, and it is the part that matters on
   the day Linear is down. Also worth one look: Settings → Account rendering on
   an actual phone, since that section is the ONLY support surface a phone has
   (the `?` HelpMenu is `hidden md:block`).
