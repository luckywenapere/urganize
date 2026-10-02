-- Release pitch kit: freeze the artist kit once the release is delivered
-- (2026-10-02, Phase 1 of the build order).
--
-- The artist keeps ONE standing press kit and a release reads it live, so a bio
-- edit reaches every release that has not happened yet. A delivered release is
-- a record of what was sent, so the first time it counts as delivered (the same
-- rule as lib/recap-eligibility.ts) a daily sweep copies the three things its
-- pitch shows from the kit onto this row, and the release reads the copy from
-- then on.
--
-- Additive and reversible. Nothing is rewritten and nothing is deleted:
--   alter table public.release_epk_fields drop column kit_snapshot, drop column kit_snapshot_at;
-- undoes it, and the release goes back to reading the live kit.
--
-- kit_snapshot is null until a release is delivered AND its artist has a kit.
-- A null means "read the live kit", never an error. RLS is unchanged: this
-- table has none and is reached only through the service-role client.

alter table public.release_epk_fields
  add column if not exists kit_snapshot jsonb
    constraint release_epk_fields_kit_snapshot_is_object
      check (kit_snapshot is null or jsonb_typeof(kit_snapshot) = 'object'),
  add column if not exists kit_snapshot_at timestamptz;

comment on column public.release_epk_fields.kit_snapshot is
  'The artist press kit as it was when this release was delivered: id, artistId, slug, state, publishedAt, descriptor, shortBio, contactCount. Null means read the live kit.';
