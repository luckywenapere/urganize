# Profiles and Directory, Lane A: unclaimed profiles and the claim flow (2026-10-11, live at merge, no flag)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Lane A of the "Urganize Profiles and Directory Spec". It depends on Relationships Phase 2 (migration `20261003100000`, already applied, flag on). Migration `20261010120000_claim_flow.sql` is **not applied by this change**. Spend-style note: apply it BEFORE merging; the sweep and the claim routes read the new columns.

**What it does.**
1. A daily step on `/api/cron/due-date-notifications` (`runCreditProfileSweepIfEnabled`, never throws) creates UNCLAIMED person profiles for people credited on delivered rollouts. Identity is email, then phone, never a name. It writes `release_credit_submissions.person_id`.
2. Unclaimed `/p/{slug}` pages show name, role and credits only, labelled "Unclaimed". A public "Remove this profile" form hides the page at once; an admin confirms within 3 days. `removed_at` is permanent and the sweep never recreates it.
3. A rollout owner can invite a credited person by email (owner presses "Email") or copy a "Share with Tobi" WhatsApp link, from the rollout's credits section. The token is shown once; only its sha256 is stored; invites last 30 days; 5 wrong contact tries lock the link.
4. `/claim/{token}`: sign up or log in, confirm the contact, review credits, bio, open-to status, publish, then a prompt to start a rollout or invite the team. Claiming merges into the claimer's own profile if they have one.
5. Admin queue at `/admin/claims` (removals and invites).

**Rules worth not undoing.**
- **The sweep is dry-run by default.** It writes in cron only when `app_settings.credit_profile_sweep.enabled` is on; the admin route shows the dry run first. It fails toward NOT creating: skips undelivered, archived and test rollouts, credits not attested (`confirmed_accurate`), hidden credits, credits with no contact, and people who already have an account. Credits sharing an email or phone group into one profile (union-find). 100 profiles per run.
- **Proof of identity is the confirmed account email on the credit, or a typed email or phone on the credit.** Names are never compared.
- **The invite email is owner-initiated, never automatic.** *Amended 2026-10-11:* an automatic claim email and one reminder are built behind `NEXT_PUBLIC_FEATURE_CLAIM_AUTO_EMAIL` (default off). With the flag off this rule still holds exactly. See "The claim email sends itself" at the end of this file.
- **An unclaimed slug is the name plus a random 5-character tail**; the public page exposes only name, handle and credits.
- New code is in `lib/claim*.ts`, `lib/person-unclaimed-server.ts`, `app/claim/`, `app/api/{claim,claim-profile,person-removal,admin/claims}`, `components/people/`. Small additive edits to other files: the cron route, `/p/[slug]`, `pitch-intent.ts` (optional `claimToken`), onboarding (`takeClaimIntent`), `AppShell` (`/claim/` is a standalone route), `MetadataSection`, admin nav.

**Differences from the spec.** Claimed `/p/` pages do not show credits yet; the invite email is owner-initiated rather than automatic; daily creation needs the admin switch after a dry run; removal hides at once and an admin confirms.

**Verified:** 49 new claim tests plus 16 structural guards; 16 deliberate mutations each confirmed applied and killed; `tsc --noEmit` clean; eslint 0 errors (two accepted `set-state-in-effect` warnings in new files); `next build` exit 0. Full vitest had 8 failures in files this change does not touch (press-kit-copy-guard 4, because the worktree folder name contains `directory-`; home/state, first-release-focus, rollout-create-title-guard, one each), not confirmed against a clean tree.

**Not verified:** no browser pass at all (the pane was hidden), nothing against a real database or session, the migration unapplied, no real email sent, and the static routes (`/auth`, `/onboarding`, `/settings`, `/dashboard`, `/locked`) were not re-read from the build output after the final build.

**Activation:** apply the migration; run the admin dry run and read the counts; switch the sweep on.
