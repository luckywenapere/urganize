-- Release recap card: a shareable Wrapped-style poster per release, rendered
-- server-side as PNG (story + square) and stored in the release-assets bucket.
--
-- One row per release (unique release_id). The row holds the two optional
-- user-entered inputs (first-week streams, one highlight) plus pointers to the
-- rendered images, so a recap can be re-opened later without re-rendering.
-- Regenerating UPDATES this row in place and swaps both storage paths; the
-- stats on the card itself are recomputed from live release/task data at
-- render time and never stored, so a recap never disagrees with the release.
--
-- Storage objects live under <release_id>/recap/ in the private release-assets
-- bucket, reached only through the service-role client (the v1 design: storage
-- RLS is not declared in migrations, all reads are short-lived signed URLs).
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.release_recaps;

create table if not exists public.release_recaps (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  -- Both inputs are optional by design: the form is skippable and the card
  -- simply omits any stat it has no value for.
  first_week_streams bigint,
  highlight text,
  story_image_path text,
  square_image_path text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_recaps_first_week_streams_non_negative
    check (first_week_streams is null or first_week_streams >= 0),
  constraint release_recaps_highlight_length
    check (highlight is null or char_length(highlight) <= 140)
);

-- One recap per release.
create unique index if not exists release_recaps_release_id_key
  on public.release_recaps(release_id);

drop trigger if exists set_release_recaps_updated_at on public.release_recaps;
create trigger set_release_recaps_updated_at
before update on public.release_recaps
for each row execute function public.set_updated_at();

alter table public.release_recaps enable row level security;

-- Owner-scoped RLS, matching every other release child resource. The rendered
-- PNG is shared as a file by the user; there is no public read path through
-- PostgREST for this table.

drop policy if exists "Owners view their release recaps" on public.release_recaps;
create policy "Owners view their release recaps"
  on public.release_recaps
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create release recaps" on public.release_recaps;
create policy "Owners create release recaps"
  on public.release_recaps
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their release recaps" on public.release_recaps;
create policy "Owners update their release recaps"
  on public.release_recaps
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their release recaps" on public.release_recaps;
create policy "Owners delete their release recaps"
  on public.release_recaps
  for delete
  using (owner_user_id = auth.uid());
