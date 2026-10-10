# Admin dashboard roadmap

The plan for `/admin`, so it helps the company make the right call every week.
Started 2026-10-09 (iteration 1 of the overnight admin loop). Every later
iteration reads this file first, ships the top item under **Next** as one small
PR, then moves it to **Done** and re-orders what is left.

`docs/strategy/company-strategy.md` outranks this file. Where it defines a
metric (sections 2, 6, 7, 8 and 11), the code uses its definition and this file
only decides where and how the number is shown.

---

## 1. What successful companies track, and what matters at our stage

Distilled from the sources below, then filtered for a company with a handful of
paying teams, Nigeria-first, selling to music managers and small labels.

1. **One number, measured every week, as a rate.** YC measures growth per week;
   5 to 7% a week is good, 10% is exceptional, and 1% means the startup "hasn't
   yet figured out what it's doing". Revenue is the best thing to measure;
   before revenue, active users. "We get 100 new customers a month" is not a
   rate. (Paul Graham, *Startup = Growth*,
   https://www.ycombinator.com/library/8s-startup-growth)
2. **Pick one or two key metrics early and judge every task by them.**
   (YC's essential startup advice,
   https://www.ycombinator.com/library/4D-yc-s-essential-startup-advice). For
   us the strategy doc already chose: weekly active paying teams, and the
   second-release rate.
3. **Be precise about "active", and do not chart cumulative totals.**
   Cumulative charts go up even when a business shrinks; investors want new
   customers per period, cohort retention, and gross vs net churn. Measure
   growth as a compounded rate (CMGR), not an average of rates.
   (a16z, *16 Startup Metrics*, https://a16z.com/16-startup-metrics/)
4. **Retention is the proof of product-market fit.** Six-month logo retention
   for SMB/mid-market SaaS: about 60% is good, 80% great; net revenue retention
   about 90% good, 110% great for land-and-expand SMB. Early startups rarely hit
   these at first; use them to choose between fixing retention and buying
   growth. (Lenny Rachitsky, *What is good retention*,
   https://www.lennysnewsletter.com/p/what-is-good-retention-issue-29). Monthly
   logo churn for B2B SMB: 2.5 to 5% is good, under 1.5% great
   (https://www.lennysnewsletter.com/p/monthly-churn-benchmarks).
5. **Know whether you are default alive.** "Assuming expenses stay constant and
   revenue growth is what it has been, do we make it to profitability on the
   money we have left?" Half of founders do not know. (Paul Graham, *Default
   Alive or Default Dead*, https://www.ycombinator.com/library/95-default-alive-or-default-dead)
6. **PMF signals worth adding later:** the Sean Ellis survey (40%+ "very
   disappointed" without the product), and, for B2B, "3 to 10 paying customers
   who stay" as the first real sign (Lenny, *Finding product-market fit in B2B*,
   https://www.lennysnewsletter.com/p/finding-product-market-fit).

**What that means for Urganize right now:** usage follows release cycles, so
weekly is the right clock (the strategy doc says the same). With the North Star
near zero, a week-over-week percentage on it is noise; the cockpit therefore
shows the North Star's plain change, and puts the YC growth rate on the number
that moves first: weekly active teams, paid or not. Revenue-quality metrics
(NRR, LTV, CAC) need more paying teams and a known acquisition cost before they
mean anything; they are on the list, not at the top.

---

## 2. North Star for this stage

**Weekly active paying teams**: teams on Manager, Label or Group where 2 or more
members did something in Urganize in the last 7 days. This is the strategy
doc's own North Star (section 2), so it is not re-chosen here. Why it is right:
it needs payment (money), a team (the manager plus at least one person, which is
who we sell to) and weekly work (retention), so it cannot be gamed by sign-ups.

**Leading indicator shown beside it:** weekly active teams, paid or not, with
its 4-week compounded weekly growth judged against YC's 5% / 10% bars. It is the
same rule without the payment filter, so it moves weeks before the North Star
does.

---

## 3. The top of /admin (the founder cockpit)

| # | Metric | Definition (short) | Data | Status |
|---|---|---|---|---|
| 1 | North Star | Weekly active paying teams, this week vs last | `lib/scoreboard.ts` rules over the 18 activity tables | **Shipped** (iteration 1) |
| 2 | Weekly active teams + weekly growth % | Same rule, any team; 4-week CMGR vs YC bars | Same | **Shipped** |
| 3 | 8-week trend | Weekly active teams per rolling 7 days | Same (120-day activity read) | **Shipped** |
| 4 | Activation | Rollout + teammate invite within 3 days of sign-up, last 30 days | `activationSummary` | **Shipped** |
| 5 | Time to first rollout | Median days, sign-up to first real rollout, last 90 days | `profiles.created_at`, `releases.created_at` | **Shipped** |
| 6 | Week 4 retention | Newest 4 complete weekly cohorts, pooled | `weekFourRetention` | **Shipped** |
| 7 | Paying teams + MRR | Doc section 2 | `subscriptions` | **Shipped** |
| 8 | Needs a message | Paying teams under 2 active people; teams that went quiet this week; each with owner name + email, the lifecycle stage it stalled at (doc section 6) and its owner, and a "Draft in Emails" link (the admin composer, prefilled) with a mailto beside it | Board rows + activity; owner `profiles.name`/`email` | **Shipped** (contacts and stage: iteration 4; Draft in Emails: iteration 5) |
| 9 | Runway / default alive | Cash ÷ (monthly spend − MRR); default alive = MRR at its own 4-week compounded weekly rate passes spend before cash runs out (Paul Graham) | Founder types cash, monthly spend, as-of date and currency (NGN/USD + Naira per dollar) on the cockpit; kept in `app_settings` key `founder_runway` (service role only, no migration) | **Shipped** (iteration 6) |
| 10 | Second-release rate + rollouts live this week | Doc section 7 (bar 60%); rollouts whose `releaseLiveAt` falls in the last 7 days | `secondReleaseSummary`, `releaseLiveAt` | **Shipped** (iteration 3) |
| 11 | Funnel: waitlist → account → first rollout → activated → trial over → paid | Teams that signed up in the last 30 or 90 days (past their first 3 days), how far each got | Supabase via `ScoreboardInput`; waitlist from Neon `"User"`, matched to team owners by email | **Shipped** (iteration 2). Waitlist shows "Not tracked" where `DATABASE_URL` is unset |
| 12 | UrgAns use + credits + AI cost | Share of weekly active paying teams that used UrgAns inside a rollout this week (seed bar: half; every usage-log feature counts, status updates and task outcome replies included since iteration 6 because they cost AI tokens); credits spent per week (spends minus refunds, 8 weeks) and per active team; AI cost this week per active team | `ai_usage_events` (cost + release + feature), `credit_ledger` spend/refund rows | **Shipped** (iteration 3). Cost per active team falls back to the ledger's `provider_cost_rodi`; "Not tracked" when neither reads |
| 13 | Logo churn + gross MRR churn; NRR | Paying teams lost per calendar month out of those paying at its start; MRR of subscriptions that stopped out of start-of-month MRR; 3 full months + this month so far | `subscriptions.started_at` → last paid day (`expires_at` once passed), today's price; a renewing subscription (active / past_due) keeps counting as paying for Paystack's 3 retry days after its last paid day | **Shipped** (iteration 5; renewal grace iteration 6). Net MRR churn and NRR show "Not tracked": a plan change overwrites the price, so upgrades and downgrades are not stored |

Rules every number on the cockpit follows: our own team's accounts left out
(the `/admin/metrics` list, applied to the Scoreboard as well, since iteration
6), one definition (the Scoreboard's),
a definition behind an info icon, empty data shown as "No data yet" or "Not
tracked" and never as a made-up zero or percentage, and growth from zero has no
percentage.

---

## 4. Audit of the hub as of 2026-10-09 (iteration 1)

**What exists and is good:**
- `/admin/scoreboard`: the strategy doc's scoreboard, built live (NS, MRR,
  second-release rate, week-4 retention, active teams 30d, trial to paid,
  activation, referred sign-ups, per-team table, a copyable Friday post). Pure,
  tested rules in `lib/scoreboard.ts`, reads in `lib/scoreboard-server.ts`.
- `/admin/metrics`: online now, daily/weekly/monthly active people, device
  split, rollouts per week and how plans were made, work done, between
  releases, gone quiet, AI cost. Wider "active" rule than the Scoreboard on
  purpose.
- `/admin/growth`: new accounts per month (Supabase) and the waitlist per week
  (Neon). `/admin/onboarding`: what sign-ups pick in the setup wizard.
- Operations pages: Teams (extend, comp, mark paid), Referrals, Waitlist
  (contact pipeline), Interviews, Emails, Notifications, Playlist owners, Pitch
  payments, Reports, UrgAns actions, Directory, Chappi.

**What was missing (before iteration 1):**
- The hub landing was only a grid of links: no number on the page the founder
  opens first.
- No trend anywhere for the North Star or weekly active teams, so "did we move
  this week" needed two visits a week apart.
- No weekly growth rate (YC's one number), no time-to-value, no pooled
  retention, no list of teams to message (the strategy doc says a stalled team
  gets a message within 3 days).
- No runway or default-alive figure (no data in the app).

**Noise / clean-up candidates:**
- ~~The hub's link grid lists 11 of the 17 sections in the side menu.~~ Fixed
  in iteration 4: grouped into Numbers / Operations / Content, all listed.
- Three different "active" rules (Scoreboard: did something; Metrics: also
  opened the app or signed in; Growth: accounts). Each is labelled on its own
  page; the cockpit uses only the Scoreboard's.
- ~~The Scoreboard and the cockpit read the same rows separately on each visit
  (about the same cost twice if both are opened).~~ Fixed in iteration 5: one
  shared read, reused for a minute (`lib/scoreboard-cache-server.ts`).

---

## 5. Done

- **Iteration 1 (2026-10-09): the founder cockpit at the top of /admin.**
  `lib/founder-cockpit.ts` (pure, tested) adds time to the Scoreboard's own
  input: this week vs last for the North Star and weekly active teams, 4-week
  compounded weekly growth with a YC verdict, an 8-week trend, time to first
  rollout, pooled week-4 retention, and the "needs a message" list. Served by
  `GET /api/admin/cockpit` (verifyAdmin, read-only, no migration), shown by
  `components/admin/FounderCockpitView.tsx` above the dashboard links in
  `AdminHubClient`. Runway is shown as "Not tracked".

- **Iteration 2 (2026-10-09): the sign-up funnel on the cockpit.**
  `lib/admin-funnel.ts` (pure, tested) follows the teams whose owner signed up
  in the last 30 or 90 days and whose first 3 days are over (the Activation
  rule's cohort, so the 30-day Activated step equals the Scoreboard's
  Activation exactly), through first rollout, activated, trial over and paid.
  Each step is counted on its own, so a team that paid without inviting anyone
  still shows under Paid; the line under each step is the share of the step
  before that also got there (never over 100%). "Trial over" replaces "started
  a trial" because every new team is given the 3-day trial automatically, so a
  trial-start step would just repeat the account count. Paid is the
  Scoreboard's trial-to-paid rule. The waitlist is read from the marketing
  site's Neon `"User"` table in the same route and matched to team owners by
  email (emails never leave the server); it reads "Not tracked" when
  `DATABASE_URL` is unset or the read fails. `isActivatedTeam` was pulled out
  of `activationSummary` in `lib/scoreboard.ts` so both ask the same question.
  Shown by `components/admin/FunnelStrip.tsx` (30 / 90 day toggle, one column
  at phone width, five across from `md`).

- **Iteration 3 (2026-10-09): UrgAns and releases on the cockpit.**
  `lib/admin-urgans-usage.ts` (pure, tested) adds a panel under the funnel:
  the share of this week's weekly active paying teams (the North Star teams)
  where someone used UrgAns inside a rollout in the last 7 days, against the
  strategy doc's seed bar of half, with last week beside it and "used UrgAns at
  all" as a fact; credits spent per week for 8 weeks (spends minus refunds;
  grants and allowances are not spending) and per weekly active team; AI cost
  this week per weekly active team, in dollars at `RODI_PER_USD`, from the
  usage log or the ledger's provider cost; rollouts that went live this week
  vs last (the `releaseLiveAt` rule); and the Scoreboard's second-release rate
  with its waiting count. "Inside a rollout" = a usage-log call with a
  `release_id` for a feature a person asks for (chat, plan, press kit, pitch
  kit, Spotify pitch); status updates and task outcome replies are left out.
  Reads: `lib/admin-urgans-usage-server.ts` (two read-only selects, run in
  parallel inside `GET /api/admin/cockpit`), added to the ledger and usage-log
  guard tests' reader lists. Shown by `components/admin/UrgansPanel.tsx`.

- **Iteration 4 (2026-10-09): who to write to, and every dashboard grouped.**
  One combined PR (Vercel's daily deploy cap was hit, so items were batched).
  (a) Each "Needs a message" team now shows the owner's name and email, the
  first stage of the strategy doc's customer lifecycle (section 6) it has not
  finished, who owns that stage, what is missing, and an "Email <name>" mailto
  link that opens a short stage-specific draft in the founder's own mail app.
  Nothing is sent from Urganize. A mailto, not a "draft in Emails" link,
  because `/admin/emails/new` takes no prefilled recipient or text today. The
  stage rule is pure and tested in `lib/admin-message-list.ts` (Activate:
  real rollout + a teammate, then Convert: paying, First release: live, Second
  release: started within 90 days, else Expand); `lib/founder-cockpit.ts`
  stamps it on each listed team and the route fills in `profiles.name` and
  `email` for those teams only (`attachOwnerContacts`; the name joins the
  profiles select the Scoreboard already runs, no new query). (b) "All
  dashboards" is now grouped into Numbers / Operations / Content and lists
  every side-menu section once (16, up from 11), with one short line each
  (`lib/admin-sections.ts`; `lib/admin-sections.test.ts` reads
  `AdminNav.tsx` and fails if the two drift). (c) Review pass: the cockpit is
  ordered by importance (North Star pair, its 8-week trend, the stage tiles,
  Needs a message, then the funnel and the UrgAns panel), and the hub's title
  reads "Overview" like its menu row, with the grey intro paragraph moved
  behind an info icon (house rule).

- **Iteration 5 (2026-10-10): churn, Draft in Emails, one read.**
  One combined PR again (Vercel's deploy cap). (a) **Churn and revenue kept**
  on the cockpit, under Needs a message (`lib/admin-churn.ts`, pure, tested;
  words in `lib/admin-churn-format.ts`; shown by
  `components/admin/ChurnPanel.tsx`). What is stored decides what is shown:
  one subscriptions row per account, overwritten, so each subscription gives
  one stretch of paying from `started_at` (set by the first charge and by Mark
  paid, never by renewals) to its last paid day once that has passed. Logo
  churn = paying teams (the Scoreboard's rule: not Solo, not comped, not
  allowlisted) lost in a calendar month / paying at its start; gross MRR churn
  = MRR of subscriptions that stopped in the month / MRR at its start (Solo
  included, as in MRR). Three full months and this month so far, with Lenny's
  bars (logo churn 2.5 to 5% good, under 1.5% great; NRR about 90% good, 110%
  great) behind the info icons. **Net MRR churn and NRR are "Not tracked"**:
  a plan change overwrites the price, so upgrades and downgrades are not kept.
  Lost counts are "at least" (a team that stopped and came back was
  overwritten), start-of-month MRR uses today's price, and paid rows with no
  `started_at` (or stopped early with no date) are counted as left out, never
  guessed. `profiles.paid_at` was NOT used as the start: the renewal webhook
  rewrites it on every charge, so it is the latest payment, not the first.
  No new query: `started_at` joins the subscriptions select the Scoreboard
  already runs. (b) **Draft in Emails.** `/admin/emails/new` reads
  `?to=&subject=&body=` (`lib/email/compose-prefill.ts`: one plain address or
  none, subject and body cut to the composer's limits and stripped of control
  characters, shown only as input values) under a Suspense boundary, so the
  route is still built static. It opens aimed at that one person with a "draft
  filled in, nothing is sent until you press Send" note; Send keeps its
  confirm and every backing route keeps its ADMIN_EMAILS check. The cockpit's
  Needs a message rows now lead with "Draft in Emails to <name>"; the mailto
  stays as "Or use my mail app". The composer adds "Hi <name>," itself, so
  the prefilled body is the stage opener alone. (c) **One read for both
  pages.** `GET /api/admin/cockpit` and `GET /api/admin/scoreboard` share
  `scoreboardReadCache` (`lib/scoreboard-cache-server.ts`): a read made in the
  last 60 seconds is reused and two requests in flight share one read; a failed
  read is never kept; the Scoreboard's Refresh asks `?fresh=1`. A test builds
  every number both pages send from a fresh read and from the cache (twice)
  and requires them identical. The cache lives in one server instance's
  memory, so it only helps when both requests reach the same warm instance.
  (d) **Stage owners in one place.** `LIFECYCLE_STAGES` in
  `lib/admin-message-list.ts` holds all eight stages and owners; `STAGE_INFO`
  reads from it, and a test reads the strategy doc's section 6 table and fails
  if a label or owner drifts.

- **Iteration 6 (2026-10-10): the founder's answers.** One PR. (a) **Our own
  accounts left out** of the cockpit AND the Scoreboard: `internalAccountEmails()`
  (moved from `/api/admin/metrics` into `app/api/admin/_shared.ts`, ADMIN_EMAILS
  + METRICS_INTERNAL_EMAILS, so all three pages read one list), applied by the
  pure `withoutInternalAccounts` (`lib/admin-internal-accounts.ts`): a team one
  of us owns goes with its releases and referrals; our people's activity, their
  memberships of other teams and their own subscriptions go too. Emails come
  from the profiles the shared read already loads (`extras.emailByUserId`, no
  new query). The cached rows are never changed. UrgAns usage and ledger rows
  and waitlist entries that are ours are dropped in the cockpit route. `?team=1`
  puts us back on either route, like `/admin/metrics`. A test builds the
  cockpit and the Scoreboard from the left-out input and requires them equal.
  (b) **Runway and default alive** (`lib/admin-runway.ts`, words in
  `lib/admin-runway-format.ts`, panel `components/admin/RunwayPanel.tsx`): the
  founder types cash, monthly spend, the day the cash was true, the currency
  (NGN or USD) and Naira per dollar (required with dollars, optional with
  Naira to show both). Billing is Naira only, so MRR is in kobo and is turned
  into dollars at the typed rate. Runway = cash ÷ (spend − MRR) from the as-of
  day; "not burning" when MRR covers spend. Default alive projects week by week
  with spend constant and MRR growing at its own compounded rate over 4 weeks,
  rebuilt from each subscription's `started_at` to last paid day (past MRR is
  not stored); no MRR 4 weeks ago means no rate, and the projection assumes it
  stays flat and says so. Looked at for 10 years. Figures older than 45 days are
  flagged. Stored in `app_settings` (key `founder_runway`; RLS on with no
  policies, the table's documented home for service-role-only settings, so **no
  migration**), through `GET/PUT/DELETE /api/admin/runway` (verifyAdmin on every
  method, every field checked). (c) **Renewal grace in churn**: an active or
  past_due subscription whose last paid day passed less than
  `PAYSTACK_RETRY_GRACE_DAYS` (3) ago still counts as paying; after that it is
  lost on its last paid day as before. Cancelled gets no grace. (d) **UrgAns
  share** counts status updates and task outcome replies: both charge no credits,
  but both are model calls written to `ai_usage_events` with their provider
  cost, so by the founder's rule ("only if they cost AI tokens or credits") they
  count. `URGANS_CHOSEN_FEATURES` is now every `AI_USAGE_FEATURES` entry; a guard
  test reads both routes and fails if either stops logging its call.

## 6. Next (ordered; one PR each)

1. **Net revenue retention, properly.** Needs a record of each plan change
   with its old and new price (a `billing_events` row written on every
   upgrade, downgrade and Mark paid, no migration: `type` is free text), and
   then a month or two of history before the number means anything. **Waiting
   on the founder's yes** (not approved on 2026-10-10). Until then NRR stays
   "Not tracked".
2. **Last week's message list.** Whether each stalled team got its message
   within 3 days needs a record of messages sent. Drafts now go through the
   Emails tool (iteration 5), so its log can answer it: match each listed
   team's owner email to admin emails sent in the 3 days after it was listed.
3. **Sean Ellis survey count.** Only if the founder runs the survey in-app or
   in a form we can read; otherwise leave it off.

## 7. Open questions for the founder

- Should we start logging every plan change (old price, new price) so net
  revenue retention can be worked out from next month on? It is a small
  write in the billing routes, not a migration, but it touches billing code,
  so it waits for a yes. **Asked again 2026-10-10: not approved yet.**

## 8. Answers from the founder (2026-10-10)

1. **Leave our own team's accounts out of the cockpit?** Yes, using the same
   exclusion `/admin/metrics` already uses. Done in iteration 6, on the
   Scoreboard too so the two pages still agree.
2. **Where do cash and monthly spend live?** Entered by hand in the admin.
   Done in iteration 6: a form on the cockpit, kept in `app_settings`, with
   runway and default alive worked out from it.
3. **Log plan changes for NRR?** Not approved yet; not built.
4. **Grace for a failed renewal before it counts as churn?** Yes, Paystack's
   ~3-day retry window. Done in iteration 6.
5. **Count status updates and task outcome replies as using UrgAns?** Only if
   they cost AI tokens or credits. They charge no credits but are logged model
   calls with a provider cost, so they now count (iteration 6).
