-- Sign in with Apple (2026-10-01). Apple requires that when somebody deletes
-- their account, the app revokes their Sign in with Apple link. To do that we
-- need the refresh token Apple issues in exchange for the one-use code the
-- iPhone app receives at sign-in. This table keeps it until the account is
-- deleted (the account delete route revokes it, then the row cascades away).
--
-- Service-role only: row level security is on and there are NO policies, so
-- neither the browser nor the app can read or write it. A refresh token can
-- act on the person's Apple link, so it must never reach a client.
--
-- Additive and safe to apply before the code ships. Rollback:
--   drop table if exists public.apple_sign_in_tokens;

create table if not exists public.apple_sign_in_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apple_sign_in_tokens enable row level security;

comment on table public.apple_sign_in_tokens is
  'Apple refresh tokens, kept only so account deletion can revoke Sign in with Apple. Service-role only.';
