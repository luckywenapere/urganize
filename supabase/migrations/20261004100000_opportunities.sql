-- Opportunities, v1 (2026-10-04): what a team can go after next.
--
-- Deals, grants, sync, brands and partnerships, entered by hand and tracked from
-- first message to signed. No outside data and no matching yet: a manager types
-- an opportunity in and moves it along. ADDITIVE AND REVERSIBLE; nothing existing
-- is touched.
--
-- Decisions worth knowing before changing anything here:
--
-- 1. OWNED BY THE TEAM, not by a person. workspace_id is the scope; created_by
--    only records who typed it, and goes null if that account is deleted.
--
-- 2. THE ARTIST AND THE ROLLOUT ARE OPTIONAL LINKS, both ON DELETE SET NULL.
--    An opportunity outlives the artist or rollout it was filed under: the
--    conversation with a brand does not vanish because a release was deleted.
--
-- 3. STATUS IS A SHORT LINE, not a pipeline engine. Seven values, one check
--    constraint. "won", "lost" and "passed" are the closed ones.
--
-- 4. THE MONEY IS AN AMOUNT AND A CURRENCY, both optional. A deal often has no
--    number yet, and a grant has a ceiling rather than a price, so a blank is
--    a real answer. Whole units, not kobo: nobody types "2,000,000.50 naira"
--    into a deal tracker.
--
-- 5. WRITES HAVE NO POLICY. Members of the team may read their own rows; every
--    write is a service-role route that applies the team and role rules once
--    (guests are read-only, like everywhere else).
--
-- ROLLBACK (manual):
--   drop table if exists public.opportunities;

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete set null,
  release_id uuid references public.releases(id) on delete set null,

  title text not null
    constraint opportunities_title_check check (char_length(btrim(title)) between 1 and 120),
  kind text not null default 'other'
    constraint opportunities_kind_check
    check (kind in ('deal', 'grant', 'sync', 'brand', 'partnership', 'other')),
  status text not null default 'idea'
    constraint opportunities_status_check
    check (status in ('idea', 'reaching_out', 'talking', 'negotiating', 'won', 'lost', 'passed')),

  -- Who it is with: a label, a brand, a supervisor, a fund. Free text.
  counterparty text not null default ''
    constraint opportunities_counterparty_check check (char_length(counterparty) <= 120),

  amount numeric(14, 2)
    constraint opportunities_amount_check check (amount is null or amount >= 0),
  currency text not null default 'NGN'
    constraint opportunities_currency_check check (currency in ('NGN', 'USD', 'GBP', 'EUR')),

  -- The one next move, and when. This is what makes the list actionable.
  next_step text not null default ''
    constraint opportunities_next_step_check check (char_length(next_step) <= 200),
  next_step_on date,
  -- A hard date: a grant closes, an offer lapses.
  deadline_on date,

  notes text not null default ''
    constraint opportunities_notes_check check (char_length(notes) <= 4000),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_team_idx
  on public.opportunities(workspace_id, updated_at desc);

create index if not exists opportunities_artist_idx
  on public.opportunities(artist_id)
  where artist_id is not null;

alter table public.opportunities enable row level security;

drop policy if exists "Team members read their opportunities" on public.opportunities;
create policy "Team members read their opportunities"
  on public.opportunities for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = opportunities.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = opportunities.workspace_id
        and w.owner_id = auth.uid()
    )
  );

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();
