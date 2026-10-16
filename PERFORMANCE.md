# Performance

How app.urganize.app stays fast on a mid-range Android phone on a slow
Nigerian mobile connection, and the budget every change is held to. Written
2026-10-15 during the perf pass (Linear URG-314, v1.147.5 to v1.147.8).

## Budget

Measured from a local `next build` of `apps/web`: for each route, sum the gzip
size of every `/_next/static/*.js` file that `.next/server/app/<route>.html`
references, i.e. what a cold visit downloads before the page works. That
total includes Next's legacy polyfills chunk (~39 KB gzip), which carries
`noModule` and is skipped by every modern browser; `measure.py` reports both
("js gz" and "modern gz"). The budget is held against the full figure.

| What | Budget | 2026-10-15 before | after v1.147.6 | after v1.147.8 | after v1.153.1 |
| --- | --- | --- | --- | --- | --- |
| Shared first-load JS, gzip (`/auth`, `/`, `/locked`) | **< 250 KB** | 400-414 KB | 350-362 KB | 321-333 KB (modern browsers 283-295 KB) | 307-318 KB (modern 268-279 KB) |
| `/dashboard` first-load JS, gzip | < 350 KB | 524 KB | 444 KB | 416 KB | 417 KB (modern 378 KB) |
| Other `/dashboard/*` first-load JS, gzip | < 300 KB | 419-475 KB | 372-438 KB | 343-409 KB | 331-402 KB (modern 293-363 KB) |
| Lighthouse mobile (slow 4G, simulated), `/auth` | >= 80 | 47 (LCP 6.1 s, TBT 2.57 s) | 49-65 (LCP 3.4-5.2 s, TBT 1.8-1.9 s) | 86-93 (LCP 1.3-1.5 s, TBT 320-560 ms) | see URG-314 |
| Fonts preloaded on `/auth` | 2 | 2 | 2 | 2 | 2 |

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

**Browser Supabase client is auth + PostgREST only** (v1.147.8,
`lib/supabase/client.ts`). The browser uses Supabase for auth and a few
profile reads; data goes through `/api`. So `supabase` is a hand-built
`AuthClient` (`@supabase/auth-js`) plus a bare `PostgrestClient`
(`@supabase/postgrest-js`) behind the same `supabase.auth` / `supabase.from`
call sites. Realtime (only the notifications bell) loads on demand through
`getSupabaseRealtime()`. Storage and Functions are never used in the browser.
Rules: never value-import `@supabase/supabase-js` on the shared chain (types
are fine); keep the auth options and storage key identical to `createClient()`
(a different key signs everyone out); keep `@supabase/auth-js` and
`@supabase/postgrest-js` pinned to the installed supabase-js version.
`lib/supabase/client.test.ts` pins all three. Saved ~29 KB gzip on every route.

**Signed-in round trips.** `checkAuth` reads the profile alongside `getUser()`
(the read carries its own token header, so it takes no auth lock; anything that
writes still waits). Every protected API route runs the curator check and the
team-access read in parallel (`app/api/_shared/auth.ts`), and
`getTeamAccessForUser` dedupes concurrent calls and reads owner profiles and
subscription snapshots together. `/api/home` runs the show side (DJ-link waits,
next show's setlist) alongside the catalog load instead of after it, and the
role facts read the roster and the owner's plan together.

**Tried and dropped (v1.147.8): splitting the workspace chrome into its own
chunk.** Moving TopNav, side menu, page bar and bottom bar behind
`next/dynamic` cut `/auth` by ~18 KB but grew `/dashboard` by ~35 KB (modules
duplicated across the new chunk boundary), and without its chunk preloaded it
delayed hydration of the page inside it. Net loss, reverted. The attempt is
kept outside the repo. Revisit only with a split that does not wrap `children`.

**Sign-out reset registry** (v1.153.1, `lib/sign-out-resets.ts`). Each store
that holds one account's data calls `registerSignOutReset(id, reset)` at module
scope, and `SIGNED_OUT` in `lib/auth-store.ts` calls `runSignOutResets()`.
auth-store imports no store, so a page that never loads a store never ships
it. A store that never loaded in the tab holds nothing in memory. What lives
in browser storage outlives the tab, so auth-store still clears those keys by
name on every sign-out (the scene cache key, `clearChatCache()`). Order is
fixed in `SIGN_OUT_RESET_ORDER` ('chappi-history' before 'chappi'). A new
per-account store must register itself; `lib/sign-out-resets.test.ts` pins
the list. Also in v1.153.1: `InviteGate` is `next/dynamic` (ssr:false), the
offline queue flush is a plain `import()`, and shared-chain files import
`@urganize/ui` by subpath (`@urganize/ui/Button`, `/LoadingScreen`, `/Input`,
`/Logo`) instead of the barrel.

**Tried and dropped again (v1.153.1): mounting the workspace chrome from
route layouts.** Moving TopNav, side menu, page bar, bottom bar, search bar
and UrgAns launcher from AppShell into a `WorkspaceFrame` mounted by
`app/dashboard/layout.tsx` and `app/settings/layout.tsx` cut ~25-33 KB gzip
off `/auth`, `/`, `/locked` and onboarding but added ~4-12 KB to the
dashboard routes. Two problems with the server HTML: (1) a page that bails out
of static rendering is caught by `app/loading.tsx`, which now sits OUTSIDE the
frame, so the chrome vanished from `/dashboard/*` first paint (fixable: a
`<Suspense fallback={<RootShellSkeleton />}>` around `children` inside
`<main>` made `/dashboard/tasks`, `/dashboard/home` and `/settings` match prod
exactly); (2) on `/dashboard` the frame's own client-reference chunk load
suspended during prerender, so the root loading boundary streamed the brand
skeleton first and swapped the whole frame in by inline script (`$RC`),
unlike prod. Not fixable without a boundary above the layout, so the move was
reverted. Attempt kept outside the repo. Revisit only if the root
`loading.tsx` goes or the frame stops being a separate client reference.

## Known failing tests on main (2026-10-16)

`vitest run` in `apps/web` has 7 failures in 6 files that predate URG-314
batch 5 and come from other work: `editorial-overview-guard`,
`field-border-guard`, `help-copy`, `profile-bio-guard`,
`shell-sidebar-guard` (page bar + side menu, 2 tests) and
`usage-metrics-guard`. A perf change must add none.

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
- **Remaining budget (2026-10-16, after v1.153.1).** About 180 KB gzip of
  every route is a fixed floor: `react-dom`, the Next router/runtime and
  `@supabase/auth-js`. Shared first-load is 307-318 KB, so the 250 KB budget
  needs ~60 KB more out of app code. Next cuts, in order:
  1. `TaskUIProvider` and the task stores off the root layout (mount from the
     workspace routes or load on demand): ~25 KB minimum.
  2. Lazy social-share (`withFirstShareOffer`, share sheet wiring) and the
     team-billing helpers auth-store imports: ~10 KB.
  3. Split `components/icons/house.tsx` so the shared chain stops carrying
     every icon. Pending coordination: the side menu icon work that shipped
     2026-10-16 lives there.
  4. Voice imports on `HomeAskBar` / `ChappiConversation` and `NextShowCard`
     once Feature Cuts has hidden those features (voice and Shows are off as
     of v1.149.0, so the code can go behind `import()` or be removed).
