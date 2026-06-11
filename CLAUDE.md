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

- **For protected routes**, validate auth + payment gate in one call via `requireActiveAuthenticatedUser(request)`. The canonical definition lives in `apps/web/app/api/_shared/auth.ts` (alongside `getAuthenticatedUser` and `createAdminClient`); `releases/_shared.ts`, `tasks-server.ts`, and `ui-drafts/_shared.ts` re-export it so domain import sites stay stable. It wraps `getAuthenticatedUser` and adds a `requireActiveAccount(userId, email)` check that returns **402** + `{ redirect: '/locked', reason }` when the user lacks active paid/trial access. Email allowlist short-circuits before any DB read.
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
- **Payments:** Paystack. Two flows: (1) in-app inline checkout via `react-paystack` (`components/PaystackButton.tsx`) → server verification at `api/payments/verify`; (2) standalone Payment Page at `https://paystack.com/pay/a2dq-qpyri` (flat ₦15,000 access SKU) reached via the vanity URL `https://urganize.app/pay` (302 redirect at `apps/homepage/app/pay/route.ts`). The webhook at `api/webhooks/paystack` validates HMAC-SHA512 and credits both flows on `charge.success`: in-app payments match by `payments.reference`; standalone-page payments match by `customer.email` against `profiles.email` when amount equals 1,500,000 kobo.
- **Analytics:** PostHog (browser + node) in `apps/web`. Vercel Analytics in both apps. Google Analytics in homepage. Formbricks survey provider in homepage.
- **Customer support:** WhatsApp deep link to the founder (`https://wa.me/2347067367057`) via the floating pill in `apps/web/components/support/SupportChat.tsx`. The label cycles "Chat with the founder" / "Report a bug" / "Contact support". Replaced the former Tawk.to widget (2026-06-11); the `NEXT_PUBLIC_TAWK_*` env vars are retired.

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

---

## Resolved v1 blockers

All seven blockers identified during the v1 cut have been resolved.

1. **Subscription gating implemented and globally on** — Four-state access model (`unpaid | trial | paid | expired`) computed by `getSubscriptionSnapshot` in `apps/web/lib/subscription-access.ts` from `subscriptions.status`/`expires_at` + new `profiles.trial_*` / `paid_at` columns + `is_subscribed` back-compat. `requireActiveAccount(userId, email)` returns **402** + `{ redirect: '/locked', reason }` when blocked; wrapped by `requireActiveAuthenticatedUser` and applied to ~30 protected routes. Open routes (auth, payments/verify, webhook, trial/start, subscription-status, paywall-status, admin/*, account/delete-now, user/onboarding, pricing-validation) keep `getAuthenticatedUser`. 28-day no-card trial via `POST /api/trial/start`. `/locked` page with Pay ₦15,000 + Start 28-day trial buttons (`apps/web/app/locked/page.tsx`). Frontend `window.fetch` monkey-patch in `apps/web/lib/access-redirect.ts` redirects same-origin 402 responses to `/locked`. 6-email allowlist at `apps/web/lib/paywall-allowlist.ts` bypasses the gate entirely (lowercased + trimmed comparison, logs `[paywall-allowlist]` on bypass). Vanity payment URL `urganize.app/pay`. The legacy `app_settings.global_paywall` toggle is no longer consulted; the snapshot fallback is now fail-CLOSED. → `f71a7c9` (initial), `02efe0b` (full gating + vanity URL, PRs #46, #47).
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
- **Zuplo gateway routing configuration** — currently routes to `qwen2.5:3b`, which is insufficient for structured-JSON tailoring. Needs Claude Sonnet for Phase 5 tailoring and Claude Haiku for Phase 6 status updates. The provider layer accepts a per-call model override (`AI_TAILORING_MODEL`), so once the gateway serves Claude, no application code change is required to switch models.
- **Estimated monthly cost at v1 scale** — 1 paying user, 2 design partners, ~12 tailorings + ~24 status updates per month: under $1/month.

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

**Phase 4 — Event milestone rendering.** Tasks with `type: 'event_milestone'` in their template metadata render differently from regular tasks: a calendar icon, a `status-info` left-border accent, and an "On <date>" label instead of the "Due ..." framing, plus an "Event" pill in the task drawer. The read path was fixed so `metadata.template.task_type` surfaces on the `Task` model (`isEventMilestone` helper). ✅ Complete.

**Phase 5 — AI rollout planner.** Code complete and gated behind `NEXT_PUBLIC_FEATURE_TAILOR_PLAN` feature flag. Migration applied to production (`release_context` and `ai_tailoring_response` columns on releases). Activation pending: (1) Anthropic API key configured, (2) Zuplo gateway routed to Claude Sonnet for the tailoring endpoint (currently routes to `qwen2.5:3b` which is insufficient for structured JSON tailoring). Once both are in place, set the feature flag to true and verify end-to-end with a real release.

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
- **File storage rescued + re-homed per-release.** The `AssetSection` component + its release-scoped fetcher (`GET /api/releases/[releaseId]/assets`) and `AssetUploadControl` were already per-release (the `assets` table has a `release_id` FK; the legacy `/dashboard/tasks` page never owned files at any revision). Re-homed into the workspace via a new `components/workspace/FilesPanel.tsx` that renders inside the right column under the tasks panel: scoped → reuses AssetSection verbatim; unscoped → "Select a release to see its files." hint. FilesPanel owns its own toast state; remount via `key={scopedRelease?.id ?? 'unscoped'}` resets cleanly between scopes.
- **Bucket headers collapsible.** `TasksPanel` buckets each render a real `<button aria-expanded aria-controls>` with a `lucide ChevronDown` that rotates `-rotate-90` when collapsed. Default state: Overdue open, everything else closed. Per-session per-bucket state via `useState`. When scope changes, buckets with matches auto-expand (via the "Adjusting state when a prop changes" pattern — `setState` during render with a `prevScopeId` guard, no `useEffect`, no new lint warnings).
- **Slim panel row variant.** `TaskRow` got a `density?: 'compact' | 'comfortable'` prop (default comfortable; release detail page keeps its existing layout). Compact: two stacked lines (checkbox + truncated title with `title=` hover, then priority dot + date + lock/milestone icon), no status badge / no assignee / no release pill, priority signal kept via `getPriorityBorderClass` left border. Spacing pass: GreetingHeader eyebrow normalized to `tracking-[0.16em]` + `mt-2` gap to match the rest of the workspace; `space-y-6` wrapper between TasksPanel and FilesPanel removed so the canonical `mt-8` section gap is the single source of spacing; FilesPanel unscoped section also given `mt-8` to match.

**What exists post-UI-cut:**
- **Pages (4 + modals):** Dashboard (greeting, release cards, due-soon tasks), Releases list, Release detail (header, task progress, task list, status update placeholder), Settings (profile, teammates via workspace members, subscription). Modals: CreateReleaseModal, TaskQuickCreateModal, TaskDetailDrawer.
- **Sidebar nav:** Dashboard, Releases, Tasks, Settings. No descriptions, no Team page.
- **API routes:** releases (CRUD, metadata, collaborators, playbook, steps, task-groups, tasks), tasks (CRUD, attachments, comments, reorder), payments/subscriptions, auth, admin, notifications, onboarding, workspace members, ui-drafts.
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
  - Email allowlist verified end-to-end via `apps/web/lib/paywall-allowlist.test.mts` (15-case runtime check).

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

Dark mode + green brand is the established theme. **Use the existing token roles** in `packages/config/tailwind/preset.js` (defined as CSS vars in `apps/web/app/globals.css`). Do not introduce new CSS variables.

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

ReleaseCard selected = `border-brand` + `bg-brand/8` (already available via the `brand.subtle` 8% alpha role in the preset). Progress bar = 4px track in `bg-bg-elevated`, fill in `bg-brand`. Priority dot uses the existing helpers `getPriorityDotClass` / `getPriorityBorderClass` from `lib/tasks.ts` (already wired to the canonical priority union). Overdue bucket label uses `text-status-error`.

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
- **`profiles.artist_name`** is retired as an artist source. The legacy "Artist profile" editor in Settings writes to it but no longer feeds any new code path. **The column still has four live readers** (`components/support/SupportChat.tsx`, `app/api/admin/pricing-validation/route.ts`, `components/onboarding/FirstTimeOnboardingGate.tsx`, plus the read-gate at `lib/auth-store.ts:454`). The column drop is staged in `supabase/migrations/99999999_artists_workspace_cleanup_DO_NOT_APPLY_YET.sql` and gated on those four readers being removed first.
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

**Auth consolidation (the flagged refactor):** canonical `getAuthenticatedUser` / `requireActiveAuthenticatedUser` / `createAdminClient` now live in `app/api/_shared/auth.ts` (best-variant semantics: trimmed env reads, detailed 401 messages, static `requireActiveAccount` import). `releases/_shared.ts`, `lib/tasks-server.ts`, `ui-drafts/_shared.ts` re-export all three; `pricing-validation/_shared.ts` re-exports only `getAuthenticatedUser` + `createAdminClient` (open route group). Route files were not touched — re-exports keep every import site stable. Do not re-introduce per-domain copies.

**Also:** root `.nvmrc` pinning Node 20.

---

## Marketing site truth + funnel pass (2026-06-11, apps/homepage)

A design/marketing review found the homepage misrepresenting the product and gating a live, paying product behind a waitlist. The fixes, in order of importance:

- **Funnel unified.** Every marketing CTA now goes to `app.urganize.app/auth` ("Start free for 28 days · no card required"). The waitlist modal/button were deleted; `POST /api/signup` remains (admin growth dashboard still reads the waitlist table) but has no UI caller. If a pre-launch waitlist is ever needed again, build it as a new surface — do not resurrect the old gate on the homepage.
- **Stale product imagery removed.** The old dashboard/playbook screenshots showed retired UI (Notes/Pre-save/Folders sidebar, readiness scores, credits machinery). Replaced with `TemplatePlanSection` — real rows quoted verbatim from `apps/web/lib/release-templates/single.ts`. **Rule: marketing screenshots must show the current app; when no current screenshot exists, render real product data as type instead.** OG image now falls back to the branded card at `app/opengraph-image.png` (file convention; do not re-add explicit `openGraph.images` pointing at stale UI).
- **/features rewritten** as a server component around actual v1 scope (template plans, tasks+dependencies, files, milestones, visibility + the "what we don't do" grid). The old page sold an adaptive AI-guidance product that was never built — the exact failure mode the "AI is a removable polish layer" principle forbids. The pricing-page honesty rule ("we don't advertise what isn't built") now applies to all marketing copy.
- **One nav, one footer.** `app/components/marketing/MarketingHeader.tsx` + `MarketingFooter.tsx` are used by home, features, pricing, team, and press. No more per-page pill navs or divergent footers. New marketing pages must use these.
- **Orphan purge + asset hygiene.** 14 dead components (waitlist, Mockups, FAQ, FounderPOV, FoundingCouncil, old landing cards) and ~11.4 MB of unused/stale images deleted (`public/images` now holds only the wordmarks + anchor-partner logo). Metadata/keywords swept of cut features ("versioned asset storage", "pipeline … demo to drop", "music credits").
- **Follow-up status:** Real workspace screenshots landed 2026-06-11 (staged by the founder; `public/images/product/workspace-releases.png` + `workspace-tasks.png`, shown in `WorkspaceShotSection` and inside `TemplatePlanSection`) — retake them whenever the UI meaningfully changes. Testimonial now credits Adenaiye Miracle (Artist Manager) with permission; the quote is her verbatim words — never publish words she hasn't approved.

---

*Last updated: 2026-06-11.*
