# An explicitly requested scene was disposable (2026-09-08, v1.32.1)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report: he drafted an EP rollout plan with UrgAns, tapped **"Review
your draft plan"**, and landed on the **Metadata** scene instead. Repeatable.
The account has **exactly one release**, which turns out to be the trigger.

**The button was never wrong.** `WorkspaceView.tsx:888` calls
`openScene('plan', id)`, which writes `?release=X&scene=plan` and pushes it —
and there is exactly one control in the whole app whose label contains
"Review", so there was no mis-targeted link to find. The scene was being
**rewritten after the click**.

### Root cause: two owners, one param, no contract

`useReleaseScope.setScope` threw away whatever `scene` the URL was carrying and
substituted the one it remembered for the incoming release:

```ts
const resumedScene = releaseId ? recallScene(releaseId) : null;
if (resumedScene) params.set(SCENE_PARAM, resumedScene);   // clobbers it
else params.delete(SCENE_PARAM);                            // or drops it
```

`openScene` treated that param as an explicit request, `setScope` treated it as
its own to overwrite, and the `?new=1` effect deleted it outright. Nothing said
which won, and **no test anywhere asserted that a requested scene survived
anything** — which is why it shipped.

**MEMORY IS A DEFAULT, NEVER AN OVERRIDE.** That inversion is the whole bug.

**Why one release makes it fire.** `WorkspaceView.tsx:293-327` auto-scopes a
single-release account to its only release on arrival — through `setScope`, so
through the clobber. Its guard (`hasAutoScopedRef`) is **per mount**, and
`WorkspaceView` unmounts on every trip to Settings, Notes, UrgAns or the
catalog, so the auto-scope re-arms on every return to `/dashboard`. Once
Metadata was the remembered scene for that release — written by any release-card
tap or deselect, neither of which passes `forgetScene` — every later arrival
resolved to `scene=metadata` over the top of whatever had just been asked for.

### The rule now, and where it lives

`decideIncomingScene` in `lib/scene-memory.ts`, pure and unit-tested. Highest
precedence first:

1. **`requested`** — the caller said so outright. `null` is a real answer
   ("no scene"), so the field's ABSENCE is what means "no opinion", tested with
   `in` rather than truthiness. Same absent-vs-null distinction the metadata and
   curator PATCH routes make, and for the same reason: three states, not two.
2. **`urlScene`, and ONLY when `previousReleaseId` is null.** That is the one
   case where the scene in the address bar was authored for the release being
   scoped TO — a deep link, a shared URL, or the single-release auto-scope
   firing under one. Switching from release A to B must NOT carry A's scene
   across; that leak is the reason scene memory exists at all.
3. **`remembered`** — `recallScene`'s answer, flag-filtered here.

**That second condition lives INSIDE the pure function rather than in the
hook**, deliberately: `useReleaseScope` renders nothing and has no unit test, so
a decision left inline there is a decision nothing checks. That is how the
original bug survived.

`SetScopeOptions` also gained **`scene?: SceneName | null`**, so a caller can
say "go to this release and show this scene" in ONE navigation. Before, that
meant `setScope` then `openScene` — two navigations where the first resolves the
scene from memory and the second corrects it, so the wrong scene paints for a
frame and either call can lose the race.

### Five adjacent instances of the same class, all fixed

1. **`WorkspaceView`'s `?new=1` effect** rebuilt the URL as
   `/dashboard?release=<id>`, discarding `scene` **and** the calendar's
   `calendar`/`month`. It deletes only `new` now. A create flow that landed on a
   scene lost it the instant the guide was consumed.
2. **`resolveActiveScene` gated five scenes and skipped four.** The comment
   claimed metadata / files / pitch / plan "gate themselves inside
   `ReleaseScenePanel`" — **that file reads no feature flag at all, and never
   has**, so those four had no URL-level gate anywhere. Files has been off in
   production since v0.16.4, so `?scene=files` was a header with a dead fetch
   under it for anyone holding an old link. All nine flag-gated scenes are gated
   here now (founder call: an old link lands on the release), leaving
   `activities` as the only ungated name — it is `resolveMainView`'s fallback,
   so gating it would leave the panel blank after a rollback.
3. **`SCENE_PREFETCH_ORDER` warmed `files` and `pitch` unconditionally.** With
   those flags off their API routes 404 and `readJson` throws, so the prefetch
   spent a guaranteed 404 per scoped release and then threw — the identical bug
   metadata's own entry was fixed for on 2026-08-27.
4. **A remembered scene outlived the flag that allowed it.** Switch Content off
   and a release last showing the calendar got `scene=calendar` written back
   into its URL, where `resolveActiveScene` nulled it on render: address bar
   said one thing, panel showed another, pill lit for a scene not on screen.
5. **`WorkspaceSkeleton` reserved the wrong body.** `hideRails` read the real
   `?scene=` param while the body read `resolveMainView()` alone, so every scene
   URL reserved a timeline (or bucket) body and then painted a scene over it —
   the exact shift the file's own comment says it exists to prevent. Both read
   ONE threaded value now, which is the point: a skeleton that contradicts
   itself is worse than one that guesses.

`ReleaseScenePanel` also bails on a scene it has no body for rather than
rendering a header whose title is `undefined`. That IS reachable: `'activities'`
is a legal `SceneName` a caller can pass today.

### One reported defect that turned out not to be real

An exploration pass flagged that the pills light from the URL alone while the
body additionally needs `scopedReleaseSlim`, so a release not yet loaded would
light "Plan" over the main view. **Checked, and it does not happen:** all nine
pills are gated on `scopedRelease` (the same object), and `showOutboundPills`
carries `Boolean(scopedRelease)`, so no pill renders without one. Left alone
rather than "fixed" — recorded here so nobody re-chases it.

A compile-time scene-coverage type was also written and then deleted, proven
redundant by mutation: `SCENE_LABELS`, `SCENE_PERSISTED` and `ScenePayloadMap`
are all `Record<SceneName, …>`, so a new scene already fails the build in three
places. Decoration, by this file's own standard.

### Comment drift corrected in place

`useSceneOverlay` said the URL and data layers "key off the same **four**
names" (ten), its `activeScene` docstring said "one of the four known scenes",
`TasksPanel` said "the four release scenes", and `scene-cache.test.ts` had a
case titled "the five ungated scenes" asserting four.

### The edge-case sweep

The ask was for exhaustive coverage. **"At least 10,000" is emphasis, and
inventing a count would be dishonest** — what was actually done is the matrix,
with a fix or a test for every combination that can produce "asked for A, got B
or nothing":

- **10 scene names × 2 flag states.** `resolvePanelBody` now has a case
  asserting every name in `SCENE_NAMES` resolves to itself with the flags on,
  so a new scene cannot be added without it; and every flag-gated name resolves
  to the main view with them off.
- **5 param shapes** — absent, valid, unknown, wrong-case, empty. All covered;
  case and whitespace are deliberately NOT normalised, since the app only ever
  writes this param itself, so a near-miss is a hand-typed URL.
- **4 scope transitions** — no release → release (preserve the URL scene),
  release A → release B (resume B's memory, never carry A's), same release (the
  branch does not run at all), release → none (scene deleted).
- **4 navigation kinds** — push, replace, mount, remount. The per-mount ref is
  what made remount the interesting one, and it is why the fix is in the
  precedence rule rather than in the guard.
- **`?release=undefined` from a template literal over an optional id** — ruled
  out rather than assumed: every client navigation that interpolates a release
  id either throws first (`useStartTestRelease`), guards the whole entry
  (`WorkspaceIdentityPanel`), or creates the release and throws unless it gets
  an id back (`PlannerIntakeModal`).
- **Two owners writing one param** — the class itself. `openScene` and
  `setScope` now have a stated contract, and it is enforced by the one function
  both funnel through.

### Verified

**2993 tests** (13 new; clean-tree baseline measured at 2980 first), `eslint .`
at **exactly** the measured 3-error / 81-warning baseline with **zero** new
findings, `tsc --noEmit` clean apart from the documented pre-existing
`confirmed-action.test.ts` errors, and `next build` green **by exit code** with
the four newly gated flags ON and with them OFF, `/auth`, `/onboarding`,
`/settings` and `/dashboard` all still `○ Static` in each.

**Four mutations, each killing exactly its own tests** and each printing
`APPLIED` before running, per the recorded lesson that a mutation which never
landed is indistinguishable from a survivor: reverting to "memory always wins"
(the original bug, 2 failures), truthiness instead of `in` for `requested` (1),
carrying the URL scene across a release switch (1), and dropping the flag filter
on a remembered scene (1). The file was restored byte-identical after each.

### Not verified

**Nothing has run in a browser.** This sandbox cannot mint a session and has no
route to app.urganize.app, so the founder's own repro is the real test. On the
one-release account: open Metadata on the release, tap the release card twice to
deselect and reselect, then tap **"Review your draft plan"** and confirm it
opens the plan. Then go to Settings and back to `/dashboard` and confirm you are
not dumped into Metadata.

The `?new=1` fix is **comment-guarded rather than test-guarded** — it is four
lines of standard `URLSearchParams` inside a React effect, and this repo has no
component tests to reach it. Said plainly rather than implied.
