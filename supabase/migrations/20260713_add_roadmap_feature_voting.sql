-- Public feature-voting roadmap (urganize.app/roadmap)
--
-- Lives on apps/homepage but authenticates against the SAME Supabase project
-- apps/web uses (shared auth.users pool, independent per-domain sessions --
-- see apps/homepage/lib/supabase/client.ts, a separate client instance from
-- apps/web's). No SSO: a user signs in separately on each domain.
--
-- Lifecycle: pending (private, admin-only) --promote--> under_consideration
-- (public, voteable) --> planned --> in_progress --> shipped. declined is a
-- terminal, hidden state reachable from pending OR under_consideration.
-- Voting is only allowed once an idea is public (under_consideration or
-- later) -- matching PostHog's "vote to help us decide what to build" model.
--
-- ROLLBACK (manual, if ever needed):
--   drop view if exists public.roadmap_ideas_public;
--   drop function if exists public.feature_idea_vote_count(uuid);
--   drop table if exists public.feature_votes;
--   drop table if exists public.feature_ideas;
--   drop function if exists public.is_roadmap_admin();
--   drop type if exists public.feature_idea_status;

do $$ begin
  create type public.feature_idea_status as enum (
    'pending',
    'under_consideration',
    'planned',
    'in_progress',
    'shipped',
    'declined'
  );
exception when duplicate_object then null;
end $$;

-- Admin check. Hardcoded allowlist mirrors apps/web/lib/paywall-allowlist.ts's
-- pattern, enforced here at the RLS layer because apps/homepage calls
-- Supabase directly from the browser with the anon key. Lowercased
-- comparison; coalesce(...,false) fails CLOSED for anonymous/no-email
-- callers. MAINTENANCE: duplicated in apps/homepage/lib/roadmap/admin.ts
-- (client-side UI mirror, not a security boundary). Keep both in sync.
create or replace function public.is_roadmap_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') in (
      'luckydio10@gmail.com'
    ),
    false
  );
$$;

create table if not exists public.feature_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  status public.feature_idea_status not null default 'pending',
  submitted_by uuid null references auth.users(id) on delete set null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_ideas_title_length_check check (char_length(title) between 1 and 140),
  constraint feature_ideas_description_length_check check (description is null or char_length(description) <= 4000)
);

comment on column public.feature_ideas.submitted_by is
  'Nullable + ON DELETE SET NULL (not CASCADE): an already-public idea must survive the submitter deleting their apps/web account. A null-owner idea remains fully manageable by admin.';

comment on column public.feature_ideas.published_at is
  'Stamped once, automatically, by set_feature_ideas_published_at the first time status leaves pending into a PUBLIC state. Stays null if declined directly from pending (never made public).';

create index if not exists feature_ideas_status_idx on public.feature_ideas(status);
create index if not exists feature_ideas_submitted_by_idx on public.feature_ideas(submitted_by);
create index if not exists feature_ideas_status_created_at_idx on public.feature_ideas(status, created_at desc);

drop trigger if exists set_feature_ideas_updated_at on public.feature_ideas;
create trigger set_feature_ideas_updated_at
before update on public.feature_ideas
for each row execute function public.set_updated_at();

-- published_at auto-stamp. Explicitly excludes the pending -> declined
-- transition (an idea declined before ever going public was never
-- "published"). Guarded by "is null" so it only ever fires once.
create or replace function public.set_feature_idea_published_at()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending'::public.feature_idea_status
     and new.status <> 'pending'::public.feature_idea_status
     and new.status <> 'declined'::public.feature_idea_status
     and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_feature_ideas_published_at on public.feature_ideas;
create trigger set_feature_ideas_published_at
before update on public.feature_ideas
for each row
when (new.status is distinct from old.status)
execute function public.set_feature_idea_published_at();

-- feature_votes -- toggle-style: a vote is an insert, an unvote is a delete.
-- No updated_at column -- votes are never mutated in place.
create table if not exists public.feature_votes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.feature_ideas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (idea_id, user_id)
);

create index if not exists feature_votes_user_id_idx on public.feature_votes(user_id);

alter table public.feature_ideas enable row level security;
alter table public.feature_votes enable row level security;

drop policy if exists "Public reads visible feature ideas" on public.feature_ideas;
create policy "Public reads visible feature ideas"
  on public.feature_ideas for select
  using (
    status not in ('pending', 'declined')
    or submitted_by = auth.uid()
    or public.is_roadmap_admin()
  );

drop policy if exists "Authenticated users submit pending ideas" on public.feature_ideas;
create policy "Authenticated users submit pending ideas"
  on public.feature_ideas for insert
  with check (
    submitted_by = auth.uid()
    and status = 'pending'::public.feature_idea_status
  );

drop policy if exists "Admin updates feature idea status" on public.feature_ideas;
create policy "Admin updates feature idea status"
  on public.feature_ideas for update
  using (public.is_roadmap_admin())
  with check (public.is_roadmap_admin());

-- No delete policy on feature_ideas -- deletion is intentionally impossible
-- via the anon client (admin or otherwise). Use the SQL editor / a service
-- role if an idea ever genuinely needs to be removed rather than declined.

drop policy if exists "Users view own votes" on public.feature_votes;
create policy "Users view own votes"
  on public.feature_votes for select
  using (
    user_id = auth.uid()
    or public.is_roadmap_admin()
  );

drop policy if exists "Users cast votes on votable ideas" on public.feature_votes;
create policy "Users cast votes on votable ideas"
  on public.feature_votes for insert
  with check (
    user_id = auth.uid()
    -- Prevents a submitter from pre-loading votes on their OWN
    -- still-private idea (visible to them via the SELECT policy above)
    -- before it's ever promoted publicly. Votes only attach to ideas
    -- already in a public, voteable status.
    and exists (
      select 1 from public.feature_ideas fi
      where fi.id = idea_id
        and fi.status in ('under_consideration', 'planned', 'in_progress', 'shipped')
    )
  );

drop policy if exists "Users remove own votes" on public.feature_votes;
create policy "Users remove own votes"
  on public.feature_votes for delete
  using (user_id = auth.uid());

-- Public aggregate exposure.
--
-- roadmap_ideas_public MUST be security_invoker so feature_ideas row
-- visibility (the pending/declined hiding above) is evaluated as the
-- CALLING user, not the view owner. But that same invoker mode means a
-- naive join against feature_votes would inherit ITS "own rows only" RLS,
-- collapsing vote_count to 0-or-1 (just the caller's own vote) instead of
-- the true total. feature_idea_vote_count() is a narrow SECURITY DEFINER
-- escape hatch that returns ONLY a bigint -- never a row -- so the total is
-- correct for everyone while voter identity never leaves feature_votes
-- except to its own owner (or admin, per the SELECT policy above).
-- has_voted does NOT need the same treatment: its exists() predicate is
-- identical to feature_votes' own RLS predicate, so RLS restricting to
-- "your own rows" doesn't hide anything this subquery was ever trying to
-- see in the first place.
create or replace function public.feature_idea_vote_count(p_idea_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*) from public.feature_votes where idea_id = p_idea_id;
$$;

comment on function public.feature_idea_vote_count(uuid) is
  'Intentionally bypasses feature_votes'' own-row-only RLS (SECURITY DEFINER) to return a public vote total. Returns ONLY a bigint, never row data -- voter identity never leaks through this function. Used exclusively by roadmap_ideas_public.';

create or replace view public.roadmap_ideas_public
with (security_invoker = true)
as
select
  fi.id,
  fi.title,
  fi.description,
  fi.status,
  fi.submitted_by,
  fi.published_at,
  fi.created_at,
  fi.updated_at,
  public.feature_idea_vote_count(fi.id) as vote_count,
  exists (
    select 1
    from public.feature_votes fv
    where fv.idea_id = fi.id
      and fv.user_id = auth.uid()
  ) as has_voted
from public.feature_ideas fi;

comment on view public.roadmap_ideas_public is
  'security_invoker=true so row visibility follows the calling user''s RLS on feature_ideas (hides pending/declined from the public). Requires Postgres 15+.';
