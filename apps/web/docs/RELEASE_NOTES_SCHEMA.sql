create table if not exists public.release_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid null references public.releases(id) on delete set null,
  title text not null default '',
  content text not null default '',
  note_type text null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_notes_user_updated_idx
  on public.release_notes(user_id, is_pinned desc, updated_at desc);

create index if not exists release_notes_release_idx
  on public.release_notes(release_id, is_pinned desc, updated_at desc);

alter table public.release_notes enable row level security;
