# A curator gets a public page to share (2026-09-15, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

A real playlist curator ("SoundRise Uncovered") posted
`https://app.urganize.app/curator/profile` to a WhatsApp status, telling
artists to pitch her there. **That link did neither of the two things she
thought it did.** It is her own private settings editor, and
`CuratorShell.tsx` redirects everyone else straight to `/auth`, the sign-in
screen — not her profile, not the landing page, nothing about her at all. The
gap behind it was total: `curator_profiles` and `curator_playlists` carried no
slug, no share token and no visibility column, and no share surface existed on
the curator side at all. Every other link in this product belongs to the team
side (`/k/`, `/credits/`, `/capture/`, `/pack/`, `/p/`); a curator had nothing
to hand an artist except the single-use admin-minted invite that let her in,
which cannot be handed on to anyone else.

**Not a new scope expansion.** Playlist pitching was sanctioned 2026-08-10;
this adds a public READ page for an object that already exists and opens no
new write path — the team logins / workspace-invite-links footing. Behind
`NEXT_PUBLIC_FEATURE_CURATOR_PAGE`, default `false`, only meaningful alongside
`NEXT_PUBLIC_FEATURE_PITCHING`.

**Founder decisions, taken before any code:** per curator, not per playlist —
one link listing every playlist she owns, so she never reposts it when her
roster changes — and the page recruits into the product rather than taking an
anonymous pitch. It is read-only; pitching still needs a real account with a
rollout. A public pitch form was the obvious alternative and was rejected:
`playlist_pitches.owner_user_id` is `not null references auth.users`, and both
its spam brakes (the ten-waiting-per-release partial index, the
one-waiting-per-release-per-playlist unique index) key on `release_id`, which
is nullable — a release-less pitch would land with no ceiling at all, and it
would need brand-new rate limiting this repo mostly does not have. Read-only
costs none of that.

### Six things worth knowing before editing this

1. **`/pitch/{slug}`, deliberately not `/curator/{slug}`.** That tree is the
   authenticated area whose shell bounces everyone signed out — nesting a
   public page inside it invites the exact confusion this bug came from.
2. **Two columns, not one, mirroring the press kit's slug/publish split
   verbatim** (`slug`, nullable, `press_kits_slug_shape_check`'s shape mirrored
   exactly; `published_at`, the gate). Unpublishing must not burn the URL she
   already posted, so only `published_at` moves — `DELETE
   /api/curator/profile/publish` never touches the slug. The slug is minted
   **at first publish**, not at profile creation, so curators who never
   publish do not squat names.
3. **THE PAYLOAD IS BUILT FIELD BY FIELD, NEVER BY SPREADING THE ROW, and the
   column-allowlist idiom (`CURATOR_PITCH_COLUMNS`) does not transfer here.**
   The query legitimately needs `user_id` (to find her playlists) and
   `photo_path` (to sign it), so the column list is not the boundary — the
   payload builder is. `buildPublicCuratorPayload` in `lib/curator-public.ts`
   reconstructs the response key by key, and a test asserts `Object.keys()` is
   **exactly** the allowed set, so a column added to the table months from now
   cannot leak through a spread. `user_id`, `invite_id` and `photo_path` never
   reach the client; the page carries a signed `photoUrl` and never a storage
   path, via `generateSignedUrl` (null-safe, memoized) rather than the raw
   `createSignedUrl` the authenticated profile route uses.
4. **Every failure answers the same `null`.** `lib/curator-public-server.ts`
   never throws: a flag that is off, a slug nobody had, an unpublished page
   and a database that is down all collapse to one `notFound()`. `robots:
   {index:false, follow:false}` on **both** branches, including not-found, or
   a guessed slug becomes an indexable page — v1 is noindex outright, the same
   posture `/k/` and `/p/` shipped with before their own `public_listed`
   opt-ins landed.
5. **The signup handoff rides sessionStorage, deliberately not
   `auth.user_metadata`.** The durable `pending_invite_token` mechanism exists
   because a failed invite claim strands an account permanently; this intent
   is only a *destination*, so losing it costs one navigation, not an account.
   `lib/pitch-intent.ts`'s `resolvePostSignupDestination` is one pure,
   order-checked resolver: card trial first (money), then a valid pitch
   intent, then `HOME_PATH` — `OnboardingPageClient.tsx`'s
   `finishToDashboard` was a hardcoded two-way branch before this and is a
   three-way call into that resolver now. The wizard already creates a
   rollout for every new artist (`runPostSignupHandoff`), which is what makes
   "land in the composer, already scoped to her" possible at all.
6. **The composer filter resolves a SLUG server-side, never a curator id, and
   the response shape does not change.** `/api/pitching/playlists?curator=`
   queries `curator_profiles` for the matching `user_id` and adds one `.eq(...)`
   to the existing query; an invalid, unpublished or unresolved slug returns
   an empty list rather than an error. That preserves
   `BrowsablePlaylist`'s documented promise — no curator id anywhere in that
   payload. `PitchingPageClient.tsx` reads the URL param **imperatively, in a
   pre-paint layout effect**, never via `useSearchParams` — that hook in a
   statically prerendered client component ships `loading.tsx` as the server
   HTML, the same weak-connection trap this repo keeps fixing.

### The copy guard had a blind spot, and fixing it found two pre-existing bugs

`lib/press-kit-copy-guard.test.ts` was extended to cover the new files, and a
verification mutation (an em dash dropped into the new page's JSX) was **not**
caught — proving the extension alone was insufficient. The guard's extractor,
`userFacingStrings`, only reads quoted string literals; every file this guard
exists to cover is majority JSX prose, so it had likely never actually checked
the pages it claims to. Swapped to `readableCopy` (the extractor the
positioning and rollout-vocabulary guards already use, which also reaches JSX
text and template literals). Re-running the same mutation now fails correctly.

**The stronger guard immediately surfaced two real, pre-existing em-dash
violations in code this session did not write** —
`lib/chappi/tool-families/press-kits.ts` and `app/k/[slug]/page.tsx` — both
fixed by swapping the dash for a colon. A known, accepted gap remains:
`readableCopy`'s JSX-text pattern cannot see text immediately following a `}`
(an expression container) on the same line, so an invented number placed
right after a ternary is invisible to it. Shared infrastructure, not something
to fix inside this feature, and nothing this feature ships hardcodes a number
— every follower count renders via `playlist.followerCount.toLocaleString('en')`.

A new `lib/curator-public-guard.test.ts` clones the transferable rules from
`lib/press-kit-public-guard.test.ts` (uniform failure, noindex both branches,
no `next/image` on a signed URL, the flag checked before auth). Its own first
draft had the same class of weakness: the "checks the flag before auth" test
compared whole-file `indexOf()` positions, which actually compared import
order rather than call order inside the handler bodies, so a mutation
reordering the real calls inside `POST` survived undetected. Fixed by slicing
each handler's body first and comparing call-site order within that scope.

### Verified

The full suite (3242 passing, 30 skipped), `eslint .` measured against a
freshly stashed clean-tree baseline (3 errors / 78 warnings, all three
pre-existing in `WorkspaceView.tsx`) — **2 new warnings**, both the documented
React-19 `set-state-in-effect` downgrade on a hydration-safe `mounted` guard
and a `window.location.origin` read in an effect, the same accepted pattern
dozens of other components in this repo already carry. `tsc --noEmit` clean
apart from the documented pre-existing `confirmed-action.test.ts` errors.
`next build` green **by exit code** in both flag states, with `/auth`,
`/onboarding`, `/settings`, `/dashboard` and `/dashboard/pitching` all still
`○ Static` in each, and `/pitch/[slug]` correctly `ƒ Dynamic`.

Runtime probes, rebuilding between flag states: flag off, `/pitch/{anything}`
renders the real not-found body (`NEXT_HTTP_ERROR_FALLBACK;404`, `noindex,
nofollow`) while the ungated `/api/releases` still 401s, and the new publish
route answers the exact `isFlagGateOff` body `{"error":"Not found."}`. Flag
on, the publish route and the curator-filtered playlists route both 401
unauthenticated (auth precedes the handler), and `/pitch/{unknown-slug}`
answers the SAME not-found shell as flag-off — this repo's documented
`force-dynamic`-flushes-before-data-resolves quirk (`/epk/`, `/credits/`,
`/capture/` all share it), which is also why a database that cannot be
reached from this sandbox and a slug that genuinely does not exist are
indistinguishable here, exactly as the loader's contract requires.

**Not verified, and it is the whole remaining risk:** nothing has run against
a real database or a real session — this sandbox has neither. No page has
ever rendered a real curator's name, photo or playlist list; no publish, copy,
rename or unpublish has executed; and the signup handoff has never been
followed end to end. The plan's four manual steps are the real test: publish
and copy the link as a curator, confirm the URL survives an unpublish and
republish; open it in a private window and confirm no sign-in is demanded;
follow the CTA through a brand-new signup and confirm it lands in the composer
already scoped to her; and open it as an existing signed-in manager and
confirm the same scoped landing.

### Activation

Flip `NEXT_PUBLIC_FEATURE_CURATOR_PAGE=true` on the Vercel `Web` project with a
commit that actually rebuilds `apps/web` (the `turbo-ignore` trap). Changelog
entry and version bump land **at the flip, not at merge** (the EPK precedent),
and the entry is about what a person sees: playlist owners get a page they can
share so artists can find them.
