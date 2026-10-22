# Type-first release creation (2026-09-01, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

> **Amended 2026-10-09 (v1.91.3):** the tap no longer creates the rollout. The screen carries an optional title field, the cards are a changeable choice, and "Create rollout" submits. See "Naming a rollout while creating it" at the end of this file.

Founder request: "when a user creates a release, then next screen that pops up
is for them to select whether it's an EP or single or album — when they click
the one it is, the release is then created and they then go through the
release; if there is any need for them to input any data they are prompted
after they are seen scrolling around their release." Three founder decisions
confirmed at build time: **the compulsory team-login step does NOT intercept**
(straight into the release; Settings → Team keeps minting logins), **the
Rollout-plan / Blank chooser is dropped** (every type-first release is a
rollout release — "start blank" is covered by never setting a date and using
the date card's "Add an activity yourself" escape hatch), and **the deferred
prompt fires on "any exploring"** — first scroll, first scene open, or ~10s,
whichever comes first, because a brand-new dateless release has no activities
and a literal-scroll-only trigger could never fire.

Behind `NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE`, default `false`. **No API
change and NO MIGRATION** — the whole flow is composed from machinery that
already existed: title and date are already optional at `POST /api/releases`
(URG-230; title defaults to "Untitled release"), a dateless rollout release
already gets `template_pending`, and `POST .../schedule` already builds the
plan and is the only safe title+date write (the release PATCH is a full-row
PUT). Flag off, the two-step modal, the access step and the `?new=1` guide are
byte-identical to before.

**Four things worth knowing before editing this:**

1. **The tap IS the form.** Flag on, `CreateReleaseModal` renders ONE screen —
   a card per playbook from `CREATABLE_RELEASE_TYPES`, each quoting its own
   `getTemplateStats` numbers — and `handleTypeFirstPick` submits
   `{ releaseType, plan: 'template' }` directly, taking the option as an
   argument so it can never race the `setReleaseType` state update (which only
   drives the tapped card's spinner). `plan` state stays `null` all the way,
   which is what keeps step 2 and the footer unrendered without touching them.
   Mandatory mode (zero releases) keeps all its no-exit behavior.
2. **All three `onCreated` handlers branch the same way** (WorkspaceView,
   ChappiPageClient, AppShell): flag on → `router.push('/dashboard?release=…')`
   with no access step, no first-win, no `?new=1`. AppShell's instance
   deliberately breaks its own "stay on whatever page" rule for the flag-on
   path only — under type-first the release view is where the rest gets filled
   in, so landing there is the point. The `plannerPending → openIntake` branch
   is kept in all three for safety, though the flag is documented as
   incompatible with `NEXT_PUBLIC_FEATURE_RELEASE_PLANNER` (the intake would
   intercept the landing) and `NEXT_PUBLIC_FEATURE_FIRST_WIN` (it celebrates a
   plan a dateless release does not have).
3. **The deferred prompt is a bottom sheet plus the existing card, not a
   replacement.** `ReleaseSetupSheet` (name optional + date required →
   "Build my plan") follows the TaskOutcomeSheet contract — z-[170], the
   shared `task-outcome-sheet` keyframe, swipe on handle+header only, no
   Escape — but **portals to `document.body`**, because it mounts from
   WorkspaceView under AppShell's `lazy-fade` transform (the
   DeleteReleaseDialog trap; TaskOutcomeSheet skips the portal only because
   TaskUIProvider sits outside that subtree). It submits through
   `lib/schedule-release-client.ts`, the ONE client path to the schedule
   route, now also used by `SetReleaseDateCard` so the 207 handling and toast
   copy cannot drift (pure half in `lib/schedule-release-outcome.ts`,
   import-free so vitest can hold it without the supabase client's env
   requirement). Dismissing is quiet: the undismissable SetReleaseDateCard in
   the panel remains the persistent path to the same two fields.
4. **One nudge per release EVER, marked when the sheet OPENS.** The trigger
   (`useReleaseSetupPrompt` + the pure rules in `lib/release-setup-prompt.ts`)
   arms only for a plan-waiting, dateless, un-nudged release; listens with a
   single **capture-phase** document scroll listener (scroll doesn't bubble,
   but capture sees inner containers — so the desktop activities list and the
   mobile page scroll are both covered without threading a ref into
   TasksPanel); holds while the create modal is open; and persists the marker
   at `urganize.workspace.setup-prompted` (localStorage, capped list of 20,
   read only inside effects per the render-time-storage-read trap). Restricted
   storage fails open to once-per-mount.

- **Untouched on purpose:** the onboarding wizard (already type-first, its own
  flow), Chappi's `create_release` tool, `PlannerIntakeModal`'s own create
  path, and the caller-less `useReleaseStore.createRelease`.
- **Verified:** the full vitest suite (1346 passing, 18 of them new across
  `lib/release-setup-prompt.test.ts` and `lib/schedule-release-outcome.test.ts`),
  `eslint .` at the exact 3-error/66-warning baseline (the 3 warnings on
  touched files are pre-existing `set-state-in-effect` findings, confirmed
  present on a stashed tree), and `next build` green **by exit code** in both
  flag states with `/auth`, `/onboarding`, `/settings` still `○ Static`; the
  flag-on client chunks carry the type-first screen.
- **Not verified:** nothing has run against a real session — the tap-to-create
  flow, the landing, the exploring trigger and the sheet have never rendered
  in a browser (this sandbox cannot mint a Supabase session). Worth one manual
  pass at flag-flip: New release → tap EP → land in the release with no login
  step → scroll or open Metadata → sheet slides up → set name + date → plan
  builds (90 activities) → card gone.
- **Activation checklist:** (1) nothing to migrate — set
  `NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE=true` in Vercel `Web` → Production
  **with a commit that rebuilds `apps/web`** (the documented turbo-ignore
  trap), leaving `RELEASE_PLANNER` and `FIRST_WIN` off; (2) changelog entry +
  minor version bump across all 10 `package.json` files (the EPK precedent:
  the ledger entry lands at flag-flip, not at merge); (3) run the manual pass
  above.
