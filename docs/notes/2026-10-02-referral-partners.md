# Referral partners (2026-10-02, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The strategy doc (section 10, "Sound Wave Spotlight terms") signs a referral deal: the partner gets a code, teams that sign up with it are tagged to them, and they earn **10% of those teams' subscription payments for each team's first 12 months**, paid monthly by the 10th on payments that cleared the month before, with **no commission on refunds, credits or distribution**. This builds the mechanism. Behind `NEXT_PUBLIC_FEATURE_REFERRALS` (default off). Migration `20261002200000_referrals.sql`, **not applied anywhere yet.** Not a scope expansion: the strategy doc commits it. Their free Urganize access is a different thing and needs no code: comp their own team in `/admin/teams`.

**How it works.** A partner shares `https://app.urganize.app/onboarding?ref=CODE`. The onboarding and auth pages remember the code for 30 days (`lib/referral-intent.ts`, localStorage, last link wins); when signup ends the page reports it to `POST /api/referrals/attach`, which tags the caller's own team. A payment on or after the tag earns commission. Everything the admin sees at `/admin/referrals` is worked out fresh from the records each load, so nothing stored can go stale.

**The reason there is a new ledger table.** Renewals were recorded nowhere: the Paystack webhook only overwrites `subscriptions.amount` and inserts no payments row, so commission could not be summed from existing data. `subscription_charges` is the missing record, written by the webhook at its three subscription points (the first charge, a renewal, a plan-change top-up) and by the admin "Mark paid" action (source `manual`). One row per Paystack reference, so a redelivered webhook counts once.

### Things worth knowing before editing this

1. **Where the rules live.** `lib/referrals.ts` is pure and holds every decision that touches money (tagging, the commission sum, the window, the month a payment belongs to, the admin action parser). `lib/referrals-server.ts` does the reads and writes. The two directions fail differently on purpose: `recordSubscriptionCharge` runs inside the money webhook, never throws and returns silently while the flag is off; `attachReferral` decides who gets paid, so every read it cannot establish counts as a refusal.
2. **The counting rules, as built, and the readings of the doc that can be challenged.** "First 12 months" runs from the team's first COUNTED payment, not from signup, so a team that takes a week to pay still gets its twelve months; a payment exactly twelve months later is outside (`<`, not `<=`). A payment made before the team was tagged never counts, so tagging a team that already pays cannot reach into history. A refunded first payment does not start the clock. Commission is rounded down to the kobo per payment. A payment belongs to the Lagos calendar month it cleared in (UTC+1 all year).
3. **Refunds are mostly automatic since 2026-10-03.** A full refund processed in Paystack now excludes the charge by itself (see "Refunds take the reward back" under Referral credits). Anything else is still manual: on the admin page you "Exclude" the payment with a reason and it stops earning; "Restore" undoes it. If a month was already paid, the page shows the overpayment instead of silently netting it.
4. **Manual deals are counted by default.** A team the founder marks paid by hand is a subscription payment too, so it joins the ledger with source `manual`. If a deal should not earn commission, exclude it. This is a judgement call on the doc's "subscription payments".
5. **Tagging refuses on purpose.** A team can only be tagged in its first 14 days (so a code typed into a link cannot claim an old team), never if the person joined someone else's team by invite, never twice, and never to a switched-off partner. The founder can tag an older team by hand (the owner's email, on the admin page), which skips the age and invite rules only. An unreadable creation date fails closed.
6. **`team_referrals` is keyed on the team, with the partner restricted from deletion**, so removing a partner can never orphan commission that is owed. A partner is switched off, not deleted; teams already tagged keep earning.
7. **Admin routes and payouts are NOT behind the flag.** Money already owed has to stay payable whatever state the switch is in, and the founder can add a partner before it goes on. The attach route 404s with the flag off, and `lib/referrals-guard.test.ts` pins the order (switch checked before auth).
8. **Do not switch the flag off once teams are tagged.** Payments made while it is off are not recorded and would earn no commission. The `.env.example` entry says so.
9. **Terms live on the partner row** (`commission_bps`, `commission_months`), defaulting to 1000 and 12, so a different deal later is a row. The admin form only creates partners with the defaults.
10. **Tables have row level security and no policies.** Every read and write is a service-role route behind the admin check or the webhook. A structural test lists the only files allowed to touch each table.

### Verified

6,161 tests passing after rebasing onto v1.62.0, none failing (about 55 new: 34 on the rules in `lib/referrals.test.ts` and 11 structural in `lib/referrals-guard.test.ts`, which also covers the client module). Type-check clean apart from the 8 documented `confirmed-action.test.ts` errors. Lint 0 errors; one new warning, the fetch-on-load effect on the admin page, identical to the scoreboard page's. `next build` green by exit code with the flag on, `/auth`, `/onboarding`, `/settings` and `/locked` still static. Runtime probes rebuilt between flag states: flag on, the attach route answers 401 unauthenticated; flag off, it answers 404 `{"error":"Not found."}`, against an unchanged control route (401). **Eight deliberate breaks, each caught by a named test:** rounding commission up, an inclusive twelve-month boundary, counting pre-tag payments, ignoring exclusions, allowing invitees, skipping the 14-day rule, starting the window at signup, and checking the flag after auth.

### Not verified

Nothing has run against a real database, a real Paystack webhook or a real signup. The migration is unapplied, so no partner has been created, no team tagged and no charge recorded. The admin page has never rendered with a real admin session (none can be minted here). The webhook hooks were added to the money path and are covered by unit tests of the pieces and a source-order test, not by a delivered webhook.

### Activation

1. Apply `20261002200000_referrals.sql`.
2. Open `/admin/referrals`, add Sound Wave Spotlight with the code agreed with them, and copy the link.
3. Comp their own team in `/admin/teams` (the free access in the MOU).
4. Set `NEXT_PUBLIC_FEATURE_REFERRALS=true` on the Vercel `Web` project (Production), with a deploy that rebuilds `apps/web`. Do this BEFORE the first referred team pays, or that payment is not recorded.
5. Give them the link. Check the first referral end to end: sign up through it with a throwaway email, confirm the team shows under the partner, and after a real payment confirm the month line shows ten percent.
6. Each month by the 10th: open the page, pay the amount shown, and press "Record payment".
7. Changelog entry and version bump only if this is worth announcing; the surface is internal, so by the EPK precedent there is nothing to announce at merge.
