# Quickstart — local development

Get the Urganize monorepo running locally. For what the product is and how the repo is laid out, read [README.md](README.md) first; for architecture and conventions, [CLAUDE.md](CLAUDE.md).

## 1. Prerequisites

- **Node 20** — the repo pins it in `.nvmrc` (`nvm use` picks it up).
- **pnpm 10** — `corepack enable` or `npm install -g pnpm`. The repo declares `packageManager: pnpm@10.6.4`; npm and yarn will not resolve the workspace correctly.

## 2. Install

```bash
pnpm install
```

One install at the repo root covers both apps and all shared packages.

## 3. Environment variables

Each app documents every variable it reads in its own `.env.example`, with `[required]` / `[optional]` markers:

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/homepage/.env.example apps/homepage/.env.local
```

What you actually need depends on which app you're running:

- **`apps/web`** (the product) needs a real **Supabase** project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` at minimum. There is no mock auth — sign-in goes through Supabase Auth. Apply the SQL in `supabase/migrations/` to your project so the schema exists.
- **`apps/homepage`** (marketing) needs a **Neon** Postgres `DATABASE_URL` for the waitlist/admin surfaces; the static marketing pages render without it.
- Paystack, PostHog, and the AI gateway vars are optional locally — the features they power degrade gracefully or are feature-flagged off.

## 4. Run

```bash
pnpm dev                                  # both apps via turbo
pnpm --filter @urganize/web dev           # just the product app
pnpm --filter @urganize/homepage dev      # just the marketing site
```

Both apps default to port 3000, so when running both at once one of them will be offered the next free port — check the terminal output for the actual URLs. Running the single app you're working on is the usual mode.

If the homepage complains about a missing Prisma client, generate it once:

```bash
pnpm --filter @urganize/homepage prisma:generate
```

## 5. First run in the product app

1. Open the web app and sign up at `/auth` (email/password or Google, against your Supabase project).
2. New accounts hit the paywall. Start the **28-day trial** from the `/locked` page — no card required.
3. Create a release from the dashboard (release date is required). The single-release template instantiates ~64 tasks automatically.
4. Explore: click a release card to scope the tasks panel, open a task drawer, upload an asset on the release detail page.

## 6. Verify your changes

```bash
pnpm test    # vitest unit tests (billing/access logic + pattern guards)
pnpm lint    # eslint across the workspace
pnpm build   # next build — this is the type-check gate
```

All three must pass before a PR. Note that `pnpm build` type-checks test files too, and Vercel does not run the test suite — run it yourself.

## Common issues

| Symptom | Fix |
|---|---|
| Workspace packages not found | You used npm/yarn — remove `node_modules`, run `pnpm install` |
| Engine/version errors | `nvm use` (Node 20) |
| Supabase 401s locally | Check the three Supabase vars in `apps/web/.env.local`; restart the dev server after editing env files |
| Tables missing / API 500s | Apply `supabase/migrations/*.sql` to your Supabase project, in filename order |
| `@prisma/client` did not initialize | `pnpm --filter @urganize/homepage prisma:generate` |
| Port 3000 in use | `pnpm --filter @urganize/web dev -- -p 3001` |
