# Share to socials (2026-09-23; switched on 2026-09-24 as v1.42.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: when somebody creates a rollout for the first time, let them
share it as an Instagram post, a WhatsApp status and a message they can DM to
anybody, and "if, at any time, they create a release, always ask questions for
clarity". Four founder answers shaped it before any code was written:

1. **The sheet opens by itself ONCE, after the first rollout.** After that every
   rollout carries a Share button, and UrgAns can open it.
2. **It always asks four questions first:** who is posting (the artist, "my new
   single", or the team, "Dorian’s new single"), whether the date can be public,
   a link for fans, and one extra line.
3. **The DM link is the link they give us** (a pre-save or smart link). No link
   means just the message.
4. **The images carry a small, quiet "Made with Urganize" mark.**

**AMENDED 2026-10-13 (v1.120.2): the sheet no longer opens straight after the
first rollout, on ANY path.** Points 2 to 4 under "Eight things worth knowing"
below are the record of how it used to work. See "The first-rollout share
offer waits for the next visit" at the end of this file.

Behind `NEXT_PUBLIC_FEATURE_SOCIAL_SHARE`, default `false`, and **ON in
production since 2026-09-24** (see Activation below). **No migration, no new
table, nothing stored server-side.** Scope reasoning is in the 2026-09-23
paragraph under "v1 scope".

### What it makes

Three things, from the rollout's own facts plus the four answers:

- **An Instagram post image** (1080x1350) and its caption. The caption never
  carries the raw link, because Instagram does not make one tappable; it says
  "Pre-save link in bio." (or "Listen at the link in bio." once it is out).
- **A WhatsApp status image** (1080x1920) and a shorter caption that DOES carry
  the raw link, because a status makes it tappable.
- **A message to DM anybody**: "Hey! …" plus "Pre-save it here: <link>" (or
  "Listen here:"), sent through WhatsApp, copied, or handed to Instagram's inbox.

The copy rules live in `lib/social-share.ts` and are enforced by its tests
rather than by review, because this is the one surface in the product whose
words the user PUBLISHES as their own:

- **Fans read it, so it says single, EP or album, never "rollout", never
  "workspace", and never "Urganize" in a caption.** The mark is on the image
  only. In-app copy around it says rollout as everywhere else.
- **A secret date never leaks.** "Not yet" turns every date into "Coming soon",
  on the image and in all three texts; a date that has passed is simply "Out
  now", whatever the answer.
- **No em dashes, typographic quotes and apostrophes throughout.**
- **An untitled rollout drops its placeholder title** ("Untitled rollout" never
  reaches a post), and the artist carries the headline instead.

### Eight things worth knowing before editing this

1. **"First" is decided on the SERVER, in `POST /api/releases`, and returned as
   `firstRelease`.** The client's copy of the catalog may not have loaded, so it
   cannot know. Test rollouts never count either way, which is why
   `decideFirstRelease` reads the metadata of up to 10 earlier rollouts when
   there are some; a failed read answers "not the first", because silence
   costs nothing and the Share button is still there. Always `false` with the
   flag off, so nothing downstream needs a flag check of its own.
2. **One helper puts the sheet into every create flow:
   `components/share/withFirstShareOffer.ts`.** The three create flows (the
   workspace, the UrgAns page and the topbar's modal) each end in their own
   continuation, and the sheet slots in AFTER the compulsory team-login step and
   BEFORE the rest (the planner intake, the new-rollout guide, a navigation),
   which runs when the sheet closes. Flag off, or not a first rollout, it is the
   continuation untouched. One helper because those three flows have drifted
   apart before.
3. **The once-only offer is spent only when a sheet actually showed it.** The
   sheet is a lazy chunk in AppShell, so a very quick first create on a slow
   connection can finish before it mounts. `useShareStore.open` answers whether
   a sheet took the request; when none did, the flow carries straight on and a
   pending marker is left instead. Mutation-tested.
4. **Onboarding creates most first rollouts, and uses the same pending marker**
   (`markPendingFirstShare`, sessionStorage, 30 minutes). The sheet's host picks
   it up once the person lands in the app, but only at a quiet moment: never
   over another modal (the body scroll lock), never over a guided tour, and it
   gives up after about a minute, because an offer arriving long after the
   moment is an interruption. "Offered" is remembered per account in
   localStorage and fails toward "already offered".
5. **The images are rendered on request by
   `GET /api/releases/[releaseId]/share-card`**, with `next/og` and the recap
   card's fonts (so `next.config.js` carries an `outputFileTracingIncludes`
   entry for it; an ENOENT on a .ttf in production means that entry, not the
   code). Team read access through the shared helper, enlisted in
   `release-access-guard.test.ts`; auth runs before any validation, so a
   signed-out request learns nothing. The response is private and `no-store`,
   overriding `next/og`'s public cache default, because the image can carry an
   unannounced title. Cover art is used only when it is a PNG or JPEG under 12
   MiB and never the workspace logo; a render that fails with the art is retried
   once without it, so a strange file costs the art, not the post.
6. **The images are fetched BEFORE the tap, and the tap does nothing async
   first.** Web Share only opens inside a user gesture, so the File is ready
   when the button shows, the caption is copied synchronously, and
   `navigator.share` is the first await. Files are only offered to the share
   sheet on a touch device (`pointer: coarse`) whose browser says it can take
   them; everywhere else the image is saved, which is the honest answer on a
   computer. The native app needs the share plugins; the one APK on record
   predates them, so it says so ("Sharing needs the newest version of the app.
   Open Urganize in your browser to share.") rather than offering a button that
   does nothing.
7. **UrgAns reaches it three ways:** the `share_release` tool (kind read; it
   posts nothing, so it is not confirmation-gated, and it is NOT in the MCP
   allow-list, since its whole effect is a client action), a typed "share to
   socials" command for when no model is running, and `create_release`, which
   marks its navigation with `offerFirstShareFor` when that was a first rollout
   so the same once-only sheet comes first. The typed phrases are narrow on
   purpose: a bare "status" means the status update and "share the recap" means
   the recap card, and a test pins both.

### The sheet itself, and what looking at it found

`components/share/ShareSheet.tsx`, mounted once in AppShell and opened through
`stores/useShareStore.ts`, following the house sheet contract (z-[170], portal
to `document.body`, swipe to dismiss, Escape and a Tab trap on the dialog
itself). Two steps: ASK, then SHARE, and the answers are remembered per rollout
so a second visit is one tap.

It was checked in a browser through a throwaway preview page (a faked user and
rollout, pre-rendered posters in place of the route, deleted afterwards), at
375 and 1280, in both themes. That pass found eight real problems, all fixed,
and several are worth knowing as house lessons:

- **`bg-bg-elevated` is the SAME colour as `bg-bg-surface` in light mode and two
  shades off it in dark**, so the option tracks vanished on cream and the
  selected option read only by its text. The fix is the Shows modal's pattern:
  a `bg-bg-base` well with a `bg-bg-surface` thumb, the one pairing that reads
  as raised in both themes (`TRACK_CLASS`).
- **The shared `.input` class fills with white at 4%, invisible on cream, and
  its radius outranks `rounded-xl`**, so the fields came out square. The sheet
  uses its own `FIELD_CLASS` instead. Other inputs in the app are untouched and
  still border-only in light mode, which is worth knowing if one ever looks
  missing.
- **The app-wide `:focus-visible` ring outranks a bare `outline-none`**, so the
  panel, which takes focus only to carry the keyboard into the dialog, arrived
  wearing a green rim whenever it opened with no click before it, which is
  exactly how the first-rollout sheet opens. `focus-visible:outline-none` fixes
  it.
- **Changing step unmounted the focused button**, dropping focus to `<body>`,
  where Escape and the Tab trap (both on the panel) stop hearing anything; the
  new step also kept the old one's scroll position. A layout effect now resets
  the scroll and hands focus to the selected tab or the panel.
- **On a phone the share step holds one height**, so moving between the tabs no
  longer makes the sheet drop by a third of the screen, and **the main button is
  pinned to the bottom of the question step**, which was below the fold on a
  1280x800 laptop.
- **A failed image turns the main button into "Try again"**; it used to sit
  disabled still saying "Making your post…" under an error that said otherwise.

### Where it lives

`lib/social-share.ts` (the rules and the copy), `lib/social-share-card.tsx` (the
posters), `lib/social-share-server.ts` (cover art), `lib/social-share-offer.ts`
(first-rollout, the once-only offer, the pending marker, saved answers),
`stores/useShareStore.ts`, `components/share/` (the sheet, its image fetcher and
`withFirstShareOffer`), the image route, and the Share button in the rollout's
header on desktop and in the release menu on a phone (ranked after Files, as the
first of the "send this outward" items). Analytics: `social_share_opened`,
`social_share_made` and `social_share_sent`, none of which carry any text.

The copy guards read it: `lib/press-kit-copy-guard.test.ts` (the em dash and the
banned words) and `lib/rollout-vocabulary.test.ts` (the sheet's in-app copy
says rollout).

### Verified

3309 tests passing / 30 skipped, 109 of them new, against a baseline of 3200.
`eslint .` at the exact 3-error / 78-warning baseline, confirmed per file against
the committed versions rather than by the totals alone. `tsc --noEmit` clean
apart from the documented `confirmed-action.test.ts` errors. `next build` green
by exit code in both flag states, with `/auth`, `/onboarding`, `/settings`,
`/dashboard`, `/dashboard/urgans` and `/locked` all still `○ Static`, and the
sheet's arbitrary classes confirmed in the compiled CSS (where the minifier folds
`calc(40dvh*0.8)` to `32dvh`, which reads as missing to a naive grep). Runtime
probes on `next start`: flag off, the image route answers 404 with body exactly
`{"error":"Not found."}` while the ungated control answers 401; flag on, 401.
**Nine mutations, each killing its own test**, and the one that survived at
first was a real test weakness, not a failed application: the recap test used a
phrase the share branch would never have claimed anyway.

### Not verified

No real share has happened. Nothing here has handed a file to Instagram or
WhatsApp on a real phone, rendered a poster through the route with a real
session, or run the onboarding hand-off end to end; this sandbox cannot mint a
session and has no route to either urganize domain. The posters were rendered
and looked at through the same renderer the route uses, which is not the same
as the route serving one.

### Activation

1. ~~Set `NEXT_PUBLIC_FEATURE_SOCIAL_SHARE=true`~~: done 2026-09-24 with the
   Vercel CLI, on the `urganize` project's **Production** environment only,
   non-sensitive, matching the other feature flags there. Preview deployments
   still build with it off. The order was the variable first and the rebuild
   second, the order the textile flip recorded as the one that works.
2. ~~Changelog entry and version bump~~: done as **v1.42.0**, whose commit is
   the rebuild that inlines the variable. The quick proof it took needs no
   session: `GET /api/releases/<any uuid>/share-card` answers 401 with the flag
   on and 404 with it off.
3. **OPEN:** the manual pass that matters, on a real phone: create a first rollout and
   confirm the sheet opens after the team-login step; answer the questions; tap
   "Share to Instagram" and confirm Instagram opens with the image and the
   caption pastes; tap "Post to status" and confirm WhatsApp offers My status;
   send the message on WhatsApp; then open the Share button on a second rollout
   and confirm the answers came back.

### X and Snapchat, and per-artist brand colors (2026-09-24, v1.43.0)

Founder ask, on top of the shipped sheet: add X and Snapchat, and let each
artist set their own colors for the images. Two additions, treated
differently, because one rides the flag above and the other is genuinely new:

- **X and Snapchat are two more tabs in the SAME sheet, and they ship live at
  merge with no flag of their own.** `NEXT_PUBLIC_FEATURE_SOCIAL_SHARE` was
  already `true` in production, and these tabs are inside the component that
  flag already gates — the same "an addition rides an already-on flag" shape
  as UrgAns's own tool registry growing. There was nothing to flip.
- **X posts the same 4:5 image as Instagram**, with its own post text (a 280
  character counter, X's own weighting: a link always counts 23 regardless of
  length) and an "Open X with this post" link (`x.com/intent/post`, no account
  or approval needed on our side, the WhatsApp button's precedent). Instagram's
  caption still says "link in bio"; X's carries the raw link, because X makes
  one tappable.
- **Snapchat posts the same 9:16 image as the status**, with a plain sentence
  and no link in the text — Snapchat takes no text or link from another app,
  so the link is copied separately for its own link sticker (the paperclip),
  and the sheet says so.
- **Brand colors are genuinely new and stay behind their own flag**,
  `NEXT_PUBLIC_FEATURE_BRAND_COLORS`, default `false`. Two optional colors per
  ARTIST (a background and an accent), set in Settings under their name, used
  only on these images. **The text color is never chosen** — `resolveSharePalette`
  in `lib/social-share-colors.ts` picks cream or ink, whichever reads better
  (WCAG contrast), so no pair of colors a manager picks can make the words
  unreadable. **An accent too close to its background is taken OFF the words**
  (the eyebrow, the artist line, the date) and kept only on the rule and the
  small square beside the extra line, where it cannot hide anything — so a bad
  pair makes an image plain, never broken. One palette function, three
  consumers (the poster renderer, the image route, the Settings preview), so
  what a manager sees in Settings is what gets posted.
- **Migration:** `20260924120000_artists_brand_colors.sql` — two nullable,
  CHECK-constrained columns on `artists` (`brand_background`, `brand_accent`,
  `'#RRGGBB'` uppercase). **Applied to production 2026-09-24.** Additive and
  safe either order: every read falls back to Urganize's own colors on any
  failure, including before the migration ran.
- **`PUT /api/workspace/artists/[artistId]/brand-colors`** saves both slots at
  once (null in a slot means "use Urganize's"); `GET /api/workspace/artists`
  carries a `brandColors` field per artist only while the flag is on. Both
  gated the same way the artist rename route already is: found on the caller's
  OWN roster, so an artist on another team is indistinguishable from one that
  does not exist.
- **The sheet links straight to the editor** once it knows a poster's colors
  (`BRAND_COLORS_SETTINGS_HREF`, `/settings?tab=workspace#brand-colors`),
  saying "These use Dorian's brand colors. Change them." or "Want your own
  colors on these? Set brand colors." — never before the image route has
  answered, since the honest sentence needs to know which is true first.

**Verified:** the full vitest suite (3454 passing), `tsc --noEmit` and
`eslint .` at the same baselines this section already records, `next build`
green with the new flag both off and on. Runtime probes against `next start`
in both states: the new brand-colors route answers 404 with the flag off and
401 (unauthenticated) with it on, the same discrimination the image route
above already relies on. Driven in a throwaway preview (deleted after): all
five tabs render, an artist's saved colors reach the Settings preview and the
actual rendered poster identically, X's counter and post-link button work,
Snapchat's link-copy flow works, and "Change them" correctly routes into
Settings.

**Activation:**
1. X and Snapchat needed no flip — live the moment this merged (v1.43.0), since
   the parent flag was already on. Confirmed against `/api/version` reporting
   that exact commit on production.
2. Migration applied 2026-09-24, by hand in the Supabase dashboard, before the
   flag was touched.
3. `NEXT_PUBLIC_FEATURE_BRAND_COLORS=true` set on the `urganize` project's
   Production environment via the Vercel CLI, non-sensitive, the same pattern
   as every flag above it. **Set AFTER v1.43.0 had already deployed**, so that
   commit's own build did NOT inline it — the trap this file records for every
   flag flip. This entry's own version bump (v1.45.0) is the deliberate
   follow-up rebuild that actually picks the variable up; do not assume a var
   is live just because `vercel env ls` shows it.
4. **OPEN:** the same manual pass as the section above, plus one artist's
   brand colors actually reaching a real posted image on a real phone.
