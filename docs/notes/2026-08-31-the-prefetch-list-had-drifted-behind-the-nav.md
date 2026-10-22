# The prefetch list had drifted behind the nav (2026-08-31, v1.10.2)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request, straight after the refresh fix above: *"load the entire app in
the background so whenever users want to navigate it's fast and there is no
latency."*

**Most of this was already built, which is the first thing to know before
adding more.** `AppShell` has warmed route chunks on idle since the perf pass —
gated on `shouldBackgroundPrefetch()` (Data Saver and 2g excluded,
`lib/connection.ts`) and wrapped in `runWhenIdle`. `useScenePrefetch` warms the
scoped release's scene DATA the same way. `loadCommandCenter` and the scene,
notes, identity and curator stores are all cache-first over `localStorage`.
Scene CODE needs no prefetch at all: `ReleaseScenePanel` uses no `dynamic()`,
so every scene ships in the dashboard bundle and is warm the moment
`/dashboard` is.

**What was actually wrong: `PREFETCHED_ROUTES` was three hardcoded entries and
the nav had outgrown it.** `/dashboard`, `/dashboard/urgans` and `/settings`
were warm while `/dashboard/notes`, `/dashboard/shows` and the dual-account
`/curator` crossing — all primary nav destinations by then — were cold on every
load. Same drift class as the four hand-rolled copies of the scene-flag
expression and the two `100vh` document floors: a list that has to be kept in
step with something else, and wasn't.

The list now lives in `lib/prefetch-routes.ts` as `buildPrefetchRoutes`, so it
is flag-aware, account-aware and unit-tested.

**Four things a later change will be tempted to get wrong:**

1. **It is NOT "the entire app", and the founder's wording should not be read
   as asking for that.** Prefetching is bytes now for latency later, and this
   product's users are largely on metered Nigerian mobile data — the reasoning
   already written into `lib/connection.ts`, and the same constraint that got
   framer-motion deleted and that cost a real curator his sign-up over 1.0 MB
   of chunks. The rule is "every destination the primary nav offers, and
   nothing else": public token pages (`/epk`, `/credits`, `/capture`, `/pack`)
   are for strangers arriving with a link, the money and identity flows
   (`/locked`, `/start-trial`, `/payment`, `/redeem`, `/oauth/authorize`,
   `/invite`, `/join`) are one-time or exceptional, `/admin` is reachable by a
   couple of accounts, and the redirect stubs resolve to routes already on the
   list. Warming any of them spends bytes on pages most users never see once.
2. **Every route is gated on the same flag its nav entry is gated on.** With a
   flag off those pages bounce or 404, so prefetching them is pure waste. The
   flags are read at module scope (the `NEXT_PUBLIC_*` inlining pattern), so
   the tests re-import the module per case with `vi.resetModules()` +
   `vi.stubEnv` — the `intent-router.test.ts` approach — and assert BOTH
   states rather than trusting the ambient environment.
3. **`hasCuratorProfile` is tri-state and `null` must stay "not yet", never
   "no".** It is the documented dual-account trap with a cheaper consequence
   than usual: read as `no`, a playlist owner's crossing simply never warms.
   The effect has it in its dependency array on purpose, so the crossing is
   warmed once the probe answers; re-running is free because `router.prefetch`
   is idempotent. Mutation-tested.
4. **`buildPrefetchRoutes` returns a fresh array.** It is called from inside an
   effect on every relevant change, and handing out the shared base list would
   let one caller's mutation leak into every later call. Also mutation-tested.

**Verified:** 1846 tests (8 new, three guards mutation-tested — the tri-state,
the flag gate and the array copy each fail exactly their own test), `eslint .`
at the exact 3-error / 70-warning baseline with **zero** new findings, and
`next build` green **by exit code** in BOTH flag states with `/auth`,
`/onboarding` and `/settings` still `○ Static` in each.

**A non-signal worth recording, because it was tried:** grepping the client
chunks for `"/dashboard/shows"` proves nothing about the flag — the nav
components compile both ternary branches in, so the string is present either
way. This is the same false positive already recorded for "Fan capture", "Press
kit" and the EP/album flip. The unit tests are the real check here.

**Not verified:** nothing was measured in a browser and no timing was taken —
this sandbox cannot mint a session and has no network route to
app.urganize.app, so "navigation is now instant" rests on the mechanism plus
the tests, not on an observation. Worth one look on a real phone: reload, wait
a beat, then tap Notes and Shows.

**Still cold on purpose, so nobody reads this as a total win:** scene data for
releases OTHER than the scoped one. Warming all of them is O(releases × 6) API
calls, which is exactly the waste the list above is written to avoid.
