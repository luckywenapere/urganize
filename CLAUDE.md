# CLAUDE.md

This file is the source of truth for AI coding assistants working in this repository. Read it before making any structural decisions. If anything here conflicts with what you find in the code, this file wins for *intent*; the code wins for *current reality*. When they disagree, surface the conflict rather than silently picking one.

---

## What Urganize is

Urganize is operational infrastructure for music industry teams. The product being built right now is **v1**: a release management workspace.

**Target user for v1:** an independent music manager handling 1–3 artists, planning their next release in the next 90 days. Not labels, not enterprise teams, not artists directly. The independent manager is the ICP.

**The central object is the release.** Every feature, every data model, every UI surface in v1 should answer the question: *how does this serve a release?* If a feature can't tie back to a specific release, it does not belong in v1.

**The product thesis:** the music industry runs on chaos. Tribal knowledge, scattered group chats, spreadsheets, and one overworked person holding every release together. Urganize is the system of record for the release — where the plan lives, where the work happens, where the team sees status. AI helps where it's genuinely useful; templates carry the domain knowledge.

---

## v1 scope (hard list — do not exceed)

The six features that constitute v1:

1. **The release object** — date, type (single/EP/album/music video), artist, team, status, lifecycle state.
2. **AI-generated release rollout plan from hand-crafted templates** — templates are static, hand-written, and version-controlled. AI adjusts a template into a tailored plan based on release context. The plan is editable by the user before commit.
3. **Tasks with assignees and dependencies** — generated from the template, editable, reorderable, with status and priority.
4. **File/asset attachment to releases** — artwork, masters, contracts, split sheets, and similar release artifacts. Stored in Supabase Storage (`release-assets` bucket).
5. **Lightweight event milestones inside a release** — listening party, video shoot, release day. Dated points on the release timeline. Not a standalone event management feature.
6. **AI status update generator** — reads current release state, produces a one-paragraph narrative status the user can send to the artist, the label, or the team.

**Out of scope for v1, no exceptions:**

- Standalone events (events not tied to a release)
- Notes / idea capture / voice memos / track ideas
- Folders as a feature
- Royalty splits / split sheet automation beyond storage
- Sync licensing
- Merch
- Touring / live show coordination
- Native mobile apps (iOS, Android)
- Third-party music platform integrations (DistroKid, Spotify, Apple Music, Instagram, etc.)
- Notifications inbox (transactional email is fine; in-app inbox is v2)
- Analytics dashboards
- User-configurable customization (custom statuses, custom roles, custom release types)
- Pre-save campaigns
- Listener profile generation
- Credit submissions / shareable credit links
- AI chat / general-purpose AI assistant
- Track / song library as separate entities (assets cover this for v1)
- Collaborators directory as a standalone feature (assignees on tasks is enough)

When a feature request lands that's on this "out of scope" list — even if it's a small ask, even if a user wants it — the answer is *v2*. Do not add it to v1 to be helpful. The discipline of saying no is the product strategy.

---

## Architectural principles

These are the principles that govern v1 build decisions. When in doubt, return to these.

1. **The release is the spine.** Every feature serves a release. If you find yourself building something that doesn't tie back to a specific release, stop and ask whether it belongs in v1. The release detail page is where the product converges — Dashboard, Releases list, and Tasks are navigational surfaces; the work happens on the release detail page. New features attach to the release, not to standalone surfaces.

2. **Templates carry domain knowledge; AI is a removable polish layer.** Hand-crafted release templates are the product's IP. AI adjusts them and writes prose around them. If AI failed tomorrow, the product would still work — users pick a template, get a plan, edit it, run their release. Build it so AI is *removable* without the product dying.

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

**Node runtime:** Node 20+. Vercel default in prod. (No `.nvmrc` pinned — consider adding one.)

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

**v1 tables in web (post-reconciliation):** `profiles`, `releases`, `release_metadata`, `release_events`, `release_playbook_steps`, `release_collaborators`, `release_workspaces`, `collaborators`, `tasks`, `task_groups`, `task_activity`, `task_attachments`, `task_comments`, `assets`, `activity_logs`, `workspaces`, `workspace_members`, `organizations`, `organization_members`, `subscriptions`, `payments`, `app_settings`, `notifications`, `ui_state_drafts`, `pricing_validation_responses`, `artists`.

---

## Authentication

**`apps/web`:** Supabase Auth (email/password + Google OAuth).
- Client: `apps/web/lib/supabase/client.ts`.
- Session and profile state: Zustand store at `apps/web/lib/auth-store.ts`, persisted to localStorage.
- The auth store rebuilds a fallback `Profile` from `auth.user_metadata` when the `profiles` row is missing or RLS-blocked.
- **No Next.js `middleware.ts`** — protection happens per-route via `getAuthenticatedUser(request)` from `apps/web/app/api/releases/_shared.ts`. This reads `Authorization: Bearer <token>` and validates against the Supabase anon client.
- Server-side privileged operations use the **service-role key** via `createAdminClient(supabaseUrl)`. Only use this when bypassing RLS is required *and* the request is already authorized.

**`apps/homepage`:** Lightweight shared-secret cookie auth for admin/growth views only (`lib/dashboard-auth.ts`). SHA-256 of `ADMIN_WAITLIST_TOKEN` against an httpOnly cookie. Not a real auth system.

**User roles in web:** `artist | manager | artist-team | artist-manager | team-member | viewer`.

---

## API layer

REST-style Next.js Route Handlers at `app/api/**/route.ts`. No tRPC, no GraphQL.

**Patterns to follow:**

- Validate auth via `getAuthenticatedUser(request)` at the top of every protected route.
- Each domain has a `_shared.ts` (e.g., `releases/_shared.ts`) holding table-name constants, error detection helpers, and shared logic.
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

- `apps/web`: Tailwind v3 + autoprefixer. Theme forced dark via pre-hydration inline script reading `urganize.theme`.
- `apps/homepage`: Tailwind v4 via `@tailwindcss/postcss`. Custom typography via four `next/font/google` families.
- Shared Tailwind preset at `packages/config/tailwind/preset.js`.

**Component library:** In-house. Shared primitives in `packages/ui/src/`. Feature components in each app's `components/`. Icons: `lucide-react` + `react-icons`. Animations: `framer-motion`. Charts on homepage admin: `chart.js`.

**Root `layout.tsx` in `apps/web` is a client component.** This forces the whole tree client-side. Documented limitation — expensive to undo because `AppShell`, `AppSidebar`, etc. rely on Zustand. Live with it for v1; revisit later.

---

## External services

- **Database:** Neon (homepage), Supabase (web).
- **File storage:** Supabase Storage. Buckets: `release-assets`, `proofs`. No S3/R2.
- **Email:** Not wired up yet. Add a transactional provider (Resend or Postmark recommended) when v1 needs email notifications.
- **Payments:** Paystack. Client checkout via `react-paystack` (`components/PaystackButton.tsx`). Server verification at `api/payments/verify`. Webhook at `api/webhooks/paystack` validates HMAC-SHA512 and persists subscription on `charge.success`.
- **Analytics:** PostHog (browser + node) in `apps/web`. Vercel Analytics in both apps. Google Analytics in homepage. Formbricks survey provider in homepage.
- **Customer support:** Tawk.to floating widget in `apps/web/components/support/SupportChat.tsx`.

---

## AI integration

**Provider routing layer:** `apps/web/lib/ai/provider.ts` — handles retry + timeout. Currently routes through a Zuplo gateway (`AI_API_BASE` + `AI_API_KEY`) to a `qwen2.5:3b` model.

**v1 change:** swap the upstream model. Keep the Zuplo gateway routing if useful, but point it at frontier models:

- **Release rollout planner:** Claude Sonnet (latest). Higher quality matters here — the call has to take a hand-crafted template plus release context and produce a structured, edited plan.
- **AI status update generator:** Claude Haiku or equivalent (GPT-4o mini, Gemini Flash). Shorter, simpler, runs more often, lower cost per call.

**Two AI integration points exist in v1. No more.**

1. **Release rollout planner:** Input = a hand-crafted template + release context (artist, type, timeline, budget, team size). Output = a tailored plan (tasks with assignees, durations, dependencies). One API call per release creation. User edits before commit.

2. **Status update generator:** Input = current release state (tasks completed, blocked, upcoming; recent activity; release date). Output = one-paragraph narrative status. One API call per request, a handful per release per week.

**Removed in the v1 cut:** AI chat (`api/ai/chat`), the old AI release plan generator, `services/mock-ai.ts`, `useAIStore`.

**Architectural rule:** AI is a *layer on top of templates*, not a substitute for them. The product must work — degraded but functional — if AI is unavailable. The template alone produces a valid plan; AI just tailors it. The structured release data alone produces a valid status view; AI just narrates it.

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

**Tests:** None configured. Adding tests means setting up a runner. For v1, prioritize manual testing of critical flows (release creation, template → tasks generation, file upload, AI calls). Automated tests are a v2 investment.

**Naming:**

- Components: PascalCase `.tsx` (`ReleaseHeader.tsx`, `TaskDetailDrawer.tsx`).
- Hooks: camelCase, `use*` prefix.
- Stores: `use*Store` in `apps/web/stores/`.
- Route handlers: always `route.ts`. Per-domain helpers in `_shared.ts`.
- DB columns: `snake_case`. TS types for DB rows: `camelCase`. (Legacy `Db*` prefixed types were removed — they drifted from the schema and were unused.)

**Server patterns:**

- Validate auth via `getAuthenticatedUser` first.
- Use `createAdminClient` only when RLS bypass is needed and the request is already authorized.
- Long-running AI calls through `lib/ai/provider.ts` — do not roll your own.
- Stick to shared primitives in `packages/ui` across apps.

---

## Resolved v1 blockers

All seven blockers identified during the v1 cut have been resolved.

1. **Subscription gating implemented** — `resolveSubscriptionSnapshot` checks `status` + `expires_at`; `hasAccess` delegates to the snapshot; `requirePaidAccess` checks the `app_settings` paywall toggle. Paywall off by default, toggleable via `POST /api/admin/paywall`. → `f71a7c9`
2. **Paystack webhook persistence added** — `charge.success` handler looks up the payment by reference, upserts `subscriptions`, and sets `profiles.is_subscribed = true`. Idempotent via upsert on `user_id`. → `6ed3125`
3. **`activity_log` / `activity_logs` deduplication completed** — v1 cut migration migrated data from `activity_log` (singular) into `activity_logs` (plural) and dropped the old table. → `d23dfea`
4. **`Db*` type drift removed** — `DbRelease`, `DbTask`, `DbFile` deleted from `lib/supabase/client.ts`. `Profile` type kept (used by analytics). → `77a29bf`
5. **`.env.example` files created for both apps** — every `process.env` var documented, grouped by category, marked required/optional. Cross-checked against `turbo.json` env allowlist. → `d34f2ef`
6. **`bfg.jar` removed** — deleted the 14 MB JAR and its `.gitignore` entry. → `e896cea`
7. **Schema reconciliation completed** — `20260525034856_schema_reconciliation.sql` applied 2026-05-25. Backfilled 20 tables into migrations, dropped 6 dead tables and 17 dead columns, tightened NOT NULL constraints on `tasks.release_id` and `task_groups.release_id`, added RLS policies across 10 tables. Database and migration files now in sync.

---

## Known issues (acceptable for v1, address later)

These are real but not blockers:

- **Two unconnected databases** (Neon for homepage waitlist, Supabase for web). Identity unification is expensive and not v1.
- **React 19 migration is incomplete.** Two `react-hooks` lint rules downgraded to warn. Live with this in v1.
- **Tailwind v3 (web) vs v4 (homepage) mismatch.** Shared `packages/ui` styles don't fully port between apps. Acceptable for v1.
- **Root `layout.tsx` in web is a client component.** Documented architectural compromise. Don't try to undo this in v1.
- **Outdated top-level docs** (`README.md`, `PROJECT_SUMMARY.md`, `QUICKSTART.md`) reference an old single-app, npm-based, pre-Neon setup. Treat them as historical. Update or delete them when convenient.
- **RLS on subscriptions and payments uses permissive `USING (true)` policies** inherited from production. This matches the prior state but is overly permissive. Audit client usage and tighten to owner-only reads + service-role writes as a follow-up.
- **Possible duplicate artists:** 6 releases across 2 users have 6 distinct `artist_id` values. Either expected at small scale, or the artist lookup-or-create flow always creates instead of looking up. Investigate when scale increases or if duplicate-artist issues surface.

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

**Current position:** Phase 3 (file/asset attachment), step 3b (UI on release detail page). Backend complete, UI prompt drafted and ready to send.

v1 is built across six phases. Each phase corresponds to one of the v1 scope items, with some scope items split across multiple phases when the work is non-trivial.

**Phase 0 — Foundation cleanup.** Schema reconciliation, UI cut to remove stages-era surfaces, removing dead code from earlier product iterations. ✅ Complete.

**Phase 1 — Template-driven task generation.** Release object CRUD, hand-crafted single release template (v0.3, 64 tasks across 11 weeks), template-to-tasks instantiation function, wired into release creation flow. ✅ Complete. Three releases (For Love, Free, Hello) successfully generated 64 tasks each in production.

**Phase 2 — Core flow integrity.** Tasks with assignees (PATCH endpoint fixed, workspace-membership validation, assignee picker working), task visibility model corrected from assignee-based to workspace-based with Mine toggle, dependency UI (read-only visibility, blocker message surfacing, locked-task visual treatment, persisted auto-unlock cascade), task completion UX (row checkboxes routing through `completeTask` with blocker check, drawer Status dropdown as deep-edit path, reopen-as-toggle), drawer loading performance fix, dropdown layering and contrast fixes. ✅ Complete.

**Phase 3 — File/asset attachment.** Release-scoped file storage in Supabase Storage with signed URLs. Three sub-steps:

- **3a:** Backend API (upload-url, list, record, delete routes; asset-helpers module). ✅ Complete.
- **3b:** UI on release detail page (asset section, upload control, category groups, image thumbnails). ← **In progress.**
- **3c:** Polish (cleanup vestigial buckets, deprecate `release_metadata.artwork_url` reads, delete `WorkspaceSection.tsx` dead code). Pending — non-blocking.

Constraint: Supabase Free plan caps individual uploads at 50 MB. Category size limits configured in `asset-helpers.ts` accordingly (40 MiB audio/video, 10 MiB documents, 5 MiB images).

**Phase 4 — Event milestone rendering.** Tasks with `type: 'event_milestone'` in their template metadata render differently from regular tasks. Visual distinction (icon, date pill, treatment). Backend already generates milestones correctly via template instantiation; UI just needs to differentiate. Small scope. Not started.

**Phase 5 — AI rollout planner.** Reads release context (artist scale, marketing budget, etc.) and tailors the template at instantiation time — drops optional tasks based on context, adjusts post-release content cadence based on artist scale, etc. The hand-crafted template carries the domain knowledge; this AI layer is the removable polish. Uses frontier model via Zuplo gateway (Claude Sonnet). Not started.

**Phase 6 — AI status update generator.** Button on release detail page that reads release state (task completion, blockers, upcoming work, attached files, dates) and generates a paragraph status update the manager can copy to send to artists, labels, or collaborators. Uses Claude Haiku via Zuplo. Not started.

After Phase 6, all six v1 scope items are shipped. Internal use continues throughout — the founder runs his own two artists' releases through the product, and the design partners exercise the workspace flow.

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

**Current build phase:** Phase 3 (file/asset attachment), step 3b (UI on release detail page). Phases 0, 1, and 2 are complete; Phase 3a (backend API) is complete; the 3b UI prompt is drafted and ready to send. See the build sequence section above for the full phase map and what's still ahead (Phase 4 event-milestone rendering, Phase 5 AI rollout planner, Phase 6 AI status update generator). Internal use runs continuously throughout — the founder dogfoods on his own two artists' releases.

**What exists post-UI-cut:**
- **Pages (4 + modals):** Dashboard (greeting, release cards, due-soon tasks), Releases list, Release detail (header, task progress, task list, status update placeholder), Settings (profile, teammates via workspace members, subscription). Modals: CreateReleaseModal, TaskQuickCreateModal, TaskDetailDrawer.
- **Sidebar nav:** Dashboard, Releases, Tasks, Settings. No descriptions, no Team page.
- **API routes:** releases (CRUD, metadata, collaborators, playbook, steps, task-groups, tasks), tasks (CRUD, attachments, comments, reorder), payments/subscriptions, auth, admin, notifications, onboarding, workspace members, ui-drafts.
- **Stores:** auth, releases, tasks, activity.
- **Removed from UI:** six-stage release pipeline (StateStepper, ExecutionSection, ReadinessBar, FocusCard), command center framing, readiness scores, full-page release creation form, workspace tasks view (`/dashboard/tasks/all`), standalone team page, organization card. XState release machine (`machines/releaseMachine.ts`) deleted.
- **Release lifecycle:** now implicit — a `status` field (draft/planning/in_progress/ready/released/archived) plus task completion progress. No staged pipeline UI.
- **Workspace members:** used for task assignment; surfaced via Settings → Teammates section. Organization management removed from UI (tables remain in DB).

**Paying users:** 1 (₦5,000/year). 1 contract in legal review (₦100k/year). 1 design partner team meeting scheduled.

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
- Removed: six-stage release pipeline, readiness scores, command center framing, workspace tasks view, full-page release creation, standalone team page, organization card, XState release machine.
- Kept surface: Dashboard, Releases list, Release detail, Settings — plus CreateReleaseModal, TaskQuickCreateModal, TaskDetailDrawer.
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

*Last updated: 2026-05-26. Build sequence restructured into the six-phase map. Current position: Phase 3b (file/asset attachment UI).*
