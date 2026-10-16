-- Lyrics on the Metadata step (URG-322, 2026-10-16).
--
-- The handoff to the distributor counts a rollout's metadata as ready only once
-- the lyrics are in, and nothing in the schema held them. One nullable text
-- column, additive: no backfill, nothing read changes for an existing row.
-- Approved by the founder with the handoff checklist.

alter table public.release_metadata
  add column if not exists lyrics text;
