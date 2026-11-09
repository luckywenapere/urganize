# CLAUDE.md

This file is the source of truth for AI coding assistants working in this repository. Read it before making any structural decisions. If anything here conflicts with what you find in the code, this file wins for *intent*; the code wins for *current reality*. When they disagree, surface the conflict rather than silently picking one.

---

## How this file is organised (2026-10-22)

This file holds only what applies to every session: strategy, principles, the stack, conventions, known issues, how to deploy and version. Everything about one feature (how it works, why, its traps, what was verified) lives in its own file under `docs/notes/`, indexed in `docs/notes/README.md`.

- **Before you touch a feature, read its note.** Search `docs/notes/README.md`, or grep `docs/notes/` for the feature name, flag, route or table name. Notes record traps that the code alone does not show.
- **Text in this file or in a note that says "above", "below", "at the end of this file" or "see the X section"** points at the old single file. Find X by its heading in `docs/notes/README.md`.
- **New feature notes go in a new `docs/notes/YYYY-MM-DD-slug.md` file plus one line in the index**, never as a new section here. Keep this file under about 80,000 characters. Add a rule here only if every session needs it.
- **Read when relevant:**
  - Scope, what is in or out, the sanctioned expansions: `docs/notes/v1-scope.md`
  - AI providers, models, UrgAns transport, the confirmation gate: `docs/notes/ai-integration.md` (and the model router note)
  - Hosting, Vercel limits, crons, the deploy rate limit: `docs/notes/deployment.md`
  - Build phases and current status: `docs/notes/v1-build-sequence-and-current-progress.md`, `docs/notes/working-notes.md`
  - Paywall and billing history: `docs/notes/resolved-v1-blockers.md`, plus the pricing and trial notes

---

## Company strategy comes first (2026-10-02)

**Read `docs/strategy/company-strategy.md` before this file.** It is a copy of the founder's "Urganize Company Strategy & Operating System" (dated 2026-10-01), and that document says of itself: "If another page disagrees with this one, this one wins until it is changed here." So on strategy, who we sell to, pricing, product shape, metrics and priorities, the strategy doc outranks everything below, including the v1 scope list and the architectural principles. This file still governs HOW to build: conventions, guards, deploys, flags, and the record of what was built and why.

The copy is word for word. If the founder's document changes, refresh the copy from it; do not edit the copy on its own. One exception, 2026-10-10: the founder's name changed from Lucky to Oyin and the copy was updated to match on his instruction, so the source document needs the same one-word change to stay word for word. Changes to the strategy itself are agreed at the founder's Monday review and logged in the company's Major Decisions Archive, not decided in a coding session.

**The test a feature has to pass now** (the doc's product rule): it earns a sprint if it moves weekly active paying teams or the second-release rate. "Does it serve a release?" is still a good question, but it is no longer the whole test.

### What the strategy doc changes in this file

1. **Who we sell to.** It supersedes "Target user for v1" below. First: artist managers running more than one artist, small management teams and small labels. Second: independent artists. Rule: sell to the manager, serve the artist, speak to the ecosystem. Nigeria first, priced in naira.
2. **The product has six areas**: Home, Catalogue, Relationships (CRM), Opportunities, UrgAns, Audience. Catalogue and UrgAns exist. Relationships, Opportunities and Audience are not built. **Shows was removed 2026-10-17 (founder call):** every Shows page, API, component, store, UrgAns tool and nav entry (events, setlists, DJ packs, run of show, the songs catalogue) is deleted from the code, `/dashboard/shows*` redirects to `/dashboard`, and the nine Shows tables and their rows and files are KEPT untouched (no migration). Deleting an artist now also deletes that artist's show rows (`deleteArtistShows` in `lib/artists-server.ts`) instead of refusing. **Song upload was removed the same day:** Urganize does not take audio; the team sends the master to the distributor from their own files, and new `audio` asset uploads are refused. **Files went to cover art only the same day (v1.156.3, founder approved mocks "cuts-3"):** `NEXT_PUBLIC_FEATURE_FILES` is forced off in `lib/cut-features.json`, `UPLOADABLE_ASSET_CATEGORIES` is `['cover_art']` (old rows of every category still list; enum unchanged), and the Distribute handoff shows only Cover art and Metadata (`SHOWN_HANDOFF_ITEMS`; `master` stays a key so old records and tasks read). **The standalone press kit was hidden the same day (v1.156.3):** no artist-page bar, Settings fold, search words, post-plan prompt or nav tip; `/dashboard/press-kits*` redirects to Artists. The flag `NEXT_PUBLIC_FEATURE_PRESS_KITS` stays ON because Pitch this! (Copy kit link), the public `/k` pages, directory profile facts and UrgAns kit tools run on it. The artist's short bio and contact email are edited inline in Pitch this!'s About row (`PUT /api/releases/[id]/pitch-kit/artist`, `saveReleaseKitArtist`), which makes the kit on first edit and, when the kit is live, also writes those two sections' `published_content`. Read the Events, Song upload and Shows sections below as history.
3. **Four out-of-scope lines are now committed direction, not v2**, because the strategy doc names them:
   - Sync licensing (part of Opportunities: deals, grants, sync, brands and partnerships).
   - Analytics dashboards (part of Audience: fan capture, streaming and social analytics).
   - Third-party music platform integrations, for distribution ordered inside the rollout (partner: Therealmusicdistro, agreement signed; user price is partner price plus our margin, paid through Paystack) and for the streaming and social data Audience needs.
   - The rest of the out-of-scope list stands until the strategy doc says otherwise.

   Committed is not the same as "build it now". Each still has to earn a sprint under the rule above, and ships behind a flag that starts off, like everything else here.
4. **Group is a plan again** (custom price, for distributors and multi-label groups), and Group teams count as paying teams. The code removed it on 2026-09-09; see the fixes list.
5. **Credits-only accounts are a real way to use Urganize**: no monthly fee, Solo features, ₦30 a credit.
6. **The directory**: search is open to every plan, Solo and trials included; seeded, unclaimed profiles are allowed (built only from credits already on a released release's public credit link, removed on request); and the app asks people to publish their profile right after their first release plan.
7. **Copy**: the doc's one-liner is "Urganize is where music teams do everything after the music is made". Since 2026-10-17 (founder approved, URG-344) the product's own copy says "Urganize is where music teams plan every release and deliver it on time" instead, to follow the homepage v2 hero; the strategy doc copy is left word for word until the founder changes the source. "Interaction app" is internal only and never goes into copy.

### Where the code disagrees with the strategy doc (not fixed yet)

Found on 2026-10-02 by reading the code against the doc. Each is a fix to make, in whatever order the founder sets.

| # | The doc says | The code does | Where |
|---|---|---|---|
| 1 | Solo is one seat | **Fixed 2026-10-02 (v1.59.0).** Solo is 1 seat, which the owner holds, so a Solo account can invite nobody; a team already over it keeps its members and is only refused new ones. The seat and rollout refusal messages now read "1 person" and "1 rollout" | `packages/pricing/src/index.ts`, Solo `limits.seats` |
| 2 | Directory search on every plan | **Fixed 2026-10-02 (v1.59.0).** The `directory_search` entitlement is removed outright rather than set true everywhere, the plan check is gone from `GET /api/directory`, and `tier-limits-guard.test.ts` holds that route to reading no entitlement. The paywall still applies, so a team with no plan and no trial cannot search, and credits-only teams cannot either (their access covers UrgAns only; widening it is a founder call) | `apps/web/app/api/directory/route.ts` |
| 3 | Group is a custom-priced plan | **Fixed 2026-10-02.** Group is back as tier id `enterprise` (name "Group"), sales-led, with Label's entitlements and 1,500 monthly credits, and a fourth "Let's talk" card on the pricing page. A team gets it only through "Mark paid" in `/admin/teams`; see "Group is back" at the end of this file | `packages/pricing`, `lib/entitlements.ts`, `lib/admin-teams.ts` |
| 4 | Anyone can use Urganize on credits alone | **Fixed 2026-10-02.** A team with no plan that holds bought or monthly credits gets the whole app with Solo features (state `credits_only`); at zero it falls back to the wall or read-only and keeps UrgAns to buy more. See "Credits-only teams get Solo features" at the end of this file | `lib/team-billing.ts`, `lib/team-billing-server.ts` |
| 5 | Low-balance warning below 50 credits | **Fixed (#660).** The banner shows below 50 credits (`isLowOnCredits` in `lib/credits/copy.ts`, tested at 49 and 50). Since 2026-10-02 the chat box also shows the balance on every turn while credits are on | `components/app/UrgansUsageStrip.tsx`, `components/chappi/ChappiConversation.tsx` |
| 6 | A credit history page | **Fixed (#660).** `/dashboard/credits` lists spends, purchases, grants, trial removals and admin changes, newest first, one line per turn | `app/dashboard/credits` |
| 7 | Credits ship behind a flag that starts off; the 40 and 150 action limits stay until credits are tested | **Decided 2026-10-02 (founder): credits stay on.** They have been on in production since v1.55.0 and replace the 40 and 150 monthly action limits. Do not switch `NEXT_PUBLIC_FEATURE_URGANS_CREDITS` off to match the doc; the doc's line is out of date, and the founder's Monday review is where the doc itself gets corrected | `NEXT_PUBLIC_FEATURE_URGANS_CREDITS` |
| 8 | "where music teams do everything after the music is made" | **Superseded 2026-10-17 (URG-344):** the core line is now "where music teams plan every release and deliver it on time", founder approved, to follow the homepage v2 hero. **Fixed 2026-10-02.** `CORE_CLAUSE` says "music teams" in both copies of the module, UrgAns's instructions, the share image (regenerated, `SHARE_IMAGE_VERSION` bumped), the package descriptions and the store listing draft. The long description (`CANONICAL_DESCRIPTION`) followed the same day, founder call, in both module copies, the README and the store listing draft | `apps/web/lib/positioning.ts` and its homepage mirror |
| 9 | Uses "small labels" to describe who we sell to | **Fixed 2026-10-02.** "small labels" is no longer on the positioning guard's retired list, so site and app copy may use it. It now appears in the Label plan's line ("For small labels and management teams.", on /pricing, the homepage and the in-app wall) and in /signup's "Who Urganize is for" | `apps/web/lib/positioning-guard.test.ts` |
| 10 | The scoreboard: weekly active paying teams (2 or more members active in 7 days, on Manager, Label or Group), second-release rate, week 4 retention, trial to paid | **Built 2026-10-02** at `/admin/scoreboard`; see "The company scoreboard" at the end of this file. Task edits were recorded nowhere before that day, so activity from before it undercounts | `lib/scoreboard.ts` |
| 11 | Distribution ordering, crypto payments, referral credits, the Sound Wave Spotlight referral code with its 10% commission | **Distribution: a first step is built, live behind its flag (2026-10-02)**, see "The Distribute step" at the end of this file. It is a readiness checklist and a hand-off to the partner's own sign-up, not an order form. **The Sound Wave Spotlight referral code is built flag-off (2026-10-02)**, see "Referral partners" at the end of this file. **Referral credits (a team inviting another) are built flag-off (2026-10-02)**, see "Referral credits" at the end of this file. Crypto payments are not built | |

**One definition the scoreboard will need, recorded so it is not invented twice:** the doc's second-release rate counts from when a release "goes live", and nothing in this product writes a `released` status. `lib/recap-eligibility.ts` (release date passed, or every task done) is the product's existing answer to "has this release happened", and the Urganize Directory already reuses it for the same reason. Use it, or get a different definition from the founder, but do not add a third. (The scoreboard uses it: `releaseLiveAt` in `lib/scoreboard.ts` is the same rule, answering WHEN rather than yes or no.)

---


### Build order after the credits sprint (2026-10-02, founder)

Five phases, one at a time, each behind its own flag, each reversible, nothing deleting or rewriting user data. A phase is not started until the one before it has passed its checklist and a real team has used it. The founder approved the Phase 0 audit and these answers on 2026-10-02:

1. **Catalogue** (artist, then releases, then each release's record). New artist pages at `/dashboard/artists`. The standing EPK stays one per artist; a release snapshots it when the release counts as delivered (the same rule as `lib/recap-eligibility.ts`).
2. **Relationships**, built ON the directory, not beside it. One person, one profile (`person_profiles`, extended so `user_id` can be empty until the person claims it), plus a private per-team layer. Unclaimed profiles come from being credited on a task, pitched, sent songs for a show, or added by hand. Dedupe on email, then phone, then exact name plus role, and never merge on name alone.
3. **Opportunities**, as the strategy doc defines it: what a team can pursue (deals, grants, sync, brands, partnerships). Hiring stays in Relationships through the existing work requests and joins later as one more kind. The money flow for hired work is its own spec.
4. **Audience**, only against data sources with access confirmed in writing, starting with numbers a team enters or uploads.
5. **Financials**, a read-only ledger inside Catalogue, collecting money that already moves through the app. No new payment flows.

Where the code disagrees with this, the code is current reality. Status is recorded in the sections for each phase as it ships; the fan capture page (`/capture/[token]`) is the one piece of fan data that already exists, and it stays per release.

## What Urganize is

**Since 2026-10-31 (founder approved, #944): short line "From idea to execution.", core line "Urganize is where music teams manage everything from idea to execution."** `SHORT_LINE`, `CORE_CLAUSE` and `CANONICAL_DESCRIPTION` changed in both copies of the module; the homepage hero says it over the unchanged `PROMISE_LINE`; "Every release, on plan" and "plan every release and deliver it on time" are on the guard's retired list ("on plan" alone stays where it describes a plan); the share card already said it (#939). The rest of this paragraph is the history. **Before that, short line since 2026-10-17: "Every release, on plan."** (founder approved the homepage v2 hero, URG-334). `SHORT_LINE`, `BRAND_LINE`, the new `PROMISE_LINE` ("Add a release. Get the plan. Your team knows what to do and when.") and `CANONICAL_DESCRIPTION` changed in both copies of the module, and the share card was regenerated. **Core line since 2026-10-17 (URG-344): "Urganize is where music teams plan every release and deliver it on time."** `CORE_CLAUSE` changed in both copies of the module, so UrgAns's instructions, every page built from it, the app email footer ("Urganize. Every release, on plan."), the package descriptions and the store listing follow; "Everything after the music" is now on the positioning guard's retired list. It said "do everything after the music is made" from 2026-09-24 ("music teams" since 2026-10-02, "your team" before). The 2026-09-24 positioning (see "Everything after the music" at the end of this file) replaced the category line "AI Music Business Manager" (locked 2026-09-09, widened 2026-09-11, audience narrowed the same day and widened back to three on 2026-09-24), which UrgAns's system prompt kept for one more day, until the founder decided on 2026-09-25 that the assistant says the new line too. The canonical strings live in `apps/web/lib/positioning.ts` and are enforced by `apps/web/lib/positioning-guard.test.ts`. What v1 BUILDS is unchanged and is the six-feature list below: a release management surface, described here in the words a customer reads rather than the words the build used.

**Target user for v1** (superseded 2026-10-02 by the strategy doc, see "Company strategy comes first" above; kept as the record of the v1 build): an artist manager or small label running more than one artist's releases at once. Not enterprise teams, not artists directly. Team-scale coordination (handoffs, files, status across a roster) is the paying pain point, confirmed directly: a solo manager with one artist already has a workable system (WhatsApp, Drive, calendar) and won't switch. Labels running a full roster are served by the premium Label tier (founder-delivered onboarding + template tailoring), not the self-serve core wedge.

**The central object is the release.** Every feature, every data model, every UI surface in v1 should answer the question: *how does this serve a release?* If a feature can't tie back to a specific release, it does not belong in v1.

**The product thesis:** the music industry runs on chaos. Tribal knowledge, scattered group chats, spreadsheets, and one overworked person holding every release together. Urganize is the system of record for the release — where the plan lives, where the work happens, where the team sees status. AI helps where it's genuinely useful; templates carry the domain knowledge.

---

## Architectural principles

These are the principles that govern v1 build decisions. When in doubt, return to these.

1. **The release is the spine.** Every feature serves a release. If you find yourself building something that doesn't tie back to a specific release, stop and ask whether it belongs in v1. **The workspace's scoped release view (`/dashboard?release=<id>`) is where the product converges** — the standalone release detail page (`/dashboard/releases/[releaseId]`) that used to hold this role was removed 2026-08-04 (founder call) and its content (Activities, Motion progress, Tailor plan, Generate status update, the one-time getting-started guide) absorbed into the workspace. The workspace is the single navigational + working surface; new features attach to the release (via a scoped-header pill, same as Metadata/Calendar/Files/Press kit), not to standalone surfaces. **AMENDED 2026-08-30: the release now has a sibling.** Events (shows) hang off the ARTIST, not off a release, and the Song is the join between the two — so "does this tie back to a release?" is no longer the whole test. The rest of this principle is unchanged and still binds everything release-shaped: a metadata hub, a press kit, a content calendar and a capture page are all still release scenes, and a new feature that IS about a release still attaches to the workspace rather than growing its own page. What changed is that "it does not tie back to a release" is now a question with two possible right answers instead of one, and the second one is a founder call, not a default (see "Scope expansion (2026-08-30)").

2. **Templates carry domain knowledge; AI is a removable polish layer.** Hand-crafted release templates are the product's IP. AI adjusts them and writes prose around them. If AI failed tomorrow, the product would still work — users pick a template, get a plan, edit it, run their release. Build it so AI is *removable* without the product dying. (Exception under active build: **Chappi**, the conversational front door — see AI integration. It's a conscious expansion of the AI surface, but still honors this principle's spirit: Chappi degrades to a deterministic command bar + action chips when no model is configured.)

3. **Structured data over free text.** A release has a type. A task has a status, an owner, a due date, a dependency. A file has a category. Enumerate these. Don't let users type them as free strings. Structured data is what makes AI prompts contextual, status views correct, and analytics possible later.

4. **Single-tenant mental model, multi-tenant implementation.** Each user/team works in their own workspace as if alone. Database is shared with proper isolation (RLS). Do not build per-tenant deployments or environments.

5. **Boring stack.** Use what's already in the codebase. Next.js App Router, Supabase, Tailwind, Zustand, XState where appropriate. No new frameworks, no new languages, no new patterns introduced in v1 unless they're solving a documented problem the existing stack can't handle.

6. **Build for the case we have, not the case we might have.** We have 1 paying user, 1 design partner team, 1 contract in legal review. Build for them. Do not design for scale, multi-region, SSO, or enterprise features until the problem is real.

7. **Feature flags from day one.** Use a simple feature-flag mechanism (env-based, user-based, or workspace-based) so partial features can ship to yourself first, then the paying user, then design partners, then everyone. Without flags, releases stall waiting for "done."

8. **Visible state changes.** The user always knows what state their release is in, what's blocking it, what's next. No silent operations. No "did it save?" moments. Trust is built through visibility.

9. **Schema is changed only through migration files.** `supabase/migrations/` is the source of truth for schema. Never alter schema through the Supabase dashboard, never with ad-hoc SQL in production. If a migration is needed urgently, write it, commit it, then apply it. No exceptions. Migrations are the source of truth for schema. **Every new table grants explicitly (Supabase stopped auto-granting new `public` tables on 30 Oct 2026).** In the same migration as the `create table`: `enable row level security`, its policies, then `grant select, insert, update, delete on public.<table> to authenticated, service_role;` (add `anon` only if logged-out visitors need it), and `grant usage, select on sequence ...` for any serial. `20261024120000_explicit_table_grants.sql` restores the old default privileges as a safety net, but don't rely on it.

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
│   ├── web/           # Authenticated product app (app.urganize.app)
│   └── mobile/        # Expo native shell (iOS + Android): a webview on app.urganize.app
├── packages/
│   ├── ui/            # Shared React primitives (Button, Card, Input, etc.)
│   ├── config/        # Shared tsconfig, ESLint, Tailwind preset
│   ├── pricing/       # Single source of truth for plan tiers/prices
│   ├── native-bridge/ # Web <-> Expo shell message protocol (pure TS)
│   ├── lib/           # Stub placeholder
│   └── db/            # Stub placeholder
├── supabase/migrations/   # SQL migrations for the web app
├── scripts/run-turbo.cjs  # Build/dev/lint wrapper
└── turbo.json, pnpm-workspace.yaml, tsconfig.json, vercel.json
```

**Path aliases** (from root `tsconfig.json`): `@urganize/web/*`, `@urganize/homepage/*`, `@urganize/ui`, `@urganize/config/*`.

---

## Multi-platform architecture: a Tauri desktop client, and native-first mobile (2026-09-29, founder decision)

**Scope expansion (2026-09-29):** the founder decided the platform strategy
going forward is web (Next.js, unchanged) + mobile (Expo, evolving toward
native-first) + a new **desktop client (Tauri + Rust)**, all sharing the one
Supabase backend. The full strategy is written up at `docs/architecture.md`
— read it before touching mobile's platform-detection code or starting any
desktop work.

**This is a conscious, explicit exception to two standing principles above,
not an accidental conflict with them:** #5 "Boring stack... no new
languages... unless solving a documented problem the existing stack can't
handle" and #6 "Build for the case we have... do not design for scale...
until the problem is real." Nothing about those principles is wrong for v1's
existing surfaces — they still bind everything else in this file exactly as
written. This decision is the founder choosing to take on a new language
(Rust) and a new client (desktop) as the deliberate next step beyond v1, the
same kind of explicit override this file already records for Chappi, Events,
and the mobile shell each moving something off (or, here, adding something
beyond) the standing defaults.

- **Web is unchanged.** Next.js remains the primary product; nothing here touches it.
- **Mobile's current implementation is unchanged too, and this decision does not ask for an immediate rewrite.** `apps/mobile` stays the Expo webview shell described under "The Expo shell" below and in `docs/mobile/expo-shell.md` (deliberate, shipped 2026-09-24/25, precisely so every web change reaches phones with no store review). What is now decided is the **long-term destination**: a genuinely native-first mobile client. The path there is incremental — native screens land surface by surface, as each one earns it, each still recorded here with its own dated decision when it actually ships — not a wholesale rewrite starting now.
- **Desktop is new and nothing is built yet.** No `apps/desktop` package exists. `docs/architecture.md` records the authorized shape: a Tauri shell, React/TypeScript UI (reusing `packages/ui` and existing frontend concepts where practical — **never a Rust rewrite of the frontend**), and Rust scoped narrowly to native OS capabilities (filesystem access and watching, large/local file operations, local indexing and hashing, background workers, OS integration, secure local credential handling, offline/local sync). The long-term product idea — connecting to a user's own project folders on disk, watching and indexing them, syncing relevant info back to Urganize — is explicitly a future direction to build incrementally, not a spec to implement all at once.
- **Both new platforms extend `packages/native-bridge`** (the protocol package the Expo shell already uses to talk to `apps/web`) rather than inventing a second bridge mechanism, so the web app interacts with one abstraction regardless of which shell it runs inside.

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

**v1 tables in web (post-reconciliation):** `profiles`, `releases`, `release_metadata`, `release_events`, `release_playbook_steps`, `release_collaborators`, `release_workspaces`, `collaborators`, `tasks`, `task_groups`, `task_activity`, `task_attachments`, `task_comments`, `assets`, `activity_logs`, `workspaces`, `workspace_members`, `organizations`, `organization_members`, `subscriptions`, `payments`, `app_settings`, `notifications`, `ui_state_drafts`, `pricing_validation_responses`, `artists`, `notes`, `release_plan_drafts`. This list has drifted behind several later additions (`push_subscriptions`, `scheduled_notifications`, `task_outcomes`, `release_epks`, `release_recaps`, the curator/pitching tables) — `device_push_tokens` (2026-08-10, native push) is added here as a partial catch-up, not a claim the rest is now complete. `urgans_conversations` (2026-09-24, saved UrgAns chats, flag-off — see "Saved UrgAns chats" near the end of this file) likewise.

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

**Email confirmation (2026-10-19, URG-386) — built, dormant.** Production keeps Supabase `mailer_autoconfirm = true`; with it on, `signup()` returns `{ status: 'signed_in' }` and nothing below runs. When Oyin turns confirmation on, `signup()` returns `{ status: 'confirmation_sent', email }` (an address that already has an account answers the same way, never leak it) and the host shows `CheckInbox` (`components/auth/EmailConfirmation.tsx`). Pieces: `lib/email-confirmation.ts` (pure: pending record in localStorage `urganize.email_confirmation.pending`, compact `user_metadata.onboarding_draft`, redirect-error parsing, `isSafeNextPath`), `lib/email-confirmation-client.ts` (resend, `claimEmailResume`: Web Locks + localStorage marker + metadata draft nulled, so exactly one tab on one device builds the rollout), `components/auth/useConfirmationPickup.ts` (waiting tab picks up a same-browser session). `/auth/callback` shows "This link has expired." for `otp_expired`, "You're in" for a fresh email-link session, and finishes curator joins (`curator_join_code`), team invites (`pending_invite_token`) and closed-sign-up codes (`pending_access_code`, `pending_welcome_token`) from metadata, so a link opened on another device still works. The confirm link is the implicit flow (`flowType: 'implicit'`), which is what makes cross-device work; do not switch auth to PKCE without reworking this. `next` on the callback must pass `isSafeNextPath` (open-redirect fix). Auth email templates (confirm, magic link, reset, invite, email change) live in `supabase/templates/` (see its README) and are installed through the Supabase Management API, not read from the repo; the confirm headline is fixed ("Confirm your email to start your rollout.") and no template reads `.Data.*`: sign-up metadata is user-supplied and must never appear in mail sent from verify@urganize.app. Known gap: the *waiting* tab on device A does not notice a confirmation on device B (device B builds the rollout; A stays on Check your inbox).

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

**Component library:** In-house. Shared primitives in `packages/ui/src/`. Feature components in each app's `components/`. **Since 2026-11-04 (founder call, #1071) shadcn/ui is set up in `apps/web`:** registry components live in `apps/web/components/ui/` (added with `pnpm dlx shadcn@latest add`, themed through the semantic tokens aliased onto the Urganize palette), and that is where new primitives come from; the `packages/ui` primitives stay for the pages that already use them. See `docs/notes/2026-11-04-shadcn-ui.md`. Icons: `lucide-react` + `react-icons`. Animations: **CSS only** — `framer-motion` was removed 2026-08-08 (its last consumer, homepage `/pricing`, used it for 13 plain fade/slide-ins the site already expresses via the `hero-fade-in`/`hero-delay-*` classes and the IntersectionObserver-based `ScrollReveal`; shipping an animation library to duplicate that was pure weight on a slow mobile link). Do not re-add it without a motion need CSS genuinely can't express. (chart.js was removed with the homepage admin retirement, 2026-07-30 — the hub's Growth chart is plain CSS bars.)

**Root `layout.tsx` in `apps/web` is a SERVER component** (it exports `metadata`; corrected 2026-07-10 — earlier revisions of this file called it a client component, which had drifted from the code). The client boundary starts at `AppShell`/`PostHogProvider`, and every page individually declares `'use client'` because they consume Zustand. Six routes (dashboard, settings, release detail, locked, onboarding, auth) have thin server `page.tsx` wrappers exporting per-page `metadata` titles, with the real page in a `*PageClient.tsx` sibling — follow that pattern when adding routes. NOTE: references to these routes' `page.tsx` files elsewhere in this document (spec sections and dated deploy logs written before 2026-07-10) now mean the `*PageClient.tsx` sibling — e.g. the LegacyDashboard revert path lives in `app/dashboard/DashboardPageClient.tsx`.

---

## External services

- **Database:** Neon (homepage), Supabase (web).
- **File storage:** Supabase Storage. Buckets: `release-assets`, `proofs`. No S3/R2.
- **Email:** Resend, on the FREE plan (100 emails a day, about 3,000 a month) — corrected 2026-09-30; this line said "not wired up yet" long after invites (2026-08-21) and the react-email rebuild (2026-09-25) shipped. `lib/email/` is the whole layer: react-email templates, a per-send log (`email_log`), suppressions and unsubscribe links (`email_suppressions`), a Svix-signed delivery webhook (`/api/webhooks/resend`), and since 2026-09-30 a queue for mail that goes out later (`email_outbox`: the onboarding sequence and emails written in the admin). Sending domain `urganize.app`, verified in the Resend account signed in as theurganization@gmail.com. See "Email from the admin, and the onboarding sequence" at the end of this file.
- **Payments:** Paystack, server-initiated recurring checkout (`POST /api/billing/start-checkout` → Paystack hosted page → webhook credits by `payments.reference` / `metadata.user_id`). **THREE TIERS, BOTH INTERVALS, MONTHLY-ANCHORED, since 2026-09-10 (#580), and the Plans behind it were minted 2026-09-11** — defined in `packages/pricing`, the single source of truth for both the marketing /pricing page and the in-app wall. **A tier declares a MONTHLY price and nothing else; the yearly figure is arithmetic** — `ANNUAL_MONTHS_BILLED = 10`, so two months free, computed in `getTierPrice` and nowhere else: **Solo ₦5,000/month → ₦50,000/year, Manager ₦22,000/month → ₦220,000/year, Label ₦50,000/month → ₦500,000/year**, all three self-serve. **There is no sales-led tier at all** — Group (id `enterprise`) was removed outright on 2026-09-09 and is no longer a `PricingTierId`, so this bullet's old "FOUR TIERS … plus Group" wording was stale for a day before the reprice made it stale twice over. Both surfaces carry an interval toggle again, opening on monthly (`DEFAULT_SELLING_INTERVAL`); there is still no USD leg (the Paystack account offers NGN alone in plan creation). Plan codes come from env — **SIX of them now, `PAYSTACK_PLAN_{SOLO,MANAGER,LABEL}_PER_{MONTH,YEAR}_NGN`** — and `_PER_MONTH_`/`_PER_YEAR_` are deliberately NOT the superseded `_YEARLY_` and `_ANNUAL_` names, which only the renewal sanity check reads. Full account, the plan codes, and how the chain was verified in "Monthly is the price, yearly is arithmetic" under Working notes. **This bullet described the pre-tier Monthly/Annual/Label shape until then; the legacy `BILLING_PLANS` generation it named is untouched in code and is what existing subscribers renew against.** Legacy: standalone Payment Page (flat ₦15,000 access SKU, `urganize.app/pay` vanity URL) credits by `customer.email` for grandfathered users; `plan: 'custom'` rows are admin-provisioned relics. The webhook at `api/webhooks/paystack` validates HMAC-SHA512.
- **Analytics:** PostHog (browser + node) in `apps/web`. Vercel Analytics in both apps. Google Analytics in homepage. Formbricks survey provider in homepage.
- **Customer support (corrected 2026-09-03 — this entry was stale for two weeks):** ~~the floating pill in `apps/web/components/support/SupportChat.tsx` (label cycles "Chat with the founder" / "Report a bug" / "Contact support"), with the WhatsApp founder link in the ChappiDock / side-rail footers~~ — **`components/support/SupportChat.tsx` and `lib/support-contact.ts` were DELETED 2026-08-17 (`d9c9fa68`, "Remove founder chat…"), along with those footer links.** With `NEXT_PUBLIC_FEATURE_CHAPPI` off there is now no support surface at all beyond the topbar's `?` menu; the only surviving founder WhatsApp link in the app is inlined in `app/global-error.tsx`, reachable only from a top-level crash. Today's support surfaces are: **`HelpMenu`** (`components/app/HelpMenu.tsx` — Docs, a `mailto:contact@urganize.app`, a WhatsApp community link; note it is `hidden md:block`, so it does not exist on a phone), the assistant's own surfaces when Chappi is on, and — behind `NEXT_PUBLIC_FEATURE_REPORT_ISSUE` — **in-app issue reporting to Linear** (see the dated section below). The former Tawk.to widget was replaced 2026-06-11; the `NEXT_PUBLIC_TAWK_*` env vars are retired.

---

## Conventions

**Every task gets a GitHub issue first (2026-10-29, founder decision; replaces Linear for new work).** Linear hit its free issue limit on 2026-10-26, so new work is tracked in GitHub issues on `luckywenapere/urganize`. For every substantive task (a feature, a fix, a copy or design change, research, a migration, an outreach or ops task done in a session; not a quick question or a one-line read), before starting: `gh issue create` with a plain title, a short body (what and why, what done looks like), one `area:` label and a type label (`bug`, `enhancement`, `documentation`, `chore`). Search open issues first (`gh issue list --search`) and reuse a match instead of opening a duplicate. While working, comment on the issue when something notable is found or decided. Every commit names its issue: `Fixes #123` closes it when the commit reaches `main`; `#123` links without closing. After a version-bumping push, comment "Delivered in vX.Y.Z" on it. Write issues as Oyin, with no AI attribution. Old `URG-` numbers still stand for work already filed in Linear; the rest of the paragraph below now applies to GitHub issues wherever it says Linear.

**Content always goes through the hook skill (2026-11-09, #1149, founder call).** Whenever a session drafts, edits or reviews content for people to read (LinkedIn or X posts, captions, emails and subject lines, DMs, newsletters, scripts, ads, headlines), load the `writing-hooks` skill first and run the opening through its 5 checks, even if Oyin does not mention hooks. Product UI copy is out of scope.

**The work log (2026-11-06, #1107).** `worklog/` holds the team's ideas (`ideas.md`, newest first), one file per day (`days/YYYY-MM-DD.md`) and saved pastes (`pastes/YYYY-MM-DD-slug.md`). When Oyin or a teammate says "add this idea", "log today" or "save this", write it there in the format its README sets, and commit. When asked "what ideas do we have about X" or "what did we do on Y", search `worklog/` first and quote back what is there. Never store passwords, keys or private customer data in it.

**Every change goes through a reviewed pull request (2026-10-29, founder decision, #859; replaces "straight to `main`, no PRs" from 2026-10-14).** GitHub does not let you approve your own pull request, so a GitHub App, **Urganize Bot** (app id 5530716, installed on luckywenapere's repos), opens them and Oyin reviews them as `luckywenapere`, which also puts the reviews on his profile. The flow: issue, branch, commits (authored by Oyin as usual), push with the normal `gh` login, then open the PR as the bot with `GH_TOKEN=$(node scripts/bot-token.cjs) gh pr create ...` (body says `Fixes #N`). Before asking Oyin, review the diff yourself (`/code-review`) and post the findings on the PR as the bot. Oyin reads it and taps Approve or Request changes; never merge before his Approve. Oyin only approves; he does not press the green Merge button, because a merge from the GitHub page makes the bot the commit author (this happened on #861, commit `ef296d2`, left as is). Keep each PR to one commit (squash it on the branch before asking for review) and merge with `gh pr merge <n> --rebase` under the normal login. Rebase merge keeps the commit's own author (Oyin), while squash makes the PR author (the bot) the commit author, and `--author-email` does not change that (tried on #863, commit `f71cdad`, left as is). Put `[deploy]` in that commit's message only when the change should go live; PR branches never build because of the `[deploy]` gate, so PRs cost no Vercel deploys. The bot's key lives at `~/.config/urganize-bot/private-key.pem` with `config.json` beside it, never in the repo. Branch protection cannot enforce the review (free plan, private repo), so this is a rule we keep, not one GitHub keeps for us.

**Releases, tags and Linear (2026-10-14, founder decision).** Every push that changes the product bumps the root `package.json` version and adds a `packages/changelog` entry, as before. After each version-bumping push, create the tag and GitHub Release by hand (REST API, `target_commitish` = full sha, body = that version's changelog highlights) and comment "Shipped in vX.Y.Z" on each Linear issue it names. (A `release.yml` Actions workflow did this automatically but was removed on 2026-10-15: GitHub refused to start it on this private repo, likely Actions billing, and every push sent a failure alert. Restore it from git history once Actions works.) So **every commit message names its Linear issue**: `Fixes URG-123` (Linear's GitHub integration moves it to Done when it reaches `main`) or just `URG-123` to link without closing. Linear projects are ongoing product areas with no version numbers in their names (Onboarding & Growth, Navigation & Views, UrgAns (AI), Releases, Tasks & Teams, Directory & Opportunities, Video Pre-production, Partnerships & Outreach); file every new issue under one. The version lives in git tags, GitHub Releases and the changelog, never in a project name.

**TypeScript:** strict mode everywhere. Use the existing `packages/config/typescript/base.json` config.

**Linting:** `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. Two intentional overrides:
- `@typescript-eslint/no-unused-vars` honors leading-`_` for unused.
- `react-hooks/set-state-in-effect` and `react-hooks/preserve-manual-memoization` are downgraded to **warn** during React 19 migration.

**Testing flows locally (2026-10-29, #862):** `pnpm db:local:reset` then `pnpm dev:local` runs the app on http://localhost:3100 against a local Supabase in Docker, never production. Test sign-ups and onboarding there, not on the production database. See `docs/notes/2026-10-29-local-test-environment.md`.

**Tests:** Vitest is configured in `apps/web` for pure-logic unit tests only (`pnpm test` at the root, or `pnpm --filter @urganize/web test`; config at `apps/web/vitest.config.ts`, tests live next to their modules as `lib/*.test.ts`). Coverage is deliberately narrow — the highest-consequence billing/access logic: plan expiry math (`lib/billing.ts`), renewal advancement + Paystack plan resolution (`lib/billing-plans.ts`), the paywall allowlist, and the four-state subscription snapshot (`resolveSnapshot` in `lib/subscription-access.ts`, exported for tests) — plus one pattern guard: `lib/schema-fallback-guard.test.ts` fails if any file outside its frozen baseline starts using the deprecated schema-missing-fallback helpers (see "Patterns being deprecated in v1"). Run `pnpm test` before touching any of those modules. Components, routes, and full flows stay on manual testing for v1; broad automated coverage remains a v2 investment. Tests are not RUN by the Vercel build — a failing assertion does not block deploys (yet) — but the test files are type-checked by `next build` (tsconfig includes `**/*.ts`), so a type error in a test does fail the build.

**How new logic gets tested here (2026-09-03, TDD as the default habit).** Write the test before the implementation, and name the exact assertion it makes before writing a line of the thing it's testing. This isn't a new mechanism — `lib/chappi/` already carries four working patterns; the discipline is picking the right one up front rather than bolting a test on after:

1. **Pure function, no mocks.** The default for anything that can be expressed as data in, data out — most business logic belongs here. Plain vitest, small fixture-builder functions (`function release(over: Partial<X> & {id: string}): X { return {...defaults, ...over} }`), no IO. See `lib/chappi/tool-families/insights.test.ts` or `lib/chappi/workspace-summary.test.ts`.
2. **Flag-dependent.** Anything reading a `NEXT_PUBLIC_*` flag at module scope needs `vi.resetModules()` + `vi.stubEnv(...)` + a dynamic `import()` inside each test case, because the flag is inlined at build time and stubbing after import is too late. See `lib/chappi/intent-router.test.ts`'s `loadRouter` helper.
3. **Full-loop behavior.** When the thing under test is the orchestration itself (a tool-calling loop, a multi-step flow), mock only the IO edges (`vi.mock` the module that touches the network/DB) and drive the real function through them with canned responses. See `lib/chappi/confirmation-flow.test.ts`.
4. **Structural/registry invariant.** For a set of things that must stay consistent with each other (every tool has a description, every gated tool is excluded from MCP, a route a tool proxies actually accepts the caller it gets), scan the real data or real source files rather than asserting a fixed list — a fixed list only catches a name changing, not a new entry silently violating the rule. See `lib/chappi/tool-registry.test.ts`.
5. **Manual pass.** Anything needing a live model call, a live session, or a live deploy cannot be reached by vitest in this repo — say so explicitly (as every feature's activation checklist in the Working notes section already does) rather than skip it silently or claim it's covered.

`pnpm test` green is the bar before calling anything done. A failing assertion gets written first; it never gets added afterward to describe code that already exists.

**Naming:**

- Components: PascalCase `.tsx` (`ReleaseHeader.tsx`, `TaskDetailDrawer.tsx`).
- Hooks: camelCase, `use*` prefix.
- Stores: `use*Store` in `apps/web/stores/`.
- Route handlers: always `route.ts`. Per-domain helpers in `_shared.ts`.
- DB columns: `snake_case`. TS types for DB rows: `camelCase`. (Legacy `Db*` prefixed types were removed — they drifted from the schema and were unused.)

**Commit authorship (2026-08-27, founder call; audited 2026-08-28).** Every commit in this repo should be authored **`Oyin Wenapere <luckydio10@gmail.com>`** (the founder's name changed on 2026-10-10, so new commits carry the new name while older ones keep the old; the EMAIL did not change, so blame and the graph still read as one person) — that address is the one GitHub resolves to the account, so it is what makes blame, the contribution graph and Vercel's per-deployment attribution read correctly. The 2026-08-28 audit found 629 of the 631 commits on `main` authored that way (one other author is `prosper20`, a real contributor; the single exception is recorded in the last bullet). Three things hold that in place; do not remove any of them without replacing it:

- **`.claude/settings.json`** carries `attribution` (`commit: ""`, `pr: ""`, `sessionUrl: false`), which suppresses the assistant's commit trailer, PR-description line and session link, and a `SessionStart` hook that sets the **repo-local** identity (`.git/config` only — never the machine's global config). A fresh container's global git identity is not this one, so the hook is what corrects it each session. Project hooks require the workspace-trust step, so on the very first session in a new clone it may not have run yet — check `git config --local user.email` before the first commit.
- **Squash was the merge method until 2026-10-29; PRs are now rebase-merged, one commit each, because Urganize Bot opens them (see the reviewed pull request rule above)** — but know exactly what it does and does not cover, because this bullet overstated it until 2026-08-28. Under squash, GitHub rewrites author → PR author and committer → `GitHub`, and re-signs the result, which is why merged work on `main` reads correctly and shows Verified. **It governs the merge path and nothing else.** Measured 2026-08-28: of 631 commits on `main`, **381 were committed by GitHub (squash) and 248 arrived by direct push** — and a direct push keeps whatever identity the container had, since no squash rewrite ever sees it. So there are two ways this regresses, not one: switching to a merge commit or a rebase merge (which lands branch commits verbatim, carrying whatever identity and signature they were made with), and pushing straight to `main` from a container whose identity was never corrected. The second is not hypothetical — it produced `1408c76` (see below). **The repo-local identity hook in the first bullet is the only thing covering the direct-push path**, so `git config --local user.email` is worth checking before any direct push to `main`, not just before the first commit of a session.
- Commits already on `main` that carry an assistant trailer are history and stay as they are; removing them would mean rewriting and force-pushing the branch Vercel deploys from. The 2026-08-28 audit put numbers on it: **319 of 631 commit messages** carry a `Co-authored-by:` trailer or a session link (194 the trailer alone, 125 both), spanning 2026-05-14 to 2026-08-27. Those affect neither authorship, blame nor the graph — GitHub just renders a co-author on the commit page. **One commit is a genuine exception and was deliberately left alone (founder call, 2026-08-28): `1408c76` ("feat(urgans): put overdue work… (#384)", 2026-08-24) is authored AND committed by `Claude <noreply@anthropic.com>`**, because it was a direct push and nothing reattributed it. Re-authoring it means rewriting the 42 commits from it forward, and **41 of those are GitHub-signed** — any rewrite re-signs them with the container's key (`/home/claude/.ssh/commit_signing_key.pub`, which is not registered to the account) or leaves them unsigned, so 41 commits would flip Verified → Unverified permanently, `abc407a` among them. One Claude-authored commit out of 631 was judged the cheaper of the two. Do not "tidy" this later without re-reading that trade.

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
- ~~**There are no React error boundaries anywhere in `apps/web`** (no `error.tsx`, no `global-error.tsx`).~~ **Stale, corrected 2026-09-03 — there are three**: `app/error.tsx`, `app/global-error.tsx`, and `components/app/ErrorBoundary.tsx`, the last wrapping four floating surfaces in `AppShell` (`android-app-banner`, `identity-panel`, `urgans-rail`, `support-launcher`) so a throwing widget cannot take the application down with it. All of them report through `lib/report-boundary-error.ts` as `app_error_shown`. The original entry's REASONING still stands for anything they do not wrap: a client-side exception during hydration on a page with no boundary above it still leaves the user staring at whatever the server rendered, which is what made the 2026-08-13 front-door dead end present as an eternal loading screen (see "The front door is server-rendered" — the fix there was to make the pages useful without JS rather than to add boundaries). Wrapping every page is still open.
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

~~The template provides the structure. The AI provides the tailoring. Never let the AI invent tasks from scratch without a template — that's the failure mode we're explicitly avoiding.~~

**UrgAns may write its own tasks — Oyin approved 24 Oct 2026.** Planner v2 (`lib/planner-v2/`, v1.176.0, flag `NEXT_PUBLIC_FEATURE_PLANNER_V2`, on unless `'false'`) lets the model write the whole plan, using the playbooks plus a Nigeria pack as a menu of moves rather than a fence. The fence is code: `validatePlanV2` checks every plan (dates against release day, distributor and release-day tasks present, dependencies ordered, spend within the Naira budget, ₦0 means free only, only the channels picked, pace for the team), one retry sends back only the errors, code repairs what it can, and anything still failing becomes the playbook quick plan with a visible Retry. Templates stay the domain knowledge and the fallback, so the product still works with AI off. See `docs/notes/2026-10-26-planner-v2.md`.

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

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel — monorepo, TWO projects from this one repo:
  - `Web` → https://app.urganize.app (builds `apps/web`)
  - `the-urganization` → https://www.urganize.app (builds `apps/homepage`; **`www.urganize.app` 308s to the bare `urganize.app` apex** — this line said the reverse until 2026-08-13, when a post-deploy health check measured the real chain: `www` → 308 → apex → 200. The "reconcile that doc" note under the URG-118 section is now discharged.)
  - **`the-urganization` HAS an Ignored Build Step and `urganize` does NOT (measured 2026-09-11 from the commit statuses on #579 and #582).** So a push rebuilds the product app always, and the marketing app only when the change reaches it. This bullet said both use `npx turbo-ignore @urganize/<app>`, then said the field was empty on both (founder, 2026-09-08); the first was never true and the second was true until something was installed on the marketing project two days later. The evidence, what it cannot tell you about WHICH command is installed, and the value still to install on `urganize` are all under Hosting above and in *"A docs-only merge no longer costs four deployments"*.
- **The marketing site deploys itself again since 2026-10-31 (founder call, #947), but only for marketing changes.** `the-urganization` has Root Directory `apps/homepage` (since 2026-10-19), so it reads `apps/homepage/vercel.json`, not the root file: `"main": true` there, and its `ignoreCommand` is `scripts/vercel-ignore-homepage.sh`, which builds only when the commit has `[deploy]` AND something under `apps/homepage/`, `packages/{pricing,ui,config}` or `pnpm-lock.yaml` changed since its last deploy. Version-only `package.json` bumps and `packages/changelog` do not count, so a product release does not rebuild urganize.app (its `/changelog` page catches up at the next marketing deploy). From 2026-10-19 to 2026-10-31 the site did not deploy from `main` at all.
- **DEPLOYS ARE OPT-IN SINCE 2026-10-27 (founder call, to save Vercel deploys and Active CPU): a push to `main` only builds when its commit message contains `[deploy]`.** Root `vercel.json` has `"ignoreCommand": "git log -1 --pretty=%B | grep -qF '[deploy]' && exit 1 || exit 0"` (exit 0 = skip, exit 1 = build). Both Vercel projects read the root file, so this gate applies to the product app AND the marketing site, and it overrides the dashboard Ignored Build Step. Batch work in plain commits, then put `[deploy]` in the message of the commit that should go live; that build ships everything since the last deploy.
- Production URL: https://app.urganize.app (product) / https://www.urganize.app (marketing)
- Deploy workflow: auto-deploy on push to `main` (production); PR branches do not build (no `[deploy]` in their commits); the reviewed squash merge with `[deploy]` in its subject is what goes live
- Deploy status command: the Vercel REST API with `$VERCEL_TOKEN` (set in cloud sessions). Team `team_Q8ifaV1Kre3IPoxveXwUTLcW`; the product app (app.urganize.app) is project `urganize` (`prj_4CymLx7edCv8X8NIoy4oapTgfFp5`), the marketing site is `the-urganization`. `GET /v6/deployments?projectId=...&teamId=...&target=production&limit=3` shows the latest builds and their state.
- **Check Vercel yourself, never ask the founder (founder, 2026-11-03).** Whether a flag or env var is on in production, whether a deploy has finished: read it from the API with `$VERCEL_TOKEN` (`GET /v10/projects/{id}/env?teamId=...` lists keys; `GET /v1/projects/{id}/env/{envId}?teamId=...` reads one value) and report what you found. Never write "if it's switched on" or ask him to look. Reading is fine; changing a production env var or triggering a deploy still needs his yes, as before. Never print secret values in the reply; a `NEXT_PUBLIC_*` flag value is fine to state.
- Merge method: rebase, one commit per PR (since 2026-10-29: squash would author bot-opened PRs as the bot)
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
- **`v1.0.0` SHIPPED 2026-08-24 (founder call).** It was reserved for AI activation, and the founder called that met once UrgAns was running on a real tool-calling model in production (RodiumAi, `openai/gpt-4o-mini` — see the AI integration section). Note "AI activation" was judged on the assistant rather than on all three surfaces. **Corrected 2026-09-07, twice in one day.** It first said both the planner and the status generator were still behind their own flags; the correction to that said only the planner still was. Both readings were wrong in the same direction: the status generator had been live since v0.33.0 (2026-07-26) and the planner since v0.53.0 (2026-08-14), so all three AI surfaces were already on when 1.0.0 shipped, and the caveat was unnecessary rather than merely imprecise. There is nothing left here to flip for a second 1.0.
- **Entry fields for /changelog (2026-10-19, URG-388):** the public page reads the ledger as features, PostHog-style. Every minor (`x.y.0`) entry carries a short plain `title` (what it does for you, no version talk) and one `tag` from `RELEASE_TAGS` (Rollouts, Pitching, Team, AI, Account, App); patch entries take a `tag` and fold into their month's "smaller improvements". Housekeeping a visitor gains nothing from (marketing-site copy, metadata/SEO, internal monitoring, test-account analytics, admin-only screens) takes `listed: false`: it stays in the ledger and CURRENT_VERSION, but not on the page. All three fields are optional, so the in-app What's new is unchanged.
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

### Reading the ledger backwards (2026-09-07)

The ledger is also the only in-repo record of **when a feature flag was
flipped**, because the procedure above puts the entry at the flip rather than
at merge. Four sessions have now used it to settle a stale "not yet activated"
claim, and it is worth writing down what it can and cannot answer, because the
test is weaker than it first looks.

**A ledger entry is strong evidence when it ANNOUNCES a capability** — "Added
Notes", "You can pitch your songs to playlists from inside Urganize", "You can
plan EPs and albums now" — and stronger still when it reports a BUG in a flow,
since nobody observes a bug in a surface that 404s. v0.56.2's *"used to walk
you through the seven rollout questions and then stop with 'there is already a
release plan'"* is the sharpest example: it pins a flag state by naming a
message only a reachable route can produce.

**It is NOT evidence when it ENUMERATES a set in passing**, and this was
proven rather than assumed. v1.1.3 (2026-08-25) reads *"Collect metadata, your
calendar, files and your press kit were being squeezed into a narrow strip"* —
while the working-notes section written for that very pass says outright that
`NEXT_PUBLIC_FEATURE_FILES` **is off in production** and that the file scene
was deliberately left out of the fix. Six entries between v0.39.0 and v1.1.3
name Files as a live release surface and it has been off since v0.16.4. So a
list of scenes in a layout entry is the full possible set, not the switched-on
set, and reading one as a flag state gives a false positive.

**A NEGATIVE only narrows.** No entry means the flip was never recorded, which
is a documented failure mode here rather than proof the flag is off — the
mobile shell, Web Push, the team brief and `workspace-summary.ts` all shipped
with no entry at all, and Fan capture's switch-ON is still unrecorded while
its switch-OFF is in v1.21.0.

**And it dates a flip, never the present.** A flag can be switched off later
with no entry (metadata, capture and the content calendar were switched off
WITH one, in v1.21.0, which is the exception). So the honest form of a resolved
status is "LIVE from vX.Y.Z on <date>; nothing records it being switched off;
whether it is on today is not answerable from the repo" — which is what the
sections corrected in this sweep now say.

---

## Pricing v4: six plans, a Free plan, Solo Plus (2026-11-08, v1.261.0, #1112)

Founder-approved mock: `docs/mocks/pricing-v4/mock.html`.

- **Six plans in two groups.** "Just you": Free (₦0), Solo (₦5,000/mo), Solo
  Plus (₦12,000/mo). "Your team": Pro (₦15,000/mo), Pro Plus (₦40,000/mo),
  Label (Custom, sales-led). Yearly is ten months. `TIER_GROUPS`,
  `TIER_GROUP_LABEL` and `tierGroupOf` in `@urganize/pricing` are the grouping.
- **Renamed on screen only.** Code id `manager` shows as "Pro" and id `pro`
  shows as "Pro Plus". The ids are stored in `subscriptions.plan` and named by
  Paystack env vars, so they never move. New ids: `free`, `solo_plus`.
- **Limits** (from `PRICING_TIERS[...].limits`, artists / people / rollouts /
  AI credits a month): Free 1/1/1/30, Solo 1/3/1/150, Solo Plus 1/3/3/400, Pro
  3/6/3/450, Pro Plus 5/10/8/900, Label unlimited/2,000. `ALLOWANCE_CREDITS`
  matches. Upgrade path: Free, Solo, Solo Plus, Pro, Pro Plus, Label.
- **Distribution.** Free sends from its own TRM account. Solo and Pro pay
  ₦2,000 a single. Solo Plus and Pro Plus include singles and EPs for one
  artist (TRM Independent Artist, `DISTRIBUTION_ALLOWANCE`), and owe TRM like
  Pro Plus does. Label is unchanged.
- **Not on the page, because not built:** every "Soon" row in the mock (briefs,
  WhatsApp chasing, routines, research lookups, talking to other teams, best
  model priority) and curator pitch quotas (pitching is paid per pitch in
  credits; no quota exists). Shows and DJ packs are not gated by plan, so the
  mock's "No shows on Free" is not shown either.

### The Free plan decision

`resolveTeamAccess` (`lib/team-billing.ts`) used to end in the wall. Its last
branch is reached only by a team that has **never paid**: no owner access, no
comp, no bonus days, no live trial, no grace, no credits that count for access,
and not lapsed from a payment. That branch now returns state `free` (hasAccess
and canWrite true, reason `free_plan`), which `resolveTeamTier` maps to tier
`free`. So the one state that changed is exactly "never paid, trial over".

- **Paid and lapsed stays read-only.** The read-only branch sits above and is
  untouched.
- **A cancelled trial is Free too** (reason stays `trial_cancelled`). It never
  paid, and Free is strictly more than the read-only it had since 2026-10-14.
- **New teams land on Free.** `TEAM_TRIAL_DAYS` is 0 (pay first, 2026-10-31),
  so a new team used to meet the plan wall straight away; now it starts on Free
  and can upgrade from the wall or the pricing page. This reverses the
  2026-10-31 "no free access" call, by the founder's 2026-11-08 decision.
- **Everything else still fails open to `label`.** Trial, grace, comped,
  founding, legacy and unknown plans are unchanged. Credits-only (bought or
  monthly credits) is still checked before Free and is still Solo.
- **Credits:** `monthlyAllowanceCredits` grants 30 a month to state `free`
  (calendar-month window, no billing anchor). Free is not a subscriber: no
  overage, credits-only top-up prices. Leftover trial credits are removed for a
  Free team the same way they were for a walled one.
- **The wall never offers Free** (`WALL_TIERS` excludes it) and Free is not a
  `SelfServeTierId`, so nothing can resolve a Paystack Plan for it.
- `walled` stays in the state union (multi-team combination, admin filters),
  but `resolveTeamAccess` no longer returns it.

### Payments and data

- Paystack Plans for Solo Plus, live account, minted 2026-11-08:
  `PLN_hqvg6asurmm038a` (₦12,000 monthly) and `PLN_45a76826d431tb8`
  (₦120,000 annually). Set on Vercel `urganize` Production as
  `PAYSTACK_PLAN_SOLO_PLUS_V3_PER_MONTH_NGN` / `_PER_YEAR_NGN` (non-sensitive).
- Solo Plus in dollars is $19 a month (`USD_MONTHLY_PRICE`), decided
  2026-11-08: the usual step between Solo $9 and the first team plan at $29.
- Migration `20261108120000_subscriptions_allow_solo_plus.sql` widens the six
  plan CHECK constraints for `solo_plus` (not `free`: nothing writes it).
  Applied to production 2026-11-08 after backing up `subscriptions`,
  `payment_invoices`, `checkout_clearances`, `trm_partner_ledger` (`*_backup_20261108`)
  and `bachs_checkouts` (`bachs_checkouts_backup_20261108b`).
- Retention offers (`lib/cancel-flow.ts`) cover Solo Plus since 2026-11-08:
  `RETENTION_TIERS` is the one list. Its low band offers Solo; its two
  discounted offers need `PAYSTACK_PLAN_SOLO_PLUS_RETENTION_{8000,11000}`
  minted, and stay hidden until then, like every other tier's.
