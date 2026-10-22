# Invite acceptance is durable now: the deferred claim (2026-08-29, v1.4.3)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder report: a teammate used an invite link and created an account, but the
founder could not assign him a task and was unsure he could see the workspace's
releases. **One root cause, both symptoms: the account existed and the
`workspace_members` row did not.** The accept page (`/invite/accept`) creates
the ACCOUNT first and joins the workspace SECOND, and nothing recorded the
pending join — so any failure between the two steps (a dropped request on weak
mobile data, the documented failure mode of this user base; a lost OAuth resume
marker; a no-session signup while email confirmation is on, which the auth
store swallows without throwing) left an account that belonged to no team, with
nothing that would ever retry. Everything downstream was verified correct and
untouched: the assignee picker's selectability rule, the PATCH assignee
validation, `releaseOwnerIds` visibility — all of them key off the membership
row that was never written.

**The fix is a durable claim, the `activatePendingWorkspaceInvitesForUser`
pattern applied to token invites.** The accept page's email/password signup now
stashes the invite token in `auth.user_metadata.pending_invite_token` (via a
new optional `options` param on the auth store's `signup`), and
`loadWorkspaceAccessContext` finishes the join on the user's first
authenticated request, whatever path brought them back into the app.

**Five things worth knowing before editing this:**

1. **`lib/invite-claims-server.ts` is the ONE implementation of the join, and
   it is deliberately LEAF-ONLY** (the `lib/seats-server.ts` rule, restated in
   its header): it is imported by `lib/tasks-server.ts` AND by
   `app/api/invites/[token]/route.ts`, which hand-rolls its auth to stay off
   the paywalled `_shared/auth` chain. The route's POST is now a thin mapper
   over `claimWorkspaceInvite` — `joinWorkspaceViaLink` and the legacy
   member-row accept moved into the lib verbatim. Do not grow a second copy of
   join semantics in the route again; the GET keeps its own row lookups
   because metadata display is not a join.
2. **The deferred claim costs ZERO queries on the steady state.** It rides
   `loadWorkspaceAccessContext`'s existing `Promise.all` and bails on a pure
   metadata read (`readPendingInviteToken`) — the key is absent for everyone
   who is not mid-recovery, and that function tolerates every shape a
   user-writable `user_metadata` can hold (unit-tested).
3. **The metadata is cleared on every TERMINAL outcome** (joined, already a
   member, invalid, expired, used, seat-refused) via
   `auth.admin.updateUserById` — GoTrue shallow-merges `user_metadata`, and a
   null value removes just this key. Only a transient query error keeps it, so
   the next request retries. The user object read by `getAuthenticatedUser` is
   fetched fresh from GoTrue per request (not decoded from the JWT), so a
   cleared key never re-triggers.
4. **Claim semantics are byte-compatible with the route's long-standing
   behavior**, including the two easy-to-lose details: the legacy per-email
   kind runs NO seat check (an 'invited' row already occupies a seat, counted
   at mint), and "already used" answers before "expired" — an invite you
   already hold is used, not expired. `resolveLegacyInviteClaim` is the pure,
   unit-tested encoding of that ordering.
5. **The accept page stopped lying on the two failure shapes.** A no-session
   signup (email confirmation) now says the join completes at next sign-in —
   which the deferred claim makes TRUE — instead of surfacing "Sign in to
   accept this invite." as an error; a failed accept POST after a successful
   signup appends the same reassurance instead of reading like a dead end.

**Recovering an ALREADY-stuck teammate needs no code at all**, and both paths
predate this fix: (a) invite them by email from Settings → Teammates using the
exact address they signed up with — `activatePendingWorkspaceInvitesForUser`
activates the pending row silently on their next dashboard load; or (b) have
them reopen the same join link while signed in and press "Accept and join"
(link-kind invites are multi-use).

- **Verified:** 1550 tests (21 new in `lib/invite-claims-server.test.ts`),
  `eslint .` at the exact 3-error/68-warning baseline (the one new
  react-compiler warning was avoided by turning two trivial `useMemo` string
  fallbacks on the accept page into plain consts), `next build` green by exit
  code with `/auth`, `/onboarding`, `/settings` still `○ Static`.
- **Not verified:** nothing has run against a real database or a real signup —
  this sandbox cannot mint a Supabase session or reach app.urganize.app. The
  claim's DB plumbing is exercised only through the route it was extracted
  from; worth one live pass: sign up from a join link with the network throttled
  so the accept POST fails, then sign in and confirm the workspace appears.
