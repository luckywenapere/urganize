# The workspace back arrow goes back now (2026-08-25)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report: the circled back arrow left of the MOTION bar "is not working,
it's always meant to take you to the last place the user was no matter what."
Two separate faults, and the second is why it read as dead rather than merely
wrong.

### Fault 1: it pointed at the catalog, always

`handleClose` was one line, `setScope(null)`, and the button was labelled "Back
to all releases". From an open scene it therefore skipped TWO levels at once,
dropping the scene and the release scope together. It was not history-aware in
any way.

### Fault 2: for a single-release account it was a genuine no-op

`hasAutoScopedRef` in `WorkspaceView.tsx` meant **"the auto-scope ran"**, not
**"the auto-scope has had its one chance"**. So an account with one release that
**arrived already scoped** — a refresh, a bookmark, an UrgAns link, or the
`/dashboard/releases/[releaseId]` redirect stub — returned early at
`scopedReleaseId` and left the ref `false`. The first back press cleared the
scope, which then satisfied every guard, so the effect fired and re-scoped
straight back in. And the skeleton gate (`isSingleRelease && !scopedReleaseId &&
!hasAutoScopedRef.current`) covers exactly that frame, so **nothing visibly
happened**.

The ref's own comment described this bug as already fixed. It was, for arrivals
where the auto-scope had actually run — which is not the arrival most people
have. **The fix is one branch: arriving already scoped now spends the chance.**
Note what it deliberately does NOT do: `!isSingleRelease` leaves the chance
OPEN, because a zero-release account is prompted to create one (deferred and
dismissible since 2026-08-28 — see "First-release prompt" below) and must still
get its one auto-scope when that first release lands.

### The behaviour: one rule, three cases

`goBack` in `WorkspaceView.tsx`, shared by the desktop arrow and the mobile one:

1. **A scene is open** -> `closeScene()`. Lands on Activities for the same
   release, and never consults history.
2. **No scene** -> the previous in-app URL from `lib/nav-history`, pushed.
3. **Nothing usable** -> `setScope(null)`, the old behaviour, still the floor.

**Case 1 is load-bearing, not just the founder's preference** (asked and
answered, 2026-08-25): because history is never read while a scene is open,
scene-to-scene ping-pong is structurally impossible rather than merely guarded
against, and one stray tap can never throw someone out of a release they were
part-way through.

### Three things a later change will be tempted to get wrong

1. **It must not become `router.back()`.** A legacy-route redirect can make a
   scene URL the FIRST history entry in a tab, so `back()` would eject the user
   out of the app entirely. Recorded at `useSceneOverlay.closeScene`, the stub it
   names is real, and nothing in this app calls `router.back()` anywhere.
2. **`resolveWorkspaceBackTarget` (in `lib/nav-history.ts`) rejects a previous
   location that still scopes THIS release, and that is the point of it.**
   `nav-history` holds ONE slot, not a stack, and skips same-URL writes — so
   immediately after closing a scene the previous location IS that scene's own
   URL, and pushing it would re-open what the user just left. Going back to the
   release you are leaving is not leaving it. This is the analogue of the
   Settings back button's `!previous.startsWith('/settings')` guard, which does
   not transfer directly because both URLs here share one pathname.
   Mutation-tested: removing the guard fails exactly the ping-pong test.
3. **The label is derived from `activeScene` alone, never from the resolver.**
   The resolver reads `sessionStorage`, and a storage read during render gives
   the server and the client different text for one attribute. The button is not
   in the server output today (the skeleton gate holds while `authLoading`), so
   it would not mismatch in practice, but a label is not worth depending on
   that. "Back" is vague and never wrong; "Back to all releases" was specific
   and usually wrong.

**Reuse, not new plumbing:** `lib/nav-history.ts` and `NavigationTracker` have
existed since 2026-07-23 (founder request) and already record the previous in-app
URL, query string included. The Settings back button was their only consumer.
Nothing new was built to store history.

Also corrected: `WorkspaceDesktopFocused`'s `onClose` prop doc claimed it is
"omitted when there is no catalog worth returning to — a workspace with a single
release". That was never true of the code (the only call site always passes it),
and it is a large part of why a dead button read as intentional.

### Verified

1274 tests (8 new in `lib/nav-history.test.ts`, the module's first), `eslint .`
at the exact 3-error / 66-warning baseline, `next build` green by exit code with
`/auth`, `/onboarding` and `/settings` still `○ Static`. **One of those three
pre-existing errors is on this very machinery** — `hasAutoScopedRef.current` read
during render — and converting the ref to state was deliberately NOT bundled: it
would fix the lint error but changes render timing on the skeleton gate, which is
a bigger and riskier change than the bug being fixed.

**Not verified:** the click itself. The workspace needs an authenticated session
with a real release, which this sandbox cannot mint (and it cannot reach either
urganize domain — the proxy answers 403 to CONNECT), so the three cases rest on
unit tests plus traced call paths. The auto-scope branch has no unit test at all,
since this repo does not test components. Worth one pass on a real account: from
`?release=X&scene=coverart`, press back three times and expect Activities, then
wherever you came from, and never a silent no-op.

### It was still a trap: nav-history was one slot, not a stack (2026-08-29, v1.5.4)

Founder, four days later, screenshot with the arrow circled: *"This back button
gets stuck a lot right now I can't even go back."* The 2026-08-25 fix made the
arrow DO something; it did not make it TERMINATE.

**The whole cause is the data structure, and it is provable on paper.**
`lib/nav-history.ts` held a `current` + `previous` PAIR, and `recordNavigation`
moves `current` into `previous` on every route change. So a back press pushed the
previous page and, in the same breath, wrote the page it had just left into the
slot — making the very next back press come straight back. **Two surfaces read
that one slot** (this arrow and `SettingsPageClient`'s), so the loop was one tap
wide:

```
/dashboard?release=X  ->  /settings  ->  back  ->  /dashboard?release=X
                      ->  back  ->  /settings  ->  back  ->  ... forever
```

The founder had been living in Settings → Teammates all week, which is why it was
"a lot, right now". The same loop runs between any two workspace URLs: two
different releases (reachable from UrgAns, the notification bell, a note's
release chip, and the desktop rails), or a release and `/dashboard/notes`. The
existing `scopesRelease` rejection caught exactly ONE instance of this shape —
previous still scoping the SAME release — which is why it read as fixed.

**`lib/nav-history.ts` is a bounded stack now** (`urganize.nav.stack`, cap 20),
and the rule that makes back terminate is three lines in `nextNavigationStack`:
navigating to the entry directly BENEATH the top **pops** instead of pushing. It
cannot tell our button from the browser's Back or an edge swipe, and must not —
all three are the same move. Every back press therefore shrinks the trail and the
loop above reaches the catalog and stops. `readPreviousLocation` keeps its
signature, so **neither back button's call site changed** and Settings is fixed by
the same edit.

Five things worth knowing before editing this:

1. **The pop rule is the fix; mutation-tested.** Deleting that one line fails
   exactly five tests, including both `terminates the ... loop` cases. The two
   loops are pinned as end-to-end sequences rather than unit assertions, because
   the defect was never in a single call — it was in what the calls did to each
   other.
2. **Only ONE step down counts as a pop.** A jump to an older entry pushes. The
   narrow rule is precisely the "user went back one step" signal, and the cap
   handles everything else; a "truncate to wherever it matches" rule would also
   collapse legitimate forward revisits.
3. **`resolveWorkspaceBackTarget`'s same-release rejection STAYS**, and is not
   made redundant by the stack. Scene switches `replace`, which appends with no
   matching pop, so the entry beneath the top can still be a scene of the release
   being left. That guard is also why the trail can grow on replace at all —
   hence the cap.
4. **A third rejection was added: a target equal to the page you are already
   on.** The trail cannot normally produce it (it never holds one URL twice in a
   row), so this is insurance against a navigation that never reached
   NavigationTracker's effect — the cost of being wrong there is the worst
   possible outcome for this button, a tap that visibly does nothing. It reads
   `window.location` at CLICK time, never a render-time copy (the MobileNavBar
   FAB pattern).
5. **Deploy carries a one-tap degradation, by design.** Open tabs hold the old
   `urganize.nav.current` / `.previous` keys, which nothing reads any more, so the
   first back press after the deploy finds an empty trail and falls to its floor
   — the catalog for the workspace, `/dashboard` for Settings. Both are safe, and
   the trail rebuilds from the next navigation. The old keys are deliberately not
   migrated or cleaned up: sessionStorage is per-tab and dies with the tab.

- **Verified:** 1665 tests (16 new in `lib/nav-history.test.ts`, which had 8 and
  covered only the pure resolver), `eslint .` at the exact 3-error / 65-warning
  baseline, `next build` green by exit code with `/auth`, `/onboarding` and
  `/settings` still `○ Static`. Both new guards mutation-tested.
- **Not verified:** not pressed in a browser — the workspace needs an
  authenticated session this sandbox cannot mint, and there is no network route
  to app.urganize.app. The storage round trip runs against a Map-backed
  sessionStorage stub (the `lib/credit-prefill.test.ts` approach), not a real one.
  Worth one pass on a phone: from a release go to Settings, press Back, then press
  the release's arrow — it must reach the catalog, not return to Settings.

### The arrow stopped reading history at all (2026-08-30, v1.9.1)

Third report on the same button, and the founder settled it by naming the
behaviour he wanted rather than the bug: *"this back button is failing again …
clicking home while in task view should lead them to catalog view, same thing
for that back button, always."* **The two fixes above are superseded, not
extended: the release back arrow has ONE destination now — the catalog — scene
open or not, however you arrived.** `goBack` is one line, `setScope(null, {
forgetScene: true })`, and `resolveWorkspaceBackTarget` is deleted.

**Why the previous rule kept producing reports even though each fix was
correct.** Both earlier passes made the mechanism sound and left the SHAPE
wrong: a destination computed from a trail is unpredictable by construction, and
the trail can legitimately answer with something that is not the catalog — the
previous entry can be another release (reachable from UrgAns, the bell, a note's
release chip, the desktop rails), or UrgAns, Notes or Settings, and the 20-entry
cap drops the catalog off the bottom of a long session entirely. Every one of
those is a defensible "back" and none of them is what someone pressing the arrow
beside a release title expects. That is the difference between a fixed bug and a
fixed button.

**Three things a later change will be tempted to get wrong:**

1. **The position is the argument.** The arrow sits in the RELEASE HEADER,
   beside the title and above the scene tabs, so it means "leave this release";
   the tabs manage what is inside one. Browser Back and the edge swipe already
   do history, and duplicating them in a chrome button made both feel
   unreliable. Do not reintroduce a "smart" destination here — git history has
   the resolver if the case is ever genuinely made.
2. **`forgetScene` (new on `SetScopeOptions`) is what stops it looping.**
   `setScope` records the outgoing release's open scene so re-entering resumes
   it (`lib/scene-memory`, 2026-08-17) — right when you are SWITCHING between
   releases, wrong when you have just deliberately backed out, because you would
   tap that release again and land straight back in the scene you were trying to
   escape. Only the explicit exits pass it; rail cards, UrgAns links and note
   chips must not.
3. **Closing a scene without leaving the release is still one tap**, which is
   what makes the collapse safe: every scene's own entry point is a toggle (the
   lit mobile top tab, the lit desktop pill), and desktop additionally keeps
   TasksPanel's dedicated "Activities" button. A folded-menu scene on mobile
   costs two taps (hamburger, then the lit item) — the one real cost of this
   change, and the reason worth re-reading if anyone wants the close-scene step
   back as case 1.

**`MobileNavBar`'s Home tab was paired with it**, per the founder's sentence.
Its `<Link href="/dashboard">` already did the leaving (no query, so `?release=`
and `?scene=` go together); what was missing was the other half — it now calls
`rememberScene(releaseId, null)` so Home and the arrow land in the same place
AND come back to the same place. Read at click time, not via `useSearchParams`,
for the reason `SongTab`'s header gives. **The desktop Catalog links (the
identity card's nav, the topbar icon) are deliberately NOT changed** — they are
navigation rather than an exit, and desktop's exit is the arrow itself; flagged
so the asymmetry is a decision rather than an oversight.

**`lib/nav-history.ts` survives with one consumer, Settings' back button**,
which is a genuinely different control: Settings is a place you visit FROM
somewhere, so returning there is its whole point (founder request, 2026-07-23).
The stack and the pop rule are what keep IT terminating, so none of that moved.
Deleting the resolver did take the flow-page rejection with it, and Settings
guards only against landing back on `/settings` — so a Settings back can in
principle land on a bouncing page like `/auth`. Pre-existing (the resolver never
guarded Settings), surfaced rather than absorbed.

- **Verified:** 1708 tests (the 14 that remain in `lib/nav-history.test.ts`
  cover the trail Settings still depends on; the ~26 resolver cases went with the
  resolver), `eslint .` at the exact 3-error / 66-warning baseline, `next build`
  green by exit code with `/auth`, `/onboarding` and `/settings` still
  `○ Static`.
- **Not verified:** not pressed in a browser. The workspace needs an
  authenticated session this sandbox cannot mint and there is no network route to
  app.urganize.app, and this repo does not test components, so `goBack` itself has
  no unit test — it is one call now, which is most of why that is tolerable. Worth
  one pass on a phone: from a release open Collect metadata, press the arrow once
  and expect the catalog; tap the release again and expect Activities, not
  Collect metadata.

### Home always reaches the catalog (2026-09-01, v1.14.1)

Founder: *"clicking the home button should always lead back to catalog view no
matter what, if the code needs clean up, clean up."*

**The fourth report caused by one auto-scope, and the first with a reproducible
mechanism.** A workspace holding exactly one release scopes itself to that
release on arrival — "a catalog of one is not a catalog" (founder call,
2026-08-12). `WorkspaceView` guards that with a `useRef` whose own comment says
the bug out loud: it means *"the auto-scope has had its one chance **THIS
MOUNT**"*. `WorkspaceView` unmounts on every navigation away from `/dashboard`,
so the chance came back every time you returned — and Home, Catalog and the back
arrow all return. Tap Home from Settings on a single-release account and you
navigated to the catalog and were dragged straight back into the release,
**invisibly**, because the skeleton gate covers exactly that frame. The button
looked broken because it could not reach its destination.

That also explains why the 2026-08-31 pass could not reproduce it: it traced the
same-page case (Home while already on `/dashboard`), where the ref is spent and
Home works correctly. Its prediction named a full page load as the remaining
hole; the real hole was one route change, which is far easier to hit.

**Five things worth knowing before editing this:**

1. **A ref cannot fix it, because the fact outlives the component.**
   `lib/catalog-intent.ts` records "the user asked for the catalog" in
   **sessionStorage**: per tab, survives a reload, dies with the tab — exactly
   the lifetime of "this visit". Every deliberate exit writes it and the
   auto-scope reads it, so the one navigation whose entire purpose is to reach
   the catalog can never be undone by a convenience that assumes you did not
   mean it.
2. **The auto-scope is KEPT, deliberately, and that is the scope line.** The
   founder asked for the buttons to work, not for signing in to stop landing on
   your only release — which is the only thing the 2026-08-12 call was ever
   about. An undirected first arrival in a session still gets its one bounce.
   Deleting the auto-scope outright is a one-line follow-up if it is ever wanted
   (drop `isSingleRelease`, the ref, the effect and the gate's third term, and
   this module goes with them); it would also retire this whole bug class, and
   it is a founder call rather than a cleanup.
3. **It FAILS TOWARD NOT AUTO-SCOPING.** An unusable session store answers
   `isCatalogRequested() === true`, because a store that cannot be written is a
   store where no exit can ever record intent. The two outcomes are "a
   private-window user with one release lands on a one-card catalog" and "a
   private-window user can never reach their catalog at all"; only the first is
   an inconvenience. Mutation-tested.
4. **The probe is a real WRITE, not a read.** Safari's private mode serves
   `getItem` happily and throws on `setItem`, so a read-only probe reports a
   store that cannot hold the mark an exit is about to write — the same
   reasoning `lib/install-prompt.ts` records for its own probe.
5. **The one storage read during render is safe only because the skeleton gate
   leads with `authLoading`.** `WorkspaceView` reads the record in a lazy
   `useState` initializer, which runs during SSR too; `authLoading` is `true` on
   the first render for the server AND the client (auth-store's initial
   `isLoading: true` is not in `partialize`, verified), so both render the
   skeleton and the value cannot change the first paint. **If that gate ever
   stops leading with `authLoading`, this has to move to a mount effect** — an
   effect was rejected here only because it would add a
   `set-state-in-effect` warning above the baseline for no behavioural gain.

- **`leaveReleaseForCatalog()` is the shared step, replacing
  `forgetSceneForCurrentRelease()` at every call site** — it forgets the scene
  AND records the intent, so the two halves of one move cannot drift apart. That
  drift is the documented history of this control: the first three surfaces
  diverged from the fourth before the shared step existed. `forgetScene`
  survives in `scene-memory.ts` as that step's scene half plus `setScope`'s
  path; a new catalog control calls `leaveReleaseForCatalog`, not it.
- **The actual one-line fix inside all of that: `handleHomeClick`'s
  `if (!isHome) return;` is gone.** That guard was harmless for the scene half
  (no `?release=` on `/settings` to forget, so the call self-no-ops) and fatal
  for the intent half, because the page it swallowed the intent on is precisely
  the page whose remount would auto-scope you back.
- **Five surfaces, one rule:** MobileNavBar's Home tab, the topbar's Catalog
  icon, the side menu's Catalog row, the mobile search's page results, and
  `WorkspaceView`'s back arrow (which marks the intent itself, since `setScope`
  already does its scene half properly). The arrow marking it is new and makes
  its exit survive a refresh, which it did not before.
- **Reset on sign-out**, beside `resetSceneMemory()` and `resetSceneData()`: a
  same-tab logout then login is a new arrival and gets its bounce back.
- **Verified:** 1941 tests (19 new in `lib/catalog-intent.test.ts`), `eslint .`
  at the exact measured baseline (**3 errors / 70 warnings**, all pre-existing in
  `WorkspaceView.tsx`) with **zero** new findings, and `next build` green **by
  exit code** with `/auth`, `/onboarding`, `/settings` and `/dashboard` all still
  `○ Static` — the last one matters, since this added a storage read to
  `WorkspaceView`. Two mutation passes, each failing exactly its own test:
  failing open on an unusable store, and dropping the intent half of the shared
  step.
- **Not verified:** nothing has been clicked in a browser. The workspace needs an
  authenticated session this sandbox cannot mint and there is no network route to
  app.urganize.app, and this repo does not test components — so the fix rests on
  the module's unit tests plus a traced read path. Worth one pass on a
  **single-release** account, which is the only account that can show this: from
  inside the release go to Settings, press Home, and expect the catalog; then
  refresh and expect to still be on the catalog.
