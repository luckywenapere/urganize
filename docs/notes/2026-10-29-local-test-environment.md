# Local test environment (2026-10-29, #862)

A copy of the web app on this machine with its own database (Supabase in Docker, every migration applied), so sign-up, onboarding and team flows can be tested end to end without touching production or analytics.

## Commands (run from the repo root)

| What | Command |
|---|---|
| Start the local database (Docker must be running; first run pulls images, about 10 min) | `pnpm db:local:start` |
| Wipe it and rebuild: bootstrap, all migrations, fix-ups, seed (about 3 min) | `pnpm db:local:reset` |
| Re-run only the seed (deletes every `@test.localhost` account first) | `pnpm db:local:seed` |
| Run the app against it on http://localhost:3100 | `pnpm dev:local` (stop with Ctrl+C) |
| Stop the local database | `pnpm db:local:stop` |

After a fresh `db:local:start` the database is empty: run `pnpm db:local:reset` once.

Local services: Studio http://127.0.0.1:54323, mail catcher (Mailpit) http://127.0.0.1:54324, API http://127.0.0.1:54321, Postgres on 127.0.0.1:54322 (the Supabase CLI default login).

Do not run `pnpm dev` (the normal one, on production Supabase) in the same checkout at the same time: both use `apps/web/.next`.

## Seeded accounts

Password for every seeded and test account: `Local-rz4BgKBeRTFyxF` (local only; also in `supabase/local/seed.sql`).

| Email | What it is |
|---|---|
| `owner@test.localhost` | Approved owner of "Test Owner's Team" (14-day team trial), artist "Test Artist", rollout "First Light" (single, 30 days out, 4 tasks) |
| `invited@test.localhost` | No account. Pending invite (role admin, shown as "manager") to the owner's team. Sign up with it to see the Join card. Link: `/invite/accept?token=00000000-0000-4000-a000-0000000000a1` |
| `tester1@test.localhost` … `tester20@test.localhost` | No account. Each has an open founder invite, so sign-up passes the closed sign-up gate |
| `waiting@test.localhost` | No account, same kind of invite. Use it for "I'm joining someone's team" |
| `/start/LocalTestStart2026` | A single-use access link for any other address |
| any other address (e.g. `someone@example.test`) | Held by the closed sign-up gate, to test the invite-only screen |

To let the waiting account in, invite it as the owner (Team, then Invite) or run in Studio's SQL editor:
`insert into workspace_members (workspace_id, email, role, status, invite_token, invite_expires_at) values ('00000000-0000-4000-a000-000000000010', 'waiting@test.localhost', 'member', 'invited', gen_random_uuid()::text, now() + interval '30 days');`
The waiting screen turns into a Join card within about 20 seconds.

## How it is built

- `supabase/config.toml`: local only. Email confirmation off (as production), Google not configured, Mailpit for mail, buckets `release-assets`, `proofs`, `task-attachments`, site URL `http://localhost:3100`. CLI migrations and seed are OFF on purpose (below). Production auth settings and templates still go through the Management API; never `supabase link` or `config push` with this file.
- `scripts/local-db.mjs`: applies `supabase/local/bootstrap.sql`, every migration with psql inside the local DB container, then `supabase/local/after-migrations.sql` and `supabase/local/seed.sql`. It refuses to run unless the container `supabase_db_urganize-local` is up. No migration file is edited.
- `scripts/dev-local.mjs`: reads the local URL and keys from `supabase status`, blanks every key in `apps/web/.env*` (Next always loads `.env.local`, which is production; values already in the environment win), blanks every outside service, and refuses to start unless the Supabase URL is on this machine. Optional overrides go in `apps/web/.env.local-test` (gitignored).
  - Off: PostHog (no key), Clarity (never loads outside a production build), Vercel Analytics, Sentry (`NEXT_PUBLIC_SENTRY_DSN=off`), Resend, Paystack, TRM, Twilio/WhatsApp, Linear, web and native push, AI keys (UrgAns runs in its no-model mode; plans fall back to the playbook).
  - Feature flags: every flag the code switches on with `=== 'true'` is set to true (found by scanning `apps/web`), except CARD_TRIAL (off in production), NATIVE_PUSH, PUSH_PROMPT and URGANS_VOICE. `lib/cut-features.json` still forces its list off. This is a best guess at production, which this repo cannot read. Without it, whole areas 404 (Artists, the record page, Team) and new teams get no trial (the trial stamp is gated on HARD_PAYWALL).

## Workarounds (why it is not plain `supabase db reset`)

1. **The CLI cannot apply this migrations folder.** Ten version numbers are used twice (for example two `20261003120000_*`), which breaks the CLI's history table, and `99999999_*_DO_NOT_APPLY_YET.sql` would run. Production never used CLI history either. So the runner applies files with psql, skips `DO_NOT_APPLY`, and orders by the version read as a timestamp (`20260602_` before `20260602010000_`, which needs `artists.workspace_id` from the first), ties by name.
2. **Objects production had before migrations** (`supabase/local/bootstrap.sql`): bare `releases` and `tasks` tables and the `task_status` type (20260430 alters them before 20260510 creates them), `release_metadata` in the shape 20260525034856 records (20260520 alters it first), and two `releases` columns no migration adds: `artist_id` (read by 20260602010000) and `slug` (selected by POST /api/releases; without it every new rollout fails with "Release operations tables are missing.").
3. **After the migrations** (`supabase/local/after-migrations.sql`):
   - the two pg_cron jobs from 20260925140000 are removed (they read Vault secrets that do not exist locally and would call out every 15 minutes);
   - NOT NULL is put back on `releases.title`, `tasks.title`, `tasks.created_by`, `tasks.workspace_id`, which production has (2026-05-24 dump) but the bootstrap path skips;
   - an insert policy on `profiles` for your own row. The browser creates the profile after sign-up (`lib/auth-store.ts`), and the migrations only grant read and update, so without it a new account has no profile and its persona, step and closed sign-up approval are lost. **Assumed** production allows this some other way (a hand-made policy or trigger); not checked.

## Verified on 29 Oct (dev server, desktop)

Sign up through /onboarding, create a team (trial stamped, 3 days), "Just an idea" lands on the record page and the trial sheet opens, a second account with "Ready to release" plus a date builds the playbook plan and shows the Solo trial sheet, `invited@` sees the Join card and joins with one tap (approved as `team_invite`), `waiting@` gets the waiting screen and it turns into a Join card by itself. Every request went to localhost or 127.0.0.1.

## Known gaps

- Google sign-in (no provider configured), email confirmation links (confirmation is off, as production; turn on `enable_confirmations` in config.toml and read mail in Mailpit to test it), password reset mail (goes to Mailpit, not tested).
- Payments, Paystack checkout and webhooks; TRM distribution; WhatsApp; push; Resend mail (the app's own mail is skipped, not caught).
- UrgAns and AI planning with a real model (no keys).
- Feature flags are a guess at production (above). Production-only objects not in the 2026-05-24 dump or the migrations are unknown; the next "column does not exist" error locally is probably one, and belongs in `bootstrap.sql` with a note.
- Storage policies for the buckets come only from migrations; uploads were not tested.
- Phone widths were not tested in this pass.
