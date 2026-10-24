# One-form create rollout, glass modal, date as first activity (2026-10-24, v1.173.0)

Founder approved the mocks (one form, glass look, "Create" button, no date field) on 24 Oct 2026.

## The bug it fixed
With `NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE` on and an `initialPlan` passed (the first-rollout focus passes `'blank'`), `CreateReleaseModal` rendered BOTH the type-first body (title + big Single/EP/Album cards) and the plan body (Artist, compact Format, Title, Release date). Fields showed twice in two stacked scroll areas. The type-first submit also dropped the artist (and date) from the lower form, and the lower Format row never set `typeFirstPicked`, so it could refuse with "Choose Single, EP or Album first."

## How it works now
- `CreateReleaseModal.tsx` has ONE body, rendered when `TYPE_FIRST_CREATE_ENABLED || plan`: Artist select (only with more than one artist), Format (segmented control, roving tabindex radios, `handleTypeFirstPick` for every mode), Title (optional). No release date field in any mode, and no `releaseDate` is sent.
- Format opens on Single, selected in plain sight. `typeFirstPicked` and the "Choose ... first" refusal are gone. Type-first still sends `typeWasPicked: true` (as before), so the planner takes the visible, kept choice as an answer. Flag-off still sends `SHOW_TYPE_PICKER`.
- Both submits send `artistId` when the picker rendered (`pickedArtistId`).
- Header: sentence-case eyebrow ("Welcome to Urganize" / "Create rollout"), no plan back pill in type-first mode (flag-off two-step flow keeps it). Footer: ghost Cancel left, primary "Create" right with a blurred brand glow span under it.
- Glass: `bg-bg-surface/70 backdrop-blur-xl`, `border-stroke-strong`, a top highlight span. Fields use `FIELD_CLASS` (h-11, stroke-token fill/border), so light theme works. No hardcoded dark colours.
- `SetReleaseDateCard.tsx` is now a task-style row, still mounted as the activities banner in `WorkspaceView` (so it sits first, above the buckets): open circle, "Set your release date", "Builds the rest of your plan" (template pending, brand tint) or "Unlocks calendar and due dates", and a "Pick date" button. Pick date expands an inline date field (focus + `showPicker()` where allowed) with "Build my plan" / "Save", calling the same `scheduleRelease`. It unmounts once the store has a date.
- Kept from the old card: the rename field (pending + default title, inside the picker) and "Add an activity yourself" (pending only, under the row).

## Traps
- It is a UI pseudo-task, not a DB task row. It is not counted, assigned or completable like a task.
- `releaseType` is still a prop on the card for callers, but unused now (no playbook numbers in the copy).
- The AI planner question flow was not touched.

## Verified
Type-check, eslint (no new warnings) and the guard tests (`rollout-create-title-guard`, `first-release-focus`, `copy-pass-guard`, `back-to-close-guard`, `created-rollout-intake`). `rollout-vocabulary` has one failure that was there before this change (`packages/pricing` "Unlimited releases at a time"). Not rendered in a browser.
