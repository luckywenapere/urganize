-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- WORK REQUESTS (2026-09-06)
--
-- The step the Urganize Directory was missing. A manager finds somebody who
-- has delivered the role their release needs, and until now that was the end
-- of it: a name, a city and some counts, with nothing to do next.
--
-- A sanctioned scope expansion (founder call, asked and answered before this
-- was built). It moves "in-app inbox is v2" off the out-of-scope list for the
-- second time — playlist pitching was the first — and for the same reason:
-- two accounts with no relationship to each other need one row and a place to
-- answer it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- MODELLED ON playlist_pitches, WHICH SOLVED THIS EXACT PROBLEM. Read that
-- migration's header first; everything it says about a cross-tenant read and
-- about denormalising the receiving side's card applies here unchanged.
--
-- ONE WAY THIS IS SIMPLER, and it is worth knowing before reaching for the
-- pitching machinery: THERE IS NO NEW ACCOUNT TYPE. Every person in the
-- directory is already a signed-in team-side user — person_profiles.user_id
-- references auth.users, and a curator-only account cannot opt in, because the
-- profile route runs requireActiveAuthenticatedUser and that refuses one. So
-- none of the containment work pitching needed (blockCuratorAccount, the
-- workspace bails, the widened role check) has an analogue here.
--
-- DECISIONS WORTH KNOWING BEFORE CHANGING ANY OF THIS
--
-- 1. THE RECIPIENT NEVER SEES THE RELEASE. release_id is stored so the request
--    can show on the SENDER's release and is deliberately absent from the
--    recipient's column list in app code — the CURATOR_PITCH_COLUMNS rule
--    verbatim. An unannounced release title must not reach somebody who is
--    about to say no. What the recipient sees is who asked, which role, and
--    the note the sender chose to write.
--
-- 2. sender_name AND sender_team ARE DENORMALISED for the same reason the
--    pitch card's fields are: so the recipient's read path cannot touch
--    workspaces, releases or profiles even by mistake. It is not a performance
--    choice.
--
-- 3. NO INSERT, UPDATE OR DELETE POLICY FOR ANY ROLE. Every write carries an
--    invariant RLS cannot express: the open-request cap per team, the
--    one-open-request-per-person-per-role guard, honest denormalised fields (a
--    client insert policy would let a sender forge sender_name), and the rule
--    that ONLY THE RECIPIENT may move a status. All writes go through
--    service-role routes, so a direct client mutation fails closed.
--
-- 4. TWO SELECT POLICIES, ONE PER SIDE. The schema's third cross-tenant read,
--    after playlist_pitches and person_profiles.
--
-- 5. recipient_user_id IS `on delete cascade`, the curator_user_id call: a
--    request was addressed to a person, so it goes when the person does, and
--    with it the sender's record of having asked. release_id and workspace_id
--    are `on delete set null` — deleting a release must not erase somebody's
--    inbox, and a team going away must not either.
--
-- 6. status IS A CHECK, NOT A POSTGRES ENUM. The vocabulary is product copy,
--    and `alter type ... add value` cannot run inside a transaction. Same
--    reasoning as person_profiles.availability and press_kit_sections.section.
--
-- ROLLBACK (manual):
--   drop table if exists public.work_requests;
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.work_requests (
  id uuid primary key default gen_random_uuid(),

  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,

  -- The sender's team, for the open-request cap and the founder's read. Not
  -- the recipient's business and never selected on their side.
  workspace_id uuid references public.workspaces(id) on delete set null,

  -- Which job. Same vocabulary as person_profiles.roles and delivery_records,
  -- duplicated in all three CHECKs; lib/directory-schema-guard.test.ts fails
  -- the build if the TypeScript list and the SQL drift apart.
  role text not null
    constraint work_requests_role_check
    check (role in (
      'manager', 'a_and_r', 'producer', 'mix_engineer', 'master_engineer',
      'songwriter', 'videographer', 'video_director', 'photographer',
      'graphic_designer', 'pr', 'digital_marketer', 'playlist_curator',
      'booking_agent', 'tour_manager', 'distributor'
    )),

  -- The ask. Capped like a pitch note: long enough to say what the job is,
  -- short enough that nobody writes a brief into it.
  note text not null
    constraint work_requests_note_check
    check (char_length(btrim(note)) between 1 and 300),

  status text not null default 'new'
    constraint work_requests_status_check
    check (status in ('new', 'interested', 'passed')),

  -- Their one line back. Optional on both answers.
  reply text
    constraint work_requests_reply_check
    check (reply is null or char_length(reply) <= 300),

  -- SENDER SIDE ONLY. See decision 1.
  release_id uuid references public.releases(id) on delete set null,

  -- Decision 2.
  sender_name text not null
    constraint work_requests_sender_name_check
    check (char_length(btrim(sender_name)) between 1 and 120),
  sender_team text
    constraint work_requests_sender_team_check
    check (sender_team is null or char_length(sender_team) <= 120),

  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- One OPEN request per sender team per person per role. Partial, so a team can
-- ask again once the last one was answered — a no on a single is not a no
-- forever — while nobody can queue five identical asks.
create unique index if not exists work_requests_open_key
  on public.work_requests(workspace_id, recipient_user_id, role)
  where status = 'new';

-- The recipient's inbox: newest first.
create index if not exists work_requests_recipient_idx
  on public.work_requests(recipient_user_id, created_at desc);

-- The sender's own list, and the per-team open-request cap.
create index if not exists work_requests_sender_idx
  on public.work_requests(workspace_id, status, created_at desc);

alter table public.work_requests enable row level security;

-- Decision 4, side one: the person it was addressed to.
drop policy if exists "Recipients read their work requests" on public.work_requests;
create policy "Recipients read their work requests"
  on public.work_requests for select
  using (auth.uid() = recipient_user_id);

-- Decision 4, side two: the person who sent it. Deliberately the SENDER and
-- not their whole team: a request is a personal approach, and the note is
-- written in one person's voice.
drop policy if exists "Senders read the work requests they sent" on public.work_requests;
create policy "Senders read the work requests they sent"
  on public.work_requests for select
  using (auth.uid() = sender_user_id);
