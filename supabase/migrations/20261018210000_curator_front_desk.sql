-- UrgAns front desk for curators (URG-381, Oyin approved Oct 18, 2026 21:35 WAT:
-- additive, non-destructive, RLS on).
--
-- ADDITIVE ONLY. Three new tables; nothing existing is altered, dropped or
-- rewritten. No backfill.
--
-- POSTURE: RLS on, ZERO policies on all three (the curator_invites posture). Every
-- read and write goes through service-role routes under app/api/front-desk/,
-- which check who is asking and scope every query to ONE pitch (artist side,
-- via the same team gate the pitch list uses) or ONE curator (curator side). A
-- direct anon or authenticated client query fails closed, so an artist can never
-- read another pitch's questions or a curator's other inboxes through PostgREST.
--
-- ROLLBACK (manual, if ever needed; drops only what this file created):
--   drop table if exists public.pitch_desk_answers;
--   drop table if exists public.pitch_desk_questions;
--   drop table if exists public.curator_desk_terms;

-- 1. What a curator teaches UrgAns once (screen 12).
create table if not exists public.curator_desk_terms (
  curator_user_id uuid primary key references auth.users(id) on delete cascade,
  -- Decision 6: the front desk is on by default for curators.
  enabled boolean not null default true,
  -- { services[], timing{}, send[], genres[], rules[] }, validated in
  -- lib/front-desk/terms.ts (parseDeskTerms) before every write.
  terms jsonb not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object' and pg_column_size(terms) <= 32768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_curator_desk_terms_updated_at on public.curator_desk_terms;
create trigger set_curator_desk_terms_updated_at
before update on public.curator_desk_terms
for each row execute function public.set_updated_at();

alter table public.curator_desk_terms enable row level security;

-- 2. The ONE open question per pitch that UrgAns could not answer (screen 15),
-- and the curator's answer to it (screen 16).
create table if not exists public.pitch_desk_questions (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.playlist_pitches(id) on delete cascade,
  curator_user_id uuid not null references auth.users(id) on delete cascade,
  asked_by uuid references auth.users(id) on delete set null,
  -- [{ text, norm, at }], numbered for the curator; repeats are merged in code.
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 8),
  status text not null default 'open' check (status = any (array['open'::text, 'answered'::text])),
  curator_answer text check (curator_answer is null or char_length(curator_answer) <= 600),
  proposed_rule text check (proposed_rule is null or char_length(proposed_rule) <= 160),
  -- Decision 4: a reply becomes a term only after one tap ('added'); 'once' keeps it in this pitch.
  rule_decision text check (rule_decision is null or rule_decision = any (array['added'::text, 'once'::text])),
  -- Decision 3: escalations reach the curator as one daily digest. The digest
  -- includes a question whose last item is newer than this stamp, then stamps it.
  digest_sent_at timestamptz,
  last_item_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One open question per pitch, enforced by the database, not only the route.
create unique index if not exists pitch_desk_questions_one_open_idx
  on public.pitch_desk_questions(pitch_id) where status = 'open';
create index if not exists pitch_desk_questions_curator_idx
  on public.pitch_desk_questions(curator_user_id, status, last_item_at desc);

drop trigger if exists set_pitch_desk_questions_updated_at on public.pitch_desk_questions;
create trigger set_pitch_desk_questions_updated_at
before update on public.pitch_desk_questions
for each row execute function public.set_updated_at();

alter table public.pitch_desk_questions enable row level security;

-- 3. What UrgAns answered on its own (the curator's quiet "answered N" row and
-- the deflection metric). The answer text is the engine's fact-built sentence.
create table if not exists public.pitch_desk_answers (
  id uuid primary key default gen_random_uuid(),
  pitch_id uuid not null references public.playlist_pitches(id) on delete cascade,
  curator_user_id uuid not null references auth.users(id) on delete cascade,
  asked_by uuid references auth.users(id) on delete set null,
  intent text not null check (char_length(intent) <= 40),
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 600),
  source_kind text not null check (source_kind = any (array['terms'::text, 'agreed'::text, 'thread'::text, 'status'::text, 'page'::text])),
  source_label text not null check (char_length(source_label) <= 80),
  created_at timestamptz not null default now()
);

create index if not exists pitch_desk_answers_pitch_idx
  on public.pitch_desk_answers(pitch_id, created_at desc);
create index if not exists pitch_desk_answers_curator_idx
  on public.pitch_desk_answers(curator_user_id, created_at desc);

alter table public.pitch_desk_answers enable row level security;

-- No policies on any of the three, on purpose. See the header.
