-- Next moves (URG-259, 2026-10-14): the one-tap "what to do next" cards on Home
-- and the rollout page. The moves themselves are worked out in the browser from
-- data already loaded (apps/web/lib/next-moves.ts), so the only thing stored is
-- which ones a person waved away. ADDITIVE AND REVERSIBLE.
--
-- 1. ONE ROW PER PERSON PER MOVE. move_key is "<rule>:<rollout id>" with an
--    optional ":<phase>" (checked by the route against isValidNextMoveKey, and
--    by the check below). A dismissed move never comes back, on any device.
-- 2. PER PERSON, NOT PER TEAM. A teammate waving a card away says nothing about
--    what the owner wants to see.
-- 3. READS AND WRITES GO THROUGH THE SERVICE ROLE (/api/next-moves). A person may
--    also read their own rows; there is no write policy.
-- 4. NO FOREIGN KEY TO releases. A key outlives its rollout harmlessly, and a
--    deleted rollout's keys are never matched again.
--
-- ROLLBACK (manual):
--   drop table if exists public.next_move_dismissals;

create table if not exists public.next_move_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  move_key text not null
    constraint next_move_dismissals_key_check
    check (char_length(move_key) between 3 and 120 and move_key ~ '^[a-z_]+:[0-9a-f-]+(:[a-z_]+)?$'),
  created_at timestamptz not null default now(),
  primary key (user_id, move_key)
);

alter table public.next_move_dismissals enable row level security;

drop policy if exists next_move_dismissals_select_own on public.next_move_dismissals;
create policy next_move_dismissals_select_own
  on public.next_move_dismissals
  for select
  to authenticated
  using (user_id = auth.uid());
