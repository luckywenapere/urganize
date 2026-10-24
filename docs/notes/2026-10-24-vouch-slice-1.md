# Vouch, slice 1 (2026-10-24, v1.171.0)

Founder approved the mock and this slice on 24 Oct 2026. Behind `NEXT_PUBLIC_FEATURE_VOUCHES`, which **ships ON** (only `'false'` turns it off) and also needs `NEXT_PUBLIC_FEATURE_RELATIONSHIPS` and `NEXT_PUBLIC_FEATURE_WORKSPACE` (`isVouchesEnabled` in `lib/vouches.ts`). Migration `20261024200000_vouches.sql`, **not applied anywhere yet** (the founder runs it in the Supabase SQL editor).

## What it does
1. **Who's doing it.** A row under the assignee in the activity pop-up (`components/tasks/TaskPersonSelect.tsx`): one of the team's My People, or nobody. Writes `tasks.assigned_person_id` (who did the work), never `assigned_to_user_id` (the teammate who owns it). Hidden when the team has nobody in My People or the list cannot be read (artist-scoped members get 403 from the gate).
2. **Worked together** on `/dashboard/relationships/[personId]`: derived from the team's activities with that person on them, never typed. Count of rollouts (green) plus rows "Artist — Rollout · Activity · Mon YYYY" (`workedTogetherLine`). The month is done date, else due, else added. Cancelled activities and rollouts in Trash are left out.
3. **The vouch prompt** (`components/tasks/VouchSheet.tsx`): marking ONE activity done that has a person on it opens "How was {first name} on this?" with face, name, role · company, one-pick skill chips (`suggestSkills`: one from the activity title, else the person's role, then "On time" and "Easy to work with"), an optional one line (140), the grey "Only your team sees this until {first name} claims their profile." and Vouch / Skip.
4. **Your vouches** on the person page: skill chips, then a card per vouch with a note (note, who, skill, month).

## Things worth knowing before editing this
- **The prompt is a fourth store slot** (`vouchPrompt` in `useTaskStore`), written in the same `set()` as the done flip, like the check-in and the cover art ask. One bottom surface per completion: cover art, then **vouch**, then the check-in, then the undo toast. Reopening or a failed save closes it.
- **Bulk Mark done never asks**: `completeTasks` runs each id with `quiet: true`, and the vouch decision is `!quiet && ...`. `lib/vouches-guard.test.ts` holds both.
- **The store knows who is on what without touching the task select.** `tasks.assigned_person_id` is NOT in `TASKS_SELECT_COLUMNS` on purpose: adding it would turn every task read into a 42703 before the relationships migration. Instead `useRelationshipsStore.assignments` (task id to person id) is loaded from `GET /api/relationships/assignments` whenever `useTaskStore.setTasks` runs (coalesced, fresh for 15s), and the picker updates it optimistically. If it has not loaded yet when a box is ticked, there is simply no prompt that time.
- **Routes live under `/api/relationships`** (`assignments`, `assignments/[taskId]`, `[personId]/vouches`), so `relationships-guard.test.ts` holds them to `resolveRelationshipsContext` (team from the signed-in user, writes marked as writes). Each also answers 404 first when the vouch flag is off.
- **One vouch per team per person per skill** (unique index). A repeat updates `task_id`, `created_by` and the note; an empty note keeps the old one (the column is left out of the upsert).
- **Degrades before its migration**: `isMissingSchema` (42P01, 42703, PGRST204, PGRST205). Reads return empty; writes answer 503 "This is switching on soon."
- **Private**: select policy for the team's members, no write policy, explicit grants (principle 9). Public display waits for the claim flow.

## Not built in this slice
Public vouches after claim, vouching from the person page directly, editing or removing a vouch, Who's doing it in the quick-create form, the list rows or the Timeline, and UrgAns tools for any of it.

## Verified
Type-check (`tsc --noEmit` in apps/web) and the full vitest run. Not rendered in a browser, and nothing run against a real database.

## Activation
1. Make sure `20261003100000_relationships.sql` and `20261015120000_my_people.sql` are applied (both are `if not exists`, safe to re-run).
2. Apply `20261024200000_vouches.sql`.
3. Put a person on an activity, tick it, vouch, and check the person page.
