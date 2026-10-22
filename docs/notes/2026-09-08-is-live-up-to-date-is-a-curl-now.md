# "Is live up to date?" is a curl now (2026-09-08)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder: several pushes across several sessions did not go live, and there was
no way to tell from outside. Two things came out of it — a measured cause, and
an endpoint so the question never needs a dashboard again.

**THE CAUSE is the deploy cap the Deployment section above documents in
full** — read that rather than this for the mechanism, the per-project
exhaustion and the recovery. Two things measured here that it does not carry.
**21 merges to `main` in 24 hours**, which at the four deployments per merge
that section establishes is **about 84 against a cap of 100**. And **ALL 21
touched a root-level file** (`CLAUDE.md`, every time) while only 8 touched
`apps/web` and 2 touched `apps/homepage` — so most of that spend rebuilt an
app that had not changed, which is what makes a docs-only ignore step the
lever worth having.

**Corrected before merge:** this paragraph first said "42 production deploys",
counting only the production half of each merge and understating the real cost
by half. #552 had landed the exact arithmetic hours earlier and this section
was written without reading it.

**A rate-limited deploy is indistinguishable from a broken build**, which is
why this went unnoticed across sessions — and since re-merging burns four more
deployments against an exhausted budget, an endpoint that answers "did the
last one land" from outside the app is the cheap way to know whether a merge
is even worth making.

**`GET /api/version` on both apps.** Public, unauthenticated, never cached,
returning `{ version, commit, branch, builtAt, environment }` with a
seven-character sha. The check is:

```
curl -s https://app.urganize.app/api/version   # the product app
curl -s https://urganize.app/api/version       # the marketing site
git rev-parse --short origin/main
```

Matching shas mean live is current. **Both projects, because they deploy
independently and have already sat at different commits.**

**Five things worth knowing before editing this:**

1. **NO AUTH, and none may be added.** An endpoint that needs a login cannot
   answer the question it exists for, which is asked from outside the app.
   `deploy-version.test.ts` reads both route sources and fails if any auth
   helper appears, because "do not add auth here" is not something a comment
   can enforce.
2. **THE PAYLOAD SHAPE IS THE SECURITY BOUNDARY.** This is public on a private
   repo. A test pins the exact five keys and scans all three files for `KEY`,
   `SECRET`, `TOKEN`, `PASSWORD`, `SERVICE_ROLE` and `createAdminClient` —
   anything added here is added to something the whole internet can read. The
   short sha is safe: skew protection already puts the deployment id in every
   asset URL publicly, and the repo is private.
3. **`force-dynamic` and `no-store`, both pinned by test.** A cached answer
   would report whichever build was live when the cache filled, which is the
   one thing this must never do.
4. **`BUILD_TIME` is stamped in each app's `next.config`**, evaluated once per
   build. A request-time `new Date()` would just report now.
5. **Absent, blank and whitespace all answer `unknown`.** Local dev has no
   `VERCEL_*` vars, and an endpoint that invents a commit sends somebody
   debugging the wrong deploy.

- **The homepage route is a deliberate 20-line duplicate** of
  `apps/web/lib/deploy-version.ts`: `apps/homepage` cannot import from
  `apps/web`, and moving five fields into a package for two operational
  endpoints costs more than it saves. Each site says so, and the shape must
  stay identical to its sibling, which has the tests. A third consumer is the
  moment to promote it.
- **The real fix for the burn is the Ignored Build Step, and it is built now**
  — see the section below. On those 24 hours it would have turned about 84
  deployments into roughly 40, since 11 of the 21 merges touched no app at all.
- **Verified:** 2892 tests (9 new in `lib/deploy-version.test.ts`), `eslint .`
  at both apps' exact baselines (web 3 errors / 81 warnings, homepage 0 / 2),
  `tsc --noEmit` clean apart from the documented pre-existing
  `confirmed-action.test.ts` errors, and `next build` green **by exit code**
  for both apps with `/api/version` compiling as `ƒ` and `/auth`,
  `/onboarding`, `/settings` still `○ Static`. **Probed for real** on
  `next start` with fake `VERCEL_*` env: both apps answer 200 unauthenticated
  with `cache-control: no-store`, and the commit they report
  (`0cabd27`) matches `git rev-parse --short origin/main` exactly.
- **Not verified:** whether the LIVE sites answer it, since this sandbox has no
  route to either domain. That is the point of the endpoint rather than a gap
  in it — but it does mean the first real read has to happen on a browser or a
  machine that can reach them, and only after a deploy actually lands.
