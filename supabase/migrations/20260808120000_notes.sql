-- Notes (global quick capture): private, owner-scoped notes a manager parks
-- mid-call or mid-DM, with an OPTIONAL link to a release.
--
-- The seventh sanctioned v1 scope expansion (see CLAUDE.md). Unlike every
-- other surface here, a note does not require a release — capture first,
-- organize later. release_id is the tie-back to the release spine: a linked
-- note surfaces when the notes page is filtered by that release.
--
-- Design calls worth recording:
--   * release_id is `on delete set null`, not cascade — deleting a release
--     must not destroy the manager's thinking about it. The note survives as
--     a global one (the content_posts.asset_id precedent).
--   * No title column. The first non-empty line of `body` IS the title
--     (the Apple Notes model) — see deriveNoteTitle in apps/web/lib/notes.ts.
--     One source of truth, so a title can never drift from its own body.
--   * `body` defaults to '' so a note can be created before anything is
--     typed: the editor opens on a real row and autosaves into it, rather
--     than the client holding a phantom note the server has never seen.
--   * `pinned` rows sort first. Note that a pin toggle bumps updated_at via
--     the table-wide trigger below, so unpinning resurfaces a note at the top
--     of the unpinned block. Accepted: pinning is an explicit act of
--     attention, and "recently touched" is the honest ordering for it.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.notes;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid references public.releases(id) on delete set null,
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The notes page's only read path: every note for one owner (ordering and
-- release filtering both happen on top of this set).
create index if not exists notes_owner_user_id_idx on public.notes(owner_user_id);

-- The set-null pass Postgres runs when a release is deleted.
create index if not exists notes_release_id_idx on public.notes(release_id);

drop trigger if exists set_notes_updated_at on public.notes;
create trigger set_notes_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

-- Owner-scoped RLS, matching every other owned table. Notes are private to
-- the person who wrote them — there is no teammate read path and no public
-- share link, so these four policies are the whole access model.

drop policy if exists "Owners view their notes" on public.notes;
create policy "Owners view their notes"
  on public.notes
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create notes" on public.notes;
create policy "Owners create notes"
  on public.notes
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their notes" on public.notes;
create policy "Owners update their notes"
  on public.notes
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their notes" on public.notes;
create policy "Owners delete their notes"
  on public.notes
  for delete
  using (owner_user_id = auth.uid());
