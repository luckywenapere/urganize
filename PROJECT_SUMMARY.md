# Urganize — Project Summary

A high-level snapshot of what this codebase is and where it stands. The deep, always-current reference is [CLAUDE.md](CLAUDE.md); this file is the two-minute version.

> Earlier revisions of this file described the January 2026 localStorage-mock MVP. That prototype is long gone — see git history if you need it. What follows describes the shipped product.

## The product

Urganize is **a planning and coordination app for recording artists, managers and labels**. The music industry runs on chaos: group chats, spreadsheets, one overworked person holding every release together. Urganize v1 gives an independent music manager (1-3 artists, next release inside 90 days) one place for the plan, the tasks, the files and the status, all attached to the release.

**The plan is the spine.** A release (a rollout in the app) is the most common kind of work on it, next to shows, pitching, press and distribution. Hand-crafted release templates carry the domain knowledge; AI is a removable polish layer on top — the product works, degraded but functional, if AI is unavailable.

## v1 scope (built)

All six v1 scope items are built in code:

| Feature | Status |
|---|---|
| Release object (date, type, artist, team, status) | ✅ Shipped |
| Template-driven rollout plans (single template v0.3: 64 tasks / 11 weeks) | ✅ Shipped |
| Tasks with assignees, dependencies, blocker-aware completion | ✅ Shipped |
| File/asset attachment (Supabase Storage, signed URLs) | ✅ Shipped |
| Event milestones on the release timeline | ✅ Shipped |
| AI plan tailoring + AI status updates | ✅ Code-complete, feature-flagged off pending AI provider activation (Anthropic key + gateway routing) |

EP, album, and music video templates are still to be authored; every release currently instantiates the single template.

Payment gating is live: 28-day no-card trial, Paystack recurring checkout (Monthly / Annual / Label tiers from `packages/pricing`), 402 → `/locked` redirect for expired access.

## The shape of the codebase

- **Monorepo:** pnpm workspaces + Turborepo. Two deployable Next.js 16 / React 19 apps — `apps/web` (the product, app.urganize.app) and `apps/homepage` (marketing + waitlist admin, www.urganize.app) — plus shared `packages/` (ui, config, pricing, and two stub placeholders: lib, db).
- **Two unconnected databases by design:** Supabase Postgres for the product (RLS everywhere, schema only via `supabase/migrations/`), Neon + Prisma for the homepage waitlist.
- **Auth:** Supabase Auth in the product; per-route bearer validation via `requireActiveAuthenticatedUser` (most protected handlers call it through `requireAuthenticatedAdmin`, which composes the gate with the service-role client), no middleware.
- **API:** REST-style Next.js Route Handlers under `apps/web/app/api/`. No tRPC/GraphQL.
- **UI:** a two-pane workspace at `/dashboard` (releases column + scoped tasks panel) behind `NEXT_PUBLIC_FEATURE_WORKSPACE`, release detail at `/dashboard/releases/[releaseId]`, settings, onboarding, and a `/locked` paywall page. Six routes use thin server `page.tsx` wrappers (per-page metadata) around `*PageClient.tsx` client components.
- **Tests:** a deliberately narrow Vitest suite (`pnpm test`) covering billing math, plan resolution, the paywall allowlist, the subscription snapshot, and a guard that keeps the deprecated schema-fallback pattern contained. Everything else is manual for v1.

## Operating reality

- **Deploys:** Vercel, two projects, continuous from `main`. Preview deploys per PR. No VERSION/CHANGELOG — git is the history.
- **Users:** a handful of paying/subscribed users and design partners; the founder runs his own artists' releases through the product. Built for the case we have, not the case we might have.
- **Known issues and follow-ups:** tracked in CLAUDE.md ("Known issues") and [TODOS.md](TODOS.md).

## Where to go next

- Architecture, conventions, scope discipline, build history → [CLAUDE.md](CLAUDE.md)
- Run it locally → [QUICKSTART.md](QUICKSTART.md)
- Open follow-up work → [TODOS.md](TODOS.md)
