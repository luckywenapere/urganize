# First-Time Onboarding Migration

Run this SQL once in the Supabase SQL editor before using the release-led first-time onboarding flow.

```sql
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists onboarding_step integer not null default 1;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz null;
alter table public.profiles add column if not exists onboarding_role text null;
alter table public.profiles add column if not exists onboarding_persona text null;
alter table public.profiles add column if not exists onboarding_release_process text null;
alter table public.profiles add column if not exists onboarding_biggest_headache text null;
alter table public.profiles add column if not exists onboarding_release_id uuid null references public.releases(id) on delete set null;
alter table public.profiles add column if not exists onboarding_task_id uuid null references public.tasks(id) on delete set null;

update public.profiles
set onboarding_completed = false
where onboarding_completed is null;

update public.profiles
set onboarding_step = 1
where onboarding_step is null or onboarding_step < 1;
```

`onboarding_role` stores the normalized workspace lens (`artist`, `manager`, `label`, or `other`) used for downstream copy. `onboarding_persona`, `onboarding_release_process`, and `onboarding_biggest_headache` store the Step 2 onboarding answers for later personalization. `onboarding_release_id` and `onboarding_task_id` keep the first release handoff resumable after refreshes.
