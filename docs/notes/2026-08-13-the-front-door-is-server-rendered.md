# The front door is server-rendered (2026-08-13, v0.49.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

A design partner's teammate on 2-bar MTN LTE could not sign up: she tapped through to create an account and sat on a bare `Loading...` screen indefinitely — no error, no retry, nothing to tap. **That screen was the entire server-rendered content of `/onboarding`.** Both front-door pages showed nothing until the client bundle had downloaded AND hydrated, so the signup and login entrances depended on ~10 JS chunks (one 211 KB) all arriving. One dropped request, a content blocker, or any throw during hydration was a permanent dead end.

**Shipped, deployed and verified live** — this is not flag-gated; it is how the two entrances now work.

- **`/onboarding` lost its `hasHydrated` loading gate. Do not re-add it.** Step 1 is a radio list over static template data and needs neither storage nor auth, so it is server-rendered and hydration only upgrades it. Restoring a saved draft moved to a **pre-paint layout effect** (`lib/use-isomorphic-layout-effect.ts`, shared with `/auth`), so a returning user and a Google-OAuth returner still land on the step they belong on with no flash of step 1. `hasHydrated` still exists, now only to stop the save effect writing an empty draft over a stored one before the restore lands.
- **`/auth` no longer calls `useSearchParams()`, and that is load-bearing — "restoring" it silently un-server-renders the page.** Reading it in a statically prerendered client component makes Next bail out to the nearest Suspense boundary, so the HTML Vercel served for `/auth` was `app/auth/loading.tsx` — a spinner — and the page component never rendered on the server *at all*. Confirmed empirically before the fix: the built `auth.html` contained `Opening your account` and zero occurrences of `Continue with Google`. The query string is read post-mount instead, and a `paramsReady` flag holds the three redirect effects (legacy `?mode=signup` bounce, legacy invite-link upgrade, post-login redirect) until it lands so none of them can act on a default `next` and drop a real one.
- **`force-dynamic` was rejected deliberately.** It also fixes the bailout, but trades a CDN cache hit for a server round trip on every visit — the wrong direction for the weak-connection users this whole change is for. `/auth` and `/onboarding` are both still `○ Static`. If someone later needs real server-side `searchParams` here, that is the trade-off being made, and it should be a conscious call.
- **The session gate is now decided pre-paint, in three coupled pieces — they must move together.** (1) An inline probe in `app/layout.tsx`'s `<head>`, the same pattern and placement as the pre-existing theme script, path-gated to `/auth`, reads the auth store's persisted `urganize-auth` flag and sets `data-auth-session="1"` on `<html>`. (2) The `.auth-session-loader` / `.auth-form-shell` rules at the end of `globals.css` swap which one displays. (3) `AuthPageClient` renders both branches and **clears the attribute** once Supabase confirms there is no session. Break any one and either a signed-in user glimpses the login form or an anonymous visitor gets a permanently hidden one.
- **Why a script and CSS rather than just React:** the client's first render must match the server's or hydration fails, so the form has to be rendered and then corrected — and React can yield while hydrating, which means a corrected frame is not *guaranteed* unpainted. CSS applied before the body exists is. The React gate is still there and still works; the script only removes the residual risk.
- **The probe is a HINT, not authority.** The persisted flag can be stale (a session that expired while the app was closed), which is exactly why the page clears the attribute the moment Supabase answers. If the probe cannot run at all — storage blocked, unexpected persisted shape — nothing is set and behaviour falls back to the React gate. It fails open, never closed.
- **`authLoading` was deliberately dropped from the gate condition.** It is true on the first render for everybody, which is precisely what made the form unreachable pre-hydration. Waiting on it also meant an anonymous visitor — the only person who needs `/auth` — sat behind a spinner for a session check that was always going to come back empty.
- **`app/auth/loading.tsx` still exists but is no longer what the initial HTML shows.** It now only serves client-side navigations into `/auth`. Do not treat it as the page's SSR output again.
- **Both pages gained a `<noscript>` notice**, so a browser with scripting blocked says so instead of offering a button that quietly does nothing.
- **Sibling pages audited, no change needed:** `/auth/forgot-password` already server-renders its real form; `/auth/reset-password` and `/auth/callback` are genuinely JS-only machine steps (they read a URL token), so their spinners are legitimate. `AuthPageClient` was the only file in the auth tree reading `useSearchParams`. **That audit's scope was the auth tree, and that is exactly how the third instance below got missed** — `/curator/join/[code]` is a front door too, but it lived behind a flag that was off at the time, so no sweep of "the pages a stranger can land on" would have found it. **When a flag-gated surface is switched ON, re-run this audit against its entry points before a user does it for you.**
- **Ruled out along the way, so nobody re-investigates:** blocked storage is NOT the cause (`loadOnboardingDraft` / `readAndClearResumeMarker` are both already `try/catch`-guarded), and the bundle carries no regex lookbehind or class static blocks that would break an older Safari parser. **But Next 16's own framework chunk uses `Object.hasOwn`, which requires iOS 15.4+** — below that the entire app breaks and no application-side change can fix it. Ask for an iOS version before debugging app code on a "nothing loads" report.
- **Verified:** `pnpm test` (448) + `pnpm lint` (0 errors) + `pnpm build` green; the shipped probe source extracted from the built HTML and executed against a persisted session sets the attribute, with the form then computing `display: none` and `offsetParent === null`; path scoping confirmed (no attribute on `/onboarding`); post-deploy, production `/auth` serves the form, the three gate rules are present in the deployed stylesheet, and the live page has zero console errors. **One gap: the signed-in path was never exercised against a real Supabase session** (no test credentials, and creating an account against the live database was not on the table) — it rests on the probe + CSS chain above, so it is worth one manual pass while logged in.

### Third instance: the curator invite page (2026-08-14)

**The same bug, a third time, and it cost a real invited curator his sign-up.** He could not open his link on Nigerian mobile data, sat on a loading screen, and reported it as his own connection ("my net is not opening it, I'll keep trying"). It was ours. Measured on production before the fix: `/curator/join/<code>` served **27KB of HTML containing only a skeleton** — no email field, no "Continue with Google", no Accept button — then required **18 JS chunks (~1.0 MB uncompressed, largest 232KB)** to download AND hydrate AND a further `fetch` to `/api/curator/join/<code>` before one tappable element existed. His invite was ACTIVE and unexpired the whole time and no partial account was created, so nothing was lost but the days.

- **The invite is resolved on the SERVER now.** `lib/curator-invite-server.ts:loadCuratorInviteState` is shaped after `lib/epk-server.ts:loadPublicEpk`: it never throws, and every failure (flag off, malformed code, missing row, unapplied migration, network blip) collapses to one `'unavailable'` answer — a public page must not leak whether a code merely never existed, and must not 500. `page.tsx` awaits it and passes it in as `initialLookup`, so the HTML carries the real form, or the real "Link not available" for a dead link.
- **The client's own lookup effect is now guarded on `initialLookup` being absent.** Do NOT remove that guard to "keep it fresh": it reinstates the exact round trip this page was fixed to avoid, and `POST` re-checks the invite authoritatively anyway.
- **`force-dynamic` IS correct here, unlike on `/auth`.** The bullet above rejects it for the static front doors because it trades a CDN cache hit for a server round trip. This page's answer depends on a row that changes (single-use, revocable, expiring), so there was never a static version to protect — same reasoning as the public EPK page.
- **The actual reason nothing rendered server-side was `authLoading`, again.** The sign-up branch was gated on `!authLoading`, which is true on the first render for everybody and is not persisted — so the server rendered no form at all. This is the third bullet above, re-learned on a new page; the flag was already documented as a trap and still caught this.
- **The signed-in branch gates on a mount flag** (`hasMounted`, the `WorkspaceIdentityPanel` collapsed-state pattern) rather than on the store directly. The auth store **persists** `isAuthenticated`, so without it a returning signed-in visitor's first client render would pick the "Signed in as" branch while the server had rendered the form — a hydration mismatch. An invited stranger, who is the entire audience of this page, is unaffected either way.
- **Verified post-deploy against production** with a real ACTIVE invite: heading + Google button + "Or with email" + all three `<input>`s + the `<noscript>` notice are in the server HTML; a bogus code server-renders "Link not available"; zero console errors on hydration; no overflow at 375px. Submitting still needs JS (supabase-js owns sign-up and the Google redirect) — unavoidable for auth, and where `/auth` landed too. The win is that the page now appears, tells the truth about the link, and lets someone start typing while JS arrives.

### Fourth instance: the curator's own three pages (2026-08-24)

**The same pattern, a fourth time, and this one was predicted in writing.** The
third-instance bullet above records that its audit scope was the auth tree, and
that a flag-gated surface should be re-audited when it is switched on. Pitching
was switched on; `/curator`, `/curator/profile` and `/curator/playlists` were
never re-audited. A newly invited playlist owner then reported "the profile
section has an issue, I can't update profile" from a phone on 2 bars of LTE.

**Read the evidence before assuming a server-side cause.** The screenshot was
Chrome's own "Can't open this page", not anything this app rendered — the
document never arrived. So the immediate cause was the client environment (weak
LTE, 28 open tabs, an iOS renderer kill), and no server-rendering change fixes a
document that never loads. What was ours was the blast radius: measured from a
production build, `/curator/profile` prerendered 27 KiB of HTML containing **no**
"Display name", no "Bio" and no "Save", behind **30 script tags**. A partial load
gave them nothing, and nothing told them why.

- **All three pages now server-render their real content**, and the split
  between page and list is the part to preserve: headers, filters, the add
  control and the whole profile FORM are real markup in the server HTML, while
  the *lists* still wait behind their skeletons. That is deliberate — an empty
  list makes a CLAIM ("No pitches yet", "No playlists yet") that cannot honestly
  be made before the load resolves, whereas a form label is true either way. Do
  not "tidy" this back into one page-level `isLoading` gate; that gate is what
  made a curator on weak data see nothing at all. Verified the way `/auth` was:
  grep the built HTML (`.next/server/app/curator/profile.html` contains "Display
  name", "Short bio", "Save profile"; `curator.html` does NOT contain "No pitches
  yet"), with all three still `○ Static`.
- **Rendering the form early forced two correctness fixes, and they are why it is
  safe.** The field values are now DERIVED (`nameDraft ?? profile?.displayName`)
  rather than seeded by an effect, so a late-arriving profile cannot overwrite
  what someone is already typing; and the save sends **only edited fields**,
  because sending both unconditionally would wipe an existing bio with `''`
  whenever a curator edits just their name before the load lands. The PATCH route
  reads `'bio' in payload`, so an omitted field is genuinely left alone. Removing
  that seeding effect also dropped a `react-hooks/set-state-in-effect` warning
  instead of suppressing it. Enter-to-submit is guarded separately: a disabled
  Save button does not stop form submission, and an empty patch would come back
  "Nothing to save."
- **Failures are visible now, which is the fix that made this report possible to
  act on at all.** `useCuratorStore` had an `isForbidden` boolean that **nothing
  read** — three writes, zero readers — so a failed load left the page with no
  message, no retry, `isLoadingProfile: false` and `profile: null`. It is
  replaced by `profileError`/`playlistsError`/`pitchesError` (three fields
  mirroring the three `isLoading*` flags), rendered through
  `components/curator/CuratorLoadError.tsx` as a blocking state when there is
  nothing to show and a banner when stale data is still usable. `lib/curator-errors.ts`
  holds the pure mapping and **prefers the server's own sentence** over a
  status-derived one, so "This is only for playlist owners." and "Not found."
  reach the user verbatim. The loaders also gained a `catch`: a dropped
  connection used to reject into an unhandled promise, which is exactly the
  weak-link case this whole entry is about.
- **The join route could strand an account permanently, and did not need a real
  failure to do it.** It consumes the invite BEFORE writing `profiles` and
  `curator_profiles`, so a failure in between left the link marked used with no
  curator row: `CuratorShell` bounces such an account out (no curator profile)
  while the team-side chokepoints keep it out of the workspace (role is
  `curator`). No client-reachable recovery. Now the ORIGINAL claimant may resume
  a claim they already made (`canResumeCuratorInviteClaim`, pure and unit
  tested), the `curator_profiles` write is an idempotent upsert, and the invite
  is deliberately still NOT released — releasing it would let a second person
  claim the link. Note `used_at` outranks `revoked_at` in
  `resolveCuratorInviteState`, so a revoked link still reports 'used'; revocation
  is therefore checked separately, and a link the founder turned off stays off.
  The POST reads `used_by` through its own wider column list, because the public
  GET on that route is unauthenticated and `used_by` is somebody's user id.
- **A self-inflicted regression fixed in the same pass.** The curator photo route
  read `ASSET_SIZE_LIMITS.cover_art`, and the 2026-08-22 cover-art work raised
  that from 5 to 25 MiB for DSP-sized artwork — so a 64px avatar silently began
  accepting a 25 MiB upload. It has its own `MAX_CURATOR_PHOTO_BYTES` (5 MiB)
  now, with a test asserting the two are no longer the same number so
  re-coupling them fails in CI rather than in production. The MIME allowlist is
  still shared, which is fine: adding a format there is not a size change.
- **Verified:** 1185 tests (of which ~20 new across `lib/curator-errors.test.ts`,
  `lib/curator-invites-resume.test.ts` and the pitching limits), `eslint .` at
  exactly the measured baseline (3 errors / 66 warnings, all pre-existing in
  `WorkspaceView.tsx`, confirmed by linting a stashed tree), and `next build`
  green by exit code in both flag states with `/auth`, `/onboarding` and
  `/settings` still `○ Static`. Runtime probe: flag on, all four curator routes
  401 unauthenticated; flag off, all four 404 while `/api/releases` still 401s.
- **Not verified, and worth saying plainly:** none of this ran against a real
  database, a real curator account or a real phone — this environment has no
  network route to `app.urganize.app` and cannot mint a Supabase session. The
  join resume path in particular has only ever been exercised as a pure
  function. **It also does not prove the original report is fixed**, because the
  screenshot's proximate cause was a failed document load. Two facts would still
  settle that: the curator's **iOS version** (below 15.4 the whole app breaks on
  `Object.hasOwn` in Next 16's framework chunk, and no application change can fix
  it) and whether the page loads for them at all on wifi.
