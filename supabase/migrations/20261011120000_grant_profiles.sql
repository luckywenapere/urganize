-- Grant profiles (2026-10-11): what a team tells us so Suggested grants can match.
--
-- Founder call, 2026-10-11: teams stored no country or career stage anywhere,
-- so the weekly matcher (apps/web/lib/grants/programmes.ts) had nothing to match
-- on. The team now says it once, on the Opportunities page. ADDITIVE; one new
-- table, nothing existing is touched.
--
-- Every column holds words from a fixed list, the same lists as
-- apps/web/lib/grants/grant-profile.ts and query-builder.ts. No free text. When
-- a list changes in code, change the checks here in a new migration.
--
-- One row per team. Members read their own team's row; writes go through the
-- service-role route (/api/opportunities/grant-profile), which applies the team
-- and guest rules once, the same as opportunities.
--
-- ROLLBACK (manual):
--   drop table if exists public.grant_profiles;

create table if not exists public.grant_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  country text
    constraint grant_profiles_country_check check (country is null or country in ('nigeria', 'ghana', 'kenya', 'south africa', 'uganda', 'tanzania', 'rwanda', 'senegal', 'cameroon', 'ethiopia', 'egypt', 'morocco', 'zimbabwe', 'united kingdom', 'united states', 'canada')),
  stage text
    constraint grant_profiles_stage_check check (stage is null or stage in ('emerging', 'independent', 'early career', 'mid career', 'established')),
  applicant_types text[] not null default array['individual']::text[]
    constraint grant_profiles_applicant_types_check
      check (cardinality(applicant_types) between 1 and 2
        and applicant_types <@ array['individual', 'organisation']::text[]),
  genres text[] not null default '{}'
    constraint grant_profiles_genres_check
      check (cardinality(genres) <= 3 and genres <@ array['afrobeats', 'afropop', 'afro fusion', 'amapiano', 'hip hop', 'rap', 'rnb', 'soul', 'pop', 'rock', 'alternative', 'electronic', 'dancehall', 'reggae', 'highlife', 'fuji', 'juju', 'gospel', 'jazz', 'folk', 'classical']::text[]),
  needs text[] not null default '{}'
    constraint grant_profiles_needs_check
      check (cardinality(needs) <= 5 and needs <@ array['recording', 'touring', 'travel', 'video', 'marketing', 'distribution', 'equipment', 'training', 'mentorship', 'showcase', 'festival']::text[]),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists grant_profiles_set_updated_at on public.grant_profiles;
create trigger grant_profiles_set_updated_at
before update on public.grant_profiles
for each row execute function public.set_updated_at();

alter table public.grant_profiles enable row level security;

drop policy if exists grant_profiles_select_own_team on public.grant_profiles;
create policy grant_profiles_select_own_team on public.grant_profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = grant_profiles.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = grant_profiles.workspace_id
        and w.owner_id = auth.uid()
    )
  );
