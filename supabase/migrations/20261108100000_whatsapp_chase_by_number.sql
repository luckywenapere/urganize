-- Chase by number (2026-11-08, #1119): a manager gives a task to someone with
-- just a name and a WhatsApp number, and that person never signs up.
--
-- The person is a My People profile (person_profiles, unclaimed and private),
-- the task points at them through tasks.assigned_person_id (which already
-- exists), and their number lives in whatsapp_contacts with person_id set
-- instead of user_id. Exactly one of the two is set on every contact.
--
-- ROLLBACK (only once no person contact exists):
--   delete from public.whatsapp_contacts where user_id is null;
--   drop index if exists public.whatsapp_contacts_person_key;
--   alter table public.whatsapp_contacts drop constraint if exists whatsapp_contacts_one_owner_check;
--   alter table public.whatsapp_contacts drop column if exists person_id, drop column if exists name;
--   alter table public.whatsapp_contacts alter column user_id set not null;
--   drop index if exists public.whatsapp_messages_person_day_idx;
--   alter table public.whatsapp_messages drop column if exists person_id;

alter table public.whatsapp_contacts
  alter column user_id drop not null;

alter table public.whatsapp_contacts
  add column if not exists person_id uuid references public.person_profiles(id) on delete cascade,
  add column if not exists name text
    constraint whatsapp_contacts_name_check check (name is null or char_length(name) <= 80);

alter table public.whatsapp_contacts
  drop constraint if exists whatsapp_contacts_one_owner_check;
alter table public.whatsapp_contacts
  add constraint whatsapp_contacts_one_owner_check
  check ((user_id is null) <> (person_id is null));

create unique index if not exists whatsapp_contacts_person_key
  on public.whatsapp_contacts(person_id)
  where person_id is not null;

alter table public.whatsapp_messages
  add column if not exists person_id uuid references public.person_profiles(id) on delete set null;

create index if not exists whatsapp_messages_person_day_idx
  on public.whatsapp_messages(person_id, chase_day);

-- Tables already exist with RLS on and no policies; grants unchanged.
