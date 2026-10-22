# Product polish pass (2026-10-09 on)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

A loop that uses the app the way a busy manager does (Monday-morning Home, a new single, working a plan, catching up after three days away, shows, contacts, handing off, release week, Settings, a first session) and fixes whatever feels slow, confusing, awkward or likely to make someone quit. It is NOT bug fixing: a parallel session does that and keeps `notes/fix-log.md`. This one keeps `notes/polish-log.md` (what felt wrong, why it matters to a manager, what shipped) with before and after screenshots in `notes/polish-shots/<fix>/`.

Rules it works under, so the next session does not have to re-derive them: the smallest change that fixes the feeling; reuse existing components, tokens and copy patterns; no schema or migration changes, nothing touching pricing, credits or entitlements, no new AI calls and no new features without approval; anything that changes positioning, navigation structure, URLs, pricing or onboarding strategy goes to `notes/needs-lucky.md` with a one-line recommendation instead of being built. One fix per branch (`polish/<name>`), one patch version each, squash merged.

### How the screens are checked

Never against production. A throwaway local stack stands in for Supabase: a Postgres container, PostgREST, and a small gateway that fakes sign-in and signed storage URLs, so every real API route runs unmodified. It is seeded through the app's own routes with a made-up team (three artists, twelve rollouts in every state, three people, shows, notes, contacts) and driven with Playwright against the installed Chrome at 390px and 1440px in both themes. Two findings worth keeping from building it:

- **The migrations alone cannot build a database.** `releases`, `tasks`, `profiles`, `workspaces` and a dozen other foundation tables were created in the Supabase dashboard before migrations began and exist only in the root `schema-dump.sql` (2026-05-24); the first migration, `20260430_execution_upgrade.sql`, fails on a clean database for that reason, and so do the enum types the dump uses. A usable dev database is: a Supabase stand-in (roles, `auth.uid()`, `storage` stubs), the enums from `20260510_mvp_release_management_schema.sql`, the dump (twice, for its forward foreign keys), then every migration, retrying the two that sort out of order. Only `20260925140000_pitch_payments_cron.sql` cannot apply (no `pg_cron`).
- **A new rollout starts with no activities in production's configuration** (planner on): the manager answers the intake and the plan is built. A seed has to call `POST /api/releases/<id>/plan` after creating each rollout, or every rollout is empty. And the Manager plan caps a team at three active rollouts, so a realistic busy team has to be seeded on Label.

### Fixes

1. **"Invite your team" only shows to a team that is just the manager** (v1.92.9). The Home strip used to remember only "closed in this browser", so a manager with a full team saw it again on every new phone or browser. `lib/invite-banner.ts` decides (manager, not dismissed, team size known, one person on the team); it waits for the identity store's `hydrated` so it never flashes. Before and after: `notes/polish-shots/invite-banner/`.
