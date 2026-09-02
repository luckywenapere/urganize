-- releases.artist_id: into version control at last, and ON DELETE RESTRICT.
--
-- WHY THIS FILE EXISTS. `releases.artist_id` is not declared in ANY migration
-- in this directory — the only prior mention is a plpgsql local variable in
-- 20260602010000, which alters the column to NOT NULL without ever having
-- created it. The column and its foreign key predate the 2026-05-25 schema
-- reconciliation and were missed by it. So this is the first time either is
-- written down, and anything that recreates the column from migrations alone
-- would have silently dropped the constraint.
--
-- WHAT PRODUCTION ACTUALLY HAS (read 2026-08-30):
--   select conname, confdeltype from pg_constraint
--    where conrelid = 'public.releases'::regclass
--      and confrelid = 'public.artists'::regclass;
--   -> releases_artist_id_fkey | n
--
-- `n` is ON DELETE SET NULL — while the column is NOT NULL. Those two
-- contradict each other, and the contradiction is load-bearing today: deleting
-- an artist who has releases fires the set-null, the resulting UPDATE violates
-- the not-null constraint, and the whole DELETE aborts. The safe outcome holds,
-- but BY ACCIDENT, and it surfaces as a raw not-null violation rather than
-- anything a person can act on.
--
-- THE LANDMINE THIS CLOSES. The foreign key declares set-null as the intent and
-- only the column's NOT NULL is standing in its way. Relax that — or recreate
-- the column without it, which the drift above made easy — and every refusal
-- silently becomes a real set-null on live releases. A null artist_id matches
-- no artist scope, so artist-scoped teammates would lose those releases with no
-- error anywhere, and nothing on screen would look wrong, because the artist
-- NAME is cached separately on the release row.
--
-- RESTRICT makes the declared intent match the column: an artist with releases
-- cannot be deleted, on purpose rather than as a side effect, and the error
-- names the real reason. The app refuses before it ever gets here (see
-- DELETE /api/workspace/artists/[artistId]) — this is the backstop for every
-- other path: SQL run by hand, a future route, the Supabase dashboard.
--
-- NOT DESTRUCTIVE, and nothing is backfilled: this only changes what happens on
-- a delete that currently cannot succeed anyway.
--
-- Down migration (restores the drifted state exactly, contradiction included):
--   alter table public.releases drop constraint releases_artist_id_fkey;
--   alter table public.releases add constraint releases_artist_id_fkey
--     foreign key (artist_id) references public.artists(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 1. Re-declare the foreign key with ON DELETE RESTRICT.
-- ---------------------------------------------------------------------------
-- Drop-then-add: ALTER CONSTRAINT cannot change a referential action, and ADD
-- CONSTRAINT has no IF NOT EXISTS (the 20260605 / 20260821 / 20260823 / 20260824
-- precedent in this directory).
--
-- `if exists` on the drop so this is safe on an environment built purely from
-- migrations, where the constraint was never created in the first place —
-- which is exactly the drift described above.

alter table public.releases
  drop constraint if exists releases_artist_id_fkey;

alter table public.releases
  add constraint releases_artist_id_fkey
  foreign key (artist_id) references public.artists(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. Verify.
-- ---------------------------------------------------------------------------
-- Fails loudly rather than leaving the intent mismatched again. 'r' = restrict.

do $$
declare
  action char;
begin
  select confdeltype into action
    from pg_constraint
   where conname = 'releases_artist_id_fkey'
     and conrelid = 'public.releases'::regclass;

  if action is null then
    raise exception 'releases_artist_id_fkey is missing after this migration.';
  end if;

  if action <> 'r' then
    raise exception
      'releases_artist_id_fkey has delete action %, expected r (restrict).', action;
  end if;

  raise notice 'releases_artist_id_fkey is ON DELETE RESTRICT.';
end $$;
