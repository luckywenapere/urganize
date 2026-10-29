-- LOCAL ONLY (issue #862). Test data for the local database. Never run this
-- against production. Safe to re-run: it deletes its own rows first.
--
-- Password for every seeded account (local only, not used anywhere else):
--   Local-rz4BgKBeRTFyxF
--
-- What it makes:
--   owner@test.localhost    approved owner of "Test Owner's Team" (14-day team
--                           trial), with the artist "Test Artist" and the
--                           rollout "First Light" (single, 30 days out, 4 tasks)
--   invited@test.localhost  NO account: a pending invite (role admin = Manager)
--                           to the owner's team. Sign up with this address to
--                           test the Join card. Invite link:
--                           /invite/accept?token=00000000-0000-4000-a000-0000000000a1
--   access_invites rows     open founder invites bound to tester1..tester20@test.localhost,
--                           so new sign-ups with those addresses pass the
--                           closed sign-up gate; and a /start link with code
--                           LocalTestStart2026 for any other address.
--   waiting@test.localhost  an access invite too, for "I'm joining someone's team".
--
-- Any other address (for example someone@example.test) is NOT let in, so the
-- invite-only screen can be tested as well.

begin;

-- ── Clean previous seed rows ────────────────────────────────────────────────
delete from public.access_invites where email like '%@test.localhost' or label = 'local seed';
delete from public.workspace_members where email ilike '%@test.localhost';
-- Every account on @test.localhost goes, including ones made by hand while
-- testing. Rollouts first (artists are ON DELETE RESTRICT from releases), then
-- profiles (no cascade from auth.users), then the auth users (the rest cascades).
create temp table seed_users on commit drop as
  select id from auth.users where email ilike '%@test.localhost';
delete from public.releases where owner_user_id in (select id from seed_users);
delete from public.profiles where id in (select id from seed_users);
delete from auth.users where id in (select id from seed_users);

-- ── Owner account ───────────────────────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-a000-000000000001',
  'authenticated', 'authenticated',
  'owner@test.localhost',
  extensions.crypt('Local-rz4BgKBeRTFyxF', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Tobi Owner","full_name":"Tobi Owner"}'::jsonb,
  now() - interval '10 days', now(), now() - interval '1 day',
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
values (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000001',
  jsonb_build_object('sub', '00000000-0000-4000-a000-000000000001', 'email', 'owner@test.localhost',
                     'email_verified', true, 'phone_verified', false),
  'email', now(), now(), now()
);

insert into public.profiles (
  id, name, email, role, onboarding_completed, onboarding_step, onboarding_persona,
  onboarding_completed_at, access_approved_at, access_source
) values (
  '00000000-0000-4000-a000-000000000001', 'Tobi Owner', 'owner@test.localhost', 'manager',
  true, 3, 'music_manager', now() - interval '10 days', now() - interval '10 days', 'admin'
);

-- ── The owner's team, on a 14-day trial ─────────────────────────────────────
insert into public.workspaces (id, owner_id, name, trial_started_at, trial_ends_at, created_at)
values (
  '00000000-0000-4000-a000-000000000010',
  '00000000-0000-4000-a000-000000000001',
  'Test Owner''s Team',
  now() - interval '1 day', now() + interval '13 days', now() - interval '10 days'
);

insert into public.workspace_members (workspace_id, user_id, email, role, status, invited_at, joined_at)
values (
  '00000000-0000-4000-a000-000000000010',
  '00000000-0000-4000-a000-000000000001',
  'owner@test.localhost', 'owner', 'active', now() - interval '10 days', now() - interval '10 days'
);

-- ── Artist and one rollout with a few tasks ─────────────────────────────────
insert into public.artists (id, owner_user_id, workspace_id, name, slug)
values (
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000010',
  'Test Artist', 'test-artist'
);

insert into public.releases (id, owner_user_id, artist_id, title, artist_name, release_type, status, release_date)
values (
  '00000000-0000-4000-a000-000000000030',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a000-000000000020',
  'First Light', 'Test Artist', 'single', 'planning', (current_date + 30)
);

insert into public.tasks (release_id, workspace_id, created_by, title, status, due_date, position)
select
  '00000000-0000-4000-a000-000000000030',
  '00000000-0000-4000-a000-000000000010',
  '00000000-0000-4000-a000-000000000001',
  t.title, t.status::public.task_status, now() + (t.days || ' days')::interval, t.pos
from (values
  ('Send the master to the distributor', 'done', -2, 0),
  ('Finish the cover art', 'in_progress', 3, 1),
  ('Pitch to playlists', 'todo', 10, 2),
  ('Release day posts', 'todo', 30, 3)
) as t(title, status, days, pos);

-- ── Pending team invite (no account yet) ────────────────────────────────────
insert into public.workspace_members (workspace_id, email, role, status, invited_at, invite_token, invite_expires_at)
values (
  '00000000-0000-4000-a000-000000000010',
  'invited@test.localhost', 'admin', 'invited', now(),
  '00000000-0000-4000-a000-0000000000a1', now() + interval '30 days'
);

-- ── Closed sign-up: let test addresses in ───────────────────────────────────
-- An open founder invite bound to an email lets that address through
-- POST /api/access/check before sign-up and approves the account after it
-- (lib/access-gate-server.ts, isEmailLetIn and getAppAccess).
insert into public.access_invites (email, label, created_by)
select format('tester%s@test.localhost', n), 'local seed', '00000000-0000-4000-a000-000000000001'
from generate_series(1, 20) as n;

insert into public.access_invites (email, label, created_by)
values ('waiting@test.localhost', 'local seed', '00000000-0000-4000-a000-000000000001');

-- A /start/LocalTestStart2026 link (single use, 14 days): the code is stored as
-- its sha256, the way lib/access-gate-server.ts hashAccessCode does.
insert into public.access_invites (code_hash, label, created_by, expires_at)
values (
  encode(extensions.digest('LocalTestStart2026', 'sha256'), 'hex'),
  'local seed', '00000000-0000-4000-a000-000000000001', now() + interval '14 days'
);

commit;
