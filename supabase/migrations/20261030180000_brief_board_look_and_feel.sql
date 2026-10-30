-- The brief as a board, phase 1 (#897, 2026-10-30, mock approved).
--
-- The board adds a look-and-feel layer to the brief people write:
--   headline   the idea in one short line, shown big on the board
--   feels_like up to 6 words for how the rollout should feel
--   not_this   up to 6 words for what to avoid
--   palette    up to 6 hex colours (#RRGGBB)
-- All four sit on release_briefs, which already holds the idea. Everything
-- else on the board (countdown, key moments, who's on what) is still derived
-- from tasks on every read.
--
-- release_brief_revisions.block gains 'feel', so the history shows edits to
-- any of the four.
--
-- Rollback:
--   delete from public.release_brief_revisions where block = 'feel';
--   alter table public.release_brief_revisions drop constraint release_brief_revisions_block_check;
--   alter table public.release_brief_revisions add constraint release_brief_revisions_block_check
--     check (block in ('idea', 'references', 'decisions', 'approved'));
--   alter table public.release_briefs drop column headline, drop column feels_like,
--     drop column not_this, drop column palette;

alter table public.release_briefs
  add column if not exists headline   text   not null default '' check (char_length(headline) <= 120),
  add column if not exists feels_like text[] not null default '{}' check (cardinality(feels_like) <= 6),
  add column if not exists not_this   text[] not null default '{}' check (cardinality(not_this) <= 6),
  add column if not exists palette    text[] not null default '{}' check (cardinality(palette) <= 6);

alter table public.release_brief_revisions drop constraint if exists release_brief_revisions_block_check;
alter table public.release_brief_revisions
  add constraint release_brief_revisions_block_check
  check (block in ('idea', 'references', 'decisions', 'approved', 'feel'));
