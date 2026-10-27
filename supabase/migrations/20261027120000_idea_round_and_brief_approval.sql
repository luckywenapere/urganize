-- Idea round, then brief, then plan (2026-10-27, founder approved mocks).
--
-- A rollout's ideas are collected in a round. While the round is open each
-- teammate sees only their own idea; the rollout owner and team owners/admins
-- see all of them. Closing the round lets UrgAns write the brief from the
-- ideas, the manager approves it, and only then is the plan built, from the
-- approved brief alone. Additive only: new nullable or defaulted columns and
-- one widened check. Nothing existing is rewritten.
--
-- release_briefs (one row per rollout) carries the round and the approval:
--   ideas_closed_at / ideas_closed_by  the round closed (by a person, or by
--                                      itself once everyone asked added one:
--                                      closed_by stays null then)
--   ideas_asked_ids                    who was asked to add an idea
--   to_settle                          where the ideas disagree, as
--                                      [{id, question, options:[{text, by}]}]
--   approved_at / approved_by          the brief is locked while set
--   approved_version                   how many times it has been approved
--
-- release_brief_decisions.source says where an UrgAns-written decision came
-- from ("Kemi's idea"); null for a decision a person typed.
--
-- release_messages (the idea notes) keeps the voice recording: the path of
-- the clip in the private release-assets bucket and its length.
--
-- release_brief_revisions.block gains 'approved', so the history shows each
-- approval.
--
-- Rollback:
--   alter table public.release_briefs
--     drop column if exists ideas_closed_at, drop column if exists ideas_closed_by,
--     drop column if exists ideas_asked_ids, drop column if exists to_settle,
--     drop column if exists approved_at, drop column if exists approved_by,
--     drop column if exists approved_version;
--   alter table public.release_brief_decisions drop column if exists source;
--   alter table public.release_messages drop column if exists audio_path, drop column if exists audio_seconds;
--   delete from public.release_brief_revisions where block = 'approved';
--   alter table public.release_brief_revisions drop constraint release_brief_revisions_block_check;
--   alter table public.release_brief_revisions add constraint release_brief_revisions_block_check
--     check (block in ('idea', 'references', 'decisions'));

alter table public.release_briefs
  add column if not exists ideas_closed_at  timestamptz null,
  add column if not exists ideas_closed_by  uuid        null references auth.users (id) on delete set null,
  add column if not exists ideas_asked_ids  uuid[]      not null default '{}',
  add column if not exists to_settle        jsonb       not null default '[]'::jsonb,
  add column if not exists approved_at      timestamptz null,
  add column if not exists approved_by      uuid        null references auth.users (id) on delete set null,
  add column if not exists approved_version integer     not null default 0;

alter table public.release_brief_decisions
  add column if not exists source text null check (source is null or char_length(source) <= 80);

alter table public.release_messages
  add column if not exists audio_path    text    null check (audio_path is null or char_length(audio_path) <= 300),
  add column if not exists audio_seconds integer null check (audio_seconds is null or audio_seconds between 0 and 600);

alter table public.release_brief_revisions drop constraint if exists release_brief_revisions_block_check;
alter table public.release_brief_revisions
  add constraint release_brief_revisions_block_check
  check (block in ('idea', 'references', 'decisions', 'approved'));
