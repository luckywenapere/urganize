# Referral credits (2026-10-02, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

The strategy doc names it in three places and defines none of it: "Referral credits | Credits for users who invite another team", the "Refer" stage ("they invite another team") and a "referred signups" metric. A team shares a personal link; when a team signs up through it and makes its first payment, the team that invited it earns credits. Behind `NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS` (default off), which **also needs `NEXT_PUBLIC_FEATURE_REFERRALS`**, because a personal code rides the same `?ref=` link and tagging step as a partner's. Migration `20261002210000_referral_credits.sql`, **not applied anywhere yet.** Not a scope expansion: the strategy doc commits it. It is the sibling of "Referral partners" above: a partner is a business paid in naira, a team is a customer paid in credits.

**The numbers are defaults I chose, because the doc gives none.** They are constants in `lib/referral-credits.ts`, so changing one is a deploy and never a migration: the inviting team earns **100 credits** on the invited team's **first payment**, **up to 20 times**. The invited team gets no bonus. Challenge these before the flag goes on.

### Things worth knowing before editing this

1. **It pays on the first PAYMENT, not on signup, and that is the whole anti-abuse design.** A signup costs nothing to fake with a throwaway email; a payment does, and a paying team has covered the reward many times over (100 credits cost a few cents; the cheapest plan is ₦5,000 a year). The cap of 20 limits the damage if something is gamed anyway. A signup-time reward would be a credit-farming machine.
2. **One link, two kinds of code.** A partner's code is looked up first, then a team's personal code, so both share `?ref=` without ambiguity. The namespace is kept disjoint from both sides: a partner cannot be created with a code a team holds (`create_partner` checks `referral_codes`), and a personal code is regenerated if a partner holds it.
3. **A team is tagged once, ever, across BOTH tables** (`team_referrals` and `user_referrals`). It cannot be a partner's referral and a team's too, so one payment can never earn commission and credits for different people. A team cannot use its own code (`own_code`). The new-team (14 days), no-invitee and fail-closed rules are the partner ones, shared through `decideAttach`.
4. **The reward is written to the ledger BEFORE the row is marked paid.** The other order could mark a reward paid and then fail to pay it; this order can at worst leave a paid reward unmarked, and the ledger key `referral:<invited team>` stops a second payment. A test pins the order. A false return from the grant is either a real failure or "already paid"; either way nothing more happens that time.
5. **It rides the existing credits ledger and adds no new kind.** The credit is an `adjust` row in the top-up pool with `metadata.source = 'referral'`, so it never expires, is never taken back by the trial rule, and does not count as a purchase (`hasEverPurchased` looks for kind `topup`, not `adjust`). `adjustCredits` gained an optional `source` that defaults to `'admin'`, so every existing caller is unchanged, and the history shows it as "Reward for inviting a team".
6. **A credit-only team can earn credits and use them.** Top-up-pool credits count as funded for the Solo-features rule, so a lapsed team that earns referral credits keeps working while they last. Intended: credits are credits.
7. **Called from the webhook's first-charge path and from admin "Mark paid", and nowhere else.** Never on a renewal or a plan-change top-up, so only a first payment pays. A test lists the three files allowed to call it. A team that was tagged AFTER its first payment (for example by hand) is not rewarded retroactively.
8. **SUPERSEDED 2026-10-03: a refund now takes the reward back.** This item said the inviting team keeps its 100 credits when an invited team is refunded, because nothing detected subscription refunds. The webhook now handles `refund.processed`; see "Refunds take the reward back" below.
9. **The Settings section draws nothing unless it has something true to say.** `components/settings/ReferralInviteSection.tsx` sits at the bottom of Settings → Team (managers only). Both flags off, a person who does not own a team (the code belongs to the owner's team), or a failed load all render nothing. `GET /api/referrals/mine` creates the team's code on first view, finds the team from the signed-in user and never from the request, and is an open route (no paywall) because a walled team is exactly one that might want the credits.
10. **Both new tables have row level security and no policies.** Every read and write is a service-role route. A structural test lists the only file allowed to touch each.

### The inviter is told when they earn credits (2026-10-03)

When a reward is paid, `rewardReferrerOnFirstPayment` calls `notifyReferrerOfReward` (`lib/referrals-server.ts`): a push and an email to the inviting team's owner, both every time (the credits-submitted precedent). The email is the `referral_reward` template (transactional, so it always sends); the push copy is `buildReferralRewardPush` in `lib/referral-credits.ts`. Both link to `/dashboard/credits`.

1. **Told once.** It runs only when THIS call paid the reward: a redelivery stops at `decideReward` (already rewarded) or at the ledger key refusing a second row, so the owner is never told twice. A test covers the awkward case, credits paid earlier but the row never stamped.
2. **Names no one.** The invited team did not agree to be named, so both say "a team you invited". The push tag is per invited team, so two rewards earned minutes apart stack instead of the second replacing the first.
3. **Never throws and never fails the payment.** The push and the email run side by side and each catches its own failure; the reward is already paid and nothing here is worth failing a webhook over. Not the in-app bell (task-scoped, desktop-only).
4. **Not told when it is taken back.** A refund that reverses a reward writes the history line "Invite reward taken back" but sends nothing. Add one if wanted.

Verified: 8 tests drive the real reward path with push and email mocked, and 7 deliberate breaks were each caught by a named test. Not verified: nothing has been delivered to a real inbox or phone.

### Refunds take the reward back (2026-10-03)

When the payment that earned a reward is refunded in full, the reward comes back. The Paystack webhook's `refund.processed` branch (the one `handlePitchRefund` already owned) calls `handleRefundForReferrals` (`lib/referrals-server.ts`) first, and a pitch refund, which names no recorded charge, finds nothing and carries on as before. Migration `20261003120000_referral_reward_reversal.sql` adds `reversed_at` and `reversed_credits` to `user_referrals`; **apply it before this ships**, because the Settings stats and the reward cap both select `reversed_at`.

1. **Only a FULL refund of the FIRST recorded payment reverses it** (`decideClawback`, pure). A refunded renewal does not, because the reward was for the first payment. A partial refund does not, so a goodwill refund never costs an inviter the credits they were promised.
2. **It takes back what the inviter still HAS, never more, and never below zero.** If they already spent the reward, only what is left of their top-up pool comes back; `reversed_credits` records what was actually taken and a warning logs the shortfall. A balance that cannot be read takes nothing and logs an error: the credit is easy to take by hand with a negative adjustment, and a wrong guess would take credits from somebody who did nothing wrong.
3. **`rewarded_at` stays set.** A reversed reward no longer counts as earned or against the cap of 20 (stats and the cap count both skip rows with `reversed_at`), but the same invited team can never be rewarded a second time by paying again.
4. **One ledger key, `referral-clawback:<invited team>`**, apart from the reward's key, so a redelivered refund cannot take credits twice. The history shows "Invite reward taken back".
5. **The same refund also stops that payment earning partner commission.** Any full refund of a recorded charge (first or later) sets the exclusion the admin could set by hand on the partner statement, with the reason "Refunded in Paystack". "Restore" there undoes it. This closes the strategy doc's "no commission on refunds" for refunds done in the Paystack dashboard, which the statement page used to say nothing detects.
6. **Not behind the two switches**, on purpose: a reward already paid has to be recoverable even if the feature is switched off later. With the switches never on there are no recorded charges, so it finds nothing.
7. **Not covered:** a refund of a payment recorded before the referral ledger existed (nothing to match), a chargeback that Paystack reports as a different event, and a refund made outside Paystack. Take those back by hand.

Verified: 13 deliberate breaks, each caught by a named test (no clamp, partial refunds counted, any charge counting as first, a reversed reward reversed again, stats and cap counting reversed rewards, commission not stopped, clawback skipped, an unreadable balance guessed, the reversal not recorded, the clawback put behind a switch, the webhook ignoring refunds, the history label). Not verified: nothing has run against a real database or a delivered `refund.processed` webhook, and the migration is unapplied.

### Verified

6,190 tests passing, none failing (about 30 new in `lib/referral-credits.test.ts`, covering the reward rules, code generation, the history label and structural guards on the reward path). Type-check clean apart from the 8 documented `confirmed-action.test.ts` errors. Lint clean on every touched file. **Eight deliberate breaks, each caught by a named test:** the cap off by one, paying a team twice, paying a team nobody invited, letting a team use its own code, marking before granting, dropping the ledger key, ignoring the credits switch, and labelling every credit a referral.

### Not verified

Nothing has run against a real database, a delivered webhook or a real signup. The migration is unapplied. No code has been created, no team tagged, no reward paid. The Settings section has never rendered with a real account. The defaults above are untested against any real behaviour of the people they are meant to move.

### Not built

A bonus for the invited team.

### Activation

1. Apply `20261002210000_referral_credits.sql` (and `20261002200000_referrals.sql` first if it is not in yet).
2. Decide the numbers in `lib/referral-credits.ts`, or keep the defaults.
3. Set `NEXT_PUBLIC_FEATURE_REFERRAL_CREDITS=true` (and `NEXT_PUBLIC_FEATURE_REFERRALS=true`) on the Vercel `Web` project (Production), with a deploy that rebuilds `apps/web`.
4. Open Settings → Team, copy the link, sign up through it with a throwaway email, and confirm the invited count goes up. After a real first payment, confirm 100 credits appear in the credit history.
5. Changelog entry and version bump at the flip, not at merge: this one IS worth announcing to customers ("Invite another team and earn credits").
