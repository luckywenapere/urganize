# "Put us on your Home Screen", then notifications (2026-08-30)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request: when a user is observed browsing through the different tabs
of the app, offer them the install — the PWA on iOS, the Android app on
Android — low on the screen where a thumb reaches; and if they turn it down,
*then* ask about notifications.

**Not a scope expansion, and no migration.** Every piece it coordinates
already shipped: `AndroidAppBanner` (2026-08, top banner → `/download`),
`PushPermissionPrompt` (2026-08-21, bottom card, 6s after load),
`app/manifest.ts` (installable since the push work), and
`isAndroidBrowser()`. What did not exist was an iOS install offer, a
behavioural trigger, and any ordering between the two asks. Behind
`NEXT_PUBLIC_FEATURE_INSTALL_PROMPT`, default `false`.

**STATUS, corrected 2026-09-07: LIVE since 2026-09-02 — see "The install offer goes live (2026-09-02, v1.18.0)" near the end of this file.** This section and its two sub-sections said "not yet activated" / "has never been flipped" for a further five days after the flip, which is the same lag this file keeps catching. The ledger is unambiguous and describes the feature as it stands after BOTH later revisions: v1.18.0 reads *"After about a minute in the app, we offer to put Urganize on your device. On Android, one tap gets you the app. On a computer, one tap installs it in its own window. On an iPhone, the card shows you the two taps that add it to your Home Screen."* — the one-minute timer is the 2026-08-31 retrigger and the desktop variant landed the same day, so the entry cannot predate either.

**The trigger is behaviour, not a timer** (the founder's words, and the better
signal anyway): three DISTINCT app surfaces in one session — the landing page
plus two deliberate moves. `lib/first-release-prompt.ts` is the timer-shaped
sibling and they deliberately share no mechanism, because they answer
different questions.

**Seven things worth knowing before editing this:**

1. **The iOS card can only ever TEACH.** There is no `beforeinstallprompt` on
   iOS and no API of any kind that opens Add to Home Screen — Apple routes it
   through the share sheet, which no page can reach. So the iOS variant is two
   numbered steps and a button that only acknowledges them. Wiring a primary
   button that "installs" would be a control that visibly does nothing, the
   exact failure `PushPermissionPrompt`'s own header warns about for the
   permission dialog.
2. **On iOS the ordering is forced, not preferred.** Apple exposes
   `Notification` and `PushManager` ONLY to Home Screen web apps, so in a
   Safari tab `isPushSupported()` is false and the push effect returns before
   it ever reaches the hold. Install-then-notifications is the only sequence
   that can work there. On Android and desktop both asks are possible and the
   founder's rule applies as written — the notification ask follows a
   **decline**, and an accept suppresses it.
3. **The hold costs an ask, and that is the right trade rather than a
   regression.** An Android-browser user who never opens three surfaces gets
   no notification ask that session. A browser grants exactly ONE permission
   prompt per origin, forever — spending it on someone who opened one page and
   left is how an origin gets Blocked for good, which `lib/push-prompt.ts`
   already documents as unrecoverable. Deferring to a session where they
   actually used the app improves the ask.
4. **`lib/install-prompt.ts` fails CLOSED on BOTH counts, and the second is
   the subtle one.** Broken storage means no card (cost: silence). It also
   means `isInstallPromptOwed()` answers false, so a storage failure can never
   hold the notification prompt hostage behind an install prompt that will
   never arrive. `markInstallPromptSettled` is the mirror image: its write is
   wrapped and the subscriber notification is NOT conditional on it, because
   `writePersistedState` does not guard `setItem` (Safari private mode, full
   quota) and an unguarded throw would abandon the dismissal half-done —
   card still up, notification ask never released. Losing the record costs one
   repeat offer; losing the signal costs the ask entirely.
5. **`resolveInstallVariant` answers "already installed" BEFORE it sniffs the
   user agent**, and a test pins that: an installed iOS Home Screen app is
   still an iOS user agent, and the reversed order tells it to install the
   thing it is already running inside. Note `isStandaloneDisplay()` is a
   different question from `isNativePlatform()` — Home Screen vs the Capacitor
   shell — and both mean "no offer".
6. **A different release is NOT a different tab.** `installViewKey` counts
   `?scene=` and `/settings?tab=` as their own surfaces (they genuinely swap
   the working surface) but deliberately not `?release=`, or the card would
   fire at someone flicking through their own catalog. The counted paths are
   an allow-list (`/dashboard`, `/settings`, `/admin`): three bounced flow
   steps through `/auth` and `/onboarding` are not browsing.
7. **`AndroidAppBanner` stands down when this flag is on.** Both point Android
   at the same `/download` page, and two asks for one thing is one too many.
   The newer one wins because it is the brief — bottom of the screen, and only
   once the visitor has looked around, rather than a top banner on arrival.
   Flag off, that banner behaves exactly as it does today.

- **Where it lives:** `lib/install-prompt.ts` (counting, decision, storage,
  and two tiny subscriptions rather than a store — the `body-scroll-lock.ts`
  precedent for cross-component state that is not really UI state),
  `components/app/InstallAppPrompt.tsx`, plus `isIOSBrowser()` /
  `isStandaloneDisplay()` in `lib/platform.ts`. `NavigationTracker` records
  the views: piggy-backed rather than given its own effect, because it already
  owns the one Suspense boundary that can read `searchParams` from
  layout-level chrome — and the record call is itself flag-gated so a flag-off
  build performs no extra storage writes on the shell's hottest effect.
- **It shares `PushPermissionPrompt`'s exact slot** (`z-[140]`, the same
  `bottomClass` clearing `MobileNavBar`), which is safe precisely because the
  two can never be on screen together: the notification ask holds until this
  card is answered.
- **Verified:** the full suite (1706 passing, 30 env-gated skips, 24 of them
  new in `lib/install-prompt.test.ts`), `eslint .` at the exact measured
  baseline (3 errors / 65 warnings, all pre-existing in `WorkspaceView.tsx`),
  and `next build` green **by exit code** in BOTH flag states with `/auth`,
  `/onboarding` and `/settings` still `○ Static`. **Mutation-tested rather
  than merely asserted:** checking iOS before "already installed", counting
  `?release=` as a surface, ignoring the settled record, and moving the
  settled notification inside the `try` each fail exactly the test written to
  catch them.
- **Not verified, and it is most of the risk surface:** nothing has rendered
  in a browser, on any phone. This sandbox cannot mint an authenticated
  session and has no network route to either urganize domain, so the card's
  layout, the iOS instructions against a real share sheet, the Android link,
  and the whole hand-off from decline to the notification ask rest on unit
  tests plus traced call paths. Do NOT try to prove the flag state by grepping
  the client chunks — `dynamic()` emits the card's chunk in both states, the
  same false positive this file records for "Fan capture" and "Press kit".
- **Activation checklist:** (1) nothing to migrate — set
  `NEXT_PUBLIC_FEATURE_INSTALL_PROMPT=true` on the Vercel `Web` project **and
  confirm the deploy actually rebuilt `apps/web`** (`npx turbo-ignore
  @urganize/web --fallback=<the commit Vercel last deployed>`);
  `NEXT_PUBLIC_FEATURE_PUSH_PROMPT` should be on too, or the second half of
  the sequence does not exist. (2) Changelog entry + minor version bump across
  all `package.json` files at the flip, not at merge (the EPK precedent).
  (3) Verify on a real phone, which is the only place this can be verified:
  on an iPhone in Safari open three surfaces and confirm the card appears low
  on the screen with the Add to Home Screen steps, then add it and confirm the
  installed app never offers again and DOES ask about notifications; on
  Android confirm the top banner is gone, that "Get the app" reaches
  `/download`, and that "Not now" is followed about a second later by the
  notification ask.

### A minute, every visit, and desktop too (2026-08-31)

Founder, the day after the above shipped (still flag-off, still never
activated): *"Every time the user looks at urganize through the web app they
should be prompted to download the app after a minute or install the PWA for
iOS or desktop."* Three changes, and the first is a **conscious reversal of
the founder call recorded above** rather than drift — the section above is the
record of what that reasoning was, and it is superseded, not wrong.

1. **The trigger is a one-minute timer, not three distinct surfaces.** The
   view counting is deleted outright — `installViewKey`,
   `nextInstallViewList`, `recordInstallPromptView` and the
   per-navigation sessionStorage write they cost `NavigationTracker` on the
   shell's hottest effect. **Do not run both**: two triggers racing produce a
   card whose timing nobody can predict or test. The countdown lives in
   sessionStorage (`{ armedAt, shownAt? }`) so it SPANS the pages that host
   the card, exactly as `lib/first-release-prompt.ts` does and for the same
   reason — a per-mount timer restarts on every navigation.
2. **"Every time" is scoped to once per browser session**, and the two answers
   are stored differently on purpose. A **decline** is sessionStorage, so the
   next visit asks again — that is the founder's "every time". An **accept**
   is localStorage for 180 days, because someone who already installed must
   not be asked tomorrow and **on Android nothing the page can read will ever
   confirm the APK install**. An install we CAN see ends it permanently by
   construction: `isStandaloneDisplay()`/`isNativePlatform()` resolve the
   variant to null, and the `appinstalled` event marks the accept too.
3. **Desktop is a third variant**, via the deferred `beforeinstallprompt`
   event — the first time anything in this repo touches it.

**Five things a later change will be tempted to get wrong:**

- **The desktop card is offered ONLY once the browser has actually handed us
  an install.** `resolveInstallVariant` takes `canPromptInstall`, so desktop
  Safari and Firefox see nothing rather than a button that cannot work. That
  is the iOS rule ("never a control that visibly does nothing") reached from
  the other direction, and it is why a null variant is the honest answer.
- **`android` must be resolved BEFORE `desktop`.** Chrome on Android fires
  `beforeinstallprompt` too, so the desktop branch would otherwise offer a
  second-best web install to someone who can have the APK. Mutation-tested.
  The already-installed checks still come before every UA sniff, for the
  reason the section above gives.
- **`startInstallPromptCapture()` must be called from an EAGERLY-loaded
  module.** Chrome fires `beforeinstallprompt` once, shortly after load, and
  an unlistened event is simply gone — while `InstallAppPrompt` is a
  `dynamic()` import that may not have resolved yet. It starts in
  `NavigationTracker` for that reason and no other, and is idempotent.
- **`isInstallPromptOwed()` probes the session store with a REAL WRITE**, and
  that is not paranoia: Safari's private mode serves `getItem` happily and
  throws on `setItem`, so a read-only probe reports a store that cannot
  remember anything — and the notification ask would then be held forever
  behind a card that can never arm. The fail-closed pairing this module leads
  with (no card AND no hold) depends on it. Mutation-tested.
- **`shownAt` is written when the card FIRES, not when it is answered.**
  Leaving app chrome unmounts the card, and coming back must not produce a
  second one. It also means an ignored card releases the notification ask,
  which is the right direction.
- **The manifest's icon now declares `1004x1004` instead of `sizes: "any"`.**
  Chrome wants a declared raster icon of at least 144px before it will offer
  an install at all — and therefore before it fires the event the whole
  desktop half depends on. `any` is defined for scalable icons and leaves a
  PNG ambiguous. If that file is ever replaced, change the number to match or
  the desktop offer quietly stops appearing.

- **Verified:** 1922 tests (35 in `lib/install-prompt.test.ts`, replacing the
  24 that tested the deleted counting), `eslint .` at the exact measured
  baseline (**3 errors / 70 warnings**, all pre-existing in
  `WorkspaceView.tsx`) with **zero** new findings, and `next build` green **by
  exit code** in BOTH flag states with `/auth`, `/onboarding` and `/settings`
  still `○ Static` in each. The emitted manifest was read from
  `.next/server/app/manifest.webmanifest.body` rather than trusted from
  source. **Four mutation passes**, each failing exactly its own test:
  resolving desktop before android, sniffing the UA before the
  already-installed check, ignoring `shownAt`, and dropping the
  storage-writable probe.
- **Not verified, and it is most of the risk surface:** nothing has rendered
  in a browser on any device, and **no `beforeinstallprompt` event has ever
  been observed** — this sandbox cannot mint a session and has no route to
  either urganize domain, so the desktop half in particular rests on unit
  tests against a stubbed event. If the desktop card never appears in
  production, the manifest and Chrome's installability criteria are the first
  thing to check, not this code — and the failure is silent by design (no
  card), not a broken button.
- ~~**Activation is unchanged and STILL NOT DONE:** the flag has never been
  flipped, so none of this is live.~~ **SUPERSEDED 2026-09-02 — the founder
  flipped it and it shipped as v1.18.0.** The manual pass named here is still
  the right one and is still worth doing: wait a minute rather than opening
  three surfaces, plus a desktop Chrome pass confirming the card offers a real
  install.
- ~~**No changelog entry or version bump**~~ — **v1.18.0 is that entry.** It
  landed at the flip rather than at merge, exactly as the EPK precedent
  requires.

### The iOS card lost its button (2026-09-01)

Founder, from live use: *"on iOS the prompt to download the app to the home
screen, nothing happens when the user clicks Got it — can't it then
automatically install it on their home screen."*

**It cannot, and no amount of code will change that** — the first bullet at
the top of this section is the whole answer, and it has not moved: Apple
routes Add to Home Screen through the share sheet, there is no
`beforeinstallprompt` and no `navigator.install` on iOS, and Chrome, Edge and
Firefox on iOS cannot even offer the menu item. Any button claiming to install
would be a lie.

**But the report was right about the thing that mattered, and the card was
wrong.** `Got it` was the FILLED button on a card whose actions sit at the
bottom of the screen, so it is the first thing a thumb reaches — and tapping
it dismissed the card, taking the two numbered steps with it before the person
had done anything. Then `shownAt` spent the visit's one offer and the accept
was written to localStorage for 180 days. The steps were the payload and the
primary button threw them away.

Three changes, iOS branch only (Android and desktop are untouched):

1. **No primary button.** One full-width ghost `Close`, plus the × it already
   had. Nothing on the card looks like an action, because nothing on it can
   perform one. **Do not put a filled button back** — that is the whole defect.
2. **Its one exit records a DECLINE, not an accept.** Nothing the page can
   observe tells us whether someone followed the steps, so an accept would
   silence the offer for six months on a guess. A decline is session-scoped,
   so a reader who did not follow through is asked again next visit (the
   founder's "every time"), while one who DID is closed out permanently by
   `isStandaloneDisplay()` — `navigator.standalone` is true from the Home
   Screen, so `resolveDeviceInstallVariant()` answers null and the card never
   renders again. **Detection is the confirmation here, not a button.** No
   consequence for the notification hand-off either: `isPushSupported()` is
   false in an iOS Safari tab (bullet 2 above), so nothing is waiting.
3. **Step 1 says where Share is**, since it moves: "the square with an arrow
   out of it. Bottom bar in Safari, top right in Chrome."

- **Verified:** 1922 tests (unchanged — no test exercises this component;
  `lib/install-prompt.test.ts`'s 35 cases are on the pure and storage layers
  and none asserted the iOS outcome), `eslint .` at the exact **3 errors / 70
  warnings** baseline with the changed file clean, `next build` green **by
  exit code** with `/auth`, `/onboarding` and `/settings` still `○ Static`,
  and the compiled client chunk confirmed to carry the new step-1 copy with
  **no remaining `Got it`**.
- **Not verified:** nothing has rendered on a phone. This sandbox cannot mint
  a session and has no route to either urganize domain, so the layout of a
  single full-width ghost button and the Share-location wording against a real
  share sheet are reasoned, not seen.
- **A CONTRADICTION WORTH RESOLVING BEFORE TRUSTING THE LINE ABOVE —
  DISCHARGED 2026-09-02, by supersession rather than by an answer:** this
  section said "the flag has never been flipped, so none of this is live"
  since 2026-08-30, and yet the founder watched a real user tap `Got it` on
  iOS. **Which of the two it was is still not known** — an unrecorded flip, or
  a preview deploy — and it stopped mattering the next day, when the founder
  flipped the flag deliberately and it shipped as v1.18.0. The ledger's debt
  is settled by that entry, which covers the whole install offer rather than
  this fix. Worth keeping for the general shape: a contradiction between a
  status line and an observation is usually the status line, and this file's
  own history of unrecorded flips is the reason to bet that way.
