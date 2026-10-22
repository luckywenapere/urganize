# PostHog was never recording anything, for three stacked reasons (2026-09-03 → 09-04)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The other half of the founder's ask — *"can PostHog catch bugs and
automatically report to Linear as well"* — and the answer is yes, but getting
there meant finding **three independent faults, each of which produced exactly
the same symptom: no events, no error, nothing on screen.** Each fix looked
like it should have been the fix. Recorded in full because the symptom is
indistinguishable from "nothing is crashing", and because two of the three
are traps a future change can walk straight back into.

**No changelog entry and no version bump for any of it** (internal
instrumentation, no user-visible change) — except v1.23.0, which the reporting
feature itself earned.

### Fault 1 — `capture_exceptions` was never set (#491)

posthog-js does not capture exceptions unless asked. It is set EXPLICITLY in
`lib/analytics/client.ts` rather than left to the dated `defaults` bundle,
because it is the one capture behaviour whose absence is invisible.

Two pieces of doc-drift were corrected in the same pass, both in this file:
the Known-issues claim that there are **no React error boundaries** (there are
three — `app/error.tsx`, `app/global-error.tsx`,
`components/app/ErrorBoundary.tsx`), and the 2026-08-24 note that
`NEXT_PUBLIC_POSTHOG_KEY` is unset in production (it was set at the same time).
`turbo.json` also still declared `NEXT_PUBLIC_POSTHOG_TOKEN`, a name the code
has never read; replaced with the two it does.

**That turbo declaration was NOT what kept PostHog dark, and the wrong theory
is worth recording so nobody re-derives it.** A build with a marker key proved
`NEXT_PUBLIC_*` reaches the client bundle whether or not turbo declares it —
Next.js framework inference covers the prefix. The declaration only ever
affected build hashing and documentation.

### Fault 2 — the key was a personal API key, and it was in the public bundle (#492)

`NEXT_PUBLIC_POSTHOG_KEY` held a **`phx_`** value. Those are two different
things with confusingly similar names:

- **`phc_` — project API key.** Public by design, belongs in a `NEXT_PUBLIC_`
  variable, identifies which project events land in.
- **`phx_` — personal API key.** A **secret**, scoped to a human, capable of
  reading and writing across the account.

So two harms at once. The SDK's `/array/<token>/config` request 404'd (a
personal key is not a project token), so posthog-js never initialised — and the
secret was compiled into the client bundle served to every visitor, and sent to
PostHog in a URL query string. The founder revoked it.

`describePostHogKeyProblem` in `lib/analytics/shared.ts` now guards
`getPostHogProjectKey()`, which is the single chokepoint both the browser and
node SDKs read. Three rules, and the asymmetry is deliberate:

1. **A `phx_` key is REFUSED**, returning `''` so both callers take their
   existing not-configured path, with a loud `console.error` saying it is a
   secret and should be revoked. Refusing rather than warning is the point: it
   stops a secret being transmitted to a third party.
2. **An unknown prefix is warned about but ALLOWED.** Blocking everything
   unrecognised would silently disable analytics if PostHog ever mints a new
   valid prefix. Blocking the one known-secret prefix is precise.
3. **The key is never logged** — only its prefix. A message that prints the
   secret defeats the purpose.

`lib/analytics/shared.test.ts` was the first test in `lib/analytics/`.

### Fault 3 — content blockers, which is the one worth reading twice

With a valid key the SDK still could not load: Firefox reported
`us-assets.i.posthog.com` with **status code (null)** — the request never left
the browser.

**The diagnostic that settled it, and is reusable:** Vercel's own
`/_vercel/insights/script.js` failed in the same session. That is
**same-origin**, and this app sets no CSP — so a same-origin script failing to
load can only be a browser-side blocker, never CORS, never our config. The
founder confirmed it by turning the shield off and watching every PostHog error
disappear.

**Fix 3a — the reverse proxy (#493).** `next.config.js` rewrites
`/urg-relay/*` to PostHog, so the traffic is first-party.
`lib/analytics/posthog-proxy.ts` holds the path and host resolution; the two
files cannot import each other (CommonJS, build time), so
`posthog-proxy.test.ts` LOADS `next.config.js` through `createRequire` and
asserts the resolved rewrites match. Drifting apart means the SDK posts into a
404, which looks exactly like having nothing to report.

Three things about it:

- **The `/static` rewrite must be matched BEFORE the catch-all**, or extension
  bundles are proxied to the ingest host and 404. Pinned by test.
- **`skipTrailingSlashRedirect: true` is required** — PostHog's ingest is
  sensitive to the trailing slash and Next would 308 it away before the rewrite
  runs. The app-wide cost was measured rather than assumed: `/settings/` still
  returns 200, so the only effect is a duplicate URL shape with no redirect,
  which nothing in this app emits.
- **The server SDK keeps the REAL host.** `lib/analytics/server.ts` must not go
  through the proxy — a Node process is not being blocked by anything, and
  routing it through our own rewrite would be a pointless hop.

**Fix 3b — bundle the extension, because the proxy was necessary and not
sufficient (#494).** THIS IS THE FINDING TO REMEMBER: **content blockers match
the URL PATH, not only the host.** The proxy path `/urg-relay` is opaque; the
filenames underneath are not. Measured in production, same-origin, with the
proxy live:

```
Loading failed for the <script> with source
"https://app.urganize.app/urg-relay/static/posthog-recorder.js?v=1.364.7"
"https://app.urganize.app/urg-relay/static/dead-clicks-autocapture.js?v=1.364.7"
```

And **posthog-js does not ship exception capture in its main bundle** —
`capture_exceptions: true` makes it lazily fetch a SECOND script,
`/static/exception-autocapture.js`, and only then start listening. So fault 1's
fix had been correct and inert for a day: the config was on and the listener
never existed.

`lib/analytics/posthog-extensions.ts` imports that 11.7 KB extension directly,
so it lands in a hashed webpack chunk under `/_next/static/chunks/` with
nothing left to match. Four things a later change will be tempted to get wrong:

1. **NOT `module.full.no-external.js`.** It inlines every extension and has no
   loader at all — but it is 445 KB against the current 181 KB and carries
   surveys, product tours and web vitals this app does not use. The same trade
   this repo already made when it deleted an animation library over 13
   fade-ins.
2. **The guard is not optional.** The core's loader is not an if/else —
   reduced from the minified bundle:
   ```js
   if (__PosthogExtensions__?.errorWrappingFunctions) { start() }
   __PosthogExtensions__?.loadExternalDependency?.(instance, name, start)
   ```
   Both statements run. With the extension bundled, an UNBLOCKED browser starts
   capture from our copy, then fetches the network copy and starts it AGAIN —
   and the start path assigns its listener handles over the previous ones
   without unsubscribing, so every thrown error would be reported twice.
3. **The guard REFUSES to install unless `errorWrappingFunctions` is actually
   registered.** If the chunk import failed, skipping the network fetch as well
   would leave capture off entirely. A redundant request is a console line; no
   capture is a silent hole. Mutation-tested.
4. **`installBundledExtensionGuard` takes `object`, not its own scope type.**
   Every field on that type is optional, which makes it a weak type TypeScript
   refuses to match against `Window` ("no properties in common").

**Fix 3c — session replay and dead clicks too, which changed the design
(#496).** #494 imported the exception bundle EAGERLY and suppressed the SDK's
own fetch. That does not scale: `posthog-recorder.js` is 250 KB, and importing
it eagerly would download a quarter of a megabyte on every page load for every
user whether or not recording ever starts.

So the guard REPLACES the loader instead of pre-empting it.
`BUNDLED_POSTHOG_EXTENSION_LOADERS` maps each extension name to its own
`import()`, webpack emits a separate chunk per entry, and the browser fetches
one at exactly the moment PostHog would have fetched the CDN copy — same
timing, same laziness, our origin. Measured in the build: 242 / 145 / 108 / 108
KB for the four recorder variants, 11 KB exception, 13 KB dead clicks, all
async, none merged into the posthog core chunk, nothing added to first load.

Three things about it:

- **Every recorder variant is mapped, not just the one in use.**
  `"posthog-recorder"` is NOT a literal in posthog-js's core — the recorder's
  script name comes from REMOTE CONFIG, and PostHog ships four. Mapping only
  today's would let a server-side switch silently return replay to blocked,
  which is the exact failure mode this whole section is about. Separate chunks,
  so it costs deploy size and no user transfer. Mutation-tested.
- **A failed chunk import falls back to the network fetch.** The fetch is
  probably blocked too, but a blocked request is a console line and a
  capability that just stops is invisible.
- **`remote-config` and `toolbar` are deliberately NOT bundled.** The first
  resolves to `/array/<token>/config.js`, per-project and generated, so there
  is no static file to import; the second only loads for a signed-in PostHog
  user.

### Ingest is fine, and knowing why saves a wrong turn

posthog-js posts events to `/e/`, which through the proxy is `/urg-relay/e/`
and matches nothing on any blocklist. So events could always leave; there
simply were not any. If this ever regresses, check the extension load before
suspecting ingest.

### Verified, and what actually proved it

Unit tests, mutation tests, lint at baseline and a green build for each of the
three PRs — but none of that could prove the diagnosis, because this sandbox
cannot reach either urganize domain (the agent proxy answers 403 to CONNECT).
**The proof was the founder's browser**: a thrown test error appeared in
PostHog → Error tracking → Issues with the blocker still on, and the
`exception-autocapture` failure line was gone from the console while
`posthog-recorder` and `dead-clicks-autocapture` still failed — exactly the
predicted shape.

### PostHog → Linear

Connected by the founder. Note the path moved: the Linear integration is under
**project settings**, NOT Error tracking → Configuration, which now only
carries a banner pointing at it. Suppression rules (Error tracking →
Configuration → Suppression rules) are where to silence the benign Supabase
`Navigator LockManager lock ... immediately failed` error, which is multiple
tabs racing the auth token refresh and is not a bug.
