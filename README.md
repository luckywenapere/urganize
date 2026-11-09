# Urganize

Urganize is an app that helps artists, managers and record labels plan new music and keep track of every task. It asks about your goals, then makes a plan that fits. You can also make your own. Use it solo or with a team. After every task, Urganize asks how it went, so you can see what worked when the release is out.

The target user is an independent music manager handling 1–3 artists, planning their next release in the next 90 days. The central object is the release; every feature ties back to one.

> **`CLAUDE.md` is the source of truth** for scope, architecture, and conventions. This README is the quick orientation; when they disagree, CLAUDE.md wins.

## What v1 does

1. **Release object** — date, type (single/EP/album/music video), artist, team, status.
2. **AI-tailored rollout plans from hand-crafted templates** — a version-controlled template (64 tasks across 11 weeks for a single) is instantiated into real tasks at release creation; AI tailoring is feature-flagged.
3. **Tasks with assignees and dependencies** — status, priority, due dates, blocker-aware completion with auto-unlock.
4. **File/asset attachment** — artwork, masters, contracts in Supabase Storage.
5. **Event milestones** — dated points (video shoot, listening party, release day) on the release timeline.
6. **AI status update generator** — one-paragraph narrative status from live release state (feature-flagged).

## Repository layout

pnpm + Turborepo monorepo with two deployable apps:

```
urganize/
├── apps/
│   ├── homepage/          # Marketing site + waitlist + admin growth (www.urganize.app)
│   └── web/               # Authenticated product app (app.urganize.app)
├── packages/
│   ├── ui/                # Shared React primitives
│   ├── config/            # Shared tsconfig, ESLint, Tailwind preset
│   ├── pricing/           # Single source of truth for plan tiers/prices
│   ├── lib/               # Stub placeholder
│   └── db/                # Stub placeholder
├── supabase/migrations/   # SQL migrations for the web app database
├── scripts/run-turbo.cjs  # Wrapper the root build/dev/lint/test scripts call
└── turbo.json, pnpm-workspace.yaml, vercel.json
```

## Tech stack

- **Framework:** Next.js 16 App Router, React 19, TypeScript 5 (strict) in both apps. No separate backend — Route Handlers under `app/api/**/route.ts` are the API layer.
- **Databases (two, unconnected):**
  - `apps/web` → **Supabase** Postgres (RLS on every owned table), schema managed only through `supabase/migrations/*.sql`.
  - `apps/homepage` → **Neon** Postgres via Prisma 6 (`apps/homepage/prisma/`), waitlist only.
- **Auth:** Supabase Auth (email/password + Google OAuth) in web; per-route bearer-token checks, no `middleware.ts`. Homepage admin views use a shared-secret cookie.
- **State:** Zustand stores (`apps/web/stores/`, `lib/auth-store.ts`).
- **Styling:** Tailwind v3 (web) / Tailwind v4 (homepage), shared preset in `packages/config`.
- **Payments:** Paystack recurring checkout + HMAC-validated webhook. Plans defined in `packages/pricing`.
- **Analytics:** PostHog (web), Vercel Analytics (both), Google Analytics (homepage). See [ANALYTICS.md](ANALYTICS.md) and [PRIVACY.md](PRIVACY.md).
- **AI:** two integration points only (rollout-plan tailoring, status updates) behind `apps/web/lib/ai/provider.ts`; both feature-flagged. Templates work without AI.

## Getting started

Prereqs: Node 20 (`.nvmrc`), pnpm 10.

```bash
pnpm install

# copy env templates and fill in real values (each file documents every var)
cp apps/web/.env.example apps/web/.env.local
cp apps/homepage/.env.example apps/homepage/.env.local

pnpm dev          # turbo runs both apps' dev servers
```

See [QUICKSTART.md](QUICKSTART.md) for a step-by-step local setup, including running one app at a time.

## Commands

All root scripts fan out through Turborepo:

| Command | What it does |
|---|---|
| `pnpm dev` | Dev servers for both apps |
| `pnpm build` | Production build (type-checks everything, including test files) |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm test` | Vitest unit tests (`apps/web/lib/*.test.ts`) |

Scope to one app with `pnpm --filter @urganize/web <script>` or `--filter @urganize/homepage`.

**Tests are deliberately narrow for v1:** pure-logic units for the highest-consequence paths — billing expiry math, plan resolution, the paywall allowlist, the subscription snapshot, and a containment guard that stops the deprecated schema-missing-fallback pattern from spreading to new routes. Components and flows are manually tested. Run `pnpm test` before touching billing/access code.

## Deployment

Vercel, two projects on this one repo, auto-deploying from `main`:

- `Web` → `app.urganize.app` (builds `apps/web`)
- `the-urganization` → `www.urganize.app` (builds `apps/homepage`)

Both use `npx turbo-ignore` so a push only rebuilds the app it touched. PRs get preview deployments. There is **no VERSION file or CHANGELOG** — the repo deploys continuously and release history lives in git. Full deploy config: the "Deploy Configuration" section of [CLAUDE.md](CLAUDE.md).

## Documentation map

| Doc | Status |
|---|---|
| [CLAUDE.md](CLAUDE.md) | **Source of truth** — scope, architecture, conventions, build history |
| [TODOS.md](TODOS.md) | Tracked follow-up work (priority-tagged) |
| [ANALYTICS.md](ANALYTICS.md) | PostHog setup and event conventions |
| [PRIVACY.md](PRIVACY.md) | Session-replay privacy safeguards |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | High-level current-state summary |
| [QUICKSTART.md](QUICKSTART.md) | Local development setup |
| [REFACTOR_NOTES.md](REFACTOR_NOTES.md) | Dated audit of `apps/web` (point-in-time record) |
| [AUDIT.md](AUDIT.md) | Dated marketing-site audit (point-in-time record) |
| [CUT_PLAN.md](CUT_PLAN.md) | Historical v1 cut plan (executed) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | **Historical** — predates the monorepo; use CLAUDE.md's Deploy Configuration instead |
