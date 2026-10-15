# Performance

How app.urganize.app stays fast on a mid-range Android phone on a slow
Nigerian mobile connection, and the budget every change is held to. Written
2026-10-15 during the perf pass (Linear URG-314, v1.147.5 to v1.147.7).

## Budget

Measured from a local `next build` of `apps/web`: for each route, sum the gzip
size of every `/_next/static/*.js` file that `.next/server/app/<route>.html`
references, i.e. what a cold visit downloads before the page works.

| What | Budget | 2026-10-15 before | after v1.147.6 |
| --- | --- | --- | --- |
| Shared first-load JS, gzip (`/auth`, `/`, `/locked`) | **< 250 KB** | 400-414 KB | 350-362 KB |
| `/dashboard` first-load JS, gzip | < 350 KB | 524 KB | 444 KB |
| Other `/dashboard/*` first-load JS, gzip | < 300 KB | 419-475 KB | 372-438 KB |
| Lighthouse mobile (slow 4G, simulated), `/auth` | >= 80 | 47 (LCP 6.1 s, TBT 2.57 s) | 49-65 (LCP 3.4-5.2 s, TBT 1.8-1.9 s) |
| Fonts preloaded on `/auth` | 2 | 2 | 2 |

We are still over budget. The table is the target, not a description of today.
A change that grows shared first-load JS by more than 5 KB gzip needs a reason
in its commit message.

## Architecture notes

**Root layout is the shared bundle.** `app/layout.tsx` mounts `AppShell`, which
mounts `TaskUIProvider` and imports `lib/auth-store`. Everything those import
statically ships to every route, `/auth` included. Before adding a static
import anywhere on that chain, ask whether the user needs it before first
paint. If not, use `next/dynamic` or a plain `import()`.

**Keep heavy data off the auth-store chain.** The release playbooks
(`lib/release-templates/{single,ep,album}.ts`, ~90 KB minified) used to reach
every page through auth-store -> first-session -> onboarding-readiness ->
release-planning -> loader. Pure helpers now live in
`lib/release-templates/metrics.ts`, `lib/plan-phase.ts` and
`lib/ready-today.ts`. `lib/release-templates/metrics-guard.test.ts` fails if
template data comes back onto that chain.

**Lazy surfaces, warmed on idle.** Task detail pop-up, quick-create modal, the
two completion sheets (`components/tasks/TaskUIProvider.tsx`) and the release
scene panel plus timeline (`components/workspace/WorkspaceView.tsx`) are
separate chunks. Inside the app they are prefetched with `runWhenIdle` only
when `shouldBackgroundPrefetch()` allows it (`lib/connection.ts`: skipped on
Save-Data and 2G), so the first tap still opens instantly.

**Analytics after load.** PostHog (`lib/analytics/client.ts`) imports and
initialises only after `window.load` plus an idle callback. Events captured
earlier queue on the same promise. Surveys are off (`disable_surveys: true`),
which saves a ~33 KB script per page view. The `/urg-relay` first-party proxy
is unchanged and pinned by its test.

**Fonts.** Three faces, declared once in `app/layout.tsx`. Space Mono is not
preloaded. The content calendar reads `--font-cc-display` / `--font-cc-mono`,
defined in `globals.css` from the layout's variables. Never call
`next/font/google` outside the root layout.

**Region.** Vercel functions run in `dub1` (`vercel.json`), next to Supabase in
eu-west-1. They used to run in `iad1`, so every database round trip crossed the
Atlantic. Check with `curl -sI https://app.urganize.app/api/version` and look
for `dub1` in `x-vercel-id`.

**`packages/ui` is `"sideEffects": false`.** Its modules only export
components and functions. Do not add top-level side effects there (CSS imports,
global listeners) without removing the flag.

## Service worker (`public/sw-offline.js`)

Live in production (`NEXT_PUBLIC_FEATURE_OFFLINE=true`). Since v1.147.7:

- **Versioned per deployment.** `lib/offline/register.ts` registers
  `/sw-offline.js?v=<NEXT_PUBLIC_BUILD_ID>`. The build id comes from
  `next.config.js` (Vercel deployment id, else commit sha). Each deploy is a
  new script URL, so a fresh worker installs and `activate` deletes every older
  `urganize-offline-*` cache.
- **Stale-while-revalidate app shell.** A navigation to a signed-in app page
  (`/dashboard*`, `/settings`, `/admin`) is answered from the device when the
  cached copy is a static prerendered page (`x-nextjs-prerender: 1`) stamped
  with this worker's build (`x-urg-build`, a header `next.config.js` adds to
  every response). The network copy refreshes the cache in the background.
  Dynamic pages, public pages (`/auth`, `/epk`, `/credits`, `/capture`,
  `/curator`, `/join`, `/invite`) and everything else stay network-first.
- **Immutable chunks** (`/_next/static/*`) are cache-first.
- **Never cached:** `/api/*`, anything cross-origin (Supabase, PostHog), any
  non-GET, any response marked `private` or `no-store`, and any response
  stamped with a different build.
- **Sign-out** (`SIGNED_OUT` in `lib/auth-store.ts`) calls `clearAppCaches()`,
  which deletes every offline cache, so nothing from one account is shown to
  the next on a shared device.
- **Chunk recovery** (`components/providers/ChunkRecoveryBridge.tsx`,
  `lib/chunk-recovery.ts`) calls `purgePageCaches()` before it reloads, so the
  reload fetches current HTML instead of the stale shell that named the
  missing chunk. It waits at most 1 s.
- **Kill switch:** set `NEXT_PUBLIC_FEATURE_OFFLINE` to false. The next load
  registers the push-only `sw.js`, whose `activate` deletes every offline
  cache.
- Tests: `lib/offline/sw-offline.test.ts`.

## Open items (need Oyin or a plan change)

- **Skew Protection** (Vercel Pro). `deploymentId` is already set in
  `next.config.js`. Turning Skew Protection on keeps old chunks reachable after
  a deploy, which makes the chunk-recovery reload rare.
- **Session replay sampling.** PostHog session recording runs for every
  session. A sample rate (set in PostHog project settings) would cut its
  network and CPU cost on slow phones.
- **iOS WebView.** The Expo shell needs app-bound domains
  (`WKAppBoundDomains` listing app.urganize.app) and a new native build before
  WKWebView will run the service worker on iOS. Android WebView already
  supports it.
- **Supabase client** (~170 KB minified incl. realtime and storage) is still in
  the shared bundle. Realtime is unused client-side, so a slimmer client
  (auth + postgrest, storage loaded on demand) is the next biggest saving.
