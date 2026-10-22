# Team logins (2026-08-16)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

**HIDDEN 2026-10-17 (v1.154.17, URG-336).** Founder: "remove team logins and team
briefs". `NEXT_PUBLIC_FEATURE_TEAM_LOGINS` and `NEXT_PUBLIC_FEATURE_TEAM_BRIEF`
are forced `false` in `lib/cut-features.json`, so the Settings section, the
post-create access step, the list/revoke routes, the brief editor (and with it
the whole Settings > UrgAns segment), the brief's prompt injection, its nudge,
its chat marker and the admin Brief column are all off. The ungated mint POST
behind Teammates' "Copy invite link", `/join/<code>`, `/invite/accept` and email
invites are untouched. Rows in `workspace_invite_links` and
`team_brief_sections` are kept. At the cut, outside accounts had 8 team-login
links (all expired, nobody joined through one) and one brief section.

Founder request: after creating a release the next compulsory action should be
for the app to generate the logins itself, plus a section that generates them
without limit so one can be pasted to someone on WhatsApp or email, and that
person signs in and ends up with their own password.

**Not a scope expansion, and worth saying why** — every other dated section
below the v1 list either claims a number or explains itself. Workspace invite
links have shipped since 2026-07-23 (`workspace_invite_links`, `/join/<code>`,
`/invite/accept`); nothing on the out-of-scope list is touched, no new object
exists, and the release spine holds because the compulsory step hangs off a
release's creation. What was actually missing was that the mint endpoint could
only produce one link at a time with **no way to list or revoke what you had
minted** — the table's own 2026-07 header says "links can be revoked
(revoked_at) — no UI for that yet, but the column is ready". This is that UI,
plus the post-create step.

- **Flag:** `NEXT_PUBLIC_FEATURE_TEAM_LOGINS`, default `false`. Registered in
  `turbo.json` + `.env.example`.
- **Schema:** `20260816100000_workspace_invite_links_team_logins.sql` — `label`,
  `release_id` (**SET NULL**, deliberately unlike the `artist_scope_id` CASCADE
  directly above it: artist scope is an access boundary that must die with its
  artist, this is only provenance, and revoking someone's access because an old
  release was deleted would be a surprise), and `revoked_by`. **Not applied
  anywhere yet.**

**Five things worth knowing before editing this feature:**

1. **A login is a LINK, never a password, and that is the whole security
   argument.** The founder's wording was "he must be prompted to change it",
   which implies a temporary password travelling through WhatsApp; the model
   chosen instead has the recipient CHOOSE their password on `/invite/accept`,
   so nothing shareable is ever a readable credential in a chat log someone
   scrolls back through a year later. Same end state — they hold a password
   only they know — reached without ever transmitting one. `/invite/accept`'s
   password field was relabelled "Choose your password" with an explicit hint
   for exactly this reason: someone handed a link may otherwise sit waiting for
   a password message that is never coming.
2. **The mint POST is NOT flag-gated; the list and revoke endpoints are.**
   `POST /api/workspace/invite-link` has been live since 2026-07-23 and
   Settings → Teammates calls it today, so 404-ing it behind a new flag would
   break a shipped feature. Verified by probe rather than assumed: flag off,
   `GET` and `DELETE` return 404 while `POST` still 401s and an ungated control
   route also 401s — the 404-vs-401 discrimination is what proves the gate is
   real and not a routing accident (the EPK precedent).
3. **"Compulsory" means the step is always shown and has one exit, not that
   anything must be sent.** `ReleaseAccessStep` cannot be closed by backdrop or
   Escape (no Escape handler at all — the repo-wide rule), but its button is
   **always enabled, including when generation fails**, where it reads
   "Continue without a login". A compulsory step that can trap a user when the
   network drops is a bug, not discipline. A release with a team of one is also
   legitimate; what is compulsory is the decision, not the outcome.
4. **The create flow's original branches were deferred, not rewritten.**
   `onCreated` in `WorkspaceView` (and `ChappiPageClient`) now wraps its three
   existing branches — first-win reveal, planner intake, `?new=1` guide — in a
   `resume()` closure the step calls on exit. With the flag off it is one
   boolean and the original path runs verbatim. The closure captures
   `releases.length` from the creating render, which is what preserves the
   first-win branch's documented "releases still empty at this point"
   assumption; evaluating it later would see the resynced list and silently
   kill that reveal.
5. **The list is never cached to localStorage**, unlike `useTeammates`
   alongside it. Painting a stale link could show a manager one they revoked on
   another device and have them paste it into WhatsApp. Same reasoning that
   keeps the capture scene's leads out of persisted storage.

**2026-09-01: the type-first create flag bypasses the compulsory post-create
step.** Under `NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE` (founder call — see
"Type-first release creation" below) the type tap lands STRAIGHT in the
release, so `ReleaseAccessStep` never stages; Settings → Team remains the
surface for minting logins. Flag off, the step is unchanged and points 3–4
above still describe it exactly.

- **Where it lives:** `TeamLoginsSection` in Settings → Team, below Teammates.
  The order is the point — who is already here, then the keys you hand to
  whoever isn't. Manager-only and flag-gated, so most accounts see the tab
  exactly as it was. Unlike the Teammates list (which every teammate can see, a
  deliberate shared-roster surface) a stack of live sign-in links is only ever
  the manager's business.
- **Revoking is immediate and total but does not remove people.**
  `/api/invites/[token]` already refuses any code carrying `revoked_at` on both
  the metadata GET and the accept POST, so someone mid-signup cannot finish;
  anyone who already joined keeps their membership. Removing a teammate is
  still Settings → Teammates. The DELETE is soft (the teammate-removal
  precedent) so the row survives as "Revoked" rather than vanishing from a list
  the manager remembers adding to, and dead rows lose every share control —
  the one thing that must not happen is pasting a link that silently won't work.
- **Verified:** `pnpm exec vitest run` (638 passing incl. 19 new, 24 env-gated
  skips), `pnpm exec eslint .` (0 errors, 59 warnings = 57 baseline + 2
  fetch-on-mount `set-state-in-effect`, the documented React-19 downgraded
  rule), and `next build` green in **both** flag states with `/auth` and
  `/settings` still `○ Static`. **Note `pnpm test` cannot run in a sandboxed
  session** — turbo's package-manager shim fails TLS; run vitest directly.
- **Not verified:** nothing has run against a real database — the migration is
  unapplied, so generating, listing, revoking and a real join have never
  executed end to end, and the owner UI needs an authenticated session this
  environment cannot mint. The post-create step's placement in the create flow
  is reasoned from the code, not observed.
- **Activation checklist:** (1) apply
  `20260816100000_workspace_invite_links_team_logins.sql`; (2) set
  `NEXT_PUBLIC_FEATURE_TEAM_LOGINS=true` in Vercel `Web` → Production **and
  make sure the deploy actually rebuilds `apps/web`** (the EP/album flip records
  `turbo-ignore` skipping a web build whose commit touched only `package.json`
  files); (3) changelog entry + minor version bump across all 10 `package.json`
  files (the EPK precedent: the ledger entry lands at flag-flip, not at merge);
  (4) verify end to end — create a release, confirm the step generates a link,
  open that link in a private window, set a password, and confirm the new
  teammate lands in the workspace and the link is listed in Settings → Team.
