# List and Timeline toggle in Work the plan (2026-10-28, v1.202.0, no flag)

Founder asked for the timeline to fold into Work the plan behind the sleekest toggle, usable on a phone only sideways. Mock approved ("Yes"). Same toggle on phone and computer.

- `components/workspace/PlanViewToggle.tsx`: two small icons (list, Gantt) in a thin outline, active one lightly shaded; names on hover and for screen readers. Still the `activities` and `timeline` scenes in the URL.
- Computer: the toggle leads the plan tools in the page bar (`viewToggle` on `PlanListControls`, shown in TimelineScene and TasksPanel). Phone: it sits in `RolloutPhoneHeader`'s icon row (`planView` prop).
- The rollout menu no longer has a Timeline row (`useRolloutMenuActions` drops it). Work the plan is lit for either view and opens the view last picked this visit, else the default. `lib/rollout-menu.ts` is unchanged.
- `lib/plan-view.ts`: `pickPlanView`, plus a per-visit memory (module Map, not stored across visits).
- A phone held upright (`NARROW_PORTRAIT_QUERY`, under 640px wide and portrait) shows `RotatePrompt` in the timeline's place; with no pick yet it opens on the list. Tablets and sideways phones open the timeline. `?scene=timeline` links still work.
- Not checked on a real phone or with a browser. `pnpm test` passes except two `links-server.test.ts` failures that fail the same without this change.
