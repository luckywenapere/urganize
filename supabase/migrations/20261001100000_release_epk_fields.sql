-- Release pitch kit fields (2026-10-01).
--
-- The artist has ONE standing press kit (press_kits and its sections). A
-- release adds only what is true of that release for its pitch: the story
-- behind it, and the credits to show. The cover is NOT stored here -- it is the
-- release's own cover art (releases.artwork_asset_id), edited in the Cover art
-- scene, so a second copy would only be able to disagree with it.
--
-- credits is NULLABLE ON PURPOSE. null means "show whatever the release's
-- collaborators submitted" (release_credit_submissions), so the pitch stays in
-- step as submissions arrive. A non-null array is the manager's own list and
-- is shown as written; clearing it back to null returns to automatic.
--
-- story_source records whether a person wrote the story or UrgAns drafted it
-- and a person accepted it, the same distinction press_kit_sections.source
-- makes. It never blocks an edit.
--
-- RLS is enabled with NO policies, matching release_messages and the other
-- tables reached only through the service-role client: access is enforced in
-- app code (ensureReleaseTeamReadAccess / ensureReleaseTeamWriteAccess), and a
-- direct client read or write fails closed.
--
-- release_id cascades: this is derived, release-scoped state with no meaning
-- once the release is gone. owner_user_id is the RELEASE owner, never the
-- teammate who typed it, so it cascades with the owner's account and appears
-- in the owner's data export.

create table if not exists public.release_epk_fields (
  release_id uuid primary key references public.releases(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  story text not null default '',
  story_source text not null default 'user'
    constraint release_epk_fields_story_source_check check (story_source in ('user', 'ai')),
  credits jsonb
    constraint release_epk_fields_credits_is_array check (credits is null or jsonb_typeof(credits) = 'array'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_epk_fields_owner_idx
  on public.release_epk_fields (owner_user_id);

drop trigger if exists release_epk_fields_set_updated_at on public.release_epk_fields;
create trigger release_epk_fields_set_updated_at
  before update on public.release_epk_fields
  for each row execute function public.set_updated_at();

alter table public.release_epk_fields enable row level security;
