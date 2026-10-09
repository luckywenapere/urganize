-- Release spend (brief 3 of the release savings pack, 2026-10-09).
--
-- Every rollout gets a spend list: what the team paid for on it, so the ₦150,000
-- saving can be measured by asking teams what a release cost before and after.
-- The app shows no "you saved" number; teams record what they spent.
--
-- FOUR THINGS IN THIS FILE.
--
--   1. public.release_spend: one row per payment. Money is integer kobo, never a
--      float. Lines Urganize adds itself (source = 'urganize', today the daily
--      credits line) carry a dedupe_key, so a sweep that runs twice, or covers
--      the same day twice, writes one line and not two. Users cannot edit or
--      delete those; the routes refuse, because every write here goes through a
--      service-role route.
--
--   2. public.release_payback: the once-only question "what did this release pay
--      back?", asked 30 days after release day. The ROW is created when the
--      question is sent (asked_at), which is what makes it fire once: the cron
--      inserts it with "on conflict do nothing" and only an inserted row sends.
--      The answer fills in later (amount_kobo, note, answered_by, answered_at).
--
--   3. public.can_view_release_spend(release_id, user_id): WHO MAY SEE SPEND.
--      The founder has not decided this (README, "Decisions still open"), so the
--      default is the release owner and team managers, written ONCE, here, and
--      used by both the row level security policies below and by the routes (an
--      RPC), so changing the rule later is one edit to one function.
--
--      "Team managers" = an ACTIVE owner or admin member of the release owner's
--      team (workspaces.owner_id = releases.owner_user_id, the same team the app's
--      release access rule uses), who is not limited to a different artist. A
--      plain member, a guest, an invited-but-not-joined person and anyone outside
--      the team cannot see a cost.
--
--      The function is security definer, because a policy runs as the signed-in
--      person and the tables it reads (workspace_members) may not be readable to
--      them. It refuses to answer for somebody else: a signed-in caller asking
--      about another user's access gets false, so the function cannot be used to
--      find out who manages a team. The service role has no auth.uid(), which is
--      how a route asks about the person it is acting for.
--
-- RLS: SELECT policies on both tables, calling the function. NO insert, update
-- or delete policy on either, so a signed-in person cannot write or erase a line
-- from the browser, whatever their role. The routes apply the same function and
-- the line rules (an automatic line is never editable) with the service role.
--
--   4. public.release_spend_by_category(user_id, since): the Home card's numbers,
--      which asks the function above about every rollout it counts.
--
-- Additive and safe to re-run.
--
-- ROLLBACK (manual):
--   drop table if exists public.release_payback;
--   drop table if exists public.release_spend;
--   drop function if exists public.release_spend_by_category(uuid, date);
--   drop function if exists public.can_view_release_spend(uuid, uuid);

-- ---------------------------------------------------------------------------
-- 1. Who may see a rollout's spend. Defined before the tables so the policies
--    can name it.
-- ---------------------------------------------------------------------------

create or replace function public.can_view_release_spend(p_release_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- A signed-in caller may only ask about themselves. The service role (no
    -- auth.uid()) asks about whoever the route is acting for.
    (auth.uid() is null or auth.uid() = p_user_id)
    and p_user_id is not null
    and (
      -- The person who owns the rollout.
      exists (
        select 1
        from public.releases r
        where r.id = p_release_id
          and r.owner_user_id = p_user_id
      )
      -- Or an active owner or admin of the owner's team, unless they are limited
      -- to another artist.
      or exists (
        select 1
        from public.releases r
        join public.workspaces w on w.owner_id = r.owner_user_id
        join public.workspace_members m on m.workspace_id = w.id
        where r.id = p_release_id
          and m.user_id = p_user_id
          and m.status = 'active'
          and m.role in ('owner', 'admin')
          and (m.artist_scope_id is null or m.artist_scope_id = r.artist_id)
      )
    );
$$;

revoke all on function public.can_view_release_spend(uuid, uuid) from public;
grant execute on function public.can_view_release_spend(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The spend lines.
-- ---------------------------------------------------------------------------

create table if not exists public.release_spend (
  id uuid primary key default gen_random_uuid(),

  -- The spend goes with its rollout.
  release_id uuid not null references public.releases(id) on delete cascade,
  -- The team, kept so the Home card can add up a team's rollouts without
  -- walking releases to artists to workspaces. Set null (not cascade) if the
  -- team row goes first, so a rollout's own record outlives it.
  workspace_id uuid references public.workspaces(id) on delete set null,

  -- Text with a check, not a Postgres enum: adding a value to an enum needs a
  -- migration outside a transaction, and every newer table here avoids it.
  category text not null
    constraint release_spend_category_check
    check (category in (
      'distribution', 'promo', 'playlists', 'video', 'design', 'writing_pr', 'shows', 'other'
    )),

  -- Integer kobo. The upper bound (₦1 billion) is a sanity net against a typo
  -- with too many zeros, not a business rule.
  amount_kobo bigint not null
    constraint release_spend_amount_check
    check (amount_kobo > 0 and amount_kobo <= 100000000000),

  paid_to text
    constraint release_spend_paid_to_check
    check (paid_to is null or char_length(paid_to) <= 200),

  spent_on date not null,

  -- The activity this paid for, if the person said. The route checks the task
  -- belongs to the same rollout; set null so deleting an activity keeps the line.
  task_id uuid references public.tasks(id) on delete set null,

  source text not null default 'manual'
    constraint release_spend_source_check
    check (source in ('manual', 'urganize')),

  note text
    constraint release_spend_note_check
    check (note is null or char_length(note) <= 1000),

  -- For automatic lines only: one stable key per thing that was charged, so
  -- running a sweep twice writes it once. Null on a manual line.
  dedupe_key text,

  -- Null for an automatic line, and set null if the person's account goes.
  created_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An automatic line without a key could be written twice.
  constraint release_spend_automatic_key_check
    check (source = 'manual' or dedupe_key is not null)
);

create index if not exists release_spend_release_idx
  on public.release_spend (release_id, spent_on desc, created_at desc);

create index if not exists release_spend_workspace_idx
  on public.release_spend (workspace_id, spent_on desc)
  where workspace_id is not null;

-- A plain unique index, NOT a partial one (where dedupe_key is not null). A null
-- is never equal to another null in a unique index, so any number of manual
-- lines (no key) are fine; and PostgREST can only say "on conflict (dedupe_key)"
-- with no predicate, which a partial index does not match, so a partial one
-- would make the sweep's upsert fail.
create unique index if not exists release_spend_dedupe_key_unique_idx
  on public.release_spend (dedupe_key);

drop trigger if exists set_release_spend_updated_at on public.release_spend;
create trigger set_release_spend_updated_at
  before update on public.release_spend
  for each row execute function public.set_updated_at();

alter table public.release_spend enable row level security;

drop policy if exists "Managers read their release spend" on public.release_spend;
create policy "Managers read their release spend"
  on public.release_spend for select
  using (public.can_view_release_spend(release_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. The payback question and its answer.
-- ---------------------------------------------------------------------------

create table if not exists public.release_payback (
  -- One per rollout: the primary key is what makes "ask once" real.
  release_id uuid primary key references public.releases(id) on delete cascade,

  -- When the question was sent. The row is inserted at that moment.
  asked_at timestamptz not null default now(),

  -- The answer. A payback of nothing is a real answer, so zero is allowed.
  amount_kobo bigint
    constraint release_payback_amount_check
    check (amount_kobo is null or (amount_kobo >= 0 and amount_kobo <= 100000000000)),
  note text
    constraint release_payback_note_check
    check (note is null or char_length(note) <= 1000),
  answered_by uuid references auth.users(id) on delete set null,
  answered_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Answered means an amount and a time, together; unanswered means neither.
  constraint release_payback_answer_shape_check
    check (
      (answered_at is null and amount_kobo is null)
      or (answered_at is not null and amount_kobo is not null)
    )
);

drop trigger if exists set_release_payback_updated_at on public.release_payback;
create trigger set_release_payback_updated_at
  before update on public.release_payback
  for each row execute function public.set_updated_at();

alter table public.release_payback enable row level security;

drop policy if exists "Managers read their release payback" on public.release_payback;
create policy "Managers read their release payback"
  on public.release_payback for select
  using (public.can_view_release_spend(release_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. The Home card: a manager's spend by category over a period.
--
--    One function so the rule stays in one place: it asks can_view_release_spend
--    about every rollout it would count, so a line is added up only for somebody
--    who could read it, exactly as the policies above decide. It starts from the
--    rollouts the person can reach at all (their own, or any in a team they are
--    an active member of), so it does not walk every rollout in the product, and
--    then lets the one rule decide. Like the function above it answers only for
--    the signed-in caller, or for whoever the service role is acting for.
-- ---------------------------------------------------------------------------

create or replace function public.release_spend_by_category(p_user_id uuid, p_since date)
returns table (category text, amount_kobo bigint, line_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with reachable as (
    select r.id
    from public.releases r
    where r.owner_user_id = p_user_id
    union
    select r.id
    from public.releases r
    join public.workspaces w on w.owner_id = r.owner_user_id
    join public.workspace_members m on m.workspace_id = w.id
    where m.user_id = p_user_id
      and m.status = 'active'
  ),
  allowed as (
    select reachable.id
    from reachable
    where public.can_view_release_spend(reachable.id, p_user_id)
  )
  select s.category, sum(s.amount_kobo)::bigint, count(*)::bigint
  from public.release_spend s
  join allowed on allowed.id = s.release_id
  where (auth.uid() is null or auth.uid() = p_user_id)
    and p_user_id is not null
    and s.spent_on >= p_since
  group by s.category;
$$;

revoke all on function public.release_spend_by_category(uuid, date) from public;
grant execute on function public.release_spend_by_category(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Prove the shape exists, so a partial application fails here and not at the
-- first write (which the application would have to swallow).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_class where relname = 'release_spend' and relrowsecurity) then
    raise exception 'release_spend is missing or has row level security off';
  end if;
  if not exists (select 1 from pg_class where relname = 'release_payback' and relrowsecurity) then
    raise exception 'release_payback is missing or has row level security off';
  end if;
  if not exists (select 1 from pg_proc where proname = 'can_view_release_spend') then
    raise exception 'can_view_release_spend was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'release_spend_by_category') then
    raise exception 'release_spend_by_category was not created';
  end if;
  if exists (
    select 1 from pg_policies
    where tablename in ('release_spend', 'release_payback') and cmd <> 'SELECT'
  ) then
    raise exception 'release_spend and release_payback must have select policies only';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'release_spend_dedupe_key_unique_idx') then
    raise exception 'release_spend_dedupe_key_unique_idx was not created';
  end if;
end $$;
