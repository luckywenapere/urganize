-- EPK generator (URG-196): auto-assembled electronic press kit per release,
-- shared via an unguessable public link.
--
-- One row per release (unique release_id). The row is the share grant: its
-- existence + share_token make /epk/<token> resolve. Revoking the link
-- deletes the row; regenerating is delete + create (new token, old link dies).
-- No EPK content is stored — the public page assembles the kit at request
-- time from live release data (release row, release_metadata, cover art /
-- promo assets), so the kit stays in sync with the release by construction.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.release_epks;

create table if not exists public.release_epks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  share_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One EPK per release.
create unique index if not exists release_epks_release_id_key
  on public.release_epks(release_id);

-- The public page's lookup path.
create unique index if not exists release_epks_share_token_key
  on public.release_epks(share_token);

drop trigger if exists set_release_epks_updated_at on public.release_epks;
create trigger set_release_epks_updated_at
before update on public.release_epks
for each row execute function public.set_updated_at();

alter table public.release_epks enable row level security;

-- Owner-scoped RLS, matching every other release child resource. The public
-- read path never goes through PostgREST as anon — the /epk/<token> page
-- resolves tokens server-side with the service-role client.

drop policy if exists "Owners view their release epks" on public.release_epks;
create policy "Owners view their release epks"
  on public.release_epks
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create release epks" on public.release_epks;
create policy "Owners create release epks"
  on public.release_epks
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their release epks" on public.release_epks;
create policy "Owners update their release epks"
  on public.release_epks
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their release epks" on public.release_epks;
create policy "Owners delete their release epks"
  on public.release_epks
  for delete
  using (owner_user_id = auth.uid());
