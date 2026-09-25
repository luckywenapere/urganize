-- Playlist curators: a public page they can share.
--
-- A real curator posted https://app.urganize.app/curator/profile to her
-- WhatsApp status telling artists to pitch her, then asked whether that link
-- opened her profile or the Urganize landing page. It does neither: that route
-- is her own private settings editor, and CuratorShell redirects everyone else
-- to the sign-in screen. It shows nothing about her playlist to anybody.
--
-- She was not confused. The curator side has no share surface at all — three
-- tabs, no copy button, no token, no slug — while every share link in this
-- product belongs to the team side (/k/, /credits/, /capture/, /pack/, /p/).
-- The only link that ever pointed at her is the SINGLE-USE invite that let her
-- in, which she cannot hand on. Discovery runs one way: managers already inside
-- Urganize browse the global playlist list and pitch from there, so a curator
-- has no way to convert the artists already in her DMs.
--
-- This adds the two columns behind /pitch/{slug}, a public read-only page.
--
-- Design calls worth recording:
--   * TWO COLUMNS, NOT ONE. `slug` is the URL and `published_at` is the gate.
--     Collapsing them — null the slug to unpublish — would burn a link she has
--     already posted to a WhatsApp status, which is the one thing this feature
--     exists to give her. Unpublishing clears published_at and LEAVES the slug,
--     so republishing restores the same URL. The press_kits split, for the same
--     reason (see api/press-kits/[kitId]/publish/route.ts).
--   * NULLABLE, AND MINTED AT FIRST PUBLISH rather than at profile creation.
--     Curator rows are created by the service-role join route for everyone who
--     accepts an invite; minting a slug there would let every curator who never
--     publishes squat a name. Nullable then forces the partial unique index
--     below, since many nulls must not collide — the person_profiles idiom.
--   * THE SHAPE CHECK MIRRORS press_kits_slug_shape_check VERBATIM. Three
--     tables now serve a slug at a public path and a person should not be able
--     to spell a handle one way here and another way there.
--   * NO BACKFILL. Every existing curator is unpublished, and null says so.
--   * NO RLS CHANGE, and this is the part to understand before editing the read
--     path. curator_profiles has owner-only select policies and no insert
--     policy at all, so a public page CANNOT be served through RLS — it goes
--     through a service-role client, and the payload builder is therefore the
--     entire privacy boundary. See lib/curator-public.ts, which reconstructs
--     the payload field by field for exactly that reason, and its test.
--
-- ROLLBACK (manual, if ever needed):
--   drop index if exists public.curator_profiles_slug_key;
--   alter table public.curator_profiles drop column if exists published_at;
--   alter table public.curator_profiles drop column if exists slug;

alter table public.curator_profiles
  add column if not exists slug text,
  add column if not exists published_at timestamptz;

-- Added separately from the column so a re-run on a database that already has
-- the column still installs the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'curator_profiles_slug_shape_check'
  ) then
    alter table public.curator_profiles
      add constraint curator_profiles_slug_shape_check
      check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60));
  end if;
end
$$;

-- The public page's only lookup path. Partial, because a curator who has never
-- published holds null and many nulls must not collide.
create unique index if not exists curator_profiles_slug_key
  on public.curator_profiles(slug)
  where slug is not null;
