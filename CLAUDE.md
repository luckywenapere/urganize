# CLAUDE.md

This file is the source of truth for AI coding assistants working in this repository. Read it before making any structural decisions. If anything here conflicts with what you find in the code, this file wins for *intent*; the code wins for *current reality*. When they disagree, surface the conflict rather than silently picking one.

---

## What Urganize is

Urganize is operational infrastructure for music industry teams. The product being built right now is **v1**: a release management workspace.

**Target user for v1:** an artist manager or small label running more than one artist's releases at once. Not enterprise teams, not artists directly. Team-scale coordination (handoffs, files, status across a roster) is the paying pain point, confirmed directly: a solo manager with one artist already has a workable system (WhatsApp, Drive, calendar) and won't switch. Labels running a full roster are served by the premium Label tier (founder-delivered onboarding + template tailoring), not the self-serve core wedge.

**The central object is the release.** Every feature, every data model, every UI surface in v1 should answer the question: *how does this serve a release?* If a feature can't tie back to a specific release, it does not belong in v1.

**The product thesis:** the music industry runs on chaos. Tribal knowledge, scattered group chats, spreadsheets, and one overworked person holding every release together. Urganize is the system of record for the release — where the plan lives, where the work happens, where the team sees status. AI helps where it's genuinely useful; templates carry the domain knowledge.

---

## v1 scope (hard list — do not exceed)

The six features that constitute v1:

1. **The release object** — date, type (single/EP/album/music video), artist, team, status, lifecycle state.
2. **AI-generated release rollout plan from hand-crafted templates** — templates are static, hand-written, and version-controlled. AI adjusts a template into a tailored plan based on release context. The plan is editable by the user before commit.
3. **Tasks with assignees and dependencies** — generated from the template, editable, with status and priority. (Reordering was in the original scope wording but was never surfaced in any UI; its caller-less API endpoint was deleted 2026-07-10 — rebuild from git history if a reorder UI ever lands.)
4. **File/asset attachment to releases** — artwork, masters, contracts, split sheets, and similar release artifacts. Stored in Supabase Storage (`release-assets` bucket).
5. **Lightweight event milestones inside a release** — listening party, video shoot, release day. Dated points on the release timeline. Not a standalone event management feature.
6. **AI status update generator** — reads current release state, produces a one-paragraph narrative status the user can send to the artist, the label, or the team.

**Scope expansion (2026-07-13):** a seventh surface, **Chappi**, was consciously added after the original cut — a conversational, tool-using assistant (its own dedicated page, `/dashboard/urgans`, reached via a topbar icon — reworked 2026-07-14 off an earlier inline-hero placement atop `/dashboard`) that answers questions about releases/tasks and takes release actions on the user's behalf. It moves the "AI chat / general-purpose AI assistant" line off the out-of-scope list below (the ONE sanctioned move) and stays true to the release-spine principle: every one of its tools reads or mutates a release or its tasks. It is flag-gated (`NEXT_PUBLIC_FEATURE_CHAPPI`, default off) and dark until a capable tool-calling model is wired, degrading to a deterministic command bar meanwhile. Full detail in the "Chappi — conversational AI front door" subsection under AI integration. The "do not exceed" rule still holds for everything else — Chappi is the exception that proves it, not a precedent for adding other out-of-scope items.

**Scope expansion (2026-07-30):** a ninth surface, the **EPK generator** (URG-196), was consciously sanctioned by the founder ("it has passed through the test and helps the release process an activation"). Per release, the owner generates a public, shareable press-kit link (`/epk/[token]`) auto-assembled at request time from data already in the product — artist name, title, type, date, description, `release_metadata` fields, cover art, promo-image assets. No EPK builder (no layouts, no themes, no custom domains), no standalone entry point: one opinionated URG.001-brand template, discovered from the release detail page only, honoring the release-spine principle. Nothing is stored per kit (the `release_epks` row is just the share grant: token + release FK), so the kit stays in sync with the release by construction. Image assets only — audio, documents, and contracts never surface on a public link. **The Linear issue's freemium tier placement was explicitly dropped at build time (founder, 2026-07-30): there is no freemium tier; billing architecture stays as-is, and every kit carries the "Made with Urganize" footer** (the distribution loop the issue wanted, minus the tier machinery). Gated behind `NEXT_PUBLIC_FEATURE_EPK` (default off; API routes and the public page both 404 when off). This is the third sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-07-20):** an eighth surface, the **release content calendar** (URG-157), was consciously sanctioned by the founder. Unlike Chappi it moves nothing off the out-of-scope list below (a content calendar was never on it); it exceeds the six-feature hard list, and the founder made that call explicitly after the feature was specced and reviewed first (UX-fit landscape check plus a full design review, both recorded on the Linear issue). Per release, a manager creates content calendars, each bound to a platform account with multiples per platform allowed, holding planned posts on a month grid. Planning only: no posting, no platform APIs, so the third-party-integrations line is not crossed, and everything hangs off a release, honoring the release-spine principle. Three phases behind `NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR` (default off): A = calendars + posts CRUD + month grid, B = cross-calendar sharing + asset link, C = Chappi-generated draft calendars grounded in a hand-crafted cadence template (AI tailors templates, never invents from scratch). The calendar is also the sanctioned pilot surface for the Urganize Brand Bible's screen mode (feature-scoped CSS variables — originally dark-locked, but the founder reversed that call 2026-07-20 and the island follows the app's `data-theme` toggle; see the `.cc-island` comment in `apps/web/app/globals.css`. Doc-drift corrected 2026-08-10: this sentence said "dark-locked" for weeks after the reversal — only the EPK and credits islands are genuinely dark-locked) ahead of the intended app-wide restyle. The full spec, including all founder decisions, lives on Linear URG-157. This was the second sanctioned expansion (the EPK generator above was the third; the metadata hub below is the fourth; the mobile shell below is the fifth): the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-07-31):** a tenth surface, **release metadata + collaborator credit capture** (URG-108), was consciously sanctioned by the founder. Unlike content calendar or the EPK generator, this one DOES move something off the out-of-scope list below — "Credit submissions / shareable credit links" — the same move Chappi made in 2026-07-13; see the EXCEPTION note on that line. One shareable, no-login link per release lets collaborators (producers, co-writers, engineers) submit publishing/distribution credits — legal name, roles, songwriter and master splits, PRO affiliation, IPI/CAE number, publisher, socials — through a public form; the unguessable share token is the only access control, the same trust model the EPK link already established. Submissions land on an in-app **Metadata** page (reached from the release header, right after Press kit, and from the workspace's scoped header — since 2026-08-12 that scoped-header pill is the NARROW-width path, with the identity card's nav as the wide-width entry point; the exact breakpoint is conditional, see "Identity card gains a nav" below) that also lets the manager edit release-level distribution fields (ISRC, UPC, genre, subgenre, language, explicit flag, label name, (P)/(C) lines) — one page for everything a distributor handoff needs. Storage and display only, per the royalty-splits scope line below: no automation, no PDF generation, no e-signing. Submissions are submit-once by design — no edit token, no update path for collaborators; a manager corrects a bad entry by deleting it and the collaborator resubmits through the same link. Flag-gated behind `NEXT_PUBLIC_FEATURE_METADATA` (default off; the credits API routes and the public `/credits/[token]` page both 404 when off). Everything hangs off a release, honoring the release-spine principle. This is the fourth sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-07-21; this entry backfilled 2026-08-07 — doc-drift, see the note at the end of this paragraph):** an eleventh surface, a **native Android/iOS app** (no Linear issue number recovered), was consciously sanctioned by the founder. Unlike content calendar or the EPK generator, this one DOES move something off the out-of-scope list below — "Native mobile apps (iOS, Android)" — the third sanctioned exception to that list (Chappi was the first, the metadata hub the second). It is not a rewrite: `apps/mobile` is a **Capacitor native shell** whose webview loads the real, continuously-deployed `https://app.urganize.app` — there is no bundled/static build of the product, no separate mobile codebase to keep in sync, and no offline mode. This keeps the release-spine principle intact by construction: every screen the app shows *is* the same release-scoped web app, not a reimplementation of it. The decision record and full webview-risk audit (why static export was rejected, the auth/OAuth deep-link fix, the Apple IAP billing exclusion, the browser-only-API fixes) lives in `docs/mobile/capacitor-audit.md`, `docs/mobile/auth-setup.md`, and `docs/mobile/codemagic-setup.md` — read those before touching `apps/mobile` or the platform-detection code paths in `apps/web` (`lib/platform.ts`, `lib/external-link.ts`, `components/providers/CapacitorAuthBridge.tsx`). This is the fifth sanctioned expansion — the "do not exceed" rule still holds for everything else. **Doc-drift note:** the shell was built and committed 2026-07-21 (native projects, Capacitor config, the audit docs, the `apps/mobile` workspace member) but this file was never updated to record the scope decision — the same failure mode flagged elsewhere in this document ("Chappi-first landing restored," "doc-drift flag" under Workspace consolidation). Surfacing it now per this file's own rule rather than silently back-filling it without a note. No Play Store/App Store release has shipped yet, so there is no changelog-ledger entry to reconcile — the Versioning section's release procedure applies once a build actually reaches users, same as any other v1 surface.

**Scope expansion (2026-08-08):** a twelfth surface, **genre prediction from audio**, was consciously sanctioned by the founder. It moves nothing off the out-of-scope list below — the nearest line, "third-party music platform integrations," is not crossed: the model is a bespoke classifier built for Urganize by a collaborating developer (a FastAPI service on an AWS Lambda function URL), not a DSP/platform API. It is one control on the already-sanctioned Metadata hub: next to the Genre field, "Predict from audio" lets the owner pick a local audio file, which `apps/web` proxies to the model and uses to prefill the existing free-text `release_metadata.genre` field. **Nothing is stored** — the audio is streamed through and discarded, the prediction is not persisted, and the user reviews it and saves through the existing metadata PATCH. No new table, no migration, no new object; it hangs off a release, honoring the release-spine principle. Flag-gated behind `NEXT_PUBLIC_FEATURE_GENRE_PREDICTION` (default off; the `predict-genre` API route 404s when off), configured by the server-only `GENRE_PREDICTION_URL` (+ optional `GENRE_PREDICTION_API_KEY`). **Two known external-dependency gaps at build time:** the upstream URL has no authentication (the `x-api-key` header is pre-wired for when its owner adds one) and its response schema is unpinned — the model was returning HTTP 500 on every file when this shipped, so `lib/genre-prediction.ts`'s parser is deliberately tolerant of every plausible FastAPI-classifier response shape and carries a TODO to pin it once the endpoint works and is documented. This is the sixth sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-08-09):** a thirteenth surface, **Notes**, was consciously sanctioned by the founder. Like Chappi, the metadata hub, and the mobile shell, this one DOES move something off the out-of-scope list below — "Notes / idea capture" — the fourth sanctioned exception to that list. **It is also the first deliberately GLOBAL surface, and that deviation from the release-spine principle was the decision made:** a note is captured with no required fields and no release, because the moment worth capturing (mid-call, mid-DM) is exactly the moment a manager will not stop to classify anything. The tie-back is an OPTIONAL release link — a note can be linked at any time, linked notes carry a release chip and surface when the notes page is filtered by that release (`/dashboard/notes?release=<id>`, reachable from the workspace's scoped header). Text only: **voice memos and track-idea audio remain out of scope**, and the rest of that out-of-scope line still stands. Private to the owner — no teammate read path, no share link, so unlike the EPK and credits links there is no public surface here at all. One table (`notes`: optional `release_id` with `on delete set null` so a note outlives its release, `body`, `pinned`); no separate title column, since the first line of the body IS the title (the Apple Notes model). Flag-gated behind `NEXT_PUBLIC_FEATURE_NOTES` (default off; all four `/api/notes` routes 404 and the page bounces to `/dashboard` when off). This is the seventh sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-08-09, second entry that day):** a fourteenth surface, **task outcomes** ("Done. How did it go?"), was consciously sanctioned by the founder. It moves nothing off the out-of-scope list below, and it hangs off the release spine by construction: an outcome exists only for a task, and a task exists only for a release. When a user marks a task done, UrgAns opens a bottom sheet asking how it went — three chips (Went well / Went okay / Didn't go to plan), an optional note, and at most one AI follow-up question when a note was written. **Completion is never blocked or delayed by it, and dismissing records nothing and never reopens the task.** One table (`task_outcomes`, unique per task: re-completing replaces the row; reopening keeps it as history of the last completion) plus one profiles column (`ask_after_tasks`, the per-user "Ask me after tasks" toggle in Settings, default on). Outcomes are intended as the memory of the release — a later recap card and UrgAns planning context read them instead of re-deriving what happened, which is why every row carries a `summary` string (AI-written when a note exists, template-built otherwise). Flag-gated behind `NEXT_PUBLIC_FEATURE_TASK_OUTCOMES` (default off; the `/api/tasks/[id]/outcome` route 404s when off). This is the eighth sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-08-09):** a fourteenth surface, the **release recap card**, was consciously sanctioned by the founder. It moves nothing off the out-of-scope list below — the nearest line, "analytics dashboards", is not crossed: this is a single shareable image celebrating one finished release, not a reporting surface, and it computes nothing the release spine does not already hold. Every stat comes from the release and its tasks, so it honors the release-spine principle. Per release, once the release date has passed (or every task is done), the workspace's scoped-release header offers "Get your release recap": an optional one-field form (a highlight, hand-entered since there is no DSP integration) then a server-rendered poster in two sizes (1080x1920 story, 1080x1080 square), stored in the existing private `release-assets` bucket and handed to the user through the native share sheet on mobile or a download on the web. It is a distribution feature as much as a product one: every card carries a "Made with Urganize" mark, the same loop the EPK's footer runs. Flag-gated behind `NEXT_PUBLIC_FEATURE_RELEASE_RECAP` (default off; the recap API route 404s when off). This is the eighth sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-08-10):** a fifteenth surface, **playlist pitching**, was consciously sanctioned by the founder (agent brief, 2 of 4). It is the largest expansion so far and the only one that adds **a new kind of user**: a `curator` (a playlist owner), invited by link, who belongs to no team and can never see a release, a task, a file or any other team data. Teams pitch a song from a release to a curator's playlist with a link plus a note of up to 300 characters; the curator answers New / Listened / Added / Passed with an optional one-line reply, and that answer shows back on the release. Free in v1, so no billing surface is touched. It moves nothing off the out-of-scope list below: the nearest line, "third-party music platform integrations", is **not** crossed — nothing calls a DSP, a playlist is a row a curator typed in and a follower count is self-reported. It honors the release-spine principle on the team side (a pitch exists only for a release). **Two things about it are genuinely new to this codebase and are the reason to read `supabase/migrations/20260810100000_playlist_pitching.sql` before touching it:** (1) the first cross-tenant read, so `playlist_pitches` carries two SELECT policies, one per side, and no write policy at all; (2) the first non-team account type, contained at three chokepoints — `blockCuratorAccount` inside `requireActiveAuthenticatedUser` (so every protected team route 403s a curator), the curator bail in `loadWorkspaceAccessContext`, and the guard inside `ensureOwnedWorkspace` that stops a curator ever being handed a team of their own. Four tables (`curator_invites`, `curator_profiles`, `curator_playlists`, `playlist_pitches`) plus a widened `profiles_role_check`. Flag-gated behind `NEXT_PUBLIC_FEATURE_PITCHING` (default off; every `/api/curator`, `/api/pitching` and `/api/admin/curator-invites` route 404s and the `/curator` pages bounce when off). This is the ninth sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Out of scope for v1, no exceptions:**

- Standalone events (events not tied to a release)
- Notes / idea capture / voice memos / track ideas — **EXCEPTION (2026-08-09): text notes are now being built as the Notes surface.** The founder consciously moved this line; see "Scope expansion (2026-08-09)" above. Global quick capture with an optional release link, private to the owner, at `/dashboard/notes`. **Voice memos and track-idea audio are NOT covered by this exception and stay out of scope.** This is the fourth sanctioned exception to this list (Chappi below was the first, the metadata hub above the second, native mobile apps below the third) — do not read it as license to add other items from this list.
- Folders as a feature
- Royalty splits / split sheet automation beyond storage
- Sync licensing
- Merch
- Touring / live show coordination
- Native mobile apps (iOS, Android) — **EXCEPTION (2026-07-21; recorded here 2026-08-07): now being built as a Capacitor native shell around the existing web app.** The founder consciously moved this line; see "Scope expansion (2026-07-21...)" above for the full decision and `docs/mobile/capacitor-audit.md` for the technical audit. This is the third sanctioned exception to this list (Chappi below was the first, the metadata hub above the second, Notes above the fourth) — do not read it as license to add other items from this list.
- Third-party music platform integrations (DistroKid, Spotify, Apple Music, Instagram, etc.)
- Notifications inbox (transactional email is fine; in-app inbox is v2)
- Analytics dashboards
- User-configurable customization (custom statuses, custom roles, custom release types)
- Pre-save campaigns
- Listener profile generation
- Credit submissions / shareable credit links — **EXCEPTION (2026-07-31): now being built as the release metadata hub's collaborator credit capture.** The founder consciously moved this line; one shareable, no-login link per release lets collaborators submit publishing/distribution credits through a public form, landing on the in-app Metadata page (see "Scope expansion (2026-07-31)" above). Storage and display only — no automation, no signing. This is the second sanctioned exception to THIS list (Chappi below was the first; native mobile apps below is the third, Notes above the fourth) — do not read it as license to add other items from this list.
- AI chat / general-purpose AI assistant — **EXCEPTION (2026-07-13): now being built as Chappi.** The founder consciously moved this line; Chappi is the conversational AI front door, at its own dedicated page (`/dashboard/urgans`, see "Chappi — conversational AI front door" under AI integration). This was the first sanctioned exception to this list — the metadata hub above is the second, native mobile apps above is the third, Notes above is the fourth; do not read any of these as license to add other items from this list.
- Track / song library as separate entities (assets cover this for v1)
- Collaborators directory as a standalone feature (assignees on tasks is enough)

When a feature request lands that's on this "out of scope" list — even if it's a small ask, even if a user wants it — the answer is *v2*. Do not add it to v1 to be helpful. The discipline of saying no is the product strategy.

---

## Architectural principles

These are the principles that govern v1 build decisions. When in doubt, return to these.

1. **The release is the spine.** Every feature serves a release. If you find yourself building something that doesn't tie back to a specific release, stop and ask whether it belongs in v1. **The workspace's scoped release view (`/dashboard?release=<id>`) is where the product converges** — the standalone release detail page (`/dashboard/releases/[releaseId]`) that used to hold this role was removed 2026-08-04 (founder call) and its content (Activities, Motion progress, Tailor plan, Generate status update, the one-time getting-started guide) absorbed into the workspace. The workspace is the single navigational + working surface; new features attach to the release (via a scoped-header pill, same as Metadata/Calendar/Files/Press kit), not to standalone surfaces.

2. **Templates carry domain knowledge; AI is a removable polish layer.** Hand-crafted release templates are the product's IP. AI adjusts them and writes prose around them. If AI failed tomorrow, the product would still work — users pick a template, get a plan, edit it, run their release. Build it so AI is *removable* without the product dying. (Exception under active build: **Chappi**, the conversational front door — see AI integration. It's a conscious expansion of the AI surface, but still honors this principle's spirit: Chappi degrades to a deterministic command bar + action chips when no model is configured.)

3. **Structured data over free text.** A release has a type. A task has a status, an owner, a due date, a dependency. A file has a category. Enumerate these. Don't let users type them as free strings. Structured data is what makes AI prompts contextual, status views correct, and analytics possible later.

4. **Single-tenant mental model, multi-tenant implementation.** Each user/team works in their own workspace as if alone. Database is shared with proper isolation (RLS). Do not build per-tenant deployments or environments.

5. **Boring stack.** Use what's already in the codebase. Next.js App Router, Supabase, Tailwind, Zustand, XState where appropriate. No new frameworks, no new languages, no new patterns introduced in v1 unless they're solving a documented problem the existing stack can't handle.

6. **Build for the case we have, not the case we might have.** We have 1 paying user, 1 design partner team, 1 contract in legal review. Build for them. Do not design for scale, multi-region, SSO, or enterprise features until the problem is real.

7. **Feature flags from day one.** Use a simple feature-flag mechanism (env-based, user-based, or workspace-based) so partial features can ship to yourself first, then the paying user, then design partners, then everyone. Without flags, releases stall waiting for "done."

8. **Visible state changes.** The user always knows what state their release is in, what's blocking it, what's next. No silent operations. No "did it save?" moments. Trust is built through visibility.

9. **Schema is changed only through migration files.** `supabase/migrations/` is the source of truth for schema. Never alter schema through the Supabase dashboard, never with ad-hoc SQL in production. If a migration is needed urgently, write it, commit it, then apply it. No exceptions. Migrations are the source of truth for schema.

---

## Stack and runtime

(Derived from the codebase audit. If any of this drifts from the actual code, the code is the truth — update this section.)

**Language:** TypeScript 5 (strict mode), targeting ES2017, `moduleResolution: bundler`, JSX react-jsx.

**Frontend and backend:** Next.js 16 App Router on both apps. React 19. Server Components by default; `'use client'` for stateful UI. No separate backend service — Next.js Route Handlers serve as the API layer.

**Package manager:** pnpm 10.6.4 with workspaces. Lockfile is `pnpm-lock.yaml`. Ignore stale references to npm in old docs.

**Node runtime:** Node 20+. Vercel default in prod. Pinned via root `.nvmrc` (added 2026-06-11).

**Build tooling:** Turborepo 2.3.3 orchestrates `build`, `dev`, `lint` across the workspace. Next 16 / Turbopack for bundling. Tailwind v4 (PostCSS plugin) on homepage; Tailwind v3 + autoprefixer on web. Prisma 6 generator on homepage only.

**Monorepo structure:**

```
urganize/
├── apps/
│   ├── homepage/      # Marketing + waitlist + admin growth (urganize.app)
│   └── web/           # Authenticated product app (app.urganize.app)
├── packages/
│   ├── ui/            # Shared React primitives (Button, Card, Input, etc.)
│   ├── config/        # Shared tsconfig, ESLint, Tailwind preset
│   ├── pricing/       # Single source of truth for plan tiers/prices
│   ├── lib/           # Stub placeholder
│   └── db/            # Stub placeholder
├── supabase/migrations/   # SQL migrations for the web app
├── scripts/run-turbo.cjs  # Build/dev/lint wrapper
└── turbo.json, pnpm-workspace.yaml, tsconfig.json, vercel.json
```

**Path aliases** (from root `tsconfig.json`): `@urganize/web/*`, `@urganize/homepage/*`, `@urganize/ui`, `@urganize/config/*`.

---

## Databases

Two separate databases, one per app. They do not share schema. This is a known limitation (see "Known issues" below).

**`apps/homepage`** → PostgreSQL on **Neon** via `@neondatabase/serverless`.
- ORM: **Prisma 6** for app code. The `app/api/signup` route uses raw `neon()` SQL for cold-path speed.
- Schema: `apps/homepage/prisma/schema.prisma`, migrations in `apps/homepage/prisma/migrations/`.
- Models: `User` (waitlist record only).

**`apps/web`** → PostgreSQL on **Supabase**.
- No ORM. Direct `@supabase/supabase-js` client (anon for browser, service-role for privileged server routes).
- Schema: `supabase/migrations/*.sql`.
- **RLS is enabled on every owned table.** Policies are owner-scoped (`owner_user_id = auth.uid()`).
- Shared `set_updated_at()` plpgsql trigger function across all owned tables.

**v1 tables in web (post-reconciliation):** `profiles`, `releases`, `release_metadata`, `release_events`, `release_playbook_steps`, `release_collaborators`, `release_workspaces`, `collaborators`, `tasks`, `task_groups`, `task_activity`, `task_attachments`, `task_comments`, `assets`, `activity_logs`, `workspaces`, `workspace_members`, `organizations`, `organization_members`, `subscriptions`, `payments`, `app_settings`, `notifications`, `ui_state_drafts`, `pricing_validation_responses`, `artists`, `notes`, `release_plan_drafts`. This list has drifted behind several later additions (`push_subscriptions`, `scheduled_notifications`, `task_outcomes`, `release_epks`, `release_recaps`, the curator/pitching tables) — `device_push_tokens` (2026-08-10, native push) is added here as a partial catch-up, not a claim the rest is now complete.

---

## Authentication

**`apps/web`:** Supabase Auth (email/password + Google OAuth).
- Client: `apps/web/lib/supabase/client.ts`.
- Session and profile state: Zustand store at `apps/web/lib/auth-store.ts`, persisted to localStorage.
- The auth store rebuilds a fallback `Profile` from `auth.user_metadata` when the `profiles` row is missing or RLS-blocked.
- **No Next.js `middleware.ts`** — protection happens per-route via `getAuthenticatedUser(request)` from `apps/web/app/api/releases/_shared.ts`. This reads `Authorization: Bearer <token>` and validates against the Supabase anon client.
- Server-side privileged operations use the **service-role key** via `createAdminClient(supabaseUrl)`. Only use this when bypassing RLS is required *and* the request is already authorized.

**`apps/homepage`:** No auth. ~~Lightweight shared-secret cookie auth for admin/growth views (`lib/dashboard-auth.ts`, `ADMIN_WAITLIST_TOKEN`)~~ — retired 2026-07-30 when the internal dashboards moved into the web app's `/admin` hub (see "Admin hub" in Working notes).

**User roles in web:** `artist | manager | artist-team | artist-manager | team-member | viewer`.

---

## API layer

REST-style Next.js Route Handlers at `app/api/**/route.ts`. No tRPC, no GraphQL.

**Patterns to follow:**

- **For protected routes that need the admin client**, use `requireAuthenticatedAdmin(request)` — auth + payment gate + service-role client in one call, returning `{ error }` or `{ user, supabaseUrl, adminClient }` (added 2026-07-10; 33 handlers use it). Fall back to the split calls (`requireActiveAuthenticatedUser(request)` then `createAdminClient(auth.supabaseUrl)`) ONLY when code must run between the two checks — params validation or a per-feature paywall — so the 400-before-500 error precedence is preserved (the release-detail/assets/collaborators/metadata/AI routes do this deliberately). Canonical definitions live in `apps/web/app/api/_shared/auth.ts`; `releases/_shared.ts`, `tasks-server.ts`, and `ui-drafts/_shared.ts` re-export them so domain import sites stay stable. The gate wraps `getAuthenticatedUser` and adds a `requireActiveAccount(userId, email)` check that returns **402** + `{ redirect: '/locked', reason }` when the user lacks active paid/trial access. Email allowlist short-circuits before any DB read.
- **For open routes** (auth, trial/start, payments/verify, webhooks/paystack, subscription-status, admin/*, account/delete-now, user/onboarding, pricing-validation), use `getAuthenticatedUser(request)` directly — these must work when the user is unpaid/locked.
- Each domain has a `_shared.ts` (e.g., `releases/_shared.ts`) holding table-name constants, error detection helpers, and shared logic. Auth helpers were consolidated into `app/api/_shared/auth.ts` on 2026-06-11; do not re-introduce per-domain copies.
- Errors via `NextResponse.json({ error, ... }, { status })`. Use `apps/web/lib/errors.ts` helpers where they exist.
- Long-running AI calls go through `apps/web/lib/ai/provider.ts` (retry + timeout already implemented). Do not open a parallel fetch loop per feature.

**Patterns being deprecated in v1 — do not extend:**

- The "schema-missing fallback" pattern (`buildMissingTableResponse` returning migration SQL the user must run). This was defensive coding for environments where migrations hadn't run. In v1, environments must be properly migrated. Keep the helpers for dev convenience, but do not rely on them as a production safety net, and do not add this pattern to new routes.

---

## Frontend

**Framework:** Next.js 16 App Router. React 19. Server Components by default; `'use client'` for interactive UI.

**State management (web only):**

- **Zustand** for auth, releases, tasks, activity. Stores in `apps/web/stores/` and `apps/web/lib/auth-store.ts`.
- localStorage caches for perceived speed on dashboard pages.

**Styling:**

- `apps/web`: Tailwind v3 + autoprefixer. Supports both dark and light themes via the `data-theme` attribute plus a pre-hydration inline script reading `urganize.theme`; falls back to OS `prefers-color-scheme` on first visit with nothing stored. Dark remains the default for no-JS/SSR clients. Toggle lives in Settings → Appearance (`ThemeToggle` from `@urganize/ui`).
- `apps/homepage`: Tailwind v4 via `@tailwindcss/postcss`. Custom typography via four `next/font/google` families.
- Shared Tailwind preset at `packages/config/tailwind/preset.js`.

**Component library:** In-house. Shared primitives in `packages/ui/src/`. Feature components in each app's `components/`. Icons: `lucide-react` + `react-icons`. Animations: **CSS only** — `framer-motion` was removed 2026-08-08 (its last consumer, homepage `/pricing`, used it for 13 plain fade/slide-ins the site already expresses via the `hero-fade-in`/`hero-delay-*` classes and the IntersectionObserver-based `ScrollReveal`; shipping an animation library to duplicate that was pure weight on a slow mobile link). Do not re-add it without a motion need CSS genuinely can't express. (chart.js was removed with the homepage admin retirement, 2026-07-30 — the hub's Growth chart is plain CSS bars.)

**Root `layout.tsx` in `apps/web` is a SERVER component** (it exports `metadata`; corrected 2026-07-10 — earlier revisions of this file called it a client component, which had drifted from the code). The client boundary starts at `AppShell`/`PostHogProvider`, and every page individually declares `'use client'` because they consume Zustand. Six routes (dashboard, settings, release detail, locked, onboarding, auth) have thin server `page.tsx` wrappers exporting per-page `metadata` titles, with the real page in a `*PageClient.tsx` sibling — follow that pattern when adding routes. NOTE: references to these routes' `page.tsx` files elsewhere in this document (spec sections and dated deploy logs written before 2026-07-10) now mean the `*PageClient.tsx` sibling — e.g. the LegacyDashboard revert path lives in `app/dashboard/DashboardPageClient.tsx`.

---

## External services

- **Database:** Neon (homepage), Supabase (web).
- **File storage:** Supabase Storage. Buckets: `release-assets`, `proofs`. No S3/R2.
- **Email:** Not wired up yet. Add a transactional provider (Resend or Postmark recommended) when v1 needs email notifications.
- **Payments:** Paystack, server-initiated recurring checkout (`POST /api/billing/start-checkout` → Paystack hosted page → webhook credits by `payments.reference` / `metadata.user_id`). **Three tiers** defined in `packages/pricing` (the single source of truth for both the marketing /pricing page and the in-app /locked picker): two self-serve recurring tiers — Monthly ₦150,000 / $100, Annual ₦1,500,000 / $1,000 (per year) — plus **Label, a sales-led tier** (`contactSales: true` in `packages/pricing`; no displayed price, no self-serve checkout — both surfaces render a "Contact us" mailto to `SALES_CONTACT_EMAIL` instead of a price + Subscribe/Join button, since a roster deal is scoped and quoted per label by the founders). Monthly/Annual Paystack plan codes come from env (`PAYSTACK_PLAN_{MONTHLY,ANNUAL}_{NGN,USD}`); **Label has no self-serve checkout, so its Paystack plans are intentionally not wired** (the prior "create the LABEL plans" TODO is retired — see the 2026-07-15 Label note in Working notes). Legacy: standalone Payment Page (flat ₦15,000 access SKU, `urganize.app/pay` vanity URL) credits by `customer.email` for grandfathered users; `plan: 'custom'` rows are admin-provisioned relics. The webhook at `api/webhooks/paystack` validates HMAC-SHA512.
- **Analytics:** PostHog (browser + node) in `apps/web`. Vercel Analytics in both apps. Google Analytics in homepage. Formbricks survey provider in homepage.
- **Customer support:** WhatsApp deep link to the founder (`https://wa.me/2347067367057`). With `NEXT_PUBLIC_FEATURE_CHAPPI` OFF (prod today): the floating pill in `apps/web/components/support/SupportChat.tsx` (label cycles "Chat with the founder" / "Report a bug" / "Contact support"). With the flag ON: the pill is replaced by the assistant's surfaces — the floating **ChappiDock** at bottom-right below lg, the **UrgAns side rail** (`ChappiSidePanel`) at lg+ — and the WhatsApp link lives in their footers (AI-first entry, human fallback one tap deeper). Replaced the former Tawk.to widget (2026-06-11); the `NEXT_PUBLIC_TAWK_*` env vars are retired.

---

## AI integration

**Provider routing layer:** `apps/web/lib/ai/provider.ts` — handles retry + timeout. Currently routes through a Zuplo gateway (`AI_API_BASE` + `AI_API_KEY`) to a `qwen2.5:3b` model.

**v1 change:** swap the upstream model. Keep the Zuplo gateway routing if useful, but point it at frontier models:

- **Release rollout planner:** Claude Sonnet (latest). Higher quality matters here — the call has to hold a structured-JSON delta contract against a 64-task list without inventing an id. Per-call override env: `AI_PLANNER_MODEL`.
- **AI status update generator:** Claude Haiku or equivalent (GPT-4o mini, Gemini Flash). Shorter, simpler, runs more often, lower cost per call.

**Four AI integration points now exist in v1** (was two — Chappi was added 2026-07-13 and genre prediction 2026-08-08, both conscious scope expansions; see the Chappi subsection below and the genre-prediction section further down).

1. **Release rollout planner (UrgAns planner):** Input = the hand-crafted template + a seven-question intake (release type, artist, date, what is ready, goal, naira budget, free text). The model is asked for a **delta** against a draft already built from the template — drop optional tasks, shift offsets, map role archetypes to real teammates, rewrite a few "why this matters" lines — never for a plan. It **cannot add tasks**: there is no operation for it, because a task with no template origin is the invention failure mode this file forbids and there would be nothing to validate it against. The delta is rejected wholesale if any id was not one we supplied or any dropped task was non-optional. The draft persists in `release_plan_drafts`, the manager edits it, and **approval is the only path into the `tasks` table**. With no model configured the deterministic template draft IS the plan, so the whole flow works with AI off. One call per generate, one per per-phase redraft. See "UrgAns release planner" in Working notes.

2. **Status update generator:** Input = current release state (tasks completed, blocked, upcoming; recent activity; release date). Output = one-paragraph narrative status. One API call per request, a handful per release per week.

3. **Chappi — conversational AI front door:** a multi-turn, tool-calling assistant on its own dedicated page (`/dashboard/urgans`). Answers questions about releases/tasks and takes actions on the user's behalf. Unlike the two single-shot features above, it is agentic (a tool loop), uses its own transport, and is the removable-but-present exception to the "AI chat is v2" scope line.

4. **Genre prediction from audio:** Input = an audio file the user picks on the Metadata scene. Output = a predicted genre string that prefills `release_metadata.genre`. **Not an LLM and not routed through `lib/ai/provider.ts`** — it is a plain multipart HTTP call to an external audio classifier (see the genre-prediction section below), so none of the gateway's model/env plumbing applies. Removable in the strongest sense: with the flag off the Genre field is exactly the free-text input it has always been.

**Removed in the v1 cut (2026-05):** AI chat (`api/ai/chat`), the old AI release plan generator, `services/mock-ai.ts`, `useAIStore`. NOTE: conversational AI has since returned deliberately as Chappi (below) — but freshly built on the current architecture, not the removed code.

**Architectural rule:** AI is a *layer on top of templates*, not a substitute for them. The product must work — degraded but functional — if AI is unavailable. The template alone produces a valid plan; AI just tailors it. The structured release data alone produces a valid status view; AI just narrates it.

### Chappi — conversational AI front door (added 2026-07-13)

A conscious expansion of the AI surface beyond the two single-shot features above. Chappi is a conversational assistant that answers questions AND takes actions. **Reworked 2026-07-14 (URG) to live on its own dedicated page** (`/dashboard/urgans`, reached via a topbar icon) instead of an inline hero atop `/dashboard` — a long conversation no longer pushes the releases/tasks workspace down the page; `/dashboard` shows only releases/tasks again. **Since 2026-07-15, Chappi (when enabled) is also the post-authentication LANDING surface:** every post-auth entry point (login, OAuth callback, root `/`, onboarding completion, invite accept, paywall unlock, promo redemption, post-checkout) routes through the shared `HOME_PATH` constant in `apps/web/lib/home-path.ts` — `/dashboard/urgans` when the flag is on, `/dashboard` when off (matching ChappiPageClient's own flag-off bounce, so no redirect loop). Never hardcode `/dashboard` as a post-login destination; import `HOME_PATH`. The topbar carries a Workspace/Chappi icon pair (exact-match active states) so the workspace stays one click away; its empty state is a PostHog-style centered greeting → input → quick-action buttons below. The founder deliberately moved the "AI chat / general-purpose assistant → v2" line to build this. **It is the ONE sanctioned exception to that scope line — do not treat it as license to add other out-of-scope items.**

It still honors the "AI is removable" principle: with no capable model configured, the route returns `{ mode: 'deterministic' }` and the client falls back to a keyword intent-router + action chips, so the front door is useful with AI off. This is why it could ship before the model was wired.

- **Flag:** `NEXT_PUBLIC_FEATURE_CHAPPI` (client + route gate; the API route 404s when off, the topbar icon and `/dashboard/urgans` page both bounce to `/dashboard` when off). Only renders when `NEXT_PUBLIC_FEATURE_WORKSPACE` is also on. Registered in `turbo.json`; documented in `apps/web/.env.example`.
- **Transport — the deliberate exception:** Chappi uses its OWN transport, the official **`@anthropic-ai/sdk`** (a documented exception to "boring stack / route through `provider.ts`": the Zuplo/Ollama transport structurally can't do native tool-calling). `lib/ai/provider.ts` still exclusively owns the two single-shot features. Env: `CHAPPI_MODEL` (capable Claude model), `CHAPPI_API_KEY` (separate from `AI_API_KEY`), optional `CHAPPI_API_BASE`. Capability gates on `CHAPPI_MODEL` being set to a real model, NOT the `qwen2.5:3b` placeholder.
- **Backend:** `app/api/urgans/route.ts` (renamed from `app/api/chappi/route.ts` in URG-212; POST, `maxDuration = 60`, auth via `requireAuthenticatedAdmin`) → `lib/chappi/{config,tools,dispatch,system-prompt,runner}.ts`. A tool-calling loop **capped at 5 rounds**. Conversation state is **ephemeral** (client-held; no DB table, no migration — consistent with the CUT_PLAN removal of AI tables).
- **Tools:** read (`list_releases`, `get_release`, `list_tasks`, `get_dashboard`) + mutate (`create_release`, `create_task`, `update_task`, `complete_task`, `reopen_task`, `generate_status_update`, `navigate`). **No delete tools** (deferred). Mutating tools call the existing REST endpoints via internal fetch — preserving template instantiation, assignee validation, and notifications rather than reimplementing them — EXCEPT completion, which goes through the new `TaskService.completeTaskWithCascade` (+ `reopenTask`). That method replicates the dependency-blocker gate + cascade-unlock that otherwise lived only in `useTaskStore.completeTask`, so a Chappi-driven completion can't bypass it. Every mutating tool re-validates the model's ids against live rows server-side; the system-prompt workspace snapshot is a hint, not the guard.
- **Frontend:** `app/dashboard/urgans/{page.tsx,ChappiPageClient.tsx}` (the route — auth guard + its own `CreateReleaseModal` instance, mirroring `WorkspaceView`), `components/chappi/ChappiConversation.tsx` (the conversation surface itself — empty-state quick-action cards when `messages` is empty, a scrolling transcript once it isn't; takes `variant: 'page' | 'panel'`), `stores/useChappiStore.ts`, `lib/chappi/{types,intent-router}.ts`. Chips run deterministic actions instantly (no round-trip) and are recorded as a turn either way; free-text sends the full `messages` history to the agent, falling back to the intent-router on failure or deterministic mode. The "Today's focus" chip opens the task cross-page (`router.push('/dashboard?release=...')` then `openTask(id)`, same pattern `NotificationsBell` uses) since the task detail view renders on the workspace page, not here.
- **Floating dock (2026-07-15, URG-137):** `components/chappi/ChappiDock.tsx` — a Linear-"Ask Linear"-style bottom-right panel mounted app-wide by `AppShell` (flag on → dock replaces the SupportChat pill; the WhatsApp founder link moves into the dock footer). Hosts `ChappiConversation variant="panel"`; shares the SAME global `useChappiStore` conversation as the page, so the expand control (→ `/dashboard/urgans`) carries the transcript. Open state persists via `lib/persisted-state.ts` (`urganize.chappi.dock-open`); `Ctrl/Cmd+J` toggles (listed in HelpMenu shortcuts); renders `null` on `/dashboard/urgans` itself. Z-tiers: launcher `z-50`, open panel `z-[130]` — deliberately below the modals (`z-[170]`+) Chappi can open, and NO Escape-to-close (modals own Escape). **Since 2026-08-03 (URG-210) the dock is the BELOW-lg surface only** (pill + panel carry `lg:hidden`); at lg+ the side rail below owns the assistant and `Ctrl/Cmd+J` routes to it.
- **UrgAns side rail (2026-08-03, URG-210):** `components/chappi/ChappiSidePanel.tsx` — originally the catalog-only `?chat=1` slide-in (2026-07); now a layout-flow right column mounted by `AppShell` beside `<main>` on EVERY chrome page at lg+ (content narrows, nothing is covered; renders nowhere on `/dashboard/urgans` — the page IS the chat). Open state is `useChappiStore.railOpen`, persisted at `urganize.chappi.rail-open` and hydrated by AppShell; the first assistant-page visit of a session (the login landing when the flag is on) ARMS it open once per session (sessionStorage `urganize.chappi.rail-armed`), and a user close sticks for the rest of the session. The topbar UrgAns icon toggles the rail at lg+ / navigates to the page below lg; the rail carries expand / new-conversation / close controls plus the WhatsApp founder footer. `useChatPanel.ts` and the `?chat=1` param were deleted (a URL param can't survive navigation). **Also 2026-08-03 (URG-210): the assistant's user-facing name is `UrgAns`** — every user-visible string (headers, launcher, page title, placeholders, aria-labels, API error copy, system-prompt self-reference) says UrgAns; files, components, stores, env vars (`CHAPPI_*`, `NEXT_PUBLIC_FEATURE_CHAPPI`), and storage keys deliberately keep their Chappi names (zero deployment risk). "Chappi" in code identifiers is expected; in rendered copy it's a bug. **URG-212 (2026-08-04) went one step further and renamed the URLs too:** `/dashboard/chappi` → `/dashboard/urgans` and `/api/chappi` → `/api/urgans` (the old dashboard path 308-redirects, since the flag was already live in production when this shipped — see the note below). Everything else named above (files, components, stores, env vars, storage keys) still deliberately keeps its Chappi name.
- **Status:** Phase 1 (deterministic shell) + Phase 2 (agentic backend) + the dedicated-page rework + scrolling transcript UI all built behind the flag; `pnpm lint` + `pnpm build` green. **Deferred:** delete tools + confirmation gate, cross-session persistence (conversation is still ephemeral — a reload starts fresh). **Activation (Phase 4):** set `CHAPPI_MODEL` + `CHAPPI_API_KEY` in Vercel `Web`, flip `NEXT_PUBLIC_FEATURE_CHAPPI=true` in prod, verify end-to-end with a real release. Until then the agent path is dark and the deterministic page is what users see.

---

## Deployment

**Hosting:** Vercel, two projects pointing at the same GitHub repo:

- `the-urganization` → `urganize.app` → builds `apps/homepage` (`pnpm turbo build --filter=@urganize/homepage`).
- `Web` → `app.urganize.app` → builds `apps/web` (`pnpm turbo build --filter=@urganize/web`).

Both use `npx turbo-ignore @urganize/<app>` as the Ignored Build Step.

**CI/CD:** Vercel git integration only. No GitHub Actions. No automated tests. `pnpm lint` is the only CI gate.

**Env handling:** Root `turbo.json` declares the env allowlist for build hashing. Each Vercel project owns its own env set. Local development uses `.env.local` per app. Both apps have `.env.example` files documenting every env var with required/optional markers.

**Environments:** Production = `main` on both Vercel projects. Vercel preview deployments per PR. No dedicated staging.

---

## Conventions

**TypeScript:** strict mode everywhere. Use the existing `packages/config/typescript/base.json` config.

**Linting:** `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. Two intentional overrides:
- `@typescript-eslint/no-unused-vars` honors leading-`_` for unused.
- `react-hooks/set-state-in-effect` and `react-hooks/preserve-manual-memoization` are downgraded to **warn** during React 19 migration.

**Tests:** Vitest is configured in `apps/web` for pure-logic unit tests only (`pnpm test` at the root, or `pnpm --filter @urganize/web test`; config at `apps/web/vitest.config.ts`, tests live next to their modules as `lib/*.test.ts`). Coverage is deliberately narrow — the highest-consequence billing/access logic: plan expiry math (`lib/billing.ts`), renewal advancement + Paystack plan resolution (`lib/billing-plans.ts`), the paywall allowlist, and the four-state subscription snapshot (`resolveSnapshot` in `lib/subscription-access.ts`, exported for tests) — plus one pattern guard: `lib/schema-fallback-guard.test.ts` fails if any file outside its frozen baseline starts using the deprecated schema-missing-fallback helpers (see "Patterns being deprecated in v1"). Run `pnpm test` before touching any of those modules. Components, routes, and full flows stay on manual testing for v1; broad automated coverage remains a v2 investment. Tests are not RUN by the Vercel build — a failing assertion does not block deploys (yet) — but the test files are type-checked by `next build` (tsconfig includes `**/*.ts`), so a type error in a test does fail the build.

**Naming:**

- Components: PascalCase `.tsx` (`ReleaseHeader.tsx`, `TaskDetailDrawer.tsx`).
- Hooks: camelCase, `use*` prefix.
- Stores: `use*Store` in `apps/web/stores/`.
- Route handlers: always `route.ts`. Per-domain helpers in `_shared.ts`.
- DB columns: `snake_case`. TS types for DB rows: `camelCase`. (Legacy `Db*` prefixed types were removed — they drifted from the schema and were unused.)

---

## Resolved v1 blockers

All seven blockers identified during the v1 cut have been resolved.

1. **Subscription gating implemented; the gate itself is currently OFF** (doc-drift found 2026-08-10 while building playlist pitching, not caused by it). This entry's original "globally on" heading has been wrong since **2026-07-23**: `requireActiveAccount` in `apps/web/app/api/_shared/paywall.ts` opens with `if (userId) return null;`, so every authenticated account passes and no route returns 402, and the client-side login bounce is disabled by `PAYWALL_LOGIN_BOUNCE_ENABLED = false` in `apps/web/lib/auth-store.ts`. Both carry comments explaining the founder decision (the app is free while the founders talk to prospective teams directly). All the machinery below is intact and dormant; restoring the paywall is deleting that early return and re-enabling the bounce. Surfaced here per this file's own rule about flagging doc/code conflicts rather than silently picking one. Note for whoever restores it: **curator accounts must stay free** — they never call `requireActiveAccount` today (curator routes use `requireCuratorUser`, and team routes reject curators before the paywall check), so no bypass exists or is needed, but a future refactor that routes them through the gate would lock every playlist owner out. The original description follows. Four-state access model (`unpaid | trial | paid | expired`) computed by `getSubscriptionSnapshot` in `apps/web/lib/subscription-access.ts` from `subscriptions.status`/`expires_at` + new `profiles.trial_*` / `paid_at` columns + `is_subscribed` back-compat. `requireActiveAccount(userId, email)` returns **402** + `{ redirect: '/locked', reason }` when blocked; wrapped by `requireActiveAuthenticatedUser` and applied to ~30 protected routes. Open routes (auth, payments/verify, webhook, trial/start, subscription-status, paywall-status, admin/*, account/delete-now, user/onboarding, pricing-validation) keep `getAuthenticatedUser`. 28-day no-card trial via `POST /api/trial/start`. `/locked` page with a three-plan picker (Annual / Monthly / Label radio cards from `@urganize/pricing`) + Start 28-day trial button (`apps/web/app/locked/page.tsx`). Frontend `window.fetch` monkey-patch in `apps/web/lib/access-redirect.ts` redirects same-origin 402 responses to `/locked`. 6-email allowlist at `apps/web/lib/paywall-allowlist.ts` bypasses the gate entirely (lowercased + trimmed comparison, logs `[paywall-allowlist]` on bypass). Vanity payment URL `urganize.app/pay`. The legacy `app_settings.global_paywall` toggle is no longer consulted; the snapshot fallback is now fail-CLOSED. → `f71a7c9` (initial), `02efe0b` (full gating + vanity URL, PRs #46, #47).
2. **Paystack webhook persistence added** — `charge.success` handler looks up the payment by reference, upserts `subscriptions`, and sets `profiles.is_subscribed = true`. Idempotent via upsert on `user_id`. → `6ed3125`
3. **`activity_log` / `activity_logs` deduplication completed** — v1 cut migration migrated data from `activity_log` (singular) into `activity_logs` (plural) and dropped the old table. → `d23dfea`
4. **`Db*` type drift removed** — `DbRelease`, `DbTask`, `DbFile` deleted from `lib/supabase/client.ts`. `Profile` type kept (used by analytics). → `77a29bf`
5. **`.env.example` files created for both apps** — every `process.env` var documented, grouped by category, marked required/optional. Cross-checked against `turbo.json` env allowlist. → `d34f2ef`
6. **`bfg.jar` removed** — deleted the 14 MB JAR and its `.gitignore` entry. → `e896cea`
7. **Schema reconciliation completed** — `20260525034856_schema_reconciliation.sql` applied 2026-05-25. Backfilled 20 tables into migrations, dropped 6 dead tables and 17 dead columns, tightened NOT NULL constraints on `tasks.release_id` and `task_groups.release_id`, added RLS policies across 10 tables. Database and migration files now in sync.

---

## External dependencies for full v1 activation

The product is feature-complete in code, but the two AI features (Phase 5 rollout planner, Phase 6 status update generator) need external provider setup before they can be switched on:

- **Anthropic API account** — needed for Phase 5 and Phase 6.
- **Zuplo gateway routing configuration** — currently routes to `qwen2.5:3b`, which is insufficient for structured-JSON tailoring. Needs Claude Sonnet for Phase 5 tailoring and Claude Haiku for Phase 6 status updates. The provider layer accepts a per-call model override (`AI_PLANNER_MODEL` for the planner, `AI_STATUS_MODEL` for status updates), so once the gateway serves Claude, no application code change is required to switch models. Note the planner is usable before this is done: with no capable model it returns the untailored playbook plan as the draft.
- **Estimated monthly cost at v1 scale** — 1 paying user, 2 design partners, ~12 tailorings + ~24 status updates per month: under $1/month.

---

## Known issues (acceptable for v1, address later)

These are real but not blockers:

- **Two unconnected databases** (Neon for homepage waitlist, Supabase for web). Identity unification is expensive and not v1.
- **React 19 migration is incomplete.** Two `react-hooks` lint rules downgraded to warn. Live with this in v1.
- **Tailwind v3 (web) vs v4 (homepage) mismatch.** Shared `packages/ui` styles don't fully port between apps. Acceptable for v1.
- ~~**Root `layout.tsx` in web is a client component.**~~ Stale — the root layout is a server component (it exports `metadata`); the client boundary is `AppShell`. The page CONTENT remains client-side (`'use client'` in the `*PageClient.tsx` files behind the six thin server `page.tsx` wrappers), which is the actual (acceptable) v1 compromise.
- ~~**Outdated top-level docs** (`README.md`, `PROJECT_SUMMARY.md`, `QUICKSTART.md`) reference an old single-app, npm-based, pre-Neon setup.~~ Resolved 2026-07-10: all three rewritten against the monorepo reality (pnpm + Turborepo, two apps, Neon + Supabase, Vercel two-project deploy, `pnpm test`). `DEPLOYMENT.md` is still the old single-app deploy guide — the authoritative deploy reference is the "Deploy Configuration" section of this file; update or delete DEPLOYMENT.md when convenient.
- **RLS on subscriptions and payments uses permissive `USING (true)` policies** inherited from production. This matches the prior state but is overly permissive. Audit client usage and tighten to owner-only reads + service-role writes as a follow-up.
- **Possible duplicate artists:** 6 releases across 2 users have 6 distinct `artist_id` values. Either expected at small scale, or the artist lookup-or-create flow always creates instead of looking up. Investigate when scale increases or if duplicate-artist issues surface.
- ~~**`getAuthenticatedUser` drift.**~~ Resolved 2026-06-11: consolidated into `app/api/_shared/auth.ts` (see the dead-code sweep block in Working notes). The `plans/*` and `organization/*` route groups that held inline copies were dead and deleted outright.
- ~~**Dead code from the old card-on-file trial flow.**~~ Resolved: `lib/trial-checkout.ts` and the `trial_claim` machinery were deleted in earlier cleanups. The only remaining reference is a vestigial `.neq('plan', 'trial_claim')` filter in `account/delete-now` — harmless.
- ~~**`app_settings.global_paywall` toggle row remains in DB.**~~ Resolved 2026-06-11: `POST /api/admin/paywall` and `GET /api/paywall-status` (both caller-less) were deleted along with `lib/paywall-config.ts`; migration `20260611_drop_global_paywall_setting.sql` removes the orphaned row. **Needs applying to production.**
- **Snapshot fallback is fail-CLOSED.** If `getSubscriptionSnapshot` errors out (DB down, network blip), `hasAccess` returns false → user is locked. Trade-off: a hiccup locks users instead of letting them through. Existing paying users are protected by the `is_subscribed` back-compat branch which fires before the network error path; this should be safe in practice but flag it if you see lockout reports without an obvious cause.

---

## Hand-crafted release templates

The hand-crafted templates are the heart of v1. Template infrastructure (types, loader, instantiator) and the single template are built and wired into release creation as of 2026-05-26. EP, album, and music video templates remain to be authored.

**Templates needed for v1:**

1. **Single release** — `single_v0.3`, signed off by two design partners (2026-05-26). 64 tasks across 11 weeks (8 pre-release + 3 post-release). Markdown source at `apps/web/lib/release-templates/single-v0.3.md`; encoded as TypeScript at `single.ts`. Use as the base for other templates.
2. **EP release** — extends single template with multi-track logic and lead-single staggering.
3. **Album release** — extends EP template with 2–3 staggered singles and a longer rollout.
4. **Music video release** — different shape entirely; can be standalone or attached to an audio release.

**Where templates should live in code:**

- Static TypeScript files under `apps/web/lib/release-templates/`.
- Each template exports a typed object: release type, default duration in days, list of task definitions (each with role, default offset from release date, dependency, type — task vs event milestone).
- Templates are *data*, not code logic. They should be readable and editable without touching application code.

**The AI rollout planner's job is to:**

1. Pick the right template based on release type.
2. Adjust task offsets and roles based on context (artist scale, budget, team size, compressed timeline).
3. Drop tasks that don't apply (no marketing budget → drop paid promo tasks).
4. Output a list of concrete tasks ready to insert into the `tasks` table.

The template provides the structure. The AI provides the tailoring. Never let the AI invent tasks from scratch without a template — that's the failure mode we're explicitly avoiding.

---

## v1 build sequence and current progress (as of May 2026)

v1 is built across six phases. Each phase corresponds to one of the v1 scope items, with some scope items split across multiple phases when the work is non-trivial.

**Phase 0 — Foundation cleanup.** Schema reconciliation, UI cut to remove stages-era surfaces, removing dead code from earlier product iterations. ✅ Complete.

**Phase 1 — Template-driven task generation.** Release object CRUD, hand-crafted single release template (v0.3, 64 tasks across 11 weeks), template-to-tasks instantiation function, wired into release creation flow. ✅ Complete. Three releases (For Love, Free, Hello) successfully generated 64 tasks each in production.

**Phase 2 — Core flow integrity.** Tasks with assignees (PATCH endpoint fixed, workspace-membership validation, assignee picker working), task visibility model corrected from assignee-based to workspace-based with Mine toggle, dependency UI (read-only visibility, blocker message surfacing, locked-task visual treatment, persisted auto-unlock cascade), task completion UX (row checkboxes routing through `completeTask` with blocker check, drawer Status dropdown as deep-edit path, reopen-as-toggle), drawer loading performance fix, dropdown layering and contrast fixes. ✅ Complete.

**Phase 3 — File/asset attachment.** Release-scoped file storage in Supabase Storage with signed URLs. Three sub-steps:

- **3a:** Backend API (upload-url, list, record, delete routes; asset-helpers module). ✅ Complete.
- **3b:** UI on release detail page (asset section, upload control, category groups, image thumbnails). ✅ Complete.
- **3c:** Polish (cleanup vestigial buckets, deprecate `release_metadata.artwork_url` reads, ~~delete `WorkspaceSection.tsx` dead code~~ — done 2026-06-11). Remaining items pending — non-blocking.

Constraint: Supabase Free plan caps individual uploads at 50 MB. Category size limits configured in `asset-helpers.ts` accordingly (40 MiB audio/video, 10 MiB documents, 5 MiB images).

**2026-07-22 (URG-182):** the feature is hidden behind `NEXT_PUBLIC_FEATURE_FILES`, default `false` — see "File storage flagged off" in Working notes. Everything above still describes the built feature; it's gated, not deleted.

**Phase 4 — Event milestone rendering.** Tasks with `type: 'event_milestone'` in their template metadata render differently from regular tasks: a calendar icon, a `status-info` left-border accent, and an "On <date>" label instead of the "Due ..." framing, plus an "Event" pill in the task drawer. The read path was fixed so `metadata.template.task_type` surfaces on the `Task` model (`isEventMilestone` helper). ✅ Complete.

**Phase 5 — AI rollout planner.** Rebuilt 2026-08-10 as the **UrgAns planner** (`NEXT_PUBLIC_FEATURE_RELEASE_PLANNER`, default off), superseding the original "Tailor plan" build. The original was code-complete behind `NEXT_PUBLIC_FEATURE_TAILOR_PLAN` and never activated; its POST applied model output **immediately and destructively** (hard-deleting task rows) while its own modal copy promised "your full plan stays intact until you confirm." That flag, route, modal and lib module are deleted. The columns it added (`releases.release_context`, `releases.ai_tailoring_response`) are kept and reused: the intake answers live in the first as a versioned v2 shape, the raw delta is audited in the second. Full detail in the "UrgAns release planner" Working-notes entry.

**Phase 6 — AI status update generator.** Code complete and gated behind `NEXT_PUBLIC_FEATURE_STATUS_UPDATE` feature flag (default off; the API route 404s when off). One-click button on the release detail page reads release state (task counts, in-progress / blocked / due-this-week task titles, event milestones in the next 14 days, attachment count + categories) and generates a one-paragraph manager-voice status update in a modal with a Copy button. Plain-text output (no JSON), Claude Haiku via the gateway, 20s timeout. Nothing is persisted — the text is ephemeral. Activation pending: same as Phase 5 — Anthropic API key + Zuplo gateway routed to Claude Haiku (currently `qwen2.5:3b`). The provider gained a `generatePlainTextAiOutput` path and an `AI_STATUS_MODEL` override for this. Once routing is in place, set the flag to true and verify with a real release.

All six v1 scope items are now built in code. Internal use continues throughout — the founder runs his own two artists' releases through the product, and the design partners exercise the workspace flow. The two AI features come online when the provider is activated.

---

## Notes for AI coding assistants

- **Always read this file first** before making structural decisions.
- **When in doubt about scope, ask.** Do not add features not in v1 scope to be helpful.
- **Prefer the simplest implementation that works.** Refactor when justified by real use, not anticipated use.
- **Match existing conventions exactly.** If the codebase does it a certain way, do it that way unless there's a documented reason not to.
- **If a request would violate a principle in this file, flag it before proceeding.** Don't silently comply with requests that contradict the architectural principles.
- **When you find anti-patterns documented here** (the schema-missing fallback), do not propagate them. Fix or work around them; don't extend them.
- **The "Resolved v1 blockers" section is closed.** If you discover a new v1 blocker, surface it immediately before proceeding.

---

## Working notes (update as v1 evolves)

This section is for state that changes during the v1 build. Keep it current.

**Current build phase:** All six v1 phases built in code. Phases 0–4 deployed; Phases 5 and 6 gated pending AI provider activation. Phase 3c polish non-blocking. Whole-app payment gating shipped 2026-05-28 as a meta-layer (Resolved blockers #1). Internal use runs continuously. See Phase progress above for detail.

**Workspace consolidation (complete in code 2026-06-01, pending Vercel env flip):** `apps/web` two-pane workspace at `/dashboard` (releases column ~60%, tasks panel ~40%), gated by `NEXT_PUBLIC_FEATURE_WORKSPACE`. Click a release card to scope tasks via `?release=`; clear via the ScopePill `×`. `/dashboard/releases` and `/dashboard/tasks` 308-redirect to `/dashboard` (detail at `/dashboard/releases/[releaseId]` unchanged). Sidebar collapsed to Home + Settings. LegacyDashboard preserved in `app/dashboard/page.tsx` as a one-line revert path (unset the flag → renders the old greeting/cards layout). No new data layer (reuses `useReleaseStore.loadCommandCenter`). Final step is setting `NEXT_PUBLIC_FEATURE_WORKSPACE=true` in the Vercel `Web` project's Production env — that flip is the actual ship moment. See the "Workspace consolidation deployed (2026-06-01)" block at the bottom of this file for the full DoD walkthrough.

**Workspace polish — three phases landed 2026-06-01:**
- **File storage rescued + re-homed per-release.** The `AssetSection` component + its release-scoped fetcher (`GET /api/releases/[releaseId]/assets`) and `AssetUploadControl` were already per-release (the `assets` table has a `release_id` FK; the legacy `/dashboard/tasks` page never owned files at any revision). Re-homed into the workspace via a new `components/workspace/FilesPanel.tsx` that renders inside the right column under the tasks panel: scoped → reuses AssetSection verbatim; unscoped → "Select a release to see its files." hint. FilesPanel owns its own toast state; remount via `key={scopedRelease?.id ?? 'unscoped'}` resets cleanly between scopes. **Superseded 2026-07-20 (URG-165):** files nested under Tasks read as a child of the task list, not a peer surface, so `FilesPanel.tsx` was deleted and Files got its own page, `app/dashboard/releases/[releaseId]/files/` (thin server `page.tsx` + `FilesPageClient.tsx`, the same shape as the content calendar route), reusing `AssetSection` directly. `TasksPanel`'s header now has a plain "Files" nav `Link` to that page, right next to the Calendar link, instead of a toggle that expanded an inline segment above the task buckets.
- **Bucket headers collapsible.** `TasksPanel` buckets each render a real `<button aria-expanded aria-controls>` with a `lucide ChevronDown` that rotates `-rotate-90` when collapsed. Default state (2026-06-11): every bucket closed. Per-bucket state is user-owned and persisted to localStorage (`urganize.workspace.task-buckets` via `lib/persisted-state.ts`, hydrated in a mount effect to avoid SSR mismatch); it only changes when the user toggles a header. The earlier scope-change auto-expand was removed — scoping a release updates counts but leaves bucket state alone.
- **Slim panel row variant.** `TaskRow` got a `density?: 'compact' | 'comfortable'` prop (default comfortable; release detail page keeps its existing layout). Compact: two stacked lines (checkbox + truncated title with `title=` hover, then priority dot + date + lock/milestone icon), no status badge / no assignee / no release pill, priority signal kept via `getPriorityBorderClass` left border. Spacing pass: GreetingHeader eyebrow normalized to `tracking-[0.16em]` + `mt-2` gap to match the rest of the workspace; `space-y-6` wrapper between TasksPanel and FilesPanel removed so the canonical `mt-8` section gap is the single source of spacing; FilesPanel unscoped section also given `mt-8` to match.

**What exists post-UI-cut:**
- **Pages (4 + modals):** Dashboard (greeting, release cards, due-soon tasks), Releases list, Release detail (header, task progress, task list, status update placeholder), Settings (profile, teammates via workspace members, subscription). Modals: CreateReleaseModal, TaskQuickCreateModal, TaskDetailDrawer.
- **Sidebar nav:** Dashboard, Releases, Tasks, Settings. No descriptions, no Team page.
- **API routes:** releases (CRUD, metadata, collaborators, playbook, steps, task-groups, tasks), tasks (CRUD, attachments, comments — the caller-less reorder endpoint was deleted 2026-07-10), payments/subscriptions, auth, admin, notifications, onboarding, workspace members, ui-drafts.
- **Stores:** auth, releases, tasks, activity.
- **Removed from UI:** six-stage release pipeline (StateStepper, ExecutionSection, ReadinessBar, FocusCard), command center framing, readiness scores, full-page release creation form, workspace tasks view (`/dashboard/tasks/all`), standalone team page, organization card. XState release machine (`machines/releaseMachine.ts`) deleted.
- **Release lifecycle:** now implicit — a `status` field (draft/planning/in_progress/ready/released/archived) plus task completion progress. No staged pipeline UI.
- **Workspace members:** used for task assignment; surfaced via Settings → Teammates section. Organization management removed from UI (tables remain in DB).

**Paying users:** 3 users currently carry `profiles.is_subscribed = true` in production (theurganization, bortlen4, luckydio800 — all backfilled to `paid_at = 2026-02-28`). 1 contract in legal review (₦100k/year). 1 design partner team meeting scheduled. The earlier note of "1 paying user (₦5,000/year)" was an undercount discovered during the 2026-05-28 payment-gating deploy; reconcile when convenient.

**Last template review:** Single release template v0.3 — signed off by two design partners (2026-05-26). 64 tasks across 11 weeks (8 pre-release + 3 post-release). Markdown source: `apps/web/lib/release-templates/single-v0.3.md`. The v0.1 → v0.3 jump answered the open questions from 2026-05-23 (default duration extended to 11 weeks, missing items folded in, role assignments clarified).

**Recent inbound interest (2026-05-23):** Two users independently asked about creating a release in Urganize this week. Captured contacts; following up when v1 ships.

---

**Schema reconciliation lessons (2026-05-25):**
- Op 1 cleaned application code; Op 2 reconciled schema. Sequence matters.
- 30+ instances of drift found across columns, tables, RLS policies.
- Multiple rounds of empirical verification (count queries on production) caught issues that static audit missed.
- One runtime failure during apply (RLS policies on dropped tables blocked column drops) — fixed by reordering migration. No data lost.

---

**UI cut deployed (2026-05-25):**
- 19 component/page files deleted, ~28k lines removed, ~3.5k lines added.
- Two post-deploy bugs caught and fixed: (1) release detail params unwrapping broke in client component on Next.js 16 — fixed by switching to `useParams()` hook; (2) TaskUIProvider `loadOptions` callback had `isLoadingOptions` in its dependency array, creating an unstable reference chain that caused a re-render loop in the task drawer — fixed by switching the reentrancy guard to a ref.
- No database changes. DB columns (`state`, `readiness_score`) remain; UI just stopped surfacing them.

---

**Template infrastructure deployed (2026-05-26):**
- New module at `apps/web/lib/release-templates/`: `types.ts` (`Template`, `TemplateTask`, `ReleaseContext`), `loader.ts` (release-type → Template registry; `single` populated, EP/album/music_video null), `instantiate.ts` (`Template` + release context → `tasks` rows, batch insert), `single.ts` (`single_v0.3`, 64 tasks), `single-v0.3.md` (markdown source of truth).
- Release creation flow at `app/api/releases/route.ts` POST: after the `releases` insert, calls `getTemplate(release_type)` + `instantiateTemplate({...})`. The legacy `createDefaultReleaseTasks` call (pipeline-themed defaults) was removed. The helper itself still lives in `tasks-server.ts` as dead code — separate cleanup diff.
- Failure handling: template instantiation runs inside a try/catch that logs and continues. A release can exist without tasks if instantiation fails — `TemplateNotAvailableError` for unbuilt release types, `TemplateInstantiationError` for DB / template / date issues. Recoverable beats partial rollback for v1.
- Modal change: release date is now required (HTML `required` + `canSubmit` guard + API 400 before format check). Closes the silent-no-tasks path that `missing_release_date` would have opened.
- Task assignment: every instantiated task is assigned to the release owner via `assigned_to_user_id`. Required for the dashboard query (`TaskService.getTasksForUser` filters by `.eq('assigned_to_user_id', userId)`) to surface them. Per-task reassignment happens via the task drawer. Earlier null-assignee build (Step 3b spec) caused tasks to be inserted but invisible — fixed before pushing.
- v2 carry-overs: (1) the create-release modal does not capture release type — every release is implicitly `'single'`. Once EP/album/music_video templates land, the modal needs a type picker. (2) Silent template failures only log to server console — no in-product surface yet. (3) `createDefaultReleaseTasks` dead-code removal pending.

---

**Payment gating deployed (2026-05-28):**
- See Resolved v1 blockers #1 for the full architecture and PR refs.
- Lessons / post-deploy notes:
  - Migration `20260528_payment_gating_trial_fields.sql` was applied during the Vercel build window after explicit risk acceptance — fortunate timing; the gate's snapshot query would have errored on every request otherwise.
  - 28-day no-card trial replaced the previous 3-day card-on-file flow at the same `POST /api/trial/start` path. `lib/trial-checkout.ts` and the `trial_claim` machinery in `/api/payments/verify` are now dead code (see Known issues for cleanup).
  - Schema migration backfilled `paid_at` for 3 existing subscribed users from `subscriptions.started_at`, added a BEFORE UPDATE trigger blocking PostgREST `authenticated`/`anon` from self-mutating trial/paid fields, and extended `subscriptions.plan` CHECK to allow `'access'`.
  - Email allowlist verified via `apps/web/lib/paywall-allowlist.test.ts` (vitest; ported from the original standalone 15-case runtime check when the test runner landed 2026-07-10).

---

---

## Workspace consolidation (apps/web)

> Integrated 2026-06-01. Spec source: external consolidation doc, reconciled against `REFACTOR_NOTES.md` and the current `apps/web` state. Where the spec conflicted with the existing CLAUDE.md or the code, the repo wins (see "Adaptations from the original spec" at the end of this section).

### Scope & placement

- All work is in **`apps/web`**. Don't touch `apps/homepage`.
- Stack: Next.js 16 App Router, React 19, TypeScript 5 (strict), Tailwind v3, Supabase via existing hooks/Route Handlers. Everything lives under `/dashboard/*`.
- The three pages today: `app/dashboard/page.tsx` (overview), `app/dashboard/releases/page.tsx` → `components/releases/ReleasesDashboardPage.tsx`, `app/dashboard/tasks/page.tsx`.
- Honor existing principles: boring stack, env-only feature flags, visible state, **match existing conventions exactly**, and **don't propagate the duplicate-type anti-pattern**.

### Conventions to MATCH

- Dashboard and Tasks pages use raw Tailwind on the theme tokens with zero shared primitives. Build new components the same way. **Do not** force `@urganize/ui` adoption. Reuse only:
  - `Button` from `@urganize/ui` for actions (New release / New task / Refresh) — exactly as `ReleasesDashboardPage` already does.
  - `Logo` only where `AppSidebar` already uses it.
- Task filters are URL-driven natives in `app/dashboard/tasks/page.tsx`. The existing release-scope URL param is **`release`** (`searchParams.get('release')` in that file). Reuse it for click-to-scope; do not introduce a second param.
- The `TaskFilters` interface in `lib/tasks.ts` (lines 126–131) is currently orphan. Adopt it for the workspace's filter state if convenient, but don't refactor the Tasks page's existing read pattern as part of this work.
- The Releases column refresh keeps `<Button isLoading={isRefreshing} leftIcon={<RefreshCw />}>` exactly as today. Do not create a shared RefreshButton.

### Types (canonical — import ONLY these)

- `Release` → `apps/web/types/releases.ts`.
- `Task` → `apps/web/types/tasks.ts` (`priority: TaskPriority`, `dueDate: string | null`).
- ~~**Never** import `Release` / `Task` from `apps/web/types/index.ts` or `apps/web/types/database.ts`.~~ Both orphan files were deleted 2026-06-11 — the drift hazard no longer exists.
- ~~`ExecutionRelease` is double-declared.~~ Resolved 2026-06-11: the unused alias in `types/releases.ts` was removed; `lib/execution-types.ts` holds the only (live) declaration.

### Decisions (locked)

- One screen, two panes: Releases = wide main column; Tasks = narrower side panel.
- Clicking a release scopes the Tasks panel to it (writes the `release` URL param); default (none) shows the global queue; clearing removes the param.
- All five buckets render, stacked (Overdue / Due today / Due this week / Upcoming / No due date). Use the existing bucketing functions in `lib/tasks.ts`: `getTaskSectionKey`, `groupTasksIntoSections`, `createEmptyMyTasksSections`, `getTaskSectionLabel`, `getTaskSectionDescription`.
- Compact release cards: drop cover art + the "0 collaborators" line; keep artist eyebrow, title, Draft pill, date, "X of Y done" + thin progress bar.
- Mobile (below `lg`): panes stack (releases first, tasks below), New release full width, sidebar → menu trigger, tapping a release smooth-scrolls to the Tasks panel.
- Greeting + headline stats become a slim header.
- Nav collapses to a single **Home** entry (Settings stays) — edited in the hardcoded `navItems` array in `AppSidebar.tsx`. There is no registry.
- Remove the Tasks **Release** filter (click-to-scope replaces it); keep Priority + Status.

### Feature flag & rollout (env-only — matches existing pattern)

- Add `NEXT_PUBLIC_FEATURE_WORKSPACE` (matches existing `NEXT_PUBLIC_FEATURE_TAILOR_PLAN` / `NEXT_PUBLIC_FEATURE_STATUS_UPDATE` naming).
- The swap happens inside `app/dashboard/page.tsx`: flag on → render `<WorkspaceView />`; flag off → render the existing dashboard. No route is moved.
- Local + Vercel preview env: `NEXT_PUBLIC_FEATURE_WORKSPACE=true`. Production: leave off until Phase 7.
- Add a commented entry to `apps/web/.env.example` (`# NEXT_PUBLIC_FEATURE_WORKSPACE=false`) — matches the existing flags' style.
- Optional one-line shared reader (e.g. `featureEnabled('WORKSPACE')` in a new `lib/feature-flags.ts`) to avoid triplicating the check. Propose before adding — not required.

### Architecture (apps/web)

- `app/dashboard/page.tsx` → conditionally renders `WorkspaceView` behind the flag.
- `components/workspace/`:
  - `WorkspaceView.tsx` (client) — top-level shell.
  - `GreetingHeader.tsx`. (StatChips was removed in a later polish pass — the workspace header now shows only the greeting.)
  - `ReleasesColumn.tsx`, `WorkspaceReleaseCard.tsx` (name distinct from existing `components/releases/ReleaseCard.tsx`).
  - `TasksPanel.tsx`, `ScopePill.tsx`, `TaskBucket.tsx`, `WorkspaceTaskRow.tsx` (name distinct from existing `components/tasks/TaskRow.tsx` — or reuse the existing component directly if the styling matches).
- `lib/releaseStats.ts` — pure functions (no I/O, no React).
- Task bucketing: **reuse `lib/tasks.ts`'s existing `getTaskSectionKey` / `groupTasksIntoSections`** rather than introducing a `lib/taskBuckets.ts`. This avoids the duplication anti-pattern that the rest of this file flags.
- Release scope hook: `apps/web` has no `hooks/` folder today (hooks live alongside their consumers, e.g. `useTaskUI` in `components/tasks/TaskUIProvider.tsx`). For `useReleaseScope`, either:
  - co-locate as `components/workspace/useReleaseScope.ts`, or
  - create `apps/web/hooks/` and put it there.
  Pick one and stick with it for the duration of this work; flag the choice in the PR.
- **Reuse existing Supabase data hooks/fetchers** for releases and tasks: `useReleaseStore.loadCommandCenter()` already hydrates releases + tasks + activity in one call (`/api/command-center`), and the Releases list's `fetch('/api/releases')` pattern is established. No new data layer.

### Theme tokens (defer to existing tokens)

Dark and light modes are both supported (added 2026-07-06); green brand is the established accent across both. **Use the existing token roles** in `packages/config/tailwind/preset.js` (defined as CSS vars in `apps/web/app/globals.css`). Do not introduce new CSS variables.

| Spec proposal | Map to existing Tailwind token | RGB value (from `globals.css`) |
|---|---|---|
| `--canvas` (#0c0d0f) | `bg-bg-base` | `15 15 15` |
| `--surface` (#161719) | `bg-bg-surface` | `26 26 26` |
| `--surface-2` (#1e2023) | `bg-bg-elevated` | `28 28 28` |
| `--border` (#2a2c31) | `border-stroke-default` (or `border-stroke-strong` for emphasis) | `255 255 255 / 6%` (10% strong) |
| `--fg` (#f2f3f4) | `text-content-primary` | `226 226 226` |
| `--muted` (#8c9097) | `text-content-secondary` | `128 128 128` |
| `--faint` (#6c7178) | `text-content-tertiary` | `102 102 102` |
| `--brand` (#33e0a1) | `bg-brand` / `text-brand` | `62 207 142` |
| `--brand-ink` (#06321f) | `text-content-inverse` | `9 15 11` |
| `--danger` (#f0584e) | `status-error` | `240 106 106` |
| `--warn` (#f0b04e) | `status-warning` | `240 185 92` |

ReleaseCard selected = `border-brand` + `bg-brand/8` (already available via the `brand.subtle` 8% alpha role in the preset). ~~Progress bar = 4px track in `bg-bg-elevated`, fill in `bg-brand`.~~ **Corrected 2026-08-04 (founder contrast fix, "Motion" bars): don't use `bg-bg-elevated` for a meter track** — it's a materials/layering token (card-on-page subtlety), not built for a thin bar's empty portion, and reads as nearly invisible against its surroundings in both themes (in light mode it's byte-identical to `bg-bg-surface`). Use `bg-stroke-strong` (10%-opacity theme-flipped foreground color) for the track instead — see `components/workspace/WorkspaceView.tsx`'s Motion tracker for the canonical pattern (`h-1.5 rounded-full bg-stroke-strong` track, `bg-brand` fill). Priority dot uses the existing helpers `getPriorityDotClass` / `getPriorityBorderClass` from `lib/tasks.ts` (already wired to the canonical priority union). Overdue bucket label uses `text-status-error`.

**Doc-drift flag (2026-08-04):** the table above's RGB values (`15 15 15` base, `62 207 142` brand, etc.) and this section's "green brand" framing describe the workspace-consolidation-era gray palette from June 2026 — the codebase has since moved to the full **Urganize Brand Bible (URG 001)** ink/cream/spring palette app-wide in `globals.css` (`--color-bg-base: 13 18 14`, `--color-brand: 127 217 154` in dark; forest/cream in light), with Space Grotesk/Fraunces/Space Mono fonts (not IBM Plex Sans). This was discovered mid-investigation for the Motion bar fix, not caused by it — surfacing per this file's own rule to flag doc/code conflicts rather than silently pick one. Table left as-is (historical record of that migration); anyone doing real color work should read the actual `:root` block in `apps/web/app/globals.css`, not this table's RGB column.

**Fonts:** repo uses `font-sans` (IBM Plex Sans) and `font-display` (Space Grotesk). Use `font-display` for workspace headlines / eyebrow weights; `font-sans` for body. **Do not add Archivo** unless explicitly approved — adding a font means another `next/font/google` import and a bundle hit, and the existing display font already exists everywhere.

**Eyebrows:** match the existing tone — uppercase, `tracking-[0.16em]` or `tracking-[0.18em]` (both appear in the codebase), `text-[11px]`, `text-content-tertiary`. Sentence case elsewhere; min 11px.

### Verification (no typecheck script / no test runner exist)

- Gate each phase on **`pnpm build`** (Next build type-checks) **+ `pnpm lint`**.
- Optional, ask-first: add `"typecheck": "tsc --noEmit"` to `apps/web/package.json` and a matching `turbo.json` task. Adding Vitest for the pure `lib/*` functions is a separate tooling decision — propose, get approval, don't add silently.

### Definition of done

- [ ] `app/dashboard/page.tsx` renders the two-pane workspace behind `NEXT_PUBLIC_FEATURE_WORKSPACE`.
- [ ] Clicking a release scopes Tasks via the `release` URL param; clearing restores global.
- [ ] Greeting + stat chips derive from live data (active releases, done/total, overdue, due today).
- [ ] Five buckets render via the existing `lib/tasks.ts` bucket helpers.
- [ ] Prod flag flipped; `/dashboard/releases` and `/dashboard/tasks` redirect to `/dashboard`.
- [ ] `navItems` in `AppSidebar.tsx` shows a single Home + Settings; Tasks Release filter removed; Priority + Status retained.
- [ ] Existing skeletons reused; empty states for scoped buckets and empty release list.
- [ ] Imports only canonical types; no new duplicate types; orphan/drifted type files untouched.
- [ ] `pnpm build` + `pnpm lint` pass; no new data layer.

### Adaptations from the original spec (where the repo wins)

- **Theme tokens.** Spec proposed 11 new CSS variables (`--canvas`, `--surface`, `--surface-2`, `--border`, `--fg`, `--muted`, `--faint`, `--brand`, `--brand-ink`, `--danger`, `--warn`). Repo already defines the same roles via `--color-bg-*` / `--color-text-*` / `--color-brand` / `--color-status-*` in `apps/web/app/globals.css`, exposed through `packages/config/tailwind/preset.js`. Mapping table above; do not duplicate.
- **Font.** Spec proposed Archivo via `next/font`. Repo uses IBM Plex Sans + Space Grotesk + JetBrains Mono. Reuse `font-display` (Space Grotesk) for workspace display headings — no Archivo.
- **Task bucketing module.** Spec proposed a new `lib/taskBuckets.ts`. Repo already has `getTaskSectionKey` / `groupTasksIntoSections` / `createEmptyMyTasksSections` / `getTaskSectionLabel` / `getTaskSectionDescription` in `lib/tasks.ts`. Reuse — do not duplicate.
- **Component naming collisions.** Spec proposed `components/workspace/ReleaseCard.tsx` and `components/workspace/TaskRow.tsx`. Both names already exist (`components/releases/ReleaseCard.tsx`, `components/tasks/TaskRow.tsx`). Use prefixed names (`WorkspaceReleaseCard`, `WorkspaceTaskRow`) or reuse the existing components directly.
- **Hooks folder.** Spec assumed `hooks/useReleaseScope.ts`. There is no `apps/web/hooks/` folder today; hooks live with their components. Either create the folder or co-locate.
- **Release-filter URL param.** Spec said "find its exact name" — it's `release` (in `app/dashboard/tasks/page.tsx`).
- **ExecutionRelease conflict.** Spec acknowledged the duplication and said to use the `types/releases.ts` version. Reconciled identically — and flagged for separate cleanup.

---

**Workspace consolidation deployed (2026-06-01):**
- Two-pane workspace at `/dashboard` (releases column ~60%, tasks panel ~40%) behind `NEXT_PUBLIC_FEATURE_WORKSPACE`. Below `lg`, panes stack (releases first); clicking a release smooth-scrolls to the tasks panel.
- `app/dashboard/page.tsx` is now a dispatcher: `WORKSPACE_ENABLED ? <WorkspaceView /> : <LegacyDashboard />`. The legacy body was extracted into a sibling function to keep hook-rules clean under the conditional. Flag off in any environment reverts to the legacy layout — no code change required to roll back.
- `/dashboard/releases` and `/dashboard/tasks` were replaced with `permanentRedirect('/dashboard')` server components (HTTP 308). Detail at `/dashboard/releases/[releaseId]` is unaffected. `AppTopbar` `routeTitles` lost its dead `/dashboard/tasks` entry; the `/dashboard` title was renamed `Home / Workspace` to match the sidebar.
- `AppSidebar` `navItems` collapsed from 4 entries to 2 (`Home` + `Settings`). `Home` matches all of `/dashboard/*` so the release detail page still highlights the rail.
- Tasks UI: Release filter removed (click-to-scope on a release card writes the same `?release=` URL param the legacy filter used, so the `useReleaseScope` hook and what would have been the dropdown remain one piece of state). Priority + Status URL filters retained.
- A11y pass: `WorkspaceReleaseCard` is a real `<button>` with `aria-pressed` + brand focus-visible ring; `ScopePill` close button announces "Show all tasks"; `TaskCompletionCheckbox` now takes an optional `taskTitle` so its `aria-label` reads `Mark "<title>" complete`; an `aria-live="polite"` `role="status"` region in `WorkspaceView` announces "Showing tasks for X" / "Showing all tasks" on scope changes.
- Deletions (grep-confirmed zero remaining importers): `components/releases/ReleasesDashboardPage.tsx`, `components/releases/ReleaseCard.tsx` (original, distinct from `WorkspaceReleaseCard`), `components/releases/NextStepCard.tsx` (already orphan), and the temporary `app/dashboard/preview/` route.
- Reuse summary: workspace data flow uses `useReleaseStore.loadCommandCenter` (existing, single fetch hydrates releases + tasks + activity), `lib/tasks.ts` bucket helpers (`groupTasksIntoSections`, `getTaskSectionLabel`), `TaskRow` (as-is, no wrapper), `EmptyState`, `SkeletonBlock`, `Button` from `@urganize/ui` (Refresh + create CTA), `CreateReleaseModal`. New code is presentational only: `WorkspaceView`, `GreetingHeader`, `ReleasesColumn`, `TasksPanel`, `ScopePill`, `WorkspaceReleaseCard`, `useReleaseScope`. (Earlier polish passes also added `StatChips` + `computeWorkspaceStats` for a header stats strip; both were removed in a follow-up pass and are no longer in the codebase.)
- DoD status: 8/9 met in code. The "prod flag flipped" item requires a manual `NEXT_PUBLIC_FEATURE_WORKSPACE=true` in Vercel → `Web` project → Production env. Until that flip, prod `/dashboard` still renders LegacyDashboard; the redirects fire regardless.

PR refs: commits `e2b868c` (scaffold), `91dd619` (workspace land + redirects + cleanup), plus any final-polish commit.

---

## Workspace-scoped artists (2026-06-02)

The artist data model is changing from "owner-scoped, free-text duplicates everywhere" to "workspace-scoped, `artists.name` source of truth, `releases.artist_name` write-through cache." Two migrations + two code phases ship under the existing `NEXT_PUBLIC_FEATURE_WORKSPACE` flag; a follow-up cleanup migration drops the retired column once the four legacy readers are retired.

**The model after this work:**

- **`artists.workspace_id`** is the canonical scope. A workspace has 0 or 1 artist (soft limit — the schema does not enforce 1; lifting to many is a UI change, not a schema change). Unique index after Migration 2 is partial `(workspace_id, slug) WHERE workspace_id IS NOT NULL`.
- **`artists.name`** is the source of truth for the artist's display label. Writes go through `lib/artists-server.ts:renameWorkspaceArtist`, which also derives `artists.slug`, propagates to `releases.artist_name` for every release pointing at the artist, and propagates to `release_metadata.primary_artist_name` for the same release rows.
- **`releases.artist_name`** is a write-through read-cache. UI surfaces (workspace card, scope pill, task drawer, release detail header) keep reading it because it is denormalized on the release row and avoids the join. Never mutate it directly — it gets clobbered on the next rename. Mutate through `artist_id`.
- **`artists.owner_user_id`** is retained for the destruction model (`ON DELETE CASCADE` to `auth.users`), the existing RLS pattern, and three lookup paths in `app/api/releases/route.ts`. A follow-up will repoint those at `workspace_id` and drop `owner_user_id`.
- **`profiles.artist_name`** is retired as an artist source. The legacy "Artist profile" editor in Settings writes to it but no longer feeds any new code path. **The column still has four live readers** (`components/support/SupportChat.tsx`, `app/api/admin/pricing-validation/route.ts`, `components/onboarding/useOnboardingWizard.ts` (the `firstName` derivation), plus the read-gate at `lib/auth-store.ts:454`). The column drop is staged in `supabase/migrations/99999999_artists_workspace_cleanup_DO_NOT_APPLY_YET.sql` and gated on those four readers being removed first.
- **One-artist-per-workspace is UI-only.** The schema permits multiple artists per workspace (partial unique index allows many rows with NULL `workspace_id`; nothing prevents multiple non-NULL `workspace_id` rows with distinct slugs). Adding an "add another artist" affordance and listing UI lifts the limit without a migration.

**Implicit-artist release create:** Behind the flag, `CreateReleaseModal` does not collect any artist input. `POST /api/releases` resolves the workspace (`ensureOwnedWorkspace`), looks up `getWorkspaceArtist(workspace.id)`, and uses that artist's id + name. If no workspace artist exists yet, the legacy lookup-or-create branch still fires but scopes the new artist row to the workspace via `workspace_id`. The implicit path is the new normal; the lookup-or-create branch is the recovery seam for first-release-in-new-workspace.

**Settings → Workspace artist:** Behind the flag, a new section in `app/settings/page.tsx` reads the current workspace artist via `GET /api/workspace/artist` and renames it via `PATCH /api/workspace/artist`. The legacy "Artist profile" section that writes `profiles.artist_name` (gated on `user.role === 'artist'`) is intentionally left in place so the column has a writer until its four readers retire. Removing it is part of the cleanup migration's precondition list.

**Migrations:**

1. `20260602_artists_add_workspace_id.sql` — additive nullable column + FK + index; backfilled deterministically via `artists.owner_user_id = workspaces.owner_id`. Reversible.
2. `20260602010000_releases_link_artists_swap_unique.sql` — resolver-or-create for any null `releases.artist_id`; tightens `releases.artist_id` to NOT NULL; swaps artists unique index from `(owner_user_id, slug)` to partial `(workspace_id, slug) WHERE workspace_id IS NOT NULL`. Down-migration reverses the schema; cannot un-create resolver-inserted artist rows (no-op in production at apply time).
3. `99999999_artists_workspace_cleanup_DO_NOT_APPLY_YET.sql` — drops `profiles.artist_name`. **Rename to a current timestamp and apply only after** (a) the four `profiles.artist_name` readers above are retired in code, (b) the Phase 0 JSON snapshot is archived because the drop is one-way for the 28 profiles holding values today.

**Canonical types:** `Release` (`types/releases.ts`) gained `artistId: string`. `ReleaseOption` (`lib/release-helpers.ts`) gained `artistId: string`. Both fields tolerate empty-string sentinels in the in-flight pre-Migration-2 state. No new duplicate Release types were introduced; the orphan `types/index.ts` Release is still untouched and still drift-prone — flag for separate cleanup, not part of this work.

---

## Dead-code sweep + auth consolidation (2026-06-11)

A meticulous cleanup pass executing the debt this file had already flagged. Every deletion was verified caller-less/importer-less by grep before removal; gated on `pnpm build` + `pnpm lint`.

**Deleted (zero importers/callers, confirmed):**

- `app/api/plans/**` — legacy route group from the removed AI plan generator. Not in the post-UI-cut route inventory; zero frontend callers; its `ensureReleaseOwnership` even queried a nonexistent `releases.user_id` column (latent bug confirming it never ran).
- `app/api/organization/**` — organization management was removed from the UI in the v1 cut; zero callers remained. Tables stay in DB (workspace member mapping in `tasks-server.ts` still reads them directly).
- `app/api/admin/paywall/route.ts`, `app/api/paywall-status/route.ts`, `lib/paywall-config.ts` — the gate stopped reading `global_paywall`; both endpoints were caller-less. Companion migration `20260611_drop_global_paywall_setting.sql` deletes the orphaned row (**apply to production**).
- `components/billing/PaywallGate.tsx`, `hooks/usePaywall.ts` — orphaned pre-gating paywall UI (live code uses the 402 + `/locked` redirect path).
- `components/dashboard/workspace/WorkspaceSection.tsx` — the Phase 3c item.
- `components/dashboard/VirtualizedPlanList.tsx`, `components/billing/TrialStatusBanner.tsx` — orphans from the plans/trial-banner era.
- `types/index.ts`, `types/database.ts` — the documented orphan/drifted type files.
- The unused `ExecutionRelease` alias in `types/releases.ts`.
- Empty dirs removed with their contents: `components/dashboard/`, `components/billing/`, `hooks/`.

**Auth consolidation (the flagged refactor):** canonical `getAuthenticatedUser` / `requireActiveAuthenticatedUser` / `createAdminClient` now live in `app/api/_shared/auth.ts` (best-variant semantics: trimmed env reads, detailed 401 messages, static `requireActiveAccount` import). `releases/_shared.ts`, `lib/tasks-server.ts`, `ui-drafts/_shared.ts` re-export all three (plus `requireAuthenticatedAdmin` since 2026-07-10); `pricing-validation/_shared.ts` re-exports only `getAuthenticatedUser` + `createAdminClient` (open route group). Route files were not touched — re-exports keep every import site stable. Do not re-introduce per-domain copies.

**Also:** root `.nvmrc` pinning Node 20.

---

## Marketing site truth + funnel pass (2026-06-11, apps/homepage)

A design/marketing review found the homepage misrepresenting the product and gating a live, paying product behind a waitlist. The fixes, in order of importance:

- **Funnel unified.** Every marketing CTA now goes to `app.urganize.app/auth` ("Start free for 28 days · no card required"). The waitlist modal/button were deleted; `POST /api/signup` remains (admin growth dashboard still reads the waitlist table) but has no UI caller. If a pre-launch waitlist is ever needed again, build it as a new surface — do not resurrect the old gate on the homepage. **REVERSED (2026-07-15, URG-125 + URG-136):** visitors weren't converting to sign-ups from the site alone, so every marketing-page CTA is a waitlist again — an inline progressive "Join now" capture (`app/components/landing/WaitlistForm.tsx`, a NEW surface per the rule above) posting to the same `POST /api/signup` pipeline, trial labels removed. Coverage: landing hero + final section render the form directly; /features' final CTA renders it; /pricing's three tier cards anchor to an on-page `#waitlist` form section (the old direct-subscribe href `app.urganize.app/locked` is noted in a comment there for if the funnel ever reopens). The ONE remaining direct path is the header's Login / Start free links (→ `app.urganize.app/auth`) — deliberate: determined visitors and existing teams can still get in, and the 28-day trial still exists for them (the /pricing FAQ answers it truthfully; /terms still describes it). The trial is no longer *advertised* as a CTA anywhere on the marketing site.
- **Stale product imagery removed.** The old dashboard/playbook screenshots showed retired UI (Notes/Pre-save/Folders sidebar, readiness scores, credits machinery). Replaced with `TemplatePlanSection` — real rows quoted verbatim from `apps/web/lib/release-templates/single.ts`. **Rule: marketing screenshots must show the current app; when no current screenshot exists, render real product data as type instead.** The share/OG image is the branded card at `apps/homepage/public/opengraph-image.png`, wired explicitly via `openGraph.images` / `twitter.images` in `lib/seo.ts:buildPageMetadata` (see URG-118 note below). The "do not re-add `openGraph.images`" caution here was specifically about pointing the card at **stale product UI** — that still holds: the card must never show retired screenshots. Pointing it at the branded card is fine and now required.
- **/features rewritten** as a server component around actual v1 scope (template plans, tasks+dependencies, files, milestones, visibility + the "what we don't do" grid). The old page sold an adaptive AI-guidance product that was never built — the exact failure mode the "AI is a removable polish layer" principle forbids. The pricing-page honesty rule ("we don't advertise what isn't built") now applies to all marketing copy.
- **One nav, one footer.** `app/components/marketing/MarketingHeader.tsx` + `MarketingFooter.tsx` are used by home, features, pricing, team, and press. No more per-page pill navs or divergent footers. New marketing pages must use these.
- **Orphan purge + asset hygiene.** 14 dead components (waitlist, Mockups, FAQ, FounderPOV, FoundingCouncil, old landing cards) and ~11.4 MB of unused/stale images deleted (`public/images` now holds only the wordmarks + anchor-partner logo). Metadata/keywords swept of cut features ("versioned asset storage", "pipeline … demo to drop", "music credits").
- **Label tier added (2026-06-11):** ₦750,000/yr / $1,250/yr roster plan (`plan: 'label'`) replaced the contact-sales "Custom" tier across `packages/pricing`, the marketing /pricing page, the in-app /locked picker, and the billing pipeline (`billing-plans.ts`, `billing.ts`, start-checkout). Benefits are founder-delivered service commitments (roster onboarding, template tailoring, priority support) — do not market self-serve multi-artist UI until the one-artist-per-workspace UI limit is actually lifted (schema already permits it; see Artists section). **Superseded 2026-07-15 — see the Label contact-sales note below.**
- **Label → contact-sales (2026-07-15, reverses the 2026-06-11 fixed-price move):** After the 2026-07-15 Monthly retier pushed Annual to ₦1,500,000 (above Label's ₦800,000 in NGN), Label was switched back to a sales-led tier — `contactSales: true` in `packages/pricing`, so both the marketing /pricing card and the in-app /locked picker show **"Contact us"** (no price, no monthly-equivalent) with a mailto to `SALES_CONTACT_EMAIL` (`contact@urganize.app`) instead of a price + Subscribe/Join CTA. `/locked`'s `handleSubscribe` also early-returns for any `contactSales` plan (defense-in-depth: never POST it to start-checkout). This resolves the NGN ladder inversion (there's no Label number to compare) and matches reality (Label self-serve checkout was never wired). The label `prices` are retained in `packages/pricing` for renewal math on any legacy sub but are not displayed. **The prior "create the two Label Paystack plans" TODO is retired** — a label deal is set up per roster by the founders, not self-served. (This is the ONE sales-led tier; Monthly/Annual remain self-serve.)
- **Reprice (2026-07-14):** Monthly ₦15,000→₦17,000 / $25→$26, Annual ₦150,000→₦170,000 / $250→$260, Label ₦750,000→₦800,000 (USD leg held flat at $1,250). Annual's "2 months free vs monthly" ratio held exactly through the reprice in both currencies; Label is no longer a clean multiple of Annual (was exactly 5×, now ~4.7× NGN / ~4.8× USD). **Confirmed via a live billing audit (2026-07-15) that the operational follow-up below was never done** — superseded by the reprice immediately following.
- **Reprice (2026-07-15, full Monthly retier):** Monthly ₦17,000→₦150,000 / $26→$100, Annual ₦170,000→₦1,500,000 / $260→$1,000 (10× monthly — the exact "2 months free" ratio the pre-07-14 tier had, applied to the new base). This is the display/code half of finally closing the 07-14 gap noted above. **Operational step DONE for NGN (2026-07-20, URG-162):** two new Live Paystack Plan objects created — "Urganize Monthly NGN (2026)" `PLN_fcwtgnjs90ca71n` (₦150,000/mo) and "Urganize Annual NGN (2026)" `PLN_qmec1u8urppfu35` (₦1,500,000/yr) — and `PAYSTACK_PLAN_MONTHLY_NGN` / `PAYSTACK_PLAN_ANNUAL_NGN` repointed in Vercel (`urganize` project, Production+Preview) with a production redeploy verified Ready. Old Plan objects left untouched (any subscriber bound to one keeps renewing at their original rate; the reprice-time audit found zero real Monthly-tier subscribers anyway). **USD half is BLOCKED at the account level: the Paystack account only offers NGN in plan creation** (this also explains the mislabeled legacy "PAYSTACK_PLAN_LABEL_USD" plan, which is actually ₦750,000 NGN — a previous attempt hit the same wall). There are no `PAYSTACK_PLAN_*_USD` env vars in Vercel at all, so USD checkout 500s with "plan not configured" — true before and after this change. To enable USD billing: ask Paystack support to enable USD/international payments, then create the 2 USD plans ($100/mo, $1,000/yr) and add the two env vars. A live audit at reprice time found **zero real Monthly-tier subscribers** in `subscriptions` (the only 3 rows present are dead `trial_claim`-era artifacts from the retired card-on-file trial flow — `amount: 0`, no `paystack_subscription_code`, `expires_at` lapsed since March — kept "paid" only by the `profiles.is_subscribed` back-compat branch in `resolveSnapshot`, unrelated to real billing), so no grandfathering policy was needed. ~~Known, accepted state: Annual now exceeds Label in Naira~~ **Resolved 2026-07-15: Label was switched to a "Contact us" sales-led tier (see the Label contact-sales note above), so there's no Label price to invert against — the ladder inversion is moot.**
- **Follow-up status:** Real workspace screenshots landed 2026-06-11 (staged by the founder; `public/images/product/workspace-releases.png` + `workspace-tasks.png`, shown in `WorkspaceShotSection` and inside `TemplatePlanSection`) — retake them whenever the UI meaningfully changes. Testimonial now credits Adenaiye Miracle (Artist Manager) with permission; the quote is her verbatim words — never publish words she hasn't approved.

---

## Social share image fix — URG-118 (2026-07-13)

Sharing any urganize.app URL on X (and other social crawlers) showed no preview card. Two root causes:

1. **Nested pages had no share image at all.** The homepage got its image from the `app/opengraph-image.png` file convention, but that image is **not inherited by nested route segments** — every page built by `lib/seo.ts:buildPageMetadata` (`/features`, `/pricing`, `/team`, `/press`, `/changelog`, `/privacy`, `/terms`, `/subprocessors`) rendered only `twitter:card` with no `og:image` / `twitter:image`.
2. **The file-convention image URL resolved against the runtime host.** In production that host was an SSO-gated `*.vercel.app` preview URL (the apex was answering from a branch preview, not the pinned production deploy), so the image 302'd to `vercel.com/sso-api` — crawlers hit a login wall and rendered no card.

**Fix (code):** moved the branded card to `apps/homepage/public/opengraph-image.png` (stable public asset, no per-deploy hash) and wired it **explicitly** via `openGraph.images` + `twitter.images` in `buildPageMetadata`, using the absolute canonical URL `https://urganize.app/opengraph-image.png`. Every page now emits a single canonical `og:image` + `twitter:image` that never depends on host resolution. The old `app/opengraph-image.png` file convention was removed to avoid a duplicate/conflicting tag on the homepage.

**Still needs doing (infra, not code):** pin the `urganize.app` apex to the **production** deployment in Vercel (`the-urganization` project → Domains). Until then the apex may answer from a preview deploy. Also: `www.urganize.app` currently 308-redirects to the bare apex — the reverse of the "bare → www" note in the Deploy Configuration section; reconcile that doc when convenient.

After deploy, re-scrape the URL in the X Card Validator / relevant debuggers to bust their caches — social platforms cache the old (broken) result aggressively.

---

## Workspace logo as fallback cover art (2026-06-11)

A workspace-level record label / team logo that automatically stands in as cover art for any release — old or new — that has no artwork of its own. **Read-time fallback only:** nothing is written to release rows, so uploading real cover art takes over instantly and removing the logo falls back to the neutral placeholder.

- **Schema:** `workspaces.logo_storage_path` + `logo_file_name` via `20260611010000_workspaces_add_logo.sql`. **Needs applying to production.** Bytes live in the existing private `release-assets` bucket under `workspace/<workspace_id>/logo/...` — release asset paths always start with a release UUID, so the prefix can't collide.
- **API:** `GET/PUT/DELETE /api/workspace/logo` + `POST /api/workspace/logo/upload-url`. Same three-step signed-URL upload flow as release assets; gated by `NEXT_PUBLIC_FEATURE_WORKSPACE` (404 when off); scoped to the caller's owned workspace via `ensureOwnedWorkspace`. PUT verifies the upload landed under the workspace's path prefix before pointing at it and removes the previous logo object after a successful swap; DELETE is idempotent. Logo shares cover art's constraints (JPEG/PNG/WebP, 5 MiB).
- **Fallback resolution:** `lib/workspace-logo.ts:loadWorkspaceLogoFallbackUrl` — never throws; returns null when the flag is off, no logo is set, or the migration isn't applied. Wired as the last leg of `resolveCoverArtUrl` in `/api/releases` (selector payload and POST response — the default list view was removed 2026-07-10) and into `ReleaseService.getReleasesForUser` (command-center → workspace release cards). No component changes — `WorkspaceReleaseCard` receives the logo URL as `coverArtUrl`.
- **Settings UI:** "Workspace logo" section directly under "Workspace artist" (flag-gated): preview via `next/image`, upload/replace through the three-step flow, remove.

---

## File storage flagged off (2026-07-22, URG-182)

Linear issue URG-182 asked to "remove file storage feature from the app." No feature flag existed for Phase 3 — it had shipped always-on. Given production already holds real files for real releases, the founder confirmed a flag-based turn-off over a full rip-out: reversible, no data touched. Added `NEXT_PUBLIC_FEATURE_FILES`, default `false`.

- **Gated:** the release detail page's inline `AssetSection`, the standalone `/dashboard/releases/[releaseId]/files` page (bounces back to the release page when off, mirroring the content-calendar precedent), the workspace `TasksPanel` "Files" link, and all three assets API routes (`GET`/`POST /api/releases/[releaseId]/assets`, `POST .../assets/upload-url`, `DELETE .../assets/[assetId]`) — each 404s when off (tailor-plan precedent).
- **Not touched:** the `assets` DB table, the `release-assets` Supabase Storage bucket, and existing rows/objects for releases that already have files. Workspace logo upload (`lib/workspace-logo.ts`, gated separately by `NEXT_PUBLIC_FEATURE_WORKSPACE`) and task attachments (own `TASK_ATTACHMENTS_BUCKET`) are distinct features that happen to share code/bucket context and were left alone. Storage cleanup on release deletion and account deletion (`app/api/releases/[releaseId]/route.ts`, `app/api/account/delete-now/route.ts`) also left alone — it cleans up whatever's actually in storage regardless of this flag.
- Re-enabling is a one-line env change (`NEXT_PUBLIC_FEATURE_FILES=true`); no migration either direction.
- Ledger: v0.16.4.

---

## EPK generator (2026-07-30, URG-196)

The third sanctioned v1 scope expansion (see the 2026-07-30 note in "v1 scope"). **Live as of 2026-07-31** — `NEXT_PUBLIC_FEATURE_EPK` flipped to `true` in production, migration applied, ledger entry + version bump done (v0.35.0).

- **Schema:** `release_epks` via `20260730100000_release_epks.sql` — one row per release (`release_id` unique), `share_token` (18 random bytes, base64url, unguessable), owner-scoped RLS. The row is the share grant, not the kit: no EPK content is stored. **Needs applying to production before the flag flips.**
- **API:** `GET/POST/DELETE /api/releases/[releaseId]/epk` (`_shared.ts` mirrors the content-calendar route group: flag 404 first, `requireActiveAuthenticatedUser`, local `ensureReleaseOwnership` that avoids the deprecated schema-fallback helpers). POST is idempotent (returns the existing kit; a 23505 race falls back to the winner's row); DELETE revokes idempotently. Regenerate = revoke + generate (new token, old link dies).
- **Public page:** `/epk/[token]` — server component, `force-dynamic`, no auth (the token is the access control; `robots: noindex`). `lib/epk-server.ts:loadPublicEpk` resolves the token with the service-role client and assembles the kit live: release row + `release_metadata` + cover art (same precedence as `/api/releases`' `resolveCoverArtUrl`: asset → legacy `artwork_url` → workspace logo) + up to 8 newest `promo_image` assets via fresh signed URLs. Returns null → 404 on anything (flag off, bad token, infra blip) — the page never 500s and never distinguishes "revoked" from "never existed". Plain `<img>` tags on purpose: signed URLs expire, so `next/image` proxying/caching would break them. Dark-locked URG.001 palette (hard-coded, not theme tokens): a press artifact renders identically for every recipient. `/epk/` added to AppShell's `isPublicStandaloneRoute` so no app chrome/dock floats over it.
- **Owner UI (settled after three reworks, all founder calls):** a PostHog-style collapsible LEFT side menu (`ReleaseSideNav.tsx`) was tried and then **removed entirely in URG-200** — the founder found it added a click for no real benefit over a plain back link. Discovery is now direct: the release detail page's header carries a "Press kit" button straight next to Content calendar / Files (`ReleaseDetailPageClient.tsx`), and the workspace's `TasksPanel` carries the same link for a scoped release (URG-198 — one click from the dashboard, no need to open the release first). The press kit itself lives at **`/dashboard/releases/[releaseId]/epk`** (thin server `page.tsx` + `EpkPageClient.tsx`, a plain "Back to release" link, no side menu) hosting `EpkSection` — generate / copy / view / revoke the link; share URL built client-side from `window.location.origin`.
- **Brand island:** the public page's colors live in the dark-locked `.epk-island` class in `globals.css` (`--epk-*` vars; the `cc-island` single-source pattern, minus the light override — a press artifact renders identically for every recipient).

---

## MCP read/write access (2026-07-31, URG-183)

An MCP endpoint at **`POST /api/mcp`** exposes Chappi's existing tool surface to an external MCP client (Claude Code / Claude Desktop), so the founder can read and mutate releases/tasks from outside the app. **Not a scope expansion:** it's a second access path to the already-sanctioned Chappi tool registry, not a new feature — no new tools, no new business logic. Internal-only → no ledger entry/version bump (Versioning rules).

- **Founder-only, env-bound.** `MCP_ACCESS_KEY` (bearer secret) + `MCP_USER_ID` (the `auth.users` id every call acts as). Presence of BOTH is the feature switch — unset → the route 404s (dark, mirroring the flag-off 404s). Deliberately no `NEXT_PUBLIC_FEATURE_MCP`: nothing reaches the client bundle, and a separate flag would only create a half-configured state. Server-only runtime vars, so no `turbo.json` entry (same as `CRON_SECRET`/`CHAPPI_API_KEY`). No per-user keys, no DB table, no Settings UI, no OAuth — claude.ai web connectors (OAuth 2.1 + DCR) are a separate future issue.
- **Transport hand-rolled, no new dependency.** `lib/mcp/protocol.ts` is a pure JSON-RPC layer (~200 lines) covering the five methods a stateless server needs: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`. `@modelcontextprotocol/sdk`/`mcp-handler` would have added a dependency, the repo's first catch-all route segment, and session machinery for that small a surface — the same call the admin hub's Growth chart made against chart.js. Stateless is load-bearing: **never emit `Mcp-Session-Id`** (issuing one commits us to session semantics), GET/DELETE are 405, responses are plain JSON (no SSE). Batch arrays are rejected (-32600). **A failed tool is a successful call with `isError: true`** — JSON-RPC errors are reserved for protocol problems, so the model can see failures instead of the transport eating them.
- **Tools = `CHAPPI_TOOLS` minus `navigate`** (`lib/mcp/tools.ts`), so 10: the four reads plus create_release, create_task, update_task, complete_task, reopen_task, generate_status_update. `navigate` is excluded because it returns a `clientAction` for a React router that doesn't exist off-browser; `clientAction` is dropped from every MCP result for the same reason. `lib/chappi/**` is imported, never edited — the two surfaces can't drift. Read the schema off the registry's camelCase `inputSchema`, NOT via `getChappiToolSchemas()` (which renames to Anthropic's `input_schema`).
- **The internal-actor auth branch** is the one non-obvious piece. Four mutating tools work by internal fetch to our own REST routes (preserving template instantiation / assignee validation / notifications — see the `lib/chappi/tools.ts` header), and those routes validate a Supabase JWT an MCP client doesn't have. So `app/api/_shared/auth.ts` gained `requireActiveAuthenticatedUserOrInternal` + `requireAuthenticatedAdminOrInternal`: a request whose bearer timing-safe-equals `MCP_ACCESS_KEY` resolves to `MCP_USER_ID` via `auth.admin.getUserById`, then still passes the paywall gate (parity with the UI). **There is no acting-user header on purpose** — the binding is env-side, so a leaked key can only ever act as that one account. **Exactly four routes opt in** (`POST /api/releases`, `POST /api/tasks`, `PATCH /api/tasks/[id]`, `POST /api/releases/[releaseId]/generate-status`); every other route keeps the plain helpers and rejects the key with a normal 401. Do not broaden this to new routes without a reason as concrete as the internal-fetch constraint.
- **Also:** `apps/web/vitest.config.ts` gained the `@/*` path alias so lib modules under test can import across directories the way the app does.
- **Activation:** set both env vars in Vercel `Web` production, then `claude mcp add --transport http urganize https://app.urganize.app/api/mcp --header "Authorization: Bearer <key>"`.

---

## Admin hub (2026-07-30)

All internal dashboards are reachable from one place: **`/admin`** in `apps/web` (founder request). `app/admin/layout.tsx` owns the page frame and mounts `components/admin/AdminNav.tsx` (left menu, the ReleaseSideNav visual pattern) for every `/admin/*` page. Sections: Overview (`/admin`, was a bare redirect to /dashboard), Onboarding (URG-195), Broadcast, **Pricing validation** (`/admin/pricing-validation` — first-ever UI for the pre-existing `/api/admin/pricing-validation` endpoint), **Waitlist** (`/admin/waitlist`), **Growth** (`/admin/growth`), **Interviews** (`/admin/interviews`, booked artist-interview slots from the marketing site's booking form). Internal-only → no ledger entry/version bump (Versioning rules).

- **Waitlist + Growth + Interviews are PORTS from apps/homepage**, re-gated behind the normal account login via `verifyAdmin`/`ADMIN_EMAILS` instead of the homepage's shared-secret cookie. They read the marketing site's **Neon** database directly: `@neondatabase/serverless` added to `apps/web`, `getNeonClient()` in `app/api/admin/_shared.ts`, backed by `GET /api/admin/{waitlist,growth,interviews}`. **Requires `DATABASE_URL` (the homepage's Neon connection string) set on the Vercel `Web` project** — unset, only those pages error. Growth's chart is plain CSS bars, deliberately NOT chart.js (boring stack).
- **Homepage originals RETIRED (2026-07-30, founder sign-off):** `app/admin/`, `app/dashboard/` (login + protected growth/interviews), `app/components/dashboard/`, `lib/dashboard-auth.ts`, and the chart.js dependency were deleted from `apps/homepage`; `ADMIN_WAITLIST_TOKEN` is dead (removed from turbo.json's allowlist; delete it from Vercel when convenient). The PUBLIC interview booking form (`/interview` + `POST /api/interview`) stays on the homepage — only the internal views moved. Rebuild from git history if ever needed.
- **Gate pattern:** unchanged — each page's backing GET is the access check (bounce to /dashboard on 401/403); the landing page uses the new lightweight `GET /api/admin/me`. The old per-page "Back" buttons were removed (the hub menu replaces them); the page frame moved out of `OnboardingAdminPageClient`/`BroadcastPageClient` into the shared layout.
- **Waitlist operations added (2026-08-04, founder request):** `/admin/waitlist` gained a one-tap "Mark contacted" counter + timestamp, an outcome status pipeline (new/contacted/responded/converted/not interested), inline admin notes, and filter chips by contact state — via a new `PATCH /api/admin/waitlist` and four new Neon `User` columns (`contactCount`, `lastContactedAt`, `contactStatus`, `adminNotes`; migration `apps/homepage/prisma/migrations/20260804100000_user_waitlist_ops`).

---

## Task attachments flagged off + Beta tags removed (2026-07-31, URG-203)

Founder request. Two independent changes, same PR.

- **"Beta" tags removed** from the Status and Assignee property rows in the task detail pop-up (`TaskDetailView.tsx`) — those two fields are no longer beta. The Attachments heading's own Beta tag was left in the JSX (now dead code, since the section it labels no longer renders by default) rather than deleted, since removing the flagged-off feature's UI in the same edit as un-flagging it would obscure the diff.
- **Task attachments flagged off**, mirroring the URG-182 file-storage precedent exactly: added `NEXT_PUBLIC_FEATURE_TASK_ATTACHMENTS`, default `false`. Task attachments (`task_attachments` table, `task-attachments` bucket) had shipped always-on with no flag since their original build — distinct from release-level file storage, which already has its own flag (`NEXT_PUBLIC_FEATURE_FILES`, URG-182).
  - **Gated:** the Attachments section in the task detail pop-up (upload control + file list), and both task-attachment API routes (`POST /api/tasks/[id]/attachments`, `DELETE /api/tasks/[id]/attachments/[attachmentId]`) — 404 when off.
  - **Not touched:** the `task_attachments` table, the `task-attachments` Storage bucket, and existing rows/objects. The combined task-detail read path (`loadTaskDetail` in `tasks-server.ts`, which still bundles comments + attachments + activity in one call) is untouched too — it's a read, and comments/activity are unrelated live features; the client simply doesn't render whatever attachments come back when the flag is off.
  - Re-enabling is a one-line env change (`NEXT_PUBLIC_FEATURE_TASK_ATTACHMENTS=true`); no migration either direction.

---

## Post-auth landing: the catalog (2026-08-12; previously Chappi-first, URG-205)

The post-auth landing surface has now flipped three times. The second flip was never recorded here — a doc-drift worth naming so the history reads straight:

- **2026-07-15 (v0.13.1, commit `6c2768f`):** `HOME_PATH` in `apps/web/lib/home-path.ts` introduced, flag-conditional — `/dashboard/chappi` when `NEXT_PUBLIC_FEATURE_CHAPPI` is on, `/dashboard` when off (the path itself was renamed to `/dashboard/urgans` later, in URG-212 — see below). All 15 post-auth entry points across 8 files (login, OAuth callback, root `/`, onboarding completion, invite accept, paywall unlock, promo redemption, post-checkout) route through it.
- **2026-07-23 (v0.17.0, commit `1bebfa4`):** flattened to an unconditional `'/dashboard'` — the releases view became the landing surface again. **This section was never updated to say so** — the Chappi subsection above kept describing the flag-conditional behavior as current for over a week while the code had moved on. If a future drift like this turns up, that's the kind of gap to flag per this file's own rule about surfacing conflicts rather than silently picking one.
- **2026-07-31 (URG-205, founder decision):** reversed again — restored the flag-conditional form verbatim. Chappi is the front door once more when its flag is on. Also updated `apps/web/app/manifest.ts`'s PWA `start_url` to import `HOME_PATH` instead of hardcoding `/dashboard`, so an installed PWA's cold-launch destination can't drift from the in-app one.
- ~~**Production impact is gated on the flag, not this code change**: `NEXT_PUBLIC_FEATURE_CHAPPI` is off in production as of this writing~~ **Stale.** `NEXT_PUBLIC_FEATURE_CHAPPI=true` was flipped in Vercel and took effect with the v0.38.0 deploy (2026-08-03, URG-210) — the flag is ON in production and has been since. This section went uncorrected for weeks, the same doc-drift failure mode this section itself warns about two bullets up.
- **2026-08-04 (URG-212):** the assistant's dedicated page moved from `/dashboard/chappi` to `/dashboard/urgans` (alongside its user-facing UrgAns rename). Because the flag was already live in production per the correction above, real sessions, installed PWAs (`manifest.ts`'s `start_url`), and in-session nav history could all still point at the old path — so `app/dashboard/chappi/page.tsx` now 308-redirects to the new one rather than being deleted outright.
- **2026-08-12 (v0.45.1, founder decision):** reversed a third time, and this one is **unconditional** — `HOME_PATH` no longer reads `NEXT_PUBLIC_FEATURE_CHAPPI` at all. A signed-in user lands on their catalog whether or not the assistant is enabled. UrgAns keeps every other entry point (topbar icon, mobile nav bar, identity-panel nav, the dock below lg, the side rail at lg+), so it is one tap away rather than the first thing in front of you. **One behavioural consequence, deliberate:** the side rail's once-per-session auto-arm in `AppShell` fires on the first *assistant-page* visit, which used to be the login landing — so in a session that never opens that page, the rail no longer opens by itself. Moving that trigger to "first authenticated page" would put the rail back in front of everyone and defeat the call; the comment at the `RAIL_ARMED_KEY` effect records this. Since every entry point still routes through `HOME_PATH`, a fourth flip remains a one-line change.

---

## Release detail page removed; workspace scoped view is the one activity surface (2026-08-04)

Founder question that triggered this: why did an "Overview" pill exist in the workspace header ("i didnt request for that")? Investigation found no separate Overview page — the pill (added by URG-199's navigation walk, agent-initiated scope, not a founder ask) linked to the release detail page (`/dashboard/releases/[releaseId]`), which largely duplicated the workspace's scoped view (activities list, Motion progress). **Founder decision: remove the release detail page entirely and fold its unique functions into the workspace's scoped activities view (`/dashboard?release=<id>`).** This consciously supersedes the old Principle 1 wording — see the updated principle above.

- **Removed:** `ReleaseDetailPageClient.tsx`, `components/loading/ReleaseDetailSkeleton.tsx`, `components/releases/ReleaseInfoSection.tsx` (a read-only summary of fields the Metadata page already edits), `components/releases/ContentCalendarSection.tsx` (an inline duplicate of the Calendar page). `app/dashboard/releases/[releaseId]/page.tsx` is now a thin redirect (307, forwarding `?new=1`) to `/dashboard?release=<id>` — a safety net for old bookmarks/shares/notifications, not a real page. Sibling scene pages (`calendar/ epk/ files/ metadata/`) are untouched and still live at `/dashboard/releases/[releaseId]/<scene>`; their flag-off bounces and "Back to release" links now point straight at the workspace instead of through the dead detail page.
- **Absorbed into `WorkspaceView`/`TasksPanel`:** the Tailor plan and Generate status update buttons (+ their modals, both still flag-gated and off in prod), the one-time `NewReleaseGuide` (now triggered by `?release=<id>&new=1` together, consumed once then stripped), and the per-release document title. `TasksPanel` gained an `extraActions` slot so it stays presentational while `WorkspaceView` owns the AI state/modals.
- **Overview pill deleted.** The workspace header's scene-link pills are now, in order: New activity (action button) → **Plan** (only while the release has no activities or a draft is waiting; added 2026-08-10 with the planner) → **Metadata** (first among the permanent links, founder call) → Calendar → Files → Press kit → the AI action pills when their flags are on. `WorkspaceSkeleton`'s placeholder pill widths were updated to match (it had also been silently missing a Metadata placeholder before this). **Superseded 2026-08-12:** Metadata's pill here now hides at wide widths, where the identity card's nav carries it instead — at a breakpoint that depends on two other flags, so read `METADATA_PILL_HIDE_CLASS` (and "Identity card gains a nav" further down) rather than assuming a plain `lg:hidden`.
- **Every other in-app linker** (Chappi's `create_release`/`navigate` tools, the MCP-shared tool registry, `ChappiConversation`'s cross-page opens, `ChappiPageClient`'s post-create nav, the legacy `/release/[id]` short link, and a latent dead link in `/api/releases/[releaseId]`'s `suggestedAction.href` that pointed at a route that never existed) now points at `/dashboard?release=<id>` directly.
- Verified: `pnpm build` + `pnpm lint` (0 errors) + the full `pnpm test` suite (124 tests) green.

---

## Sitewide loading-state / skeleton pass (2026-08-04)

Follow-up to the release-detail-page removal above — the founder asked for every skeleton to be "state aware" (specifically: correct whether the UrgAns side rail is open or closed) and then for a full sweep of the app for missing/inaccurate loading states.

- **Side-rail width narrowing needed no fixes.** The rail (`ChappiSidePanel`) renders as a flex sibling of `<main>` in `AppShell.tsx`, not inside any page — so every page's content narrows automatically via flexbox when the rail opens/closes. No skeleton hard-codes a viewport-relative width that would fight this. `WorkspaceSkeleton`'s existing `hideRails`/`railOpen` handling is about a *different* "rail" (its own release-rail columns in the focused 3-column layout) and was already correct.
- **Admin (`/admin/*`, 7 pages) went from a bare `Loader2` spinner to real shaped skeletons.** New shared `components/loading/AdminPageSkeleton.tsx` (eyebrow/title/description → optional stat cards → optional tally-pill rows → a chart, a form, the hub's link-card grid, or a table — composed per page via props) replaces the spinner in `AdminHubClient`, `WaitlistAdminPageClient`, `GrowthAdminPageClient`, `InterviewsAdminPageClient`, `BroadcastPageClient`, `OnboardingAdminPageClient`, `PricingValidationPageClient`. `app/admin/loading.tsx` (the route-segment Suspense fallback, fires before any page's own client gate even mounts) was ALSO switched from a completely different `LoadingScreen` component to a bare `AdminPageSkeleton` — same skeleton language on both sides of the handoff, so a slow admin navigation no longer flashes between two unrelated loading UIs.
- **Content calendar posts loading** went from a plain "Loading posts…" string to `CalendarGridSkeleton` (extracted from `CalendarPageSkeleton`, which already had the right shape for the page-shell load and just didn't share it for the narrower posts-only reload).
- **EPK + Metadata pages deduplicated.** Both page clients had hand-rolled, byte-for-byte identical inline skeleton JSX for their header; now both use `components/loading/ReleaseSectionSkeletons.tsx`'s `ReleaseSceneHeaderSkeleton`. The same file's `ShareLinkCardSkeleton` (the "create a link" empty-state shape both `EpkSection` and `MetadataSection`'s credits-link section resolve to) and `MetadataFieldsSkeleton` (the real 8-field distribution-metadata grid) replaced single generic `h-12`/`h-24` blocks in `EpkSection.tsx` and `MetadataSection.tsx`.
- **`/locked` real bug fixed, not just skeletoned.** While the access snapshot loaded, `trialUsed` defaulted to `false`, so the page always showed "Start 28-day free trial" — even for a returning user who'd already used theirs — until the fetch resolved. Now a neutral loading placeholder renders until the snapshot is known, instead of guessing wrong.
- **Public `/epk/[token]` and `/credits/[token]` had ZERO loading state** (both `force-dynamic`, resolving live DB reads + signed-URL minting with no `loading.tsx` route file) — a blank tab on the one surface a press contact judges the product by. Both got a `loading.tsx` matching their real dark-locked Brand Bible palette (`.epk-island` / `.credits-island` CSS vars) so there's no color flash into the resolved page.
- **Minor fits:** `ChappiPageSkeleton` now reserves the always-present desktop collapse-button row (previously only the manager-gated invite banner was documented as intentionally unreserved). `LegacyDashboard` (dead in production — `NEXT_PUBLIC_FEATURE_WORKSPACE` has been on since 2026-06-01 — but kept as the documented revert path) got its own `LegacyDashboardSkeleton` instead of reusing `WorkspaceSkeleton`, whose shape it never matched.
- Verified: `pnpm build` + `pnpm lint` (0 errors) + `pnpm test` (124 tests) green.

---

---

## Release scenes became inline workspace panels (2026-08-04 → 05, v0.39.0)

Founder: *"make it so that each of the features, metadata, calendar and the rest open in a window just like the activity lists open, not a whole separate page, where the top menu vanishes and the load is so strenuous."* The four release scenes are no longer routes.

**Two attempts — the first was wrong, and the correction is the important part.** Built first as centered modal overlays; the founder rejected that: *"I didnt want it to be pop up, I want it like the way UrgAns is on the side but in the place where activity lists appear."* So they are **inline layout content in the workspace's activity slot**, not overlays. `SceneOverlayShell` and `ReleaseSceneOverlay` were deleted; nothing is mounted app-wide from `AppShell`. **If a future change is tempted back toward a modal here, that is re-litigating a settled founder call.**

- **Three problems this fixed.** (1) `AppTopbar`'s `ContextTitle` only renders release identity on `/dashboard` with `?release=`, so navigating to a scene route made the topbar context vanish — the literal complaint. (2) Each scene was its own route segment, so the first open per session paid a chunk fetch + mount + a PAGE-level skeleton *on top of* each section's own internal skeleton — two skeletons in sequence per click. (3) It replaced the workspace wholesale.
- **The pieces:** `components/workspace/useSceneOverlay.ts` (URL-driven, `?scene=<name>` — name kept though nothing "overlays" any more), `components/releases/ReleaseScenePanel.tsx` (the scene body; no chrome), `components/content-calendar/CalendarScene.tsx` + `calendar-fonts.ts`. `TasksPanel` gained a `sceneContent` slot; `WorkspaceDesktopFocused` forwards it as `panelSceneContent`; `WorkspaceView` builds it from the URL.
- **The header row survives the swap.** `TasksPanel` keeps rendering its pill row and replaces only its *body* (activity buckets → scene). The pills are the scene switcher, so they must not disappear with the thing they switch. The open scene's pill is lit (`border-brand bg-brand/10` + `aria-pressed`) and clicking it again closes — plus an explicit "Activities" back control inside each panel.
- **Rails hide for Calendar only (founder call).** `WorkspaceView` computes `hideRails = (CHAPPI_ENABLED && isRailOpen) || activeScene === 'calendar'`. ⚠️ `MonthGrid`/`AgendaList` swap on Tailwind's **viewport-gated** `lg:` (1024px), not container width — so anything that narrows the centre column squeezes the 7-column grid and the show/hide toggle **cannot** compensate. That's the whole reason the rails move for this one scene.
- **URL-synced** (founder call), unlike the activity pop-up which touches no URL: the calendar's `calendar`/`month` params are documented as deep-linkable "by humans and Chappi alike, per the spec." Scheme: `/dashboard?release=<id>&scene=<name>[&calendar=<id>&month=<yyyy-mm>]`. `activeScene` is **derived** from `searchParams`, never mirrored into a boolean — so Back/Forward/refresh/typed-URL/redirect-landing all resolve through one read.
- **History model (founder call):** open-from-closed `push`es (so Back closes the scene, matching the old `<Link>` pills); scene→scene switches `replace` (Back never walks back through switches); close `replace`s and **never** `router.back()` — a redirect stub can make a scene URL the first history entry, and `back()` would eject the user from the app.
- **Calendar memory (founder call):** `calendar`/`month` survive close, so reopening the same release resumes its tab + month. They're cleared whenever the scoped release actually changes — at **both** choke points (`openScene` and `useReleaseScope.setScope`), since a release can change either way and residue would otherwise trip the calendar's "that calendar no longer exists" warning as a false positive.
- **Four `page.tsx` routes are now 307 redirect stubs** into `/dashboard?release=…&scene=…`, same precedent as the release-detail stub. The calendar's stub **forwards `calendar`/`month`** so existing pinned deep links don't degrade.
- **No Escape-to-close anywhere in this feature**, deliberately — matching the UrgAns rail, which CLAUDE.md already records as having none on purpose ("modals own Escape"). Being inline also *dissolves* a conflict the modal version had to guard against: `PostModal` has its own unguarded `window` Escape listener, and two listeners on one target both fire for a single keypress, so a scene-level handler closed the whole scene out from under an open post editor. Inline, `PostModal` simply owns Escape.
- **Bug found and fixed en route:** `PostModal` portals to `document.body`, and CSS custom properties (AND `next/font`'s `.variable` class — both are DOM-position-based, not React-tree-based) only take effect where they're literally applied — so all 27 of its `var(--cc-*)` reads, plus its two `var(--font-cc-*)` reads, had been resolving to nothing ever since it was written. **Both fixed (2026-08-05):** the portal root now carries `cc-island` (declares its own `--cc-*` values directly, so this alone was self-sufficient) AND `calendarFontVariables` from `components/content-calendar/calendar-fonts.ts` (a singleton module — both `CalendarScene` and `PostModal` import the same already-instantiated `next/font/google` calls, so applying the exported className in a second place doesn't load the fonts twice).
- **Also:** `lib/analytics/client.ts` gained `captureFeatureDiscoveryByName` (the route-matcher entry for `/metadata` could never fire again, so `ReleaseScenePanel` reports discovery explicitly); scene toasts route out through an `onToast` prop into `WorkspaceView`'s existing toast; deleted `MetadataPageClient`/`EpkPageClient`/`FilesPageClient`/`CalendarPageClient`/`FilesPageSkeleton`, and renamed `CalendarPageSkeleton.tsx` → `CalendarGridSkeleton.tsx` after its page-level export died.
- Verified: `pnpm build` + `pnpm lint` (0 errors, 41 warnings = unchanged baseline) + `pnpm test` (124 tests) green.

---

## Content calendar refinement pass (2026-08-10)

A correctness + mobile/desktop polish sweep over the Phase-A calendar, which had been dormant since it shipped 2026-07-20. The load-bearing changes, in case any get re-litigated:

- **The grid↔agenda swap is CONTAINER-width-based now, not viewport-based.** `MonthGrid` (`cc-month-view`) and `AgendaList` (`cc-agenda-view`) swap on the scene column's own width via CSS container queries (`.cc-scene-container`, `container-type: inline-size`, threshold 45rem — all in `globals.css` beside `.cc-island`). This retires the documented `lg:` trap: the UrgAns rail and identity panel are AppShell flex siblings that narrow the centre column without narrowing the viewport, and at 1280px with both open the old gate rendered ~54px day cells. A too-narrow column now degrades to the agenda list on ANY viewport. `@supports` fallback keeps the old viewport behavior for browsers without container queries.
- **The scene mounts ONCE.** WorkspaceView's mobile and desktop branches are both always in the DOM (CSS-only split), and handing `scenePanel` to both TasksPanel mounts double-mounted every scene — the calendar double-fetched calendars+posts and raced two copies of its month-param sync on every open. `useIsDesktopViewport` (matchMedia via useSyncExternalStore) now routes the panel to exactly one branch.
- **Mobile dead end fixed:** `AgendaList` only renders days with posts (plus today), so an empty future month — the default view for a future-dated release — showed "Tap a day" with zero tappable days. It now has a standalone "Plan a post" button (empty state) and an "Add a post" button (below the list); the post form's editable date field does the actual day-picking.
- **Posts fetch got a sequence guard + loaded-key gate** (`loadedPostsKey` vs `postsKey` in CalendarScene): switching calendars no longer shows the previous calendar's posts, paging months shows the skeleton instead of a silently empty grid, and out-of-order responses are dropped.
- Also: delete-calendar no longer fires the false "That calendar no longer exists." toast (the stale-param ref is pre-armed before the URL catches up); calendar create uses `router.replace` (mobile Back no longer walks through creations); the flag now gates the `?scene=calendar` URL param and the scene-cache prefetch list, not just the pill; `role="grid"` got real `role="row"`/`columnheader`/`rowheader` structure via `display: contents` wrappers; tap targets were raised across the feature (StatusMark 16→28px etc.); PostModal got initial-focus/focus-restore, a safe-area footer inset, a toast when the create-then-PATCH postedUrl follow-up fails, and lost its dead "Also post on other calendars — Coming soon" row; the hardcoded `/ SINGLE` eyebrow was dropped (the release type isn't even surfaced client-side); the raw Postgres-enum validation strings became manager-voice copy; `CalendarGridSkeleton` now matches the real grid template (56px gutter + header row); `WorkspaceSkeleton` hides its rails on `?scene=calendar` URLs; the four duplicate `getAccessToken` copies collapsed into `components/content-calendar/get-access-token.ts`.

---

## Workspace identity card (2026-08-05, URG-214)

A LinkedIn-company-page-style card for the record label / manager, mounted once by `AppShell` as a persistent LEFT column — the mirror image of the UrgAns rail on the right. Founder request; **not** a scope expansion (it's chrome over data the release spine already holds, no new object).

- **Flag:** `NEXT_PUBLIC_FEATURE_IDENTITY_PANEL`, default `false`, only meaningful when `NEXT_PUBLIC_FEATURE_WORKSPACE` is also on. Gates the column, the Settings sections, and both new API routes (404 when off). Registered in `turbo.json` + `.env.example`.
- **The card** (`components/app/WorkspaceIdentityPanel.tsx`): 240px, `hidden lg:block`, sticky at the same `top-[calc(5.25rem+1px)]` the rail uses, `mr-8` mirroring the rail's inset. Shows workspace logo (initials fallback via `getInitials`), workspace name, artist name, and `N teammates · M active releases`. **Display-only** — the whole card is a link to `/settings`; nothing is editable here.
- **Width budget (the real design work).** Three columns can't all fit on a 1024–1366px laptop, so: (1) the card hides below `lg`; (2) on any page where the UrgAns rail is OPEN, the card waits for `xl` — the interactive assistant beats a passive card (the card reads `useChappiStore.railOpen` itself, and treats `/dashboard/urgans` as no-contest since the rail doesn't render there); (3) `WorkspaceDesktopFocused`'s own release rails shift from `lg` to `xl` and drop their 260px xl tier when this flag is on, else the focused centre column would fall to ~187px. All CSS/props, no viewport JS. `WorkspaceSkeleton` mirrors rule 3; `SettingsPageSkeleton` reserves the two new section rows.
- **Data — one aggregate endpoint.** `GET /api/workspace/identity` returns name + artist + logo + active-member count in a single round trip (the card is chrome on every cold load; the three pre-existing endpoints would each re-run auth + workspace resolution). Composes existing helpers only. **Active releases count is deliberately NOT server-side** — derived client-side from `useReleaseStore.releases` so it live-updates for free.
- **`PATCH /api/workspace`** (new) renames the workspace: **owner-only** (403 otherwise), trimmed, 80-char cap. Note `workspaces.name` had NO editor anywhere before this — every name was the `createWorkspaceName` auto-default (`"<emailHandle>'s Workspace"`).
- **Store:** `stores/useWorkspaceIdentityStore.ts` — recency-guarded `load()`, cache-first hydration (`urganize.cache.workspace-identity`, per-user). **The signed logo URL is never persisted** (TTL-bound; a stale URL would 403 on the next visit) — the card falls back to initials until the live fetch lands, and an `onError` on the `<img>` covers mid-session expiry.
- **Settings gained two sections**, above Workspace artist: `WorkspaceIdentitySection` (new — the name editor) and `WorkspaceLogoSection` (**resurrected near-verbatim from `08ab5a5^`**, where its UI was removed 2026-07-23 while its four API routes stayed dormant — those routes needed no changes). Both read/write the store, so a rename or logo swap updates the card and the topbar `WorkspaceMenu` subtitle live, no reload. That subtitle previously rendered the literal string "Workspace"; it now shows the real name with that string as fallback.
- **Extracted** `buildWorkspaceLogoPayload` from `api/workspace/logo/route.ts` into `lib/workspace-logo.ts` so both logo consumers share one signing path.
- **Gotcha worth remembering:** the two new routes initially copied `/api/workspace/artist`'s `isTaskSchemaMissingError` / `buildTaskSchemaResponse` error handling — that's the deprecated schema-missing-fallback pattern, and `lib/schema-fallback-guard.test.ts` failed the build for it. Correct: copy `/api/workspace/logo`'s plain error handling instead. The artist route is a grandfathered baseline entry, not a template.
- Verified: `pnpm test` (124 green), `pnpm lint` (0 errors), `pnpm build`, plus browser checks at 1100/1280px confirming both collapse rules and no horizontal scroll.

---

## Identity card gains a nav; Metadata's entry point splits by viewport (2026-08-12, URG-229)

The identity card (above) grew a persistent nav below the identity block: Catalog, UrgAns, an optional release-scoped "Collect metadata", an optional Notes, Settings, and Admin when the viewer is one. Same hand-drawn `BrandIcons` marks the topbar uses, so the two entry points read as one system; active-state matching mirrors `AppTopbar`'s (exact for `/dashboard`, prefix for the rest).

- **Metadata's pill moved out of `TasksPanel`'s scoped-header row at wide widths** — "Collect metadata" in the identity card is now the primary desktop entry point (first item after UrgAns, carrying forward the "first among the permanent links" placement the pill had). Both surfaces read the same `NEXT_PUBLIC_FEATURE_METADATA` flag, so they can't disagree about whether the feature exists.
- **The pill itself was NOT deleted — it survives at narrow widths**, because the identity card never renders below `lg` at all (see the width-budget note above). Removing the pill outright, as an earlier pass at this change did, made Metadata completely unreachable on any phone or tablet — caught and fixed while finishing this work, per the "every feature reachable from the workspace" rule.
- **Where exactly the pill retreats is computed, not a literal `lg:hidden`** — see `METADATA_PILL_HIDE_CLASS` in `TasksPanel.tsx`, which is the one definition of this and is exported so `WorkspaceSkeleton` reserves its placeholder at the identical breakpoints (that file's own comments record it having drifted from this row before). Two cases the flat `lg:hidden` this section originally described got wrong, both of which left Metadata with NO entry point at some real viewport:
  - **`NEXT_PUBLIC_FEATURE_IDENTITY_PANEL` is a separate flag and defaults to FALSE** (and is itself gated on `NEXT_PUBLIC_FEATURE_WORKSPACE`), independent of `NEXT_PUBLIC_FEATURE_METADATA`. In a metadata-on / identity-panel-off environment — the DEFAULT combination — hiding the pill at `lg`+ removed the only desktop entry point and replaced it with nothing. So the hide class is empty unless the card is actually enabled: the pill only ever steps aside for something that exists.
  - **The card hides ITSELF at `lg`–`xl` whenever the UrgAns rail is open** (`railIsCompeting` in `WorkspaceIdentityPanel.tsx`), so with Chappi on there is no width below `xl` where the card is guaranteed present. Rather than mirror that runtime rail state into `TasksPanel` — the kind of duplicated condition this file keeps having to correct — the pill retreats one breakpoint later (`xl:hidden`) when Chappi is on. Accepted cost: a redundant second control at `lg`–`xl` while the rail happens to be closed, which is strictly better than a viewport band where the feature is unreachable.
- **`NavItem.Icon`'s type is `(props) => ReactElement`**, matching the `BrandIcons` function-component signature; lucide-react's icon components type their call signature as `ReactElement | null`, so `ClipboardList` needed a one-line wrapper (`MetadataIcon`) rather than being passed directly — the actual type error this WIP was blocked on.
- Verified: `pnpm test`, `pnpm lint` (0 errors), `pnpm build`.

---

## Native mobile app (2026-07-21, doc-drift backfilled 2026-08-07)

The fifth sanctioned v1 scope expansion (see the 2026-07-21 note in "v1 scope") — and the moment this file should have gained an entry but didn't, until now. `apps/mobile` is a **Capacitor native shell** (`com.urganize.app`, Android + iOS) that wraps the existing product app rather than reimplementing it.

- **Strategy: remote URL, not static export.** `capacitor.config.ts` points `server.url` at `https://app.urganize.app` — the webview loads the real, continuously-deployed production app. A static export was evaluated and rejected outright: 48 API route handlers (auth-gated CRUD, Supabase Storage signed uploads, the two AI features, Chappi's agent loop, the Paystack webhook) require a live server, full stop. Trade-off accepted explicitly: no offline shell (consistent with the product today — every page already round-trips to Supabase), and in exchange every web-code change ships to installed apps instantly, with zero store review. Only native-shell changes (icons, splash, permissions, added plugins) go through Play Store / App Store review. The full audit and reasoning: `docs/mobile/capacitor-audit.md`.
- **Auth.** Supabase auth here is 100% localStorage-based (no cookies), which survives inside a webview unmodified. The one real fix needed: Google blocks OAuth inside embedded webviews by user-agent detection, so `signInWithGoogle` on native platforms (`apps/web/lib/auth-store.ts`) opens the consent screen in the system browser via `@capacitor/browser` and returns via the custom URL scheme `com.urganize.app://auth/callback`, caught by `apps/web/components/providers/CapacitorAuthBridge.tsx` and rewritten into the existing `/auth/callback` page rather than reimplementing the PKCE exchange. Manual dashboard steps (Supabase redirect allowlist) are in `docs/mobile/auth-setup.md`; **applied and verified end-to-end on a real Android device 2026-08-07** (`Browser.open` → Google consent in a Chrome Custom Tab → `appUrlOpen` → `Browser.close`, landing back in `MainActivity` signed in). Until the allowlist entry existed, Supabase silently fell back to the Site URL and finished the whole flow inside the Custom Tab, leaving the session in Chrome's storage rather than the app's — if native Google sign-in ever regresses to "it just opens a browser", check that allowlist entry first, not the app code.
- **Billing.** Apple prohibits linking to external payment for digital subscriptions from inside a reviewed iOS app. `apps/web/lib/platform.ts` (`isIOSApp()`/`isNativePlatform()`, via `Capacitor.isNativePlatform()`, no plugin needed) gates `LockedPageClient.tsx`: on iOS native, the Subscribe button and plan pricing are hidden, replaced by a "manage on the web" link opened in the system browser; the trial CTA and promo-code redemption stay visible (neither touches a payment provider, so neither trips Apple's policy). Android has no equivalent restriction — Paystack checkout opens via `@capacitor/browser` there instead of the in-app webview, but otherwise stays as-is.
- **Other webview fixes already landed:** `apps/web/lib/external-link.ts` (`openExternalUrl`) routes external links, file-download anchors, and attachment previews through `@capacitor/browser` on native instead of a plain `target="_blank"` anchor (the highest-risk item — a bare new-tab anchor to a remote Supabase Storage URL commonly fails or opens blank in an embedded webview); the highest-consequence unguarded `localStorage` calls in the auth/onboarding paths got try/catch guards; `app/layout.tsx` gained a `viewport` export (`viewportFit: 'cover'`) and `theme-color` so status-bar/safe-area behavior coordinates with native chrome.
- **iOS needs a Mac; Android doesn't.** `pnpm mobile:android` (root script) syncs Capacitor and opens the Android Studio project — buildable on this machine. iOS builds require Xcode, so a cloud macOS CI pipeline is defined in `codemagic.yaml` (repo root) — see `docs/mobile/codemagic-setup.md` for the one-time Codemagic/Apple Developer dashboard setup; none of it can be scripted, it needs your own logins.
- **Launcher icons + splash (2026-08-07):** generated from the brand mark (`apps/web/public/images/urganize-logo-square.png`) via `@capacitor/assets` — adaptive-icon foreground/background layers plus the legacy/round icons and light/dark splash screens, all on the Brand Bible ink background (`#0d120e`, matching `capacitor.config.ts`'s `android.backgroundColor`). Source layers kept at `apps/mobile/assets/{icon,icon-foreground,icon-background}.png` so a future rebrand can just re-run `pnpm exec capacitor-assets generate --android` from that workspace rather than re-deriving them. iOS icon generation (`--ios`) not run yet — do that once the Codemagic pipeline is actually exercised.
- **Verified working (2026-08-07):** a debug APK built with the bundled Android Studio JDK (`gradlew assembleDebug`) installs and runs on a real device, loads production `app.urganize.app` with no browser chrome, and both sign-in paths work (email, and Google via the deep-link round trip above).
- **Release signing wired (2026-08-07), keystore still to generate.** `android/app/build.gradle` now reads credentials from an untracked `android/keystore.properties` (template: `keystore.properties.example`; full procedure: `docs/mobile/android-signing.md`). The config is conditional on that file existing, so a clone without it still builds — `assembleRelease` just emits `app-release-unsigned.apk` instead of failing. **The `.gitignore`'s `*.jks`/`*.keystore` lines were commented out by the Capacitor scaffold and are now uncommented**, alongside `keystore.properties`. Generating the keystore needs a password, so it stays a founder step — losing that file (and its password) means never updating `com.urganize.app` again, which is why the doc leads with backup, not generation.
- **Versioning of the native build:** `versionName` is read from `apps/mobile/package.json` at build time (verified resolving to `0.41.2`), so it tracks the ledger automatically instead of becoming another hand-maintained number that drifts. `versionCode` stays a manual integer (currently `1`, correct for a first upload) and MUST be incremented for every upload to any Play track — Play never reuses a number, even from a deleted build, and a monotonic counter can't be derived unambiguously from semver.
- **Not yet done:** generating/backing up the upload keystore, and a Play Console app record + internal testing track. No user-facing release has shipped through either store, so there is no changelog-ledger entry yet — the Versioning section's release procedure applies the first time a build actually reaches a store track.

---

## Genre prediction from audio (2026-08-08)

The sixth sanctioned v1 scope expansion (see the 2026-08-08 note in "v1 scope"). Built flag-off; **not yet activated** — the upstream model was returning HTTP 500 on every file at build time.

- **What it is:** one action beside the Genre field on the Metadata scene. The owner picks a local audio file, `apps/web` proxies it to an external classifier, and the predicted genre prefills the existing free-text field. The user reviews it and saves through the normal "Save details" (`PATCH /api/releases/[releaseId]/metadata`). **Nothing is stored** — the audio is streamed through and discarded, no DB write happens on prediction, no migration exists for this feature.
- **Flag:** `NEXT_PUBLIC_FEATURE_GENRE_PREDICTION`, default `false`. Registered in `turbo.json` + `.env.example`. Only reachable when `NEXT_PUBLIC_FEATURE_METADATA` is also on (the section renders nothing otherwise) — flip them together.
- **Config (server-only, deliberately NOT in `turbo.json` — the `CHAPPI_API_KEY` precedent):** `GENRE_PREDICTION_URL` is the model's full `/predict` URL, so a path change is config-only; `GENRE_PREDICTION_API_KEY` is forwarded as `x-api-key` when set. Server-only because **the upstream has no authentication today** — the URL must never reach a client bundle. Unset → the route 503s.
- **Route:** `app/api/releases/[releaseId]/metadata/predict-genre/route.ts`. Order: flag-404 → `requireActiveAuthenticatedUser` → releaseId 400 → config 503 → admin client → **inline** ownership check → multipart parse → file validation (400 type / 413 size) → forward. The ownership helper is local on purpose (the `epk/_shared.ts` pattern), NOT `releases/_shared.ts`'s — that module carries the deprecated schema-missing fallback and `lib/schema-fallback-guard.test.ts` fails the build for new files that touch it. `maxDuration = 60` with a single 30s `AbortController` attempt and no retry (re-uploading a multi-MB body doubles the worst case). Errors: abort → 504, unreachable → 503, upstream 429 → 503, upstream non-2xx → 502, unparseable body → 502 + a logged 500-char sample.
- **Size ceiling is a platform fact, not a preference:** Vercel caps request bodies at ~4.5 MB and the Lambda function URL at ~6 MB, so `MAX_GENRE_PREDICTION_FILE_BYTES` is 4 MiB and the error copy says "try an MP3 instead of a WAV master." The follow-up that lifts it is client-side clipping (decode → first 30s → mono 22.05 kHz 16-bit WAV ≈ 1.3 MB), worth building once the model's input contract is documented.
- **`lib/genre-prediction.ts`** holds the shared constants, `validateGenrePredictionUpload` (run on BOTH sides so they can't drift — the `asset-constants.ts` pattern), and `parseGenrePrediction`. That parser is **deliberately over-tolerant** (flat `{genre}`/`{label}`/`{predicted_genre}`, nested `{prediction:{...}}`, ranked `{predictions:[...]}`, a bare string, confidence in 0–1 or 0–100) because the upstream schema is unknown — every call 500'd during the build. It carries a `TODO(genre-prediction)` to pin the shape once the model's owner fixes and documents the endpoint. Tests: `lib/genre-prediction.test.ts` (21 cases).
- **UI gotcha worth keeping:** the shared `Field` component wrapped its input in a `<label>`, and a `<button>` cannot nest inside one (clicking it would also activate the input). `Field` gained an optional `labelAction` prop that switches the wrapper to a `div` + explicit `<label htmlFor>` when an action is present. Field count/order/heights are unchanged, so `MetadataFieldsSkeleton` needed no update.
- **Activation checklist:** the model's owner fixes the 500, documents the response JSON + accepted formats + label list, and adds a shared secret → pin the parser and update its tests → set `GENRE_PREDICTION_URL` (+ key) in Vercel `Web` → flip the flag → changelog entry + version bump (the EPK precedent: the ledger entry lands at flag-flip, not at merge) → verify with a real release.

---

## Notes — global quick capture (2026-08-09)

The seventh sanctioned v1 scope expansion (see the 2026-08-09 note in "v1 scope"). Built flag-off; **not yet activated**.

- **What it is:** private, owner-scoped notes at `/dashboard/notes` — a two-pane list + editor at lg+, a list→editor drill-down below lg. Zero-friction capture is the whole design: "New note" creates a real row immediately and focuses an empty textarea, there is no title field (the first line of the body IS the title), and edits autosave on an 800ms debounce with a visible Saving…/Saved indicator. A note optionally links to a release; linked notes carry a release chip and appear when the list is filtered by `?release=<id>`.
- **Flag:** `NEXT_PUBLIC_FEATURE_NOTES`, default `false`. Registered in `turbo.json` + `.env.example`. Gates the topbar icon, the identity panel's nav entry, the TasksPanel scoped-release link, the page (bounces to `/dashboard` when off), and all four API routes (404 when off).
- **Schema:** `notes` via `20260808120000_notes.sql` — `owner_user_id` (cascade), `release_id` **`on delete set null`** so a note outlives the release it was about (the `content_posts.asset_id` precedent), `body text not null default ''`, `pinned`, timestamps; two indexes, the shared `set_updated_at()` trigger, four owner-scoped RLS policies. **Applied to production 2026-08-09** (verified: all columns resolve, and an anon insert is rejected with `42501` rather than a foreign-key error, which is what proves RLS is actually enforcing rather than merely declared).
- **Routes:** `GET/POST /api/notes` + `PATCH/DELETE /api/notes/[noteId]`, with the EPK route group's exact ordering (flag-404 before auth → `requireActiveAuthenticatedUser` → validation 400 → admin client → ownership → query) and a **local** `ensureReleaseOwnership` in its own `_shared.ts` — the notes group must never import `app/api/releases/_shared.ts`, whose module carries the deprecated schema-missing fallback the guard test freezes. **GET has no `?release=` param on purpose:** the store holds the whole notebook (≤200) and filters client-side, so a server param would ship caller-less. PATCH distinguishes the three `releaseId` states with `'releaseId' in payload` (absent = untouched, `null` = unlink, string = ownership-checked).
- **Store:** `stores/useNotesStore.ts` — the `useWorkspaceIdentityStore` mechanics (15s recency guard, in-flight coalescing, `{force:true}` after mutations, cache-first hydration keyed to the session user id). Two deliberate deviations: the cache holds only the newest 50 notes and its write is wrapped in try/catch, because `writePersistedState` does not guard `localStorage.setItem` quota throws and a full notebook is far bigger than the identity blob.
- **Two mechanisms worth knowing before editing this feature:**
  1. **The autosave loop** (`components/notes/useNoteAutosave.ts`) re-reads the draft after each round trip instead of recursing, and refuses to start a second save while one is in flight — so text typed mid-request goes out on the next lap, not as a competing request. It flushes on blur, on note switch, and on unmount.
  2. **The virgin-note reaper** (`NotesPageClient`) deletes a note the user opened and never typed into, Apple Notes style. It is safe *because* a save is only ever scheduled by a change: no typing means no timer and no in-flight request. A note that once had content and was then emptied is deliberately KEPT — content-bearing notes only die through the confirmation dialog.
- **Nav:** topbar icon (a new hand-drawn `NotesIcon` — a lyric sheet with a quarter note) sits **outside** the `CHAPPI_ENABLED` fragment, since notes have nothing to do with the assistant; it is a plain `<Link>`, not part of the Catalog/UrgAns mutual-toggle pair. The identity panel's `NAV_ITEMS` gained a conditional entry between UrgAns and Settings. The workspace's scoped-release header gained a **link** (not a scene toggle) to `/dashboard/notes?release=<id>` — notes are a global surface that filters by release, not a fifth release scene. Adding a seventh topbar control overflowed a 375px bar by ~9px, so the header row went to `gap-2 px-3` below `sm` (restored from `sm` up); the 40px hit targets were not touched.
- **Activation checklist:** (1) ~~apply `20260808120000_notes.sql` to prod Supabase~~ — done 2026-08-09; (2) set `NEXT_PUBLIC_FEATURE_NOTES=true` in Vercel `Web` → Production; (3) changelog entry + minor version bump mirrored to all 10 `package.json` files (the EPK precedent: the ledger entry lands at flag-flip, not at merge); (4) verify end-to-end with a real note — create, type, pin, link a release, delete, and confirm a deleted release leaves its notes intact as global ones.

---

## Task outcomes — "Done. How did it go?" (2026-08-09)

The eighth sanctioned v1 scope expansion (see the second 2026-08-09 note in "v1 scope"). Built flag-off; **not yet activated**.

- **What it is:** marking a task done opens an UrgAns bottom sheet — three chips (Went well / Went okay / Didn't go to plan), an optional note ("Tell UrgAns what happened"), and at most one AI follow-up question, but only when a note was written. Answering takes about five seconds. The answer becomes one `task_outcomes` row and shows read-only on the task detail pop-up.
- **Flag:** `NEXT_PUBLIC_FEATURE_TASK_OUTCOMES`, default `false`. Registered in `turbo.json` + `.env.example`. Gates the sheet, the Settings section, the detail-view Outcome section, the read path, and both `/api/tasks/[id]/outcome` handlers (404 when off).
- **Schema:** `20260809120000_task_outcomes.sql` — enum `task_outcome_rating`, table `task_outcomes` (`task_id` **unique**, `release_id`, `outcome`, `note`, `summary not null`, `ai_followup_question`, `ai_followup_answer`, `created_by`), plus `profiles.ask_after_tasks boolean not null default true`. **Applied to production 2026-08-10** (verified: the table resolves, existing profiles read back `ask_after_tasks: true`, the enum rejects an unknown value with `22P02`, both FKs are wired, and an anon insert is rejected with `42501` rather than a foreign-key error — which is what proves RLS is actually enforcing rather than merely declared).
- **RLS deviation worth knowing:** the brief asked for "RLS matching the release's team access". No such thing exists in this schema — every policy in all eleven policy-bearing migrations is owner-scoped, and team access lives app-side in `ensureTaskAccess` (workspace membership, service-role client). So `task_outcomes` mirrors `tasks` itself: the release-chain owner policy as defense-in-depth, real team access enforced in the route. Do not read the brief's wording as a precedent to invent team-scoped RLS.
- **Three mechanisms worth knowing before editing this feature:**
  1. **The prompt is a store slot, not a promise.** `useTaskStore.completeTask` resolves only after the completion PATCH *and* every cascade-unlock PATCH, so hanging the sheet off `await` would delay it by one to two round trips. Instead `outcomePrompt` is written in the SAME synchronous `set()` that flips the task to done — the sheet paints on that frame, and nothing about it can slow completion. It is cleared by `rollbackCompletion` (a rejected completion closes the sheet even mid-typing) and by the reopen branch (unticking closes it).
  2. **The undo toast and the sheet are mutually exclusive, by construction.** Both are bottom surfaces, and "Undo?" next to "how did it go?" reads as two contradictory asks. When the sheet fires, the toast is never created (not created-then-dismissed), and the sheet's "Done." headline is the acknowledgment. Undo stays available by unticking the checkbox. Flag off or toggle off, the toast behaves exactly as it always has.
  3. **Only the AI fails silently.** One `generateStructuredAiOutput` call per submission returns `{summary, followupQuestion}`; `timeoutMs: 3000` with `maxRetries: 1` (that is TOTAL attempts — the free auto-router treats our own abort as retryable, so anything higher stacks backoffs past the budget). Any failure keeps the template summary, asks nothing, and still returns 200. A **DB** failure, by contrast, IS user-facing ("Could not save. Try again." with a working retry) — silently dropping a note the user typed is data loss they would notice later.
- **Gating:** the sheet needs the flag, a `releaseId`, and `useAuthStore.getState().user?.ask_after_tasks !== false` (undefined counts as on, so pre-migration profiles are unaffected). Server-driven completions (UrgAns agent tools, MCP `complete_task`) deliberately never prompt — this is a human-moment feature, so agent completions produce no outcome row.
- **Sheet details:** mounted by `TaskUIProvider` after `TaskDetailModal` so a completion from inside the detail pop-up stacks above it (same `z-[170]` tier, no portal needed — that subtree already hosts it). Dismiss is X, backdrop, or swipe down past 80px (hand-rolled touch handlers on the header only, since no gesture library exists in this stack and swiping must not fight the textarea). **No Escape handler on purpose**, the ChappiDock precedent: the detail pop-up owns Escape and a second window listener would close both. Entrance is the named `task-outcome-sheet-enter` keyframe (`tailwindcss-animate` classes are dead in this repo).
- **Activation checklist:** (1) ~~apply `20260809120000_task_outcomes.sql` to prod Supabase~~ — done 2026-08-10; (2) set `NEXT_PUBLIC_FEATURE_TASK_OUTCOMES=true` in Vercel `Web` → Production; (3) optionally set `AI_OUTCOME_MODEL` (falls back to `AI_STATUS_MODEL`, then the gateway default) — the feature works without it, summaries just stay template-built and no follow-up is ever asked; (4) changelog entry + minor version bump mirrored to every `package.json` (the EPK precedent: the ledger entry lands at flag-flip, not at merge); (5) verify end-to-end on a real task — chip only, chip plus note, dismiss at each stage, and the Settings toggle.

---

## Playlist pitching (2026-08-10)

A sanctioned v1 scope expansion (see the 2026-08-10 note in "v1 scope"). Built flag-off; **not yet activated**. Two-sided: teams pitch, invited playlist owners answer.

- **What it is.** On a scoped release, a "Pitch" scene lets a team browse curator playlists (filter by platform and genre), pick one, and send a song: a title, any URL, and a note of up to 300 characters. The curator sees it in an inbox at `/curator` and answers with one tap — New, Listened, Added, Passed — plus an optional one-line reply on the two decided states. The answer shows back on the release's Pitch scene on the next open. Free: nothing here touches billing.
- **Flag:** `NEXT_PUBLIC_FEATURE_PITCHING`, default `false`. Registered in `turbo.json` + `.env.example`. Gates the workspace pill, the three `/curator` pages (which bounce to `/` when off), and every route under `/api/curator`, `/api/pitching` and `/api/admin/curator-invites` (404 when off, admin included).
- **Schema:** `20260810100000_playlist_pitching.sql` — `curator_invites`, `curator_profiles`, `curator_playlists`, `playlist_pitches`, plus a widened `profiles_role_check`. **Applied 2026-08-10** to the Supabase project `apps/web/.env.local` points at (verified: every column named in the migration resolves, an anon read of all four tables returns empty, and an anon insert into `curator_invites` is refused with `42501` rather than a foreign-key error — which is what proves RLS is enforcing rather than merely declared, the same check the notes migration got). One thing that check could NOT prove: read the constraint definition once with `select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_role_check';` and confirm `curator` is listed. It was deliberately not probed by writing, since the only way to test a check constraint through PostgREST is to flip a real person's role and flip it back. The migration header carries the full design record; read it before changing any of this.

**Five things worth knowing before editing this feature:**

1. **The curator account type is contained at three chokepoints, not per route.** `blockCuratorAccount` inside `requireActiveAuthenticatedUser` (`app/api/_shared/auth.ts`) 403s a curator on every protected team route, which is every route `requireAuthenticatedAdmin` wraps too. `loadWorkspaceAccessContext` returns `EMPTY_WORKSPACE_ACCESS_CONTEXT` for a curator, so workspace-aware reads resolve to nothing. `ensureOwnedWorkspace` throws `CuratorAccountError`, which is what stops the lazy auto-provisioning (documented elsewhere in this file as a trap) from silently handing a curator a team. Costs one primary-key read on `profiles` per protected request; that was judged worth it over a per-route audit debt that would decay.
2. **`playlist_pitches` has TWO select policies and no write policy.** Two, because a pitch is read by the sending team and the receiving curator, who share no workspace — this is the first cross-tenant read in the schema. No write policy, because every write carries an invariant RLS cannot express: the ten-waiting-pitches cap, the one-waiting-pitch-per-playlist unique index, honest denormalized fields, and the rule that only a curator moves a status. All writes go through service-role routes and direct client mutations fail closed.
3. **Every field the curator card renders is denormalized onto the pitch row** (`song_title`, `artist_name`, `pitcher_name`, `playlist_name`), and `CURATOR_PITCH_COLUMNS` deliberately selects no release id, owner id or playlist id. That is not a performance choice: those joins are exactly the data a curator is not allowed to see, so the read path cannot reach team data even by mistake. It is also why `release_id` and `playlist_id` are `on delete set null` — deleting a release must not empty a curator's inbox.
4. **The invite is single-use through a conditional update.** `POST /api/curator/join/[code]` consumes it with `update ... where used_at is null and revoked_at is null returning id`; zero rows means someone else won the race. The row is the lock, so there is no read-then-write window. It also refuses to convert an account that already owns a release or holds a workspace membership (409), checked BEFORE the invite is consumed so a refused attempt does not burn the link. The profiles upsert that follows is deliberately NOT `ignoreDuplicates`: the OAuth callback may have just written a fallback `artist-manager` row, and that has to become `curator` or the account lands on the team dashboard.
5. **`requireCuratorUser` deliberately does not use `requireActiveAuthenticatedUser`.** Pitching is free and a curator has no subscription, so running them through the payment gate would lock every playlist owner out the moment that gate is switched back on (see the correction on Resolved blocker #1 — it is currently off).

- **Invites are minted at `/admin/curator-invites`** (`verifyAdmin` / `ADMIN_EMAILS`) with a copy-link button and a soft revoke. **Nothing is emailed** — no transactional provider is wired anywhere in this app, so the founder sends links by hand, matching how team invites already work.
- **No realtime.** Statuses and replies appear on the next scene open, not live. The `notifications` table cannot carry a pitch event without a migration (`task_id` is NOT NULL with an FK to `tasks`, and `type` is a Postgres enum), and the spec allowed refresh. Extending notifications is the follow-up if this gets noisy.
- **RLS is proved, not assumed:** `apps/web/lib/pitching-rls.integration.test.ts` runs real PostgREST calls as four signed-in users plus an anon client and asserts every isolation rule (curator ↛ another curator, curator ↛ releases/tasks/assets/notes/metadata/activity, curator ↛ invite codes, team B ↛ team A's pitches, nobody writes a pitch directly, nobody self-mints a curator profile, anon reads nothing) with positive controls first so a broken seed cannot make the negatives pass vacuously. It is env-gated on `RLS_TEST_*` and skips entirely without them, so `pnpm test` stays offline. Setup steps are in the file header.
- **Activation checklist:** (1) ~~apply the migration~~ — done 2026-08-10, see Schema above, minus the one constraint read noted there; (2) set `NEXT_PUBLIC_FEATURE_PITCHING=true` in Vercel `Web` → Production **and redeploy** — `NEXT_PUBLIC_*` is inlined into the client bundle at build time, so flipping it without a rebuild leaves the API routes live while the UI stays dark; (3) seed a dev project and run the RLS suite once with `RLS_TEST_*` set; (4) mint an invite at `/admin/curator-invites` and join end to end with both a fresh email account and a Google account (an account that already owns a release is refused by design, so do not test with your own); (5) changelog entry + minor version bump across every `package.json` (the EPK precedent: the ledger entry lands at flag-flip, not at merge).

---

## Release recap card (2026-08-09)

The eighth sanctioned v1 scope expansion (see the 2026-08-09 recap note in "v1 scope"). Built flag-off; **not yet activated**.

- **What it is:** a Wrapped-style poster for one finished release. The workspace's scoped-release header grows a "Get your release recap" pill (in `WorkspaceView`'s `taskPanelExtraActions`, beside the two AI actions, NOT a scene pill — a recap is a moment, not a permanent surface). It opens a modal: optional input (a highlight) → generate → preview with a Story/Square toggle → Share (native) or Download (web), plus Regenerate. **Removed 2026-08-10 (founder call):** the form originally also took a hand-typed "first week streams" number; cut as unnecessary since there is no DSP integration to source it from.
- **Flag:** `NEXT_PUBLIC_FEATURE_RELEASE_RECAP`, default `false`. Registered in `turbo.json` + `.env.example`.
- **Eligibility is the load-bearing decision.** The brief said "when a release is marked complete", but **nothing in the product ever writes `status: 'released'`** — every release sits at `'draft'` forever (the PATCH route accepts a status, no UI calls it, and `GET /api/releases/[id]` overwrites the value with a `computedStatus` that can never be 'released'). So the rule is: release date passed (release day itself counts, since the share moment IS the launch) OR every task done OR status released/archived as future-proofing. The all-tasks-done clause is what makes "complete" real today and is the only path for a release whose date was never set. The rule lives ONCE in `lib/recap-eligibility.ts`; the route imports it and `WorkspaceView` mirrors it, so the button and the API cannot disagree.
- **Rendering: `next/og`'s `ImageResponse`, no new dependency.** It ships inside Next 16 and bundles satori + resvg; adding satori/resvg/sharp directly would have meant platform binaries for no gain. Runs on the default Node runtime like every other route. `Buffer.from(await image.arrayBuffer())` gives the PNG bytes.
- **Fonts are the fragile part.** Satori cannot read `next/font` CSS variables and rejects variable fonts and woff2, so `apps/web/assets/fonts/` holds the repo's **first checked-in font binaries**: static TTF cuts of Fraunces 144pt SemiBold (the display optical size, correct for a 128px headline), Space Grotesk Regular + Medium, Space Mono Regular, each with its OFL license. Vercel output tracing cannot see a runtime `readFile`, so `next.config.js` declares `outputFileTracingIncludes` for the recap route — **a deployed generate failing with ENOENT on a .ttf means that entry is wrong, not the code**. `lib/recap-render.test.ts` asserts the TrueType signature and real PNG dimensions precisely because a broken font load otherwise ships silently as a wrong-looking poster rather than an error.
- **Stat selection never shows a zero.** Priority order, capped at five: tasks completed, days of work, team size, pitches sent, playlist adds. A team of one is suppressed on purpose (true, but not worth printing). "Done" is `status === 'done'`, never `completed_at` (the checkbox path leaves it null). With nothing to count at all (a past-dated release with no tasks) the card switches to an announcement-poster layout, oversized title plus a large "Out <date>" line, rather than rendering empty slots.
- **Playlist pitch stats read `playlist_pitches`** (the pitching feature's table, owned elsewhere and behind its own flag), through a defensive probe: a missing table, a missing column, or any query error degrades to "no pitch stats" silently. Absent (null) and present-but-empty (0) are kept distinct so the selector can tell "no pitching here" from "pitched nothing".
- **Copy rules are mechanical, not a review step.** `sanitizeRecapText` in `lib/recap-copy.ts` strips em/en dashes and any comma before "and" from EVERY dynamic string reaching the card, including the user's own highlight; a unit test asserts no static card string violates either rule.
- **Schema:** `release_recaps` via `20260810090000_release_recaps.sql` — one row per release (unique `release_id`), holding the optional highlight plus pointers to the two storage objects. The stats themselves are never stored: they are recomputed at render time so a card can never disagree with its release. Owner-scoped RLS, four policies, the EPK migration's shape. **Doc-drift correction (found 2026-08-10 while removing the streams field, not caused by it): this migration was already applied to the live Supabase project** — the earlier "needs applying to production" note here and in the activation checklist below was stale. A follow-up migration, `20260810120000_release_recaps_drop_first_week_streams.sql`, drops the now-unused `first_week_streams` column and its check constraint — apply both in order on any environment that predates this note.
- **Regenerate replaces safely:** both PNGs render and upload to fresh UUID paths BEFORE the row is touched, so a failure leaves the previous recap intact; the superseded objects are removed best-effort afterwards.
- **Native share needs a new binary.** `@capacitor/share` + `@capacitor/filesystem` were added to `apps/web` and `apps/mobile` (share needs a local file URI, not a remote URL) and `cap sync android` registered them. **Installed shells built before this cannot share**, so `lib/share-file.ts` probes `Capacitor.isPluginAvailable` at runtime and degrades to opening the image in the system browser. No release coordination needed.
- **Activation checklist:** (1) apply `20260810120000_release_recaps_drop_first_week_streams.sql` to any environment that doesn't have it yet (`20260810090000_release_recaps.sql` is already applied in production — see the doc-drift note above); (2) set `NEXT_PUBLIC_FEATURE_RELEASE_RECAP=true` in Vercel `Web` → Production; (3) changelog entry + minor version bump across all 10 `package.json` files (the EPK precedent: the ledger entry lands at flag-flip, not at merge); (4) verify with a real finished release, checking the deployed render actually loads the fonts; (5) native share arrives with the next store build.

---

## UrgAns release planner (2026-08-10)

The rebuild of v1 scope item 2, replacing the never-activated "Tailor plan" build. **Not a scope expansion** — this IS the release rollout planner the six-feature list already called for. Built flag-off; the migration is **not applied anywhere yet**.

**Why it was rebuilt rather than extended.** The old `POST .../tailor-plan` applied model output straight onto real task rows: a hard `DELETE` of the tasks the model named, then per-task description updates, with individual failures logged and skipped. Its own modal said *"Your full plan stays intact until you confirm."* There was no confirm. The draft-then-approve flow is the fix, and the whole feature is shaped around it.

**The shape.** Guided intake (7 questions, one per screen) → answers saved → a deterministic draft built from the template → UrgAns tailors that draft with a validated **delta** → the manager edits it → **Approve plan** is the only thing that writes to `tasks`.

- **Flag:** `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` (default off). Registered in `turbo.json` (the missing `STATUS_UPDATE` / `FILES` entries were added in the same pass) and `apps/web/.env.example`. The reader lives in `lib/release-planning.ts` because release creation needs it too. **Do not enable alongside `NEXT_PUBLIC_FEATURE_FIRST_WIN`**: that reveal celebrates a generated plan, and under the planner a new release has none yet (guarded in code as well as documented).
- **Model env:** `AI_PLANNER_MODEL`, read at the route and passed per call (the `AI_TAILORING_MODEL` convention it replaces).
- **The AI cannot add tasks.** `PlannerAiDelta` has four operations — drop (optional tasks only), adjust offsets, assign a role archetype to a real member, rewrite a why-line — and no add. This is deliberate and is the load-bearing answer to "never let the AI invent tasks from scratch": an invented task has no template row to validate against. The manager adds tasks by hand instead. `validatePlannerDelta` rejects the **whole** response on any fabricated id, any non-optional drop, any unknown assignee, or an out-of-range offset; the deterministic draft then persists untouched and the copy says "No changes made."
- **Degrades all the way down.** With no model configured, `generate` returns **200** with the untailored playbook draft and `doc.ai.failure = 'not_configured'`; the scene says so plainly and hides the per-phase redraft controls. The same 200-with-a-draft path covers a timeout, a rate limit, or unusable output. Erroring at the flow's front door would be worse than handing over a plan that is already valid.
- **Phases are derived, never stored as truth.** The template carries no phase field (single.ts marks its weeks in comments; only `tags` are machine readable), so `derivePlanPhase(offset_days)` buckets into Setup / Pre-release / Release week / Post-release at −29 / −8 / +7. Every server write recomputes it, so a client cannot lie about it. The boundaries line up with the playbook's own week banners, and a test asserts all four phases stay non-empty against the live template.
- **Offsets are canonical, dates are derived.** A draft task stores `offset_days`; absolute dates are computed from the release's *current* date everywhere, so moving a release date re-flows the plan for free instead of stranding it. Editing a date in the review UI converts back to an offset. A draft can exist on a dateless release; approval requires a date.
- **Table:** `release_plan_drafts` (`20260810110000_release_plan_drafts.sql`) — one row per release (`unique(release_id)`, which is also the upsert target and the structural double-generate guard), `release_id` **cascade** (deliberately unlike notes' set-null: a draft is derived state, unreachable without its release), `status check ('draft','approved')` with approved rows **kept** as the double-approve guard and provenance record, `doc jsonb`, owner-scoped four-policy RLS.
- **Approval is the careful path.** The draft is read from the database, never from the request. The row is **claimed** with a conditional `where status='draft'` update *before* any task is inserted, and the claim is released if the insert fails, so two clicks or two tabs cannot both schedule the same plan and a failure loses nothing. Assignees are validated against `loadWorkspaceMembers`; someone who left the team falls back to the owner **with a warning rather than a refusal**, because blocking approval over another person's membership change punishes the wrong user. Both `planner_pending` and `template_pending` are cleared — the latter matters because a pre-planner release can be planned here, and leaving that flag set would let the schedule route instantiate a duplicate 64-task plan the next time its date moved.
- **Approved rows are indistinguishable from template-instantiated ones** (`lib/release-planning-server.ts`, modeled on `instantiate.ts`): same `status:'todo'` plus soft blockers, `state:'planning'`, `auto_generated:true`, and the full `metadata.template` block so event milestones, catch-up bucketing and tags keep working with no special cases. A manager-added task gets only the two keys `lib/tasks-server.ts` actually reads (`task_type`, `compressed_runway`) plus a `metadata.planner` block recording its real origin — it claims no template provenance it does not have. This **must** be an in-process batch insert: `metadata` is not in `POST /api/tasks`'s field allowlist.
- **Release creation:** a new `planner_pending` marker in `releases.metadata` (`lib/release-planner-pending.ts`), **not** a reuse of `template_pending` — that flag's machinery instantiates the whole template the moment a date lands, which is exactly what a draft flow must prevent. With the flag on, a rollout-plan release is created with **no activities**; the schedule route needs no change (a planner release never carries `template_pending`, so it just writes the date). Onboarding releases land plan-less too, which is safe because `onboarding-ai-moment` reads the template directly and all six task ids it hard-references are non-optional, so no delta can drop them.
- **Entry points:** (1) the workspace empty state — `PlanReleaseCard` renders through the `activitiesBanner` slot with `bannerReplacesEmptyState`, so it IS the panel body rather than a card above one; (2) a note — a "Make a plan" pill in `NoteEditor`'s header row, hidden when the linked release already has activities, carrying the **live** draft body (capped at 2000 characters) into question seven; (3) three UrgAns chips, which **replace** the bare "New release" chip when the flag is on, plus a `plan|rollout|campaign` keyword branch inserted **before** the `release` branch in `resolveIntent` (order there is load-bearing).
- **One intake modal, mounted by `AppShell`** and opened through `usePlannerStore`. The three entry points live in different ownership islands, and threading a callback would touch a file per entry point. The store holds the launcher payload and the set of releases with a generate call in flight — **not** the draft, which lives in `usePlanDraft` inside the scene that edits it.
- **The review scene is `?scene=plan`**, inline in the activity slot like every other release scene (the settled founder call: not a modal). It is deliberately **excluded from the scene cache** — `CacheableSceneName = Exclude<SceneName, 'plan'>` makes that a compile-time fact rather than a comment, because painting a cached copy of a document under live edits could overwrite newer text with older. Autosave follows the notes editor's discipline: an 800ms debounce, one save in flight at a time, and a loop that re-reads the pending document after each round trip so text typed mid-save goes out on the next lap instead of racing.
- **Deleted with this work:** the tailor-plan route directory, `TailorPlanModal.tsx`, `lib/release-tailoring.ts`, the dead `lib/release-plan.ts` (zero importers — a legacy free-generation parser, the very shape this file forbids), and the tailor-plan entry in `lib/schema-fallback-guard.test.ts`'s baseline (a sanctioned ratchet-down; the new route group adds none). Six comments citing "the tailor-plan precedent" now cite the plan/EPK one.
- **Tests:** `lib/release-planning.test.ts` and `lib/release-planning-server.test.ts` (79 cases) cover intake parsing, phase boundaries against the live template, the readiness date ladder, both delta gates, the regenerate merge semantics that protect hand edits, and approval's date math, dependency translation, metadata shape and assignee fallback. `lib/scene-cache.test.ts`'s "prefetches every scene" invariant became "every **cacheable** scene", plus a test pinning the plan scene out of the cache in both halves.
- **Activation checklist:** (1) apply `20260810110000_release_plan_drafts.sql`; (2) optionally route the gateway and set `AI_PLANNER_MODEL` (the planner works without it, untailored); (3) set `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER=true` in Vercel `Web`; (4) changelog entry + minor version bump across all 10 `package.json` files (the EPK precedent: the ledger entry lands at flag-flip, not at merge); (5) verify end to end with a real release, including that approved tasks complete, block and reopen exactly like template ones.

---

## Web Push (2026-07-23) — doc-drift backfill

**This entire stack was built and shipped without ever being recorded here** — surfaced while building native push (below) per this file's own rule about flagging doc/code conflicts rather than silently picking one. It is the foundation the native-push work extends, not something native push introduced.

- **What it is:** browser/PWA push notifications via the Web Push standard (VAPID), plus a scheduled engagement drip and a founder broadcast console built on top of it.
- **Server sender — the single choke point:** `lib/push-server.ts` — `sendPushToUsers(adminClient, userIds, payload)` / `sendPushToAllUsers(adminClient, payload)`, `PushPayload = { title, body, url?, tag? }`. Uses `web-push` (VAPID). No-ops silently when `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` are unset; prunes `push_subscriptions` rows on a 404/410 send failure.
- **Browser half:** `lib/push.ts` (`isPushSupported()` — requires `PushManager` in `window`, so it is `false` inside the Capacitor native shell; `registerPushServiceWorker()`, `enablePush()`, `disablePush()`), `public/sw.js` (the service worker itself: `push` → `showNotification`, `notificationclick` → focus-or-open the payload's `url`), `components/settings/PushNotificationsSection.tsx` (the per-device Settings toggle — see the native-push entry below for how this component now branches).
- **Table:** `push_subscriptions` (`20260723120000_push_subscriptions.sql`) — one row per browser/device endpoint, owner-scoped RLS. Registered via `POST /api/push/subscribe` (upsert on `endpoint`), removed via `DELETE`.
- **Engagement drip:** `lib/engagement-server.ts` — on every login (`POST /api/engagement/login-ping`), a welcome push (6h cooldown) fires and the user's pending drip rows reset to a fresh schedule: `momentum_30m`, `comeback_1d/7d/14d/30d`. Delivery is `flushDueNotifications`, run from `/api/cron/notifications` (every 15 min) and opportunistically from the login-ping route itself.
- **Table:** `scheduled_notifications` (`20260723230000_scheduled_notifications.sql`) — a general-purpose delayed-push queue: `user_id, kind, title, body, url, send_at, sent_at, canceled_at`. Service-role only (RLS enabled, zero policies). Rows are claimed (`sent_at` set) before sending so overlapping flushers can't double-send, and marked sent even when the user has no devices — a reminder is a moment, not a debt to retry forever. Native push (below) and release reminders / weekly motivational nudges all queue into this same table.
- **Crons** (`apps/web/vercel.json`): `/api/cron/due-date-notifications` (hourly — the `task_due_soon`/`task_overdue` sweep, now also 7d/3d tiers and the weekly motivational sweep, see below) and `/api/cron/notifications` (every 15 min — the drip flusher). Both authenticate via `Authorization: Bearer ${CRON_SECRET}`.
- **Admin broadcast:** `/admin/broadcast` (`app/api/admin/broadcast/route.ts`) — `GET` previews reach (device/user counts from `push_subscriptions`), `POST { title, body, url? }` sends to every registered device via `sendPushToAllUsers`. Gated by `ADMIN_EMAILS` via `verifyAdmin` — app-operator access, not a workspace role. Ephemeral and device-scoped: nothing is written to the `notifications` table, so a user with push off or on an unsubscribed device never sees a missed broadcast.
- **Reach today:** browsers and installed PWAs (including, per Apple's rules, a Safari-installed iOS PWA — 16.4+). **Never reached the native Android/iOS shell** — neither Android WebView nor iOS WKWebView expose a `PushManager` — until native push (below).

## Mobile push notifications + editable presets (2026-08-10)

Founder request: automatic, periodic push notifications from a set of editable presets — a release re-engagement reminder, weekly motivational nudges, deadline reminders at 7/3/1 days, and (via the existing broadcast console above) manual new-feature announcements. Built flag-off; **not yet activated**.

- **The core addition is a second transport, not a second feature.** `lib/fcm-server.ts` sends via FCM HTTP v1 (hand-rolled — RS256 JWT signed with `node:crypto`, exchanged for an OAuth token, POSTed to `fcm.googleapis.com/v1/projects/{id}/messages:send` — deliberately not `firebase-admin`, which is ~60MB and would hurt Vercel cold starts for the one endpoint needed; the same "boring stack" call as the hand-rolled MCP JSON-RPC layer). `lib/push-server.ts`'s `sendPushToUsers`/`sendPushToAllUsers` now fan out to **both** `push_subscriptions` (Web Push) and the new `device_push_tokens` table (FCM/APNs), so every existing caller — task notifications, the engagement drip, admin broadcast — gains native reach with zero call-site changes.
- **Flag:** `NEXT_PUBLIC_FEATURE_NATIVE_PUSH`, default `false`. Gates the client-side bridge and the native variant of `PushNotificationsSection`; the server sender itself gates on `FCM_SERVICE_ACCOUNT_JSON` presence (the VAPID no-op pattern), and each notification category gates on its own preset `enabled` flag (see below) — so the flag only controls the native transport's client UI, not whether reminders/nudges exist at all.
- **Table:** `device_push_tokens` (`20260810130000_device_push_tokens.sql`) — a SEPARATE table from `push_subscriptions`, not a widened version of it: FCM/APNs tokens carry no p256dh/auth keypair, and adding nullable crypto columns to `push_subscriptions` would poison its existing queries and 404/410 pruning logic. Owner-scoped RLS, same shape. Same migration adds `profiles.motivational_nudges boolean not null default true` (the `ask_after_tasks` precedent).
- **Native client:** `@capacitor/push-notifications`. `components/providers/CapacitorPushBridge.tsx` (mounted by `AppShell`, the `CapacitorAuthBridge` template) is deliberately passive — it never prompts for permission itself, only (a) silently re-registers if the OS permission is already granted, keeping a rotated token fresh, and (b) listens for a tapped notification and deep-links into the app. The actual "Enable notifications" prompt lives in `lib/native-push.ts` + `PushNotificationsSection`'s native branch, called only from an explicit Settings tap — mirroring `registerPushServiceWorker()` (passive) vs `enablePush()` (active, user-initiated) exactly. `POST/DELETE /api/push/token` registers/removes a device's token, sibling to `/api/push/subscribe`.
- **`lib/notification-presets.ts` + `lib/notification-presets-server.ts`:** the editable presets — release-reminder steps, the motivational pool, and per-tier deadline copy, each with its own `enabled` switch — stored in the previously-unused `app_settings` KV table (`key: 'notification_presets'`) under service-role-only RLS. Hand-rolled field-by-field validation with default fallback (no schema library in `apps/web`; zod lives only in `apps/homepage`) — a missing or malformed field falls back to `DEFAULT_NOTIFICATION_PRESETS` individually, so the feature works before any admin ever opens the settings page. Edited at **`/admin/notifications`** (`ADMIN_EMAILS` via `verifyAdmin`, the broadcast-page pattern), including a "send test to me" button per category.
- **Release re-engagement:** `lib/release-reminders-server.ts` queues into `scheduled_notifications` right after a successful `POST /api/releases`, using the preset steps (defaults: +24h, +72h). **Required a real bug fix first:** `enqueueLoginDrip`'s cancel-on-login in `lib/engagement-server.ts` used to cancel **every** pending row for the user — any release reminder queued between logins would be silently wiped the next time the user signed in. It is now scoped to the drip's own kinds only (`DRIP_KINDS`). The flusher's push collapse-tag was also changed from a shared `'urganize-engagement'` string to `` `urganize-${kind}` `` per row, so a release reminder and a comeback nudge delivered through the same flusher no longer collapse-replace each other in the system tray.
- **Weekly motivational nudges:** `lib/motivation-server.ts`, run from the existing hourly `/api/cron/due-date-notifications` cron (no new Vercel Cron entry — the project's two existing crons already imply a paid plan, and an hourly check trivially covers a weekly cadence). Rotates through the preset pool deterministically (prior-send count modulo pool length) and records each send as an immediate `kind: 'motivational'` row in `scheduled_notifications` (the `WELCOME_STEP` shape). Per-user opt-out: `profiles.motivational_nudges` (default on), toggled in Settings via `MotivationalNudgesSection.tsx` (the `TaskCheckInSection` shape) — the only new opt-out this feature ships; release-reminder and deadline-reminder opt-outs are v2.
- **Deadline reminder tiers:** `lib/due-tiers.ts`'s pure `assignDueTier()` extends the due-date sweep from one forward-looking tier (24h) to three — 7 days, 3 days, 1 day. Two new `notification_type` enum values, `task_due_7d` / `task_due_3d` (`20260810140000_notification_type_due_tiers.sql`, bare `ALTER TYPE ... ADD VALUE`, not wrapped in a transaction — the `split_sheet` enum-add precedent), so the new tiers reuse the entire existing bell + unread-dedupe + push-mirror machinery for free; `task_due_soon` keeps its existing role as the 1-day/24-hour tier. `createDueDateNotificationsForAllUsers` (`lib/tasks-server.ts`) now calls `assignDueTier` instead of its old inline two-branch check, and loads presets once per sweep (not once per task) to pass tier copy through `buildTaskPushPayload`'s new `copyOverrides` param. **Timezones are deliberately untouched** — tier math stays UTC-instant, matching the sweep's pre-existing behavior; due dates carry known timezone sloppiness elsewhere (manual edits store a naive local wall-clock string), and fixing that was explicitly out of scope for this work.
- **Android is live in code; iOS is prepped but founder-blocked.** `apps/mobile/android/app/src/main/AndroidManifest.xml` gained `POST_NOTIFICATIONS` (required at runtime from API 33; `targetSdk` is 35 here); `apps/mobile/android/app/google-services.json` is committed once the founder generates it (not a secret — client config only; the stock Capacitor conditional-apply block in `app/build.gradle` already expects it there). `apps/mobile/ios/App/App/AppDelegate.swift` gained the two remote-notification callbacks `@capacitor/push-notifications` requires — inert until the founder adds the Push Notifications capability/entitlement in Xcode and an APNs key in Firebase (full checklist: `docs/mobile/push-setup.md`). Running `cap sync` for this work also fixed a pre-existing, unrelated staleness: the iOS `Podfile` was missing the `CapacitorFilesystem`/`CapacitorShare` pods from when those plugins were added.
- **Activation checklist:** (1) **founder** creates a Firebase project, registers the Android app, downloads `google-services.json` (commit it), generates a service-account key; (2) **founder** sets `FCM_SERVICE_ACCOUNT_JSON` in Vercel `Web` (server-only, not in `turbo.json`); (3) apply `20260810130000_device_push_tokens.sql` and `20260810140000_notification_type_due_tiers.sql`; (4) set `NEXT_PUBLIC_FEATURE_NATIVE_PUSH=true` + changelog entry + version bump across all 10 `package.json` files (the EPK precedent: the ledger entry lands at flag-flip, not at merge); (5) new Android binary with `versionCode` incremented (no installed-binary back-compat burden yet — no store release has shipped); (6) iOS later, per `docs/mobile/push-setup.md`, once the founder completes the Apple-side setup.

---

*Last updated: 2026-08-12 (the identity card's nav + Metadata's viewport-split entry point, URG-229 — this entry corrects the "Identity card gains a nav" section, which described the pill's retreat as a flat `lg:hidden` when the shipped code computes it from two other flags; see `METADATA_PILL_HIDE_CLASS`. Previously 2026-08-10: mobile push notifications + editable presets built flag-off, extending the previously-undocumented Web Push stack — now backfilled above — to the native Android/iOS shell; UrgAns release planner rebuilt flag-off, superseding the tailor-plan build; playlist pitching built flag-off, and Resolved blocker #1 corrected: the paywall has been OFF in code since 2026-07-23. The release recap card, Notes and task outcomes from 2026-08-09 are also still flag-off; genre prediction from 2026-08-08 and the native mobile app entry from 2026-08-07 are otherwise still current).*

---

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel — monorepo, TWO projects from this one repo:
  - `Web` → https://app.urganize.app (builds `apps/web`)
  - `the-urganization` → https://www.urganize.app (builds `apps/homepage`; bare `urganize.app` 307s to www)
  - Both use `npx turbo-ignore @urganize/<app>` as the Ignored Build Step, so a push only rebuilds the app it touched.
- Production URL: https://app.urganize.app (product) / https://www.urganize.app (marketing)
- Deploy workflow: auto-deploy on push to `main` (production); PRs get preview deployments
- Deploy status command: none (no vercel CLI installed) — poll the production URLs
- Merge method: squash
- Project type: web app (SaaS product + marketing site, Next.js App Router)
- Post-deploy health check: `https://app.urganize.app/auth` must return 200 (public page that exercises the web app end to end); `https://www.urganize.app/` must return 200

### Custom deploy hooks
- Pre-merge: `pnpm test && pnpm lint && pnpm build`
- Deploy trigger: automatic on push to main
- Deploy status: poll production URLs until the new deployment serves (script asset hashes change)
- Health check: `curl -sf https://app.urganize.app/auth` and `curl -sf https://www.urganize.app/`

### Versioning (reversed 2026-07-13 — the repo now tracks a version)

The earlier decision (2026-07-10) NOT to version was an early-stage call and has been **reversed**. The product now has a tracked, incrementing version.

- **Single source of truth:** `packages/changelog/src/index.ts` (the `@urganize/changelog` workspace package — corrected 2026-08-04; this section previously named `apps/homepage/content/changelog.ts`, which is now only a re-export shim of the package, so edits must go to the package). The **top entry's `version`** is the current product version, exported as `CURRENT_VERSION` (derived from `changelog[0].version`, so it can't drift). There is no separate VERSION file — the ledger is the record.
- **All `package.json` versions mirror it.** Root + every workspace (`apps/*` — including `apps/mobile` — and `packages/*`; 10 files as of 2026-08-04) carry the same number. They are bumped together with the ledger, never independently.
- **App-only scope (founder decision, 2026-07-18):** the changelog and the version track the product app (`apps/web`) ONLY. Marketing-site (`apps/homepage`) changes, however visible on the site (homepage copy, pricing display, OG/share images, brand/team/press/roadmap pages), never earn a ledger entry or a version bump. Pricing display updates count as marketing under this rule. Applied retroactively on 2026-07-18: marketing entries were purged from the ledger and the version recalculated (0.14.7 dropped to 0.14.3). Removed numbers stay retired, survivors keep their historical numbers, and gaps in the sequence are expected.
- **Current version:** whatever the ledger's top entry says, always read it from there. Do not restate the number in this file: an earlier revision hardcoded `0.10.0` here and drifted. Versions before v0.10.0 in the ledger are reconstructed milestones; strict per-release semver applies from v0.10.0 forward.
- **Bump rules (pre-1.0 semver):** patch (`0.10.x`) = fixes/polish; minor (`0.x.0`) = new user-facing feature(s). **`v1.0.0` is reserved for AI activation** — the moment Chappi + the rollout planner + the status generator are switched on for users.
- **`v1.0.0` note:** at 1.0, "breaking change → major" semver begins in earnest; until then the middle number is the feature counter.

### Release procedure (how to ship a version)

When shipping a **user-facing app change** (a new feature, visible behavior change, or bug fix in `apps/web` that a user of the product would notice):

1. Add a release entry at the **top** of `changelog` in `packages/changelog/src/index.ts`: `{ version, date, highlights }`. Bump `version` per the rules above; `date` is a display string (e.g. `"July 13, 2026"`); `highlights` are plain-English, benefit-framed, no jargon/file names — match the existing voice. Batch same-day changes into one entry rather than minting a version per commit.
2. Set every `package.json` `version` (root + all workspaces) to the new number.
3. That's the whole ceremony — no git tag, no separate CHANGELOG.md. Production still deploys continuously from `main`; the ledger renders publicly at `/changelog` with a "current version" badge.

Skip internal-only work (refactors, dependency bumps, test/tooling, docs) AND all marketing-site (`apps/homepage`) work, however visible on the site: neither earns a ledger entry, and neither requires a version bump (see the app-only scope rule under Versioning). gstack `/ship`'s version step now **applies** here (steps 1–2 above) rather than being skipped, but only for `apps/web` changes; PR titles still use plain conventional-commit prefixes (no `vX.Y.Z` prefix).
