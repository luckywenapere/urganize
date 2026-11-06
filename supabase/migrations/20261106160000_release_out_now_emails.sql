-- Release day, on its own (Nov 2026, #1090): one row per rollout whose team was
-- emailed "it's out now". Inserting the row is the claim, so two triggers at
-- once (the daily check and someone opening Home) never send twice.
create table if not exists public.release_out_now_emails (
  release_id uuid primary key references public.releases(id) on delete cascade,
  smart_link_url text,
  recipients integer not null default 0,
  sent_at timestamptz not null default now()
);

alter table public.release_out_now_emails enable row level security;
-- No policies: only the server (service role) reads or writes it.

grant select, insert, update, delete on public.release_out_now_emails to authenticated, service_role;
