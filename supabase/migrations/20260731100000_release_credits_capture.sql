-- Release metadata hub + collaborator credit capture (URG-108).
--
-- Third conscious v1 scope expansion (after Chappi, content calendar) — see
-- CLAUDE.md "Scope expansion (2026-07-31)". One shareable link per release;
-- collaborators submit publishing/distribution credits through a public,
-- no-login form. The link is the access grant (release_credit_links, same
-- shape as release_epks): its existence + share_token make /credits/<token>
-- resolve. Regenerating rotates the token in place — the old link dies
-- instantly, the row (and every submission already collected) survives.
-- Submissions are submit-once by design: no edit token, no update path for
-- collaborators. A manager corrects a bad entry by deleting it; the
-- collaborator resubmits through the same release link.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.release_credit_submissions;
--   drop table if exists public.release_credit_links;
--   drop type if exists public.release_credit_role;
--   alter table public.release_metadata drop column if exists c_line;
--   alter table public.release_metadata drop column if exists p_line;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. release_metadata — the two distributor-line fields the hub edits
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

alter table public.release_metadata
  add column if not exists c_line text,
  add column if not exists p_line text;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. release_credit_role — the collaborator's contribution(s) to the release.
--    Deliberately NOT the legacy public.collaborator_role enum (that one's
--    values — manager/publicist/distributor/other — describe a business
--    relationship, not a credit-sheet role; this enum is scoped to what a
--    split sheet / DSP delivery actually asks for).
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

do $$ begin
  create type public.release_credit_role as enum (
    'songwriter',
    'composer',
    'lyricist',
    'producer',
    'featured_artist',
    'vocalist',
    'musician',
    'engineer',
    'mixing_engineer',
    'mastering_engineer',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. release_credit_links — one shareable submission link per release
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_credit_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  share_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One credit link per release.
create unique index if not exists release_credit_links_release_id_key
  on public.release_credit_links(release_id);

-- The public form's lookup path.
create unique index if not exists release_credit_links_share_token_key
  on public.release_credit_links(share_token);

drop trigger if exists set_release_credit_links_updated_at on public.release_credit_links;
create trigger set_release_credit_links_updated_at
before update on public.release_credit_links
for each row execute function public.set_updated_at();

alter table public.release_credit_links enable row level security;

-- Owner-scoped RLS, matching release_epks. The public submission path never
-- goes through PostgREST as anon — /credits/<token> resolves server-side
-- with the service-role client, same as /epk/<token>.

drop policy if exists "Owners view their release credit links" on public.release_credit_links;
create policy "Owners view their release credit links"
  on public.release_credit_links
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create release credit links" on public.release_credit_links;
create policy "Owners create release credit links"
  on public.release_credit_links
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their release credit links" on public.release_credit_links;
create policy "Owners update their release credit links"
  on public.release_credit_links
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their release credit links" on public.release_credit_links;
create policy "Owners delete their release credit links"
  on public.release_credit_links
  for delete
  using (owner_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 4. release_credit_submissions — one row per collaborator submission
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_credit_submissions (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  -- Denormalized (same call as release_credit_links) so the owner-scoped RLS
  -- policies below don't need a join back through releases.
  owner_user_id uuid not null references auth.users(id) on delete cascade,

  -- Identity
  legal_name text not null,
  stage_name text,
  roles public.release_credit_role[] not null default '{}',
  contribution text,
  email text,
  phone text,
  country text,

  -- Publishing / split-sheet core
  songwriter_split numeric(5,2) check (songwriter_split is null or (songwriter_split >= 0 and songwriter_split <= 100)),
  pro_affiliation text,
  ipi_number text,
  publisher_name text,
  publisher_ipi text,

  -- Master side
  master_split numeric(5,2) check (master_split is null or (master_split >= 0 and master_split <= 100)),

  -- Socials / bio (feeds press-kit credits later)
  instagram_handle text,
  x_handle text,
  bio text,

  -- Not a legal e-signature — a lightweight "I confirm this is accurate"
  -- acknowledgment captured at submit time.
  confirmed_accurate boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_credit_submissions_release_idx
  on public.release_credit_submissions(release_id, created_at);

drop trigger if exists set_release_credit_submissions_updated_at on public.release_credit_submissions;
create trigger set_release_credit_submissions_updated_at
before update on public.release_credit_submissions
for each row execute function public.set_updated_at();

alter table public.release_credit_submissions enable row level security;

-- Owner can view and delete submissions to their own releases. No update
-- policy (submit-once — nothing in-product ever edits a submission) and
-- deliberately no anon insert policy: the public form's POST always goes
-- through the service-role client in app/api/credits/[token]/route.ts, which
-- bypasses RLS entirely and validates the payload server-side before insert.

drop policy if exists "Owners view their release credit submissions" on public.release_credit_submissions;
create policy "Owners view their release credit submissions"
  on public.release_credit_submissions
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners delete their release credit submissions" on public.release_credit_submissions;
create policy "Owners delete their release credit submissions"
  on public.release_credit_submissions
  for delete
  using (owner_user_id = auth.uid());
