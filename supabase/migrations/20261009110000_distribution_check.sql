-- Check before distribution (brief 2 of the release savings pack, 2026-10-09).
--
-- Two things:
--
--   1. release_metadata.featured_artists. The check warns when a title carries
--      "feat", "ft." or "featuring" and tells the person to use a Featured
--      artist field instead, so the field has to exist. Free text, nullable:
--      most songs have none, and null means "not asked" exactly as it does for
--      the other optional metadata columns.
--
--   2. distribution_rejections. When the distributor sends a release back, the
--      reason is kept here and shown on the rollout. The partner's API does not
--      exist yet and nothing writes this table today; it is built now so the
--      day it does, the reason (or, if the API gives none, whatever the status
--      payload holds, kept whole in `raw`) has somewhere to land.
--
-- RLS (the standing rule: every new table gets team-scoped policies in the same
-- migration):
--
--   * SELECT: members of the rollout's team may read its rejections, with one
--     refinement the opportunities table did not need. A member limited to one
--     artist (workspace_members.artist_scope_id) reads only the rollouts of
--     that artist, which is the rule decideReleaseAccess applies everywhere
--     else in the app.
--   * NO INSERT, UPDATE OR DELETE POLICY. Every write goes through a service-role
--     route that applies the team and role rules once. A signed-in person must
--     not be able to write, or erase, the distributor's answer.
--
-- Both statements are additive and safe to re-run.
--
-- ROLLBACK (manual):
--   drop table if exists public.distribution_rejections;
--   alter table public.release_metadata drop column if exists featured_artists;

alter table public.release_metadata
  add column if not exists featured_artists text;

create table if not exists public.distribution_rejections (
  id uuid primary key default gen_random_uuid(),

  -- A rejection is history of THIS rollout, so it goes with it.
  release_id uuid not null references public.releases(id) on delete cascade,
  -- The team, denormalized so the policy below needs no join to find it. Set
  -- null (not cascade) if the team row goes first, so the record outlives it.
  workspace_id uuid references public.workspaces(id) on delete set null,

  partner text not null default 'therealmusicdistro'
    constraint distribution_rejections_partner_check check (char_length(btrim(partner)) between 1 and 80),

  -- Both optional: the partner may give a code, a sentence, both or neither.
  reason_code text
    constraint distribution_rejections_code_check check (reason_code is null or char_length(reason_code) <= 120),
  reason_text text
    constraint distribution_rejections_text_check check (reason_text is null or char_length(reason_text) <= 2000),

  -- Whatever the partner actually sent, kept whole. If their API returns no
  -- reasons, this is where the status payload goes.
  raw jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists distribution_rejections_release_idx
  on public.distribution_rejections(release_id, created_at desc);

create index if not exists distribution_rejections_team_idx
  on public.distribution_rejections(workspace_id, created_at desc)
  where workspace_id is not null;

alter table public.distribution_rejections enable row level security;

drop policy if exists "Team members read their distribution rejections" on public.distribution_rejections;
create policy "Team members read their distribution rejections"
  on public.distribution_rejections for select
  using (
    -- The owner of the team.
    exists (
      select 1 from public.workspaces w
      where w.id = distribution_rejections.workspace_id
        and w.owner_id = auth.uid()
    )
    -- Or an active member of it, limited to their artist when they have one.
    or exists (
      select 1 from public.workspace_members m
      where m.workspace_id = distribution_rejections.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and (
          m.artist_scope_id is null
          or m.artist_scope_id = (
            select r.artist_id from public.releases r
            where r.id = distribution_rejections.release_id
          )
        )
    )
  );
