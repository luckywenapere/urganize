-- Suggested grants, v1 (2026-10-11): a weekly feed of grants on Opportunities.
--
-- Founder decisions, 2026-10-11: the feed is fed by a CURATED list of programmes,
-- not by live web search per team. The 20-case live search evaluation failed its
-- bars (0 of 20 queries passing, 65 of 111 results already closed, 26 wrong
-- fields; docs/agent-browser/grant-finder-results.md). Exa stays as the
-- curator's tool for finding new programmes, and a person checks every row
-- before it reaches this table. ADDITIVE AND REVERSIBLE; existing rows untouched
-- beyond two new nullable columns on opportunities.
--
-- Decisions worth knowing before changing anything here:
--
-- 1. grant_programmes IS GLOBAL AND STAFF-KEPT. One row per programme (a fund
--    with a recurring call), not per round: the round's dates live on the row
--    and are updated when the next round is announced. No policy at all, so only
--    the service role reads or writes it. Teams see programmes only through
--    their own suggestions.
--
-- 2. MATCHING FACTS ARE ARRAYS OF SHORT CODES. countries holds ISO 3166 alpha-2
--    codes plus the regions 'AFRICA', 'SSA' (sub-Saharan) and 'EU', and 'ANY';
--    applicant_types is 'individual' and/or
--    'organisation'; needs, genres and stages use the same vocabulary as the
--    grant search facts. An empty genres or stages array means "any".
--
-- 3. LOANS AND INVESTMENT ARE KEPT, NOT SUGGESTED. kind records them so the
--    curated list is complete, but the weekly job suggests only grant,
--    residency, scholarship and prize. A loan is never called a grant.
--
-- 4. A PAST DATE IS NEVER A DEADLINE. deadline_on is the CURRENT round's close;
--    when the round ends the curator moves it to last_closed_on. The job also
--    refuses to suggest a row whose deadline_on has passed.
--
-- 5. A SUGGESTION IS SHOWN ONCE PER TEAM. grant_suggestions is unique on
--    (workspace_id, programme_id). A dismissed row stays as a tombstone, so the
--    same programme never comes back to a team that said no.
--
-- 6. WRITES HAVE NO POLICY. Team members read their own suggestions; Add and
--    Dismiss are service-role routes that apply the team and role rules once
--    (guests are read-only), the same rule as opportunities.
--
-- ROLLBACK (manual):
--   drop table if exists public.grant_suggestions;
--   drop table if exists public.grant_programmes;
--   alter table public.opportunities drop column if exists source_url;
--   alter table public.opportunities drop column if exists source_read_on;

create table if not exists public.grant_programmes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    constraint grant_programmes_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  funder text not null
    constraint grant_programmes_funder_check check (char_length(btrim(funder)) between 1 and 120),
  programme text not null
    constraint grant_programmes_programme_check check (char_length(btrim(programme)) between 1 and 160),
  url text not null
    constraint grant_programmes_url_check check (url ~ '^https://'),

  kind text not null
    constraint grant_programmes_kind_check
    check (kind in ('grant', 'residency', 'scholarship', 'prize', 'loan', 'investment')),

  countries text[] not null default '{}',
  applicant_types text[] not null default '{individual}'
    constraint grant_programmes_applicant_types_check
    check (applicant_types <@ array['individual', 'organisation']::text[] and cardinality(applicant_types) > 0),
  needs text[] not null default '{}',
  genres text[] not null default '{}',
  stages text[] not null default '{}',

  -- The per-recipient award the funder states, never a fund total. Whole units.
  amount_min numeric(14, 2)
    constraint grant_programmes_amount_min_check check (amount_min is null or amount_min >= 0),
  amount_max numeric(14, 2)
    constraint grant_programmes_amount_max_check check (amount_max is null or amount_max >= 0),
  currency text
    constraint grant_programmes_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint grant_programmes_amount_order_check
    check (amount_min is null or amount_max is null or amount_min <= amount_max),
  constraint grant_programmes_amount_currency_check
    check ((amount_min is null and amount_max is null) or currency is not null),

  status text not null default 'closed'
    constraint grant_programmes_status_check
    check (status in ('open', 'upcoming', 'closed', 'paused', 'ended')),
  opens_on date,
  deadline_on date,
  last_closed_on date,
  recurring boolean not null default false,

  summary text not null default ''
    constraint grant_programmes_summary_check check (char_length(summary) <= 400),
  -- Up to a few lines quoted from the funder's own eligibility text.
  eligibility text not null default ''
    constraint grant_programmes_eligibility_check check (char_length(eligibility) <= 1000),

  -- The page the curator read, and the day they read it. Not always url: a
  -- round's call can live on a different page from the programme.
  source_url text not null
    constraint grant_programmes_source_url_check check (source_url ~ '^https://'),
  checked_on date not null,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grant_programmes_suggestable_idx
  on public.grant_programmes(status, deadline_on)
  where active;

alter table public.grant_programmes enable row level security;
-- No policies: service role only (decision 1).

drop trigger if exists grant_programmes_set_updated_at on public.grant_programmes;
create trigger grant_programmes_set_updated_at
  before update on public.grant_programmes
  for each row execute function public.set_updated_at();

create table if not exists public.grant_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  programme_id uuid not null references public.grant_programmes(id) on delete cascade,
  -- The artist it matched for, when the match used an artist's facts.
  artist_id uuid references public.artists(id) on delete set null,

  -- Why it matched, in words the card shows ("Nigeria, recording, emerging").
  why text not null default ''
    constraint grant_suggestions_why_check check (char_length(why) <= 200),

  state text not null default 'new'
    constraint grant_suggestions_state_check check (state in ('new', 'added', 'dismissed')),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  acted_by uuid references auth.users(id) on delete set null,
  acted_at timestamptz,
  constraint grant_suggestions_acted_check
    check ((state = 'new') = (acted_at is null)),

  suggested_at timestamptz not null default now(),
  -- Set when the weekly in-app notification named this suggestion.
  notified_at timestamptz,

  constraint grant_suggestions_once_per_team unique (workspace_id, programme_id)
);

create index if not exists grant_suggestions_team_new_idx
  on public.grant_suggestions(workspace_id, suggested_at desc)
  where state = 'new';

alter table public.grant_suggestions enable row level security;

drop policy if exists "Team members read their grant suggestions" on public.grant_suggestions;
create policy "Team members read their grant suggestions"
  on public.grant_suggestions for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = grant_suggestions.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = grant_suggestions.workspace_id
        and w.owner_id = auth.uid()
    )
  );

-- Where an opportunity came from, when a suggestion created it.
alter table public.opportunities
  add column if not exists source_url text
    constraint opportunities_source_url_check check (source_url is null or source_url ~ '^https://'),
  add column if not exists source_read_on date;
