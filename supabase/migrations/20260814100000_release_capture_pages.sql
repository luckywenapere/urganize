-- Fan email capture (2026-08-14).
--
-- Sanctioned v1 scope expansion — see CLAUDE.md "Scope expansion
-- (2026-08-14)". Per release, the owner builds one public capture page: a
-- graphic, a headline, an incentive line, and a destination link. A fan gives
-- an email and the link is revealed on the same screen. Storage and display
-- only: no sending, no ESP integration, no DSP call — the destination is a
-- plain URL the manager types, which is what keeps this on the near side of
-- the "pre-save campaigns" and "third-party integrations" scope lines.
--
-- TWO TABLES, AND THE SPLIT MATTERS:
--
-- release_capture_pages is BOTH the share grant (share_token, the same trust
-- model as release_epks / release_credit_links) AND the authored content. It
-- deviates from release_epks on purpose: an EPK stores nothing because it is
-- assembled from live release data, but a capture page's headline, incentive
-- and destination link are written by the manager and exist nowhere else, so
-- they have to live somewhere. Revoking rotates the token in place (the
-- credit-link precedent) rather than deleting the row, so the authored copy
-- and every lead already collected survive a link rotation.
--
-- release_capture_leads is the collected emails. Deliberately NOT a general
-- contacts table: a lead belongs to one release's page, is never merged
-- across releases, and nothing in the product derives anything from it. That
-- keeps it clear of the "listener profile generation" scope line.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.release_capture_leads;
--   drop table if exists public.release_capture_pages;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. release_capture_pages — one authored capture page per release
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_capture_pages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  share_token text not null,

  -- Authored content. Every field is nullable or defaulted so a page can be
  -- created in one click and filled in afterwards — the playbook checklist in
  -- lib/capture-playbook is what tells the manager it is not ready yet, not a
  -- NOT NULL constraint that blocks them from starting.
  headline text,
  incentive text,
  destination_url text,
  destination_label text,
  button_label text,

  -- The graphic. Either an asset on this release (assets.id) or, when null,
  -- the page falls back to the release's cover art — which is resolved live at
  -- request time, so replacing the artwork updates the capture page for free.
  -- ON DELETE SET NULL (the content_posts.asset_id precedent): deleting the
  -- asset must degrade the page to its cover art, never delete the page.
  graphic_asset_id uuid references public.assets(id) on delete set null,

  -- Whether the page collects a name alongside the email. Defaults FALSE and
  -- that default is the product opinion, not an accident: every extra field is
  -- a reason to abandon, and the playbook's first rule is one ask only.
  collect_name boolean not null default false,

  -- The manager's own consent/permission line, shown under the form. Nullable;
  -- the public page falls back to house copy so a page can never ship with no
  -- consent line at all.
  consent_note text,

  -- Soft off-switch, distinct from revoking. A paused page keeps its token and
  -- its leads but stops accepting submissions and says so.
  is_paused boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One capture page per release.
create unique index if not exists release_capture_pages_release_id_key
  on public.release_capture_pages(release_id);

-- The public page's lookup path.
create unique index if not exists release_capture_pages_share_token_key
  on public.release_capture_pages(share_token);

drop trigger if exists set_release_capture_pages_updated_at on public.release_capture_pages;
create trigger set_release_capture_pages_updated_at
before update on public.release_capture_pages
for each row execute function public.set_updated_at();

alter table public.release_capture_pages enable row level security;

-- Owner-scoped RLS, matching release_epks and release_credit_links. The public
-- read path never goes through PostgREST as anon — /capture/<token> resolves
-- tokens server-side with the service-role client.

drop policy if exists "Owners view their capture pages" on public.release_capture_pages;
create policy "Owners view their capture pages"
  on public.release_capture_pages
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners create capture pages" on public.release_capture_pages;
create policy "Owners create capture pages"
  on public.release_capture_pages
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners update their capture pages" on public.release_capture_pages;
create policy "Owners update their capture pages"
  on public.release_capture_pages
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners delete their capture pages" on public.release_capture_pages;
create policy "Owners delete their capture pages"
  on public.release_capture_pages
  for delete
  using (owner_user_id = auth.uid());

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. release_capture_leads — one row per fan submission
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.release_capture_leads (
  id uuid primary key default gen_random_uuid(),
  capture_page_id uuid not null references public.release_capture_pages(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  -- Denormalized (the release_credit_submissions call) so the owner-scoped
  -- policies below need no join back through releases.
  owner_user_id uuid not null references auth.users(id) on delete cascade,

  -- Stored lowercased and trimmed by the route, which is what makes the
  -- unique index below a real de-duplicator rather than a case-sensitive one.
  email text not null,
  name text,

  -- The fan ticked the consent box. Not a legal e-signature — the same
  -- lightweight acknowledgment release_credit_submissions.confirmed_accurate
  -- captures.
  consented boolean not null default false,

  created_at timestamptz not null default now()
);

-- A fan who submits twice (double tap, or comes back for the link later) is
-- one lead, not two. The public route relies on this: it upserts on conflict
-- and still reveals the link, so a repeat visitor never sees an error.
create unique index if not exists release_capture_leads_page_email_key
  on public.release_capture_leads(capture_page_id, email);

create index if not exists release_capture_leads_release_idx
  on public.release_capture_leads(release_id, created_at desc);

alter table public.release_capture_leads enable row level security;

-- Owner can view and delete leads on their own releases. No update policy
-- (nothing in-product ever edits a lead) and deliberately no anon insert
-- policy: the public form's POST always goes through the service-role client
-- in app/api/capture/[token]/route.ts, which bypasses RLS entirely and
-- validates the payload server-side before insert.

drop policy if exists "Owners view their capture leads" on public.release_capture_leads;
create policy "Owners view their capture leads"
  on public.release_capture_leads
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "Owners delete their capture leads" on public.release_capture_leads;
create policy "Owners delete their capture leads"
  on public.release_capture_leads
  for delete
  using (owner_user_id = auth.uid());
