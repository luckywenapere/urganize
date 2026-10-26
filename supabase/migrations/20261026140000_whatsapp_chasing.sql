-- WhatsApp chasing (2026-10-26). UrgAns messages task owners on WhatsApp about
-- work that is due or late, and handles their replies (done, need more time,
-- not mine).
--
-- Three tables, all written and read only through the service role:
--   whatsapp_settings   one row per team: switch, when to chase, who answers
--                       replies (Urganize AI or the team's own AI key).
--   whatsapp_contacts   one row per person: their number and whether they said
--                       YES. Nothing is sent to a number until status is
--                       'opted_in'.
--   whatsapp_messages   every message in or out, which is also how a chase is
--                       kept to one per task per kind per day.
--
-- The team's own AI key is stored encrypted (AES-256-GCM, key from the server's
-- WHATSAPP_KEY_SECRET). RLS is on with no policies, so the browser can never read
-- the column; the API routes strip it before answering.

create table if not exists public.whatsapp_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  chase_day_before boolean not null default true,
  chase_due_day boolean not null default true,
  chase_overdue boolean not null default true,
  overdue_every_days integer not null default 2
    constraint whatsapp_settings_overdue_every_days_check check (overdue_every_days between 1 and 14),
  tell_owner_on_delay boolean not null default true,
  ai_mode text not null default 'urganize'
    constraint whatsapp_settings_ai_mode_check check (ai_mode in ('urganize', 'own')),
  ai_provider text
    constraint whatsapp_settings_ai_provider_check check (ai_provider is null or ai_provider in ('openai', 'anthropic', 'openrouter', 'custom')),
  ai_base_url text,
  ai_model text,
  ai_key_encrypted text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- E.164 with a leading +, normalised by lib/whatsapp/phone.ts.
  phone text not null,
  status text not null default 'pending'
    constraint whatsapp_contacts_status_check check (status in ('pending', 'opted_in', 'stopped')),
  opt_in_sent_at timestamptz,
  opted_in_at timestamptz,
  stopped_at timestamptz,
  last_inbound_at timestamptz,
  -- The task the last chase was about, so a plain "done" has something to mean.
  last_task_id uuid references public.tasks(id) on delete set null,
  -- 'date' while UrgAns has asked "what date works?" and is waiting for it.
  awaiting text
    constraint whatsapp_contacts_awaiting_check check (awaiting is null or awaiting = 'date'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_contacts_user_key on public.whatsapp_contacts(user_id);
create unique index if not exists whatsapp_contacts_phone_key on public.whatsapp_contacts(phone);
create index if not exists whatsapp_contacts_workspace_idx on public.whatsapp_contacts(workspace_id);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  direction text not null
    constraint whatsapp_messages_direction_check check (direction in ('in', 'out')),
  -- out: opt_in, day_before, due_day, overdue, reply. in: reply.
  kind text not null,
  body text not null default '',
  provider_message_id text,
  status text not null default 'sent',
  error text,
  -- The Lagos day a chase went out. Set only on chases, so the unique index
  -- below makes "one chase per task, kind and day" a database fact.
  chase_day date,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_chase_once
  on public.whatsapp_messages(task_id, kind, chase_day)
  where chase_day is not null;
create unique index if not exists whatsapp_messages_provider_id_key
  on public.whatsapp_messages(provider_message_id)
  where provider_message_id is not null;
create index if not exists whatsapp_messages_user_day_idx
  on public.whatsapp_messages(user_id, chase_day);

drop trigger if exists set_whatsapp_settings_updated_at on public.whatsapp_settings;
create trigger set_whatsapp_settings_updated_at
before update on public.whatsapp_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_whatsapp_contacts_updated_at on public.whatsapp_contacts;
create trigger set_whatsapp_contacts_updated_at
before update on public.whatsapp_contacts
for each row execute function public.set_updated_at();

alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_messages enable row level security;

grant select, insert, update, delete on public.whatsapp_settings to service_role;
grant select, insert, update, delete on public.whatsapp_contacts to service_role;
grant select, insert, update, delete on public.whatsapp_messages to service_role;

-- Default privileges had handed these tables to anon and authenticated. RLS
-- already hides every row, but the browser has no business near them at all.
revoke all on public.whatsapp_settings from anon, authenticated;
revoke all on public.whatsapp_contacts from anon, authenticated;
revoke all on public.whatsapp_messages from anon, authenticated;
