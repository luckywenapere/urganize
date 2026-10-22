# The self-refresh after an idle tab, and where it lands (2026-08-31, v1.10.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report: leaving the app for a while, coming back and trying to navigate
refreshes the whole page — "it's not meant to be so", and it should keep its
state instead.

**The refresh is ours and it is deliberate.** `ChunkRecoveryBridge` is the only
thing in the app that reloads a page on its own (every other
`location.reload()` is behind a user-clicked Retry). It fires on one narrow
error: a JS chunk that 404s. That is version skew — a tab holds its build's
asset URLs, we deploy continuously from `main`, and once a new deployment takes
the production alias those files are gone. Nothing throws inside React, so
without the reload the page stays painted and every control is dead. **Do not
"fix" the reload away; it is the cure for a worse bug.**

**Ruled out, so nobody re-investigates:** there is no focus/`visibilitychange`/
`online`/`pageshow` refetch listener anywhere in the app; `TOKEN_REFRESHED` in
`lib/auth-store.ts` is deliberately non-flickering and `INITIAL_SESSION`
releases the loading gate without one; and `lib/access-redirect.ts`'s 402
interception navigates to `/locked` (visibly different) rather than refreshing
in place. State also already survives — command-center, scene data, notes,
identity and curator stores are all cache-first over `localStorage`, so a
reload repaints rather than restarting. The one genuine loss is an open UrgAns
conversation, which is memory-only and already recorded as deferred.

**THE REAL FIX IS NOT CODE, AND IT IS STILL NOT DONE: Vercel Skew Protection is
off.** `next.config.js` has stamped the deployment id onto asset requests since
2026-08-16 and its comment says the line does nothing without the project
setting. Verified rather than assumed on 2026-08-31: built with
`VERCEL_DEPLOYMENT_ID` set, and every asset URL in the prerendered HTML carries
`?dpl=<id>` (189 of them on `/settings` alone), so **the toggle will take
effect the moment it is switched on** — Vercel → the `Web` project → Settings →
Advanced → Skew Protection. Two unknowns I could not settle: vercel.com is
egress-blocked from the sandbox, so the exact menu path is from memory, and
**this account is on the HOBBY plan** (the same plan that caps crons at one a
day), so confirm Skew Protection is even offered there. If it is not, this
fallback is all there is until the plan changes.

A hypothesis checked and DISCARDED, so it is not re-litigated:
`VERCEL_DEPLOYMENT_ID` is not declared in `turbo.json`'s build `env`, and
Turborepo 2 defaults to `envMode: strict` — but a probe showed it passes
through to the build in **both** strict and loose mode, so no turbo change is
needed. It is also absent from the task's hash, which is the desirable half (it
changes every deploy and would otherwise bust the build cache).

**What this version actually changed: the recovery now RESUMES the navigation
instead of reloading the page being left.** The failure is a navigation, so
when the router had not yet committed the new URL a plain reload silently ate
the click — the user tapped a link and got a refresh, still standing where they
started, which is exactly what was reported. Three things worth knowing:

1. **It is a proven no-op in the case where the old behaviour was already
   right.** `resolveRecoveryTarget` returns null — meaning plain reload —
   whenever the destination is already the current page, which is what happens
   if the router DID commit the URL first. So there is no case where this lands
   somewhere the user did not ask for, and that matters because **which of the
   two cases Next actually produces cannot be observed from here** (it needs two
   live deployments, a browser and a session). Mutation-tested: dropping that
   guard fails exactly two named tests.
2. **The click listener is CAPTURE phase, and must stay there.** Next's `Link`
   calls `preventDefault()` to route client-side, so by the bubble phase every
   real in-app click already looks cancelled — precisely the set we need to
   record. The flip side is that `defaultPrevented` is meaningless that early,
   so `LinkClick` deliberately has no such field rather than checking a flag it
   cannot trust.
3. **Everything else fails toward a plain reload:** no intent, a stale or
   clock-skewed one (15s TTL), an unparseable URL, a cross-origin target, a
   hash-only difference, a modified/middle click, `target="_blank"`, a
   `download` anchor, or a non-http scheme (`mailto:`, `tel:`, the Capacitor
   deep link). The recorded href is somewhere the browser may later be sent, so
   the refusals are the half that matters. Origin and staleness were both
   mutation-tested too.

Also unfixable and worth saying out loud: **phones discard background tabs to
reclaim memory**, and the browser then reloads the document itself with no app
code involved. If a refresh happens when nothing was deployed, that is what it
is. The console line `[chunk-recovery] stale build detected` is the
discriminator — present means skew, absent means the browser did it.

**Doc-drift flagged, not silently backfilled:** the whole 2026-08-16
chunk-recovery stack (`lib/chunk-recovery.ts`, `ChunkRecoveryBridge`, the
`deploymentId` line) was built and shipped without ever being recorded in this
file — the same failure mode flagged for Web Push and the mobile shell. This
section is the first mention of it; there is no separate 2026-08-16 entry to
reconcile.

- **Verified:** 1838 tests (15 new, all three new guards mutation-tested),
  `eslint .` at the exact 3-error / 70-warning baseline with **zero** new
  findings, and `next build` green by exit code with `/auth`, `/onboarding` and
  `/settings` still `○ Static`. The resume path was confirmed present in the
  compiled client bundle rather than trusted from source.
- **Not verified:** no browser and no real skew event. This sandbox cannot mint
  a session and has no network route to app.urganize.app, so the click
  recording and the resume have only ever run as pure functions. It is safe by
  the no-op property in point 1 rather than by observation.
