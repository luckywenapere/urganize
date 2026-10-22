# Curator pitch payments (2026-09-25, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder ask: let an artist pay a curator to guarantee a listen and a written
reply, instead of every pitch being free-or-nothing. Not a scope expansion —
it is money layered onto the already-sanctioned playlist-pitching surface
(2026-08-10), the same footing as the Manager-tier and Solo-tier pricing work.
Behind `NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS`, default `false`, only meaningful
alongside `NEXT_PUBLIC_FEATURE_PITCHING`. **Two migrations, neither applied
anywhere yet.**

**What was bought is a listen and a reply within a window, never a playlist
spot.** A curator opts in per playlist with a flat price; an artist checking
out pays that price through ONE Paystack transaction that splits automatically
— the curator's share to their own Paystack subaccount, Urganize's fee kept
back — no wallet, no balance, no escrow anywhere in this. A missed reply
window auto-refunds the artist and the refunded share is clawed back from the
curator's NEXT paid pitch, never chased separately. Three missed windows in 90
days pauses that curator's paid inbox until the founder lifts it.

**Nine things worth knowing before touching any of this:**

1. **The self-pay guard fails CLOSED, and it checks further than "not this
   curator."** `checkPaidCurators`/`curatorsOnTheTeam` in
   `lib/pitch-quotes-server.ts` refuses a checkout if the payer, the release's
   owner, any owner of the payer's own teams, or any workspace member of those
   teams appears among the curators being paid — on ANY database read error,
   not just a positive match. Money must never be able to flow back to the
   person who sent it, and a query that cannot answer is not evidence it
   cannot happen.
2. **A subaccount is created even for a bank account that ends up
   `needs_review`.** Paystack's dynamic split needs a real subaccount code at
   checkout time, and the review is about whether the resolved account NAME
   matches the curator's own profile — a mismatch that waits for a human
   before any money is routed to it, not a reason to refuse creating the
   subaccount at all. The curator sees "Your bank details are being checked"
   rather than a dead end.
3. **Everything that SETTLES money is deliberately NOT flag-gated: the
   webhook, both cron sweeps, the verify route, refunds, and the paid-reply
   rules on a pitch that has already been paid for.** Creation and UI routes
   check the flag; these follow the ROW's own state instead. A real refund or
   reply obligation must keep resolving even if the feature is switched back
   off — the founder deciding to pause new paid pitches must never strand
   money already collected.
4. **Column selection falls back on Postgres `42703` (undefined column),
   never on the flag.** Both `app/api/curator/pitches/route.ts` and
   `app/api/pitching/pitches/route.ts` always ATTEMPT the payment columns
   first and drop to the base column list only on that specific error code —
   so the two routes work correctly whichever order the migration and the
   flag flip land in, rather than trusting them to happen together. This is
   deliberately not the retired schema-missing-fallback pattern: no message
   or SQL is ever surfaced to the caller, only a silent, structural retry.
5. **Deleting an unpaid pitch is gated on PITCHING, not on
   PITCH_PAYMENTS.** An `awaiting_payment` row still holds its playlist's one
   waiting slot (the unique index counts it), so if payments is ever switched
   off with unpaid pitches still sitting there, a team has to be able to clear
   them or they can never pitch that playlist for free again either.
6. **iOS hides the whole paid surface — `canPayForPitchesHere() =
   !isIOSApp()`.** Apple's external-payment rule for digital goods inside a
   reviewed app applies here exactly as it already does to team billing; web
   and Android send the checkout straight to Paystack (Android through the
   existing `openExternalUrl`, since a webview cannot open a payment page
   Apple would refuse to review).
7. **Terms are notice-based for the artist and a checkbox for the curator, on
   purpose.** Checkout requires `termsVersion === ARTIST_PITCH_TERMS_VERSION`
   and the UI states "By paying, you agree to the Artist Terms" — no modal
   gate, because the artist is spending money in a flow that already has
   enough steps. The curator side requires an explicit acceptance checkbox
   before a bank account can be saved, because that is the one-time decision
   to take money through the product at all. **Both are drafts — a lawyer has
   to review them before this goes live for real money.**
8. **Every earnings row shows what the curator actually kept, not a naive
   subtraction.** A refunded payment has its WHOLE share reclaimed as an open
   recovery the instant the window is missed (the migration's
   `expire_paid_pitch()` inserts `curator_recoveries` for the full
   `curator_share_kobo`, whether or not it had already reached the bank), so
   `sentToBankKobo` is `0` on a refunded row rather than `share -
   recovery_applied_kobo` — the formula that would otherwise show money for a
   pitch that never paid out. Found by tracing the migration SQL rather than
   by a failing test.
9. **The admin console (`/admin/pitch-payments`) is internal-only and never
   flag-gated**, the `/admin/teams` precedent — approve or reject a payout,
   refund a checkout in full, retry or hand-settle a failed refund, unpause a
   curator, and a read-only recent-payments table. It is deliberately absent
   from every copy guard and search catalog that walks user-facing surfaces.

**Schema, both files pasted in full below when this ships to the founder for
review:** the payments migration adds the Paystack subaccount fields to
`curator_profiles`, the price/strike/pause fields the same table needs, a
`payment_kind`/price/window columns on `playlist_pitches` itself, and a new
`curator_recoveries` ledger table (RLS on, zero policies — every write is
service-role only, the same posture every other money table in this schema
uses). The cron migration wires Supabase's own `pg_cron` + `pg_net` to hit
`/api/cron/pitch-payments` every 15 minutes for missed-window sweeps plus once
a day for a Paystack reconcile, because the Vercel account's Hobby plan caps
cron at once a day and both of its slots are already spoken for.

**Reference prefixing, not a lookup, is what routes a webhook event.** Every
pitch checkout reference is minted `urgpitch-<...>`, so `charge.success` and
`refund.*` are intercepted by that prefix before the webhook's generic
dispatch switch ever runs — the same technique the trial-card and team-billing
checkouts already use for their own reference prefixes.

**Copy is verbatim from the founder's spec**, enforced by
`lib/pitch-payment-copy.ts`'s own test rather than left to review: every
string an artist or a curator reads — the checkout panel, the terms notice,
the inbox card, the earnings screen, the strike and pause banners — comes from
that one module. `lib/press-kit-copy-guard.test.ts` was extended to walk it
alongside the curator inbox, the earnings page and the paid-pitch dashboard
scene, deliberately excluding the admin console and the raw route handlers for
the same reason `/admin/teams` and `/admin/urgans` are never walked either.

**Verified:** the full vitest suite green (no regressions from anything
touched this pass); `eslint .` clean on every file this feature added or
edited, including two real `react/no-unescaped-entities` fixes in the admin
console (HTML-entity apostrophes/quotes are the house convention, confirmed
against existing admin pages before fixing rather than guessed at) and one
real, pre-existing rollout-vocabulary drift in `CuratorShell.tsx` ("Your
releases" → "Your rollouts") caught and fixed while adding the Earnings tab
beside it. `next build` green **by exit code** in BOTH flag states (a Google
Fonts fetch failure on one attempt was transient and resolved on an immediate
retry — unrelated to this feature). Runtime probes on `next start` in both
states: flag off, every new route answers **404** with the exact
`{"error":"Not found."}` gate body while the ungated `/api/releases` control
still **401**s; flag on, the same routes **401** unauthenticated instead —
that discrimination is what proves the gate is a real flag check rather than
a routing accident. `/admin/pitch-payments` answers the identical
missing-`ADMIN_EMAILS` **500** the pre-existing `/api/admin/teams` and
`/api/admin/urgans` routes answer under this sandbox's placeholder env,
confirmed side by side rather than assumed to be a regression.

**Not verified, and it is the whole risk surface:** nothing has run against a
real Supabase project, real Paystack test keys, or a real session. Neither
migration is applied anywhere; `pg_cron`/`pg_net` have not been enabled on any
project; no Vault secret has been created; no checkout has been initialized
against Paystack, so the dynamic multi-split behavior, a partial refund on a
split transaction, and subaccount KYC — the three questions the spec itself
flagged as needing Paystack support's confirmation — remain genuinely
unconfirmed, not merely untested. This sandbox has no route to Paystack, to
Supabase, or to app.urganize.app.

**Open questions for Paystack support before this goes live**, carried
forward unanswered from the spec: whether a dynamic (non-`split_code`) flat
split behaves identically to a pre-created Split object across retries and
partial failures; whether a partial refund on ONE line of a multi-pitch
checkout is actually supported the way `/refund` is being called here, or
whether it silently refunds the whole transaction; and what KYC a subaccount
needs before Paystack will actually route money to it, versus merely accepting
its creation. `PAYSTACK_SPLIT_MODE` is an env-selectable escape hatch between
the two split strategies specifically because the first question has not been
answered — do not delete it as dead configuration.

**Activation checklist:**

1. Apply both migrations (below), in order.
2. In the Supabase SQL editor, before the cron migration or its jobs will 401
   forever: `select vault.create_secret('<CRON_SECRET from Vercel>',
   'urganize_cron_secret');` and `select
   vault.create_secret('https://app.urganize.app', 'urganize_app_url');`
3. Enable the `pg_cron` and `pg_net` extensions under Database → Extensions in
   the Supabase dashboard if the migration's `create extension` lines are
   refused, then re-run the migration file (it is idempotent).
4. Set Paystack **test** keys first (`PAYSTACK_SECRET_KEY`), register the
   webhook URL in the Paystack dashboard, set `CRON_SECRET` and
   `BILLING_ALERTS_EMAIL` in Vercel if not already set from the team-billing
   work.
5. Test the whole loop against Paystack test mode BEFORE flipping the flag:
   a curator opts into a price, an artist pays, the pitch lands, a reply
   inside the window settles cleanly, a reply outside the window refunds and
   the recovery lands on the curator's next paid pitch, three misses pause
   the inbox.
6. Only then set `NEXT_PUBLIC_FEATURE_PITCH_PAYMENTS=true` on the Vercel `Web`
   project, with a commit that rebuilds `apps/web` (the documented
   `turbo-ignore` trap — a version-bump commit is sufficient).
7. Changelog entry + version bump land **at the flip, not at merge** (the EPK
   precedent) — nothing here is user-visible yet.
