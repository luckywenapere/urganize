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

**Scope expansion (2026-08-10):** a fifteenth surface, **playlist pitching**, was consciously sanctioned by the founder (agent brief, 2 of 4). It is the largest expansion so far and the only one that adds **a new kind of user**: a `curator` (a playlist owner), invited by link, who belongs to no team and can never see a release, a task, a file or any other team data. (**Amended 2026-08-13:** one person can now hold both sides under one email — curator-ness became a capability rather than a role, so a playlist owner can also run releases. The isolation above is unchanged and still describes a curator-ONLY account; see "Dual-capability accounts" in the playlist-pitching Working-notes section.) Teams pitch a song from a release to a curator's playlist with a link plus a note of up to 300 characters; the curator answers New / Listened / Added / Passed with an optional one-line reply, and that answer shows back on the release. Free in v1, so no billing surface is touched. It moves nothing off the out-of-scope list below: the nearest line, "third-party music platform integrations", is **not** crossed — nothing calls a DSP, a playlist is a row a curator typed in and a follower count is self-reported. It honors the release-spine principle on the team side (a pitch exists only for a release). **Two things about it are genuinely new to this codebase and are the reason to read `supabase/migrations/20260810100000_playlist_pitching.sql` before touching it:** (1) the first cross-tenant read, so `playlist_pitches` carries two SELECT policies, one per side, and no write policy at all; (2) the first non-team account type, contained at three chokepoints — `blockCuratorAccount` inside `requireActiveAuthenticatedUser` (so every protected team route 403s a curator), the curator bail in `loadWorkspaceAccessContext`, and the guard inside `ensureOwnedWorkspace` that stops a curator ever being handed a team of their own. Four tables (`curator_invites`, `curator_profiles`, `curator_playlists`, `playlist_pitches`) plus a widened `profiles_role_check`. Flag-gated behind `NEXT_PUBLIC_FEATURE_PITCHING` (default off; every `/api/curator`, `/api/pitching` and `/api/admin/curator-invites` route 404s and the `/curator` pages bounce when off). This is the ninth sanctioned expansion — the "do not exceed" rule still holds for everything else.

**Scope expansion (2026-08-14):** a sixteenth surface, **fan email capture**, was consciously sanctioned by the founder. It moves nothing off the out-of-scope list below, and the two nearest lines are worth naming because the distinction is the whole reason this is buildable: **"pre-save campaigns" is NOT crossed** — nothing calls a DSP, and the destination is a plain URL the manager types, so this is a link-and-a-graphic page, not a pre-save mechanism; **"listener profile generation" is NOT crossed** — a lead is an email address on one release's page, never merged across releases and never enriched. It honors the release-spine principle: a capture page exists only for a release. Per release, the owner authors one public page (`/capture/[token]`) with a graphic, a headline, an incentive line and a destination link; a fan gives an email and the link is revealed **on the same screen**, and the collected emails come back in-app for export. Storage and display only — nothing in this product sends email, and there is no ESP integration. **The documented conversion knowledge is the point of the feature, not decoration:** `lib/capture-playbook/` is a hand-written, version-controlled markdown source plus a deterministic TS grader (the `release-templates` discipline applied to a surface that could easily have been a prompt), and it grades the page live as the manager writes it. **No AI anywhere in it** — a model asked "is this headline good" answers differently every time and cannot be tested. Flag-gated behind `NEXT_PUBLIC_FEATURE_CAPTURE` (default off; every capture API route 404s and the public page 404s when off). This is the tenth sanctioned expansion — the "do not exceed" rule still holds for everything else.

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
- **Payments:** Paystack, server-initiated recurring checkout (`POST /api/billing/start-checkout` → Paystack hosted page → webhook credits by `payments.reference` / `metadata.user_id`). **Three tiers** defined in `packages/pricing` (the single source of truth for both the marketing /pricing page and the in-app /locked picker): two self-serve recurring tiers — Monthly ₦3,500 / $100, Annual ₦35,000 / $1,000 (per year); the NGN legs were repriced 2026-08-16 and the USD legs deliberately were not, so the two currencies no longer describe the same offer (see the 2026-08-16 reprice note in Working notes) — plus **Label, a sales-led tier** (`contactSales: true` in `packages/pricing`; no displayed price, no self-serve checkout — both surfaces render a "Contact us" mailto to `SALES_CONTACT_EMAIL` instead of a price + Subscribe/Join button, since a roster deal is scoped and quoted per label by the founders). Monthly/Annual Paystack plan codes come from env (`PAYSTACK_PLAN_{MONTHLY,ANNUAL}_{NGN,USD}`); **Label has no self-serve checkout, so its Paystack plans are intentionally not wired** (the prior "create the LABEL plans" TODO is retired — see the 2026-07-15 Label note in Working notes). Legacy: standalone Payment Page (flat ₦15,000 access SKU, `urganize.app/pay` vanity URL) credits by `customer.email` for grandfathered users; `plan: 'custom'` rows are admin-provisioned relics. The webhook at `api/webhooks/paystack` validates HMAC-SHA512.
- **Analytics:** PostHog (browser + node) in `apps/web`. Vercel Analytics in both apps. Google Analytics in homepage. Formbricks survey provider in homepage.
- **Customer support:** WhatsApp deep link to the founder (`https://wa.me/2347067367057`). With `NEXT_PUBLIC_FEATURE_CHAPPI` OFF (prod today): the floating pill in `apps/web/components/support/SupportChat.tsx` (label cycles "Chat with the founder" / "Report a bug" / "Contact support"). With the flag ON: the pill is replaced by the assistant's surfaces — the floating **ChappiDock** at bottom-right below lg, the **UrgAns side rail** (`ChappiSidePanel`) at lg+ — and the WhatsApp link lives in their footers (AI-first entry, human fallback one tap deeper). Replaced the former Tawk.to widget (2026-06-11); the `NEXT_PUBLIC_TAWK_*` env vars are retired.

---

## AI integration

**Provider routing layer:** `apps/web/lib/ai/provider.ts` — handles retry + timeout. Routes through one of three OpenAI/Ollama-protocol gateways depending on `AI_API_BASE`'s hostname: the Zuplo gateway (`qwen2.5:3b`, Ollama-style `/api/chat`), OpenRouter (`openrouter/free`, OpenAI-style `/api/v1/chat/completions`), or **RodiumAi** (`api.rodiumai.io`, same OpenAI-style protocol at `/v1/chat/completions`) — added 2026-08-13, see the RodiumAi note below.

**2026-08-13 cost decision (founder call): route through RodiumAi, cheapest-working-model-first, explicitly NOT Anthropic.** `AI_API_BASE=https://api.rodiumai.io` + an `rd_sk_…` key as `AI_API_KEY`. Default model is `openai/gpt-4o-mini`; override per feature with `AI_PLANNER_MODEL` / `AI_STATUS_MODEL` / `AI_OUTCOME_MODEL`. This supersedes the "Claude Sonnet / Claude Haiku" guidance below, which is stale: no code enforces a model, so the .env is the actual source of truth for what's live.

**RodiumAi's free tier (six `meta/llama-*` models, 1M tokens/day) was tried FIRST and rejected — do not default back to it.** Confirmed live against the API 2026-08-13: every free-tier model is served via AWS Bedrock, and Bedrock's Meta license blocks the account's region outright (`"Access to Meta Llama models is not allowed from unsupported countries, regions, or territories"`, `code: ValidationException`) — not a RodiumAi bug, not a code bug, an upstream licensing wall. `openai/gpt-4o-mini` was verified working in the same session (real `tool_calls`, correct arguments) and is the fallback: not free, but cheap (~$0.15/$0.60 per 1M in RODI terms) and OpenAI's function-calling is a known quantity rather than an open question the way Bedrock's Llama tool support was. If a future session is tempted to switch back to a free `meta/llama-*` model for cost reasons, re-test the geo-block first — it may be specific to this account's region, but nothing here proves it will lift for a different account.
- **Release rollout planner:** structured-JSON delta contract against a 64-task list — needs a model that reliably holds JSON shape. Per-call override env: `AI_PLANNER_MODEL`.
- **AI status update generator:** plain-text, shorter, runs more often, lower cost per call — the default model is fine as-is.

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
- **Transport — the deliberate exception, rewritten 2026-08-13:** Chappi still uses its OWN transport and OWN credentials, separate from `lib/ai/provider.ts` — but the transport itself changed. It originally used the official `@anthropic-ai/sdk` against Anthropic's native Messages API; that's now gone (dependency removed from `apps/web/package.json`). **Why:** the founder's 2026-08-13 cost call (see the AI integration intro above) is to run everything, UrgAns included, on RodiumAi — and RodiumAi's Anthropic-compatible `/v1/messages` endpoint is documented as Claude-only ("Claude-first MVP"), so it can't serve a non-Anthropic model at all. `lib/chappi/runner.ts` now speaks **plain OpenAI-protocol chat completions** (hand-rolled `fetch`, no SDK — same "boring stack" call as the hand-rolled MCP JSON-RPC layer) against `CHAPPI_API_BASE` (default `https://api.rodiumai.io/v1`), with `tools`/`tool_calls` in the OpenAI shape rather than Anthropic's `tool_use`/`tool_result` blocks. `lib/chappi/tools.ts`'s `getChappiToolSchemas()` now emits the OpenAI `{type:'function', function:{name,description,parameters}}` envelope instead of Anthropic's `{name,description,input_schema}` — the MCP tool registry (`lib/mcp/tools.ts`) was never coupled to this (it already read the registry's own `inputSchema` field directly) so it needed no change beyond an updated comment. Env: `CHAPPI_MODEL` (a tool-capable RodiumAi catalogue id — `openai/gpt-4o-mini`, verified working live 2026-08-13: real `tool_calls`, correct arguments), `CHAPPI_API_KEY` (an `rd_sk_…` key, separate from `AI_API_KEY`), optional `CHAPPI_API_BASE`. **Do not default `CHAPPI_MODEL` to a `meta/llama-*` free-tier id** — see the geo-block paragraph in the AI integration intro above; it applies to this transport exactly as much as to `lib/ai/provider.ts`'s. Capability still gates on `CHAPPI_MODEL` being set to a real model. **Any future gateway swapped in here must speak OpenAI-style `tools`/`tool_calls`** — that's now the hard requirement, not "must be Anthropic's SDK".
- **Backend:** `app/api/urgans/route.ts` (renamed from `app/api/chappi/route.ts` in URG-212; POST, `maxDuration = 60`, auth via `requireAuthenticatedAdmin`) → `lib/chappi/{config,tools,dispatch,system-prompt,runner}.ts`. A tool-calling loop **capped at 5 rounds**. Conversation state is **ephemeral** (client-held; no DB table, no migration — consistent with the CUT_PLAN removal of AI tables).
- **Tools (45 as of 2026-08-14, split across `lib/chappi/tool-families/*`):** `tools.ts` is now only the facade — it assembles `CHAPPI_TOOLS` from `core.ts` (the original twelve), `releases.ts`, `planner.ts`, `metadata.ts`, `calendar.ts`, `notes.ts`, `team.ts`, `promo.ts` and re-exports `getChappiTool`/`getChappiToolSchemas`, so no import site outside `lib/chappi/**` changed. Core: read (`list_releases`, `get_release`, `list_tasks`, `get_dashboard`) + mutate (`create_release`, `create_task`, `create_note`, `update_task`, `complete_task`, `reopen_task`, `generate_status_update`, `navigate`). Added by the full-control expansion: `update_release`, `schedule_release`, `delete_release`, `delete_task`, `add_task_comment`, `list_notes`, `update_note`, `delete_note`, `list_workspace_members`, plus the planner four below.
- **The rollout questionnaire runs in the chat (2026-08-14).** `tool-families/planner.ts` exposes `get_release_plan`, `generate_release_plan`, `approve_release_plan` (gated), `discard_release_plan` (gated), and the system prompt carries the seven intake questions as an interview script. The division of labour is the thing to preserve: the MODEL collects answers in natural language and normalizes them to the enum values; **`parseReleasePlanIntake` — the same validator `POST …/plan/generate` uses — decides whether they are valid**, and its per-field error is relayed verbatim so the model re-asks ONE question instead of restarting the interview (`buildPlanIntake` in that file is the seam, unit-tested in `plan-intake-args.test.ts`). The plan itself still comes from the hand-crafted playbook via the existing route, so "AI tailors templates, never invents from scratch" is untouched — the chat replaces the seven-screen modal as an input method, nothing more. `get_release_plan` returns per-phase COUNTS, not the draft document: a draft is ~60 tasks and returning it would crowd out the conversation.
- **The confirmation gate (2026-08-14) — read this before adding a mutating tool.** A tool carrying a `confirm` builder is **confirmation-gated**: the model may PROPOSE it, but `runner.ts` refuses to execute it and instead returns a `pendingConfirmation` the client renders as an inline card; only the user's Approve click POSTs back with `confirmedAction`, which the route executes through the ordinary `executeToolCall` (so every per-tool ownership/flag/dependency check still runs). **The security property is that a gated tool is never reachable from inside the model loop**, so text living in workspace data — a release title, a note body — cannot talk the model into a deletion. Three consequences: (1) the gate lives in `runner.ts`, NOT `dispatch.ts`, which is shared with MCP; (2) every gated tool must be in `lib/mcp/tools.ts`'s `EXCLUDED_TOOL_NAMES`, since MCP has no card to show — `tool-registry.test.ts` asserts that structurally, alongside "every `delete_*` tool is gated"; (3) gating is driven by the `confirm` builder's presence, not by `ChappiToolKind`, because `approve_release_plan`-style tools need approval without being destructive and only the tool can write entity-specific copy ("Delete 'Midnight EP' and its 42 activities"). **The gated set is a founder decision, not a code smell — it is "deletes plus anything else that can't be taken back", which is why three non-deletes are on it.** Currently twelve: `delete_release`, `delete_task`, `delete_note`, `delete_content_calendar` (cascades its posts), `delete_content_post`, `delete_recap`, `approve_release_plan` (irreversible in bulk — writes ~60 task rows), `discard_release_plan`, `invite_teammate` (sends an email to a real person), `remove_teammate` (revokes access immediately), `pitch_song` (lands in a curator's inbox and cannot be unsent), `revoke_epk_link` (breaks a URL that may already be in someone's email). `resolveToolInvocation` in runner.ts is the pure, unit-tested decision (execute / propose / refuse-second-proposal).
- **Reads in the newer families go through REST, not the services** — a deliberate deviation from the core family, recorded in `tools.ts`'s header. It keeps each domain's feature flag and ownership rules defined once (in the route) and makes the flag-off 404 translatable per request via `isFlagGateOff`. **`update_release` and `update_release_metadata` must read-then-merge**: both PATCH routes behave like PUTs, so a sparse body nulls whatever it omits — a "just set the genre" call would otherwise wipe the ISRC. `update_release` additionally must NOT echo back the `status` it reads: `GET /api/releases/[id]` overwrites that field with a COMPUTED value that can never be `released`, so round-tripping it would rewrite the stored status.
- **Prompt-injection note:** the gate covers irreversible actions only. Reversible mutations (create/update/complete) remain callable by the model directly, so hostile text in workspace data could in principle nudge one. Accepted: they are all visible and undoable in-app, and gating everything would make the assistant unusable. `create_note` (2026-08-13) is the one tool gated on a feature OTHER than Chappi's own: rather than filtering the registry (a `NEXT_PUBLIC_*` read would be inlined at build time), it translates the notes route's flag-off 404 into a polite refusal at call time — the `generate_status_update` precedent. It matches the flag gate's exact `'Not found.'` body so the route's OTHER 404, `'Release not found.'` from the ownership check, still reaches the model intact. Mutating tools call the existing REST endpoints via internal fetch — preserving template instantiation, assignee validation, and notifications rather than reimplementing them — EXCEPT completion, which goes through the new `TaskService.completeTaskWithCascade` (+ `reopenTask`). That method replicates the dependency-blocker gate + cascade-unlock that otherwise lived only in `useTaskStore.completeTask`, so a Chappi-driven completion can't bypass it. Every mutating tool re-validates the model's ids against live rows server-side; the system-prompt workspace snapshot is a hint, not the guard.
- **Frontend:** `app/dashboard/urgans/{page.tsx,ChappiPageClient.tsx}` (the route — auth guard + its own `CreateReleaseModal` instance, mirroring `WorkspaceView`), `components/chappi/ChappiConversation.tsx` (the conversation surface itself — empty-state quick-action cards when `messages` is empty, a scrolling transcript once it isn't; takes `variant: 'page' | 'panel'`), `stores/useChappiStore.ts`, `lib/chappi/{types,intent-router}.ts`. Chips run deterministic actions instantly (no round-trip) and are recorded as a turn either way; free-text sends the full `messages` history to the agent, falling back to the intent-router on failure or deterministic mode. The "Today's focus" chip opens the task cross-page (`router.push('/dashboard?release=...')` then `openTask(id)`, same pattern `NotificationsBell` uses) since the task detail view renders on the workspace page, not here.
- **Floating dock (2026-07-15, URG-137):** `components/chappi/ChappiDock.tsx` — a Linear-"Ask Linear"-style bottom-right panel mounted app-wide by `AppShell` (flag on → dock replaces the SupportChat pill; the WhatsApp founder link moves into the dock footer). Hosts `ChappiConversation variant="panel"`; shares the SAME global `useChappiStore` conversation as the page, so the expand control (→ `/dashboard/urgans`) carries the transcript. Open state persists via `lib/persisted-state.ts` (`urganize.chappi.dock-open`); `Ctrl/Cmd+J` toggles (listed in HelpMenu shortcuts); renders `null` on `/dashboard/urgans` itself. Z-tiers: launcher `z-50`, open panel `z-[130]` — deliberately below the modals (`z-[170]`+) Chappi can open, and NO Escape-to-close (modals own Escape). **Since 2026-08-03 (URG-210) the dock is the BELOW-lg surface only** (pill + panel carry `lg:hidden`); at lg+ the side rail below owns the assistant and `Ctrl/Cmd+J` routes to it.
- **UrgAns side rail (2026-08-03, URG-210):** `components/chappi/ChappiSidePanel.tsx` — originally the catalog-only `?chat=1` slide-in (2026-07); now a layout-flow right column mounted by `AppShell` beside `<main>` on EVERY chrome page at lg+ (content narrows, nothing is covered; renders nowhere on `/dashboard/urgans` — the page IS the chat). Open state is `useChappiStore.railOpen`, persisted at `urganize.chappi.rail-open` and hydrated by AppShell; the first assistant-page visit of a session (the login landing when the flag is on) ARMS it open once per session (sessionStorage `urganize.chappi.rail-armed`), and a user close sticks for the rest of the session. The topbar UrgAns icon toggles the rail at lg+ / navigates to the page below lg; the rail carries expand / new-conversation / close controls plus the WhatsApp founder footer. `useChatPanel.ts` and the `?chat=1` param were deleted (a URL param can't survive navigation). **Also 2026-08-03 (URG-210): the assistant's user-facing name is `UrgAns`** — every user-visible string (headers, launcher, page title, placeholders, aria-labels, API error copy, system-prompt self-reference) says UrgAns; files, components, stores, env vars (`CHAPPI_*`, `NEXT_PUBLIC_FEATURE_CHAPPI`), and storage keys deliberately keep their Chappi names (zero deployment risk). "Chappi" in code identifiers is expected; in rendered copy it's a bug. **URG-212 (2026-08-04) went one step further and renamed the URLs too:** `/dashboard/chappi` → `/dashboard/urgans` and `/api/chappi` → `/api/urgans` (the old dashboard path 308-redirects, since the flag was already live in production when this shipped — see the note below). Everything else named above (files, components, stores, env vars, storage keys) still deliberately keeps its Chappi name.
- **Status:** live in production (flag on, `CHAPPI_MODEL`/`CHAPPI_API_KEY` set — see the RodiumAi notes above). Delete tools + the confirmation gate landed 2026-08-14, closing the two longest-standing deferred items. **Song upload landed 2026-08-16** (`get_song` + `upload_song`), partly closing the file-upload item this list had deferred — the transport constraint it named is real and unchanged (no tool can ever be handed a file), so the tool resolves the release and the BROWSER uploads, via a picker card the assistant puts in the transcript. See "Song upload" in Working notes. Deletion from chat is still deferred, and other asset categories still have no tool. **Still deferred:** cross-session persistence (conversation is ephemeral — a reload starts fresh, which also drops any un-approved confirmation card; safe, since nothing ran), file DELETE tools and uploads for asset categories other than the song, task-outcome writes (a deliberately human moment — the agent must never author one), and batching several proposals into one card (one gated proposal per turn today).

---

## Deployment

**Hosting:** Vercel, two projects pointing at the same GitHub repo:

- `the-urganization` → `urganize.app` → builds `apps/homepage` (`pnpm turbo build --filter=@urganize/homepage`).
- `Web` → `app.urganize.app` → builds `apps/web` (`pnpm turbo build --filter=@urganize/web`).

Both use `npx turbo-ignore @urganize/<app>` as the Ignored Build Step.

**CI/CD:** Vercel git integration only. No GitHub Actions. No automated tests. `pnpm lint` is the only CI gate.

**`vercel.json` lives at the REPO ROOT, and only there (found 2026-08-12).** Both Vercel projects have Root Directory `.`, so Vercel reads `/vercel.json` for both and **never reads `apps/*/vercel.json` at all**. Those per-app files look authoritative and are inert. This cost real delivery: the two cron jobs were declared in `apps/web/vercel.json`, so they were never registered with Vercel — the Cron Jobs tab sat on its empty-state tutorial while the hourly due-date sweep and the 15-minute notification flusher had simply never run. The engagement drip masked it, because that path also runs opportunistically from `POST /api/engagement/login-ping` on sign-in and so kept working without a cron. Consequences to keep in mind:
- **Cron paths must exist in `apps/web`, but they register on BOTH projects.** `the-urganization` also registers `/api/cron/*` and 404s them every hour, since those routes only exist in the product app. Accepted as harmless noise. The clean fix is setting the `urganize` project's Root Directory to `apps/web` so it reads that app's own file, but that changes how the monorepo install/build resolves and must be validated on a preview deploy before anyone tries it. If Root Directory ever does change, **the crons have to move with it** or they silently vanish again.
- **`apps/homepage/vercel.json` is inert too.** It sets `NEXT_PRIVATE_BUILD_WORKER=webpack` for the homepage build, and that has never taken effect. Left alone deliberately: hoisting it to the root would apply it to the product app's build as well.
- Crons register **on production deployment**, so a change to the block only takes effect after it merges to `main`.

**The Vercel account is on the HOBBY plan, which caps cron jobs at once per DAY (2026-08-12).** Any expression that would fire more often — `0 * * * *`, `*/15 * * * *` — **fails the deployment**, it does not degrade. Both schedules in this repo were exactly that, so even once they were moved to the file Vercel reads, the deploy failed until they were made daily. The two problems had been hiding each other: sitting in an unread file, the illegal schedules were never validated. Correcting an assumption recorded elsewhere in this file: two cron entries do **not** imply a paid plan.

Current schedules, both daily and both approximate — Hobby precision is ±59 minutes:
- `/api/cron/due-date-notifications` at `0 7 * * *` (≈08:00 WAT) — the deadline sweep plus the weekly motivational nudge.
- `/api/cron/notifications` at `0 8 * * *` (≈09:00 WAT) — the `scheduled_notifications` flusher.

**What daily costs, and what it does not.** The deadline tiers (7d/3d/1d) and the weekly nudge are unaffected in substance: both are day-granularity, and the nudge's gate is "has this user had one in the last 7 days", not a function of sweep frequency. What genuinely degrades is `momentum_30m`, the drip step meant to land 30 minutes after a login — a once-daily flusher cannot honour that. It partly survives because `POST /api/engagement/login-ping` also flushes opportunistically, so the step goes out on the user's *next* sign-in rather than 30 minutes into the current one. Restoring true 30-minute behaviour means Pro, not a code change.

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

**Commit authorship (2026-08-27, founder call; audited 2026-08-28).** Every commit in this repo should be authored **`Lucky Wenapere <luckydio10@gmail.com>`** — that address is the one GitHub resolves to the account, so it is what makes blame, the contribution graph and Vercel's per-deployment attribution read correctly. The 2026-08-28 audit found 629 of the 631 commits on `main` authored that way (one other author is `prosper20`, a real contributor; the single exception is recorded in the last bullet). Three things hold that in place; do not remove any of them without replacing it:

- **`.claude/settings.json`** carries `attribution` (`commit: ""`, `pr: ""`, `sessionUrl: false`), which suppresses the assistant's commit trailer, PR-description line and session link, and a `SessionStart` hook that sets the **repo-local** identity (`.git/config` only — never the machine's global config). A fresh container's global git identity is not this one, so the hook is what corrects it each session. Project hooks require the workspace-trust step, so on the very first session in a new clone it may not have run yet — check `git config --local user.email` before the first commit.
- **Keep squash as the merge method** (already recorded under Deploy Configuration) — but know exactly what it does and does not cover, because this bullet overstated it until 2026-08-28. Under squash, GitHub rewrites author → PR author and committer → `GitHub`, and re-signs the result, which is why merged work on `main` reads correctly and shows Verified. **It governs the merge path and nothing else.** Measured 2026-08-28: of 631 commits on `main`, **381 were committed by GitHub (squash) and 248 arrived by direct push** — and a direct push keeps whatever identity the container had, since no squash rewrite ever sees it. So there are two ways this regresses, not one: switching to a merge commit or a rebase merge (which lands branch commits verbatim, carrying whatever identity and signature they were made with), and pushing straight to `main` from a container whose identity was never corrected. The second is not hypothetical — it produced `1408c76` (see below). **The repo-local identity hook in the first bullet is the only thing covering the direct-push path**, so `git config --local user.email` is worth checking before any direct push to `main`, not just before the first commit of a session.
- Commits already on `main` that carry an assistant trailer are history and stay as they are; removing them would mean rewriting and force-pushing the branch Vercel deploys from. The 2026-08-28 audit put numbers on it: **319 of 631 commit messages** carry a `Co-authored-by:` trailer or a session link (194 the trailer alone, 125 both), spanning 2026-05-14 to 2026-08-27. Those affect neither authorship, blame nor the graph — GitHub just renders a co-author on the commit page. **One commit is a genuine exception and was deliberately left alone (founder call, 2026-08-28): `1408c76` ("feat(urgans): put overdue work… (#384)", 2026-08-24) is authored AND committed by `Claude <noreply@anthropic.com>`**, because it was a direct push and nothing reattributed it. Re-authoring it means rewriting the 42 commits from it forward, and **41 of those are GitHub-signed** — any rewrite re-signs them with the container's key (`/home/claude/.ssh/commit_signing_key.pub`, which is not registered to the account) or leaves them unsigned, so 41 commits would flip Verified → Unverified permanently, `abc407a` among them. One Claude-authored commit out of 631 was judged the cheaper of the two. Do not "tidy" this later without re-reading that trade.

---

## Resolved v1 blockers

All seven blockers identified during the v1 cut have been resolved.

1. **Subscription gating implemented; the gate is ON again since 2026-08-22, by the TEAM path.** `NEXT_PUBLIC_FEATURE_HARD_PAYWALL` is live in production, so `requireActiveAccount` (`apps/web/app/api/_shared/paywall.ts`) takes its team branch — allowlist, then `getTeamAccessForUser`, then **402** with `reason: 'team_trial_expired'` — and that branch runs **before** the free-era `if (userId) return null;`, which is now only the flag-OFF path. The client bounce follows the same switch (`HARD_PAYWALL_BOUNCE_ENABLED` in `apps/web/lib/auth-store.ts`); the old `PAYWALL_LOGIN_BOUNCE_ENABLED = false` likewise governs only the flag-off path. Full detail in "Team trial + hard paywall" under Working notes. **What is gated is now a TEAM, not an account** — the per-user machinery described below still computes the owner's snapshot, but entitlement is the resolver's combined answer, which is what finally closes the teammate-inheritance landmine this entry used to name as the blocker on restoring the paywall. **Curator accounts stay free, as this entry always required:** they never reach `requireActiveAccount` (curator routes use `requireCuratorUser`, and team routes reject curators first), and `requireCuratorUser` deliberately does not wrap the gate — do not "unify" it, or every playlist owner is locked out. Two earlier headings on this entry were both wrong in their turn (`"globally on"` until 2026-08-10, then `"currently OFF"` until now), so treat the flag, not this line, as the authority. The original per-user description follows. Four-state access model (`unpaid | trial | paid | expired`) computed by `getSubscriptionSnapshot` in `apps/web/lib/subscription-access.ts` from `subscriptions.status`/`expires_at` + new `profiles.trial_*` / `paid_at` columns + `is_subscribed` back-compat. `requireActiveAccount(userId, email)` returns **402** + `{ redirect: '/locked', reason }` when blocked; wrapped by `requireActiveAuthenticatedUser` and applied to ~30 protected routes. Open routes (auth, payments/verify, webhook, trial/start, subscription-status, paywall-status, admin/*, account/delete-now, user/onboarding, pricing-validation) keep `getAuthenticatedUser`. 28-day no-card trial via `POST /api/trial/start`. `/locked` page with a three-plan picker (Annual / Monthly / Label radio cards from `@urganize/pricing`) + Start 28-day trial button (`apps/web/app/locked/page.tsx`). Frontend `window.fetch` monkey-patch in `apps/web/lib/access-redirect.ts` redirects same-origin 402 responses to `/locked`. 6-email allowlist at `apps/web/lib/paywall-allowlist.ts` bypasses the gate entirely (lowercased + trimmed comparison, logs `[paywall-allowlist]` on bypass). Vanity payment URL `urganize.app/pay`. The legacy `app_settings.global_paywall` toggle is no longer consulted; the snapshot fallback is now fail-CLOSED. → `f71a7c9` (initial), `02efe0b` (full gating + vanity URL, PRs #46, #47).
2. **Paystack webhook persistence added** — `charge.success` handler looks up the payment by reference, upserts `subscriptions`, and sets `profiles.is_subscribed = true`. Idempotent via upsert on `user_id`. → `6ed3125`
3. **`activity_log` / `activity_logs` deduplication completed** — v1 cut migration migrated data from `activity_log` (singular) into `activity_logs` (plural) and dropped the old table. → `d23dfea`
4. **`Db*` type drift removed** — `DbRelease`, `DbTask`, `DbFile` deleted from `lib/supabase/client.ts`. `Profile` type kept (used by analytics). → `77a29bf`
5. **`.env.example` files created for both apps** — every `process.env` var documented, grouped by category, marked required/optional. Cross-checked against `turbo.json` env allowlist. → `d34f2ef`
6. **`bfg.jar` removed** — deleted the 14 MB JAR and its `.gitignore` entry. → `e896cea`
7. **Schema reconciliation completed** — `20260525034856_schema_reconciliation.sql` applied 2026-05-25. Backfilled 20 tables into migrations, dropped 6 dead tables and 17 dead columns, tightened NOT NULL constraints on `tasks.release_id` and `task_groups.release_id`, added RLS policies across 10 tables. Database and migration files now in sync.

---

## External dependencies for full v1 activation

The product is feature-complete in code, but the two single-shot AI features (Phase 5 rollout planner, Phase 6 status update generator) and UrgAns all need env vars set before they're switched on. **Superseded 2026-08-13** — this used to say an Anthropic API account was needed; the founder's cost call is the opposite: route everything through RodiumAi instead. A same-day follow-up also ruled out RodiumAi's free tier itself (see below) — don't reach for it as a shortcut without re-reading that finding.

- **RodiumAi account** — needed for all three AI surfaces (Phases 5, 6, and UrgAns). Sign up at rodiumai.io, top up (the free tier is not usable from this account's region — see below), mint an `rd_sk_…` key.
- **Gateway routing configuration** — set `AI_API_BASE=https://api.rodiumai.io` + `AI_API_KEY=rd_sk_…` for the two single-shot features; `CHAPPI_API_KEY=rd_sk_…` (+ optionally `CHAPPI_MODEL`) for UrgAns. The provider layer defaults to `openai/gpt-4o-mini`; override per feature with `AI_PLANNER_MODEL` / `AI_STATUS_MODEL` if a call needs more reasoning headroom. No application code change is required to pick a model — it's all env. Note the planner is usable before any of this is set: with no capable model it returns the untailored playbook plan as the draft.
- **RodiumAi's free tier (six `meta/llama-*` models, 1M tokens/day) does NOT work from this account** — confirmed live 2026-08-13: every free model is served via AWS Bedrock, and Bedrock's Meta license blocks the account's region ("Access to Meta Llama models is not allowed from unsupported countries, regions, or territories"). This was discovered only after UrgAns shipped defaulting to it and immediately failed in production with a generic "UrgAns is unavailable right now." `openai/gpt-4o-mini` was tested in the same session and works cleanly. If billing ever tries to route back to a free model to save cost, that region-block is the first thing to re-verify — it may be specific to this account, but nothing here proves otherwise for a different one.
- **Estimated monthly cost at v1 scale** — 1 paying user, 2 design partners, ~12 tailorings + ~24 status updates per month, on `openai/gpt-4o-mini` pricing: still under $1/month — the free tier would have been $0, but see the region-block note above for why it's off the table.

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
- **There are no React error boundaries anywhere in `apps/web`** (no `error.tsx`, no `global-error.tsx`). Any client-side exception during hydration therefore leaves the user staring at whatever the server rendered, with nothing surfacing the failure and no retry. This is the root enabler of the front-door dead end fixed 2026-08-13 (see "The front door is server-rendered"), and the reason that bug presented as an eternal loading screen rather than an error. The fix there was to make the pages useful without JS rather than to add boundaries — adding them app-wide is still open, and is the general answer for every other page.
- **Snapshot fallback is fail-CLOSED.** If `getSubscriptionSnapshot` errors out (DB down, network blip), `hasAccess` returns false → user is locked. Trade-off: a hiccup locks users instead of letting them through. Existing paying users are protected by the `is_subscribed` back-compat branch which fires before the network error path; this should be safe in practice but flag it if you see lockout reports without an obvious cause.

---

## Hand-crafted release templates

The hand-crafted templates are the heart of v1. Template infrastructure (types, loader, instantiator) and the single template are built and wired into release creation as of 2026-05-26. **EP and album playbooks were authored 2026-08-14 as v0.1 drafts behind `NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES` (default off) — see "EP and album playbooks" in Working notes.** Music video remains to be authored (and has no DB enum value).

**Templates needed for v1:**

1. **Single release** — `single_v0.3`, signed off by two design partners (2026-05-26). 64 tasks across 11 weeks (8 pre-release + 3 post-release). Markdown source at `apps/web/lib/release-templates/single-v0.3.md`; encoded as TypeScript at `single.ts`. Use as the base for other templates.
2. **EP release** — `ep_v0.1` (2026-08-14, DRAFT, flag-gated). 90 tasks across 16 weeks (13 pre-release + 3 post-release), built around a lead single dropping at offset −42. Multi-track logic + lead-single staggering, as this list always called for. Source `ep-v0.1.md`, encoded at `ep.ts`. **Not yet design-partner reviewed** — that review is what takes it to v0.2.
3. **Album release** — `album_v0.1` (2026-08-14, DRAFT, flag-gated). 113 tasks across 21 weeks (17 pre-release + 4 post-release), built around two staggered singles at −84 and −42. Source `album-v0.1.md`, encoded at `album.ts`. Same review caveat.
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
- **Anything the user has to READ or COPY goes in the reply, not a Bash command.** Tool output is shown to the assistant, not reliably to the user, so `cat`-ing a file at them delivers nothing — this happened with a migration on 2026-08-25 and the founder's answer was "I cant see the sql you want me to run". **Migration SQL especially: paste the whole file into a fenced ```sql block in the message.** He applies migrations by hand in the Supabase dashboard, and `supabase/migrations/` is the only sanctioned way to change schema (principle 9), so every feature here eventually needs its SQL handed over that way. Same for anything else meant to be copied — an env block, a generated config, a command to run. Reading a file to understand it is what Bash is for; delivering it to a human is not.

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
- **Pages (4 + modals):** Dashboard (greeting, release cards, due-soon tasks), Releases list, Release detail (header, task progress, task list, status update placeholder), Settings (profile, teammates via workspace members, ~~subscription~~ — **corrected 2026-08-13:** Settings had no subscription/billing section at any revision after the v1 cut, so this line was wrong when written; git history at `c533339` shows the same fourteen sections with no billing among them. A real one was added 2026-08-13, see "Settings gains a billing section" below). Modals: CreateReleaseModal, TaskQuickCreateModal, TaskDetailDrawer.
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
- v2 carry-overs: (1) ~~the create-release modal does not capture release type~~ **resolved 2026-08-14: the modal has a Single/EP/Album picker, rendered only when more than one playbook is switched on (so it is invisible with the EP/album flag off, which is the default). `POST /api/releases` now validates the value against the DB enum instead of letting an unknown string 500 at the Postgres boundary.** (2) Silent template failures only log to server console — no in-product surface yet. (3) `createDefaultReleaseTasks` dead-code removal pending.

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
- **Reprice (2026-08-16, NGN legs only — founder call):** Monthly ₦150,000→**₦3,500**, Annual ₦1,500,000→**₦35,000**. Annual holds the "10× monthly / 2 months free" ratio every prior tier has kept. Two things this pass deliberately did NOT do, both of which are live gaps rather than oversights: (1) **the USD legs are untouched** ($100/mo, $1,000/yr), so the `/locked` currency toggle now shows two prices that are not the same offer (₦3,500 ≈ $2.30) — tolerable only because USD checkout has never worked (no `PAYSTACK_PLAN_*_USD` env vars exist; the Paystack account offers NGN only in plan creation), so reprice or hide the USD leg before USD billing is ever switched on; (2) **no new Paystack Plan objects were created**, so `PAYSTACK_PLAN_MONTHLY_NGN` / `PAYSTACK_PLAN_ANNUAL_NGN` still point at the ₦150,000 / ₦1,500,000 Plans and checkout will **advertise ₦3,500 and charge ₦150,000** until the founder mints two new Live Plans and repoints those env vars in Vercel (`urganize` project, Production+Preview). That display-vs-Plan gap is exactly what the 2026-07-14 pass shipped and the 2026-07-20 pass had to close — this is the third time it has come up, so treat it as the default follow-up on any reprice, not an edge case. Label untouched (₦800,000 / $1,250, and `contactSales` so no figure displays). **No changelog entry or version bump** — the Versioning section's app-only scope rule states pricing display updates count as marketing.
- **Follow-up status:** Real workspace screenshots landed 2026-06-11 (staged by the founder; `public/images/product/workspace-releases.png` + `workspace-tasks.png`, shown in `WorkspaceShotSection` and inside `TemplatePlanSection`) — retake them whenever the UI meaningfully changes. Testimonial now credits Adenaiye Miracle (Artist Manager) with permission; the quote is her verbatim words — never publish words she hasn't approved.
- **Repositioned (2026-08-19, founder brief):** the locked marketing positioning is now **"Urganize is the AI workspace for music executives working with ambitious artists"** — executives (label heads, A&R, VP Ops) are the buyer and the hero; artists are ecosystem advocates, never the addressee. Hard language rules for ALL marketing copy: no "system of record", no container/location metaphors ("one home", "lives in one place" — the old hero and OG card were the canonical violations), "workspace" allowed, fifth-grader readability, **no Oxford comma in house copy** (verbatim customer quotes exempt). The homepage, `lib/seo.ts` strings (which feed the four JSON-LD schemas), `LANDING_KEYWORDS` and the OG card were rewritten in the first pass (`SHARE_IMAGE_VERSION` bumped per URG-156; the card's baked tagline is now "Every artist. Every release. On plan."); the ProductMenu pages and persona pages follow in two sweep PRs. New public claims, all founder-supplied (2026-08 brief): 7 founding teams / 10 artists / 2 active releases (WorkspaceShot label), 43% convert to paid + no sales team + Founding Member cohort capped at 10 teams with lifetime price lock (FinalCTA line, echoed on /pricing) — update or remove the moment any stops being true. **Two of those were REMOVED from the landing page 2026-08-25 (founder call), in the same pass that cut the row titles from `TransformationSection`:** the WorkspaceShot proof-numbers label is gone entirely (the screenshot is the proof that beat needs), and FinalCTA's Founding Member + 43% + no-sales-team line is gone (the ask plus one real quote is the whole beat now). The removed strings are quoted verbatim in a comment at each site, so restoring them means supplying fresh numbers rather than reconstructing old ones. **`/pricing` still carries its own, shorter Founding Member line** ("...price locked for life. Still open.") — deliberately left, so the two pages no longer mirror each other and the old never-disagree rule between them no longer applies. All prior rules here (honesty rule, verbatim-quote sign-off, data-nosnippet pairing, screenshot currency) still bind. **Known doc drift, deliberately left:** this file's product-scope "Target user for v1" paragraph predates this positioning and was not rewritten — marketing speaks to executives; the v1 build-scope description remains the historical record it was.

---

## Social share image fix — URG-118 (2026-07-13)

Sharing any urganize.app URL on X (and other social crawlers) showed no preview card. Two root causes:

1. **Nested pages had no share image at all.** The homepage got its image from the `app/opengraph-image.png` file convention, but that image is **not inherited by nested route segments** — every page built by `lib/seo.ts:buildPageMetadata` (`/features`, `/pricing`, `/team`, `/press`, `/changelog`, `/privacy`, `/terms`, `/subprocessors`) rendered only `twitter:card` with no `og:image` / `twitter:image`.
2. **The file-convention image URL resolved against the runtime host.** In production that host was an SSO-gated `*.vercel.app` preview URL (the apex was answering from a branch preview, not the pinned production deploy), so the image 302'd to `vercel.com/sso-api` — crawlers hit a login wall and rendered no card.

**Fix (code):** moved the branded card to `apps/homepage/public/opengraph-image.png` (stable public asset, no per-deploy hash) and wired it **explicitly** via `openGraph.images` + `twitter.images` in `buildPageMetadata`, using the absolute canonical URL `https://urganize.app/opengraph-image.png`. Every page now emits a single canonical `og:image` + `twitter:image` that never depends on host resolution. The old `app/opengraph-image.png` file convention was removed to avoid a duplicate/conflicting tag on the homepage.

**Still needs doing (infra, not code):** pin the `urganize.app` apex to the **production** deployment in Vercel (`the-urganization` project → Domains). Until then the apex may answer from a preview deploy. ~~Also: `www.urganize.app` currently 308-redirects to the bare apex — the reverse of the "bare → www" note in the Deploy Configuration section; reconcile that doc when convenient.~~ Doc reconciled 2026-08-13 (the redirect direction is confirmed `www` → apex; the Deploy Configuration line now says so).

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

**Switched off, then back on (2026-08-14, founder call — v0.54.0).** At some point after 2026-07-31 the flag was turned off, and **this file has no record of when or why** — surfacing that gap per this file's own rule rather than inventing a reason. No code was ever removed: the section, the routes, the public page and the migration all stayed in place, so bringing it back was purely a flag flip plus the pill move below. Nothing here was rebuilt. **`NEXT_PUBLIC_FEATURE_EPK=true` is set in production again as of 2026-08-14** — the founder flipped it on the `Web` project, and saving the env var triggered its own redeploy, which is what the flag actually needs (`NEXT_PUBLIC_*` is inlined into the client bundle at build time, so flipping without a rebuild would leave the API routes live while the UI stayed dark — the trap the pitching activation checklist records). **Verified live rather than assumed, and the method is worth reusing:** the EPK route checks the flag BEFORE auth, so an unauthenticated `GET /api/releases/<any-uuid>/epk` returning **401 means the flag is ON** and **404 means OFF** — compared against an ungated route like `GET /api/releases`, which 401s either way. Note the bundle string "Press kit" is NOT a usable signal: it survives in the chunk even with the flag off. What IS conclusive on the client is the pill compiling with no falsy guard around it.

**The pill moved to the tasks-panel footer (2026-08-14, founder call):** Press kit is no longer a header pill — it sits beside Calendar in the panel's footer row, so the two things you send outward live together. See "Calendar's entry point" below for the footer's full placement history; the row now renders when EITHER flag is on, each pill keeping its own check, and both hide once any scene is open.

- **Schema:** `release_epks` via `20260730100000_release_epks.sql` — one row per release (`release_id` unique), `share_token` (18 random bytes, base64url, unguessable), owner-scoped RLS. The row is the share grant, not the kit: no EPK content is stored. **Needs applying to production before the flag flips.**
- **API:** `GET/POST/DELETE /api/releases/[releaseId]/epk` (`_shared.ts` mirrors the content-calendar route group: flag 404 first, `requireActiveAuthenticatedUser`, local `ensureReleaseOwnership` that avoids the deprecated schema-fallback helpers). POST is idempotent (returns the existing kit; a 23505 race falls back to the winner's row); DELETE revokes idempotently. Regenerate = revoke + generate (new token, old link dies).
- **Public page:** `/epk/[token]` — server component, `force-dynamic`, no auth (the token is the access control; `robots: noindex`). `lib/epk-server.ts:loadPublicEpk` resolves the token with the service-role client and assembles the kit live: release row + `release_metadata` + cover art (same precedence as `/api/releases`' `resolveCoverArtUrl`: asset → legacy `artwork_url` → workspace logo) + up to 8 newest `promo_image` assets via fresh signed URLs. Returns null → 404 on anything (flag off, bad token, infra blip) — the page never 500s and never distinguishes "revoked" from "never existed". Plain `<img>` tags on purpose: signed URLs expire, so `next/image` proxying/caching would break them. Dark-locked URG.001 palette (hard-coded, not theme tokens): a press artifact renders identically for every recipient. `/epk/` added to AppShell's `isPublicStandaloneRoute` so no app chrome/dock floats over it.
- **Owner UI (settled after three reworks, all founder calls):** a PostHog-style collapsible LEFT side menu (`ReleaseSideNav.tsx`) was tried and then **removed entirely in URG-200** — the founder found it added a click for no real benefit over a plain back link. Discovery is now direct: the release detail page's header carries a "Press kit" button straight next to Content calendar / Files (`ReleaseDetailPageClient.tsx`), and the workspace's `TasksPanel` carries the same link for a scoped release (URG-198 — one click from the dashboard, no need to open the release first). The press kit itself lives at **`/dashboard/releases/[releaseId]/epk`** (thin server `page.tsx` + `EpkPageClient.tsx`, a plain "Back to release" link, no side menu) hosting `EpkSection` — generate / copy / view / revoke the link; share URL built client-side from `window.location.origin`.
- **Brand island:** the public page's colors live in the dark-locked `.epk-island` class in `globals.css` (`--epk-*` vars; the `cc-island` single-source pattern, minus the light override — a press artifact renders identically for every recipient).

---

## MCP read/write access (2026-07-31, URG-183)

An MCP endpoint at **`POST /api/mcp`** exposes Chappi's existing tool surface to an external MCP client (Claude Code / Claude Desktop), so the founder can read and mutate releases/tasks from outside the app. **Not a scope expansion:** it's a second access path to the already-sanctioned Chappi tool registry, not a new feature — no new tools, no new business logic. Internal-only → no ledger entry/version bump (Versioning rules).

- **Founder-only, env-bound.** `MCP_ACCESS_KEY` (bearer secret) + `MCP_USER_ID` (the `auth.users` id every call acts as). Presence of BOTH is the feature switch — unset → the route 404s (dark, mirroring the flag-off 404s). Deliberately no `NEXT_PUBLIC_FEATURE_MCP`: nothing reaches the client bundle, and a separate flag would only create a half-configured state. Server-only runtime vars, so no `turbo.json` entry (same as `CRON_SECRET`/`CHAPPI_API_KEY`). ~~No per-user keys, no DB table, no Settings UI, no OAuth — claude.ai web connectors (OAuth 2.1 + DCR) are a separate future issue.~~ **Superseded 2026-08-25: per-user OAuth shipped — see "Per-user MCP access, over OAuth 2.1" below.** Everything else in this section still describes the founder-key path exactly, and that path is untouched; it is now one of two ways in.
- **Transport hand-rolled, no new dependency.** `lib/mcp/protocol.ts` is a pure JSON-RPC layer (~200 lines) covering the five methods a stateless server needs: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`. `@modelcontextprotocol/sdk`/`mcp-handler` would have added a dependency, the repo's first catch-all route segment, and session machinery for that small a surface — the same call the admin hub's Growth chart made against chart.js. Stateless is load-bearing: **never emit `Mcp-Session-Id`** (issuing one commits us to session semantics), GET/DELETE are 405, responses are plain JSON (no SSE). Batch arrays are rejected (-32600). **A failed tool is a successful call with `isError: true`** — JSON-RPC errors are reserved for protocol problems, so the model can see failures instead of the transport eating them.
- **Tools = `CHAPPI_TOOLS` minus `EXCLUDED_TOOL_NAMES`** (`lib/mcp/tools.ts`), still **11** after the 2026-08-14 expansion took Chappi to 45: the four reads plus create_release, create_task, create_note, update_task, complete_task, reopen_task, generate_status_update. The list derives automatically, so a new Chappi tool joins MCP unless it is excluded — `protocol.test.ts` asserts the count, which is the tripwire that makes that decision conscious. **Every tool added by the full-control expansion is excluded**, for two separate reasons: the gated ones (`delete_release`, `delete_task`, `delete_note`) have no confirmation UI over MCP, and the rest reach REST routes that don't accept the MCP internal-actor bearer (the allowlist is still exactly four routes) so they would 401 anyway. Opting one in means switching its route to `requireAuthenticatedAdminOrInternal` AND bumping the count — do not do it for a gated tool at all. `navigate` is excluded because it returns a `clientAction` for a React router that doesn't exist off-browser; `clientAction` is dropped from every MCP result for the same reason. `lib/chappi/**` is imported, never edited — the two surfaces can't drift. Read the schema off the registry's camelCase `inputSchema`, NOT via `getChappiToolSchemas()` (which renames to Anthropic's `input_schema`).
- **The internal-actor auth branch** is the one non-obvious piece. Four mutating tools work by internal fetch to our own REST routes (preserving template instantiation / assignee validation / notifications — see the `lib/chappi/tools.ts` header), and those routes validate a Supabase JWT an MCP client doesn't have. So `app/api/_shared/auth.ts` gained `requireActiveAuthenticatedUserOrInternal` + `requireAuthenticatedAdminOrInternal`: a request whose bearer timing-safe-equals `MCP_ACCESS_KEY` resolves to `MCP_USER_ID` via `auth.admin.getUserById`, then still passes the paywall gate (parity with the UI). **There is no acting-user header on purpose** — the binding is env-side, so a leaked key can only ever act as that one account. ~~**Exactly four routes opt in**~~ **FIVE since 2026-08-25** (`POST /api/releases`, `POST /api/tasks`, `PATCH /api/tasks/[id]`, `POST /api/releases/[releaseId]/generate-status`, `POST /api/notes`); every other route keeps the plain helpers and rejects the key with a normal 401. The fifth closes a bug that shipped alongside this section: `create_note` was exposed over MCP from day one and always 401'd, because five exposed tools proxy REST routes and only four routes had opted in. There is a structural test for it now — see the section below. Do not broaden this to new routes without a reason as concrete as the internal-fetch constraint.
- **Also:** `apps/web/vitest.config.ts` gained the `@/*` path alias so lib modules under test can import across directories the way the app does.
- **Activation:** set both env vars in Vercel `Web` production, then `claude mcp add --transport http urganize https://app.urganize.app/api/mcp --header "Authorization: Bearer <key>"`.

---

## Per-user MCP access, over OAuth 2.1 (2026-08-25)

Founder request: *"Figure out a way for all users to take context to any LLM of
their choice through Urganize consistently through MCP probably."*

Every customer can now connect their own LLM client — claude.ai, Claude Desktop,
ChatGPT, Claude Code, Cursor — to their own workspace, and take their release
context with them. Behind `NEXT_PUBLIC_FEATURE_MCP_CONNECT`, which is **ON in
production since 2026-08-25** — the migration is applied and the OAuth flow is
confirmed end to end (see Verified below; one tool call is the only step left).
The founder-key path above is untouched, unflagged and independent: either, both,
or neither may be switched on.

**Not a scope expansion.** MCP shipped 2026-07-31 and this file recorded it as
"a second access path to the already-sanctioned Chappi tool registry, not a new
feature". This is the same registry reaching the same data for the same reasons;
what changed is who may hold a credential.

**The external fact that decided the architecture, and it is worth re-checking
before anyone "simplifies" this into a token.** Claude Code accepts a static
bearer via `--header`. **claude.ai web and Claude Desktop do not:** their
custom-connector flow assumes OAuth 2.1 and attempts Dynamic Client
Registration on connect, with no "no auth" option and no static-header fallback
(anthropics/claude-ai-mcp#402, closed as not planned). ChatGPT connectors want
OAuth too. This product's users are artist managers, not developers — they live
in claude.ai and the phone apps, which are exactly the OAuth-only clients. A
per-user token would have been three columns instead of three tables, and would
have served the founder and nobody else.

**Schema:** `20260825100000_mcp_oauth.sql` — `mcp_oauth_clients` (DCR
registrations), `mcp_oauth_codes`, `mcp_oauth_tokens`. RLS enabled with **zero
policies** on all three, the `workspace_invite_links` / `curator_invites`
posture. **Not applied anywhere yet.**

### Eight things worth knowing before editing this

1. **The credential IS the binding, and that property is preserved rather than
   abandoned.** `app/api/_shared/auth.ts` argued the env binding was safe because
   "a leaked key can only ever act as that one user", with deliberately no
   acting-user header. A token row carries its own `user_id`, so that still
   holds — one credential resolves to one account and no request header can
   redirect it. What changed is that the binding lives in a row, which is what
   makes revocation possible at all (`.env.example` used to say, of the founder
   key, "there is no revocation UI").
2. **Tokens and codes are stored sha256-HASHED, which deviates from every other
   token in this repo.** `createHash` appeared nowhere in `apps/web` before this,
   because share links and invite codes must be re-readable to render a Copy
   button (`INVITE_LINK_COLUMNS` says so in as many words). That reason does not
   apply here: an access token is handed to a client once and never shown to a
   human, so nothing needs the plaintext back and a leaked row should not be a
   working credential.
3. **The access gate is per TOOL, not per HTTP method.** `requireActiveAccount`
   reads read-only mode off `request.method` and MCP is all-POST, so the honest
   method would refuse a payment-lapsed team its MCP **reads** as well as its
   writes — while that same team can still read everything in the app.
   `resolveMcpToolAccessMethod` maps `tool.kind` to a synthetic GET or POST, and
   a refusal comes back as a JSON-RPC result carrying `isError` so the model can
   explain it rather than reporting a dead server. **Never pass the real method
   here.**
4. **The 401 carries `WWW-Authenticate` with `resource_metadata`, and that header
   is the entire discovery mechanism.** Without it a client reports the server
   unreachable instead of starting the OAuth flow. It is the first thing to check
   on any "the connector will not connect" report.
5. **`/.well-known/*` is served through `next.config.js` rewrites, and it has to
   be.** Next's router ignores dot-prefixed path segments, so
   `app/.well-known/…/route.ts` never resolves, and there is no `middleware.ts`
   in this app. Both the bare AND the path-suffixed forms are mapped
   (`/.well-known/oauth-protected-resource/api/mcp`), because RFC 9728 has a
   client try the suffixed one first for a resource that lives at a path —
   serving one and not the other works with some clients and silently fails with
   others.
6. **Single-use codes and refresh rotation are conditional UPDATEs, not
   application-level checks.** `update … where consumed_at is null returning id`;
   zero rows means somebody else won. The row is the lock — the `curator_invites`
   pattern. `checkCodeRedemption`'s own `consumedAt` check is a fast path and is
   explicitly NOT what makes single-use true. Rotation swaps both hashes on the
   existing row rather than inserting a successor, so an hourly refresh does not
   fill the owner's Settings list with dead entries.
7. **MCP tool calls are NOT metered against `urgans_monthly_actions`.** That
   ceiling exists because an UrgAns turn costs us gateway tokens; over MCP the
   customer's own model does the thinking and we pay for a database read. Each
   call records an `mcp_tool_call` billing event for visibility instead —
   free-text `type` column, existing index, **no migration**.
8. **`/api/mcp/connections` and its DELETE are deliberately NOT behind the
   paywall** — the `app/api/account/export` call, for a stronger reason: a walled
   or read-only team must always be able to cut off a credential. Authentication
   plus the curator block, and nothing else.

### The allow-list inversion, and the bug the old default shipped

`lib/mcp/tools.ts` was a **deny-list** (`EXCLUDED_TOOL_NAMES`), so a newly
registered Chappi tool joined MCP automatically and a hard-coded count in
`protocol.test.ts` was the tripwire that made somebody notice. That default was
defensible while one founder-held env key could reach the endpoint. It is not
once any customer can: `executeToolCall` never reads `tool.confirm` (the gate
lives in `runner.ts`, which the MCP path does not go through), so **that list is
the only thing standing between an outside model and a confirmation-gated tool.**

It is now an explicit `MCP_TOOL_NAMES_ALLOWED` — 13: the original 11 plus the two
context tools. The count test stays, but its job changed: it no longer guards
against accidental exposure, it catches an intended tool silently dropping out
after a rename.

**And it fixed what the old default already shipped:** `create_note` was in
`tools/list` from day one and always 401'd, because it proxies `POST /api/notes`
and that route used the plain auth helper. `tool-registry.test.ts` now parses the
tool-family sources, extracts each allow-listed tool's `callInternalApi` path AND
method, resolves the route file, and asserts that specific handler accepts the
internal actor. **It was mutation-tested twice:** the first version passed on the
reverted fix, because it matched the file's *import* rather than the handler
body — so it is per-handler now, which also lets a route legitimately opt its
POST in while leaving its GET on the plain helper, exactly what `/api/notes`
does.

### The context surface, and why "consistently" was already half-built

`buildChappiSystemPrompt` composed ROLE + team brief + workspace snapshot +
today, and only ROLE is specific to the assistant inside this app — it names
tools an outside model does not have and confirmation cards it will never see.
Everything else is just true. So that portable half moved into
`lib/chappi/portable-context.ts` and `buildChappiSystemPrompt` now calls it:
**one composition, two consumers**, so an answer from claude.ai and an answer
from UrgAns cannot be working from different facts. That is what the word
"consistently" in the request actually required, and a second renderer would have
drifted within a month — this repo has undone that duplication for
`isRecapEligible`, for the four-flag scene expression, and for four copies of
`getAccessToken`.

It lives in `lib/chappi/` and not `lib/mcp/` deliberately: `lib/mcp` imports
`lib/chappi` and never the reverse.

Exposed **both** as tools (`get_workspace_context`, `get_release_context`) and as
MCP resources (`resources/list` / `resources/read`, at
`urganize://workspace/context` and `urganize://release/<id>/context`). Resources
are the primitive that means "attach this"; tools are what every client supports;
a manager should not have to know which kind of client they picked.
`capabilities` now declares `{ tools: {}, resources: {} }`.

Both context tools are `kind: 'read'`, which is load-bearing rather than
descriptive — see point 3 above.

### Doc-drift found on the way, surfaced rather than absorbed

Two features exist in the code and appear nowhere in this file:

- **The team brief** (`lib/team-brief.ts`, `team-brief-server.ts`,
  `team-brief-nudge.ts`, `components/settings/TeamBriefSection.tsx`,
  `components/chappi/BriefAttribution.tsx`, migration
  `20260824120000_team_briefs.sql`) — a manager-authored five-section standing
  document (roster, how we work, positioning, constraints, vocabulary), capped
  per section, injected into UrgAns's system prompt on every request, edited in
  Settings → Workspace, flag-gated on `NEXT_PUBLIC_FEATURE_TEAM_BRIEF`. It is
  half of what "context" means in this feature.
- **`lib/chappi/workspace-summary.ts`** — the pure, unit-tested workspace
  snapshot renderer (releases capped at 25 and selected by recency of the release
  *or* its activities, overdue, open work per person, the team). The other half.

Neither has a Working-notes entry. Flagged here per this file's own rule rather
than back-filling a section for work this pass did not do.

### Known gaps, stated plainly

- **No rate limiting**, anywhere in this repo, and this opens an authenticated
  endpoint a customer can point any client at. Out of scope at current scale
  (principle 6); the `mcp_tool_call` event is the signal that should arrive
  before it matters.
- **Open Dynamic Client Registration**, which is what claude.ai requires.
  Registering grants nothing — a client id is not a credential, and nothing
  happens until a signed-in person approves it — and it is mitigated by
  public-clients-only plus redirect-URI validation.
- **Prompt injection widens.** Hostile text in workspace data now reaches a
  third-party model that can call create/update tools. Same accepted posture as
  UrgAns (reversible, visible, undoable in-app), restated because the model is
  one we do not control.
- **Hand-rolling an authorization server is the risk in this work.** It matches
  the repo's precedent (`lib/mcp/protocol.ts` hand-rolls JSON-RPC,
  `lib/fcm-server.ts` an RS256 JWT) and avoids a vendor under "boring stack", but
  PKCE verification, exact redirect-URI matching and single-use codes are where
  this goes wrong. All three are pure, unit-tested, and were mutation-tested:
  making PKCE accept `plain`, making redirect matching a prefix, and dropping the
  single-use check each fail exactly the tests written to catch them.

### Verified

The full suite (**1372 passing**, 30 env-gated skips, ~83 of them new across
`lib/mcp/oauth.test.ts`, `lib/mcp-connections.test.ts`,
`lib/chappi/portable-context.test.ts` and the two updated registry tests),
`eslint .` at **3 errors / 67 warnings** — the 3 errors are the unchanged
pre-existing `WorkspaceView.tsx` ones, and the single new warning is
`useMcpConnections`'s fetch-on-mount, byte-identical to the finding
`useTeamLogins` already carries (the documented React-19 downgraded rule).
`next build` green **by exit code** in both flag states, with `/auth`,
`/onboarding`, `/settings` and `/oauth/authorize` all still `○ Static`.

Runtime probes against `next start`, **rebuilding between flag states** because
`NEXT_PUBLIC_*` is inlined at build time even server-side: flag OFF, all six
OAuth/well-known routes plus `/api/mcp/connections` and `/api/mcp` return
**404** while the ungated `/api/releases` still **401**s — that discrimination is
what proves the gate rather than a routing accident. Flag ON, both metadata
documents return valid JSON with absolute URLs, `POST /api/mcp` returns **401
carrying `WWW-Authenticate` with `resource_metadata`**, and the authenticated
routes 401. One real defect was found this way and fixed: `/api/oauth/token`
answered `server_error` before `unsupported_grant_type`, telling a client the
server was misconfigured for a request that was invalid to begin with.

**LIVE, and the OAuth flow is confirmed end to end (2026-08-25).** The founder
applied the migration, set `NEXT_PUBLIC_FEATURE_MCP_CONNECT=true`, and connected
`npx @modelcontextprotocol/inspector` to production successfully. That one
connection exercises, against real tables: discovery through both `.well-known`
documents, Dynamic Client Registration, the consent screen rendering and being
approved, PKCE, the authorization-code exchange, the access token, and
`tools/list`. It also proves the deploy genuinely rebuilt `apps/web` — a stale
bundle would have 404'd discovery and the Inspector could not have started, which
is the trap the activation checklist warns about.

**Still NOT verified, and it is not a small remainder — NO TOOL HAS EVER BEEN
CALLED.** So no context has actually been read out of this feature, and nothing
has round-tripped through the internal-actor branch in
`app/api/_shared/auth.ts` — which is where five of the thirteen allow-listed
tools live, `create_note` among them. Its long-standing 401 is fixed in code and
covered by a structural test, and has still never been exercised by a real
request. Also untested: revoking in Settings → Account → Connected apps and
confirming the next call fails (that list has never rendered), refresh-token
rotation, which only happens an hour in, and both claude.ai and ChatGPT
specifically. The next real check is one tool call — `get_workspace_context`
answers most of it at once.

### Adding a custom connector on claude.ai (2026-08-25)

The founder could not find the option, so recording it rather than letting the
next session re-derive it. Custom connectors still exist and are supported; two
things get in the way:

- **The path is Settings → Customize → Connectors → `+` → Add custom
  connector.** Not Settings → Connectors, which is what this session told him
  first and is the likely reason he could not find it.
- **They require a PAID Claude plan.** Free accounts do not get them.

Do not confuse this with submitting to the public connector *directory*, which
does need a Team or Enterprise admin — that is publishing, and irrelevant to
adding a private one. Note also that the July 2026 MCP spec update deprecated SSE
in favour of a stateless HTTP request/response model, which is exactly the shape
`/api/mcp` already serves (no session ids, plain JSON, GET is 405) — so nothing
here is on the deprecated path.

Either way claude.ai is one client's UI, not the feature: the Inspector, Claude
Code, Cursor and any other OAuth-capable client connect today.

### Activation checklist

1. ~~Apply `20260825100000_mcp_oauth.sql`~~ — done 2026-08-25.
2. ~~Set `NEXT_PUBLIC_FEATURE_MCP_CONNECT=true` on the Vercel `Web` project~~ —
   done, and the rebuild is confirmed by the Inspector connecting at all (a stale
   bundle 404s discovery). If a future flip needs checking before anything can
   connect, `npx turbo-ignore @urganize/web --fallback=<the commit Vercel last
   deployed>` is the way.
3. ~~Changelog entry + version bump across all 10 `package.json` files~~ — done
   as v1.2.0, at the flip rather than at merge (the EPK precedent).
4. ~~Probe production~~ — superseded: the Inspector connecting proves discovery
   and the token exchange, which is strictly more than the curl probe showed. For
   the record, do **not** try to prove the flag by grepping the client bundle —
   both ternary branches compile in, a false positive this repo has recorded
   twice.
5. **OPEN, and the only thing left:** call one tool. `get_workspace_context`
   covers the most ground in a single request — it is a read, so it also tells you
   nothing about the five REST-proxied tools; `create_note` is the one to try
   after it, since its fix has never run. Then disconnect in Settings → Account →
   Connected apps and confirm the next call fails.

Customer-facing setup guide: `docs/mcp-connect.md`.

---

## Admin hub (2026-07-30)

All internal dashboards are reachable from one place: **`/admin`** in `apps/web` (founder request). `app/admin/layout.tsx` owns the page frame and mounts `components/admin/AdminNav.tsx` (left menu, the ReleaseSideNav visual pattern) for every `/admin/*` page. Sections: Overview (`/admin`, was a bare redirect to /dashboard), Onboarding (URG-195), Broadcast, **Pricing validation** (`/admin/pricing-validation` — first-ever UI for the pre-existing `/api/admin/pricing-validation` endpoint), **Waitlist** (`/admin/waitlist`), **Growth** (`/admin/growth`), **Interviews** (`/admin/interviews`, booked artist-interview slots from the marketing site's booking form). Internal-only → no ledger entry/version bump (Versioning rules).

- **Waitlist + Growth + Interviews are PORTS from apps/homepage**, re-gated behind the normal account login via `verifyAdmin`/`ADMIN_EMAILS` instead of the homepage's shared-secret cookie. They read the marketing site's **Neon** database directly: `@neondatabase/serverless` added to `apps/web`, `getNeonClient()` in `app/api/admin/_shared.ts`, backed by `GET /api/admin/{waitlist,growth,interviews}`. **Requires `DATABASE_URL` (the homepage's Neon connection string) set on the Vercel `Web` project** — unset, only those pages error. Growth's chart is plain CSS bars, deliberately NOT chart.js (boring stack).
- **Homepage originals RETIRED (2026-07-30, founder sign-off):** `app/admin/`, `app/dashboard/` (login + protected growth/interviews), `app/components/dashboard/`, `lib/dashboard-auth.ts`, and the chart.js dependency were deleted from `apps/homepage`; `ADMIN_WAITLIST_TOKEN` is dead (removed from turbo.json's allowlist; delete it from Vercel when convenient). The PUBLIC interview booking form (`/interview` + `POST /api/interview`) stays on the homepage — only the internal views moved. Rebuild from git history if ever needed.
- **Gate pattern:** unchanged — each page's backing GET is the access check (bounce to /dashboard on 401/403); the landing page uses the new lightweight `GET /api/admin/me`. The old per-page "Back" buttons were removed (the hub menu replaces them); the page frame moved out of `OnboardingAdminPageClient`/`BroadcastPageClient` into the shared layout.
- **The way back out (2026-08-24, founder request):** `AdminNav` carries a "Back to catalog" link to `/dashboard`. Worth knowing WHY it was missing for a month: `/admin/*` renders **no app chrome at all** — `AppShell`'s `showWorkspaceChrome` is `(isDashboardRoute || isSettingsRoute)`, so there is no topbar and no identity card here — and the 2026-07-30 pass above removed the per-page Back buttons on the reasoning that "the hub menu replaces them", which was true for moving BETWEEN admin sections and left nothing for leaving admin entirely. The browser Back button was the only exit. It sits ABOVE the item list, not inside it, because the list scrolls horizontally below `lg` and an exit that can scroll off the side of a phone is not an exit; it is never active and carries no `aria-current`. Labelled to match the identity card's own name for `/dashboard` so the two navs agree on what that surface is called, and `/dashboard` is hardcoded exactly as it is there — `HOME_PATH` is the post-authentication LANDING decision, not a nav href.
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
- **2026-08-12 (v0.45.1, founder decision):** reversed a third time, and this one is **unconditional** — `HOME_PATH` no longer reads `NEXT_PUBLIC_FEATURE_CHAPPI` at all. A signed-in user lands on their catalog whether or not the assistant is enabled. UrgAns keeps every other entry point (topbar icon, mobile nav bar, identity-panel nav, the dock below lg, the side rail at lg+), so it is one tap away rather than the first thing in front of you. **One behavioural consequence, since corrected:** the side rail's once-per-session auto-arm in `AppShell` fired on the first *assistant-page* visit, which used to be the login landing — so a session that never opened that page stopped getting the rail at all. This entry originally argued against broadening the trigger, on the reasoning that it would put the assistant back in front of everyone. **The founder overrode that the same day (v0.45.2): the rail's auto-open is wanted, the assistant PAGE as a landing destination is not** — those are two separate things, and only the second was being reversed. The trigger now fires on the first chrome-bearing page (dashboard or settings) once auth has resolved, skipping curators and public routes so the once-per-session flag is not spent before the user reaches the app. Since every entry point still routes through `HOME_PATH`, a fourth landing flip remains a one-line change.

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
- **Per-release scene memory (2026-08-17, founder request), extending the same two choke points.** Before this, switching the scoped release via a rail-card click never touched the `scene` param at all — release A's open scene leaked straight onto whichever release you clicked next, rather than either resetting to Activities or resuming that release's OWN last state. `lib/scene-memory.ts` (`recallScene`/`rememberScene`/`resetSceneMemory`) is a small, deliberately **stateless** module — no in-memory cache of its own, unlike `stores/useSceneDataStore.ts`'s `cachedUserId` primed once at module load — because it's read/written from inside plain URL-changing callbacks with no React lifecycle to hook a subscription into; a load-time-cached user id would silently stop persisting after a same-tab logout→login cycle. Both `openScene` and `setScope` now snapshot the OUTGOING release's current `scene` param into `rememberScene` right where they already call `clearSceneScopedParams`, and `setScope` additionally looks up the INCOMING release's remembered scene via `recallScene` (`openScene` doesn't need to — the scene it's opening is already the explicit argument overwriting whatever the incoming release last had). **Resets on logout, not just at the calendar/month layer's finer grain:** `resetSceneMemory()` is called from `auth-store.ts`'s `SIGNED_OUT` handler beside the existing `resetSceneData()` — the one true precedent in this codebase for "explicit clear on sign-out" (every OTHER `urganize.cache.*` key just keys by userId and lets a mismatch silently miss, which isn't sufficient here since the requirement is "logging out and back in, even in the same tab, always starts every release at Activities"). No feature flag: this is UX polish on top of already-shipped, already-flagged scenes, same as the unflagged calendar/month memory it extends. **Not done:** no redirect-to-remembered-scene on a cold deep link that already carries `?release=X` with no `scene=` (e.g. a bookmark) — the ask was about navigating between releases in an open session, not a fresh page load, and a mount-time redirect would risk a visible flicker. Verified: `vitest run` (705, 18 new in `lib/scene-memory.test.ts`), `eslint .` (0 new errors/warnings against the 3-error/59-warning baseline), `next build` green, `/auth`/`/settings` still `○ Static`. **Not verified:** the actual navigate-away-and-back flow and the logout/login reset — this sandbox has no live Supabase backend and no network path to `app.urganize.app`, so this rests on code review + the unit tests above; worth one manual pass after merge.
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

The identity card (above) grew a persistent nav below the identity block: Catalog, UrgAns, an optional Notes, an optional release-scoped "Collect metadata", an optional "Playlist pitches" for a dual account, Settings, and Admin when the viewer is one. Same hand-drawn `BrandIcons` marks the topbar uses, so the two entry points read as one system; active-state matching mirrors `AppTopbar`'s (exact for `/dashboard`, prefix for the rest). **Order corrected 2026-08-14 (founder call): Metadata moved from right-after-UrgAns to the fourth slot, after Notes** — see `buildNavItems` in `WorkspaceIdentityPanel.tsx`.

**This card is never a feature's ONLY entry point.** Both bullets below say so for Metadata, and "Crossing between the two portals" in the playlist-pitching section records the same rule being broken again on 2026-08-14 — that time by three gates compounding (`hidden lg:block`, the rail-open self-hide, and the topbar's own `hidden lg:grid` under `NEXT_PUBLIC_FEATURE_MOBILE_NAV`), which left a dual account with no crossing on a phone at all.

- **Metadata's pill moved out of `TasksPanel`'s scoped-header row at wide widths** — "Collect metadata" in the identity card is now the primary desktop entry point, the fourth item (after Catalog, UrgAns, Notes). Both surfaces read the same `NEXT_PUBLIC_FEATURE_METADATA` flag, so they can't disagree about whether the feature exists.
- **The pill itself was NOT deleted — it survives at narrow widths**, because the identity card never renders below `lg` at all (see the width-budget note above). Removing the pill outright, as an earlier pass at this change did, made Metadata completely unreachable on any phone or tablet — caught and fixed while finishing this work, per the "every feature reachable from the workspace" rule.
- **Where exactly the pill retreats is computed, not a literal `lg:hidden`** — see `IDENTITY_NAV_PILL_HIDE_CLASS` in `TasksPanel.tsx` (named `METADATA_PILL_HIDE_CLASS` until 2026-08-13, when Calendar started sharing it — see the section below), which is the one definition of this and is exported so `WorkspaceSkeleton` reserves its placeholders at the identical breakpoints (that file's own comments record it having drifted from this row before). Two cases the flat `lg:hidden` this section originally described got wrong, both of which left Metadata with NO entry point at some real viewport:
  - **`NEXT_PUBLIC_FEATURE_IDENTITY_PANEL` is a separate flag and defaults to FALSE** (and is itself gated on `NEXT_PUBLIC_FEATURE_WORKSPACE`), independent of `NEXT_PUBLIC_FEATURE_METADATA`. In a metadata-on / identity-panel-off environment — the DEFAULT combination — hiding the pill at `lg`+ removed the only desktop entry point and replaced it with nothing. So the hide class is empty unless the card is actually enabled: the pill only ever steps aside for something that exists.
  - **The card hides ITSELF at `lg`–`xl` whenever the UrgAns rail is open** (`railIsCompeting` in `WorkspaceIdentityPanel.tsx`), so with Chappi on there is no width below `xl` where the card is guaranteed present. Rather than mirror that runtime rail state into `TasksPanel` — the kind of duplicated condition this file keeps having to correct — the pill retreats one breakpoint later (`xl:hidden`) when Chappi is on. Accepted cost: a redundant second control at `lg`–`xl` while the rail happens to be closed, which is strictly better than a viewport band where the feature is unreachable.
- **`NavItem.Icon`'s type is `(props) => ReactElement`**, matching the `BrandIcons` function-component signature; lucide-react's icon components type their call signature as `ReactElement | null`, so `ClipboardList` needed a one-line wrapper (`MetadataIcon`) rather than being passed directly — the actual type error this WIP was blocked on.
- Verified: `pnpm test`, `pnpm lint` (0 errors), `pnpm build`.

---

## Settings/Admin pin to the base of the card (2026-08-13)

A founder call on the identity card's nav, layout-only — no flags, no routes, no data.

- **Admin and Settings are pinned to the BASE of the nav, Admin above Settings.** They sit in their own bordered group below the scrolling list of release surfaces and above the collapse control. `WorkspaceNavList` renders two flex children of the `<nav>`: the item list (`min-h-0 flex-1 overflow-y-auto`) and that pinned group. The scroll moved from the `<nav>` onto the item list, so a short viewport clips the release surfaces instead of pushing Admin/Settings off the card. Both are module-level `NavItem` constants (`ADMIN_ITEM`, `SETTINGS_ITEM`) rendered through the same inline `renderRow` closure as everything else, so the collapsed icon-rail treatment, tooltips, `sr-only` labels, and active states can't diverge. Admin stays visibility-gated on `isAdmin` and stays un-reserved in the skeleton (URG-232's reasoning is unchanged) — but because Settings is now below it, an admin's Admin row appears ABOVE an already-placed Settings rather than shifting it.
- Verified: `pnpm lint` (0 errors) + `pnpm build`. Not verified in a browser — the card only renders on authenticated chrome pages at `lg`+.

---

## Calendar's entry point: three wrong tries, then a footer of the tasks panel (2026-08-13)

Calendar's discovery problem (buried in the release header's pill row, easy to miss) went through four placements the same day, each corrected by the founder from a screenshot with a hand-drawn arrow. The final answer is nothing like the first ones — worth reading in full before touching this again, so the same misreadings don't repeat.

1. **First try: inside the identity card's scrolling nav list**, second row from the top, right after Collect metadata — reasoned purely by analogy ("same feature as Metadata, so same treatment"). Wrong: the arrow in the screenshot started at the Calendar pill in the header and traced all the way down, past the nav list entirely.
2. **Second try: the identity card's own footer slot**, in the blank space between the nav and the collapse control (`CalendarFooterLink`, its own `Suspense`/`useSearchParams` boundary rendered between `</nav>` and the collapse-control `<div>`). Still wrong — re-reading the arrow, its endpoint sat in the MAIN CONTENT column (the activity/task list), not the left-hand card at all. The founder's correction was explicit: "under the activities as a sticky pill, not the side menu."
3. **Third try: `lg:sticky lg:bottom-2` INSIDE the panel's scroll body**, after the activity buckets. Structurally reasonable, visually wrong in the common case: sticky only pins once content overflows, and the buckets default to collapsed — so on a normal load the pill sat directly under the "Upcoming" bucket header, floating mid-panel. The founder circled exactly that and drew arrows to the true base of the column.
4. **Final: a footer of the panel itself.** All identity-card plumbing from attempts 1–2 was reverted in full — `CalendarIcon`, `CONTENT_CALENDAR_ENABLED`, the `NavItem.badge` field, the hoisted `renderNavRow` helper, all removed from `WorkspaceIdentityPanel.tsx` (byte-diffed against its pre-Calendar state to confirm a clean revert). `METADATA_PILL_HIDE_CLASS` reverted to its original name too (`IDENTITY_NAV_PILL_HIDE_CLASS` briefly generalized it for two consumers; with Calendar gone, Metadata is the only one again).

**The shipped design, entirely inside `TasksPanel.tsx`:**

- Calendar is no longer a header pill at all — the whole `{CONTENT_CALENDAR_ENABLED && scopedRelease ? <button>...</button> : null}` block that used to sit in the scoped-header pill row (alongside Plan / Metadata / Pitch / Files / Press kit) is deleted outright. This is a MOVE, not a duplication: the header no longer carries a Calendar entry point at any width.
- **The pill row is a direct child of the panel's root `<aside>` (a flex column), placed AFTER the `flex-1` scroll body — not inside it.** Because the body is `flex-1`, the footer pins to the base of the panel on desktop (where `WorkspaceDesktopFocused`'s viewport-locked column gives the aside its full height) **regardless of whether the task list overflows** — this is precisely what attempt 3's `sticky` got wrong with collapsed buckets. The list scrolls behind it; the pill never moves. No sticky, no z-index, no shadow needed: it's plain flow inside a flex column.
- **Below `lg` the aside is ordinary page flow with no bounded height**, so "the panel's base" and "after the list" are the same place — the pill renders under the activities, and `MobileNavBar` (`fixed bottom-0`, when `NEXT_PUBLIC_FEATURE_MOBILE_NAV` is on) keeps owning the viewport's bottom edge with no offset war, since this row is in flow, not fixed.
- **Hidden whenever a scene is open** (`!sceneContent`, alongside the existing `CONTENT_CALENDAR_ENABLED && scopedRelease` gate) — the header's "Activities" pill is already the way back once ANY scene (Calendar included) is showing, so a second Calendar entry point while already inside a scene would be redundant chrome pointed at the very thing already on screen.
- **Left-aligned** (`justify-start`, founder call 2026-08-14 — it shipped centred the day before). Flush with the left edge of the bucket cards above it, since the scroll body carries no left padding; that shared edge is what makes it read as part of the activities column rather than a floating control.
- **Press kit joined this row on 2026-08-14** (founder call), moving out of the header pill row where it had sat since URG-198. The row is now a two-pill strip: the wrapper's flag gate is `CONTENT_CALENDAR_ENABLED || EPK_ENABLED` so it never renders as an empty strip, each pill keeps its own flag check inside, and the shared `!sceneContent` gate still hides both once any scene is open. `justify-start` gave way to `gap-2` + `overflow-x-auto` (`lg:overflow-visible`): every pill is already `shrink-0 whitespace-nowrap` via `pillClass`, so without the scroll a narrow phone would be forced onto a second line and a taller footer would push the activities list up. **Measured rather than eyeballed** (the lesson this file keeps re-learning): the two tagged pills come to 275px against the 343px a 375px phone offers — viewport minus AppShell's `px-4`, the same chain the Settings-tabs section documents — with `body` confirmed free of a modal scroll lock before trusting the number. A third pill here would scroll, not reflow.
- `WorkspaceSkeleton.tsx`'s `TasksPanelSkeleton` mirrors it: the header-pill placeholder for Calendar is gone, and a placeholder with the identical footer wrapper (`flex shrink-0 justify-start pb-4 pt-3 lg:pb-2`) sits after the flex-1 body (loading-skeleton-sync rule).

**The lesson worth keeping for the next screenshot-driven correction:** an arrow's start and end points both matter, "the same feature as X" is not evidence for "the same position as X", and a placement that's only correct when content overflows is not the placement that was asked for — check the default (collapsed/empty) state too.

- Verified: `pnpm lint` (0 errors, same baseline warning count) + `pnpm build` green in the isolated worktree. `WorkspaceIdentityPanel.tsx` byte-diffed against its state before Calendar ever touched it, confirming a clean revert. A live pass of the footer pinning (long task list at `lg`+, and below-`lg` flow with `MobileNavBar`) is still worth one look.

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
- **Capture from UrgAns (2026-08-13).** Three entry points, two of which work with no model configured — which matters, because that is production today:
  - **`create_note` tool** (agentic, dark until `CHAPPI_MODEL` is set). The system prompt tells it to attach a release only on an unambiguous match against the snapshot and to ASK when a name matches none or several — a note filed under the wrong release is worse than one filed under none. See the Chappi tools bullet for the flag-gating approach.
  - **Typed `note <text>`** (deterministic, live). An **anchored** prefix in `resolveIntent`, checked before every keyword branch: the text after it IS the note, so it can only be read positionally, and an unanchored "note" would swallow "add a note to that task" (which is an activity). Matched against the RAW string, not the lowercased copy the keyword branches use, so the body keeps its capitalisation — its first line becomes the title. In this path the scope picker is the release context, exactly as `add_task` already treats it; there is no model to hear a release name.
  - **"Take a note" chip** (deterministic, live) → `/dashboard/notes?new=1`, carrying `&release=` when the conversation is scoped. A bare "note" with nothing after it routes here too, rather than saving an empty note.
  - Covered by `lib/chappi/intent-router.test.ts` — the first unit test for `lib/chappi/*`. It re-imports the module per case with `vi.resetModules()` + `vi.stubEnv`, because the flags are read at module scope and vitest does not load `.env.local`; both flag states are asserted rather than left to the ambient environment.

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

1. **The curator-ONLY account type is contained at three chokepoints, not per route.** `blockCuratorAccount` inside `requireActiveAuthenticatedUser` (`app/api/_shared/auth.ts`) 403s such an account on every protected team route, which is every route `requireAuthenticatedAdmin` wraps too. `loadWorkspaceAccessContext` returns `EMPTY_WORKSPACE_ACCESS_CONTEXT` for it, so workspace-aware reads resolve to nothing. `ensureOwnedWorkspace` throws `CuratorAccountError`, which is what stops the lazy auto-provisioning (documented elsewhere in this file as a trap) from silently handing it a team. Costs one primary-key read on `profiles` per protected request; that was judged worth it over a per-route audit debt that would decay. **All three read `profiles.role === 'curator'`, and since 2026-08-13 that means "the team side was never switched on", NOT "is a playlist owner" — see the dual-capability note below.**
2. **`playlist_pitches` has TWO select policies and no write policy.** Two, because a pitch is read by the sending team and the receiving curator, who share no workspace — this is the first cross-tenant read in the schema. No write policy, because every write carries an invariant RLS cannot express: the ten-waiting-pitches cap, the one-waiting-pitch-per-playlist unique index, honest denormalized fields, and the rule that only a curator moves a status. All writes go through service-role routes and direct client mutations fail closed.
3. **Every field the curator card renders is denormalized onto the pitch row** (`song_title`, `artist_name`, `pitcher_name`, `playlist_name`), and `CURATOR_PITCH_COLUMNS` deliberately selects no release id, owner id or playlist id. That is not a performance choice: those joins are exactly the data a curator is not allowed to see, so the read path cannot reach team data even by mistake. It is also why `release_id` and `playlist_id` are `on delete set null` — deleting a release must not empty a curator's inbox.
4. **The invite is single-use through a conditional update.** `POST /api/curator/join/[code]` consumes it with `update ... where used_at is null and revoked_at is null returning id`; zero rows means someone else won the race. The row is the lock, so there is no read-then-write window. `hasTeamFootprint` (owns a release, or holds a live workspace membership) is still read BEFORE the invite is consumed, but since 2026-08-13 it decides the ROLE WRITE rather than refusing the join: no footprint → the profiles upsert marks the account curator-only, footprint → the write is skipped entirely and the account keeps its team role. That upsert is deliberately NOT `ignoreDuplicates`: the OAuth callback may have just written a fallback `artist-manager` row, and for a brand-new curator that has to become `curator` or the account lands on the team dashboard. **The PAGE that consumes this link is server-rendered as of 2026-08-14** — its invite lookup happens in `page.tsx` via `lib/curator-invite-server.ts`, not in a client effect, because the old shape cost a real invited curator his sign-up on weak mobile data. See "Third instance: the curator invite page" under "The front door is server-rendered".
5. **`requireCuratorUser` deliberately does not use `requireActiveAuthenticatedUser`.** Pitching is free and a curator has no subscription, so running them through the payment gate would lock every playlist owner out the moment that gate is switched back on (see the correction on Resolved blocker #1 — it is currently off). A dual account's TEAM routes still hit the paywall normally; only the curator half is free.

**Dual-capability accounts (2026-08-13, founder call).** A playlist-curator partner asked to also run releases in Urganize under the same email, and Supabase allows one auth user per email, so **being a curator became a CAPABILITY — the existence of a `curator_profiles` row — rather than a role.** `profiles.role` stays the team-side role; `role='curator'` narrowed to mean "curator-only, team side never activated". Nothing about the isolation model changed: a curator-only account still sees no team data, the two `playlist_pitches` select policies are untouched, and the three chokepoints above keep their code verbatim (their role check now simply reads as "curator-only", which is exactly who should still be blocked). **No migration, no RLS change, no backfill** — every pre-existing `role='curator'` row already has a `curator_profiles` row, since the join route is the only writer of either.

What actually changed: `requireCuratorUser` gates on the `curator_profiles` row instead of the role (so a dual account can open its own inbox); the join route's 409 is gone (a team account gains a curator side instead of being refused); `POST /api/curator/activate-team` is the reverse direction — a one-tap, idempotent `update profiles set role='artist-manager' where id=… and role='curator'`, reached from a "Run your releases" button in `CuratorShell`, after which the account provisions a workspace lazily like any other; the auth store carries `hasCuratorProfile` (tri-state, never persisted, probed only when the flag is on) which gates `CuratorShell` and a "Playlist pitches" entry in the identity card's nav. **Two traps:** treat `hasCuratorProfile === null` as "still loading", never as "no", or a dual account gets bounced out of its inbox on load; and do NOT switch `blockCuratorAccount` / `loadWorkspaceAccessContext` / `ensureOwnedWorkspace` / `resolveHomePath` to a `curator_profiles` lookup — the question they ask is "does this account have a team yet", not "is this a playlist owner". Landing stays `/dashboard` for a dual account (founder call: the team product is the bigger surface, its inbox one tap away).

**Crossing between the two portals (2026-08-14).** The dual account above shipped with exactly ONE app→curator entry point, the identity card's "Playlist pitches" row — and that card is `hidden lg:block` AND hides itself again at `lg`–`xl` whenever the UrgAns rail is open. Production also runs `NEXT_PUBLIC_FEATURE_MOBILE_NAV=true`, which makes `AppTopbar`'s own nav icons `hidden lg:grid`. The three gates compounded into a hole nobody had reasoned about end to end: **on a phone there was no way across at all**, and the partner was opening a second browser tab. Fixed by giving the crossing three homes, one per viewport band — MobileNavBar below `lg`, the topbar icon at `lg`+ (which is also what covers the rail-open band where the card removes itself), and the card itself. All three read the same `PITCHING_ENABLED && hasCuratorProfile === true` gate, so they cannot disagree about whether the feature exists; the return direction already worked at every width from `CuratorShell`'s header. The lesson worth keeping: **three independently-correct viewport rules can still leave a band with zero entry points — check the flag COMBINATION prod actually runs, not each gate on its own.** The same mistake URG-229 had to correct once for Metadata, repeated here with one more gate in the stack.

- **Two width overflows, both measured rather than eyeballed.** (1) The topbar icon is the EIGHTH control, which spends the slack `gap-2` bought when Notes became the seventh — a real 13px overflow at 375px. `gap-1.5` below `sm` returns it, applied ONLY when that control renders (`showCuratorLink` in `AppTopbar`), so every other account keeps the roomier spacing it already fits in. **The first measurement of that 13px was a phantom:** an open modal's scroll lock had put exactly `padding-right: 13px` on `body` — the trap the Settings-tabs section already documents, hit again here, so clear the lock before trusting any width number. (2) `CuratorShell`'s header measured ~396px against the 343px a 375px phone offers once a dual account put two pills beside the "Playlist owner" eyebrow; the eyebrow is decoration and now drops below `sm`, the two controls are not and stay.
- **MobileNavBar's documented "five slots" is now conditionally six.** The sixth (Pitches) appears only for a dual account — currently one partner — and earns the crowding because that bar is the only navigation a phone has. Measured 63px per slot at 375px with no overflow.
- **Verification gap worth knowing:** the topbar change is confirmed in the deployed bundle, but the MobileNavBar tab could not be observed in production — that component is code-split out of `/dashboard`'s initial chunks, and the only real dual account belongs to a partner whose session must not be hijacked. It rests on the code being confirmed in `main` plus a local run in production-parity config (`NEXT_PUBLIC_FEATURE_MOBILE_NAV=true`) at 375/1100/1280. One pass on a real phone would close it.

- **Invites are minted at `/admin/curator-invites`** (`verifyAdmin` / `ADMIN_EMAILS`) with a copy-link button and a soft revoke. **Nothing is emailed** — no transactional provider is wired anywhere in this app, so the founder sends links by hand, matching how team invites already work.
- **No realtime.** Statuses and replies appear on the next scene open, not live. The `notifications` table cannot carry a pitch event without a migration (`task_id` is NOT NULL with an FK to `tasks`, and `type` is a Postgres enum), and the spec allowed refresh. Extending notifications is the follow-up if this gets noisy.
- **RLS is proved, not assumed:** `apps/web/lib/pitching-rls.integration.test.ts` runs real PostgREST calls as four signed-in users plus an anon client and asserts every isolation rule (curator ↛ another curator, curator ↛ releases/tasks/assets/notes/metadata/activity, curator ↛ invite codes, team B ↛ team A's pitches, nobody writes a pitch directly, nobody self-mints a curator profile, anon reads nothing) with positive controls first so a broken seed cannot make the negatives pass vacuously. It is env-gated on `RLS_TEST_*` and skips entirely without them, so `pnpm test` stays offline. Setup steps are in the file header.
- **Activation checklist:** (1) ~~apply the migration~~ — done 2026-08-10, see Schema above, minus the one constraint read noted there; (2) set `NEXT_PUBLIC_FEATURE_PITCHING=true` in Vercel `Web` → Production **and redeploy** — `NEXT_PUBLIC_*` is inlined into the client bundle at build time, so flipping it without a rebuild leaves the API routes live while the UI stays dark; (3) seed a dev project and run the RLS suite once with `RLS_TEST_*` set; (4) mint an invite at `/admin/curator-invites` and join end to end with both a fresh email account and a Google account — and, since 2026-08-13, also with an account that already owns releases, which now becomes a dual account rather than being refused; (5) changelog entry + minor version bump across every `package.json` (the EPK precedent: the ledger entry lands at flag-flip, not at merge).

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

## EP and album playbooks (2026-08-14)

Completion of v1 scope item 2, **not a scope expansion**: the six-feature list always called for a
template per release type, and EP/album were the two the "Templates needed for v1" list named and
never got. Built flag-off; **not yet activated**.

- **What it is:** `ep_v0.1` (90 tasks, 13 weeks pre + 3 post, one lead single dropping at −42) and
  `album_v0.1` (113 tasks, 17 weeks pre + 4 post, two staggered singles at −84 and −42), each with a
  markdown source of truth beside its TS encoding, the `single-v0.3.md` / `single.ts` pattern. With
  them registered, the onboarding step-0 picker enables EP and Album, the create-release modal grows a
  type picker, and the planner drafts EP and album plans from their own playbook.
- **Flag:** `NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES`, default `false`. **No migration needed** — the
  `release_type` DB enum has always accepted `'ep'` and `'album'`.
- **Why a flag for a feature that is just data:** these are v0.1 DRAFTS. `single` went v0.1 → v0.3
  through two design partners before it was trusted, and these have had no such pass. The flag buys
  that review without holding the plumbing hostage.

**Five things worth knowing before editing this:**

1. **The loader is the ONE gate, and that is load-bearing.** `resolveTemplateSlot` in
   `lib/release-templates/loader.ts` is the only place the flag is consulted; `getTemplate` and
   `getAvailableReleaseTypes` route through it, and every consumer derives from those. So the
   onboarding picker, the modal picker, the create route's instantiation, the schedule route's 207
   path and the planner cannot disagree about whether EP and album exist. Flag off is
   behaviourally identical to before this work. Do not add a second flag read anywhere else.
2. **`getAuthoredTemplate` is flag-BLIND on purpose — do not "fix" it to use the gate.** A plan draft
   generated while the flag was on carries `ep_v0.1` task ids. If the flag is rolled back mid-draft
   and the autosave route resolved the template through the gate, it would fall back to the single
   playbook, judge every one of those ids forged, and 400 every save — losing the manager's edits.
   Hence `getDraftTemplate` (plan `_shared.ts`) for EXISTING drafts, keyed off the draft's own
   `release_type`, versus `getPlannerTemplate` for NEW ones. The regenerate-phase route reads the
   STORED draft's type, not the request's, because `resetPhaseToTemplate` re-materializes rows by
   `template_task_id`.
3. **The API validates against the DB enum, NOT against template availability.** `PlannerIntakeModal`
   already POSTs `releaseType: 'ep'` today whenever the planner flag is on, because the intake offers
   all three formats and falls back to the single playbook. A flag-aware allow-list would 400 that
   live flow. So `POST /api/releases` checks `DB_RELEASE_TYPES` (`types/releases.ts`) and template
   availability stays the loader's business. This also turns the old generic 500 on a garbage value
   into a 400.
4. **`plan/generate` now writes `releases.release_type` from the intake**, closing a real gap: a
   release created from the modal or Chappi and later planned as an album kept saying `single`, which
   the public press kit renders. Safe because a planner release carries `planner_pending`, never
   `template_pending`, so the schedule route cannot double-instantiate off the corrected type.
5. **The prompt guidance branches on provenance, and must keep doing so.** Telling the model to
   "stretch the asset work to cover more tracks" is right when an EP fell back to the single playbook
   and wrong when it is already looking at the EP playbook, where that work exists — it would
   duplicate what is in front of it. `buildGuidance` takes `fallbackToSingle` for exactly this, and
   both callers compute it rather than assuming.

- **Copy is per-playbook now.** `getTemplateStats(releaseType)` (never throws; falls back to single's
  numbers for a gated-off type, which is also what would be instantiated) feeds `SetReleaseDateCard`
  and `NewReleaseGuide`, which otherwise told an album owner their plan was 64 activities over 11
  weeks. `Release.releaseType` was added to carry it — `lib/services/release-service.ts` now selects
  the column. `FirstReleaseWin` deliberately stays single-only (its flag must not run alongside the
  planner, and it celebrates a first release, created before any picker has reason to appear).
- **`onboarding-ai-moment.ts` has a per-playbook stage map.** The six onboarding stages mean the same
  thing in every playbook, so each column is the same six gates in that playbook's own ids. The
  "playbooks are next" caveat now renders only when the chosen type really did fall back — otherwise
  it apologizes for a task that IS in the user's release.
- **Tests:** `lib/release-templates/templates.test.ts` machine-enforces the authoring constraints for
  all three playbooks (unique ids, resolvable `depends_on`, offsets inside the planner's −120…+60
  window, ≤`MAX_DRAFT_TASKS`, at least one task in each of the four `derivePlanPhase` phases, an
  event milestone on release day) plus the staggered-single invariants; `loader.test.ts` pins both
  flag states and the flag-blind accessor. `release-planning.test.ts`'s phase-coverage test is now
  parameterized over all three. 574 tests green.
- **Verified:** `pnpm test`, `pnpm lint` (0 errors, 57 warnings = unchanged baseline, confirmed by
  running lint against a stashed tree), `pnpm build`. Flag OFF and flag ON both checked against a
  real server render through a throwaway harness page: off → `available: ['single']` and EP/album
  stats falling back to 64/8/11; on → `['single','ep','album']` with EP 90/13/16 and album 113/17/21,
  and all three copy variants rendering their own numbers in the HTML. The modal picker was confirmed
  compiled into the flag-on client chunk (radiogroup + all three labels) but **its interactive
  behaviour was never observed in a browser** — the Browser pane's approval gate cannot be answered
  in a non-interactive session, and Next refuses a second dev server for a directory that already has
  one. Worth one manual pass.
- **Status: LIVE in production as of 2026-08-14 (v0.55.0)** — flag on, ledger entry and version bump
  done. The playbooks went live still at **v0.1, before the design-partner review** (founder call);
  that review can still bump them to v0.2, and the `.md` and `.ts` must move together since a test
  asserts `id` and `version` agree.
- **A `turbo-ignore` trap this flip walked into, worth knowing for every future `NEXT_PUBLIC_*`
  flip:** setting the Vercel env var did nothing on its own. The accompanying version-bump commit
  touched only `package.json` files and `packages/changelog` — which `apps/web` does not depend on —
  so `npx turbo-ignore @urganize/web` skipped the web build. The marketing site rebuilt (it *does*
  depend on the changelog package, so `/changelog` showed v0.55.0 immediately) while the product app
  kept serving the pre-flag bundle, env var set but never inlined. **A flag flip needs a commit that
  actually touches `apps/web`.** A same-commit "Redeploy" in the Vercel UI is not reliable either:
  turbo-ignore diffs against the previous deployment of that project and finds nothing.
  **Partial correction (2026-08-16, measured — do not delete this without re-measuring).** The v0.56.0
  team-logins bump was exactly the shape this bullet warns about (10 `package.json` files +
  `packages/changelog/src/index.ts`, nothing else), and `npx turbo-ignore @urganize/web
  --fallback=<last deployed web commit>` answered **"This commit affects @urganize/web · Proceeding
  with deployment"** — because `apps/web/package.json` is itself part of the `@urganize/web` package,
  so bumping its `version` marks the package changed regardless of the changelog dependency. So a
  version-bump commit IS sufficient on its own. What is NOT sufficient is the half this bullet gets
  right and is the likelier cause of the v0.55.0 miss: **a same-commit "Redeploy", or setting the env
  var with no new commit at all** — there turbo-ignore finds a zero-file diff and correctly skips.
  The reliable check before trusting any flip is to run turbo-ignore yourself with `--fallback` set to
  the commit Vercel last deployed for that project, which is what makes the answer match production's.
- **How to check a flag's live state with no account:** `GET /onboarding` and count `"Coming soon"` in
  the HTML — three means off (ep + album + music_video all gated), one means on (only music_video).
  That page server-renders its type picker from `getAvailableReleaseTypes()`, so it is a genuine probe
  of the deployed bundle. **Do not** try to prove it by grepping the client chunks for
  `["single","ep","album"]`: that string is the static `DB_RELEASE_TYPES` const in `types/releases.ts`
  and is present in both flag states — a false positive this session hit and had to walk back.
- **Remaining verification:** the create-release modal's picker has still never been exercised
  interactively (its behaviour is unobservable without an authenticated session). Worth one manual
  pass: create a real EP, set a date, and confirm the activities carry
  `metadata.template.template_id === 'ep_v0.1'`, the count is 90, and the lead-single drop renders as
  an event milestone.

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
- **Weekly motivational nudges:** `lib/motivation-server.ts`, run from the existing hourly `/api/cron/due-date-notifications` cron (no new Vercel Cron entry — the project's two existing crons already imply a paid plan, and an hourly check trivially covers a weekly cadence). Rotates through the preset pool deterministically (prior-send count modulo pool length) and records each send as an immediate `kind: 'motivational'` row in `scheduled_notifications` (the `WELCOME_STEP` shape). Per-user opt-out: `profiles.motivational_nudges` (default on), toggled in Settings via `MotivationalNudgesSection.tsx` (the `TaskCheckInSection` shape) — the only new opt-out this feature ships; release-reminder and deadline-reminder opt-outs are v2. **Deliberately carries NO feature-flag gate** (fixed during a completeness pass, 2026-08-12): the sweep itself delivers through the pre-existing, already-live Web Push transport regardless of `NEXT_PUBLIC_FEATURE_NATIVE_PUSH` (that flag only gates the native transport), so an earlier draft that hid this toggle behind it left every web-only user with nudges they couldn't turn off.
- **Deadline reminder tiers:** `lib/due-tiers.ts`'s pure `assignDueTier()` extends the due-date sweep from one forward-looking tier (24h) to three — 7 days, 3 days, 1 day. Two new `notification_type` enum values, `task_due_7d` / `task_due_3d` (`20260810140000_notification_type_due_tiers.sql`, bare `ALTER TYPE ... ADD VALUE`, not wrapped in a transaction — the `split_sheet` enum-add precedent), so the new tiers reuse the entire existing bell + unread-dedupe + push-mirror machinery for free; `task_due_soon` keeps its existing role as the 1-day/24-hour tier. `createDueDateNotificationsForAllUsers` (`lib/tasks-server.ts`) now calls `assignDueTier` instead of its old inline two-branch check, and loads presets once per sweep (not once per task) to pass tier copy through `buildTaskPushPayload`'s new `copyOverrides` param. **Timezones are deliberately untouched** — tier math stays UTC-instant, matching the sweep's pre-existing behavior; due dates carry known timezone sloppiness elsewhere (manual edits store a naive local wall-clock string), and fixing that was explicitly out of scope for this work. **Two bugs fixed during a completeness pass (2026-08-12), before this ever shipped:** (1) the `deadlineReminders.enabled` preset's early return sat before the tier loop entirely, so turning the new tiers off in `/admin/notifications` also silently killed `task_overdue` — a notification that predates this feature and isn't part of what that toggle advertises; the check now only skips the three new tiers, `task_overdue` fires unconditionally as before. (2) The default preset copy wrapped `{taskTitle}` in curly quotes, and `buildTaskPushPayload`'s substitution ALSO quotes the title — doubling to `""My Song""` in every default due-date push (and the admin "send test to me" button). Fixed by dropping the quotes from the preset templates; the substitution is the only place quoting happens now.
- **Android is live in code; iOS is prepped but founder-blocked.** `apps/mobile/android/app/src/main/AndroidManifest.xml` gained `POST_NOTIFICATIONS` (required at runtime from API 33; `targetSdk` is 35 here); `apps/mobile/android/app/google-services.json` is committed once the founder generates it (not a secret — client config only; the stock Capacitor conditional-apply block in `app/build.gradle` already expects it there). `apps/mobile/ios/App/App/AppDelegate.swift` gained the two remote-notification callbacks `@capacitor/push-notifications` requires — inert until the founder adds the Push Notifications capability/entitlement in Xcode and an APNs key in Firebase (full checklist: `docs/mobile/push-setup.md`). Running `cap sync` for this work also fixed a pre-existing, unrelated staleness: the iOS `Podfile` was missing the `CapacitorFilesystem`/`CapacitorShare` pods from when those plugins were added.
- **Activation checklist:** (1) ~~apply `20260810130000_device_push_tokens.sql`~~ — **done**, verified live 2026-08-12 (`device_push_tokens` and `profiles.motivational_nudges` both resolve); `20260810140000_notification_type_due_tiers.sql` still needs applying (verified NOT yet live — `task_due_7d` is rejected as an invalid enum value); (2) **founder** creates a Firebase project, registers the Android app, downloads `google-services.json` (commit it), generates a service-account key; (3) **founder** sets `FCM_SERVICE_ACCOUNT_JSON` in Vercel `Web` (server-only, not in `turbo.json`); (4) set `NEXT_PUBLIC_FEATURE_NATIVE_PUSH=true` + changelog entry + version bump across all 10 `package.json` files (the EPK precedent: the ledger entry lands at flag-flip, not at merge); (5) new Android binary with `versionCode` incremented (no installed-binary back-compat burden yet — no store release has shipped); (6) iOS later, per `docs/mobile/push-setup.md`, once the founder completes the Apple-side setup.

---

## The front door is server-rendered (2026-08-13, v0.49.1)

A design partner's teammate on 2-bar MTN LTE could not sign up: she tapped through to create an account and sat on a bare `Loading...` screen indefinitely — no error, no retry, nothing to tap. **That screen was the entire server-rendered content of `/onboarding`.** Both front-door pages showed nothing until the client bundle had downloaded AND hydrated, so the signup and login entrances depended on ~10 JS chunks (one 211 KB) all arriving. One dropped request, a content blocker, or any throw during hydration was a permanent dead end.

**Shipped, deployed and verified live** — this is not flag-gated; it is how the two entrances now work.

- **`/onboarding` lost its `hasHydrated` loading gate. Do not re-add it.** Step 1 is a radio list over static template data and needs neither storage nor auth, so it is server-rendered and hydration only upgrades it. Restoring a saved draft moved to a **pre-paint layout effect** (`lib/use-isomorphic-layout-effect.ts`, shared with `/auth`), so a returning user and a Google-OAuth returner still land on the step they belong on with no flash of step 1. `hasHydrated` still exists, now only to stop the save effect writing an empty draft over a stored one before the restore lands.
- **`/auth` no longer calls `useSearchParams()`, and that is load-bearing — "restoring" it silently un-server-renders the page.** Reading it in a statically prerendered client component makes Next bail out to the nearest Suspense boundary, so the HTML Vercel served for `/auth` was `app/auth/loading.tsx` — a spinner — and the page component never rendered on the server *at all*. Confirmed empirically before the fix: the built `auth.html` contained `Opening your account` and zero occurrences of `Continue with Google`. The query string is read post-mount instead, and a `paramsReady` flag holds the three redirect effects (legacy `?mode=signup` bounce, legacy invite-link upgrade, post-login redirect) until it lands so none of them can act on a default `next` and drop a real one.
- **`force-dynamic` was rejected deliberately.** It also fixes the bailout, but trades a CDN cache hit for a server round trip on every visit — the wrong direction for the weak-connection users this whole change is for. `/auth` and `/onboarding` are both still `○ Static`. If someone later needs real server-side `searchParams` here, that is the trade-off being made, and it should be a conscious call.
- **The session gate is now decided pre-paint, in three coupled pieces — they must move together.** (1) An inline probe in `app/layout.tsx`'s `<head>`, the same pattern and placement as the pre-existing theme script, path-gated to `/auth`, reads the auth store's persisted `urganize-auth` flag and sets `data-auth-session="1"` on `<html>`. (2) The `.auth-session-loader` / `.auth-form-shell` rules at the end of `globals.css` swap which one displays. (3) `AuthPageClient` renders both branches and **clears the attribute** once Supabase confirms there is no session. Break any one and either a signed-in user glimpses the login form or an anonymous visitor gets a permanently hidden one.
- **Why a script and CSS rather than just React:** the client's first render must match the server's or hydration fails, so the form has to be rendered and then corrected — and React can yield while hydrating, which means a corrected frame is not *guaranteed* unpainted. CSS applied before the body exists is. The React gate is still there and still works; the script only removes the residual risk.
- **The probe is a HINT, not authority.** The persisted flag can be stale (a session that expired while the app was closed), which is exactly why the page clears the attribute the moment Supabase answers. If the probe cannot run at all — storage blocked, unexpected persisted shape — nothing is set and behaviour falls back to the React gate. It fails open, never closed.
- **`authLoading` was deliberately dropped from the gate condition.** It is true on the first render for everybody, which is precisely what made the form unreachable pre-hydration. Waiting on it also meant an anonymous visitor — the only person who needs `/auth` — sat behind a spinner for a session check that was always going to come back empty.
- **`app/auth/loading.tsx` still exists but is no longer what the initial HTML shows.** It now only serves client-side navigations into `/auth`. Do not treat it as the page's SSR output again.
- **Both pages gained a `<noscript>` notice**, so a browser with scripting blocked says so instead of offering a button that quietly does nothing.
- **Sibling pages audited, no change needed:** `/auth/forgot-password` already server-renders its real form; `/auth/reset-password` and `/auth/callback` are genuinely JS-only machine steps (they read a URL token), so their spinners are legitimate. `AuthPageClient` was the only file in the auth tree reading `useSearchParams`. **That audit's scope was the auth tree, and that is exactly how the third instance below got missed** — `/curator/join/[code]` is a front door too, but it lived behind a flag that was off at the time, so no sweep of "the pages a stranger can land on" would have found it. **When a flag-gated surface is switched ON, re-run this audit against its entry points before a user does it for you.**
- **Ruled out along the way, so nobody re-investigates:** blocked storage is NOT the cause (`loadOnboardingDraft` / `readAndClearResumeMarker` are both already `try/catch`-guarded), and the bundle carries no regex lookbehind or class static blocks that would break an older Safari parser. **But Next 16's own framework chunk uses `Object.hasOwn`, which requires iOS 15.4+** — below that the entire app breaks and no application-side change can fix it. Ask for an iOS version before debugging app code on a "nothing loads" report.
- **Verified:** `pnpm test` (448) + `pnpm lint` (0 errors) + `pnpm build` green; the shipped probe source extracted from the built HTML and executed against a persisted session sets the attribute, with the form then computing `display: none` and `offsetParent === null`; path scoping confirmed (no attribute on `/onboarding`); post-deploy, production `/auth` serves the form, the three gate rules are present in the deployed stylesheet, and the live page has zero console errors. **One gap: the signed-in path was never exercised against a real Supabase session** (no test credentials, and creating an account against the live database was not on the table) — it rests on the probe + CSS chain above, so it is worth one manual pass while logged in.

### Third instance: the curator invite page (2026-08-14)

**The same bug, a third time, and it cost a real invited curator his sign-up.** He could not open his link on Nigerian mobile data, sat on a loading screen, and reported it as his own connection ("my net is not opening it, I'll keep trying"). It was ours. Measured on production before the fix: `/curator/join/<code>` served **27KB of HTML containing only a skeleton** — no email field, no "Continue with Google", no Accept button — then required **18 JS chunks (~1.0 MB uncompressed, largest 232KB)** to download AND hydrate AND a further `fetch` to `/api/curator/join/<code>` before one tappable element existed. His invite was ACTIVE and unexpired the whole time and no partial account was created, so nothing was lost but the days.

- **The invite is resolved on the SERVER now.** `lib/curator-invite-server.ts:loadCuratorInviteState` is shaped after `lib/epk-server.ts:loadPublicEpk`: it never throws, and every failure (flag off, malformed code, missing row, unapplied migration, network blip) collapses to one `'unavailable'` answer — a public page must not leak whether a code merely never existed, and must not 500. `page.tsx` awaits it and passes it in as `initialLookup`, so the HTML carries the real form, or the real "Link not available" for a dead link.
- **The client's own lookup effect is now guarded on `initialLookup` being absent.** Do NOT remove that guard to "keep it fresh": it reinstates the exact round trip this page was fixed to avoid, and `POST` re-checks the invite authoritatively anyway.
- **`force-dynamic` IS correct here, unlike on `/auth`.** The bullet above rejects it for the static front doors because it trades a CDN cache hit for a server round trip. This page's answer depends on a row that changes (single-use, revocable, expiring), so there was never a static version to protect — same reasoning as the public EPK page.
- **The actual reason nothing rendered server-side was `authLoading`, again.** The sign-up branch was gated on `!authLoading`, which is true on the first render for everybody and is not persisted — so the server rendered no form at all. This is the third bullet above, re-learned on a new page; the flag was already documented as a trap and still caught this.
- **The signed-in branch gates on a mount flag** (`hasMounted`, the `WorkspaceIdentityPanel` collapsed-state pattern) rather than on the store directly. The auth store **persists** `isAuthenticated`, so without it a returning signed-in visitor's first client render would pick the "Signed in as" branch while the server had rendered the form — a hydration mismatch. An invited stranger, who is the entire audience of this page, is unaffected either way.
- **Verified post-deploy against production** with a real ACTIVE invite: heading + Google button + "Or with email" + all three `<input>`s + the `<noscript>` notice are in the server HTML; a bogus code server-renders "Link not available"; zero console errors on hydration; no overflow at 375px. Submitting still needs JS (supabase-js owns sign-up and the Google redirect) — unavoidable for auth, and where `/auth` landed too. The win is that the page now appears, tells the truth about the link, and lets someone start typing while JS arrives.

### Fourth instance: the curator's own three pages (2026-08-24)

**The same pattern, a fourth time, and this one was predicted in writing.** The
third-instance bullet above records that its audit scope was the auth tree, and
that a flag-gated surface should be re-audited when it is switched on. Pitching
was switched on; `/curator`, `/curator/profile` and `/curator/playlists` were
never re-audited. A newly invited playlist owner then reported "the profile
section has an issue, I can't update profile" from a phone on 2 bars of LTE.

**Read the evidence before assuming a server-side cause.** The screenshot was
Chrome's own "Can't open this page", not anything this app rendered — the
document never arrived. So the immediate cause was the client environment (weak
LTE, 28 open tabs, an iOS renderer kill), and no server-rendering change fixes a
document that never loads. What was ours was the blast radius: measured from a
production build, `/curator/profile` prerendered 27 KiB of HTML containing **no**
"Display name", no "Bio" and no "Save", behind **30 script tags**. A partial load
gave them nothing, and nothing told them why.

- **All three pages now server-render their real content**, and the split
  between page and list is the part to preserve: headers, filters, the add
  control and the whole profile FORM are real markup in the server HTML, while
  the *lists* still wait behind their skeletons. That is deliberate — an empty
  list makes a CLAIM ("No pitches yet", "No playlists yet") that cannot honestly
  be made before the load resolves, whereas a form label is true either way. Do
  not "tidy" this back into one page-level `isLoading` gate; that gate is what
  made a curator on weak data see nothing at all. Verified the way `/auth` was:
  grep the built HTML (`.next/server/app/curator/profile.html` contains "Display
  name", "Short bio", "Save profile"; `curator.html` does NOT contain "No pitches
  yet"), with all three still `○ Static`.
- **Rendering the form early forced two correctness fixes, and they are why it is
  safe.** The field values are now DERIVED (`nameDraft ?? profile?.displayName`)
  rather than seeded by an effect, so a late-arriving profile cannot overwrite
  what someone is already typing; and the save sends **only edited fields**,
  because sending both unconditionally would wipe an existing bio with `''`
  whenever a curator edits just their name before the load lands. The PATCH route
  reads `'bio' in payload`, so an omitted field is genuinely left alone. Removing
  that seeding effect also dropped a `react-hooks/set-state-in-effect` warning
  instead of suppressing it. Enter-to-submit is guarded separately: a disabled
  Save button does not stop form submission, and an empty patch would come back
  "Nothing to save."
- **Failures are visible now, which is the fix that made this report possible to
  act on at all.** `useCuratorStore` had an `isForbidden` boolean that **nothing
  read** — three writes, zero readers — so a failed load left the page with no
  message, no retry, `isLoadingProfile: false` and `profile: null`. It is
  replaced by `profileError`/`playlistsError`/`pitchesError` (three fields
  mirroring the three `isLoading*` flags), rendered through
  `components/curator/CuratorLoadError.tsx` as a blocking state when there is
  nothing to show and a banner when stale data is still usable. `lib/curator-errors.ts`
  holds the pure mapping and **prefers the server's own sentence** over a
  status-derived one, so "This is only for playlist owners." and "Not found."
  reach the user verbatim. The loaders also gained a `catch`: a dropped
  connection used to reject into an unhandled promise, which is exactly the
  weak-link case this whole entry is about.
- **The join route could strand an account permanently, and did not need a real
  failure to do it.** It consumes the invite BEFORE writing `profiles` and
  `curator_profiles`, so a failure in between left the link marked used with no
  curator row: `CuratorShell` bounces such an account out (no curator profile)
  while the team-side chokepoints keep it out of the workspace (role is
  `curator`). No client-reachable recovery. Now the ORIGINAL claimant may resume
  a claim they already made (`canResumeCuratorInviteClaim`, pure and unit
  tested), the `curator_profiles` write is an idempotent upsert, and the invite
  is deliberately still NOT released — releasing it would let a second person
  claim the link. Note `used_at` outranks `revoked_at` in
  `resolveCuratorInviteState`, so a revoked link still reports 'used'; revocation
  is therefore checked separately, and a link the founder turned off stays off.
  The POST reads `used_by` through its own wider column list, because the public
  GET on that route is unauthenticated and `used_by` is somebody's user id.
- **A self-inflicted regression fixed in the same pass.** The curator photo route
  read `ASSET_SIZE_LIMITS.cover_art`, and the 2026-08-22 cover-art work raised
  that from 5 to 25 MiB for DSP-sized artwork — so a 64px avatar silently began
  accepting a 25 MiB upload. It has its own `MAX_CURATOR_PHOTO_BYTES` (5 MiB)
  now, with a test asserting the two are no longer the same number so
  re-coupling them fails in CI rather than in production. The MIME allowlist is
  still shared, which is fine: adding a format there is not a size change.
- **Verified:** 1185 tests (of which ~20 new across `lib/curator-errors.test.ts`,
  `lib/curator-invites-resume.test.ts` and the pitching limits), `eslint .` at
  exactly the measured baseline (3 errors / 66 warnings, all pre-existing in
  `WorkspaceView.tsx`, confirmed by linting a stashed tree), and `next build`
  green by exit code in both flag states with `/auth`, `/onboarding` and
  `/settings` still `○ Static`. Runtime probe: flag on, all four curator routes
  401 unauthenticated; flag off, all four 404 while `/api/releases` still 401s.
- **Not verified, and worth saying plainly:** none of this ran against a real
  database, a real curator account or a real phone — this environment has no
  network route to `app.urganize.app` and cannot mint a Supabase session. The
  join resume path in particular has only ever been exercised as a pure
  function. **It also does not prove the original report is fixed**, because the
  screenshot's proximate cause was a failed document load. Two facts would still
  settle that: the curator's **iOS version** (below 15.4 the whole app breaks on
  `Object.hasOwn` in Next 16's framework chunk, and no application change can fix
  it) and whether the page loads for them at all on wifi.

---

## Logo and photo uploads: one resolver, own limits, self-reporting failures (2026-08-24)

The same curator came back with a sharper report: **desktop too**, and *"if I try to
upload profile or logo it doesn't and the page crashes."* That retires the
weak-connection story as the explanation, and it cannot be chased with devtools —
you cannot ask a partner to open a console. So this pass fixes what is provable
and makes the rest report itself.

**A theory checked and discarded, so nobody re-chases it.** `next/image` throwing
"Invalid src prop … hostname is not configured" looked like the crash:
`WorkspaceLogoSection` rendered a signed Supabase URL through `next/image` with no
`unoptimized`, and `next.config.js` derives `remotePatterns` from
`NEXT_PUBLIC_SUPABASE_URL` **at build time** (empty allowlist if it is missing).
But the installed Next 16.2.1 source settles it: that check sits under
`if (process.env.NODE_ENV !== 'production')` in
`next/dist/shared/lib/image-loader.js`, and `unoptimized` returns before the loader
runs at all (`get-img-props.js`). **In production it cannot throw** — an
unallowlisted host just makes `/_next/image` answer 400 and the image break.
Dev-only. Read the installed source before believing a Next error is your crash.

**The one deterministic bug, and it matches "the logo doesn't upload".** The two
halves of the logo upload used DIFFERENT workspace resolvers: `./upload-url` minted
the path with `ensureOwnedWorkspace` (the workspace the user OWNS) while the
recording `PUT` validated it against `loadWorkspaceAccessContext`'s
`primaryWorkspaceId`. Those deliberately diverge — a user who owns zero releases
and belongs to someone else's team gets the JOINED workspace as their primary (a
2026-07-23 founder decision so an invitee's Teammates list shows their real team,
`lib/tasks-server.ts`). So for anyone newly invited into a team the bytes uploaded
fine and the record call then rejected its own signed path as "not this
workspace's", leaving an orphaned object. Both sides now use
`loadWorkspaceAccessContext`, and both files carry a comment saying the mint and
the check must never drift apart again. Two bonuses: that resolver has its own
provision-on-miss, so a brand-new account is not newly 404'd; and a curator-only
account now gets a clean "No workspace found." instead of `ensureOwnedWorkspace`'s
`CuratorAccountError` surfacing from a *logo* upload as "Playlist owner accounts
cannot create releases."

**The workspace logo was the SECOND victim of the cover-art limit raise**, missed
when the curator photo was decoupled two days earlier. Both halves
(`useWorkspaceSettings.ts`, `upload-url/route.ts`) read
`ASSET_SIZE_LIMITS.cover_art`, so a 96px logo accepted 25 MiB and the Settings help
text advertised it. It has `MAX_WORKSPACE_LOGO_BYTES` (5 MiB) now.
`lib/asset-constants.test.ts` asserts **both** avatar limits are strictly less than
the cover-art limit, and that cover art still clears 20 MiB — a comment could not
stop a third instance, that test can.

**The logo preview no longer uses `next/image`.** Its own sibling renders the SAME
url as a plain `<img>` with an `onError`, and says why
(`WorkspaceIdentityPanel.tsx`: a 1h signed URL should not be proxied and cached by
the optimizer). Two conventions for one URL in one codebase; the documented one
won. The failure state is keyed on the URL that failed, not a bare boolean, so the
next successful upload clears it instead of being stuck on "No preview" forever.

**`buildWorkspaceLogoPayload` no longer takes the identity card down with it.**
`getWorkspaceLogo` rethrows query errors by design, and this builder feeds the
`/api/workspace/identity` AGGREGATE — so one unreadable logo column 500'd the whole
card (name, artist, member count and all). It degrades to "no logo" now, matching
its own documented contract and its sibling `loadWorkspaceLogoFallbackUrl`.

**Upload failures report themselves, and this is the part that answers "I cannot
ask them".** Both flows already caught everything and set a message only the person
at the screen ever saw, which is unrecoverable when a partner says "it doesn't
upload". Both now also fire `asset_upload_failed` (PostHog, the `app_error_shown`
precedent) carrying the surface, the STEP it reached (1 sign, 2 storage PUT, 3
record) and the HTTP status. **`lib/upload-failure-report.ts` is an allowlist, not a
denylist, and that is load-bearing:** an upload error message can carry the user's
file name (often their artist name) or a signed Storage URL, which is a live
credential for an hour. The reason is reduced to a bounded classification
(`network`, `forbidden`, `too_large`, …) rather than passed through, with a test
asserting a message full of both survives as `unknown`.

- **Verified:** 1198 tests (13 new), `eslint .` at exactly the measured baseline
  (3 errors / 66 warnings, all pre-existing in `WorkspaceView.tsx`), `next build`
  green by exit code in both flag states with `/auth`, `/onboarding` and
  `/settings` still `○ Static`. Runtime probe: flags on, the logo and curator photo
  routes 401 unauthenticated; flags off they 404 while `/api/releases` still 401s.
- **Not verified, and it matters here:** nothing ran against a real database,
  Storage bucket, or account — no upload has been exercised end to end. **This does
  NOT prove the reported crash is fixed**, because the crash was never identified;
  the telemetry is what makes the next occurrence name itself. Check PostHog for
  `app_error_shown` and `asset_upload_failed` before assuming this closed it.

**CORRECTION, same day: `NEXT_PUBLIC_POSTHOG_KEY` is NOT set in production, so
every claim above about telemetry was wrong when written.** `captureAnalyticsEvent`
sends to PostHog and otherwise only appends to the USER'S OWN localStorage
(`persistAnalyticsEvent`), which nobody here can read — so `app_error_shown` has
been recording nothing for as long as it has existed, and `asset_upload_failed`
shipped inert. Do not treat either as a diagnostic channel until that env var is
set on the `Web` project.

What replaced it, and why this shape: **the failure code goes ON SCREEN**
(`formatUploadFailureCode` in `lib/upload-failure-report.ts`), appended to the
message the user already sees — `LOGO-3-400`, `PHOTO-2-NET`. It follows the idiom
`app/error.tsx` already uses for a crash ("If you report this, quote <digest>"),
needs no configuration, and needs nothing of the user beyond the screenshot they
were already sending. `SURFACE-STEP-STATUS`, where NET means no response at all —
a different diagnosis from any HTTP status and the likeliest on a weak link. It
carries no file name and no URL for the same reason `classifyUploadFailure` does
not: a string designed to be pasted into a chat has to be safe to paste into a
chat.

Second channel, for what the user never sees: the three upload routes now
`console.error` every rejection with the user id, so **Vercel runtime logs** carry
steps 1 and 3 with no third party involved. Step 2 is browser→Storage directly and
cannot be logged server-side — which is exactly why the on-screen code exists.

---

## Settings became four tabs (2026-08-13, v0.51.0)

Founder: the page was "a bit all over the place." It was **twelve sections in one flat 760px column** divided only by hairlines, with no grouping and — because `AppTopbar` deliberately maps `/settings` to an empty title — **no page title anywhere except the browser tab**. Rare admin work (Teammates) led it, frequent trivia (Appearance) sat sixth, three notification toggles were spread apart, and release deletion sat between two preference switches and the password form. Now: `/settings?tab=<account|workspace|team|notifications>`.

- **Tab state is DERIVED from `useSearchParams`, never mirrored** (`components/settings/useSettingsTab.ts`, modeled on `useSceneOverlay`), and the history model is **replace-only** — unlike scenes there is no open/close pair, so pushing per switch would make Back walk the user backwards through their own tab clicks before it ever left the page. The default tab deletes the param, so the canonical URL stays a clean `/settings` and every existing link in the app still lands right.
- **Reading `useSearchParams` here does NOT repeat the /auth front-door trap**, and the reasoning is in the hook's header so nobody "fixes" it into a post-mount read: `/settings` already served a skeleton as its prerendered HTML (auth is client-only, so the server never had page content to lose), `loading.tsx` is the boundary, nobody unauthenticated ever sees settings — and the param *changes* during the session, so a one-shot `window.location.search` read would be exactly the mirrored state the hook exists to avoid. Verified post-change: `/settings` still builds `○ Static`.
- **The three notification toggles are now rows in one section** (`NotificationsSettingsSection` + the shared `SettingRow`). Each keeps its own gate, and the gates genuinely differ — push hides when the device can't do it (`isPushSupported()` also requires the VAPID key, so it is hidden in any environment without one), After tasks hides behind `NEXT_PUBLIC_FEATURE_TASK_OUTCOMES`, Motivation is deliberately ungated. **That last one is load-bearing:** it is why the section renders unconditionally and why the Notifications tab can never resolve to an empty page.
- **`ArtistProfileSection` moved to the Account tab and was retitled "Your artist name."** It writes `profiles.artist_name` on the user's own row; `WorkspaceArtistSection` writes the workspace's `artists` row. An artist-role account used to see both stacked, both labelled "Artist name" with the same "e.g. Tems" placeholder, with nothing distinguishing them. Splitting them across tabs plus scope-declaring copy is the fix — **do not merge or delete either**, per the standing note that this component stays until `profiles.artist_name`'s four legacy readers retire.
- **The page component went 612 → 202 lines.** Its state moved verbatim into `useWorkspaceSettings` / `useTeammates` (shared cache keys in `settings-cache.ts`), both still called **unconditionally at page level, not per tab**, so every mount-time fetch fires exactly when it did before and tab switches never pay a round trip. The two sections that fetch for themselves (`ReleasesSection`'s command-center load, the push-status probe) now run on their tab's first open instead — both recency-guarded or skeleton-covered.
- **Legacy `/settings#teammates` still works**: `InviteTeamBanner` now links straight to `?tab=team`, and a mount effect redirects the bare hash for stale PWA history, bookmarks, and older UrgAns transcripts.
- **`SettingsPageSkeleton` gained a `tab` prop** and per-tab slot lists, plus the header/pill frame. `app/settings/loading.tsx` cannot read search params from a server component, so it always reserves Account — the same acceptable-guess trade-off its role props already make. Fixed two pre-existing drifts while in there: it never gained a slot for the Motivation toggle added 2026-08-10, and its docstring claimed no `app/settings/loading.tsx` existed when that file has been there all along.
- **Feedback styles unified** in `components/settings/feedback.ts` (boxed `rounded-lg`). They had drifted three ways, including `WorkspaceLogoSection` rendering `rounded-none` against `WorkspaceIdentitySection`'s `rounded-lg` **in the same two-column row**. Compact toggle rows deliberately keep bare inline errors — a bordered box inside a row reads heavier than the row.
- **The pill row fits on a phone, and the measurement method is the part worth keeping.** All four pills are on screen without scrolling at 375px (41.8px spare) and 360px (26.8px spare); below roughly 333px it scrolls, which is graceful and only reaches iPhone-SE-2016-era widths. The row keeps `overflow-x: auto` + `nowrap` as the fallback. Getting there took two wrong answers, both from bad measurement rather than bad layout, so: **`window.innerWidth` is not the layout width in this browser pane** (it reported 439 while `document.documentElement.clientWidth` was the true 375) — subtracting the two and calling the difference "container padding" invents ~64px of padding that does not exist. And **an open modal's scroll lock skews any width measurement**: `body` carried an inline `overflow: hidden; padding-right: 48px`, which made the row look 28px too narrow. Measure with `documentElement.clientWidth`, walk the real ancestor `padding` chain, and check no dialog is open. Actual chain below `sm`: AppShell's `<main>` `px-4` is the only horizontal padding, so available = viewport − 32.
- **`px-2.5` below `sm` on the pills (with `sm:px-3`) is a deliberate divergence** from TasksPanel's shared pill class, and the only one. At `px-3` the four labels need ~323px, which clears 375px but leaves only ~5px at the 360px width much of Android reports; 2px less padding per side buys ~22px. `pillClass`'s comment records this so it is not "tidied" back to a single padding value.
- ~~**Still missing, flagged not built:** there is **no billing/plan section in Settings at all**, yet `app/payment/callback/page.tsx` sends users here after a successful payment.~~ **Built 2026-08-13 (v0.52.0) — see "Settings gains a billing section" below.**
- **Verified:** `pnpm test` (457) + `pnpm lint` (0 errors) + `pnpm build` green, `/settings` still `○ Static`. Browser-verified all four tabs render their intended sections, the URL contract (including `?tab=bogus` → Account and the clean-URL default), **zero history entries added across three tab switches**, the `#teammates` redirect landing on `?tab=team`, both themes resolving through the token system, and the pill measurements above. The skeleton's pill placeholders were sized per label (they were a uniform `w-24`, four of which came to 408px — a placeholder row that scrolled where the real one does not, then shifted every pill left when the labels arrived); the generated `sm:` variants were confirmed present in `(min-width: 640px)` blocks in the live stylesheet. Authenticated rendering required a throwaway dev-only route that seeded a fake user into the auth store, since there are no test credentials and this environment cannot mint a real Supabase session; that harness was deleted before the gates were re-run. **Note for the next person using that trick: a fake user with no releases trips `firstReleaseRequired`, so the create-release modal opens over the page and its scroll lock silently corrupts width measurements.**

---

## Settings gains a billing section (2026-08-13, v0.52.0)

The gap the tabs pass flagged and did not fill. `app/payment/callback/page.tsx` has a button **literally labelled "Billing"** that pushes `/settings`, and Settings had no billing anything — not on the four-tab page, and not on the flat page before it. Git history at `c533339` shows the same fourteen sections with no billing among them, so the "Settings (profile, teammates, subscription)" line in the post-UI-cut inventory was wrong from the day it was written (now corrected in place). Someone who had just paid landed on a page that never confirmed what they bought.

- **It leads the Account tab**, and that placement is the fix rather than a preference: the callback pushes a plain `/settings`, Account is the default tab, so the button now lands on this section with no further navigation and the callback needs to know nothing about tabs. Account rather than a fifth "Billing" pill for two reasons — the subscription is per-USER in the schema (`subscriptions.user_id`, `profiles.is_subscribed`), and a fifth pill needs ~66px where only ~42px is spare at 375px, which would put the tab row back to scrolling on a phone (the thing v0.51.0 had just engineered away).
- **A STATUS surface with one exit, not a second checkout.** `/locked` owns the plan picker, the currency toggle, the trial button and the promo field; this section shows state and links there. Two places computing eligibility or price would be two places to keep in step.
- **It shows no price, deliberately, and that is the most load-bearing decision here.** The amounts in `@urganize/pricing` are today's LIST prices, not necessarily what an account pays: this file already records that the 2026-07-14 reprice moved only the display constants while the live Paystack Plan objects kept billing the old rate, so a grandfathered subscriber renews at a figure the package no longer contains. Printing ₦150,000 to someone paying ₦15,000 would be a confident lie. The plan NAME is safe; the number is not, so `/locked` — where you are about to buy at the current price — stays the only place a figure appears. A unit test asserts `describePlanName` never returns a digit or a currency symbol.
- **"Active until", never "Renews."** `expiresAt` is when access lapses; whether it renews depends on the Paystack subscription still being live, which the snapshot does not say. A test pins the copy against `/renew/i`.
- **No iOS branch in this file, unlike `LockedPageClient`** — and that is the point. Apple's rule is about linking OUT to external payment; "See plans" is an in-app route to `/locked`, which already hides pricing and the Subscribe button on iOS native and offers the manage-on-the-web pointer. One file owns that policy; a second copy here would be a second thing to remember when it changes.
- **All copy logic lives in `lib/billing-summary.ts`, not the component**, because `vitest.config.ts` collects `lib/**/*.test.ts` only — and its own comment names billing and plan resolution as the highest-consequence paths in the app. 20 tests cover the state→copy mapping, allowlist precedence (an allowlisted account reads back as paid with `plan: 'allowlist'`, so a status-first ordering would show it a plan it does not have), singular "1 day left", "Ends today" for zero or negative counts, the Label tier routing to a `mailto:` instead of the dead-end picker, and unrecognised plan values falling back to a generic title rather than leaking a raw enum.
- **Nothing in the copy threatens loss of access**, tested as such: the paywall gate is currently OFF in code (Resolved blocker #1), so "you will lose access" would not be true today.
- **The section is flat, with no card box, and removing that box was a bug fix rather than a style choice.** A `bg-bg-surface` button inside a `bg-bg-elevated` box is invisible in light mode — the two tokens resolve to the same `rgb(250,245,236)`, leaving the CTA defined by nothing but a 6%-opacity border. Measured, not assumed. On the section ground the button sits in the same context as the tab pills, which use these exact classes: delta 16 in light (button lighter than its ground), 33 in dark. `panelClass`'s founder call against boxed "plastic" sections pointed the same way.
- **Verified:** `pnpm test` (485, of which 20 new) + `pnpm lint` (0 errors, 56 warnings = baseline 55 + one unavoidable fetch-on-mount `set-state-in-effect`, the documented React-19 downgraded rule) + `pnpm build` green, `/settings` still `○ Static`. All nine render states browser-checked through a throwaway harness that stubbed `supabase.auth.getSession` and `window.fetch` — trial, last-day trial, monthly, annual, label, expired, unpaid, allowlisted, and the API-error retry — plus both themes and 375px with no horizontal overflow. **The harness trick worth reusing: same-origin iframes, one per state, read after mount** — each iframe patches its own `window.fetch`, so all states resolve in a single pass instead of one navigation each. Screenshots were not possible (the browser pane does not composite frames when undisplayed), so the evidence is computed styles and DOM text, not images.

---

---

## Fan email capture (2026-08-14)

The tenth sanctioned v1 scope expansion (see the 2026-08-14 note in "v1 scope"). Built flag-off; **not yet activated**.

- **What it is:** a "Fan capture" scene on a scoped release. The owner creates one page in a click, writes a headline, an incentive, and the link fans get; the public page lives at `/capture/[token]`. A fan enters an email and the link is revealed on that screen. Collected emails list in-app with a copy-as-CSV export.
- **Flag:** `NEXT_PUBLIC_FEATURE_CAPTURE`, default `false`. Registered in `turbo.json` + `.env.example`. Gates the footer pill, the `?scene=capture` URL param (in both `TasksPanel` and `WorkspaceView`, which mirror each other), the scene prefetch list, all five owner routes, the public POST, and the public page.
- **Schema:** `20260814100000_release_capture_pages.sql` — `release_capture_pages` (the share grant AND the authored copy) + `release_capture_leads`. **Not applied anywhere yet.**

**Six things worth knowing before editing this feature:**

1. **The playbook is the product, and it is deterministic on purpose.** `lib/capture-playbook/capture-v0.1.md` is the source of truth; `index.ts` encodes it; a test asserts their id/version agree. The grader is pure — no React, no I/O, no env — so the editor and the API can both run it over the same draft. It quotes **no study percentages**: every number is either an objective layout constraint (60 characters, 32 characters, square-or-portrait) or a stated house rule, and judgement calls are graded `suggestion`, never `blocker`. If a future change wants to add conversion statistics, they need a real source or they do not go in.
2. **Exactly three rules are blockers, and the set is pinned by a test.** Missing destination, missing headline, and paused. Everything else is a suggestion and can never gate sending — the manager decides which advice their release can ignore. Promoting a suggestion changes what "ready to send" means for every existing page, so the test makes that a deliberate edit rather than a side effect of a copy tweak.
3. **The link is paid out on the same screen, and that is not configurable.** No confirmation email, no double opt-in. The moment the fan submits is the moment they are most willing to act; sending them to a mail client is where that willingness is lost. It is enforced structurally: the destination URL is **not** in the page's server HTML and not in the form's props — it arrives in the POST response, so the exchange cannot be skipped with view-source.
4. **A page with no usable destination refuses to collect.** `isCollecting` is false when paused OR when the destination is unusable, and the public POST re-checks it rather than trusting the render. Taking an address and returning nothing is the one outcome this feature must never produce.
5. **The capture scene is never persisted to localStorage.** A different reason from `files` (expiring signed URLs): this payload carries **other people's email addresses**, and localStorage is readable by any script on the origin and outlives sign-out on a shared machine. Memory caching still applies, so tapping between scenes stays free. Pinned by its own test.
6. **The graphic deliberately skips the workspace-logo fallback** that `/api/releases` and the EPK page both end with. Those want *something* in an artwork slot; this wants a fan to recognise the artist in about a second, and the playbook's G1 rule says a logo does the opposite. No image is the honest outcome, and the checklist's "add cover art" suggestion is what fixes it. The graphic is read-only in v0.1 (it is the release's cover art) — `graphic_asset_id` exists in the schema as the seam for picking a promo image later, gated on `NEXT_PUBLIC_FEATURE_FILES`, since the assets API 404s when that flag is off and a picker today would be a broken control.

- **The footer pill row is now full.** Fan capture is the third pill beside Calendar and Press kit, and it is the one the 2026-08-14 measurement predicted would scroll rather than reflow at 375px. Scrolling is the designed outcome, not a regression — but a fourth pill needs a different shape for that row, not another `shrink-0`.
- **Rotation is its own endpoint** (`POST …/capture/rotate`), not a flag on PATCH, because the editor autosaves — anything reachable from a save can happen without the manager meaning it, and rotating kills a URL that may already be in a bio and a hundred DMs. It is an UPDATE, so the authored copy and every collected email survive. **DELETE is the destructive one** and takes the leads with it; pausing is the reversible alternative and the UI says so.
- **Verified:** `pnpm exec vitest run` (599 passing, 24 env-gated skips), `pnpm exec eslint .` (0 errors, 57 warnings = unchanged baseline), and `next build` green in **both** flag states. Flag ON: `/capture/[token]` compiles as `ƒ (Dynamic)`, owner routes 401 unauthenticated. Flag OFF (the shipping default): all five owner routes and the public POST return 404 while an ungated control route still 401s — which is what proves the 404s are the gate and not a routing accident. **Note `pnpm test` cannot run in a sandboxed session** — turbo's package-manager shim fetches corepack over HTTPS and fails TLS; run vitest directly.
- **Two observations, neither introduced here.** (1) The string "Fan capture" survives in the client chunks with the flag off — the same non-signal CLAUDE.md already records for "Press kit"; the pill still cannot render. (2) `notFound()` on `/capture/[token]` renders the 404 body with an HTTP **200**, because a `force-dynamic` page has already flushed its shell before the data resolves. `/epk/[token]` and `/credits/[token]` behave identically, so this is the established pattern, not a new defect — but if anyone ever needs a true 404 status on these public links, all three need fixing together.
- **Not verified:** nothing has been exercised against a real database — no migration has been applied, so the editor, the autosave loop, the checklist updating as you type, a real submission, and the CSV export have never run end to end. The owner UI cannot be reached without an authenticated session, which this environment cannot mint.
- **Activation checklist:** (1) apply `20260814100000_release_capture_pages.sql`; (2) set `NEXT_PUBLIC_FEATURE_CAPTURE=true` in Vercel `Web` → Production **and make sure the deploy actually rebuilds `apps/web`** — `NEXT_PUBLIC_*` is inlined at build time, and the EP/album flip records `turbo-ignore` skipping a web build whose commit touched only `package.json` files; (3) changelog entry + minor version bump across all 10 `package.json` files (the EPK precedent: the ledger entry lands at flag-flip, not at merge); (4) verify end to end with a real release — create a page, write a headline, submit as a fan from a phone, confirm the link opens immediately and the email lands in the list.

---

## Team logins (2026-08-16)

Founder request: after creating a release the next compulsory action should be
for the app to generate the logins itself, plus a section that generates them
without limit so one can be pasted to someone on WhatsApp or email, and that
person signs in and ends up with their own password.

**Not a scope expansion, and worth saying why** — every other dated section
below the v1 list either claims a number or explains itself. Workspace invite
links have shipped since 2026-07-23 (`workspace_invite_links`, `/join/<code>`,
`/invite/accept`); nothing on the out-of-scope list is touched, no new object
exists, and the release spine holds because the compulsory step hangs off a
release's creation. What was actually missing was that the mint endpoint could
only produce one link at a time with **no way to list or revoke what you had
minted** — the table's own 2026-07 header says "links can be revoked
(revoked_at) — no UI for that yet, but the column is ready". This is that UI,
plus the post-create step.

- **Flag:** `NEXT_PUBLIC_FEATURE_TEAM_LOGINS`, default `false`. Registered in
  `turbo.json` + `.env.example`.
- **Schema:** `20260816100000_workspace_invite_links_team_logins.sql` — `label`,
  `release_id` (**SET NULL**, deliberately unlike the `artist_scope_id` CASCADE
  directly above it: artist scope is an access boundary that must die with its
  artist, this is only provenance, and revoking someone's access because an old
  release was deleted would be a surprise), and `revoked_by`. **Not applied
  anywhere yet.**

**Five things worth knowing before editing this feature:**

1. **A login is a LINK, never a password, and that is the whole security
   argument.** The founder's wording was "he must be prompted to change it",
   which implies a temporary password travelling through WhatsApp; the model
   chosen instead has the recipient CHOOSE their password on `/invite/accept`,
   so nothing shareable is ever a readable credential in a chat log someone
   scrolls back through a year later. Same end state — they hold a password
   only they know — reached without ever transmitting one. `/invite/accept`'s
   password field was relabelled "Choose your password" with an explicit hint
   for exactly this reason: someone handed a link may otherwise sit waiting for
   a password message that is never coming.
2. **The mint POST is NOT flag-gated; the list and revoke endpoints are.**
   `POST /api/workspace/invite-link` has been live since 2026-07-23 and
   Settings → Teammates calls it today, so 404-ing it behind a new flag would
   break a shipped feature. Verified by probe rather than assumed: flag off,
   `GET` and `DELETE` return 404 while `POST` still 401s and an ungated control
   route also 401s — the 404-vs-401 discrimination is what proves the gate is
   real and not a routing accident (the EPK precedent).
3. **"Compulsory" means the step is always shown and has one exit, not that
   anything must be sent.** `ReleaseAccessStep` cannot be closed by backdrop or
   Escape (no Escape handler at all — the repo-wide rule), but its button is
   **always enabled, including when generation fails**, where it reads
   "Continue without a login". A compulsory step that can trap a user when the
   network drops is a bug, not discipline. A release with a team of one is also
   legitimate; what is compulsory is the decision, not the outcome.
4. **The create flow's original branches were deferred, not rewritten.**
   `onCreated` in `WorkspaceView` (and `ChappiPageClient`) now wraps its three
   existing branches — first-win reveal, planner intake, `?new=1` guide — in a
   `resume()` closure the step calls on exit. With the flag off it is one
   boolean and the original path runs verbatim. The closure captures
   `releases.length` from the creating render, which is what preserves the
   first-win branch's documented "releases still empty at this point"
   assumption; evaluating it later would see the resynced list and silently
   kill that reveal.
5. **The list is never cached to localStorage**, unlike `useTeammates`
   alongside it. Painting a stale link could show a manager one they revoked on
   another device and have them paste it into WhatsApp. Same reasoning that
   keeps the capture scene's leads out of persisted storage.

- **Where it lives:** `TeamLoginsSection` in Settings → Team, below Teammates.
  The order is the point — who is already here, then the keys you hand to
  whoever isn't. Manager-only and flag-gated, so most accounts see the tab
  exactly as it was. Unlike the Teammates list (which every teammate can see, a
  deliberate shared-roster surface) a stack of live sign-in links is only ever
  the manager's business.
- **Revoking is immediate and total but does not remove people.**
  `/api/invites/[token]` already refuses any code carrying `revoked_at` on both
  the metadata GET and the accept POST, so someone mid-signup cannot finish;
  anyone who already joined keeps their membership. Removing a teammate is
  still Settings → Teammates. The DELETE is soft (the teammate-removal
  precedent) so the row survives as "Revoked" rather than vanishing from a list
  the manager remembers adding to, and dead rows lose every share control —
  the one thing that must not happen is pasting a link that silently won't work.
- **Verified:** `pnpm exec vitest run` (638 passing incl. 19 new, 24 env-gated
  skips), `pnpm exec eslint .` (0 errors, 59 warnings = 57 baseline + 2
  fetch-on-mount `set-state-in-effect`, the documented React-19 downgraded
  rule), and `next build` green in **both** flag states with `/auth` and
  `/settings` still `○ Static`. **Note `pnpm test` cannot run in a sandboxed
  session** — turbo's package-manager shim fails TLS; run vitest directly.
- **Not verified:** nothing has run against a real database — the migration is
  unapplied, so generating, listing, revoking and a real join have never
  executed end to end, and the owner UI needs an authenticated session this
  environment cannot mint. The post-create step's placement in the create flow
  is reasoned from the code, not observed.
- **Activation checklist:** (1) apply
  `20260816100000_workspace_invite_links_team_logins.sql`; (2) set
  `NEXT_PUBLIC_FEATURE_TEAM_LOGINS=true` in Vercel `Web` → Production **and
  make sure the deploy actually rebuilds `apps/web`** (the EP/album flip records
  `turbo-ignore` skipping a web build whose commit touched only `package.json`
  files); (3) changelog entry + minor version bump across all 10 `package.json`
  files (the EPK precedent: the ledger entry lands at flag-flip, not at merge);
  (4) verify end to end — create a release, confirm the step generates a link,
  open that link in a private window, set a password, and confirm the new
  teammate lands in the workspace and the link is listed in Settings → Team.

---

## Song upload (2026-08-16)

Founder request: users should be able to upload the song for their releases,
"even from the AI".

**Not a scope expansion, and this is the one place it needs saying.** v1 scope
item 4 names *masters* outright ("artwork, **masters**, contracts, split
sheets"), so attaching the audio to a release has always been in the hard list.
The out-of-scope line it sits nearest — "Track / song library as separate
entities (assets cover this for v1)" — is honored literally rather than argued
around: **a song is an `assets` row with `category: 'audio'`**, no new table, no
new object, **no migration**. The bucket, the RLS, the size and MIME rules, and
the per-release cleanup on release/account deletion already cover it. What did
not exist was a surface for it: `NEXT_PUBLIC_FEATURE_FILES` has been off since
URG-182, and the assistant had no way to start an upload at all.

- **Flag:** `NEXT_PUBLIC_FEATURE_SONG_UPLOAD`, default `false`. Registered in
  `turbo.json` + `.env.example`. Gates the pill, the `?scene=song` URL param (in
  both `TasksPanel` and `WorkspaceView`, which mirror each other), the scene
  prefetch list, all four `/song` routes, both UrgAns tools and the chat card.

**Six things worth knowing before editing this feature:**

1. **The flag is deliberately NOT `NEXT_PUBLIC_FEATURE_FILES`, even though they
   share one storage model.** The founder switched the file cabinet off; "attach
   the master to this release" is a different ask from "bring the file manager
   back", and one flag would mean they can only ever be on together. Verified by
   probe rather than asserted: with song on and files off, all four `/song`
   routes 401 unauthenticated while `/assets` still 404s.
2. **No tool can ever be handed a file, and that is permanent.** A model turn is
   text. CLAUDE.md recorded file upload as deferred for exactly this reason, and
   the transport has not changed — what changed is the realisation that the
   upload does not need to travel *through* the model, only to *start* from the
   conversation. So `upload_song` resolves the release, says what is already
   attached, and returns a `clientAction` that drops a real file picker into the
   transcript; the browser then runs the same three-step signed-URL flow the
   scene uses. **A second browser rule makes the card the mechanism rather than a
   consolation prize: `input.click()` only opens a dialog inside a user gesture,
   and a tool result arrives from a network response.** Nothing here could pop a
   dialog by itself even if it wanted to.
3. **`open_song_upload` is the first client action that waits for the user.**
   Every other one is a fire-and-forget side effect executed in a loop. It is
   also held in component state rather than the store and, unlike
   `pendingConfirmation`, it deliberately SURVIVES later turns — a permission
   card must never outlive the reply that proposed it, but this one is not
   destructive, and clearing it when somebody types "what formats do you take?"
   would take the picker away mid-question. "New chat" does clear it.
4. **Recording a song never replaces one.** A release legitimately carries a
   radio edit beside the master; the newest is what every other surface means by
   "the song", and anything superseded stays listed with its own Remove control.
   The alternative — deleting the previous audio row on each upload — destroys a
   file nobody asked us to touch, silently, and it would be invisible with the
   files flag off. DELETE therefore takes an explicit `?songId=`, scoped to the
   release AND to the audio category, so this endpoint can never be turned into
   a way to delete a contract or the cover art.
5. **Both tools are excluded from MCP, for the two different reasons that list
   already carries** — `upload_song` returns a clientAction for a browser an MCP
   client does not have (`navigate`'s reason), and `get_song` reaches a REST
   route that does not accept the internal-actor bearer, so it would 401. The
   count in `protocol.test.ts` stays 11, which is the tripwire working as
   intended rather than an oversight.
6. **The deterministic router covers this too, and that is not decoration:**
   production runs with no model configured for long stretches, so typed
   "upload the song" and an "Upload the song" chip both reach the picker with
   the model off. The keyword branch had to be inserted BEFORE the release
   branch, which already claims 'song' and 'track' for "start a new release",
   and AFTER the task branch, so "add a task to upload the master" stays an
   activity.

- **One implementation of the upload, two entry points.** `lib/song.ts` holds
  the flow and the validation; `useSongUpload` holds the picker/uploading/retry
  state; `SongSection` (scene) and `ChappiSongUploadCard` (chat) are both thin.
  The numbers are never redefined — the ceiling and the MIME allowlist come from
  `asset-constants.ts`, which is what the SERVER validates against, so the two
  cannot drift into a client that accepts what the API rejects. Only the COPY is
  local: the shared validator names the enum value and reads like a stack trace.
- **The scene is memory-cached and never persisted**, the `files` precedent for
  the same reason one step more visible: the payload carries a 1h signed URL an
  `<audio>` element is pointed at, so a stale paint is a play button that 403s.
- **Verified:** the full vitest suite (673 passing, 24 env-gated skips, of which
  22 are new song cases), `eslint .` (0 errors, 59 warnings = unchanged
  baseline), and `next build` green in **both** flag states with `/auth` and
  `/settings` still `○ Static`. Runtime probes in both states as described in
  point 1. **Note `pnpm test` and `pnpm build` cannot run in a sandboxed
  session** — turbo's package-manager shim fetches corepack over HTTPS and fails
  TLS; run `./node_modules/.bin/vitest` and `./node_modules/.bin/next` directly.
- **Not verified:** nothing has run against a real database or a real Supabase
  Storage bucket, and the owner UI needs an authenticated session this
  environment cannot mint — so uploading a real file, playing it back, removing
  it, and the assistant's card end to end have never executed. The card's copy
  and the tools' wiring are confirmed present in the flag-on client and server
  bundles, which is not the same as exercised.
- **Activation checklist:** (1) nothing to migrate — set
  `NEXT_PUBLIC_FEATURE_SONG_UPLOAD=true` in Vercel `Web` → Production **and make
  sure the deploy actually rebuilds `apps/web`** (the EP/album flip records
  `turbo-ignore` skipping a web build whose commit touched only `package.json`
  files); (2) changelog entry + minor version bump across all 10 `package.json`
  files (the EPK precedent: the ledger entry lands at flag-flip, not at merge);
  (3) verify end to end with a real release — upload an MP3 from the Song pill,
  play it back, then ask UrgAns to "upload the song" for another release and
  confirm the card in the conversation does the same thing; (4) watch for
  rejected MP3s. The allowlist is `audio/wav`, `audio/x-wav`, `audio/mpeg` and
  `audio/flac`; a browser reporting `audio/x-flac` or `audio/mp3` would be
  refused, and the fix is one line in `asset-constants.ts` rather than anything
  in this feature.

---

## Mobile scene navigation: top tabs + a folded "more" menu (2026-08-16)

Founder request, via screenshot reference (Vercel's `Logs` page: a persistent
tab strip right under the page title, then a search box and a hamburger
control revealing the rest of that page's actions). The old mobile layout —
"every pill in one wrapping block stuck to the bottom of the screen"
(2026-08-14) — is gone below `lg`. **Desktop is untouched**: the header row
and footer row in `TasksPanel.tsx` render the exact same pills in the exact
same order as before this change.

**The new mobile shape, entirely inside `TasksPanel.tsx`. Corrected the same
day (2026-08-17, founder feedback from live use) — the numbers below are the
CURRENT shape, not the shape it originally shipped in; see the correction
notes after each list for what changed and why:**

1. **Top tabs** (a new row, right below the desktop-only header row's
   position, `lg:hidden`): Calendar, Collect metadata, Pitch — all three are
   scene toggles, so all three light up via `aria-pressed` when their scene
   is open, and none of them hides while another is showing (see "Four
   things worth knowing", point 1). Horizontally scrollable
   (`overflow-x-auto` with the usual gutter-matching `-mx-4 px-4` bleed)
   since even three pills, including the long "Collect metadata" label,
   don't reliably fit a 375px screen. **Press kit and Release recap are NOT
   among these** — see the folded menu below.
2. **A standalone row** at the base of the panel (same sticky footer
   position the old dock used, with no border or background of its own —
   see the rectangle correction below) — now just the search and hamburger
   icon buttons that reveal the folded menu (see the sixth correction
   below for why New activity and Pitch, its original two permanent pills,
   are both gone from here).
3. **A folded "more" menu**, entered via a search icon-button or a hamburger
   icon-button at the trailing end of that row (either opens the same panel,
   and NEITHER auto-focuses the search field — see the zoom correction
   below): a search box plus a filterable list holding everything else the
   old dock used to show — Plan (while it exists), Cover art, Song, Files,
   Status update, Release recap, **Press kit**, Fan capture.

**Six corrections made the same day, from live use on a real phone — the
first zoom fix (below) shipped WRONG and had to be corrected again a few
hours later; read the second bullet before touching font sizes here again,
and the fifth before touching `<html>`'s CSS overflow rules:**

- **The search input had `autoFocus`, and on iOS Safari a field under 16px
  zooms the whole page the instant it's focused** — so tapping the hamburger
  (which only meant to open the menu) also zoomed the page. First fix:
  `autoFocus` removed entirely (both trigger buttons now just open the menu;
  the user taps into the field themselves to type), plus the input's text
  size moved from `text-sm` to `text-base` as a second, independent guard.
- **That second guard was wrong and the zoom kept happening.** `text-base` in
  THIS project's own type scale (`packages/config/tailwind/preset.js`) is
  **14px**, not Tailwind's stock 16px — still under the threshold. The real
  fix is `text-lg`, the first step in this preset's scale that actually
  clears 16px (verified in the compiled CSS: `.text-lg{font-size:16px;...}`
  vs `.text-base{font-size:14px;...}`). **Whenever a fix here depends on a
  Tailwind size utility hitting a specific pixel value, check this preset's
  `fontSize` table first — its scale is shifted down from Tailwind's
  defaults across the board, not just at this one step.** Also added
  `touch-manipulation` to both trigger buttons as an independent guard
  against Safari's separate double-tap-to-zoom gesture (unrelated to focus,
  and harmless either way — it doesn't disable pinch-zoom elsewhere).
- **The standalone row (item 2 above) used to carry `border-t
  border-stroke-subtle bg-bg-base`**, which read as a boxed rectangle sitting
  under the pills rather than the pills floating on the page. Dropped
  entirely, matching the top tabs row's own borderless, backgroundless
  treatment.
- **Press kit moved from the top tabs into the folded menu**, paired with Fan
  capture at the end (the two "send this outward" items, the same pairing
  the desktop footer row already keeps them in) — it wasn't reached often
  enough to earn one of the three permanent tab slots.
- **The mobile dock (and the folded menu panel inside it) stopped sticking to
  the screen entirely**, reported the same day a completely unrelated PR
  ("Lock document to vertical panning to stop swipe-induced page drift", #318)
  gave `<html>` an explicit `overflow-x: hidden` for the first time —
  `<body>` already had it and stickiness worked fine, so the regression
  tracks to the ROOT element specifically. This is the textbook WebKit/Safari
  trigger for `position: sticky` breaking on descendants: any ancestor with
  an explicit non-`visible` `overflow`, root included, can do it. Fixed by
  removing `overflow-x: hidden` from the `html` rule in `globals.css` — the
  other two properties that rule added (`overscroll-behavior-x: none`,
  `touch-action: pan-y`) stay, since neither touches the CSS overflow/
  scrolling-box model the way `overflow-x` does (they only govern touch-
  gesture recognition and scroll-chaining at a boundary), and `touch-action:
  pan-y` was already the mechanism that PR's own comment called "the actual
  fix" for the swipe-drift bug in the first place — `overflow-x: hidden` on
  `html` was always the redundant, riskier half of it. **If the swipe-drift
  bug ever reappears, do NOT reach for `overflow-x: hidden` on `html` again
  without re-testing sticky positioning on a real phone first** — the two
  bugs trade off against each other through this exact property.
- **Recap and Pitch swapped places, and New activity was retired entirely
  (later the same day, a founder request rather than a bug fix like the five
  above).** Recap moved from the top tabs into the folded menu — it opens a
  modal, not a scene, so grouping it with the folded menu's other non-scene
  AI action (Status update) reads better than trailing a strip of things that
  DO light up. Pitch moved the other way, from the standalone row into the
  top tabs — it's a scene toggle exactly like Calendar and Collect metadata,
  so it belongs among them rather than in a row of its own. The standalone
  row's other occupant, New activity/Activities, was removed outright rather
  than moved: `MobileNavBar`'s center "+" button — previously always "New
  release" — is now contextual, opening the task quick-create modal directly
  (via `useTaskUI().openQuickCreate`) when `/dashboard?release=<id>` is the
  current URL, and falling back to "New release" everywhere else. A second,
  release-scoped "new activity" entry point in `TasksPanel` itself became
  redundant once the FAB covered it. The FAB reads `?release=` fresh at CLICK
  time via `window.location.search` (the same deliberate, Suspense-free
  pattern `handleUrgAnsClick` in this file already used) rather than
  subscribing reactively, so the ACTION is always correct regardless of
  render timing; its `aria-label`/`title` deliberately stay a static "New
  release" rather than trying to mirror this, since a render-time read of the
  same URL could go stale on the one transition that matters most (scoping a
  release while already on `/dashboard`, a same-pathname `router.replace`
  nothing in this component subscribes to) — a label that's sometimes wrong
  is worse than one that's honestly generic. Losing the "Activities"
  back-from-a-scene affordance costs nothing functionally: every scene's own
  entry point, top tab or folded-menu item alike, is already a toggle, so
  re-tapping it closes the scene just as well (one extra tap for a
  folded-menu item, since that reopens the menu first). Desktop is
  untouched — its header row still renders `activitiesToggleButton`,
  `pitchButton` and `recapButton` unconditionally, exactly as before; none of
  this touches it, since "the plus icon in the middle" only exists in
  `MobileNavBar`, which never renders at `lg`+.

**Four things worth knowing before editing this again:**

1. **The top tabs deliberately do NOT hide while another scene is open**,
   unlike the desktop footer's Calendar/Press kit pair (which still
   disappears while any scene is showing, via `showOutboundPills` — untouched
   on desktop). A tab strip's whole point is that every tab stays reachable
   with the active one highlighted, matching the reference screenshot (all
   tabs visible, "Logs" lit); hiding tabs while browsing one would break that
   metaphor. All three top tabs (Calendar, Metadata, Pitch as of the sixth
   correction above) are scene toggles and so all light up the same way —
   unlike Recap before it moved out, none of them needs special-casing for a
   modal-opening, never-lights-up item any more.
2. **The folded menu's items are DATA, not pre-rendered JSX**
   (`MoreMenuAction = { key, label, icon, onClick, disabled? }`), specifically
   so its search box can filter on a real `label` string. This is also why
   `statusUpdateAction`/`recapAction` — the two AI actions ported from the
   removed release detail page — changed shape: `TasksPanel` used to receive
   them as a single pre-rendered `extraActions: ReactNode` blob from
   `WorkspaceView`; they are now a typed `TaskPanelAction = { label, onClick,
   disabled? }` object each, so this component can place them in whichever
   zone fits the current width (desktop row for both; the folded-menu row
   for both on mobile, as of the sixth correction above — Recap used to get
   a top tab instead) and still have a label to search against.
   `WorkspaceDesktopFocused` forwards the same two objects verbatim
   (`panelStatusUpdateAction`/`panelRecapAction`, the `panelExtraActions` name
   it replaces).
3. **The folded menu's own action list is deliberately NOT memoized.** Each
   entry's `onClick` closes over `toggleScene`, which itself closes over the
   current `activeScene` — memoizing the array on flags/data that don't
   include `activeScene` would risk serving a stale closure (open a
   different scene, then tap a folded item, and it could toggle against a
   scene that is no longer the open one). Eight items at most, so
   recomputing the array every render costs nothing worth guarding with
   `useMemo`.
4. **Plan and Recap are the two folded items this skeleton can't reserve**,
   for the same reason Plan alone was never reserved in the old dock:
   whether either renders depends on release/draft/task data the skeleton
   runs before it has. The search/hamburger icon-button pair IS still
   reserved whenever any of the six FLAG-known items (Cover art, Song,
   Files, Status update, Press kit, Fan capture) exist — Plan's and Recap's
   own presence or absence doesn't change whether those controls belong in
   the row, only whether tapping them turns up one of the two data-dependent
   items.

**Reused, not rebuilt:** every underlying feature flag, scene-toggle function
(`toggleScene`), and eligibility rule (`showPlanPill`, `isRecapEligible`) is
untouched — this is a pure repositioning of existing buttons across zones,
not a new capability. The one genuinely new piece of wiring is
`MobileNavBar` reaching `useTaskUI()` for its FAB — an existing, already
app-wide mechanism (`NotificationsBell.tsx` already consumes it the same
way), not a new store or a new prop threaded through `AppShell`. No new
flag, no migration, no ledger entry (internal chrome rework, not a v1 scope
item).

**Verified:** `vitest run` (687 passing, unchanged — no test exercises this
mobile chrome directly), `eslint .` (0 errors, 59 warnings — unchanged
baseline), and `next build` green with every relevant pill flag ON and with
them all OFF, confirmed by grepping the flag-on client bundle for the top tab
and folded-menu labels (including "Press kit" landing in the TasksPanel chunk
rather than the top-tabs' three) and confirming `autoFocus` no longer appears
anywhere in that same chunk. The `text-lg`-not-`text-base` fix, and the
sticky-positioning fix, were both confirmed against the actual COMPILED CSS,
not just the source class/rule: `.text-lg{font-size:16px;...}` vs
`.text-base{font-size:14px;...}`, and the compiled `html{...}` rule confirmed
to no longer contain `overflow-x` while still carrying `overscroll-behavior-x`
and `touch-action` — the same verification method is the one to reuse if a
CSS-dependent fix here is ever doubted again. The sixth correction (Recap ↔
Pitch swap, New activity retired) was verified the same way: `vitest run` and
`eslint .` unchanged, `next build` green in both flag states with `/auth` and
`/settings` still `○ Static`, and the flag-on bundle confirmed to still
contain "Pitch" and "New release" (the FAB's now-static label). **Not
verified:** nothing has run in an actual mobile browser — the corrections
above (the zoom, twice; the sticky positioning; the rectangle; the
reordering; the sixth correction's tab swap and FAB retargeting) came from
the founder's own live use or from static/build-time checks, which is not
the same as tapping through the actual mobile chrome; there may be more of
it. Worth one real device or narrow-viewport pass before calling this
settled — in particular, the FAB's contextual behavior when scoping/
unscoping a release while already on `/dashboard` (the one transition its
own click-time-fresh-read design is built to get right) has not been
exercised on a real device.

---

*Last updated: 2026-08-29 (**invite acceptance is durable — shipped as v1.4.2** — see "Invite acceptance is durable now: the deferred claim" near the end of this file. A real invited teammate had an account and no membership, because the accept page creates the account first and joins second with nothing recording the pending join; the token now rides auth.user_metadata and loadWorkspaceAccessContext finishes the join on the first authenticated request. The join logic moved to the leaf-only lib/invite-claims-server.ts — ONE implementation shared by the accept route and the deferred claim; do not grow a second copy. Previously 2026-08-25: **per-user MCP access is LIVE, and shipped as
v1.2.0** — see "Per-user MCP access, over OAuth 2.1" above. The migration is
applied, the flag is on, and the MCP Inspector connected to production
successfully, which in one connection exercises discovery, Dynamic Client
Registration, the consent screen, PKCE, the code exchange, the access token and
tools/list against real tables — and incidentally proves the deploy rebuilt
apps/web, the trap the checklist warns about. The ledger entry landed at the flip
rather than at merge, per the EPK precedent. WHAT IS STILL UNTESTED IS NOT SMALL:
no tool has ever been called, so nothing has round-tripped through the
internal-actor branch where five of the thirteen allow-listed tools live —
create_note among them, whose long-standing 401 this work fixed and which has
never run for real. Revoke, the Settings list, refresh rotation and claude.ai
itself are all still unexercised; one get_workspace_context call answers most of
it. Also recorded: why the claude.ai connector menu was missing (paid plan, and
the path is Settings → Customize → Connectors, not Settings → Connectors).
Previously: **per-user MCP access, over OAuth 2.1** — see
"Per-user MCP access, over OAuth 2.1" above. Founder ask: let all users take
their context to any LLM of their choice. It is OAuth rather than a per-user
token because of one external fact worth re-checking before anyone simplifies
it: Claude Code accepts a static bearer, but claude.ai web and Claude Desktop
assume OAuth 2.1 and attempt Dynamic Client Registration with no no-auth option
and no static-header fallback — and artist managers live in exactly those
clients, so a token would have served the founder and nobody else. Three tables,
five routes, a consent screen, and hashed tokens (a deliberate deviation:
nothing else here hashes anything, because share links must be re-readable to
render a Copy button and an access token never is). "Consistently" turned out to
be half-built already — buildChappiSystemPrompt's team brief plus workspace
snapshot IS the portable context, so it moved to one builder with two consumers
rather than growing a second renderer that would drift. Also inverts the MCP
tool list from a deny-list to an allow-list, because "exposed unless someone
remembers to exclude it" was fine for one founder key and is not once every
customer holds a credential — that list is the only thing between an outside
model and a confirmation-gated tool, since executeToolCall never reads
tool.confirm. Which is how a real bug surfaced: create_note was advertised over
MCP from day one and always 401'd, and the test now guarding that was
mutation-tested twice (the first version matched the import, not the handler).
Two undocumented features found on the way — the team brief and
workspace-summary.ts — are flagged rather than back-filled. NOT verified against
a real database, a real client, or a real consent screen: no migration applied,
no session mintable here, and no route to either urganize domain. Previously:
**an open scene gets the whole surface** — see "An
open scene gets the whole surface" above. Third founder report on Collect
metadata, this one a desktop screenshot, and two width faults behind it. The
release rails only stepped aside for the UrgAns rail and for `?scene=calendar`,
on the recorded reasoning that "the other scenes fit the normal centre column
(founder call)" — they do not: at xl+ the rails plus their gaps take 488px, and
`RailColumn` renders an EMPTY `<div aria-hidden>` when a rail has no cards, so on
a one-release account half the surface was blank beside a crushed 8-field form.
Any open scene now hides them. That fix needed the same decision in
`WorkspaceSkeleton`, which would have been the FOURTH hand-rolled copy of one
four-flag expression — and they had already drifted (TasksPanel's copy was
missing 'song' and 'coverart') — so it now lives once as `resolveActiveScene` in
`lib/scene-cache.ts`, gating only those four scenes deliberately, mutation-tested.
Second fault: the share-link button row carried `flex-wrap` AND `sm:shrink-0`,
which contradict — shrink-0 pins the group at max-content so it can never wrap
and overflows instead, clipping "Regener…". Fixed with the 2026-08-10 TasksPanel
pill precedent (group shrinks, each button `shrink-0 whitespace-nowrap`) in all
three identical copies: Metadata, EPK, Capture. `AssetUploadControl` has the same
class and was left alone on purpose. Nothing was seen in a browser — no
authenticated session here — so it rests on unit tests, the lint/build baseline
and the compiled output. Shipped as v1.1.3. Previously: **Collect metadata calmed
down to three closed cards** — see "Collect metadata: three closed cards on
entry" above. Second
founder report on the same page: round one (2026-08-13) fixed the copy but
left every step rendering fully open on entry, so a first visit still painted
~25 elements at once. This round changes what renders, not what it says — the
three steps became collapsed cards (the TasksPanel bucket pattern), closed on
every entry, each carrying a one-line status chip instead of its full body.
Session-only state, deliberately not persisted, and a load error now shows
ONE box instead of two identical ones. Nothing behavioral changed and nothing
was verified in a browser — this sandbox cannot mint an authenticated
session. Previously: **the workspace back arrow goes back** — see "The
workspace back arrow goes back now" above. Two faults behind one founder report
that it "is not working": it pointed at the catalog unconditionally, and for a
single-release account it was a literal no-op, because `hasAutoScopedRef` meant
"the auto-scope ran" rather than "the auto-scope has had its one chance" — so
arriving ALREADY scoped (a refresh, a bookmark, an UrgAns link, the release
redirect stub) left the ref false, the first press cleared the scope, the effect
immediately re-scoped, and the skeleton gate covered the bounce so nothing
visibly happened. The ref's own comment claimed that bug was fixed; the fix only
covered arrivals where the auto-scope had actually run. Now one rule, three
cases: a scene open closes the scene, otherwise the previous in-app URL from
lib/nav-history, otherwise unscope. Three things not to undo, argued there: it
must never become router.back() (a redirect stub can make a scene URL a tab's
first history entry, so back() ejects the user from the app); the resolver MUST
keep rejecting a previous location that still scopes the same release, because
nav-history holds one slot and skips same-URL writes, so right after closing a
scene the previous location IS that scene (mutation-tested); and the label is
derived from activeScene alone, never from the resolver, which reads
sessionStorage. Reuse rather than new plumbing — nav-history and
NavigationTracker have existed since 2026-07-23 and Settings was their only
consumer. NOT verified by clicking it: no authenticated session in the sandbox
and no route to either urganize domain, and the auto-scope branch has no unit
test since this repo does not test components. Shipped as v1.1.1. Previously:
**pricing v2 is LIVE and Urganize is v1.1.0** — the founder applied both migrations, minted Manager's Paystack Plans and switched `NEXT_PUBLIC_FEATURE_PRICING_V2` on, so the three tiers, their caps, plan changes and read-only-on-payment-failure are all real for users; the ledger entry landed at the flip, per the EPK precedent, announcing the in-app plan picker. The sales-led tier is now called **Group**, not Enterprise — the display name only, since the `enterprise` id is stored in `subscriptions.plan`; a mutation-tested guard pins that split. Nothing in pricing v2 has been exercised against live traffic or real Paystack, and this sandbox cannot reach either urganize domain (the proxy answers 403 to CONNECT), so that gap stands. Previously: **Urganize is v1.0.0** — the founder called AI activation met now that UrgAns runs on a real tool-calling model in production, so the version reserved for it has shipped and every `package.json` moved to 1.0.0. The v0.61.0 changelog entry was rewritten in the same pass after being rejected as "too bogus and technical", and it carried a pricing-page bullet that the app-only scope rule already forbade — so the Release procedure now carries explicit **voice rules**: fifth-grade readable, one or two short sentences per highlight, say "you", and never a marketing-site change. Previously: **logo and photo uploads: one workspace resolver, their
own size limits, and failures that report themselves** — see "Logo and photo
uploads" above. The curator came back with desktop plus "if I try to upload profile
or logo it doesn't and the page crashes", which cannot be chased with devtools on a
partner. A theory to NOT re-chase: the next/image "hostname is not configured"
throw sits under `NODE_ENV !== 'production'` in the installed Next 16.2.1, so it
cannot crash production — read the installed source before believing a Next error
is your crash. The provable bug: the logo's two halves used DIFFERENT workspace
resolvers, and those deliberately diverge for a user who owns zero releases and
belongs to someone else's team, so every newly-invited person's upload was rejected
as "not this workspace's" and orphaned. Both sides use loadWorkspaceAccessContext
now. The logo was also the SECOND victim of the cover-art limit raise (96px avatar
accepting 25 MiB), so it has its own constant and a test now covers BOTH avatars.
Uploads fire `asset_upload_failed` with the step and status — through an allowlist,
never the raw message, because an upload error can carry a file name or a live
signed URL. NOT verified against any real upload, and it does not prove the crash
is fixed; the telemetry is what makes the next report name itself. Previously: **the curator's three pages now server-render, and
their failures are finally visible** — see "Fourth instance: the curator's own
three pages" above. A newly invited playlist owner reported "I can't update
profile"; the screenshot was Chrome's own "Can't open this page", so the
proximate cause was a failed document load on weak LTE rather than anything we
served, and that part is NOT fixed by code. What was ours: `/curator/profile`
prerendered 27 KiB with no "Display name", no "Bio" and no "Save" behind 30
script tags, and `useCuratorStore` carried an `isForbidden` flag that NOTHING
read, so every failure was silent. Headers and the profile form are server
markup now while the LISTS still wait, deliberately — an empty list claims "No
pitches yet", which cannot be honestly said before the load resolves. Rendering
the form early forced two correctness fixes that are why it is safe: field values
are derived rather than seeded by an effect, and the save sends only edited
fields (sending both would wipe an unloaded bio with ''). Also fixed: the join
route could strand an account permanently by consuming the invite before writing
`curator_profiles`, so the original claimant may now resume; and a regression I
introduced two days earlier, where the curator avatar's size cap tracked
`cover_art` and silently rose from 5 to 25 MiB. Previously: read-only on payment failure — see "Read-only on
payment failure" above. The last item in the pricing spec, and the end of the
binary access model: a team that PAID and whose renewal then failed keeps every
read, permanently, and has its writes refused. A trial that expires still gets
the wall. No new flag and NO MIGRATION, because the state is derived from
profiles.paid_at plus a lapsed period, which is the same thing as saying it is
permanent. Six things a later change will be tempted to get wrong, all argued
there; the three sharpest: THE REFUSAL IS 403 AND MUST NEVER BE 402, because the
fetch interceptor redirects the browser to /locked on any same-origin 402 and
would eject a read-only team from the app on their first blocked save — the very
wall this replaces; the discriminator is paid_at and NOT a status string, since a
cancelled card-trial wears status 'cancelled' and never paid a penny; and
HardPaywallGate needed no change precisely because it reads hasAccess, which is
TRUE here, so "tidying" it into a canWrite check puts the wall back in front of
the only customers this exists for. It also creates one bug class worth naming:
read-only has hasAccess true, so all three existing paths to /locked bounced it
(the wall's has-access effect, handleActivate's change-plan branch, Settings'
CTA) and all three are fixed together. Mutation-tested. Also: mark_paid now
stamps paid_at, without which an invoice-settled Label deal would have hit the
full wall, and the founder is alerted at invoice.payment_failed rather than at
the lapse, which is the only moment a recovery is still cheap. NOTHING has run
against real Paystack — no renewal failed, no team went read-only, no alert
delivered. Earlier: plan changes and proration — see "Plan changes and
proration" above. The last item in the pricing spec. An upgrade charges the
difference for the days left and NEVER moves expires_at; a downgrade charges
nothing and waits for the period already paid for. Paystack has no plan-change
endpoint, so a change means disabling the old subscription and creating a
replacement, and the founder does that by hand (founder call) — the app records
the decision, takes the money, switches entitlements and states the deadline in
three places, because an email is one chance to notice and a wrong charge is not
recoverable by noticing later. Six things a later change will be tempted to get
wrong, all argued there: this must not be start-checkout with a different body
(that opens a SECOND Paystack subscription on the same customer and orphans the
first); paystack_subscription_code is cleared on purpose, or the founder's own
disable stamps 'cancelled' over a healthy upgraded row; no new status value ever,
since resolveSnapshot would read it as expired and lock the team out; the paid
branch must divert before the recurring one, whose upsert would discard the
period the upgrade promised to keep; a fresh purchase clears any pending change,
or a months-old request silently downgrades someone; and the fraction is clamped
over a NOMINAL period, because measuring it by subtraction clamps on short months
and overcharges. Mutation-tested. Also fixed two live bugs: Settings' "Change
plan" was a dead round trip that bounced a paying team straight back to the app,
and the renewal ack named the plan the team was leaving. NOTHING has run against
real Paystack — no proration charged, no webhook delivered, no downgrade applied
at a renewal. Earlier: the pricing page, and one number for a limit — see
"The pricing page, and one number for a limit" above. The surface that makes a
tier buyable: three columns on the public page, and a tier picker on the in-app
wall. It REVERSES a founder decision — /pricing has been deliberately price-free
since 2026-07-23 — so the table shipped flag-gated rather than swapped in, though
that gate came off a day later when flipping it failed twice in production (the
flag is inlined at BUILD time, so it needed the var on the right one of two
Vercel projects AND a rebuild of that app; the page has no risk surface, every
CTA being a mailto, so the lever was not worth the coupling — apps/web keeps the
flag, where it gates real checkout). Every CTA stays a capture in both modes (founder call); nothing links to the app. The structural change is the part
worth keeping: apps/homepage cannot import apps/web, so a page quoting "4 people"
would have carried its own copy of a figure the enforcement layer also holds —
the display-vs-reality gap this repo has shipped four times with prices, waiting
to happen with limits. The countable ceilings moved into @urganize/pricing as
`limits`, ENTITLEMENTS now READS them, and tierHighlights() builds each line from
the same field, so the page renders the number the route enforces by
construction (mutation-tested). The booleans and all the resolution logic stayed
in apps/web on purpose. Enterprise advertises neither SSO nor sub-teams, because
both are declared and read by nothing — a contract can promise them, a public
page cannot, and a test enforces that rather than trusting a reviewer. Also:
intent=upgrade was worse than a dead param (a team at a ceiling was bounced
straight back to the app) and now works, and layout.tsx's JSON-LD offer said USD
when every price is in Naira. STILL NOT LIVE: both migrations, Manager's Paystack
Plans, and the flag on BOTH Vercel projects. Earlier: tier checkout and renewal
fixed — see "Tier checkout
and renewal" above. This is the follow-up the enforcement PR flagged as blocking
the pricing-v2 flag, and both bugs had one cause: under the tier model
`subscriptions.plan` holds a TIER and no longer encodes the billing interval,
while nothing stored the interval. So `getPlanExpiry` gave a Label-MONTHLY buyer
a full year (the legacy label plan billed annually, so the name matched) and a
Manager-ANNUAL buyer one month, and `isRecurringPlan` rejected `manager` so the
webhook bailed and renewals silently stopped extending. The interval now rides
`payments.paystack_response.selected_interval` from checkout and lands on the new
`subscriptions.billing_interval` column, because a RENEWAL has no payments row to
read. Five things a later change will be tempted to get wrong, all argued there:
`advancePeriodEnd`'s extend-from-previous-end semantics are correct and must not
be "fixed"; a stored `label` can only mean the new tier, so the copy layer needs
no feature flag to disambiguate; Label's Paystack plan codes point at the LIVE
monthly/annual env vars and never at `PAYSTACK_PLAN_LABEL_*`, which holds a
mislabeled ₦750,000 Plan; the renewal sanity check resolves FORWARD, because
reverse-mapping a code would warn on every Label renewal now that Label reuses
those same Plans; and `enterprise` stays out of `isRecurringPlan` entirely. Also
fixed the copy layer as a founder call — a paying Manager customer's Settings
read "Active plan" with no name, and a lapsed Label subscriber was pointed at a
mailto instead of checkout — which inverted two existing test assertions on
purpose. Mutation-tested rather than merely asserted. STILL NOT REACHABLE: this
makes tier checkout correct, not buyable; `/locked` still posts the legacy ids and
keeps working by design, so the pricing-page PR is what a user would notice.
Earlier: the other two countable caps, plus the archive action
they needed — see "The other two caps: archive, active releases, assistant
actions" above. Archiving a release ships UNFLAGGED, which is the unusual call:
Chappi's update_release already accepts status 'archived' and is not
confirmation-gated, so the state is already reachable in production and a button
adds no new behaviour class. Four things a later change will be tempted to undo:
the assistant ceiling MUST sit inside `if (!confirmedAction)`, because the
confirmation replay calls the model too and a check one block earlier would bill
a user for clicking Approve and refuse to finish an action they had already
authorised (mutation-tested, not just asserted); at the ceiling the reply is
`deterministic` rather than an error, so typed commands and chips keep working
free; the usage window is COMPUTED from `now` using only the billing
day-of-month, because subtracting an interval from expires_at drifts every cycle
(setMonth clamps) and the interval is not recoverable from a tier plan at all;
and `GET /api/releases/[id]` now preserves a terminal status instead of
overwriting it with a computed progress read-out, which is what made an archived
release read back as `draft`. Also recorded there, and BIGGER than the caps:
**pricing v2 is not flippable by minting Paystack Plans alone** — getPlanExpiry
matches plan NAMES so a Label-monthly buyer would get a year for a month's money,
and isRecurringPlan rejects tier ids so renewals silently stop extending. Both
are pre-existing, both invisible only because no tier id can reach checkout yet,
and both belong in the next PR. The activation checklist under "Pricing tiers"
was wrong to imply the Plans were the only step. Earlier the same day: seat
enforcement and the tier resolver — see "Seat enforcement + the tier resolver"
above. The first cap the entitlement map
actually enforces, capped at BOTH places a seat can be created, because one
shareable invite link can be redeemed by many people and capping only the
per-email route leaves the ceiling bypassable. Four things a later change will
be tempted to undo: the tier resolver FAILS OPEN on every uncertainty (unknown
plan, legacy plan, trial, comp, grandfathered deal, read failure all resolve to
the uncapped tier) and inverting that would cap real teams by accident;
getWorkspaceTier exists because the user-scoped answer is wrong when an INVITEE
redeems a link into someone else's team; lib/seats-server.ts must stay
leaf-only, since the invites route deliberately avoids the paywalled auth chain;
and there is NO feature flag because enforcement is structurally inert — nothing
can write plan 'manager' today, and a test asserts that for every plan value any
code path can currently write. Its two deferred caps are the subject of the section
above.
Earlier the same day: data export shipped flag-off — see "Data export"
above. Two downloads in Settings, everything as JSON and every activity as a
spreadsheet, which is what makes `data_export` on every tier a true statement
rather than a promise. Three things a later change will be tempted to undo: the
route is deliberately NOT behind the paywall and a guard test reads its source to
enforce that, because the people who most need their data out are exactly the
ones a paywall stops — and that guard strips comments before matching, since the
route's own header names the wrappers it avoids; scope is the account-deletion
boundary, so you can export exactly what deleting would destroy; and every table
is read with `select('*')` so the export cannot silently shrink as the schema
grows. A verification trap recorded there too: `NEXT_PUBLIC_*` is inlined at
BUILD time even on the server, so probing two flag states by restarting
`next start` proves nothing — rebuild between probes. Earlier the same day:
pricing tiers + the first per-plan entitlement map,
built flag-off — see "Pricing tiers + the entitlement map" above. Three tiers
(Manager ₦35,000/₦350,000, Label ₦80,000/₦800,000, Enterprise sales-led) plus
`lib/entitlements.ts`, the first thing here that maps a plan to what it can DO
rather than just whether it has access. PR 1 of several: schema and config only,
nothing enforced, nothing displayed. Four things a later change will be tempted
to undo, all recorded there: it is ADDITIVE rather than a rename, because
`/locked` and `TeamWall` read `getPlan()` at render time and the paywall is live,
so editing `BILLING_PLANS` would move a real checkout's advertised price; Label's
prices are deliberately identical to the live monthly/annual amounts, which is
what makes only MANAGER need new Paystack Plans and means no subscriber changes
price; `data_export` is true on every tier with a test enforcing that
structurally, because "do not gate it later" is not something a comment can
enforce; and three entitlements (`active_releases`, `urgans_monthly_actions`,
`rollout_template_custom_save`) are declarative only, because nothing ever writes
`releases.status = 'archived'`, nothing counts assistant calls, and custom
templates do not exist. Previously, 2026-08-22: **cover art now has to meet DSP requirements, and
ticking off a cover art activity asks for the file** — see "Cover art meets DSP
requirements, and the task asks for it" above. Still flag-off behind the
existing `NEXT_PUBLIC_FEATURE_COVER_ART`, no new flag and no migration. The
part worth reading before touching it: the old rules were wrong in BOTH
directions, capping cover art at 5 MiB when the 3000x3000 PNG the playbooks ask
for runs past 10 MiB, while advertising WebP that no DSP ingests — the cap is
now 25 MiB and WebP is graded down rather than offered. Below-spec images WARN
and still upload (founder call: a manager with only the designer's draft still
needs it on the release card), only genuinely unusable ones are refused, and
that refusal is client-side by design since validating server-side would mean a
native image dependency this repo does not carry. Dimensions persist in
`assets.metadata.image`, which needed no migration and incidentally unblocks the
capture playbook's documented inability to grade artwork. The completion prompt
makes `useTaskStore`'s one-bottom-surface rule a three-way — cover art, then the
check-in, then the undo toast — and `coverArtPrompt` must be cleared in both
places `outcomePrompt` is. Previously the same day: **the team trial + hard paywall is LIVE in production
(v0.60.0)** — the flag is flipped, the migration applied and, for the first time
in four attempts, the Paystack Plans were minted at the advertised prices
(₦80,000/₦800,000) and the two NGN env vars repointed BEFORE the flip, so
checkout charges what the picker shows. Resolved blocker #1's heading is
corrected accordingly: the gate is ON again, by the TEAM path, and that branch
runs before the free-era early return, which is now only the flag-off path. Two
things the flip does not settle, both recorded in that section: the migration's
idempotent backfill still wants re-running, since the trial stamp is flag-gated
so any team created between apply and flip is unstamped (it fails OPEN, so this
is tidying not a rescue), and nothing in the feature has been verified against
live traffic yet — the pill, both wall variants, checkout crediting the OWNER
rather than the clicker, the five alert types, comp/extend, and Settings for a
teammate on a paying team. Earlier the same day: the 28-day trial promise is gone
from the marketing site — see "The 28-day trial promise, removed" above. Five surfaces promised a
28-day per-account trial or open-ended free access, none of them flag-aware, so
all five would have gone wrong at flag flip; /terms was already wrong, since
nothing has granted a trial on signup since 2026-07-23. /terms §04 got two
substantive edits beyond the number: it now says the trial covers the whole team
rather than each person (which is what combineTeamAccess enforces), and it stops
promising USD billing, which has never worked — no PAYSTACK_PLAN_*_USD env vars
exist and the Paystack account only offers NGN. Three 28-day claims are
deliberately kept, each for a different reason, listed in that section: the
changelog's v0.9.0 entry is history, /locked's trial button is accurate on the
only path that renders it, and /for-curators is structurally free. One live
defect fell out of the sweep and is fixed: summarizeBilling's team branch handled
four of TeamAccessState's five members and fell through on 'paid', so a teammate
on a PAYING team was offered a 28-day trial and pointed at the wall — money rows
are owner-keyed, so their own snapshot reads unpaid and, with /api/trial/start
404ing under the flag, their trialUsed can never become true. Previously,
2026-08-21: team trial + hard paywall built flag-off — see "Team
trial + hard paywall" above. Open access is replaced by a 14-day full-access
TEAM trial ending in a hard wall, with pricing moved to ₦80,000/mo and
₦800,000/yr. It SUPERSEDES the card-before-trial flow built three days earlier
(opposite funnel; that surface stays dark and untouched, and its TRIAL_DAYS=28
must not be reused). Entitlement is now a team question, which is the teammate
inheritance this file has recorded as the blocker on restoring the paywall.
Eight things a later change will be tempted to undo are in that section; the
three sharpest: combineTeamAccess exists because provisioning gives every
account its own empty workspace, so a teammate would otherwise keep working on
a shell trial after their real team was walled; the 15-minute grace is
server-only and all-method, because the fetch interceptor redirects on any 402
and the notifications bell polls a gated route, so a lapse mid-edit would yank
the page within seconds; and mark_paid must never write profiles.is_subscribed,
which grants paid access forever with no expiry and would turn a one-year
invoice deal permanent. Two verification lessons also recorded there: `next
build` type-checks AFTER compiling, so grepping "Compiled successfully" does not
prove a build passed, and `pkill -f "next start"` matches its own command line
and kills the shell. **Before flipping the flag, mint Paystack Plans at the new
prices and repoint the two NGN env vars** — the Plans in use still bill
₦150,000/₦1,500,000, the fourth time this exact gap has come up. Previously,
2026-08-21: Google signups now go through the onboarding wizard
before billing — see point 8 under "Card before the free trial" above. `/auth`
is login-only, so Google from the login page was the one account-creating path
that skipped the wizard: it reached billing having created nothing, while an
email signup got its release and plan first. `/onboarding?setup=1` now runs the
wizard in authed-setup mode (account exists → step 5 skipped, step 4 terminal,
same hand-off), so every funnel reads questions → your release and its plan →
billing → the app. The setup param is read imperatively pre-paint, never via
`useSearchParams` — `/onboarding` and `/auth` are both verified still `○
Static` with their real markup in the server HTML. Same day, earlier: the
card-before-trial flow gained its in-session gate — see point 7 there. The founder's own
live test found a fresh account could create a blank-rollout release and use
the whole app with billing never appearing; the primary cause is that
`NEXT_PUBLIC_FEATURE_CARD_TRIAL` has still never been flipped (no ledger entry
exists, and the activation blocker is unchanged: the Paystack Plans behind
`PAYSTACK_PLAN_MONTHLY_NGN`/`PAYSTACK_PLAN_ANNUAL_NGN` still bill
₦150,000/₦1,500,000, which is what a converting trial would charge on day 28 —
mint the ₦3,500/₦35,000 Plans and repoint before flipping). But the flow also
leaked flag-on: the login bounce fires only on full page loads and both signup
funnels end in SPA navigations from safe paths, so `CardTrialGate` now routes
a `cardTrialRequired` account to `/start-trial` the moment it reaches
`/dashboard`, `/settings` or `/admin` in-session. Fail open everywhere, pure
halves unit-tested, zero behavior change while the flag is off. Previously,
2026-08-18: card before the free trial, built flag-off — see
"Card before the free trial" above. New signups now add a card before reaching
the app: onboarding lands them on `/start-trial`, Paystack takes a ₦100 card
check that the webhook refunds, and a Paystack subscription with
`start_date` = trial end charges the saved card when the 28 days lapse.
Deliberately NOT recorded as a scope expansion — payments and the trial are
both pre-existing v1 machinery, and this only moves WHEN the card is
collected. Six things a later change will be tempted to undo, all in that
section: the webhook branch diverts BEFORE the generic status flip (a card
check is not a purchase) and claims its row by compare-and-set, because two
concurrent deliveries would otherwise create two delayed subscriptions and
double-charge on day 28; trial→paid conversion is the EXISTING renewal path
and needs no new code; the signup cutoff is load-bearing rather than
bookkeeping, since the paywall has been off since 2026-07-23 and plenty of
established accounts match the naive "unpaid and never trialed" predicate;
invited teammates are exempted by an active non-owner membership row, not by
role; `/start-trial` deliberately does not gate on `cardTrialRequired`, or a
flag-on/cutoff-unset deploy would silently no-op the feature; and
`/api/trial/start` 404s under the flag, without which the card is one POST
away from being bypassed. The cancel path closes the deleted 2026-06-05 card
flow's worst gap — that one could never stop the scheduled charge. **Before
flipping the flag, mint NGN Paystack Plans at the current ₦3,500/₦35,000
prices and repoint the plan env vars** — the ones in use still bill
₦150,000/₦1,500,000, and that is what a converting trial would charge.
Previously, 2026-08-17: the UrgAns composer stopped drifting after eight PRs
— see "The UrgAns composer drifted for eight PRs: two `100vh` document floors"
above. The composer is not and never was `sticky`; it is a plain in-flow flex
child whose only claim to the bottom edge is that the document cannot scroll,
and its column's arithmetic was already correct. The slack came from two
ancestors, `.app-body` and `.app-layout`, still carrying `min-height: 100vh`
while everything inside was sized in `dvh` — on mobile `100vh` is the LARGE
viewport, so the document stayed taller than the screen by the browser chrome's
height and the composer rode up with the page. **Both floors had to change:
each alone reproduces the whole symptom, which is exactly the trap that ate PR
#325** (it converted `.app-shell-frame`, whose height is content-driven, so the
two ancestors kept setting the document height over its head). The keyboard-open
override's own comment had literally confessed "there is always a little scroll
to give away" through five failed attempts. Also: the `min-height: 24rem` column
floors became desktop-only, since below their breakpoints they overflow the
column and cause the identical drift; no `100vh` fallback line was kept because
the minifier collapses duplicate declarations to the last one (caught by
checking compiled CSS mid-implementation, and dead code regardless since the app
already hard-fails below iOS 15.4); and the structural fix that would end this
bug CLASS rather than this instance — route-scoping the frame to a definite
height so the column derives from the flex chain instead of hand-summed magic
numbers, including a `4rem` topbar term that is really a growable `min-h-16` —
was deliberately left out so attribution stays clean, and is recorded as the
recommended follow-up. Two things not to reach for: `sticky bottom-0` on the
composer is a guaranteed no-op (the column is exactly viewport-height, so a
sticky child has zero travel), and any `overflow` on `html` re-arms the
#318/#321 landmine. Previously, the same day: Recap and Pitch swapped mobile positions and "New
activity" was retired — see the sixth correction under "Mobile scene
navigation: top tabs + a folded 'more' menu" above. Recap moved from the
mobile top tabs into the folded menu (it opens a modal, not a scene, so it
belongs beside Status update rather than trailing a strip of things that DO
light up); Pitch moved the other way, from its own standalone base-dock pill
into the top tabs, since it's a scene toggle like Calendar and Collect
metadata. New activity was removed outright: `MobileNavBar`'s center "+" FAB
— previously always "New release" — now opens the task quick-create modal
directly when `/dashboard?release=<id>` is current, reading the URL fresh at
click time (the same Suspense-free pattern `handleUrgAnsClick` already used
in that file) so the action is always correct regardless of render timing;
its label deliberately stays a static "New release" rather than trying to
track this, since a render-time read of the same URL could go stale on
exactly the transition that matters (scoping a release while already on
`/dashboard`). Desktop is untouched — none of this touches its header row,
since the FAB only exists in `MobileNavBar`, which never renders at `lg`+.
Previously, the same day: cover art built flag-off — see "Cover art" above. Each release gains a dedicated "Cover art" scene — upload, replace, remove — closing the "future 'set as cover' action" the general Files route's own comment had deferred since Phase 3. Not a scope expansion: v1 scope item 4 names artwork outright, and no migration was needed since `releases.artwork_asset_id` and the `cover_art` asset category already existed. Its own flag, separate from Files, mirroring Song upload's reasoning exactly. Three things a later change will be tempted to undo: uploading REPLACES the current cover art (opposite of Song's keep-every-version model, because a release has exactly one identity image), deleting the old asset first (storage then row) rather than leaving an untethered duplicate the general Files scene would then show with no way to tell which is real; the scene reads `releases.artwork_asset_id` directly and never the legacy `artwork_url`/workspace-logo fallback those OTHER surfaces use, so "no cover art yet" here is honest rather than borrowed from a fallback chain; and a successful upload/removal force-refreshes the workspace command center so the catalog grid updates without a reload, unlike the general Files scene's cover_art uploads which never did. The founder's own phrasing offered "the side menu" as one placement option; it was deliberately NOT reintroduced, since a per-release side menu (`ReleaseSideNav.tsx`) was already tried and killed in URG-200 — this uses the established scene-pill pattern instead. Previously, the same day: the workspace's mobile pill dock — and the folded "more" menu panel inside it — stopped sticking to the screen entirely, reported the same day an unrelated PR, "Lock document to vertical panning to stop swipe-induced page drift" (#318), gave `<html>` its own `overflow-x: hidden` for the first time. `<body>` already had that property and stickiness worked fine, so the regression tracks to the ROOT element specifically — the textbook WebKit/Safari trigger for `position: sticky` breaking on descendants is exactly an ancestor, root included, carrying an explicit non-`visible` `overflow`. Fixed by dropping `overflow-x: hidden` from the `html` rule in `globals.css`; the other two properties that PR added (`overscroll-behavior-x: none`, `touch-action: pan-y`) stay, since neither touches the CSS overflow/scrolling-box model — only `overflow-x` does — and `touch-action: pan-y` was already the mechanism that PR's own comment called "the actual fix" for the swipe-drift bug, making `overflow-x: hidden` on `html` the redundant, riskier half of it all along. **If the swipe-drift bug ever reappears, do not reach for `overflow-x: hidden` on `html` again without re-testing sticky positioning on a real phone — the two trade off against each other through this exact property.** See the new fifth correction bullet under "Mobile scene navigation: top tabs + a folded more menu" above. Previously, the same day: the mobile menu zoom fix from earlier was itself WRONG and needed a second correction — see the same section, now updated in place. The first pass bumped the search input from `text-sm` to `text-base`, believing that hit Tailwind's stock 16px zoom-safe threshold; it does not, because THIS project's own type scale (`packages/config/tailwind/preset.js`) redefines `text-base` to 14px, so the zoom kept happening exactly as reported. Fixed for real with `text-lg` (verified against the actual compiled CSS, not just the class name: `.text-lg{font-size:16px}` vs `.text-base{font-size:14px}`), plus `touch-manipulation` added to both trigger buttons as an independent guard against Safari's separate double-tap-to-zoom gesture. **The generalizable lesson: whenever a fix here depends on a Tailwind size utility hitting a specific pixel value, check this preset's `fontSize` table first and verify against compiled output — its whole scale sits below Tailwind's defaults, not just at this one step, and the class name alone will lie to you.** Previously, the same day: three same-day corrections to the mobile scene nav rework, from the founder's own live use on a real phone: (1) the search input's `autoFocus` was zooming the whole page on iOS Safari the instant the hamburger was tapped (the fix that then needed the second correction above); (2) the standalone pill row at the panel's base carried a `border-t` + `bg-bg-base` that read as a boxed rectangle under the pills — dropped, matching the borderless top-tabs row; (3) Press kit moved out of the top tabs into the folded menu (paired with Fan capture at the end), and Release recap moved to the last position in the top tabs, trailing the two scene-toggle tabs that actually light up. No new flag, no migration — same pure repositioning as the original pass. Previously, 2026-08-16: mobile scene navigation reworked into top tabs + a folded "more" menu. Founder request via screenshot reference: below `lg`, the old "every pill in one wrapping dock" layout is gone, replaced by a persistent top-tab strip, a standalone row (New activity/Activities, Pitch), and a folded, filterable "more" menu reached via a search or hamburger icon-button. Desktop is untouched — same pills, same order, same rows. The two AI actions (Status update, Recap) changed from a single pre-rendered `extraActions` ReactNode blob into structured `TaskPanelAction` objects, specifically so the folded menu's search can filter on a real label. Previously, the same day: song upload built flag-off — see "Song upload" above. Each release gains a Song scene for its audio master, and UrgAns can start that upload from the conversation. Deliberately NOT recorded as a scope expansion, and that section says why: v1 scope item 4 names *masters* outright, and a song is an `assets` row with `category: 'audio'` — no new table, no new object, no migration. Four things a later change will be tempted to undo: the flag is separate from `NEXT_PUBLIC_FEATURE_FILES` on purpose even though they share one storage model, and the two were probe-verified independent; no tool can ever be handed a file, so `upload_song` hands the BROWSER a picker instead, and `input.click()` needing a user gesture is what makes the card the mechanism rather than a workaround; `open_song_upload` is the first client action that waits on the user, and unlike a confirmation card it deliberately survives later turns; and recording a song never replaces one, because the alternative destroys a file silently and invisibly with the files flag off. Previously, the same day: v0.56.0 — team logins SHIPPED: migration applied, ledger entry and version bump done across all 10 `package.json` files. Also carries a **measured partial correction to the `turbo-ignore` trap** recorded under the EP/album flip — read it before trusting any future `NEXT_PUBLIC_*` flip. A version-bump-only commit DOES rebuild `apps/web`, because `apps/web/package.json` is part of the `@urganize/web` package and bumping its `version` marks the package changed; the half that genuinely fails is a same-commit Redeploy or an env-var change with no new commit, where turbo-ignore sees a zero-file diff. Verify by running turbo-ignore yourself with `--fallback` set to the commit Vercel last deployed for that project. Previously, the same day: team logins built flag-off — see "Team logins" above. Creating a release now opens a compulsory step that generates a sign-in link for it, and Settings → Team gained a section that generates them without limit, copies each to WhatsApp or email, and revokes any of them. Deliberately NOT recorded as a scope expansion, and that section says why: workspace invite links have shipped since 2026-07-23 and what was missing was only the ability to list and revoke them — the table's own header has said "no UI for that yet, but the column is ready" for a month. Four things a later change will be tempted to undo: a login is a LINK and never a password, so the recipient chooses their own on /invite/accept rather than receiving one through a chat log; the mint POST stays UNGATED while list and revoke are flagged, because Settings → Teammates already calls it; "compulsory" means always-shown with one exit, and that exit stays enabled when generation FAILS, because a step that can trap a user on a dropped connection is a bug rather than discipline; and the create flow's three original branches were deferred into a resume() closure, not rewritten, which is what preserves the first-win reveal's "releases still empty at this point" assumption. Previously, 2026-08-14: fan email capture built flag-off — the tenth sanctioned scope expansion, see "Fan email capture" above. Per release, one public page trades a link for an email; the hand-crafted conversion playbook in `lib/capture-playbook` is the actual product here and is graded deterministically, with no AI in it. Three things recorded there that a later change will be tempted to undo: the link is paid out on the same screen and the destination is deliberately absent from the page's HTML so the exchange cannot be skipped; exactly three rules are blockers and a test pins the set; and the scene never touches localStorage because its payload is other people's email addresses. Verified in both flag states — the flag-off run is the one that matters and it took two attempts, because `pkill -f "next start"` matches its own command line and killed the shell before the env file was rewritten, so the first "flag off" build was silently another flag-on build. Previously: the curator invite page is server-rendered — the SAME weak-connection dead end, for the third time, and this one cost a real invited curator his sign-up: he could not open his link on Nigerian mobile data and reported it as his own connection. See "Third instance: the curator invite page" under "The front door is server-rendered". The generalizable lesson is recorded on that section's sibling-audit bullet: **the 2026-08-13 sweep's scope was the auth tree, which is exactly how a front door sitting behind an off flag escaped it — when a flag-gated surface is switched ON, re-audit its entry points before a user does it for you.** Two specifics worth carrying: `authLoading` is true on the first render for everybody and was AGAIN the reason nothing rendered server-side despite already being documented as a trap, and `force-dynamic` is right on this page though it was deliberately rejected on `/auth`, because this answer depends on a row that changes. Also on 2026-08-14: the press kit is back on — v0.54.0. `NEXT_PUBLIC_FEATURE_EPK` returns to `true` after an unrecorded spell switched off (that doc gap is now flagged in the EPK section rather than back-filled with a guessed reason), and its pill moved out of the header row to sit beside Calendar in the tasks-panel footer. No code was rebuilt; the whole feature had stayed in place behind the flag. The flag was flipped in Vercel and verified live the same day, so the press kit is reachable in production; the EPK section records the 401-vs-404 probe used to confirm it, which beats trusting a bundle string. Previously, the same day: the two portals are reachable from each other at every width — see "Crossing between the two portals" in the playlist-pitching Working-notes section. The dual-capability account shipped the day before had exactly one app→curator entry point, the identity card, and three independently-correct viewport gates compounded — the card's `hidden lg:block`, its rail-open self-hide, and the topbar's `hidden lg:grid` under the production-only `NEXT_PUBLIC_FEATURE_MOBILE_NAV` — into a band with NO crossing at all: our curator partner was opening a second browser tab on his phone. The crossing now has three homes, one per viewport band, all on one shared gate. Two lessons recorded there: check the flag COMBINATION production actually runs rather than each gate alone (the mistake URG-229 already corrected once for Metadata, repeated with one more gate in the stack), and clear a modal's scroll lock before trusting any width measurement — the first reading of the resulting 13px topbar overflow was a phantom produced by exactly `padding-right: 13px`, the same trap the Settings-tabs section documents. Also on 2026-08-14: Settings gains a billing section, v0.52.0 — see "Settings gains a billing section" above. The payment callback's "Billing" button pushed `/settings`, which had no billing section at any revision; it now leads the Account tab. Three decisions recorded there: it shows the plan NAME and never a price, because the list price in `@urganize/pricing` is not necessarily what a grandfathered account pays; it says "Active until" rather than "Renews", because renewal is not knowable from the snapshot; and it carries no iOS branch, because `/locked` already owns the Apple policy and the CTA is an in-app route. Also fixed the long-standing "Settings (profile, teammates, subscription)" error in the post-UI-cut inventory, and removed the section's card box after measuring that `bg-bg-surface` on `bg-bg-elevated` is the same colour in light mode. Previously, on 2026-08-13: playlist pitching's curator account type became a dual capability rather than an exclusive role, so a playlist owner can now also run releases under the same email; see "Dual-capability accounts" in the playlist-pitching Working-notes section. Also: Settings became four tabs, v0.51.0 — see "Settings became four tabs" above. Twelve sections in one flat column with no grouping and no page title became `/settings?tab=<account|workspace|team|notifications>`; the three notification toggles merged into one section of rows; the two identically-labelled artist-name editors were split across tabs and retitled; the page component went 612 to 202 lines with its state lifted into two hooks. Two traps recorded there: the tab param must stay DERIVED from `useSearchParams` (a post-mount read would desync on Back/Forward, and the /auth front-door trap does not apply for the reasons in the hook header), and Motivation’s deliberate lack of a feature flag is what guarantees the Notifications tab is never empty. Earlier the same day: the two front-door pages, `/auth` and `/onboarding`, are server-rendered now — see "The front door is server-rendered" above; a real user on a weak mobile connection could not sign up at all, because both pages' entire server HTML was a loading screen. Two traps recorded there for anyone editing those files: re-adding `useSearchParams()` to `AuthPageClient` silently returns `/auth` to serving a spinner as its HTML, and the pre-paint session gate is three coupled pieces — inline script, CSS, and the attribute clearing — that have to move together. Also corrected the Deploy Configuration section's redirect direction, which had been backwards since it was written: `www.urganize.app` 308s to the bare apex, verified live, not the reverse. Previously 2026-08-12: a completeness pass on mobile push notifications caught and fixed three real bugs before this ever shipped — see the three notes added inline above: the deadline-reminders toggle silently killing the pre-existing `task_overdue` notification, doubled curly quotes in every default due-date push body, and the motivational-nudges opt-out hidden behind the wrong feature flag — plus confirmed live which of the two new migrations is actually applied. Also: the identity card's nav + Metadata's viewport-split entry point, URG-229 — that entry corrects the "Identity card gains a nav" section, which described the pill's retreat as a flat `lg:hidden` when the shipped code computes it from two other flags; see `METADATA_PILL_HIDE_CLASS`. Previously 2026-08-10: mobile push notifications + editable presets built flag-off, extending the previously-undocumented Web Push stack — now backfilled above — to the native Android/iOS shell; UrgAns release planner rebuilt flag-off, superseding the tailor-plan build; playlist pitching built flag-off, and Resolved blocker #1 corrected: the paywall has been OFF in code since 2026-07-23. The release recap card, Notes and task outcomes from 2026-08-09 are also still flag-off; genre prediction from 2026-08-08 and the native mobile app entry from 2026-08-07 are otherwise still current).*

---

## Team trial + hard paywall (2026-08-21; LIVE in production 2026-08-22, v0.60.0)

Founder request: replace open access with a **14-day full-access TEAM trial that
ends in a hard wall**. No permanent free tier. Pricing is founder-led sales, so
the wall is a sales signal as much as a checkout gate — "Talk to us" carries the
same visual weight as the plan picker, because a roster deal closes over an
invoice and a walkthrough. Built flag-off behind
`NEXT_PUBLIC_FEATURE_HARD_PAYWALL`; **not yet activated**.

**Not a scope expansion.** Payments, the trial and `/locked` are all
pre-existing v1 machinery. What is new is that entitlement is now a TEAM
question, which is the "teammate subscription inheritance" landmine this file
has recorded as a blocker on restoring the paywall since 2026-08-18.

**This SUPERSEDES the card-before-trial flow** (`NEXT_PUBLIC_FEATURE_CARD_TRIAL`,
2026-08-18, never flipped). That one takes a card *before* the app and charges at
day 28; this one gives a team 14 days with no card and then walls. They are
opposite funnels and must never both be on. The card-trial surface stays in the
repo, flag off, untouched — nothing new imports it, and `TEAM_TRIAL_DAYS = 14`
in `lib/team-billing.ts` is deliberately NOT its `TRIAL_DAYS = 28` (which is
still load-bearing copy on `/terms` and the homepage).

**Pricing moved with it** (founder call): Monthly **₦80,000**, Annual
**₦800,000** in `packages/pricing` (team-priced, not per-seat). Marketing side
effect is nil — `/pricing` has shown no prices since 2026-07-23. Note annual NGN
now coincides with Label's stored ₦800,000; harmless, since Label is
`contactSales` and displays no figure.

**Eight things worth knowing before touching this:**

1. **Money rows stay per-OWNER; team facts live on `workspaces`.** The webhook,
   `subscriptions` and `payments` keep their keying untouched (rewiring the money
   path is high risk for no benefit). `workspaces.owner_id` is UNIQUE, so team
   and owner are 1:1 and the halves join cleanly.
   `lib/team-billing-server.ts:getTeamAccessForUser` combines them.
2. **The gate is ONE branch in ONE function.** All ~240 protected call sites
   reach `requireActiveAccount` through three lines in `app/api/_shared/auth.ts`.
   Flag off, `paywall.ts` is byte-identical, including the 2026-07-23 free-era
   early return.
3. **`combineTeamAccess` closes the teammate-shell leak.** Provisioning gives
   EVERY non-curator account its own workspace, so an invited teammate owns an
   empty shell with its own 14-day trial. Without the combiner they would keep
   working after their real team was walled. An owned team counts only when the
   person has no foreign teams or has releases of their own — mirroring the
   primary-workspace exception in `resolveWorkspaceAccessContext`. Zero
   workspaces fails OPEN, because the gate runs before provisioning.
4. **The 15-minute grace is server-only, and applies to ALL methods.** The fetch
   interceptor redirects on any same-origin 402 and the notifications bell polls
   a gated route, so without grace a trial lapsing mid-edit yanks the page within
   seconds. Clients pass `graceMs: 0` and `HardPaywallGate` draws the wall on the
   next navigation. That split IS the spec's "let the save finish, gate on next
   navigation" — do not "simplify" it to one number.
5. **The resolver FAILS OPEN**, unlike the per-user gate it replaces
   (`getFallbackSnapshot` fails closed). It joins four kinds of read, so it has
   more ways to break on infrastructure we do not control, and a wall is a sales
   gate rather than a security boundary (RLS and curator containment are
   untouched). Positive-only 30s cache, so a walled team's answer is never
   cached and paying/comping unlocks on the next request.
6. **`/api/trial/start` 404s under this flag.** It is an OPEN route granting a
   28-day PROFILE trial on nothing but `trial_used === false`, and the resolver
   honours an owner's profile trial — so a walled owner could POST once and walk
   back in. Not in the original spec; found while wiring the gate.
7. **Team checkout credits the OWNER, never the clicker.** `start-checkout`'s
   optional `workspaceId` resolves the subject through `resolveCheckoutSubject`
   and writes the owner into both the `payments` row and Paystack's
   `metadata.user_id`. Access resolves from the owner's snapshot, so crediting a
   paying admin would take the money and leave the team walled.
8. **`mark_paid` must NEVER write `profiles.is_subscribed`.** That flag grants
   paid access forever through `resolveSnapshot`'s back-compat branch with no
   expiry, so using it would turn a one-year invoice deal into a permanent one.
   The admin route writes the subscription with an admin-set `expires_at` plus a
   `payments` record row instead.

- **Copy rules, enforced by test not review:** never the word "workspace", no em
  dashes, no guilt or countdown pressure, and nothing threatening loss of
  access. `billing-alert-templates.test.ts` and `billing-summary.test.ts` both
  assert this on the customer-facing strings.
- **Founder alerts are email + a ledger, not `notifications`.** That table
  cannot carry them: `task_id` is NOT NULL with an FK to `tasks` and every
  `notification_type` value is task-scoped. `billing_events` (RLS on, zero
  policies) is the durable record and the dedupe store; the email is only the
  interrupt, so alerts still show in `/admin/teams` when mail is off.
- **The wall reports itself; the gate does not.** `POST /api/billing/track`
  fires once from the wall's mount, and the SERVER decides first-hit vs
  return-visit (deduped per UTC day). The gate fires many times per page and
  cannot tell a person from a background poll.
- **The trial indicator is above the topbar, not in it.** The topbar's right
  cluster carries a documented width budget that already overflows a 375px phone
  at eight controls. Not dismissible, deliberately: hiding it removes the one
  thing that stops the wall being a surprise.
- **`/admin/teams` is the migration summary** the spec asks for, and is
  deliberately NOT flag-gated so deals can be set up before the flip. It
  surfaces `grandfathered` (the `is_subscribed` back-compat branch) and
  `allowlisted` explicitly, or a legacy paid team would read as walled there and
  fine in the app.
- **Verification lesson worth keeping:** `next build` type-checks AFTER
  compiling, so grepping "Compiled successfully" does **not** prove a build
  passed — it masked a real type error here. Check the exit code. Also note
  `pkill -f "next start"` matches its own command line and kills the shell; use
  a PID file (the capture-feature trap, hit again).
- **The trial stamp is flag-gated, and that is a deploy-safety requirement.**
  `ensureOwnedWorkspace` writes `trial_started_at` / `trial_ends_at` only when
  the flag is on, because those columns do not exist until the migration is
  applied and that is a manual step AFTER this code deploys. Writing them
  unconditionally meant every new account's provisioning INSERT referenced
  columns the live database lacked: swallowed on the
  `loadWorkspaceAccessContext` path (`isTaskSchemaMissingError` matches `42703`
  and `PGRST204`) but silently leaving the account with no team, and worse on
  the routes that call it directly. Flag off, that INSERT is byte-for-byte what
  it was before this feature. Do not "simplify" the gate away.
- **ACTIVATED 2026-08-22 (founder).** The migration is applied, `/admin/teams`
  reviewed, `BILLING_ALERTS_EMAIL` set, and
  `NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true` is live in Vercel `Web` Production.
  **The recurring Paystack reprice trap is CLOSED for the first time:** Plans
  were minted at ₦80,000/₦800,000 and `PAYSTACK_PLAN_MONTHLY_NGN` /
  `PAYSTACK_PLAN_ANNUAL_NGN` repointed BEFORE the flip, so checkout charges what
  the picker advertises. That gap had come up four times (2026-07-14, -07-20,
  -08-16, and as the blocker on this feature) and this is the first pass that did
  not ship it. Ledger entry + version bump across all 10 `package.json` files
  landed as v0.60.0.
- **Two things the flip does NOT settle, both outstanding:**
  1. **Re-run the migration's backfill.** The trial stamp is flag-gated (see the
     bullet above), so any team created between applying the migration and
     flipping the flag has no `trial_ends_at`. Such a row fails OPEN — it reads
     as an active trial, never a wall — so this is tidying rather than a rescue,
     and it is idempotent: `update public.workspaces set trial_started_at =
     coalesce(trial_started_at, created_at, now()), trial_ends_at = now() +
     interval '14 days' where trial_ends_at is null;`. `/admin/teams` shows
     exactly who needs it.
  2. **Nothing has been verified against the live system yet.** Every claim in
     this section rests on unit tests, both-flag-state builds and route probes.
     Still to watch on real traffic: the pill appearing at ≤10 days, the wall in
     both owner and member variants, checkout crediting the OWNER rather than the
     clicker, the five founder alert types actually arriving, comp/extend
     restoring access immediately, and Settings reading correctly for a teammate
     on a paying team (the `'paid'` branch added 2026-08-22, which has never
     rendered against a real session).
- ~~**Out of scope, flagged for a founder copy pass:** `/terms` and the homepage
  `/signup` still say "28-day free trial".~~ **Done 2026-08-22** — see "The
  28-day trial promise, removed" below.
- **Not verified:** nothing has run against a real Supabase, Paystack or Resend
  — no migration applied, so the resolver, the wall, checkout, the alerts and
  the admin actions have never executed end to end. Unit-tested (939 tests) and
  both flag states build clean with runtime route probes, which is not the same
  as exercised.

---

## The 28-day trial promise, removed (2026-08-22)

The copy pass the section above flagged. Five surfaces promised the old
28-day per-account trial or open-ended free access, **none of them reading a
feature flag**, so all five would have gone wrong the moment
`NEXT_PUBLIC_FEATURE_HARD_PAYWALL` flipped. `/terms` was already wrong:
nothing has granted a trial on signup since the paywall was switched off on
2026-07-23.

Everything here describes the intended post-flip state. Today's access is
broader than any of it claims, so it **under-promises rather than
over-promises** and needs no second pass at flip time.

**`/terms` §04 got three substantive edits, not just the number** (and
`LAST_UPDATED` moved to August 22, per the discipline comment above it):
1. 28 becomes 14.
2. It now says the trial covers the **whole team, not each person, so joining
   an existing team does not start a new one**. That is exactly what
   `combineTeamAccess` enforces, and a teammate reading the contract should be
   able to find it there.
3. **"in NGN or USD" is dropped.** USD checkout has never worked: there are no
   `PAYSTACK_PLAN_*_USD` env vars and the Paystack account only offers NGN in
   plan creation. A contract must not promise a currency we cannot bill in.
   ¶2 only covered a lapse, so it now names trial expiry (the main way access
   stops under this system) and states plainly that nothing is deleted.

**The three persona pages** (`for-executives`, `for-managers`,
`for-ai-artists`) said "Urganize is free to use right now". Left alone, fixing
`/signup` alone would have produced a site contradicting itself on three
indexed pages.

**Three things deliberately NOT changed, each for a different reason:**
- **`packages/changelog`'s 28-day entry (v0.9.0) is history.** Rewriting a
  ledger entry would falsify the log, and line 993's "Urganize is now free to
  use" is the same kind of superseded history sitting right beside it. The
  flag-flip entry is what resolves this, which is how a changelog works. It is
  the only place "28-day" survives in built output, verified.
- **`/locked`'s "Start 28-day free trial" (line 408).** Accurate on the only
  path where it renders: with the flag off `POST /api/trial/start` really does
  grant 28 days, and with the flag on `LockedPageClient` early-returns
  `<TeamWall />` so the button is unreachable. Changing it to 14 would make it
  a lie in the one state that shows it.
- **`/for-curators`' four "free for curators" claims.** Structurally true:
  curator routes use `requireCuratorUser` and never reach
  `requireActiveAccount`.

**One live defect found and fixed while sweeping** (`lib/billing-summary.ts`):
`TeamAccessState` has five members and the team branch handled four, falling
through on `'paid'`. Money rows are owner-keyed, so a teammate on a **paying**
team reads back `accountStatus: 'unpaid'` from their own snapshot, and with
`/api/trial/start` 404ing under the flag their `trialUsed` can never become
true — so they hit the no-plan fallback and were told *"You have a 28-day free
trial available, no card needed"*, with a CTA to `/locked`, which renders the
wall for a team that already pays. The new branch is guarded on their **own**
status rather than their role, so a paying owner keeps the richer paid copy.
The pre-existing "a paid team falls through to the ordinary paid copy" test
covered only the owner, which is why this slipped through; the new test asserts
both roles.

**No changelog entry and no version bump.** `apps/homepage` changes never earn
one (Versioning: app-only scope), and the `billing-summary.ts` fix is dark
until the flag flips, where the activation checklist already requires the
ledger entry.

**Verified:** 914 tests pass, `eslint .` matches the measured baseline exactly
(3 errors / 65 warnings, all pre-existing `WorkspaceView.tsx`), homepage lint
clean, and `next build` green by **exit code** for both apps with `apps/web`
built in both flag states and `/auth`, `/onboarding`, `/settings` still
`○ Static` in each. The built homepage output was grepped to confirm no trial
claim survives outside `/changelog`. **Not verified:** the paid-team-member
copy has never rendered against a real session, so it rests on the unit tests
plus the traced precondition. Worth one look in Settings as a teammate after
the flag is flipped.

---

## Seat enforcement + the tier resolver (2026-08-23)

The first cap the entitlement map actually enforces, plus the resolver every
other cap will need. **Not flag-gated, because it does not need to be** — see
the inertness argument below, which is a stronger guarantee than a flag and is
pinned by a test.

**The tier resolver is the piece to understand first.** `getTeamAccessForUser`
already fetched the owner's subscription snapshot to decide `hasAccess` and threw
its `plan` away; `resolveTeamTier` (`lib/entitlements.ts`) maps that plan onto a
tier, and `TeamAccessSnapshot` now carries it.

1. **It FAILS OPEN, everywhere, and inverting that would cap real teams by
   accident.** An unknown plan, an absent plan, every legacy plan id, a trial, a
   grace window, a comped team and a grandfathered `founding` deal all resolve to
   `label`, which is uncapped. So does a walled team, and so does the fail-open
   snapshot. Never change "unknown means uncapped" to "unknown means entry tier".
2. **`getWorkspaceTier(workspaceId)` exists alongside it because the
   user-scoped answer is wrong at one enforcement point.** When somebody redeems
   a shareable invite link the acting user is the INVITEE, whose own primary team
   is not the team being joined — usually their own empty shell, which is on a
   trial and therefore uncapped. Resolving from the workspace's OWNER is the only
   correct read there.

**Seats are capped at BOTH creation points, and that is the whole point.**
`POST /api/workspace/members/invite` mints one seat per email;
`POST /api/invites/[token]` redeems a link MANY people can use. Capping only the
first leaves the ceiling trivially bypassable. Two placement details that took
reading the code to get right:

- In the email route the check sits **inside the new-row `else` branch**, not
  before it. Anywhere earlier also blocks a RE-invite of somebody who already
  holds a seat, which changes no total and must always be allowed.
- In the link route it sits in `joinWorkspaceViaLink` **after** the
  already-a-member early return, which covers both link kinds in one edit.

**`lib/seats-server.ts` is a leaf module on purpose.** The invites route
deliberately hand-rolls its auth and re-declares its own table constant to stay
off the `@/app/api/_shared/auth` chain, because that chain runs
`requireActiveAccount` and an invitee joining a paid team has no subscription of
their own. Importing anything paywall-adjacent into that route would lock out
every new teammate. Keep this module's imports leaf-only.

**Fail-open again, at the count.** `countTeamSeats` returns null on any read
failure and every caller treats null as "do not enforce": turning a transient
database blip into a team that cannot grow is a far worse failure than briefly
allowing one seat too many. Unit-tested, including the throw path.

**LIVE since 2026-08-24, and the tripwire below did NOT fire.** Pricing v2 went
on in production, so a team that buys Manager is genuinely capped at four seats,
three active releases and 150 assistant actions. The guard written to announce
that moment watched `BILLING_PLAN_ORDER` and `ADMIN_ASSIGNABLE_PLANS`, and
`manager` never entered either — it became purchasable through a THIRD path,
`resolveCheckoutPurchase`'s `pricingV2 && isSelfServeTier(plan)` branch. **A test
pointed at constant arrays cannot see a new branch.** It is now pointed at the
checkout decision itself and mutation-tested. Two docstrings that still claimed
inertness (`lib/seats-server.ts`, `lib/release-cap-server.ts`) were corrected at
the same time. The flip capped no existing customer: every pre-tier plan id, plus
trials, comps and `founding` deals, resolves to the uncapped tier, which is now
asserted rather than reasoned about. The original argument follows.

**Why no feature flag: enforcement WAS inert, structurally.** Nothing in
the product can write `subscriptions.plan = 'manager'` — checkout validates
against the legacy plan ids and `ADMIN_ASSIGNABLE_PLANS` does not include it — so
every team resolves to `label` and no ceiling exists to hit.
`entitlements.test.ts` asserts that for **every plan value any code path can
currently write**, so if someone later makes `manager` writable, that test
failing is the reminder that caps just went live for real teams. A second flag
here would add a way for that to be wrong without adding any safety.

**Instrumentation:** a `limit_hit` billing event carrying the entitlement key,
the limit and the count. `billing_events.type` is free text by design, so this
needed **no migration**. These rows are the pricing spec's "track every limit
hit, by entitlement key" and are the clearest buy signal the product produces.

**Settings shows the ceiling before you meet it:** `GET /api/workspace/members`
now returns `seatLimit`, and Teammates renders "3 of 4" plus disables Invite and
Copy-link at the cap. `null` means no ceiling OR an unreadable tier, and renders
nothing either way — the honest fallback. It is deliberately **not** cached
alongside the member list: a ceiling changes when a plan changes, and a stale one
would tell a manager who just upgraded that they are still capped. The disabled
buttons are a courtesy, not a gate; the server still enforces.

**The refusal needs no client work.** Both routes return a flat
`{ error }` at **409**, and both surfaces already render that string verbatim —
Settings in its inline error, and the invite-accept page in its banner. The
invitee's copy adds "Ask the person who invited you to upgrade", since they
cannot fix it themselves.

**The other two countable caps were deferred here and built in the same PR** —
`active_releases` and `urgans_monthly_actions`, each of which needed a
prerequisite this commit did not have (an archive action, and something to count
with). See the section immediately below.

**`rollout_template_custom_save` stays declarative**, and that is not a deferral
to revisit: templates are static TypeScript and `release_plan_drafts` is unique
per release, so there is nothing to save and nothing to gate. Gating it would
gate a feature that does not exist.

**Verified:** 1050 tests (34 new), `eslint .` at the exact 3-error/65-warning
baseline, `next build` green by exit code with pricing v2 both off and on under
production config, `/auth` and `/settings` still `○ Static`. **Not verified:**
nothing has run against a real database, so no seat has actually been refused —
the caps rest on unit tests plus the traced call paths. Worth exercising once
`manager` is a real plan.

---

## The other two caps: archive, active releases, assistant actions (2026-08-23)

The rest of the pricing spec's §3. Same PR as the seat cap above, same
structural inertness (nothing can write the capped tier yet, so nothing is
enforced on any real team today), same **no feature flag** for the same reason.
One new user-facing surface — archiving a release — which ships **unflagged**;
that is the unusual call and it is argued below.

### Archiving, and why it had to come first

An `active_releases` ceiling with no way to free a slot is a cap on
releases-ever-created. Nothing in the product had ever written
`releases.status = 'archived'`, so the cap needed the action, not the reverse.

- **`POST /api/releases/[releaseId]/archive`**, body `{ archived: boolean }`. A
  dedicated route rather than `PATCH`, and that is not a style preference: the
  release PATCH handler is a **full-row replace** — it unconditionally writes
  title, slug, release_date, description, artist_name and status from the body —
  so a sparse `PATCH { status: 'archived' }` blanks the description and then 400s
  on the now-empty title. This route writes `status` and `updated_at`, nothing
  else. (Chappi's `update_release` works around the same trap by reading first
  and merging; see its tool-family note.)
- **Restore is the same endpoint with `archived: false`.** An archive that cannot
  be undone reads as a delete and gets treated like one — people avoid it, keep
  dead releases on the board, and the ceiling stops meaning anything. Restoring
  writes `draft` because nothing records what the status was before, which is
  recorded on `RESTORED_STATUS` rather than left to be rediscovered.
- **Unflagged, deliberately.** `update_release` already accepts
  `status: 'archived'`, is **not** confirmation-gated, and the assistant is live
  in production — so archiving is already reachable today, and every path
  downstream of it (the identity card's active count, recap eligibility) is
  already live. A button adds a deliberate way to reach a state the assistant can
  already produce, not a new behaviour class. It also keeps the cap's copy
  honest: "archive one you have finished" must never be advice a user cannot
  take.
- **A real lie fixed on the way.** `GET /api/releases/[releaseId]` overwrote
  stored status with a computed progress read-out that can only be
  `draft | in_progress | ready`, so an archived release read back as `draft`.
  That endpoint was the only place in the app that did this — every other read
  path returns the stored value. It now preserves a terminal status and computes
  otherwise: the user's explicit statement outranks any derivation.
- **UI:** a `TaskPanelAction` built in `WorkspaceView` beside `recapAction`, so it
  lands in the desktop header row and the mobile folded "more" menu — the two
  places `recapButton` appears, because both are modal-shaped and neither would
  ever light up among the mobile top tabs. Offered on the same eligibility the
  recap uses (**"worth celebrating" and "safe to shelve" are the same moment**),
  or unconditionally as **Restore** once a release is archived.
  `ArchiveReleaseDialog` is modelled on `DeleteReleaseDialog`, whose portal is
  **mandatory** rather than stylistic (AppShell's `lazy-fade` transform breaks
  `position: fixed` for every descendant) — but deliberately **not** styled
  destructive. Archiving loses nothing and the same button undoes it; borrowing
  the delete dialog's red teaches people to fear an action whose whole purpose is
  to be safe.
- **`isRecapEligible` was DUPLICATED in `WorkspaceView.tsx`** — a hand-rolled
  copy that "mirrored" `lib/recap-eligibility.ts`. The archive action made that
  duplicate load-bearing for a second feature, so it now calls the shared
  predicate. Behaviour-identical (`parseReleaseDate` builds the same
  `T00:00:00` date the copy did), and `lib/recap-copy.ts` has no imports at all,
  so nothing server-side follows it into the client bundle.
- **`isReleaseActive` (`lib/release-activity.ts`) is the one definition** of
  "still being worked": not `released`, not `archived`, with an unknown status
  counting as active. Extracted from `WorkspaceIdentityPanel`'s local Set, which
  now imports it, so the number the card shows and the number the cap counts
  cannot disagree. It is deliberately **not** `isRecapEligible`, which answers a
  different question ("finished enough to celebrate") using dates and task
  counts.
  **NAMING:** `lib/release-status.ts` was already taken by the AI status-update
  generator's prompt builders. This module was briefly written to that path
  during the build and clobbered it; the collateral deletion of
  `lib/release-status.test.ts` went unnoticed until `tsc` reported five missing
  exports. If a future change wants a "release status" helper, it goes here.
- **The cap** sits in `POST /api/releases` immediately before the insert — after
  every validation, so a refusal is the last word rather than pre-empting a 400
  the caller should see first, and before anything is created, so a refusal
  leaves nothing half-made. The pre-existing count a few lines above has **no
  status predicate on purpose** (it feeds first-release analytics and means
  "releases ever"); the cap adds a filtered one rather than changing it.

### The assistant action ceiling

**The period is computed, not stored, and that is the whole design.** You cannot
get a period start by subtracting an interval from `subscriptions.expires_at`:
the renewal path advances it with `setMonth(+1)` / `setFullYear(+1)`, which
**clamps** on short months and re-adds from the already-clamped value, so a
derived anniversary drifts every cycle; the interval is **not recoverable** from
`subscriptions.plan` under the tier model (neither `manager` nor `label` says
monthly or annual, and nothing stores it); and an admin `mark_paid` writes an
arbitrary term while `custom` is +100 years. So `lib/urgans-usage.ts` takes
**only the day-of-month** as an anchor and builds the window containing `now`
from `now`. Nothing accumulates, so nothing drifts, and a test walks twelve
consecutive months to prove it. Month-end clamps to the last day, the way every
subscription service does.

**Monthly windows for everyone (founder call), including annual subscribers.**
The entitlement is named `urgans_monthly_actions`; 150 actions for a whole year
on the plan we most want people on would be a mis-sale.

**Five things worth knowing before editing this:**

1. **The check sits INSIDE `if (!confirmedAction)`**, immediately before
   `runChappiAgent`, and the placement is the point. The confirmation replay
   calls the model too (`closeConfirmedAction` writes the closing line), so a
   check one block earlier would bill a user an action for clicking Approve on a
   permission card — and would refuse to finish an action they had already
   authorised. `action-ceiling.test.ts` pins this, and it was **mutation-tested**:
   moving the block above that branch makes exactly that test fail.
2. **At the ceiling the reply is `mode: 'deterministic'`, not an error** (founder
   call). The client's keyword router and action chips keep working, so a capped
   team can still create releases, activities and notes by typing. That path
   makes no model call, costs nothing, and is already what production serves
   whenever no model is configured. The `deterministic` variant gained an
   optional `notice` so the UI can say why the answer reads differently rather
   than silently serving a terser assistant.
3. **429 is the status**, and it is not otherwise emitted by this route — the
   catch block maps an upstream 429 down to 503 — so a 429 here unambiguously
   means "your ceiling", never "gateway busy".
4. **One action per TURN, not per gateway round.** `runChappiAgent` loops up to
   `MAX_ROUNDS = 5`; the billable unit is one POST reaching the agent. Recorded
   **after** the turn succeeds, so a gateway failure is never charged (also
   tested).
5. **Storage is `billing_events`, with no migration.** Its `type` column is free
   text by design and its existing `(workspace_id, type, created_at desc)` index
   is exactly the access path for `count where workspace = ? and type = ? and
   created_at >= ?`. At 150 rows per team per window that is nothing.

**Fails open throughout**, consistent with the tier resolver, the seat counter
and the release counter: an unresolvable team, an unresolvable tier or an
unreadable count all mean "do not enforce". `countBillingEventsSince` returns 0
on error, so a database blip grants a few extra assistant turns — the right
direction to be wrong, because falsely refusing a paying customer their
assistant is much worse than serving a few free ones.

**The 80% banner** is `UrgansUsageStrip`, mounted in `AppShell` beside
`TeamTrialStrip` and carrying that component's contract wholesale: above the
topbar rather than in it (the right cluster's width budget already overflows a
375px phone), calm (no reddening, no escalation, no warning icon), and **not
dismissible**, since dismissing hides the one thing that stops the ceiling being
a surprise. Two details that are easy to get wrong:
- **It is fed by its own `GET /api/urgans/usage`**, not a field on
  `/api/subscription-status`. That payload is cached 20s client-side and 30s
  server-side, and this number changes on every turn — a cached count would go
  stale exactly when it matters.
- **It refetches on conversation activity**, because it is mounted in AppShell
  and therefore survives navigation: a mount-only fetch would answer once per
  full page load, and a heavy session could cross 80% and hit the ceiling with
  the warning never appearing. It subscribes to `useChappiStore.messages.length`
  (over-triggering slightly, since a deterministic chip costs no action but still
  appends a turn — the harmless direction) and latches `noCeiling` on the first
  `limit: null`, which stops it fetching for the rest of the session. Tier only
  changes through a checkout, which returns via `/payment/callback` and reloads
  the app. Today that latch fires for everyone.

### Pricing v2 is NOT flippable by minting Paystack Plans alone

**A correction to the activation checklist in "Pricing tiers + the entitlement
map" above**, found while planning this pass. Two pre-existing bugs sit in the
checkout/renewal path, invisible today only because no tier id can reach it:

1. **`getPlanExpiry` (`lib/billing.ts`) matches plan NAMES**, so `'manager'`
   falls through to +1 month and `'label'` matches +1 year *whatever interval was
   actually bought*. A Label-monthly buyer would get twelve months of access for
   one month's money; a Manager-annual buyer one month for a year's.
2. **`isRecurringPlan` (`lib/billing-plans.ts`) returns false for tier ids**, so
   the webhook bails at `non_recurring_subscription` and **renewals silently stop
   extending** — the exact hazard the pricing migration's own header warns about.

Root cause is the same in both: **under the tier model `plan` no longer encodes
the interval, and nothing stores it.** `PLAN_CODE_ENV_VAR` has no `manager` entry
either, so the two env vars that checklist documents are read by nothing.

**Not fixed here** — this is checkout and renewal, not enforcement, and folding
it into an already-large PR would bury it. It should be the next PR, and **it
blocks the flag**: minting Manager's Paystack Plans is necessary but not
sufficient.

**RESOLVED 2026-08-24** — see "Tier checkout and renewal" below. Both bugs are
fixed and the interval is now stored on `subscriptions.billing_interval`. Left
as written above because the diagnosis is the useful part: it is the reason that
column exists, and the reason a plan name must never be read as an interval
again.

### Verified

The full suite (**1076 passing**, 24 env-gated skips, of which 26 are new across
`release-activity.test.ts`, `urgans-usage.test.ts` and `action-ceiling.test.ts`),
`eslint .` at **3 errors / 66 warnings** — the 3 errors are the unchanged
pre-existing `WorkspaceView.tsx` ones, and the single new warning is
`ArchiveReleaseDialog`'s portal mount guard, byte-for-byte the finding
`DeleteReleaseDialog` already carries (the documented React-19 downgraded rule).
`next build` green **by exit code** with pricing v2 both off and on under
production config (`NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true`), `/auth` and
`/settings` still `○ Static` in each. Runtime probes, rebuilding between them
because `NEXT_PUBLIC_*` is inlined at build time even server-side: Chappi on,
`/api/urgans/usage` **401**s unauthenticated; Chappi off it **404**s while the
ungated control `/api/releases` still **401**s, which is what proves the 404 is
the gate rather than a routing accident. The archive route 401s in both states,
as an unflagged route should.

**Not verified:** nothing has run against a real database, so **no cap has ever
actually refused anything** and no release has been archived end to end. The
archive dialog and the usage strip have never rendered in a browser — the owner
UI needs an authenticated session this environment cannot mint. All of it rests
on unit tests plus traced call paths. Worth one manual pass once `manager` is a
reachable plan: archive a finished release and confirm the catalog grid and the
identity card's count both update without a reload, then restore it.

---

## Data export (2026-08-23, flag-off)

The feature that makes an entitlement true. `lib/entitlements.ts` declares
`data_export` on every tier with a test enforcing it; this is the control that
honours it. Behind `NEXT_PUBLIC_FEATURE_DATA_EXPORT` (default off). **No
migration, no new table** — it is a read.

Two downloads in Settings → Account: **everything as JSON** and **every activity
as a CSV**. Not one zip: an archiver dependency to deliver strictly less.

**Five things worth knowing before touching this:**

1. **The route is DELIBERATELY NOT behind the paywall, and a test enforces
   that.** It uses `getAuthenticatedUser`, never
   `requireActiveAuthenticatedUser`. The people who most need their data out are
   exactly the ones a paywall would stop: a walled team, a failed card, a
   cancellation inside its 90-day window. The whole trust property rests on one
   import, and a comment cannot defend it — so `account-export.test.ts` reads the
   route source and fails if any paywall wrapper appears. **That guard strips
   comments before matching**, which is not a convenience: the route's own header
   names the wrappers it does not use, so a raw grep failed on the very prose
   explaining the rule. Verified by injecting the forbidden import and watching
   the guard trip.
2. **Scope is the account-deletion boundary** (`owner_user_id` / `owner_id`,
   cascading from releases — see `app/api/account/delete-now/route.ts`). "You can
   export exactly what deleting your account would destroy" is a rule that is
   easy to check and impossible to argue with, and it is why the section sits
   directly above Delete account: same conversation, right order.
3. **Every table is read with `select('*')`, never a column allowlist.** An
   allowlist would quietly shrink the export each time the schema grew. A
   denylist in `lib/account-export.ts` (`REDACTED_KEYS`) removes credentials
   after the fact — `paystack_response` is the sharp one, since it carries an
   `email_token` capable of mutating a live subscription and this file gets
   forwarded to accountants. Share tokens are deliberately KEPT: they are the
   user's own links, already visible in the app.
4. **Sections fail independently.** A table that does not exist in this
   environment reports itself as `unavailable` with a reason, so an empty section
   is never ambiguous between "you have no data" and "we could not read it" — the
   defensive-probe pattern `release-recap` already uses for `playlist_pitches`.
   Truncation past `EXPORT_ROW_CAP` is likewise announced in the envelope rather
   than silently dropping rows.
5. **Native cannot download, and the code says so out loud.**
   `shareOrDownloadTextFile` (new, in `lib/share-file.ts` beside the image
   helper) uses the share sheet when the Capacitor plugins are present and
   returns `'unsupported'` when they are not — an export is fetched from our own
   API with an Authorization header, so there is no URL a system browser could be
   pointed at. The UI then tells the user to use the web app. A silent no-op on
   *this* button would be the worst outcome in the product.

**`lib/csv.ts` is new and shared.** The escape rule already existed three times
over (`admin/onboarding`, `admin/pricing-validation`, `CaptureSection`); a fourth
copy is worse than a helper. The existing three are deliberately left alone —
they work, and migrating them is not this feature's job. It quotes every field
unconditionally, which is right by construction rather than right about commas,
quotes, newlines, leading zeros and whatever Excel decides looks like a date.

**A verification trap worth remembering:** `NEXT_PUBLIC_*` is inlined at build
time **even on the server**, so probing two flag states by restarting
`next start` with different env proves nothing — both runs serve the last build.
The first probe here showed 401 in both states for exactly that reason. Rebuild
between probes. Done properly: flag off → export **404** while the ungated
control `/api/releases` **401**s; flag on → export **401**. That
404-vs-401 discrimination is what rules out a routing accident.

**Verified:** 1018 tests (36 new), `eslint .` at the exact 3-error/65-warning
baseline, homepage lint clean, `next build` green by exit code in both flag
states with `/auth` and `/settings` still `○ Static`, plus the runtime probes
above. **Not verified:** nothing has run against a real database, so a real
export has never been generated — the owner UI needs an authenticated session
this environment cannot mint. The JSON shape, the signed asset URLs and the
spreadsheet are reasoned from code plus unit tests, not observed.

**Activation checklist:** (1) nothing to migrate — set
`NEXT_PUBLIC_FEATURE_DATA_EXPORT=true` in Vercel `Web` **and make sure the deploy
rebuilds `apps/web`**; (2) export a real account and open both files, checking
especially that no section reads `unavailable` in production (that would mean a
table this environment genuinely lacks) and that an asset `download_url`
resolves; (3) changelog entry + version bump at flip, not at merge (the EPK
precedent). **Only after that is the pricing page allowed to advertise
"Export your data anytime"** — until then that line would be a claim we cannot
keep.

---

## Pricing tiers + the entitlement map (2026-08-23, flag-off)

Founder spec: replace the single team price with three tiers, and introduce the
first **per-plan entitlement map** this product has ever had. Everything before
this was binary — `requireActiveAccount` answered yes or no, and feature
availability was a global `NEXT_PUBLIC_FEATURE_*` env flag identical for every
paying team. Behind `NEXT_PUBLIC_FEATURE_PRICING_V2` (default off). **PR 1 of
several: schema and config only, nothing enforced, nothing displayed.**

Tiers: **Manager** ₦35,000/₦350,000, **Label** ₦80,000/₦800,000 (`recommended`,
the tier we sell), **Enterprise** sales-led with no price.

**Renamed 2026-08-24 (founder call): the sales-led tier is called "Group", not
"Enterprise".** Two reasons, both about this niche: "Enterprise" is B2B software
jargon that means nothing to a label head and breaks the marketing voice rules
(fifth-grade readable, no jargon), and "Group" is what its own audience line
already says — distributors and groups operating several labels, neither of
which is "a label". The founder's first instinct was a two-step shuffle
(Enterprise→Label, Label→Team); the second half was argued down and dropped,
because it would have moved the word "Label" off the priced, self-serve,
recommended tier and put the ICP behind a sales conversation, and because
nobody self-identifies as "a team". The ladder is **Manager → Label → Group**.

**The DISPLAY NAME changed; the `enterprise` ID did NOT, and must not.** That id
is written into `subscriptions.plan` and allowed by `subscriptions_plan_check`
(`20260823100000_pricing_tiers.sql`), so renaming it needs a migration plus a
backfill and would silently re-grade stored rows — and the `label` id already
carries two historical meanings, so a third collision is exactly what to avoid.
`entitlements.test.ts` pins the split (id `enterprise`, label `Group`, and no
tier displaying the old word), mutation-tested rather than merely asserted. No
changelog entry or version bump: in `apps/web` every surface carrying this copy
is behind `NEXT_PUBLIC_FEATURE_PRICING_V2`, which is off, so the only live
surface is the public `/pricing` page — an `apps/homepage` change, which the
app-only scope rule excludes. Both priced tiers hold
the 10× "2 months free" ratio the ladder has always used.

**Five things worth knowing before touching this:**

1. **It is ADDITIVE, not a rename, and that was forced by timing.** The hard
   paywall went live the day before (v0.60.0) and `/locked` + `TeamWall` call
   `getPlan()` from `packages/pricing` at render time, so editing `BILLING_PLANS`
   would change what a real checkout advertises. `BILLING_PLANS`, `BillingPlanId`
   and every existing export are untouched; `PRICING_TIERS` sits beside them. A
   test pins the live amounts at ₦80,000/₦800,000 so this PR cannot have moved
   them.
2. **Label's prices are deliberately identical to the live monthly/annual
   amounts, and that is the whole migration story.** `monthly → label@monthly`
   and `annual → label@annual`, same figures against the **same Paystack Plan
   objects**, so no existing or in-flight subscriber changes price and **only
   Manager needs new Plans minted**. A test pins Label's amounts to
   `BILLING_PLANS`' so the two cannot drift while they share Plan objects.
   Today's `label` (contactSales, and *unreachable* — absent from
   `subscriptions_plan_check` and `PAYSTACK_PLAN_LABEL_*` unset, so checkout 500s
   before the CHECK could reject it) maps onto `enterprise`: same offer, clearer
   name, no data to migrate.
3. **`data_export` is true on every tier and a test enforces it structurally.**
   It is a trust feature, not a revenue feature: a buyer who cannot get their
   catalogue back out has been trapped rather than sold to. The spec says "do not
   gate it later", and a comment cannot enforce "later" — `entitlements.test.ts`
   can. If a future change needs it gated, that test failing IS the conversation.
   **The feature itself does not exist yet** (no export route, no Settings
   control; the fan-capture "Copy as CSV" is a clipboard write), so declaring it
   here is a commitment: do not advertise it on a public page until it is built.
4. **Never compare a plan name inside a feature check.** Always resolve through
   `resolveEntitlements` / `getEntitlement`. That is what lets a tier be re-cut
   without a deploy, and why there are no exported per-tier constants. Writing
   `tier === 'manager'` in a route means the map is missing a key.
5. **`UNLIMITED` is `null`, not `Infinity` or a large integer.** It survives
   JSON, cannot be accidentally compared with `<`, and forces callers through
   `isWithinLimit`. `remainingAllowance` never returns a negative, because the
   spec's downgrade rule is "block new invites, deactivate nobody" — a team that
   dropped below its seat count reads 0, not −6.

**Three entitlements are DECLARATIVE ONLY — reading them today gates nothing:**
- `rollout_template_custom_save` — templates are static TypeScript in
  `lib/release-templates`, and `release_plan_drafts` is unique per release, so
  there is nowhere to save a reusable one. Gating this would gate a feature that
  does not exist.
- `urgans_monthly_actions` — nothing counts assistant calls. No counter table, no
  server-side event, not even a PostHog event per invocation. The counter and its
  billing-anniversary reset are a new build including storage.
- `active_releases` — **not enforceable, and the reason is load-bearing.** Nothing
  ever writes `releases.status = 'released'` or `'archived'`, no UI exposes a
  status picker, and `GET /api/releases/[id]` **overwrites** stored status with a
  computed value that can only be `draft | in_progress | ready`. So a cap keyed on
  that column is a cap on releases-ever-created with no way to free a slot — the
  opposite of the spec's "archiving or completing frees a slot immediately".
  `lib/recap-eligibility.ts` already answers "is this finished" honestly (date
  passed OR all tasks done) and is the definition to reuse, but an explicit
  archive action is a prerequisite.

`sso` and `sub_teams` are declared false outside Enterprise and read by nothing —
deliberate, and consistent with principle 6: the map records the offer, it does
not authorise the build.

**Migration `20260823100000_pricing_tiers.sql`** widens `subscriptions_plan_check`
for the three tier ids (purely additive — a value this constraint stops
permitting makes `isRecurringPlan` stop recognising it and the webhook
**silently stops extending** that subscription) and adds
`workspaces.legacy_rate_expires_at`. **No new `legacy_founding` column:**
`billing_plan = 'founding'` already means lifetime price lock and is already
independent of `subscriptions.plan` as the spec asks, and
`billing_locked_amount` is already the rate — what was missing was an end date,
since "lifetime" is the one thing a 12-month legacy rate is not. The migration
also extends `prevent_workspace_billing_self_update` to the new column; leaving
it out would let an owner extend their own legacy rate from the browser, because
"Owners manage workspaces" is `FOR ALL`.

**Two more spec items flagged rather than built:** a seat cap needs **two**
enforcement points, not one — the invite-link path mints one code many people
redeem, so `members/invite/route.ts` alone is bypassable and
`invites/[token]/route.ts` needs it too. And a 4-seat Manager cap makes
`packages/pricing`'s own "Team-priced, not per-seat" comment false; move that
comment with the decision.

**Not in this PR:** enforcement, data export, the public pricing page, read-only
on payment failure (founder call: payment failure only, trial expiry keeps the
wall), plan changes and proration, grandfathering execution, and the
workspace-starts-empty copy pass. Suggested order is export → enforcement →
pricing page → read-only → plan changes, because export unblocks the page and the
page is the revenue surface.

**Verified:** 982 tests (26 new), `eslint .` at the exact 3-error/65-warning
baseline, and `next build` green **by exit code** for both apps with `apps/web`
built in both flag states under production config
(`NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true`), `/auth`, `/onboarding`, `/settings`
still `○ Static` in each. **The inertness proof is the useful part:** the live
prices bundle as `8e4`/`8e5` (minifiers rewrite `80_000` exponentially, so
grepping for "80,000" measures nothing — the comma comes from `Intl` at runtime),
while Manager's `35e3`/`35e4` and every new symbol (`PRICING_TIERS`, each
entitlement key, the tier copy) appear in **zero** browser chunks. Nothing
imports them yet, so they are tree-shaken out entirely — stronger than the flag
hiding them. In the homepage build the tier data reaches server source maps only,
never a browser chunk.

**Activation checklist** — corrected twice, and now current. It first implied
minting Paystack Plans was the only step, which was wrong: two pre-existing
checkout/renewal bugs blocked the flag. **Both are FIXED as of 2026-08-24** —
see "Tier checkout and renewal" below. What remains:

1. Apply `20260823100000_pricing_tiers.sql` and
   `20260824100000_subscriptions_billing_interval.sql`. The second is not
   optional: without `subscriptions.billing_interval` a tier subscription cannot
   record whether it bills monthly or annually, and every renewal extends by the
   wrong period.
2. **Mint two Paystack Plans — Manager monthly ₦35,000 and Manager annual
   ₦350,000 — and set `PAYSTACK_PLAN_MANAGER_MONTHLY_NGN` /
   `PAYSTACK_PLAN_MANAGER_ANNUAL_NGN`.** Both vars are now read (they were read
   by nothing until 2026-08-24). Label reuses the Plans minted 2026-08-22
   unchanged, so **do not repoint** `PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN`. Manager
   is the only tier that can reproduce the advertise-vs-charge gap (five
   occurrences and counting) — and until its two vars are set, a Manager checkout
   returns a 500 rather than charging the wrong Plan, which is the correct
   failure.
3. The pricing-page PR, which is what actually makes a tier buyable: `/locked`
   still posts the legacy `monthly`/`annual` ids, and those keep working under
   the flag by design. Enforcement, export and checkout/renewal are done, so the
   flag alone still changes nothing a user sees.
4. Changelog entry + version bump at flip, not at merge (the EPK precedent).

---

## Card before the free trial (2026-08-18)

Founder request: "find a service for users to put in their card details before
accessing the free trial. it should be the first thing after they are
onboarded on the app" — reference screenshots of Intercom's Early Stage
checkout (card required, "Due today $0", trial converts automatically).

**Not a scope expansion.** Payments and the 28-day trial are both pre-existing
v1 machinery; this changes WHEN the card is collected, not what is sold. It
also finally uses a state the schema has always allowed and nothing ever wrote
(`subscriptions.status = 'trialing'`), and reads the `PaystackAuthorization`
type the webhook has declared-but-never-read since it was written.

**Service: Paystack** (already integrated). Verified against Paystack's own
docs before building: there is **no ₦0 card-save** — regulators require a real
2FA-authenticated charge, with a documented ₦50 tokenization minimum — and
`POST /subscription` accepts **`start_date`**, which is Paystack's documented
free-trial mechanism (first debit delayed to trial end). Stripe, which the
reference screenshots use, does **not** onboard Nigerian businesses; Stripe
acquired Paystack in 2020, so Paystack *is* the Stripe network here. So the
Intercom UX is reproducible in full except the literal "$0 today": we take a
**₦100 card check and refund it automatically**.

**Founder decisions (all four asked before building):** Paystack · auto-refund
the ₦100 · keep 28 days (terms, the /pricing FAQ and /locked all say 28) ·
**new signups only**. The two paywall kill-switches stay OFF — this ships as
product friction on the signup path, not a restored paywall.

- **Flag:** `NEXT_PUBLIC_FEATURE_CARD_TRIAL`, default `false`. Registered in
  `turbo.json` + `.env.example`. **No migration** — `subscriptions.status`
  already allows `'trialing'`, `payments.plan` is free text, `payments.status`
  already allows `'failed'`, and `profiles.created_at` already exists.
- **The flow:** onboarding → `/start-trial` (pick Monthly/Annual, NGN only) →
  `POST /api/trial/start-checkout` reserves a `payments` row with the
  `trial_card` sentinel and sends the user to Paystack (`channels:['card']`,
  **no `plan` param** — a plan param would charge full price immediately) →
  `charge.success` → the webhook's `handleTrialCardCharge` → `/payment/callback`
  says the trial started → dashboard.

**Six things worth knowing before editing this feature:**

1. **The webhook branch diverts BEFORE the generic status flip**, because a
   ₦100 card check is not a purchase — falling through would mark the user
   subscribed. Its order is load-bearing: idempotency check → **compare-and-set
   claim** (`status='success' WHERE status='pending'` with `.select()`) →
   validate plan + reusable authorization → create the delayed subscription →
   `subscriptions` + profile trial fields → **refund last, log-only**. The CAS
   is what makes everything downstream at-most-once: two concurrent deliveries
   would otherwise both create a delayed subscription, i.e. a **double charge on
   day 28**.
2. **Trial→paid conversion is ZERO new code.** On day 28 Paystack charges the
   saved card; that `charge.success` has a fresh reference, so it misses the
   payments lookup and lands in the existing renewal path, which matches by
   `paystack_subscription_code` and flips the row to `active`. Do not add a
   second conversion path.
3. **The signup cutoff (`TRIAL_CARD_SIGNUP_CUTOFF`) is not optional
   bookkeeping.** The paywall has been off since 2026-07-23, so plenty of
   EXISTING accounts sit at exactly `unpaid` + `trial_used: false` — the naive
   predicate. Without the cutoff, flipping this flag would wall established
   users. Unset ⇒ the login-time bounce is inert (and logs a warning).
4. **Invited teammates are exempted by an active non-owner `workspace_members`
   row**, not by role: an existing account that accepts an invite keeps its old
   role, and owner rows exist for everyone via the lazy workspace bootstrap
   (hence `role != 'owner'`). Teammates have their own `unpaid` snapshot and
   must never be asked to pay for a workspace they were invited into.
   `resolveCardTrialRequirement` fails OPEN on every unknown — the
   `isFirstReleaseRequired` doctrine.
5. **`/start-trial` deliberately does NOT gate on `cardTrialRequired`.** That
   field drives only the login-time bounce. Gating the page on it too would
   make a flag-on / cutoff-unset deploy bounce brand-new signups straight back
   to the dashboard, silently no-opping the whole feature.
6. **`POST /api/trial/start` 404s under the flag** — otherwise the card is one
   POST away from being bypassed. Onboarding's call is wrapped in the flag
   (404 is not in its tolerated {400, 409} set, so an unconditional call would
   throw) and `/locked`'s trial button routes to `/start-trial` instead.
   `/api/promo/redeem` writes the trial fields directly and stays card-free by
   design.
7. **The in-session gate (2026-08-21) is the third bounce, and it exists
   because the first two both miss how the signup funnels actually end.** The
   founder's own live test hit it: a fresh account creating its first release
   as a blank rollout reached the app with no billing surface anywhere. Two
   causes stacked — the flag was (and is) off in production, but even flag-on
   the flow leaked: the auth-store bounce fires only on FULL page loads and
   early-returns on safe paths, while `/auth/callback` runs `checkAuth` with
   the pathname still `/auth/callback` (a `/auth` safe path) and then
   `router.replace()`s to the dashboard — so a new Google signup lands in the
   app as pure SPA navigation and the bounce never fires for the whole
   session. Email login on `/auth` races the same way, and Back from
   `/start-trial` → `/onboarding` → its authenticated redirect → dashboard is
   three SPA hops with no full load. `CardTrialGate`
   (`components/providers/CardTrialGate.tsx`, mounted by `AppShell` beside the
   other bridges) closes all three: whenever `/dashboard`, `/settings` or
   `/admin` is reached in-session it consults the server's `cardTrialRequired`
   and routes to `/start-trial` when true. Fail open on every uncertainty;
   `required: false` is cached per user for the tab (the predicate is one-way
   for an account — every false state is permanent); `required: true` is
   deliberately re-asked on each gated entry so a checkout completed on
   `/start-trial` clears it without a reload; the redirect re-reads
   `window.location.pathname` at resolve time (the MobileNavBar
   click-time-fresh-read pattern) so gated→gated navigation mid-fetch still
   bounces and landing on `/start-trial` mid-fetch never double-fires. The
   decision halves are pure and unit-tested (`isCardTrialGatedPath`,
   `shouldConsultCardTrialGate` in `lib/trial-card.ts`); `/curator` and the
   public token pages are deliberately outside the gated set, so the free
   curator side stays free. **Coverage audit (2026-08-21), so nobody re-walks
   it:** every other route is a redirect stub (`/`, `/release/[id]` →
   gated paths), a public token page, or a flow page (`/auth`, `/onboarding`,
   `/start-trial`, `/locked`, `/payment`, `/redeem`, `/invite`, `/join`) with
   no product surface on it — and in production config every ASSISTANT
   surface also lives inside gated chrome: the rail and MobileNavBar mount
   only under `showWorkspaceChrome` (dashboard/settings), `/dashboard/urgans`
   is gated by prefix, and ChappiDock renders nowhere because
   `NEXT_PUBLIC_FEATURE_MOBILE_NAV=true` (its unconditional bail). One
   residual, documented rather than plumbed: with mobile-nav OFF, the
   below-lg dock renders on the three authenticated flow pages
   (`/payment/callback`, `/redeem`, `/join/[code]`), so a card-gated account
   that hand-typed one of those URLs could chat with UrgAns there — no UI
   path leads a card-gated account to any of them today, but re-check this
   before ever turning mobile-nav off. The API layer stays open either way
   (the server paywall is off — the founder-accepted known limit at the end
   of this section), so this gate is a UI wall, not an API one.
8. **Google signups go through the wizard before billing (2026-08-21), so
   every funnel has its dopamine hit first.** `/auth` is login-only — signup
   lives at `/onboarding` — so the ONE account-creating path that skipped the
   wizard was Google from the login page: the callback's profile upsert
   creates the account, and nothing routed it to onboarding. That account
   reached billing having created nothing, while an email signup got its
   release and plan first. Now `/onboarding?setup=1` runs the wizard in
   **authed-setup mode**: the account already exists, so step 5 (Create your
   account) is skipped and step 4 becomes terminal ("Create my release"),
   running the SAME `runPostSignupHandoff` both signup paths run against the
   session in hand, then landing on `/start-trial`. Order is now identical
   everywhere: questions → your release and its plan → billing → the app.
   Five things worth keeping:
   - **The param is read imperatively in the pre-paint layout effect, never
     via `useSearchParams`** — that hook in a statically prerendered client
     component serves `loading.tsx` as the page's HTML, the exact
     weak-connection dead end of 2026-08-13. `/onboarding` and `/auth` are
     both verified still `○ Static`, with the real step-1 questions in the
     server HTML.
   - **The param alone never grants the mode** (`shouldRunAuthedOnboardingSetup`,
     unit-tested): the flag must be on, auth resolved, the account genuinely
     un-onboarded (an explicit `false`, never a missing field) and not a
     curator — so a stale link cannot re-run the wizard for someone who
     finished it, and a normal `/onboarding` visit is untouched.
   - **The bounce-home effect is gated on `hasHydrated`**, because the param
     lands in state: acting before hydration would eject the one visitor this
     mode exists to serve. `accountCreated` is set before the hand-off for the
     same reason — its PATCH flips `onboarding_completed` to true, which would
     otherwise end the mode mid-run.
   - **The callback's routing is a SHORTCUT, not the gate.** CardTrialGate
     reaches the same wizard from `/dashboard` anyway; deciding at the
     callback only skips a flash of the app and its create-release modal. It
     consults the server's `cardTrialRequired` (not just
     `onboarding_completed`) because only the server can evaluate the
     server-only cutoff and workspace membership — that read is what keeps
     pre-cutoff dormant accounts, invited teammates and curators out of the
     wizard. It is skipped entirely for already-onboarded accounts, bounded by
     a 2.5s abort well inside the callback's 7s watchdog, and every failure
     falls through to the app rather than the wizard.
   - **Invited teammates were already safe**: `/api/invites/[token]` marks
     `onboarding_completed: true` on accept, for this exact reason ("the
     first-time onboarding wizard is wrong for them"). The membership
     exemption in `cardTrialRequired` is the second layer.
   The destination split lives in one tested place (`resolveCardTrialDestination`):
   never-onboarded → the wizard, onboarded or unknown → `/start-trial`. Both
   bounces (auth-store on full loads, CardTrialGate in-session) call it, and
   `/api/subscription-status` now returns `onboardingCompleted` alongside
   `cardTrialRequired` to feed it.

- **The cancel path closes the deleted flow's worst gap.** The 2026-06-05
  card-on-file flow (never live) had no refund and **no way to stop the
  scheduled charge** — the card was billed at `start_date` even if the user
  quit. `POST /api/billing/cancel-trial` disables the Paystack subscription
  using the `email_token` stashed on the payments row, sets `cancelled` and
  **keeps `expires_at`**, so access runs to trial end and then lapses.
  Deliberately NOT flag-gated and deliberately open-route: an in-flight trial
  must stay cancellable after a rollback, and a just-lapsed user must still be
  able to stop an imminent charge.
- **The `trial_card` sentinel survives account deletion**, joining
  `trial_claim` in the `delete-now` carve-out — that is what stops
  delete-and-resignup from reclaiming a free trial.
- **Verified:** `vitest run` (741 passing, 24 env-gated skips; ~54 new across
  `lib/trial-card.test.ts` and the billing-summary additions), `eslint .`
  (3 errors / 63 warnings vs a measured 3/61 baseline — the 3 errors are the
  pre-existing `WorkspaceView.tsx` ones, and the 2 new warnings are the
  documented React-19 `set-state-in-effect` downgrade on the iOS-detect and
  fetch-on-mount effects, the same pair `LockedPageClient` already carries),
  and `next build` green in **both** flag states with `/auth`, `/settings` and
  `/start-trial` all still `○ Static`. Runtime probes proved the gate rather
  than assuming it: flag OFF → `/api/trial/start-checkout` **404** while
  `/api/trial/start` **401**; flag ON → **inverted**; the ungated
  `/api/billing/start-checkout` 401s either way.
- **Not verified:** nothing has run against a real Supabase or Paystack — no
  real card, no webhook delivery, no refund, no delayed subscription, no
  cancel, and none of the redirects against a real session. The owner UI needs
  an authenticated session this environment cannot mint.
- **Activation checklist:** (1) **THE blocker — mint NGN Paystack Plans at the
  CURRENT prices (₦3,500 / ₦35,000) and repoint `PAYSTACK_PLAN_MONTHLY_NGN` /
  `PAYSTACK_PLAN_ANNUAL_NGN`.** The plans those vars point at still bill
  ₦150,000 / ₦1,500,000 (the documented 2026-08-16 reprice gap), and that is
  exactly what a converting trial would charge on day 28. (2) Set
  `NEXT_PUBLIC_FEATURE_CARD_TRIAL=true` **and** `TRIAL_CARD_SIGNUP_CUTOFF` to
  the flip moment in Vercel `Web`, and make sure the deploy actually rebuilds
  `apps/web`. (3) Changelog entry + minor version bump across all 10
  `package.json` files (the EPK precedent: the ledger entry lands at
  flag-flip, not at merge). (4) Probe production: unauthenticated
  `/api/trial/start` → 404 and `/api/trial/start-checkout` → 401 proves the
  flag is live in the deployed bundle. (5) End-to-end with a real card and a
  throwaway email; in Paystack confirm the subscription exists with
  `start_date` ≈ +28 days **at the new amount** and that the ₦100 was
  refunded; then cancel from Settings → Billing and confirm Paystack shows it
  disabled while access continues. (6) Sign in as a pre-existing account and
  as a teammate — neither should be redirected anywhere.
- **Known limit (founder-accepted):** with the server paywall off, this is
  client-side product friction on the signup path, not an API gate — the same
  posture every free-era account already has. Restoring the real paywall later
  additionally requires solving teammate subscription inheritance, which is a
  documented landmine and out of scope here.

## Cover art (2026-08-17)

Founder request: a way to update a release's cover art, reachable "on the
side menu on desktop... [and] the 3 lines still highlights menu on mobile or
whatever way is better intuitively."

**Not a scope expansion.** v1 scope item 4 names *artwork* outright ("artwork,
masters, contracts, split sheets"), so this is the same v1 line Song upload
closed the year before — completing it, not extending it. It also closes a
gap this file's own code already flagged: the general Files route's POST
handler carried a comment since Phase 3 saying "that decision belongs to the
user via a future 'set as cover' action" — this is that action, finally built.
**No migration**: cover art is an `assets` row with `category: 'cover_art'`
(already in the enum) and `releases.artwork_asset_id` (already a column,
already resolved by the release cards via `lib/cover-art.ts`'s bulk resolver)
— the bucket, RLS, size/MIME rules, and the FK's `ON DELETE SET NULL` all
already existed before this feature touched anything.

**A dedicated scene, not a side menu.** The founder's own wording named "the
side menu" as one option among several ("whatever way is better intuitively"),
but a PER-RELEASE side menu is a pattern this codebase already tried and
killed: `ReleaseSideNav.tsx`, "removed entirely in URG-200 — the founder found
it added a click for no real benefit over a plain back link" (see the EPK
section). Reintroducing it for one more feature would be re-litigating that
call. Instead this follows the established release-scene pattern exactly —
same shape as Song, Metadata, Files, Press kit: a pill that opens an inline
scene in the activity slot, reachable via `?scene=coverart`.

- **Flag:** `NEXT_PUBLIC_FEATURE_COVER_ART`, default `false`. Registered in
  `turbo.json` + `.env.example`. Its own flag, deliberately separate from
  `NEXT_PUBLIC_FEATURE_FILES` — the same reasoning Song upload's flag got:
  "update this release's cover image" is a different, more central ask than
  "bring the file manager back," even though both share the same storage.
  Gates the pill, the `?scene=coverart` URL param, the scene prefetch list,
  and all three `/cover-art` API routes.

**Four things worth knowing before editing this feature:**

1. **Uploading REPLACES the cover art — the opposite of Song's behavior, and
   deliberately so.** A release has exactly one current cover; Song's
   "newest upload wins but nothing gets deleted" model is right for a
   catalog of audio versions and wrong for a release's single identity
   image. `POST /cover-art` deletes whatever `artwork_asset_id` previously
   pointed at (storage object first, then the row — the single-asset DELETE
   route's own order: an orphan storage object is recoverable, an orphan DB
   row pointing at nothing is harder to detect) before pointing the release
   at the new upload. The general Files route's conservative "don't
   auto-promote past the first upload" behavior is UNCHANGED and untouched —
   the two routes have opposite replace semantics on purpose, because one is
   a multi-category file manager (surprise swaps would be alarming there)
   and the other's entire job is "the image I just chose is now the cover."
2. **`releases.artwork_asset_id` already had `ON DELETE SET NULL`** (the
   2026-05-10 schema migration), so removing a cover art's `assets` row
   auto-clears the release's pointer at the DB level — no separate UPDATE
   needed on delete, only on the replace path (where the NEW asset's id has
   to be written in).
3. **The scene reads `releases.artwork_asset_id` directly — never the legacy
   `release_metadata.artwork_url` or the workspace-logo fallback** those
   other display paths (the release cards, the EPK) fall back through. A
   release with only the legacy text URL (or nothing at all) shows "No cover
   art yet" here, which is honest: there is no asset row for this scene to
   let the user replace or remove. `lib/cover-art.ts` (the pre-existing bulk
   resolver those OTHER surfaces use) is untouched and is a genuinely
   separate module from `lib/cover-art-upload.ts` (this feature's upload
   flow) — don't conflate the two when editing either.
4. **A successful upload or removal force-refreshes the workspace command
   center** (`useReleaseStore.loadCommandCenter({ force: true })`), unlike
   the general Files scene's cover_art uploads, which never did this. Without
   it the catalog grid would keep showing the old artwork (or the
   workspace-logo fallback) until a full page reload — a bad look for a
   feature whose whole point is "see your new cover everywhere."

- **One implementation, following the Song precedent exactly rather than
  sharing code with it.** `lib/cover-art-upload.ts` (validation + the
  three-step signed-URL flow) and `useCoverArtUpload` (picker/uploading/retry
  state) are fresh, independent implementations mirroring `lib/song.ts` /
  `useSongUpload` in shape — not a shared generic uploader. Matches this
  codebase's own established precedent (`AssetUploadControl` and
  `lib/song.ts` are two independent copies of the same flow, not one
  abstraction) rather than risking a refactor of Song's already-shipped,
  tested upload path for the sake of DRY-ness on a new feature.
- **A small pre-existing gap fixed in passing:** `TasksPanel.tsx`'s own local
  mirror of the scene-URL flag gate (the one that nulls `activeScene` for a
  stale bookmark whose feature is off) had never had `'song'` added to it
  either, alongside the four scenes it did cover — WorkspaceView's copy of
  this same gate was already complete. Both `'song'` and `'coverart'` are in
  it now.
- **Verified:** the full vitest suite (687 passing, 24 env-gated skips, of
  which 14 are new cover-art cases), `eslint .` (0 errors on every touched
  file except the 3 pre-existing, unrelated `WorkspaceView.tsx` errors from
  PR #319 — confirmed present with none of this feature's changes applied),
  and `next build` green in both flag states, confirmed at runtime: flag on,
  all three `/cover-art` routes 401 unauthenticated (never 404); flag off,
  the same three 404 while an ungated control route (`/api/releases`) still
  401s — the 404-vs-401 discrimination is what proves the gate is real
  rather than a routing accident (the EPK precedent).
- **Not verified:** nothing has run against a real database or Storage
  bucket, and the owner UI needs an authenticated session this environment
  cannot mint — so a real upload, replace, removal, and the catalog-refresh
  behavior have never executed end to end.
- **Activation checklist:** (1) nothing to migrate — set
  `NEXT_PUBLIC_FEATURE_COVER_ART=true` in Vercel `Web` → Production **and
  make sure the deploy actually rebuilds `apps/web`** (the EP/album flip
  records `turbo-ignore` skipping a web build whose commit touched only
  `package.json` files); (2) changelog entry + minor version bump across all
  10 `package.json` files (the EPK precedent: the ledger entry lands at
  flag-flip, not at merge); (3) verify end to end with a real release —
  upload a cover image, confirm the catalog card updates without a reload,
  replace it with a second image and confirm the first is gone from
  `assets`/storage, then remove it and confirm the card falls back to the
  workspace logo.

---

## Cover art meets DSP requirements, and the task asks for it (2026-08-22)

Founder request: cover art must meet DSP requirements, and ticking off a cover
art activity should prompt for the upload (with somewhere to do it later if
they skip). Both halves extend the flag-off Cover art feature above; **still
flag-off**, same `NEXT_PUBLIC_FEATURE_COVER_ART`, no new flag, no migration,
no changelog entry (the ledger entry still lands at flag-flip).

**Not a scope expansion**, for the same reason the section above is not: this is
v1 scope item 4's *artwork*, finished rather than widened.

**What the old rules got backwards, and is the reason this was worth doing.**
Validation was size plus MIME only, and both settings were wrong in the same
direction: `ASSET_SIZE_LIMITS.cover_art` was **5 MiB** while a square
3000x3000 PNG (the Apple Music minimum, and what the playbooks tell managers to
commission) routinely runs past 10 MiB, and the MIME allowlist advertised
**WebP**, which no DSP ingests. So the product rejected exactly the files it
asks for and accepted files that cannot ship. The limit is now **25 MiB** for
`cover_art` only (`promo_image` stays at 5): safe because uploads go from the
browser straight to Storage through a signed URL, so neither Vercel's ~4.5 MB
body limit nor its timeout applies, and 25 MiB is inside Supabase's 50 MiB
per-upload cap. WebP is still *accepted* (it displays fine in-product) but is
graded down to a warning and no longer advertised.

**Five things worth knowing before editing this:**

1. **Warn, do not block, below spec — a founder call, not an oversight.**
   `lib/cover-art-dsp.ts` grades three ways: `blocked` (undecodable, not
   square, or under 640px), `warning` (square but under 3000x3000, or the wrong
   format), `ready`. A manager frequently has only the designer's draft and
   still needs it on the release card today, so blocking that would make the
   product worse than the group chat it replaces. Tightening `warning` into
   `blocked` is a product decision, not a correctness fix.
2. **Non-square blocks rather than warns**, because every DSP rejects it
   outright — there is no "use it for now" story for a 16:9 cover.
3. **The hard block is client-side only, and that is deliberate.** The picker
   measures the image (`lib/cover-art-image.ts`, the repo's FIRST image
   decoding anywhere) and refuses a blocked file; the POST handler stores the
   reported width/height as an untrusted **hint** rather than validating them,
   because validating server-side means decoding the image, which needs a
   native dependency this repo does not carry. Someone who bypasses the block
   by calling the route directly only mis-labels their own release. This is
   product guidance, not a security boundary — the `lib/chappi/tools.ts`
   posture about the model's workspace snapshot, applied here.
4. **Dimensions land in `assets.metadata.image` with NO migration** — that
   jsonb column has always existed and the cover-art POST was writing `{}` into
   it. Unrecorded stays distinct from zero: an image uploaded before this (or
   through the general Files scene) reads back as "we do not know" and shows no
   verdict, where a zero would grade as unreadable. Incidentally unblocks the
   `lib/capture-playbook/index.ts` comments that say it cannot grade artwork
   *because* `assets` stores no dimensions.
5. **`templateTaskId` is now the third piece of `metadata.template` surfaced to
   the client**, beside `taskType` and `compressedRunway`
   (`readTemplateTaskId` in `lib/tasks-server.ts`, mirroring `readTaskType`
   exactly). A completion has to know WHICH playbook step it was to offer the
   right follow-up, and nothing else carried that.

**The prompt.** `lib/cover-art-tasks.ts` holds an explicit allowlist of **nine**
playbook ids (the *draft delivered*, *final approved* and *upload to
distributor* steps of all three playbooks). The four *brief the designer* tasks
are excluded on purpose: that is when the work is COMMISSIONED, no file exists
yet, and prompting there trains the manager to dismiss the sheet. An allowlist
rather than a pattern because the three playbooks name these steps
inconsistently (`w6_cover_art_first_draft`, `w10_ep_art_draft`,
`w14_album_art_draft`) and because `templates.test.ts`'s precedent turns a
renamed template task into a failing test rather than a feature that quietly
stops firing. A task with **no** template id (manager-added) falls back to a
title match; a task WITH one never does, so an exclusion cannot be undone by
its title.

**Three bottom surfaces, still exactly one per completion.**
`useTaskStore.completeTask`'s either/or became a three-way, in priority order:
**cover art ask, then the check-in, then the undo toast**. Cover art wins
because it is the actionable one at the only moment the manager is certain to
have the file open. `coverArtPrompt` mirrors `outcomePrompt` slot for slot,
including being cleared in **both** places that one is cleared — the reopen
branch and `rollbackCompletion`. Missing either leaves a sheet asking about a
completion that no longer stands.

`components/tasks/CoverArtPromptSheet.tsx` is modelled on `TaskOutcomeSheet`
(same `z-[170]` tier, same `lockBodyScroll`, same `taskId:tick` remount, same
swipe-to-dismiss, reusing its `.task-outcome-sheet` keyframe rather than adding
a second, and **no Escape handler** — the detail pop-up owns Escape). It reuses
`useCoverArtUpload` verbatim, so the picker and the grading behave identically
to the scene. **Whether the release already has artwork is resolved in the
SHEET, not guessed in the store:** `Release.coverArtUrl` falls back to the
workspace logo, so it cannot answer "does this release have real cover art".
Skipping is a first-class answer and the copy names where the file lives
afterwards, which is the "somewhere to do it later" half of the request (the
Cover art scene, unchanged).

- **Verified:** the full vitest suite (956 passing, 24 env-gated skips, of
  which 41 are new across `cover-art-dsp.test.ts`, `cover-art-tasks.test.ts`
  and the upload suite), `eslint .` (3 errors / 65 warnings = the unchanged
  pre-existing `WorkspaceView.tsx` baseline, with **zero** findings on any file
  this touched), and `next build` green **by exit code** in both flag states
  with `/auth`, `/onboarding` and `/settings` still `○ Static`. Runtime probe
  of all four handlers: flag on they 401 unauthenticated, flag off they 404
  while `/api/releases` still 401s.
- **Not verified:** nothing has run against a real database or Storage bucket,
  and neither the sheet nor the grading has been exercised in a browser — the
  owner UI needs an authenticated session this environment cannot mint, and
  `readImageDimensions` touches `createImageBitmap`, which no test covers by
  design (its pure half is what the tests hold). Worth one manual pass at
  flag-flip: tick "Cover art final approved" on a real release and confirm the
  sheet appears in place of the check-in, upload a 3000x3000 JPEG (expect
  "Ready for the distributor"), a 1400x1400 (expect the warning AND a
  successful upload), and a 1920x1080 (expect the refusal).

---

## The UrgAns composer drifted for eight PRs: two `100vh` document floors (2026-08-17)

Founder, on a phone: *"the app is still allowing me scroll with the chat bar
scroll with the page it should be stationary and sticky."* Eight PRs had
already touched this surface (#305, #309, #312, #324, #326, #327, #328, and
this one). **Every one before this adjusted vertical distribution INSIDE an
already-scrollable document; none removed the scroll.** That is the whole
lesson, and it is why the fix turned out to be nowhere near the component
anyone kept editing.

- **The composer is not `sticky` and never was.** There is no `sticky`, `fixed`,
  `bottom-*`, `vh` or `dvh` class anywhere in `ChappiConversation.tsx`. The
  composer is a plain `<div className="mt-3 shrink-0">`, the last flex child of
  a column sized by `.chappi-shell-height-nav`
  (`height: calc(100dvh - 10.25rem - safe - 1px)`). Its entire claim to the
  bottom edge is *"the document cannot scroll."* And that arithmetic is
  correct — it sums to exactly `100dvh`.
- **The slack came from two ancestors.** `.app-body` and `.app-layout` still
  carried `min-height: 100vh` while everything inside was sized in `dvh`. On
  mobile `100vh` is the LARGE viewport (browser chrome collapsed), so with
  chrome showing the document was taller than the screen by the chrome's
  height, the page scrolled by exactly that, and the in-flow composer rode up.
  Both are now `100dvh`.
- **BOTH floors or the change does nothing — this is the trap that ate PR #325.**
  They are independent and each alone reproduces 100% of the symptom:
  `.app-layout`'s own floor makes it a full `100vh` tall regardless of body's,
  and body's own floor holds the document `100vh` tall regardless of
  `.app-layout`'s (`html` height is `auto`). #325 correctly diagnosed this exact
  mechanism and converted `.app-shell-frame` to `min-h-dvh` — but the frame's
  height is content-driven, so its two ancestors kept setting the document
  height over its head. **A partial conversion here is indistinguishable from
  doing nothing.** Never split this pair.
- **The codebase had already confessed.** The keyboard-open override's comment
  said `min-height: 100vh` *"would still hold the document a full LARGE viewport
  tall … **which is why there is always a little scroll to give away**"* — and
  only compensated while the keyboard was OPEN. That comment is now rewritten;
  the confession was sitting there through five failed attempts.
- **No `100vh` fallback line, and don't add one back.** The production minifier
  collapses two declarations of the same property on one rule to the last, so
  `min-height: 100vh; min-height: 100dvh;` compiles to just the dvh line
  (verified in `.next`'s compiled CSS — it *reads* like progressive enhancement
  in source and is not one; a real one needs `@supports`). It also isn't worth
  having: pre-dvh Safari is < 15.4 and this app already hard-fails below iOS
  15.4 anyway (Next 16's framework chunk uses `Object.hasOwn`), so that branch
  is unreachable, and Chrome 93–107 losing the floor is invisible because body's
  background propagates to the canvas.
- **The `min-height: 24rem` column floors are now DESKTOP-ONLY.** Below their
  breakpoints they were actively harmful: the floor binds when the calc drops
  under 384px (a viewport under ~549px for the `-nav` variant, ~485px otherwise
  — reachable on small phones in portrait and widely in landscape), and when it
  binds the column is TALLER than the space `<main>` allots, so the document
  grows and the composer drifts *by the same mechanism the dvh fix just killed*.
  Trade-off below the breakpoint: a very short viewport squeezes the transcript
  instead of overflowing the column. Right way round — the composer staying put
  is the point.
- **What was NOT done, and is the real end state:** the column still derives its
  height from hand-summed magic numbers, including a hard-coded `4rem` for a
  topbar that is actually `min-h-16` and grows if its content wraps. The
  structural fix is to route-scope the frame to a definite `height: 100dvh`,
  give `<main>` `overflow: hidden`, and make the column plain `height: 100%` so
  it derives from the flex chain and no number is assumed. Deliberately not
  bundled here: it is untestable from a sandbox, and mixing it in would have
  destroyed attribution if the symptom survived. **It remains the fix that ends
  this bug class rather than this instance.**
- **Do NOT reach for the two obvious-looking fixes.** (1) `sticky bottom-0` on
  the composer is a guaranteed no-op — the column is exactly viewport-height, so
  a sticky child has ~0px of travel inside its containing block. (2) Adding any
  `overflow` to `html` re-arms the #318/#321 landmine that broke `position:
  sticky` app-wide. `html` still carries no `overflow`, confirmed in compiled
  output, and must keep none.
- **Magnitude was cross-checked rather than assumed**, which is what raised this
  from a plausible theory to the diagnosis: measured off the founder's
  screenshot, the web viewport was ≈580 CSS px, the column should have ended at
  500px (86% down), and the composer sat at ≈379px (65%) — a ≈120px drift
  against ≈100px of predicted chrome slack (that in-app browser has both a top
  bar and a bottom toolbar, far more chrome than iOS Safari's URL bar alone).
  Also checked and NOT active on that device: the `24rem` floor needs a <549px
  viewport and this was 580px, and the topbar was a single unwrapped row.
- **Verified:** `vitest run` (705, unchanged — CSS-only, and JSDOM cannot resolve
  viewport units so a unit test here would be theater), `eslint .` (0 new
  against the 3-error/59-warning baseline), `next build` green with `/auth` and
  `/settings` still `○ Static`, plus the **compiled** CSS checked directly for
  all four facts: `.app-body` and `.app-layout` each emit `min-height:100dvh`,
  the `24rem` floors appear only inside the desktop media queries, and `html`
  has no `overflow-x`. Checking compiled output rather than source is the
  technique this repo already relies on for CSS fixes — it is how both the
  `text-lg`-vs-`text-base` zoom bug and the sticky regression were settled, and
  here it caught the minifier collapsing the fallback line mid-implementation.
- **Not verified:** no real device and no live backend from this sandbox. If it
  still drifts, one on-device read settles it at `/dashboard/urgans`: compare
  `document.documentElement.scrollHeight`, `window.innerHeight`,
  `visualViewport.height`, and the computed heights of the
  `.chappi-shell-height-nav` element and `header.sticky`. Equal heights but
  still drifting means the theory was wrong and it is iOS's visual-viewport pan
  (documented at the `.chappi-*` keyboard block), which no length unit can
  defeat — only extending the existing `fixed` pinning to keyboard-closed.
  `scrollHeight` greater than the visual viewport means something still
  overflows, and the two computed heights say which.

---

## Tier checkout and renewal (2026-08-24)

The follow-up the enforcement PR flagged as blocking the pricing-v2 flag. Two
pre-existing bugs, one root cause: **under the tier model `subscriptions.plan`
holds a TIER and no longer encodes the billing interval, and nothing stored the
interval.** Every function that switched on the plan *name* predated tiers.

What that actually cost, had the flag been flipped: `getPlanExpiry` gave a
**Label-monthly buyer a full year** (the legacy `label` plan billed annually, so
the name matched) and a **Manager-annual buyer one month** (no match, so the
monthly default). And `isRecurringPlan` rejected `manager`, so the webhook's
renewal branch bailed at `non_recurring_subscription` and **renewals silently
stopped extending**. Both invisible only because no code path could write a tier
id.

Founder calls: **API only** — `/locked` keeps its legacy picker, so this makes
tier checkout *correct*, not *reachable*; and **fix the plan-naming copy here**.

### Where the interval lives, and why it is two places

- **Checkout → webhook** rides `payments.paystack_response.selected_interval`,
  beside the `plan` column the webhook already treats as the trusted source
  (both written server-side by us, not echoed back from Paystack). No migration.
- **Webhook → renewal** needs `subscriptions.billing_interval`
  (`20260824100000_subscriptions_billing_interval.sql`). A renewal has **no
  payments row** — Paystack mints a fresh reference per invoice, so the webhook
  matches on `paystack_subscription_code` and reads only the subscription row.
  There is no jsonb column there, so this had to be real. Nullable, and null is
  meaningful: "infer from the plan name", which is exactly right for every
  pre-existing row.

**`resolveBillingInterval` is the single place the ambiguity is settled**: a
stored interval wins, else legacy plan-name inference, else **monthly**. That
default direction is deliberate — under-granting a month is recoverable at the
next renewal, over-granting a year gives away eleven months with no way to claw
it back.

### Five things a later change will be tempted to get wrong

1. **`advancePeriodEnd`'s extend-from-previous-end semantics are NOT a bug.**
   The `setMonth` clamp drift recorded under "The other two caps" is why a period
   START cannot be derived backwards; storing the interval is the fix for that.
   Advancing forward from the prior end is correct as written (a late renewal
   must not shorten a paid window), and "fixing" the clamp would move real
   billing dates.
2. **The `label` id exists in both generations and needs no feature flag to
   disambiguate — for a stored value.** Legacy Label was the sales-led
   ₦800,000/yr roster plan; tier Label is the self-serve flagship. A stored
   `label` can only be the tier, because the id was never in
   `subscriptions_plan_check` until the tier migration added it and
   `PAYSTACK_PLAN_LABEL_*` has never been set, so checkout 500s before the
   constraint could be reached. `20260823100000_pricing_tiers.sql` already
   relies on that same fact. This is why `billing-summary.ts` resolves
   tier-first with no env read — it is documented as client-safe and reads no
   flags, and it does not need one.
3. **⚠️ Label's Paystack plan codes point at `PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN`,
   NOT `PAYSTACK_PLAN_LABEL_*`.** The tier's prices are byte-identical to the
   legacy monthly/annual amounts by design, which is the entire reason the tier
   rollout mints no new Plans for it and no subscriber changes price.
   `PAYSTACK_PLAN_LABEL_NGN` holds a mislabeled ₦750,000 Plan from an earlier
   attempt. There is a test for this, because it is a trap.
4. **`planCodeMatchesSubscription` resolves FORWARD (stored plan → expected
   code), and must keep doing so.** The obvious version reverse-maps the
   incoming code — but because Label reuses the legacy Plans, one code
   reverse-maps to both legacy `monthly` and `label` at monthly, so a reverse
   lookup would warn on **every Label renewal**. `identifyPlanByCode` is
   deliberately left legacy-only and is no longer the comparison.
5. **`enterprise` is excluded from `isRecurringPlan` and has no plan code.** It
   is quoted per contract and invoiced by hand, so a charge event must never
   reach the renewal math with it; `getPlanExpiry` pegs it far-future like
   `custom` as a belt-and-braces measure if one ever does.

### Two smaller decisions

- **Tier checkout is NGN-only and refuses USD plainly.** `PRICING_TIERS` carries
  NGN prices alone, the Paystack account offers NGN only in plan creation, and no
  `PAYSTACK_PLAN_*_USD` var has ever been set. Getting one step further before
  failing would be worse than a clear 400.
- **`resolveCheckoutPurchase` was extracted into `lib/billing-plans.ts`** rather
  than left inline in the route. It decides which Paystack Plan a card is charged
  against and for how long, and the route is unreachable from a test without
  mocking Supabase and fetch — so the decision lives where vitest can see it and
  the route is a thin caller. Its error precedence is tested: a malformed request
  is answered before an unconfigured Plan, so nobody is ever told "plan not
  configured" for a request that was invalid to begin with.

### Copy layer

`describePlanName` and `isContactSalesPlan` are tier-first now, and
`payment/callback` calls the shared helper instead of repeating a legacy-only
line. Before this, a paying Manager customer's Settings read "Active plan" with
no name, and a lapsed Label subscriber was pointed at a mailto instead of the
checkout they were trying to reach. **Two existing tests were inverted on
purpose** (`isContactSalesPlan('label')` was asserted true) — the assertion
encoded the legacy meaning, and the comment beside it records why it flipped.

### Verified

**1110 tests** (34 new), `eslint .` at the exact **3-error / 66-warning**
baseline (all three errors pre-existing in `WorkspaceView.tsx`), `next build`
green **by exit code** with pricing v2 off and on under production config
(`NEXT_PUBLIC_FEATURE_HARD_PAYWALL=true`), and `/auth`, `/onboarding`,
`/settings` still `○ Static` in each. **Mutation-tested rather than merely
asserted:** making `resolveBillingInterval` ignore the stored interval, and
dropping `manager` from `isRecurringPlan`, each fail exactly the tests written
to catch them (six failures across the two, green again on revert).

**Not verified, and this is the significant gap:** nothing has run against real
Paystack or a real database. No charge, no webhook delivery, no renewal, no
`billing_interval` row. The route's own validation cannot even be probed from
outside — auth correctly runs first, so an unauthenticated request 401s before
reaching the plan branch — which is precisely why the decision was extracted
into a unit-tested function. Worth one real end-to-end pass once Manager's
Paystack Plans exist: buy Manager monthly, confirm `expires_at` lands one month
out and `billing_interval` reads `monthly`, then buy Label annual and confirm a
year.

---

## The pricing page, and one number for a limit (2026-08-24)

The surface that makes a tier buyable, and the last piece before
`NEXT_PUBLIC_FEATURE_PRICING_V2` is worth flipping. Two surfaces changed: the
public `/pricing` page and the in-app wall.

### It reverses a founder decision — gated at first, then unconditional

`/pricing` had been in **BOOK-A-DEMO MODE since 2026-07-23** — the price table
was deliberately removed because the founders want to talk to every team before
money changes hands. The pricing spec (2026-08-23) asks for a public
three-column page, which is the opposite call, newer.

So the table shipped **flag-gated rather than swapped in**, on the reasoning that
a reversal of a founder decision should be revertible from a dashboard. **That
gate was removed the next day (2026-08-24, founder call), and the page now
renders the table unconditionally.** Read the header of
`apps/homepage/app/pricing/PricingPageClient.tsx` before reinstating it.

**Why it came out, because the failure is the reusable part:** the flag is read
at module scope, so Next inlines it at BUILD time. Flipping it therefore needed
three things to line up at once — the var set on the right one of TWO Vercel
projects, a commit touching `apps/homepage`, and a deploy `turbo-ignore` did not
skip. Twice it did not, and the live page kept serving a bundle with `false`
compiled in while the env var said otherwise. The second attempt was a version
bump specifically chosen to force the rebuild (turbo-ignore was verified to
answer "This commit affects @urganize/homepage"), and the page still did not
change — which is what exhausted the code-side explanations and left only
config we cannot see from the repo.

What made removing the gate the right trade rather than a shortcut: **this page
has no risk surface.** Every CTA is a mailto and nothing on it links to
`app.urganize.app`, so the lever was never protecting money — it was protecting
a headline, and editing one file reverts it either way.

**The flag is still live in `apps/web`**, gating tier checkout, the picker on
`/locked`, plan changes and the entitlement resolver. So the two surfaces CAN now
legitimately disagree, and the safe direction is the one they disagree in: the
public page may advertise a tier the app cannot yet sell (the visitor books a
demo and reaches a human), where the reverse — an app selling what the site never
mentioned — would be the surprise.

**Three CLAUDE.md claims about this page were stale** when the table shipped and
were corrected then: it had no tier cards, no FAQ, and nothing anchored to its own
`#waitlist` — its primary CTA was a `mailto:` book-a-demo, with the waitlist as a
secondary section.

**Every CTA is still a capture** (founder call), and that was true in both modes
while there were two. The cards book a demo and the sales-led card emails us. Nothing on the page links to
`app.urganize.app`, because that would reopen the self-serve funnel closed in
URG-125/URG-136. What price-table mode restores is **not** the pre-July layout in
git history: that one sold legacy plans in two currencies, and the tier model is
NGN-only.

### The structural change: one number for a limit

`apps/homepage` depends on `@urganize/pricing` and **cannot import from
`apps/web`**. So a marketing page quoting "4 people" would have had to carry its
own copy of a figure the enforcement layer also holds — the display-vs-reality
gap this repo has shipped four times with prices, waiting to happen with limits.

The countable ceilings therefore moved into the package as
`PricingTierDefinition.limits`, and `ENTITLEMENTS` in `apps/web` now **reads
them** instead of declaring them. `tierHighlights()` builds each ceiling line
from that same field, so the page renders the number the route enforces, by
construction. Three tests pin it, and the derivation was **mutation-tested**:
re-literalising one ceiling fails them.

Two things deliberately did NOT move:
- **The boolean entitlements** (`data_export`, `concierge_onboarding`,
  `support_channel`, `sso`, `sub_teams`) stay in `apps/web`. They gate behaviour
  rather than being numbers a page quotes.
- **The resolution logic** (`resolveTeamTier`, `checkLimit`, `getEntitlement`)
  stays in `apps/web` for the reason its own header gives: `vitest.config.ts`
  collects `lib/**/*.test.ts`, and that is decision logic which has to be tested.
  The data moved; the decisions did not.

`TIER_LABEL` in `entitlements.ts` was a third hand-written copy of the tier names
and now reads `PRICING_TIERS[tier].label`.

### Enterprise advertises only what is built

`sso` and `sub_teams` are declared in the entitlement map and **read by
nothing**. A contract can promise them; a public page cannot. Enterprise's
`perks` therefore name neither (founder call), and a test asserts the rendered
copy contains no such claim — the `data_export` discipline applied to a
marketing claim, because "a reviewer will notice" is not a mechanism. Verified
against the built HTML too: zero occurrences in visible text.

### Four things worth knowing before editing either surface

1. **The wall offers two tiers, not three.** Enterprise is absent from
   `WALL_TIERS` because `TeamWall` already carries a full-weight "Talk to us"
   card beside the picker, and a third radio that cannot check out would be a
   dead end next to the real path. Exactly the reasoning that kept the legacy
   `contactSales` plan out of `PLAN_ORDER`.
2. **`intent=upgrade` was worse than a dead param, and now works.**
   `UrgansUsageStrip` has linked to `/locked?intent=upgrade` since the caps
   shipped and nothing read it — so a team that hit a ceiling still had access,
   and the wall's has-access effect bounced them straight back to the app. A
   no-op round trip. The wall now treats it as a deliberate arrival, with its own
   headline and a "Change your plan" CTA.
3. **The interval control comes before the tier cards, on both surfaces.** It
   reprices every card below it, so asking for it afterwards would move the
   numbers under the user's cursor.
4. **The legacy `/locked` picker (`LegacyLockedPage`) was deliberately left
   alone.** `NEXT_PUBLIC_FEATURE_HARD_PAYWALL` is on in production, so `TeamWall`
   is what every real user sees; the legacy page is the documented flag-off
   revert path, and the legacy plan ids it posts are still accepted by checkout.
   Updating it would have doubled the picker work to change a page nobody
   reaches. Same for `/start-trial`, whose funnel is superseded and flag-off.

`TierPlanPicker` uses a real `<input type="radio">` inside a `<label>` (the
`PlannerRadioGroup` approach) rather than the `<button role="radio">` the billing
pickers have used until now — arrow-key groups, screen readers and the 44px hit
target come free, along with the focus ring the hand-rolled version was missing.

### Also fixed in passing

`layout.tsx`'s `softwareApplicationSchema` declared `"priceCurrency": "USD"`.
Every price Urganize charges is in Naira, and USD checkout has never worked. It
said USD from the day it was written.

### Verified

**1118 tests** (8 new), `eslint .` at the exact **3-error / 66-warning** baseline
in `apps/web` and **0 errors / 2 warnings** in `apps/homepage` — both unchanged.
`next build` green **by exit code** for BOTH apps in BOTH flag states, with
`/auth`, `/onboarding`, `/settings` still `○ Static` and `/pricing` still
`○ Static` in each. The flag-on `/pricing` HTML was read directly rather than
assumed: the new headline present and the old one gone, ₦350,000 and ₦800,000
rendering, "2 months free", "Most teams", and the derived ceiling lines ("4
people on your team", "3 releases at a time", "150 UrgAns actions a month")
alongside "Unlimited" on the two uncapped tiers.

**Not verified:** the in-app picker has never rendered in a browser — the wall
needs an authenticated, walled session this environment cannot mint — so the
interval toggle, the tier radios and a real tier checkout are reasoned from code
plus unit tests. Nothing has run against real Paystack. Worth one pass once
Manager's Plans exist: open the wall, switch to Monthly, pick Manager, and
confirm Paystack quotes ₦35,000.

### Activated 2026-08-24 (founder) — what this checklist required

**`NEXT_PUBLIC_FEATURE_PRICING_V2=true` is live on the `Web` project.** The
founder confirmed both migrations applied, Manager's two Paystack Plans minted
and `PAYSTACK_PLAN_MANAGER_{MONTHLY,ANNUAL}_NGN` set, with
`PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN` left pointing at the Plans Label reuses.
The ledger entry landed as **v1.1.0** — announcing the in-app plan picker,
which is the half a user actually notices (the public table has been live and
unconditional since 2026-08-24 and, being `apps/homepage`, never earns an
entry).

**One deploy-order detail worth keeping.** `NEXT_PUBLIC_*` is inlined at build
time, so setting the variable does nothing until a deploy rebuilds `apps/web`.
The commit that did that here was the unrelated Enterprise→Group rename, not a
deliberate flip — so the flag may have sat set-but-inert for a stretch. On any
future flag flip, run `npx turbo-ignore @urganize/web --fallback=<the commit
Vercel last deployed for that project>` and confirm it answers "This commit
affects @urganize/web" before believing the flip took.

**NOT verified, and it is the whole risk surface:** nothing here has been
exercised against live traffic or real Paystack. No tier checkout has been
charged, no proration taken, no cap has refused anyone, and no team has gone
read-only. This sandbox cannot reach `app.urganize.app` — the agent proxy
answers 403 to CONNECT for both urganize domains — so every claim rests on unit
tests and both-flag-state builds. Worth one real pass: buy Manager monthly and
confirm Paystack quotes ₦35,000, then check the seat cap refuses a fifth invite.

### The original checklist (kept for the record)

1. Apply `20260823100000_pricing_tiers.sql` and
   `20260824100000_subscriptions_billing_interval.sql`.
2. Mint Manager's two Paystack Plans (₦35,000 / ₦350,000) and set
   `PAYSTACK_PLAN_MANAGER_{MONTHLY,ANNUAL}_NGN`. **Do not repoint**
   `PAYSTACK_PLAN_{MONTHLY,ANNUAL}_NGN` — Label reuses them.
3. Set `NEXT_PUBLIC_FEATURE_PRICING_V2=true` on the **`Web`** project only. This
   said "both projects" until 2026-08-24, when the marketing site stopped reading
   the flag entirely (see the section heading above) — the public table is
   unconditional now, so the site needs no env var and setting one there does
   nothing.
4. Changelog entry + version bump at the flip, not at merge (the EPK precedent).
   `apps/homepage` changes never earn one, but the `apps/web` half does.

---

## Plan changes and proration (2026-08-24)

The last item in the pricing spec. A paying team can move between tiers; an
upgrade charges the difference for the days they have left, a downgrade waits
for the period they already paid for. Behind `NEXT_PUBLIC_FEATURE_PRICING_V2`
(the route 404s when off).

### Paystack has no plan-change endpoint, and that shapes everything

There is no plan-swap call and no proration primitive. A change means **disabling
the old subscription and creating a replacement**, and the founder does that by
hand (founder call). The app records the decision, takes the money an upgrade
owes, switches entitlements, and tells the founder what is now due at Paystack.

**Why not automate the swap.** Its worst failure is disabling a subscription and
then failing to create its replacement: the team keeps working, nothing looks
wrong, and access lapses months later with no charge having been attempted. A
human doing it cannot fail that way silently. The cost of the choice is a
deadline the founder has to hit, so the deadline is stated in three places — the
alert email's subject and body, `billing_events`, and a **SWAP OWED** line on
`/admin/teams`. An email is one chance to notice; a wrong charge is not
recoverable by noticing later.

### The policy

- **Upgrade**: charge `(target price − current price) × unused fraction of the
  period`, once, now. **`expires_at` never moves** — they already paid for this
  period and are topping it up, not rebuying it. The new tier's limits apply the
  moment the charge clears.
- **Downgrade**: nothing is charged and nothing is taken away early. The target
  waits in `pending_plan` and the renewal applies it.

### Six things a later change will be tempted to get wrong

1. **This is NOT `start-checkout` with a different body**, which is the obvious
   shape and is wrong twice over. That route initializes *with a plan code*, so
   Paystack opens a **second subscription** on the same customer — and
   `subscription.create` matches on `paystack_customer_code`, so the new code
   overwrites the old one on our single row and orphans a subscription that keeps
   billing. It also recomputes `expires_at` from scratch, discarding the period
   already paid for. The change route initializes with **no plan param** (the
   card-verification charge's shape) so it is a one-off top-up.
2. **`paystack_subscription_code` is CLEARED when a change is recorded, and that
   is load-bearing.** `handleSubscriptionDisable` stamps `status: 'cancelled'` on
   whatever row matches a disabled code — so when the founder disables the old
   subscription as part of the swap, an un-cleared code would turn a healthy
   upgraded team into one whose Settings reads "Cancelled, access until …". A
   renewal arriving in the window still matches: the webhook falls back to
   `paystack_customer_code`.
3. **No new `status` value, ever.** `resolveSnapshot` grants access only for
   `active | cancelled | past_due | trialing | free_trial`; a `'changing'` status
   would read as expired and lock every changing team out of the product, as well
   as violating `subscriptions_status_check`. A team changing plan is a paying
   customer with nothing wrong, so their status stays `active`.
4. **The paid-upgrade webhook branch must divert BEFORE the recurring branch**,
   for a different reason than the card-trial divert beside it: `plan` on a
   plan-change payments row IS a real tier id, so `isRecurringPlan` accepts it
   and `applyInitialOrManualCharge` would upsert a fresh `expires_at` — throwing
   away the period the upgrade promised not to touch. Keyed on the jsonb
   `source`, not on `plan`.
5. **`applyInitialOrManualCharge` clears the pending fields.** Without it, a team
   whose period lapsed with a downgrade pending would re-activate on the tier
   they just bought and then be silently moved off it at the next renewal, by a
   request they made months earlier.
6. **The prorated fraction is clamped to 1, over a NOMINAL period** (30 days /
   365). Measuring the real length by subtracting an interval from `expires_at`
   clamps on short months, so a period ending March 3 would measure as 28 days
   when it was 31 — making the fraction too big and the charge too high. Nominal
   is predictable and explainable in one sentence. Both facts are
   mutation-tested: removing the clamp fails two tests.

### What it refuses, and why refusing is the answer

`quotePlanChange` refuses an **interval change** (monthly to annual means buying
a year, which restarts the period — the policy the founder explicitly did not
pick), a **sales-led target** (no price to prorate), and any **legacy or
grandfathered current plan** (CLAUDE.md already records that the displayed
amounts are today's LIST prices, not necessarily what an account pays, so the
credit side would be a guess). Each refusal names the next step, and a test
asserts none of them is a dead end. At this scale a conversation beats a
confident wrong number.

A prorated amount below Paystack's practical floor is **granted free** rather
than charged — otherwise a team upgrading on the last day of a period gets a
broken checkout to buy a few hours. A test sweeps a whole period to prove no
hour produces an amount Paystack would reject.

### Two live bugs fixed on the way

- **Settings' "Change plan" button was a dead round trip.** It pushed a bare
  `/locked`, whose has-access effect immediately replaced a paying team back into
  the app. The identical bug `UrgansUsageStrip` had before it was given
  `?intent=upgrade`; `'change'` now carries the same param.
- **The renewal ack reported the plan the team was leaving.** A pending downgrade
  applies at that exact moment, so it now reports the plan it ended on.

### Verified

**1146 tests** (28 new), `eslint .` at the exact **3-error / 66-warning**
baseline, `next build` green **by exit code** in both flag states with `/auth`,
`/onboarding` and `/settings` still `○ Static`. Runtime probes, rebuilding
between them: flag off `/api/billing/change-plan` **404**s while
`/api/billing/start-checkout` still **401**s; flag on it **401**s — the
404-vs-401 discrimination is what proves the gate rather than a routing accident.
Mutation-tested: removing the fraction clamp, and letting a legacy plan through
the refusal, each fail exactly the tests written to catch them.

**Not verified, and this is the significant gap.** Nothing has run against real
Paystack or a real database: no proration has been charged, no webhook delivered,
no downgrade applied at a renewal, and the founder's manual swap has never been
performed against a row this code wrote. The arithmetic rests on unit tests, and
the sequencing on traced call paths. Worth a real pass once a tier subscription
exists: upgrade a Manager team mid-period, confirm Paystack quotes the difference
rather than the full price, confirm `expires_at` did not move, then check
`/admin/teams` shows the SWAP OWED line.

### Still not built, deliberately

An interval change, which is a founder conversation by design rather than an
omission. (Read-only-on-payment-failure, the other item this section used to
name, shipped 2026-08-24 — see the section immediately below.)

---

## Read-only on payment failure (2026-08-24)

The last item in the pricing spec, and the end of the binary access model.
Before this, a team that had been **paying us** and whose renewal charge failed
landed in exactly the same place as a team that never paid at all: the full wall,
catalogue included. That is the wrong treatment for the only churn event in the
system that is genuinely recoverable. Behind the existing
`NEXT_PUBLIC_FEATURE_HARD_PAYWALL`, so it is live wherever that flag is.

**No new flag and NO MIGRATION.** Read-only is derived, not stored, which is the
same thing as saying it is permanent: there is no second deadline to record.

**Policy (founder).** It begins when the paid period ends with the charge still
unpaid — Paystack's retries inside the period change nothing, because
`resolveSnapshot` already treats `past_due` + not expired as paid. It is then
permanent: no later wall. **Trial expiry still gets the wall**, which is the
founder's line from the pricing spec verbatim.

### Six things worth knowing before touching this

1. **`read_only` is a sixth `TeamAccessState` with a new `canWrite` axis, and
   that shape is forced.** `hasAccess: true` alone lets the gate through
   everything; `hasAccess: false` alone draws the wall, because
   `HardPaywallGate` redirects on `!hasAccess`. So read-only is
   `hasAccess: true, canWrite: false`, and every other state has
   `canWrite === hasAccess`. `HardPaywallGate` therefore needed **no behaviour
   change** — do not "tidy" it into a `canWrite` check, or the wall goes back in
   front of exactly the customers this exists for. A test pins that.
2. **The discriminator is `profiles.paid_at` on the owner, and not a status
   string.** It is the one unambiguous "real money landed" marker in this schema:
   written by exactly the two webhook paths where a charge succeeded, and
   deliberately withheld by the card-verification path (whose own comment says
   "nothing has been bought yet"). **Do not widen it to
   `subscriptions.status === 'cancelled'`** — a cancelled card-trial wears that
   status and never paid a penny, so reading the status would hand read-only to
   the teams the founder decided keep the wall. `lapsedFromPayment` is the pure,
   tested predicate, and mutating it to ignore `paid_at` fails the
   "trial expiry keeps the wall" test.
3. **THE REFUSAL IS 403, AND MUST NEVER BE 402.**
   `lib/access-redirect.ts` patches `window.fetch` and redirects the browser to
   `/locked` on any same-origin 402, so a 402 here would eject a read-only team
   from the app on their first blocked save — the very wall this replaces. 403 is
   also the honest code and the established precedent:
   `buildReadOnlyResponse` in `lib/tasks-server.ts` already refuses a guest's
   writes with a flat `{ error }` at 403, and every mutation surface renders that
   string unchanged. `READ_ONLY_REFUSAL_STATUS` carries an explicit
   not-`ACCESS_REQUIRED_STATUS` test for this.
4. **The gate refuses by HTTP method, threaded from three call sites.**
   `request.method` now reaches `requireActiveAccount` from
   `requireActiveAuthenticatedUser`, `requireActiveAuthenticatedUserOrInternal`
   and `requireAuthenticatedAdminOrInternal` in `app/api/_shared/auth.ts` — all
   three already had the request in hand, so every gated route inherits this from
   three lines. GET/HEAD/OPTIONS pass; an absent method counts as a write. The
   imprecision runs both ways and both are accepted: **a writing GET still
   writes**, which is a requirement rather than a leak (lazy workspace
   provisioning, the `metadata_viewed` stamp whose failure fails the whole read,
   and the default task-group insert all happen on GETs — gating them would stop
   a first page load resolving), and **a few non-GET pure reads are
   over-refused** (the genre-prediction proxy, the AI status generator), which is
   harmless because the PATCH that would save either result is refused anyway.
5. **No exemption list is needed, and that was verified rather than assumed.**
   All five `/api/billing/*` routes and `/api/account/export` use
   `getAuthenticatedUser`, so they are open and never reach the gate. The path
   *out* of read-only (checkout, plan change, notify-admin, track) and the path
   *to their data* (export) therefore keep working with no special case.
   `POST /api/urgans` IS gated, so **the assistant is unavailable in read-only
   mode**, deterministic chips included — a decision, not an oversight: a lapsed
   team does not get billed model calls.
6. **The bug class this feature creates: read-only has `hasAccess: true`, so
   every existing path to `/locked` bounced it.** Three separate dead ends, all
   fixed together and all worth remembering if a fourth link is ever added:
   `TeamWall`'s has-access effect (needed `intent=reactivate` in its
   deliberate-visit set), `handleActivate`'s change-plan branch (gated on
   `hasAccess`, which sent a read-only team to a route that refuses with
   `no_active_period` — now gated on **`canWrite`**, so it and `quotePlanChange`
   agree by construction), and Settings' CTA (a bare `/locked`, now the new
   `'reactivate'` CTA). Every link that sends someone here carries
   `READ_ONLY_REACTIVATE_HREF`.

### Two smaller decisions

- **`mark_paid` now stamps `profiles.paid_at`** (coalesced, best-effort, never
  overwriting an earlier one). It did not, so an invoice-settled Label or
  Enterprise team — exactly the customer most likely to be on an invoice — would
  have hit the full wall when their year lapsed. Safe and provably so: `paid_at`
  grants nothing on its own, since inside `resolveSnapshot` it only ever chooses
  between `expired` and `unpaid`, both no-access. **The prohibition on
  `mark_paid` writing `is_subscribed` still stands** — that one grants paid
  access forever with no expiry.
- **The founder is alerted at `invoice.payment_failed`, not at the lapse.** That
  is the only point where a churn event is both known and still cheap to fix:
  retries are pending, the customer has full access, and a message about a card
  takes a minute. New `payment_failed` billing event (the column is free text, so
  no migration) plus a `CARD FAILED` founder alert, fire-and-forget under the
  flag, mirroring the `checkout_completed` block beside it — an alert must never
  fail a webhook.

### What is NOT built, deliberately

- **No write affordance is disabled anywhere.** `TeamReadOnlyStrip` (above the
  topbar, not dismissible, the `TeamTrialStrip` shape) is the communication and
  the server's 403 message is the per-action explanation — the same division the
  seat cap already uses. Disabling every mutating control in the product is a
  much larger piece of work.
- **No grace window.** Grace exists because a 402 yanks the page; a 403 does not,
  so the worst case at the transition is one failed save with a visible message.
  Note the one place that stings: `PUT …/plan` is a debounced autosave, so a
  refusal there discards in-progress typing rather than just refusing an action.
- **The `paywall_view` tracking is untouched.** A read-only team has access, so
  it never fires — `paywall_hit` means the wall and should keep meaning that. The
  `payment_failed` alert is the signal for this state.
- **Precedence is unchanged above read-only.** Allowlist, owner-paid, comped, a
  live trial and the `no_trial_stamp` fail-open all still win, so switching this
  on cannot take anything away from anyone. Fail-open sitting ABOVE read-only is
  deliberate: an unstamped team that also lapsed from payment gets full access,
  because our missing backfill must never cost a customer their writes.

### Verified

**1169 tests** (23 new), `eslint .` at the exact **3-error / 66-warning** baseline
(all three errors pre-existing in `WorkspaceView.tsx`), `next build` green **by
exit code** with the hard paywall off and on, `/auth`, `/onboarding` and
`/settings` still `○ Static` in each. Runtime probes in both flag states,
rebuilding between them because `NEXT_PUBLIC_*` is inlined at build time even
server-side: gated routes 401 unauthenticated (so the gate's ordering is intact)
and `/api/billing/*` 401 rather than 403 (so they never reach the gate).
**Mutation-tested rather than merely asserted:** making `lapsedFromPayment`
ignore `paid_at`, letting POST count as a safe method, and changing the refusal
status to 402 each fail exactly the test written to catch them.

**Not verified, and this is the significant gap.** Nothing has run against a real
database or Paystack: no renewal has failed, no team has gone read-only, the
strip and the reactivate flow have never rendered in a browser, and the founder
alert has never been delivered. Worth one real pass once a tier subscription
exists — let a renewal fail, confirm access continues to `expires_at`, then
confirm the strip appears, a save is refused with a readable message, "Update
payment" reaches the picker rather than bouncing, and paying restores writes on
the next request.

---

## The workspace back arrow goes back now (2026-08-25)

Founder report: the circled back arrow left of the MOTION bar "is not working,
it's always meant to take you to the last place the user was no matter what."
Two separate faults, and the second is why it read as dead rather than merely
wrong.

### Fault 1: it pointed at the catalog, always

`handleClose` was one line, `setScope(null)`, and the button was labelled "Back
to all releases". From an open scene it therefore skipped TWO levels at once,
dropping the scene and the release scope together. It was not history-aware in
any way.

### Fault 2: for a single-release account it was a genuine no-op

`hasAutoScopedRef` in `WorkspaceView.tsx` meant **"the auto-scope ran"**, not
**"the auto-scope has had its one chance"**. So an account with one release that
**arrived already scoped** — a refresh, a bookmark, an UrgAns link, or the
`/dashboard/releases/[releaseId]` redirect stub — returned early at
`scopedReleaseId` and left the ref `false`. The first back press cleared the
scope, which then satisfied every guard, so the effect fired and re-scoped
straight back in. And the skeleton gate (`isSingleRelease && !scopedReleaseId &&
!hasAutoScopedRef.current`) covers exactly that frame, so **nothing visibly
happened**.

The ref's own comment described this bug as already fixed. It was, for arrivals
where the auto-scope had actually run — which is not the arrival most people
have. **The fix is one branch: arriving already scoped now spends the chance.**
Note what it deliberately does NOT do: `!isSingleRelease` leaves the chance
OPEN, because a zero-release account is handed the create modal and must still
get its one auto-scope when that first release lands.

### The behaviour: one rule, three cases

`goBack` in `WorkspaceView.tsx`, shared by the desktop arrow and the mobile one:

1. **A scene is open** -> `closeScene()`. Lands on Activities for the same
   release, and never consults history.
2. **No scene** -> the previous in-app URL from `lib/nav-history`, pushed.
3. **Nothing usable** -> `setScope(null)`, the old behaviour, still the floor.

**Case 1 is load-bearing, not just the founder's preference** (asked and
answered, 2026-08-25): because history is never read while a scene is open,
scene-to-scene ping-pong is structurally impossible rather than merely guarded
against, and one stray tap can never throw someone out of a release they were
part-way through.

### Three things a later change will be tempted to get wrong

1. **It must not become `router.back()`.** A legacy-route redirect can make a
   scene URL the FIRST history entry in a tab, so `back()` would eject the user
   out of the app entirely. Recorded at `useSceneOverlay.closeScene`, the stub it
   names is real, and nothing in this app calls `router.back()` anywhere.
2. **`resolveWorkspaceBackTarget` (in `lib/nav-history.ts`) rejects a previous
   location that still scopes THIS release, and that is the point of it.**
   `nav-history` holds ONE slot, not a stack, and skips same-URL writes — so
   immediately after closing a scene the previous location IS that scene's own
   URL, and pushing it would re-open what the user just left. Going back to the
   release you are leaving is not leaving it. This is the analogue of the
   Settings back button's `!previous.startsWith('/settings')` guard, which does
   not transfer directly because both URLs here share one pathname.
   Mutation-tested: removing the guard fails exactly the ping-pong test.
3. **The label is derived from `activeScene` alone, never from the resolver.**
   The resolver reads `sessionStorage`, and a storage read during render gives
   the server and the client different text for one attribute. The button is not
   in the server output today (the skeleton gate holds while `authLoading`), so
   it would not mismatch in practice, but a label is not worth depending on
   that. "Back" is vague and never wrong; "Back to all releases" was specific
   and usually wrong.

**Reuse, not new plumbing:** `lib/nav-history.ts` and `NavigationTracker` have
existed since 2026-07-23 (founder request) and already record the previous in-app
URL, query string included. The Settings back button was their only consumer.
Nothing new was built to store history.

Also corrected: `WorkspaceDesktopFocused`'s `onClose` prop doc claimed it is
"omitted when there is no catalog worth returning to — a workspace with a single
release". That was never true of the code (the only call site always passes it),
and it is a large part of why a dead button read as intentional.

### Verified

1274 tests (8 new in `lib/nav-history.test.ts`, the module's first), `eslint .`
at the exact 3-error / 66-warning baseline, `next build` green by exit code with
`/auth`, `/onboarding` and `/settings` still `○ Static`. **One of those three
pre-existing errors is on this very machinery** — `hasAutoScopedRef.current` read
during render — and converting the ref to state was deliberately NOT bundled: it
would fix the lint error but changes render timing on the skeleton gate, which is
a bigger and riskier change than the bug being fixed.

**Not verified:** the click itself. The workspace needs an authenticated session
with a real release, which this sandbox cannot mint (and it cannot reach either
urganize domain — the proxy answers 403 to CONNECT), so the three cases rest on
unit tests plus traced call paths. The auto-scope branch has no unit test at all,
since this repo does not test components. Worth one pass on a real account: from
`?release=X&scene=coverart`, press back three times and expect Activities, then
wherever you came from, and never a silent no-op.

---

## Collect metadata: three closed cards on entry (2026-08-25)

Founder, second time on this exact page: the Collect metadata scene is
"overloaded with too much information for when a user just enters that
section" — "bring down the information so that even a 5th grader would
understand what is going on there and how to use it intuitively." Round one
(2026-08-13, see the docblock at the top of `MetadataSection.tsx`) fixed the
COPY — Step 1/2/3 labels, plain-English hints, "all optional" said out loud —
but left the structure untouched: every step still rendered fully open on
entry, so a first visit painted an intro line, three headers, three helper
paragraphs, all 8 fields with their hints, the explicit checkbox, Save, the
link card, and an empty-state line, all at once. Copy alone didn't fix a
volume problem.

**The fix: the three steps are now collapsed cards, closed on every entry.**
A user sees the scene header, one short intro line ("Everything music stores
need for this song, in three steps. Tap a step to open it — everything is
optional."), and three tappable cards — a plain title plus a live one-line
status chip (`N of 8 filled in`, `Link is live` / `No link yet`, `N answers` /
`No answers yet`, with `· check the shares` appended in warning tone when a
collected split doesn't total 100%). Tap a card to open it; everything inside
is exactly the round-one content, unchanged.

This reuses the house pattern rather than inventing one: the workspace task
buckets (`TasksPanel.tsx`) are collapsed-by-default `<button aria-expanded
aria-controls>` headers with a `ChevronDown` that rotates `-rotate-90` when
closed, and their own comment records the reasoning this borrows verbatim:
"The header counts carry the signal at a glance; opening a bucket is a
deliberate act."

**Three things a later change will be tempted to get wrong:**

1. **No smart auto-open of "the next incomplete step."** That would re-dump
   the 8-field grid on exactly the first-time user this complaint is about.
   All three cards start closed, unconditionally, every time the scene mounts.
2. **The open/closed state is session-only `useState`, deliberately NOT
   persisted** like the task buckets are (no `lib/persisted-state` key).
   Buckets are a daily working view a user curates over many visits; Metadata
   is visited occasionally and the complaint was specifically about *entry* —
   every entry has to start calm, not resume wherever the user last left it.
3. **A load error hides all three cards behind ONE error box.** Before this
   there were two identical Retry boxes (Step 1 and Step 2) plus a Step 3
   whose empty-state copy quietly lied during an error. It's one fetch for the
   whole scene, so one error state covers it — and it also avoids editing a
   form seeded from `EMPTY_FORM` mid-error, which risks saving blanks over
   real data.

**Not touched:** every handler, the fetch/cache logic, the dirty-form ref,
genre prediction, the `window.confirm` copy, `SubmissionCard`, the `Field`
helper, and the scene chrome (`ReleaseScenePanel`'s header/back-control, the
entry-point pills, the topbar) — this is a render-layer restructure of
`MetadataSection.tsx` alone. `ReleaseSectionSkeletons.tsx` is also untouched:
`MetadataFieldsSkeleton` and `ShareLinkCardSkeleton` keep their exact shape
and their exact `border-stroke-default bg-bg-surface` tokens, and the real
content boxes inside each open card were deliberately kept on those same
tokens (a first draft tried `border-stroke-subtle bg-bg-elevated` to visually
separate the nested box from its new outer card, then reverted it — that
would have made loaded content flash a different shade than the frozen
skeleton the instant data arrives). No flag change, no migration, no API
change.

**Verified:** `vitest run` and `eslint .` at the unchanged baseline (3 errors
/ 66 warnings, all pre-existing in `WorkspaceView.tsx`), `next build` green by
exit code, `/auth`, `/onboarding`, `/settings` still `○ Static`. **Not
verified:** the scene has never been opened in a browser — it needs an
authenticated session with a real release, which this sandbox cannot mint and
has no network route to. The change is markup-only over unchanged handlers,
so the risk is visual rather than behavioral; worth one live pass: open
Collect metadata, confirm three closed cards with correct statuses, open Step
1, fill a field, Save, and watch the chip move.

---

## An open scene gets the whole surface (2026-08-25)

Founder, next day, screenshot of Collect metadata on a desktop: "fix this bug on
desktop view." Two faults, both width, one screenshot.

### Fault 1: two empty rails were holding half the surface

`hideRailsForLayout` in `WorkspaceView.tsx` dropped the release rails for the
UrgAns rail and for `?scene=calendar` **and nothing else** — on the recorded
reasoning that "the other scenes fit the normal centre column, so they leave the
rails alone (founder call)". They do not. At xl+ the two rails plus their gaps
take `220 + 24 + 24 + 220 = 488px`, so a 1280px viewport with the identity card
on leaves a scene about 450px, and `RailColumn` renders an **empty
`<div aria-hidden>`** when a rail has no cards — which is every rail on a
one-release account. Nearly half the surface was blank while an 8-field form was
crushed beside it. It is now `Boolean(activeScene)`: any open scene, same
treatment.

Three things worth keeping about that:

1. **The rails' documented purpose is about the release-CARD view** — "so the
   centered card sits in the middle, not flush against the viewport edge". A
   scene REPLACES the activity list with a working surface (a form, a month
   grid, a file list, a press-kit preview), and every one of those wants the
   width more than a sibling release card does. The back arrow and the catalog
   are still one press away.
2. **`Boolean(activeScene)`, never the raw URL param.** `activeScene` is already
   flag-gated, so a stale `?scene=capture` with that flag off correctly counts
   as no scene and keeps the rails.
3. **`WorkspaceSkeleton` had to move in the same commit** (the
   loading-skeleton-sync rule): it computed the same decision from its own
   calendar-only copy, so a refresh on any other scene URL painted 3-column
   rails that vanished the instant data resolved.

### The consolidation that made fault 1 safe to fix

That skeleton mirror would have been the FOURTH hand-rolled copy of the same
four-flag expression (`WorkspaceView` for the scene body, `TasksPanel` for which
pill is lit, `WorkspaceSkeleton` for the layout). They had **already drifted** —
TasksPanel's copy was missing `'song'` and `'coverart'` long after the real gate
had them, which its own comment admitted. So it now lives once, as
`resolveActiveScene` in `lib/scene-cache.ts` (the shared floor its header already
claims to be), and all three callers use it. A layout decision computed two ways
is exactly the bug class this fix is about.

**It gates only four scenes, deliberately.** `metadata` / `files` / `epk` /
`pitch` / `plan` are NOT gated there, matching the behaviour it replaces exactly:
those gate themselves inside `ReleaseScenePanel` and their own pills, and adding
them would change which scenes RENDER rather than consolidating a check. A test
asserts they stay open with every gated flag off, so adding one has to break that
test on purpose. Mutation-tested: deleting the calendar gate fails the suite.

### Fault 2: `sm:shrink-0` made `flex-wrap` dead code

The link card's button row is `flex flex-wrap gap-2 sm:shrink-0`, and those two
classes contradict each other: `flex-shrink: 0` pins the group at its ~350px
max-content width, so at any width ≥ `sm` it can **never** wrap — it overflows
instead, and gets clipped mid-word ("Regener…" in the screenshot). The row was
latent before and became a hard clip when the three closed cards landed the day
before with `overflow-hidden` on each.

Fixed with the precedent already recorded for TasksPanel's pills (2026-08-10):
the group loses `sm:shrink-0` so it can narrow, and each button gains
`shrink-0 whitespace-nowrap` so they move whole onto a second row rather than
compressing and breaking their own labels inside a fixed `h-9`. The URL beside
them is `flex-1` with a 0 basis, so it absorbs none of the shrinkage and keeps
truncating.

**Three identical copies**, all fixed together: `MetadataSection`, `EpkSection`,
`CaptureSection` are byte-identical in this row. Leaving two of them would be the
drift this file keeps having to correct.

**`AssetUploadControl` carries the same `sm:shrink-0` and was deliberately left
alone** — different shape (a `<select>` label sibling, not a truncating URL), a
different failure width, and `NEXT_PUBLIC_FEATURE_FILES` is off in production. It
is the same latent class if anyone widens this later.

### Verified

1278 tests (4 new in `lib/scene-cache.test.ts`, plus the calendar-gate mutation
test above), `eslint .` at the exact 3-error / 66-warning baseline (all three
errors pre-existing in `WorkspaceView.tsx`), `next build` green **by exit code**
with `/auth`, `/onboarding`, `/settings` still `○ Static`. Compiled output
checked rather than assumed — the repo's own habit for anything CSS-dependent:
the link-card `sm:shrink-0` string is down to **one** occurrence in the client
chunks (AssetUploadControl, as intended), the new wrapping button class is
present, and `.shrink-0{flex-shrink:0}` / `.whitespace-nowrap{white-space:nowrap}`
are both in the compiled CSS.

**Not verified:** none of it has been seen in a browser. The workspace needs an
authenticated session with a real release, which this sandbox cannot mint, and it
has no network route to either urganize domain. Both faults are layout-only over
unchanged handlers, so the risk is visual. Worth one live pass: open Collect
metadata on a desktop and confirm the scene now spans the full centre with no
empty columns beside it, that all three link buttons are whole, and that closing
the scene brings the release rails back.

---

## The metadata collection link, audited then refined (2026-08-27, v1.3.0)

Founder spec, two-phase: audit the credit-collection flow first, then close the
gaps. **The feature already existed** — collaborator credit capture, built
2026-07-31 (URG-108) and live behind `NEXT_PUBLIC_FEATURE_METADATA`. The audit
found the whole spine working (one link per release, public no-login form,
submissions attached to the release and listed for the owner, split totals shown
plainly without blocking) and six real gaps. **No new flag**, and no scope
expansion: this is the same surface, corrected.

Founder decisions taken before building: **skip** the expected-contributor count
("N answers" stands), **keep the 11 detailed roles** rather than collapsing to
the spec's 5 (a superset, and collapsing would migrate real rows and lose
precision distributors use), **no tier gating**. A contributor still only ever
enters their own splits, which the spec preferred and the code already did.

**One migration, `20260827100000_credits_link_close_and_email_upsert.sql`,
deliberately covering all three schema changes in one file** — the feature is
live and the code reads all three, so a partial hand-application leaves the app
selecting columns that do not exist. **⚠️ Its section 2 DELETES duplicate rows**
(keeping the newest per release+email) because the unique index cannot build
otherwise.

**Six things worth knowing before editing any of this:**

1. **Closing a link is not revoking it, and that distinction is the feature.**
   `release_credit_links.closed_at` (timestamptz, NULL = open, so every existing
   row stays open with no backfill and reopen is just `= null`). The token still
   resolves: `loadPublicCreditForm` now returns a discriminated union
   (`ok` / `closed` / `missing`) and the public page renders "This request is
   closed" with the release still named, rather than a 404. Everything else still
   collapses to `missing` — a rotated-away token must never be distinguishable
   from one that never existed. **Regenerate clears `closed_at`** on purpose: a
   regenerated-but-still-closed link is a trap state nothing in the UI explains,
   so Regenerate means "fresh live link" and Close means "pause the one I have".
2. **The public POST refuses a closed link BEFORE reading the body**, at 403.
   Someone who loaded the form while it was open and submits after must be told
   the link closed, not nitpicked about a field.
3. **Same-email resubmission updates instead of duplicating, and `.upsert()`
   cannot do it.** supabase-js hands `onConflict` to PostgREST as a plain COLUMN
   LIST, so it cannot target the partial expression index this needs
   (`(release_id, lower(email)) where email is not null`). So the route
   selects-then-updates-or-inserts, retrying an insert that fails `23505` as an
   update. Matching happens in JS, never through `.ilike()` — `_` is a wildcard
   and underscores are common in email local parts, so `john_doe@x.com` would
   match `johnXdoe@x.com`. `created_at` is never touched (their place in the
   owner's list is when they FIRST answered); the 100-submission cap applies to
   the insert path only, since a correction adds no row.
4. **The split rules live once, in `lib/credit-submissions.ts`, and are run by
   both the form and the route** so the two cannot disagree — the
   `asset-constants.ts` pattern. Required for writers (songwriter / composer /
   lyricist) and producers; credit-only roles (engineer, vocalist, musician,
   featured artist) are asked for nothing, because they are usually credited
   without holding a share and demanding a number teaches people to invent one.
   A second decimal place is **rejected, not rounded** — silently turning 33.33
   into 33.3 changes a number a publisher gave them.
5. **`SCENE_REVALIDATE_ON_LOAD` in `lib/scene-cache.ts` is why a submission is
   never hidden.** The 30s freshness window meant a submission landing in that
   window was invisible even after a full page reload (the disk-adoption path
   returns a still-fresh persisted copy with zero requests). Metadata now always
   revalidates in the background on a real open: it still paints from cache, so
   nothing flickers, but the fetch always runs. **Prefetch passes are exempt** or
   the idle prefetch would re-fetch seconds after a real load. In-flight dedup
   stays first and unconditional. `capture` has the identical bug (fans post
   leads to a public page) and is deliberately **not** included — a one-line
   addition when someone wants it.
6. **`patchScene` in `MetadataSection.tsx` reads the store at call time**, not
   the render closure, precisely because of item 5: a background fetch can now
   land between a render and a mutation resolving, and merging onto the older
   copy would re-stamp superseded submissions as fresh.

**Also fixed, each a real defect rather than polish:** every input on the public
form was `text-sm`, which is **13px in this repo's preset** (it shifts the whole
scale down — `text-base` is 14px, only `text-lg` clears iOS Safari's 16px
zoom threshold), so the form zoomed the page on every field tap on the one device
most collaborators open it on. `country` and `publisherIpi` were collected from
day one and rendered **nowhere**, so an owner doing a distributor handoff could
not tell they had them. **ISWC did not exist anywhere in the repo** — added to
`release_metadata` and Step 1 (now 9 fields), release-level and owner-entered
because ISRC identifies the recording, UPC the release and ISWC the song, so it
is never asked of a collaborator. It also had to join `METADATA_FIELDS` in
`lib/chappi/tool-families/metadata.ts` or an assistant metadata update would
have nulled it, which is exactly the full-replace trap that file's header warns
about. Em dashes removed from the user-facing copy on both public share pages.

**Tests: the feature had ZERO and now has 67** across
`lib/credit-submissions.test.ts`, `lib/credits-server.test.ts` and the
scene-cache additions. **Mutation-tested rather than merely asserted:** making
`requiredSplits` ignore writer roles, and dropping metadata from
`SCENE_REVALIDATE_ON_LOAD`, each fail exactly the tests written to catch them.

**Verified:** 1454 tests pass, `eslint .` at **byte-identical baseline**
(3 errors / 68 warnings, all pre-existing in `WorkspaceView.tsx`, confirmed by
linting a stashed tree), `next build` green **by exit code** in both flag states
with `/auth`, `/onboarding`, `/settings` still `○ Static`. Runtime probes:
flag off, every credits route (the new PATCH included) **404**s while the ungated
`/api/releases` still **401**s — that discrimination is what proves the gate
rather than a routing accident; flag on, the owner routes **401**. Note
`/credits/<bad token>` answers the 404 body with HTTP **200**, the pre-existing
`force-dynamic` quirk this file already records for epk/capture/credits.

**NOT verified, and it is the whole risk surface:** nothing has run against a
real database. The migration is unapplied here, so no link has been closed, no
resubmission has replaced anything, no `23505` retry has fired, and the closed
page has never rendered. The owner UI needs an authenticated session this
environment cannot mint, and there is no network route to app.urganize.app. All
of it rests on unit tests plus traced call paths.

**Phase 2 is complete as of 2026-08-27** — owner notification, the CSV export and
the prefill, all three in the sections below.

### The owner notification (2026-08-27)

Founder request, Phase 2 item 1. **Push AND email, both, every time, fired inline
from the public credits POST.** No migration, no new feature flag, no changelog
entry yet (see the trigger at the end).

Founder calls: both channels every time; off switch on the admin presets page
rather than a per-user column; **new people only** (a correction stays quiet);
one notification per submission, each naming the person.

**Why not the in-app bell, and this is the load-bearing decision.**
`notifications.task_id` is `not null references public.tasks(id)` and all seven
`notification_type` values are task-scoped, so a credits event has no legal row
there. Making it fit needs an enum add, dropping NOT NULL on the app's hottest
realtime table (it is in `supabase_realtime` with `replica identity full`), a new
`release_id` column, and ~8 code sites — `NotificationRow`/`TaskNotification`
both hard-type `taskId: string`, `listNotifications` would push `null` into an
`.in()`, the unread dedupe is keyed on `task_id`, `buildTaskPushPayload` would
emit `tag: task-undefined-…`, and `NotificationsBell.handleSelect` calls
`openTask(taskId)` unconditionally while its `sameScope` short-circuit ignores
`scene`, so an owner already scoped to that release would get NO navigation at
all. The bell is also `hidden lg:block`, i.e. **desktop only**, so an
in-app-only notification would never reach a phone.
`lib/billing-alerts-server.ts:9-14` is the recorded precedent for choosing email
at this exact fork, and CLAUDE.md's own out-of-scope line names transactional
email as fine while deferring the inbox to v2. **`scheduled_notifications` is
also ruled out**: its only flusher is a DAILY cron on the Hobby plan, shortened
only by some unrelated user logging in — up to ~24h, wrong for "someone just
submitted".

**Five things worth knowing before editing this:**

1. **The push `tag` is keyed on the SUBMISSION, never the release.** A shared tag
   makes the push service REPLACE the previous notification rather than stack it,
   so two collaborators answering minutes apart would leave the owner seeing only
   the second — silently defeating the founder's "one each, naming the person".
   Mutation-tested.
2. **Insert path only is a security property, not a preference.** The UPDATE path
   carries no submission cap by design (a correction adds no row), so notifying
   on updates would let anyone holding the share link send the owner unlimited
   pushes and emails. This is also **the first place in the app where an
   unauthenticated request can trigger a push at all** — every other
   `sendPushToUsers` caller is a cron, an admin route, or authenticated.
3. **The email is the half that carries the detail**, and that is the whole
   reason both channels exist rather than one: name, stage name, roles, both
   splits, PRO, IPI, publisher, so a manager can check a number or forward the
   thing to a distributor without opening the app. If it is ever trimmed to "you
   have a new submission", it stops being worth sending. `buildCreditDetailRows`
   drops blank fields entirely — a wall of "not given" is worse than a short list.
4. **It never throws and never fails the submission.** A collaborator on weak
   mobile data has already done the work by then. Push and email run in
   `Promise.all` so the worst case is `max()` not `sum()`; the honest ceiling is
   the email module's own 10s abort, typical is ~300ms. If that ever bites, the
   follow-up is a `send_at = now()` queue row, which trades latency back.
5. **`fillCreditPlaceholders` leaves an UNKNOWN `{placeholder}` alone** rather
   than blanking it: a silently-emptied word reads as a broken product to whoever
   receives the notification. Also mutation-tested.

Files: `lib/credit-notifications.ts` (pure copy + the tag/url decisions),
`lib/credit-notifications-server.ts` (the leaf sender, the
`release-reminders-server.ts` shape), `buildCreditSubmissionEmail` in
`lib/email-templates.ts`, a fourth `creditSubmissions` category in
`lib/notification-presets.ts` (JSON in `app_settings`, so the normalizer keeps
pre-2026-08-27 rows working with no migration), the admin section in
`app/admin/notifications/NotificationsPageClient.tsx` plus its "Send test to me"
branch, and one `await notifyCreditSubmission(...)` on the insert path of
`app/api/credits/[token]/route.ts`.

**Verified:** 1491 tests (37 new), `eslint .` at byte-identical baseline (3
errors / 68 warnings, all pre-existing in `WorkspaceView.tsx`), `next build`
green by exit code in both flag states with `/auth`, `/onboarding`, `/settings`
still `○ Static`. Flag off, the credits POST 404s while the ungated control
401s.

**NOT verified, and it is the whole risk surface: no notification has ever been
delivered.** No real database, no Resend key, no push subscription here. The
500s a local probe returns are the placeholder Supabase URL failing upstream of
this code (`"Could not resolve this link."`), not the notifier.

**Changelog entry: shipped as v1.4.0** (2026-08-27), covering this and the
spreadsheet export below. It was deliberately held at merge — the flag-flip
precedent applied to a feature with no flag, since both channels no-op until
`RESEND_API_KEY` + `EMAIL_FROM` or the VAPID pair are set — and then released
the same day when the founder confirmed those env vars have been set in Vercel
for a long time. **That confirmation is the only evidence they are set: this
sandbox cannot reach either urganize domain (the agent proxy answers 403 to
CONNECT), so no probe backs it up.** If a notification never arrives, check
those four env vars on the `Web` project before looking at this code. The admin
section is internal-only and never earns an entry.

### The submissions spreadsheet (2026-08-27)

Phase 2 item 2. A "Download as spreadsheet" button in Step 3 of the Metadata
scene. **Entirely client-side — no route, no second fetch, no migration, no
flag** — because the scene already holds every submission in memory.

**Three decisions worth keeping:**

1. **Splits are RAW NUMBERS, never "50%". This is the whole point of the
   file.** The reason to export splits is to total the column and see whether it
   reaches 100, and neither Excel nor Sheets can sum a cell containing a percent
   sign — so `"50%"` would make the export useless for its one job. A quoted
   bare number is still coerced by both, so `lib/csv.ts`'s always-quote rule
   costs nothing. An unanswered split stays EMPTY rather than becoming 0, because
   a zero share is a real answer and conflating the two would silently change a
   total. Mutation-tested: adding the percent sign back fails three tests.
2. **Every column is printed even when blank**, the opposite of the notification
   email, which drops blanks. A spreadsheet is where completeness beats
   curation: a missing column breaks a formula, an empty cell does not.
3. **Roles are semicolon-separated**, not comma. Every field is quoted so a
   comma would be legal, but this is the column people split back apart by hand
   and a comma list inside a comma file is a foot-gun there.

It goes through `shareOrDownloadTextFile` (`lib/share-file.ts`) rather than a
plain anchor, because a webview cannot download: native gets the share sheet, an
old shell without the plugins gets a "use the web app" message instead of a
silent no-op, and web gets a real file. The `DataExportSection` precedent,
including its outcome copy. Escaping comes from `lib/csv.ts` per that module's
own instruction that new code comes there — this is the first consumer to take
it up, so the four private copies it complains about are unchanged and still
four.

Files: `lib/credit-submissions-csv.ts` (+ 16 tests), the button and handler in
`MetadataSection.tsx`, and one prop threaded through `ReleaseScenePanel.tsx` so
the filename can name the release (`midnight-ep-credits-2026-08-27.csv`) rather
than colliding when a manager exports three releases in a sitting.

**Changelog: shipped in v1.4.0** alongside the notification above rather than as
its own version, since splitting them would have announced half a feature.

### Prefill, on the contributor's own device (2026-08-27)

Phase 2 item 3, and the one where **the spec's literal wording was the wrong
thing to build.** It asked to prefill "if the same contributor (same email) has
submitted on a past release in the workspace" — which means the public form asks
the server what it knows about a typed email. That endpoint has no login, the
share token is its only gate, and links get forwarded freely, so it would hand
anyone holding a link a co-writer's legal name, IPI, PRO, publisher and phone
for the price of guessing an email. IPI numbers are what royalty claims are made
with. Put to the founder with three options; **he chose device-local**, so there
is no server lookup and nothing to harvest. The cost is that switching devices
means retyping, which is the right trade.

**The field list is the feature, and what is absent matters more than what is
there.** `lib/credit-prefill.ts` remembers identity, contact, publishing and
socials. It NEVER remembers:

- **Either split.** A 50% share on one song says nothing about the next, and a
  silently pre-filled ownership share is the most dangerous autofill this domain
  has — it could file a claim nobody typed. A hard line, not a trade-off.
- **Roles.** They change per song AND drive which splits are required, so a
  wrong prefill nobody notices files a wrong credit and demands the wrong
  number.
- **"What you did"**, which is about this song.
- **The accuracy tick**, an attestation about THIS submission. It has to be
  ticked again or it means nothing.

Mutation-tested: adding splits and roles to the list fails five tests across the
constant, the picker, the merge and the round trip.

**Three mechanisms worth knowing:**

1. **The notice is a mitigation, not polish.** Arriving at a PUBLIC form that
   already knows your legal name is unsettling with nothing explaining it, and
   on a shared studio or cafe machine the reader may not be the person it
   remembers. So the form says whose details it filled in and offers "Not you?
   Start fresh". The six-month age cap is the backstop for the machine nobody
   comes back to.
2. **It reads in a PRE-PAINT layout effect** (`useIsomorphicLayoutEffect`, the
   `/onboarding` saved-draft precedent), not a plain `useEffect`: this page is
   server-rendered, so the empty form is already on screen and a post-paint read
   would show blank fields for a frame and then fill them. Reading during render
   instead would be a hydration mismatch, so a setState in an effect is
   unavoidable here. Note lint reports no finding only because the rule does not
   track the aliased hook — the pattern is still setState-in-effect.
3. **"Fill it in for someone else" clears the notice but does NOT forget the
   stored details.** A different person is about to type, so the form must go
   blank — but those are the first person's own details on their own device, and
   they may want them on the next release. Two different things that look like
   one.

Storage goes through `lib/persisted-state.ts`, whose reads are already guarded
(version, age, validator, try/catch) but whose **writes are not** — `setItem`
throws on a full quota and in Safari private mode. Wrapped, because remembering
details is a convenience that must never break a submission that already
succeeded. First public page in the app to touch localStorage at all.

**Changelog: shipped as v1.4.1** (2026-08-27). It landed after v1.4.0 had already
gone out, so it got its own patch entry rather than being folded backwards into
a released version — the ledger is a log, and rewriting a shipped entry would
falsify it.

**Not verified:** no real prefill has happened. The round trip is covered by 26
unit tests against a stubbed localStorage (vitest runs node-only here and jsdom
is not a dependency), but nothing has run in a browser.

**Not verified:** no real submission has been exported. The button needs an
authenticated session with real rows, which this environment cannot mint.

**The two adjacent findings this pass flagged were fixed the same day** (founder
request), and both are invisible in production because the flag is on — no
changelog entry or version bump, per the flag-off precedent:

1. **`GET/PATCH /api/releases/[releaseId]/metadata` is gated now.** It was the
   one handler on the metadata surface with no flag check, so a direct call could
   read and write a release's distribution fields while every UI entry point to
   them was dark. The reader is defined locally rather than imported from the
   credits group's `_shared.ts`, matching how `predict-genre/route.ts` owns its
   own — route groups read their flags themselves. **The body is exactly
   `'Not found.'` on purpose**, because `isFlagGateOff` matches that string to
   tell "feature off" apart from `ensureReleaseOwnership`'s `'Release not
   found.'`; the two Chappi metadata tools now translate it into a plain refusal
   instead of telling the user their release does not exist (the `create_note`
   precedent, three call sites — `update_release_metadata` needs it on both its
   read-then-merge GET and its PATCH).
2. **`'metadata'` is flag-conditional in `SCENE_PREFETCH_ORDER`.** Adding the
   gate above would have made the idle prefetch fire guaranteed 404s — but it was
   already broken before that: the metadata fetcher hits `/metadata` AND
   `/credits`, `/credits` has always 404'd with the flag off, and `readJson`
   **throws** on a non-ok response. So with the flag off that prefetch already
   spent two requests per scoped release and then threw. It now joins
   calendar/capture/song/coverart in being conditional, which is what the
   prefetch list's own comment says the pattern is for. Mutation-tested: making
   it unconditional again fails the prefetch test.
3. **The account data export now carries `credit_links` and
   `credit_submissions`.** These are the publishing details a manager most needs
   in hand for a distributor handoff (legal names, IPI and PRO numbers,
   publishers, both splits), and they were the one part of a release that
   deleting the account would destroy and the export did not hand back. Keyed on
   `release_id` like the other release-scoped tables. `share_token` is
   deliberately not redacted — `REDACTED_KEYS`' own comment already anticipated
   credits: it is the user's own link and the export is useless without it. The
   route's guard test still passes, so the open-route auth and the `select('*')`
   rule are intact.

**`predict-genre` was deliberately left alone.** It gates on its own
`NEXT_PUBLIC_FEATURE_GENRE_PREDICTION` (off by default), its comment already
records that it is "only meaningful alongside `NEXT_PUBLIC_FEATURE_METADATA`",
and there is no UI path to it when metadata is off. Worth one line if anyone ever
turns genre prediction on independently.

---

## Invite acceptance is durable now: the deferred claim (2026-08-29, v1.4.2)

Founder report: a teammate used an invite link and created an account, but the
founder could not assign him a task and was unsure he could see the workspace's
releases. **One root cause, both symptoms: the account existed and the
`workspace_members` row did not.** The accept page (`/invite/accept`) creates
the ACCOUNT first and joins the workspace SECOND, and nothing recorded the
pending join — so any failure between the two steps (a dropped request on weak
mobile data, the documented failure mode of this user base; a lost OAuth resume
marker; a no-session signup while email confirmation is on, which the auth
store swallows without throwing) left an account that belonged to no team, with
nothing that would ever retry. Everything downstream was verified correct and
untouched: the assignee picker's selectability rule, the PATCH assignee
validation, `releaseOwnerIds` visibility — all of them key off the membership
row that was never written.

**The fix is a durable claim, the `activatePendingWorkspaceInvitesForUser`
pattern applied to token invites.** The accept page's email/password signup now
stashes the invite token in `auth.user_metadata.pending_invite_token` (via a
new optional `options` param on the auth store's `signup`), and
`loadWorkspaceAccessContext` finishes the join on the user's first
authenticated request, whatever path brought them back into the app.

**Five things worth knowing before editing this:**

1. **`lib/invite-claims-server.ts` is the ONE implementation of the join, and
   it is deliberately LEAF-ONLY** (the `lib/seats-server.ts` rule, restated in
   its header): it is imported by `lib/tasks-server.ts` AND by
   `app/api/invites/[token]/route.ts`, which hand-rolls its auth to stay off
   the paywalled `_shared/auth` chain. The route's POST is now a thin mapper
   over `claimWorkspaceInvite` — `joinWorkspaceViaLink` and the legacy
   member-row accept moved into the lib verbatim. Do not grow a second copy of
   join semantics in the route again; the GET keeps its own row lookups
   because metadata display is not a join.
2. **The deferred claim costs ZERO queries on the steady state.** It rides
   `loadWorkspaceAccessContext`'s existing `Promise.all` and bails on a pure
   metadata read (`readPendingInviteToken`) — the key is absent for everyone
   who is not mid-recovery, and that function tolerates every shape a
   user-writable `user_metadata` can hold (unit-tested).
3. **The metadata is cleared on every TERMINAL outcome** (joined, already a
   member, invalid, expired, used, seat-refused) via
   `auth.admin.updateUserById` — GoTrue shallow-merges `user_metadata`, and a
   null value removes just this key. Only a transient query error keeps it, so
   the next request retries. The user object read by `getAuthenticatedUser` is
   fetched fresh from GoTrue per request (not decoded from the JWT), so a
   cleared key never re-triggers.
4. **Claim semantics are byte-compatible with the route's long-standing
   behavior**, including the two easy-to-lose details: the legacy per-email
   kind runs NO seat check (an 'invited' row already occupies a seat, counted
   at mint), and "already used" answers before "expired" — an invite you
   already hold is used, not expired. `resolveLegacyInviteClaim` is the pure,
   unit-tested encoding of that ordering.
5. **The accept page stopped lying on the two failure shapes.** A no-session
   signup (email confirmation) now says the join completes at next sign-in —
   which the deferred claim makes TRUE — instead of surfacing "Sign in to
   accept this invite." as an error; a failed accept POST after a successful
   signup appends the same reassurance instead of reading like a dead end.

**Recovering an ALREADY-stuck teammate needs no code at all**, and both paths
predate this fix: (a) invite them by email from Settings → Teammates using the
exact address they signed up with — `activatePendingWorkspaceInvitesForUser`
activates the pending row silently on their next dashboard load; or (b) have
them reopen the same join link while signed in and press "Accept and join"
(link-kind invites are multi-use).

- **Verified:** 1550 tests (21 new in `lib/invite-claims-server.test.ts`),
  `eslint .` at the exact 3-error/68-warning baseline (the one new
  react-compiler warning was avoided by turning two trivial `useMemo` string
  fallbacks on the accept page into plain consts), `next build` green by exit
  code with `/auth`, `/onboarding`, `/settings` still `○ Static`.
- **Not verified:** nothing has run against a real database or a real signup —
  this sandbox cannot mint a Supabase session or reach app.urganize.app. The
  claim's DB plumbing is exercised only through the route it was extracted
  from; worth one live pass: sign up from a join link with the network throttled
  so the accept POST fails, then sign in and confirm the workspace appears.

---

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel — monorepo, TWO projects from this one repo:
  - `Web` → https://app.urganize.app (builds `apps/web`)
  - `the-urganization` → https://www.urganize.app (builds `apps/homepage`; **`www.urganize.app` 308s to the bare `urganize.app` apex** — this line said the reverse until 2026-08-13, when a post-deploy health check measured the real chain: `www` → 308 → apex → 200. The "reconcile that doc" note under the URG-118 section is now discharged.)
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
- **`v1.0.0` SHIPPED 2026-08-24 (founder call).** It was reserved for AI activation, and the founder called that met once UrgAns was running on a real tool-calling model in production (RodiumAi, `openai/gpt-4o-mini` — see the AI integration section). Note the planner and the status generator are still behind their own flags, so "AI activation" was judged on the assistant, not on all three surfaces; if either flag is flipped later it is an ordinary minor bump, not a second 1.0.
- **Bump rules (from 1.0 on):** patch (`1.0.x`) = fixes/polish; minor (`1.x.0`) = new user-facing feature(s); major = a breaking change. Before 1.0 the middle number was the feature counter and the same rules applied one place to the right.

### Release procedure (how to ship a version)

When shipping a **user-facing app change** (a new feature, visible behavior change, or bug fix in `apps/web` that a user of the product would notice):

1. Add a release entry at the **top** of `changelog` in `packages/changelog/src/index.ts`: `{ version, date, highlights }`. Bump `version` per the rules above; `date` is a display string (e.g. `"July 13, 2026"`). Batch same-day changes into one entry rather than minting a version per commit.

   **Voice rules for `highlights` (founder call, 2026-08-24 — the v0.61.0 entry was rejected as "too bogus and technical" and rewritten):**
   - **A fifth grader has to understand it.** Short everyday words. If a sentence needs a second read, rewrite it.
   - **Straight to the point.** One or two short sentences per highlight, and few highlights. Do not explain the mechanism, the trade-off, or the reasoning — say what the user can now do. The pre-2026-08-24 entries are the wordy house style this rule replaces; leave them as the historical record and do not copy their tone.
   - **Say "you", not "users" or "your team can now".** No jargon, no file names, no flag names, no feature-branding.
   - **NEVER put a marketing-site (`apps/homepage`) change in here.** This is the in-app announcement, and it covers the product app only. The app-only scope rule under Versioning already said so and it was broken anyway on v0.61.0 (a pricing-page bullet), so treat this as the second, louder statement of the same rule: if the change is on urganize.app rather than app.urganize.app, it does not go in the ledger at all.
2. Set every `package.json` `version` (root + all workspaces) to the new number.
3. That's the whole ceremony — no git tag, no separate CHANGELOG.md. Production still deploys continuously from `main`; the ledger renders publicly at `/changelog` with a "current version" badge.

Skip internal-only work (refactors, dependency bumps, test/tooling, docs) AND all marketing-site (`apps/homepage`) work, however visible on the site: neither earns a ledger entry, and neither requires a version bump (see the app-only scope rule under Versioning). gstack `/ship`'s version step now **applies** here (steps 1–2 above) rather than being skipped, but only for `apps/web` changes; PR titles still use plain conventional-commit prefixes (no `vX.Y.Z` prefix).
