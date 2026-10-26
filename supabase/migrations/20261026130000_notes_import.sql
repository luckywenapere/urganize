-- Bring your notes (2026-10-26). Notes that arrived through an import carry
-- where they came from and which batch they belong to, so one tap can undo a
-- whole import. Both columns are nullable: every existing note is untouched.
--
-- The raw chat or file is never stored. Only the notes a person chose to keep
-- are inserted, with created_at and updated_at set to when they were written,
-- so an old WhatsApp message sorts by its real date instead of burying today's
-- notes. (set_updated_at only fires on UPDATE, so an explicit value on INSERT
-- survives.)

alter table public.notes
  add column if not exists source text,
  add column if not exists import_id uuid;

create index if not exists notes_owner_import_idx
  on public.notes (owner_user_id, import_id)
  where import_id is not null;
