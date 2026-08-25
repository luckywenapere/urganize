-- Per-user MCP access over OAuth 2.1 (founder request, 2026-08-25): every
-- customer connects the LLM client of their choice — claude.ai, Claude
-- Desktop, ChatGPT, Claude Code — to their own Urganize workspace, and takes
-- their release context with them.
--
-- The endpoint already existed (POST /api/mcp, URG-183, 2026-07-31) but was
-- founder-only and env-bound: MCP_ACCESS_KEY + MCP_USER_ID, one key, one
-- hard-coded account, and lib/mcp/config.ts said so in as many words — "no
-- OAuth, no per-user keys, no DB table". These three tables are what turns
-- that into something a customer can use. The env-key path is untouched and
-- keeps working.
--
-- WHY OAUTH RATHER THAN A PER-USER BEARER TOKEN, WHICH WOULD HAVE BEEN THREE
-- COLUMNS INSTEAD OF THREE TABLES:
-- Claude Code accepts a static bearer via --header. claude.ai web and Claude
-- Desktop do not: their custom-connector flow assumes OAuth 2.1 and attempts
-- Dynamic Client Registration on connect, with no "no auth" option and no
-- static-header fallback (anthropics/claude-ai-mcp#402, closed as not
-- planned). ChatGPT connectors likewise require OAuth. Urganize's users are
-- artist managers, not developers — they live in claude.ai and the phone
-- apps, which are exactly the OAuth-only clients. A token surface would have
-- served the founder and nobody else.
--
-- THE SECURITY PROPERTY BEING PRESERVED, NOT REPLACED:
-- app/api/_shared/auth.ts argues the env binding is safe because "a leaked key
-- can only ever act as that one user, never as an arbitrary account", and that
-- there is deliberately no acting-user header. A token row carrying user_id
-- keeps exactly that: the credential IS the binding, one credential resolves
-- to one account, and no request header can redirect it. What changes is that
-- the binding lives in a row instead of an env var — which is also what
-- finally makes revocation possible (.env.example used to say "there is no
-- revocation UI").
--
-- RLS: ENABLED WITH NO POLICIES ON ALL THREE, DELIBERATELY.
-- The posture both other credential-ish tables already use — see
-- 20260723210000_workspace_invite_links.sql and curator_invites in
-- 20260810100000_playlist_pitching.sql: "codes must never be enumerable".
-- Not the four-owner-policy posture the release_* share tokens use, because
-- those tokens are read from the browser to render a Copy button and these are
-- never re-displayed at all. Every read goes through a service-role route.
--
-- TOKENS AND CODES ARE STORED HASHED (sha256 hex), WHICH DEVIATES FROM EVERY
-- OTHER TOKEN IN THIS REPO — createHash appears nowhere else in apps/web, and
-- INVITE_LINK_COLUMNS deliberately re-reads a plaintext code so the Settings
-- list can offer a Copy button. That reason does not apply here: an OAuth
-- access token is handed to a client once and never shown to a human again, so
-- nothing needs it back, and a stolen database row should not be a working
-- credential.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.mcp_oauth_tokens;
--   drop table if exists public.mcp_oauth_codes;
--   drop table if exists public.mcp_oauth_clients;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 1. mcp_oauth_clients — one row per Dynamic Client Registration
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  -- The public identifier handed back to the registering client and echoed on
  -- every later /authorize and /token call. Opaque and unguessable rather than
  -- sequential: it is not a secret, but it should not be enumerable either.
  client_id text not null unique,
  -- Self-reported by the client at registration ("Claude", "ChatGPT"). Shown on
  -- the consent screen and in the owner's Settings list, so it is the only
  -- thing a user has to recognise a connection by. UNTRUSTED INPUT: it is
  -- whatever the registering party typed, so treat it as display text and
  -- never as identity.
  client_name text not null,
  -- Exact-match allowlist for the authorization-code redirect. An array
  -- because a client legitimately registers several (a web callback plus a
  -- loopback one for its desktop build). Matching is exact string equality —
  -- never prefix, never host-only, which is the classic open-redirect hole.
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

comment on column public.mcp_oauth_clients.client_id is
  'Public OAuth client identifier. Not a secret; these are public clients (PKCE only, no client_secret column exists).';

comment on column public.mcp_oauth_clients.client_name is
  'Client-supplied display name, shown on the consent screen. UNTRUSTED: never use it as identity or for any authorization decision.';

comment on column public.mcp_oauth_clients.redirect_uris is
  'Exact-match allowlist. A redirect_uri is accepted only on exact string equality with a member of this array.';

-- /token and /authorize both resolve a client by client_id; the unique
-- constraint above already indexes it, so no extra index is needed.

alter table public.mcp_oauth_clients enable row level security;

-- No policies on purpose. See the header: registrations are read only by the
-- service-role OAuth routes.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2. mcp_oauth_codes — short-lived, single-use authorization codes
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.mcp_oauth_codes (
  id uuid primary key default gen_random_uuid(),
  -- sha256 hex of the code. See the header on hashing.
  code_hash text not null unique,
  client_id text not null,
  -- The account that clicked Allow. This is the whole binding: the code, and
  -- then the token minted from it, can only ever act as this user.
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Echoed back at /token and compared for exact equality, per RFC 6749 §4.1.3.
  -- A code issued for one redirect_uri must not be redeemable against another.
  redirect_uri text not null,
  -- PKCE (RFC 7636). Required, not optional: the code challenge is what stops
  -- a stolen code being redeemed by anyone but the client that started the
  -- flow, and these are public clients with no secret to fall back on.
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  -- RFC 8707 resource indicator, recorded so a code minted for this MCP
  -- server cannot be presented as one minted for something else later.
  resource text,
  -- 60 seconds. RFC 6749 recommends a maximum of ten minutes and "as short as
  -- possible"; the code is exchanged by a program immediately, so a minute is
  -- generous and shrinks the theft window to almost nothing.
  expires_at timestamptz not null,
  -- Set by the conditional update that redeems the code. Single-use is
  -- enforced by `where consumed_at is null` returning a row — the row is the
  -- lock, so there is no read-then-write window (the curator_invites pattern
  -- in app/api/curator/join/[code]/route.ts).
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.mcp_oauth_codes.code_hash is
  'sha256 hex of the authorization code. The plaintext code exists only in the redirect URL and the client that received it.';

comment on column public.mcp_oauth_codes.consumed_at is
  'Redemption stamp. Single-use is enforced by a conditional UPDATE ... WHERE consumed_at IS NULL RETURNING, not by a read-then-write.';

comment on column public.mcp_oauth_codes.resource is
  'RFC 8707 resource indicator recorded at authorization time, so a code cannot be replayed against a different audience.';

-- Expired-code cleanup sweeps by time; nothing else queries this column.
create index if not exists mcp_oauth_codes_expires_at_idx
  on public.mcp_oauth_codes(expires_at);

alter table public.mcp_oauth_codes enable row level security;

-- No policies on purpose: an authorization code is a live credential.

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 3. mcp_oauth_tokens — the access/refresh pair behind one connection
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  -- sha256 hex of the access token. Looked up on EVERY MCP request, which is
  -- why it is unique-indexed rather than merely indexed.
  token_hash text not null unique,
  -- sha256 hex of the refresh token. Nullable because a rotated-away row
  -- keeps its access hash for the remainder of its life but surrenders the
  -- refresh side to its successor.
  refresh_hash text unique,
  client_id text not null,
  -- Denormalized from mcp_oauth_clients so the owner's Settings list renders
  -- with no join — the same call playlist_pitches makes for the curator card.
  -- A client that re-registers under a new name does not retroactively rename
  -- an existing connection, which is the honest behaviour: the row records
  -- what it was called when the user approved it.
  client_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Access tokens are short-lived and refreshed silently by the client; the
  -- refresh token is what carries the long-lived grant, and revoking the row
  -- kills both at once.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- Best-effort, updated on use. This is the one column that makes a Settings
  -- list actionable — "last used 3 months ago" is how a manager decides which
  -- connection to revoke. A failed write here must never fail the request.
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.mcp_oauth_tokens.token_hash is
  'sha256 hex of the access token, resolved on every MCP request. The plaintext is held only by the client.';

comment on column public.mcp_oauth_tokens.refresh_hash is
  'sha256 hex of the refresh token. NULL once rotated away, so only the newest row in a chain can be refreshed.';

comment on column public.mcp_oauth_tokens.client_name is
  'Snapshot of the client name at approval time. Deliberately not re-read from mcp_oauth_clients: the list should say what the user agreed to.';

comment on column public.mcp_oauth_tokens.last_used_at is
  'Best-effort touch on each use. Never block or fail a request on this write.';

-- The Settings list reads a user's connections newest-first.
create index if not exists mcp_oauth_tokens_user_created_idx
  on public.mcp_oauth_tokens(user_id, created_at desc);

alter table public.mcp_oauth_tokens enable row level security;

-- No policies on purpose. The owner reads their own connections through
-- GET /api/mcp/connections, which is auth-gated and uses the service-role
-- client — so a token hash is never readable from the browser.
