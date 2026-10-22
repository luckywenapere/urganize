# Logo and photo uploads: one resolver, own limits, self-reporting failures (2026-08-24)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The same curator came back with a sharper report: **desktop too**, and *"if I try to
upload profile or logo it doesn't and the page crashes."* That retires the
weak-connection story as the explanation, and it cannot be chased with devtools —
you cannot ask a partner to open a console. So this pass fixes what is provable
and makes the rest report itself.

**A theory checked and discarded, so nobody re-chases it.** `next/image` throwing
"Invalid src prop … hostname is not configured" looked like the crash:
`WorkspaceLogoSection` rendered a signed Supabase URL through `next/image` with no
`unoptimized`, and `next.config.js` derives `remotePatterns` from
`NEXT_PUBLIC_SUPABASE_URL` **at build time** (empty allowlist if it is missing).
But the installed Next 16.2.1 source settles it: that check sits under
`if (process.env.NODE_ENV !== 'production')` in
`next/dist/shared/lib/image-loader.js`, and `unoptimized` returns before the loader
runs at all (`get-img-props.js`). **In production it cannot throw** — an
unallowlisted host just makes `/_next/image` answer 400 and the image break.
Dev-only. Read the installed source before believing a Next error is your crash.

**The one deterministic bug, and it matches "the logo doesn't upload".** The two
halves of the logo upload used DIFFERENT workspace resolvers: `./upload-url` minted
the path with `ensureOwnedWorkspace` (the workspace the user OWNS) while the
recording `PUT` validated it against `loadWorkspaceAccessContext`'s
`primaryWorkspaceId`. Those deliberately diverge — a user who owns zero releases
and belongs to someone else's team gets the JOINED workspace as their primary (a
2026-07-23 founder decision so an invitee's Teammates list shows their real team,
`lib/tasks-server.ts`). So for anyone newly invited into a team the bytes uploaded
fine and the record call then rejected its own signed path as "not this
workspace's", leaving an orphaned object. Both sides now use
`loadWorkspaceAccessContext`, and both files carry a comment saying the mint and
the check must never drift apart again. Two bonuses: that resolver has its own
provision-on-miss, so a brand-new account is not newly 404'd; and a curator-only
account now gets a clean "No workspace found." instead of `ensureOwnedWorkspace`'s
`CuratorAccountError` surfacing from a *logo* upload as "Playlist owner accounts
cannot create releases."

**The workspace logo was the SECOND victim of the cover-art limit raise**, missed
when the curator photo was decoupled two days earlier. Both halves
(`useWorkspaceSettings.ts`, `upload-url/route.ts`) read
`ASSET_SIZE_LIMITS.cover_art`, so a 96px logo accepted 25 MiB and the Settings help
text advertised it. It has `MAX_WORKSPACE_LOGO_BYTES` (5 MiB) now.
`lib/asset-constants.test.ts` asserts **both** avatar limits are strictly less than
the cover-art limit, and that cover art still clears 20 MiB — a comment could not
stop a third instance, that test can.

**The logo preview no longer uses `next/image`.** Its own sibling renders the SAME
url as a plain `<img>` with an `onError`, and says why
(`WorkspaceIdentityPanel.tsx`: a 1h signed URL should not be proxied and cached by
the optimizer). Two conventions for one URL in one codebase; the documented one
won. The failure state is keyed on the URL that failed, not a bare boolean, so the
next successful upload clears it instead of being stuck on "No preview" forever.

**`buildWorkspaceLogoPayload` no longer takes the identity card down with it.**
`getWorkspaceLogo` rethrows query errors by design, and this builder feeds the
`/api/workspace/identity` AGGREGATE — so one unreadable logo column 500'd the whole
card (name, artist, member count and all). It degrades to "no logo" now, matching
its own documented contract and its sibling `loadWorkspaceLogoFallbackUrl`.

**Upload failures report themselves, and this is the part that answers "I cannot
ask them".** Both flows already caught everything and set a message only the person
at the screen ever saw, which is unrecoverable when a partner says "it doesn't
upload". Both now also fire `asset_upload_failed` (PostHog, the `app_error_shown`
precedent) carrying the surface, the STEP it reached (1 sign, 2 storage PUT, 3
record) and the HTTP status. **`lib/upload-failure-report.ts` is an allowlist, not a
denylist, and that is load-bearing:** an upload error message can carry the user's
file name (often their artist name) or a signed Storage URL, which is a live
credential for an hour. The reason is reduced to a bounded classification
(`network`, `forbidden`, `too_large`, …) rather than passed through, with a test
asserting a message full of both survives as `unknown`.

- **Verified:** 1198 tests (13 new), `eslint .` at exactly the measured baseline
  (3 errors / 66 warnings, all pre-existing in `WorkspaceView.tsx`), `next build`
  green by exit code in both flag states with `/auth`, `/onboarding` and
  `/settings` still `○ Static`. Runtime probe: flags on, the logo and curator photo
  routes 401 unauthenticated; flags off they 404 while `/api/releases` still 401s.
- **Not verified, and it matters here:** nothing ran against a real database,
  Storage bucket, or account — no upload has been exercised end to end. **This does
  NOT prove the reported crash is fixed**, because the crash was never identified;
  the telemetry is what makes the next occurrence name itself. Check PostHog for
  `app_error_shown` and `asset_upload_failed` before assuming this closed it.

**CORRECTION, same day: `NEXT_PUBLIC_POSTHOG_KEY` is NOT set in production, so
every claim above about telemetry was wrong when written.** `captureAnalyticsEvent`
sends to PostHog and otherwise only appends to the USER'S OWN localStorage
(`persistAnalyticsEvent`), which nobody here can read — so `app_error_shown` has
been recording nothing for as long as it has existed, and `asset_upload_failed`
shipped inert. Do not treat either as a diagnostic channel until that env var is
set on the `Web` project.

**SUPERSEDED 2026-09-03: the key IS set now** (founder, at the same time as the
Linear reporting flip), so `app_error_shown` and `asset_upload_failed` finally
go somewhere and both ARE diagnostic channels again. The paragraph above is kept
as the record of why they were dead for the ten days between. Two things landed
with the flip: `capture_exceptions: true` in `lib/analytics/client.ts`, so
unhandled exceptions are captured as `$exception` events and grouped into
PostHog issues rather than only the ones our own boundaries catch; and
`turbo.json`'s stale `NEXT_PUBLIC_POSTHOG_TOKEN` declaration was replaced with
the two names the code actually reads (`NEXT_PUBLIC_POSTHOG_KEY` /
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`). **That mismatch was NOT what kept PostHog
dark, and it is worth recording why the obvious theory was wrong:** a build with
a marker key proved `NEXT_PUBLIC_*` reaches the client bundle whether or not
turbo declares it, because Next.js framework inference covers the prefix. The
declaration only ever affected hashing and documentation. The on-screen failure
code below is unaffected and stays — it needs no configuration and survives
PostHog being switched off again.

What replaced it, and why this shape: **the failure code goes ON SCREEN**
(`formatUploadFailureCode` in `lib/upload-failure-report.ts`), appended to the
message the user already sees — `LOGO-3-400`, `PHOTO-2-NET`. It follows the idiom
`app/error.tsx` already uses for a crash ("If you report this, quote <digest>"),
needs no configuration, and needs nothing of the user beyond the screenshot they
were already sending. `SURFACE-STEP-STATUS`, where NET means no response at all —
a different diagnosis from any HTTP status and the likeliest on a weak link. It
carries no file name and no URL for the same reason `classifyUploadFailure` does
not: a string designed to be pasted into a chat has to be safe to paste into a
chat.

Second channel, for what the user never sees: the three upload routes now
`console.error` every rejection with the user id, so **Vercel runtime logs** carry
steps 1 and 3 with no third party involved. Step 2 is browser→Storage directly and
cannot be logged server-side — which is exactly why the on-screen code exists.
