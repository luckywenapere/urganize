-- Brief board, phase 1b (#897, 2026-10-30): where each card sits.
--
-- A board with no rows here uses the default layout built in code. The first
-- time a team owner or admin moves a card, the whole layout is written in one
-- upsert, so a push-down never leaves half the cards moved.
--
-- card_key is the card's name for the fixed cards (cover, idea, ...). Notes
-- (phase 2) can appear more than once and will use 'note:<id>'. One unique key
-- over (release_id, card_key) is what the upsert conflicts on.
--
-- Like the other brief tables: RLS on with no policies, so only the server
-- (service role) reads and writes it, after its own access checks.

create table if not exists public.release_brief_cards (
  id         uuid        primary key default gen_random_uuid(),
  release_id uuid        not null references public.releases (id) on delete cascade,
  card_key   text        not null check (char_length(card_key) between 1 and 80),
  kind       text        not null check (kind in (
    'cover', 'idea', 'countdown', 'feels', 'palette', 'look', 'sound',
    'decisions', 'settle', 'moments', 'pieces', 'people', 'side', 'note'
  )),
  x          smallint    not null check (x between 1 and 12),
  y          smallint    not null check (y between 1 and 200),
  w          smallint    not null check (w between 1 and 12),
  h          smallint    not null check (h between 1 and 6),
  payload    jsonb       not null default '{}'::jsonb,
  created_by uuid        null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint release_brief_cards_fits check (x + w <= 13),
  constraint release_brief_cards_key unique (release_id, card_key)
);

drop trigger if exists release_brief_cards_set_updated_at on public.release_brief_cards;
create trigger release_brief_cards_set_updated_at
  before update on public.release_brief_cards
  for each row execute function public.set_updated_at();

alter table public.release_brief_cards enable row level security;

grant select, insert, update, delete on public.release_brief_cards to authenticated, service_role;
