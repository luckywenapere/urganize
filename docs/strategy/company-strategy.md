# Urganize Company Strategy & Operating System

2026-10-01 · Oyin Wenapere

> **About this copy.** This is a word-for-word copy of the founder's document
> "Urganize Company Strategy & Operating System" (dated 2026-10-01), put in the
> repo on 2026-10-02 so coding sessions can read it. The founder's document is
> the original. If the two ever differ, the founder's document wins, and this
> file should be refreshed from it rather than edited on its own. Only the
> layout was changed (headings and tables rebuilt as markdown).

## How to use this doc

This is the one source of truth for what Urganize is, where it is going and how the company runs. If another page disagrees with this one, this one wins until it is changed here.

The strategy phase is closed. Execution and measurement are the default. New ideas get judged against this doc, not used to reopen it.

The loop is: strategy, build, distribute, measure, learn, adjust.

Owner: Oyin. Changes are agreed at the Monday review and logged in the Major Decisions Archive.

Detail lives elsewhere: Product Build Direction, Architecture, GTM Strategy, Financial Model. This page links out, it doesn't repeat them.

Labels used below: Current state (true today), Committed (decided), Rule (how we operate), Future (direction, not yet built or funded).

## 1. Company strategy

Urganize is the team app for music releases. Once the music is made, everyone on the team comes here to do everything after that. One-line version: Urganize is where music teams do everything after the music is made. "Interaction app" is how we describe it internally, and it stays out of copy.

### Who we sell to (Committed)

First: artist managers running more than one artist, small management teams and small labels. They coordinate the most people and feel the most pain.

Second: independent artists.

Rule: sell to the manager, serve the artist, speak to the ecosystem (distributors, curators, producers, directors, designers, DJs).

What we replace: WhatsApp, spreadsheets and memory. Releases live across all three today.

Where we play: Nigeria first, then Africa and the diaspora. Priced in naira and paid for locally.

### Where it's going (Future)

- Release operating system: plans, tasks, files, metadata, pitching, shows, distribution, team chat.
- Music business operating system: the seven product areas below, filled out, plus financials that carry over between releases.
- UrgAns grows from chat into an agent that watches the business, flags what matters and does the work.
- The money follows the release: subscriptions bring teams in, distribution brings releases in, and the take rate comes from placements, bookings and hiring. Advances against catalog come later.

Current state: alpha internally. The user group keeps the Beta Users name. Product-market fit, paid retention and recurring revenue are not proven yet, so the job now is proving that teams come back and pay.

### Product structure (Committed, set Oct 1, 2026)

Seven areas, one connected system. Each gives teams a reason to come back between releases.

| Area | What it answers |
|---|---|
| Home | What needs my attention now? |
| Catalogue | What music exists? Artists, then their releases, then each release's record and workspace |
| Relationships (CRM) | Who do I work with? |
| Opportunities | What can I pursue? Deals, grants, sync, brands and partnerships |
| UrgAns | What can AI help me understand or do? It runs across every area |
| Audience | Who are the fans and what is the data saying? Fan capture, streaming and social analytics |
| Shows | What is happening in the live business? |

Inside a release: its own overview, metadata, credits, assets, notes, playlist pitching, pitch generation and the release workspace (timeline, tasks, owners, collaborators, recap).

EPK: one standing EPK per artist in Catalogue, updated over time. Each release pulls it in and adds its own details for that release's pitch. UrgAns powers the generation.

UrgAns has an entry point on every screen. Settings sits outside the seven.

## 2. North Star and scoreboard

The North Star is weekly active paying teams. It is 0 today: 8 teams are active, none are on a live subscription. Every other number on the scoreboard exists to move this one.

| Metric | What counts | Owner | Oct 1, 2026 |
|---|---|---|---|
| Weekly active paying teams | See section 7 | Oyin | 0 |
| MRR | Subscriptions only, yearly plans at price ÷ 12 | Oyin | ₦0 |
| Second-release rate | See section 7 | Chidera | Not measured yet |
| Week 4 retention | See section 7 | Chidera | Not measured yet |
| Active teams, paid or not | Teams using Urganize this month | Chidera | 8, managing 10 artists |
| Users | PostHog identified users | KB | 83 |
| Users who created a release, last 30 days | PostHog | Chidera | 19 (9 through onboarding) |
| Users who invited a teammate | PostHog, all time | Chidera | 8 |
| Trial to paid | Share of 3-day trials that convert | Oyin | Not measured yet |
| Conversations started | Per week, against KB's weekly target | KB | Weekly report |
| Referred signups | Signups from a user's invite | KB | Starts with referral credits |

Rule: KB posts the numbers to the team group every Friday. The Monday review starts with this table.

## 3. Operating cadence

The company runs on one weekly review, two-week product sprints and a monthly check on roadmap and money.

| Rhythm | When | Owner | What happens |
|---|---|---|---|
| Weekly company review | Monday, 3 PM | Oyin | Scoreboard first, then last week's commitments, blockers, and decisions to log |
| Friday numbers | Friday | KB | Scoreboard numbers posted to the team group |
| Product sprint | Every 2 weeks, starting the Monday of the review | Chidera runs it, Oyin sets scope | Plan on day one, demo what was delivered on the last day |
| Roadmap review | First Monday of the month, after the weekly review | Oyin, with Tedum and Chidera | What comes next, what gets cut, judged against the scoreboard |
| Financial review | First Monday of the month | Oyin | MRR, cash, burn, runway, credits and distribution revenue |
| Strategy check | First Monday of Jan, Apr, Jul and Oct | Oyin | This doc against the numbers. Changes go through the decisions archive |

Rule: if it isn't on the scoreboard or in a sprint, it isn't committed.

## 4. Decision-making authority

Oyin makes the final call on anything hard to reverse. Everyone else decides inside their own area and tells the team.

| Decision | Decides | Consulted |
|---|---|---|
| Strategy, positioning, ICP | Oyin | Tedum |
| Pricing and packaging | Oyin | Tedum, Chidera |
| Product direction and roadmap | Oyin | Tedum, Chidera |
| Sprint scope | Oyin | Chidera |
| Task order inside a sprint | Chidera | Oyin |
| AI architecture, models and providers | Tedum | Oyin |
| Hiring, roles, equity and pay | Oyin | Tedum |
| Budget and spending | Oyin | |
| Partnerships and contracts | Oyin | Tedum |
| Growth strategy and channels | Oyin | KB |
| Content, community and Famously Notorious interviews | KB (inside the growth strategy) | Oyin |
| Closing a sale | Oyin | KB |

Rules

- Reversible calls (copy, content, experiments, task order): the owner decides and posts it in the team group.
- Hard-to-reverse calls (pricing, positioning, equity, hires, contracts, architecture): Oyin decides at the Monday review or in writing.
- Logging: every hard-to-reverse call goes into the Major Decisions Archive the same day, with the date, the decision, the reason and the owner.
- Once it's decided: disagree in the room, then commit. Reopening a decision needs new numbers, not a new opinion.

## 5. GTM and sales

Urganize sells through founder-led sales to a named list of 100 to 150 music executives. Community and content start the conversations. Oyin owns growth strategy and KB owns execution.

### Sales split

- Oyin: owns sales. Runs the calls, closes, and sets the price on anything custom.
- KB: part of sales. Starts conversations, books calls, and follows up every trial until it converts or drops.

### Channels

| Channel | What it does | Owner | Status |
|---|---|---|---|
| Famously Notorious | Interview an artist first as the value exchange, then pitch their manager within two weeks. Subjects are picked so they can become paying teams | KB | Not started. In the plan |
| Community | WhatsApp, Instagram, X, TikTok, Facebook, YouTube, Threads, LinkedIn | KB | Running |
| Dear Creative | Oyin's personal series on Threads | Oyin | Running |
| Product demos | Short motion videos of the app in use | Michael | Running |
| Referral credits | Credits for users who invite another team | KB | Next experiment |
| Sound Wave Spotlight | Free Urganize for exposure and artist outreach, plus a referral commission on paying users | Oyin | MOU signed Sep 28, 2026. Terms in section 10 |
| Soundscape | Urganize sponsors one release; Soundscape runs the promo; the release runs in Urganize as a case study | Oyin | Paused |

Rules

- Show the product working. Skip abstract claims.
- Every channel reports into the scoreboard. A channel that produces no paying teams in a quarter gets cut or changed at the strategy check.

## 6. Customer lifecycle

A customer moves through eight stages, and each stage has one owner. The stage that matters most right now is the second release, because that is where retention is proven or lost.

| Stage | Done when | Owner | Measured by |
|---|---|---|---|
| 1. Reach | They hear about Urganize through Famously Notorious, Dear Creative, community, a partner or a referral | KB | Conversations started |
| 2. Sign up | They create an account | KB | Users |
| 3. Activate | They create a first release and invite a teammate within 3 days | Chidera | Activation rate |
| 4. Convert | They pay before the 3-day trial ends | Oyin (KB follows up) | Trial to paid |
| 5. First release | The rollout runs in Urganize and the release goes live | Chidera | Releases live |
| 6. Second release | They start a second release within 90 days of the first going live | Chidera | Second-release rate |
| 7. Expand | They add artists, move to Label, buy credits or order distribution | Oyin | Expansion MRR |
| 8. Refer | They invite another team | KB | Referred signups |

A team that stalls at any stage gets a direct message from that stage's owner within 3 days.

## 7. Product and retention metrics

Retention is proven by the second release, not by daily use. Usage follows release cycles, so the measures below are weekly and per release.

- Paying team: a current subscription on Manager, Label or Group. Solo subscribers add MRR but don't count as teams. Credits-only users don't count as teams either.
- Weekly active paying team: a paying team where 2 or more members did something in Urganize in the last 7 days, such as updating a task, sending a chat message, adding a file or editing a release.
- Activation: a first release created and a teammate invited within 3 days of signing up, inside the trial.
- Second-release rate (set Oct 1, 2026): the share of paying teams that start a second release within 90 days of their first release going live. It is counted only for teams whose first release went live at least 90 days ago. The bar is 60%. A manager running more than one artist who hasn't started another release in 90 days isn't running the business in Urganize.
- Week 4 retention: the share of teams that signed up in a given week and are still active in their fourth week.

Product rule: a feature earns a sprint if it moves weekly active paying teams or the second-release rate. Detail lives in Product Build Direction.

## 8. Financial operating model

Revenue comes from monthly subscriptions, with pay-as-you-go credits and transaction revenue on top. Oyin owns the financial model and runs the monthly financial review.

### Pricing (Current state)

| Tier | Monthly | Yearly | Credits a month | For |
|---|---|---|---|---|
| Solo | ₦5,000 | ₦50,000 | 150 | Independent artists. One seat, UrgAns as chat only |
| Manager | ₦22,000 | ₦220,000 | 660 | Managers running more than one artist. UrgAns works inside releases |
| Label | ₦50,000 | ₦500,000 | 1,500 | Labels and management companies |
| Group | Custom | Custom | Custom | Distributors and multi-label groups |
| Credits only | None | None | ₦30 a credit | Anyone who wants to pay by use. Solo features |

Yearly is ten months for twelve. Trials run 3 days and come with 50 credits. The Founding Member cohort (capped at 10, still open) keeps a lifetime price lock.

### On top of subscriptions

- Credits (in build): a monthly allowance comes with every plan, and teams buy top-ups past it. Rules below. Crypto payments are being added in the same sprint.
- Distribution: users order it inside the rollout. User price = partner price + Urganize margin, collected through Paystack.
- Take rate (Future): curator placements, bookings and hiring.

### Credits (set Oct 1, 2026)

- Value: one credit is worth $0.01, about ₦15. Users pay 3× what the AI provider bills. The markup covers retried and failed calls, Paystack fees, and the dollar cost moving against naira revenue.
- Chat: charged on the tokens actually used, rounded up to whole credits, with a minimum of 1 credit a turn.
- Allowance: the monthly credits in the pricing table replace the 40 and 150 monthly actions. Each allowance costs about 15% of its plan price (Manager: about $2.20 of provider cost against about $14.70; Label: about $5 against about $33). Past the allowance, teams buy top-up credits.
- Top-up price: ₦15 a credit on any plan. Credits-only users pay ₦30 a credit, so Solo stays the better deal for regular use.
- Credits-only use: anyone can use Urganize on credits alone, with Solo features and no monthly fee.
- Credits don't expire. Unused allowance carries over to the next month. Bought and allowance credits stay usable after a plan ends (the account moves to Solo features until they subscribe again).
- Trials: 3 days with 50 credits. Leftover trial credits carry over only if they buy a plan or a top-up.
- Failed calls are free. The provider doesn't bill them, so we don't either.
- At zero credits, chat falls back to typed commands with a prompt to buy credits. Nothing breaks.
- Every plan can use every rung. Each turn pays its own credits.
- Embedded actions (rollout planner, press-kit draft) are billed on the tokens actually used, at 3×, like chat. Before a run the app shows an estimate (about 12 credits for the planner) and holds up to 25 credits. The run settles at the real cost and never goes above the hold. After a few weeks of real runs, we decide whether to switch to a flat price.
- Exchange rate: ₦1,500 to the dollar (set Oct 1, 2026). If the real rate gets worse, the allowances shrink.

Credits per chat turn, by rung:

| Rung | Cold cache | Warm cache |
|---|---|---|
| Quick | 1 credit | 1 credit |
| Standard | About 3 | 1 |
| Pro | About 10 | 2 |
| Max | About 20 | 4 |

### Top-up packs (set Oct 1, 2026)

| Pack price | Subscribers get | Credits-only users get |
|---|---|---|
| ₦1,500 (minimum) | 100 credits | 50 credits |
| ₦3,000 | 200 credits | 100 credits |
| ₦7,500 | 500 credits | 250 credits |
| ₦15,000 | 1,000 credits | 500 credits |

What users see: the balance on every AI action, a credit history page (every spend, top-up, allowance and trial grant) and a low-balance warning below 50 credits. Opt-in auto top-up comes after credits are tested.

Credits launch behind their own flag, off by default. The 40 and 150 action counts keep working until credits are tested.

MRR rule: MRR counts subscriptions only, with yearly plans at price ÷ 12. Credits (including credits-only users), distribution margin and take rate are reported next to MRR as transaction revenue, never inside it.

### Seed-bar tier mix (set Oct 1, 2026)

The 25 teams in the seed bar are planned as 20 Manager and 5 Label: ₦440,000 + ₦250,000 = ₦690,000 MRR. The buffer over ₦500,000 covers yearly plans and churn. Twenty-five Manager teams all on yearly plans come to about ₦458,000, which misses the bar.

12-month target: 65 paying teams, 40 Manager and 25 Label, about ₦2.13M a month. Projected burn at the full plan is ₦1.1M a month (a projection, not measured spend).

Spending rule: Oyin approves all spend, and every spend line ties to a scoreboard number.

## 9. Team roles

Each person owns an outcome on the scoreboard, not a list of tasks.

| Person | Role | Owns |
|---|---|---|
| Oyin Wenapere | Founder and CEO | Strategy, product direction, sales, billing and renewals, finance, partnerships, hiring. Builds the product |
| Tedum King | Co-founder, AI | UrgAns and the AI layer: models, providers, the AI gateway |
| Chidera | Product Operations (part-time) | Sprint process, PRDs, activation and retention numbers, onboarding quality |
| Khaybee (KB) | Community Lead | Growth execution, community channels, Famously Notorious interviews, and part of sales |
| Michael Caleb | Motion design | Product demo videos and motion graphics |
| Queen | On-camera talent | Brand video content |
| Victoria Emmanuel | Intern | Supply: curators for playlist pitching, and getting seeded directory profiles claimed. Weekly numbers: curators onboarded, profiles claimed. Start date and two-week check to set |

Coming, not active yet

- Client Services (intern): same-day support, onboarding calls, and outreach to signups who never started a release. Reports to Chidera.
- Mr Jean: fundraising connector.

Rules

- Full commitment or step back. A role nobody is carrying gets reassigned at the Monday review.
- Equity and pay terms live in the Founder Workspace and Legal, not on this page.

## 10. Legal and data foundations

The Urganization Ltd is registering in October 2026, and until then contracts are not written in incorporation terms.

### Company

- CAC rejected URGANIZE LTD as too close to Urbanize Nigeria. The final name is The Urganization Ltd.
- Urganize stays the product and brand name whatever the legal entity is called.

### Agreements

| Agreement | With | Status |
|---|---|---|
| Distribution Partner Agreement | Therealmusicdistro | Signed |
| Tangent Cohort 002 (2% equity grant, 18-month vesting, 3-month cliff) | Greylight | Accepted, running Sep 15 to Dec 8, 2026 |
| Cross-promotion MOU | Sound Wave Spotlight | Signed Sep 28, 2026 (terms below) |
| Sponsored release campaign | Soundscape | Paused |

### Sound Wave Spotlight terms (MOU signed Sep 28, 2026)

- They keep free Urganize access while the MOU is active, in return for exposure, assets and outreach to artists and managers.
- They get a referral code, and teams that sign up with it are tagged to them.
- Commission: 10% of subscription payments from those teams, for each team's first 12 months.
- Paid monthly by the 10th, on payments that cleared the month before. No commission on refunds, credits or distribution.
- No transfer of Urganize source code.

### Data

Supabase and PostgreSQL hold all product data, and every client (web, mobile, desktop, UrgAns) reads from the same source.

- Re-sign equity, contributor and partner agreements in the company's name once it is registered
- Privacy policy and terms that meet the Nigeria Data Protection Act 2023: what is collected, why, and who it is shared with (distribution partner, payment processors, AI providers)
- Record how each AI provider stores and uses data before UrgAns sends it anything
- Limit production database access to the people who need it

### Directory and job market (set Oct 1, 2026)

- Opt-in. A profile goes live when its owner publishes it. The app asks right after the first release plan.
- Verified roles come only from tasks delivered on released releases.
- Seeded profiles for people without accounts show only credits already on a released release's public credit link. They are marked unclaimed and removed on request.
- Search is open to every plan, Solo and trials included: by role, location and delivered credits, with messaging. The money comes from the take rate on hires, not from charging to search.

## 11. Fundraising milestones

Urganize is not raising now. The company raises a seed round only when all five bars below hold at the same time. Until then it stays lean and puts every naira into retention.

| Seed bar | Target | Oct 1, 2026 |
|---|---|---|
| Active paying teams | 25+ (planned as 20 Manager, 5 Label) | 0 paying, 8 active |
| Second-release rate | 60% within 90 days | Not measured yet |
| MRR | ₦500,000+ (plan: ₦690,000) | ₦0 |
| Repeatable acquisition | One channel brings in 3+ paying teams a month for 3 months in a row, at a known cost per team | Not yet |
| UrgAns operational value | Half of active paying teams use UrgAns inside releases every week, and the ROI re-interviews show fewer coordination hours | Not yet |

Evidence for UrgAns value comes from the ROI interviews: five baseline questions before a team starts (last release cost, placements landed, shows booked, hours a week coordinating, what the release paid back), asked again after a full rollout in Urganize.

Now: Tangent Cohort 002 runs to Dec 8, 2026. Mr Jean is coming on as fundraising connector. Raise terms live in Finance > Fundraising.

## 12. Competitive strategy

The real competitor is WhatsApp, spreadsheets and memory. The biggest threat is a distributor bundling rollout tools onto the upload.

### Closest software

| Company | Why it's close |
|---|---|
| Comanager | Biggest competition |
| ArtistGrowth | Very close |
| Soundbridge | Close to Urganize |
| music.ai | Similar long-term vision |
| Unhurd | Release and marketing tools for independent artists |

### How we win

- The whole team in one place. Chat per release and task, invites and activity assignment. Most tools serve the manager or the artist alone.
- Distribution inside the rollout. We bundle distribution onto the rollout before a distributor bundles rollout onto the upload.
- Built for how African teams pay and work. Naira pricing, Paystack, crypto, and Chappi on WhatsApp later.
- Audience reach. Famously Notorious and community put us in front of artists and managers directly (section 13).
- Context that compounds. Every release adds to the history UrgAns learns from.

Rule: we don't compete as a generic project manager, CRM, analytics dashboard or freelancer marketplace. Each of those exists in Urganize only to serve the release and the team.

## 13. Moat and long-term thesis

The near-term moat is audience: direct reach into the artists and managers we sell to. It is relationships and attention, which a competitor can't copy by building features.

### Audience today (Committed)

- Famously Notorious: the interview series. Not started yet, but in the plan with KB running interviews.
- Dear Creative: Oyin's series on Threads.
- Community: KB's channels across WhatsApp, Instagram, X, TikTok, Facebook, YouTube, Threads and LinkedIn.

### How the moat compounds (Future)

- Audience brings teams in.
- Workflow: teams run every release in Urganize, so each release raises the cost of leaving.
- Network: professionals carry roles verified by tasks they delivered on released music, and the directory and job market connect them to work.
- Context: a structured history of who worked on what, which curators were pitched, and what performed.
- AI: UrgAns uses that context to flag what matters and do the work.

Thesis: the money follows the release. Subscriptions bring teams in. Distribution brings releases in. The take rate comes from placements, bookings and hiring. Advances against catalog come later. Seat pricing alone can't reach a $1B outcome. This chain is how the company aims to.

## 14. 2026 to 2027 strategic priorities

The rest of 2026 is about retention and getting distribution and Famously Notorious live. 2027 is about hitting the seed bar, then raising. The order below is proposed and gets confirmed at the first strategy check.

| When | Priority | Owner | Done when |
|---|---|---|---|
| Q4 2026 | Retention sprint: credits, crypto payments, referral credits | Oyin | Live, with the second-release rate reported weekly |
| Q4 2026 | Distribution ordering inside the rollout | Oyin | First distribution order paid through Paystack |
| Q4 2026 | Famously Notorious launched | KB | First interviews published and the first manager pitched |
| Q4 2026 | Company registered | Oyin | CAC registration complete |
| Q4 2026 | Tangent Cohort 002 | Oyin | Completed Dec 8 |
| Q4 2026 | iOS app | Oyin | Live on the App Store (target December) |
| Q4 2026 | Directory and job market | Oyin | Live, with roles verified by delivered tasks |
| H1 2027 | Seed bar | Everyone | All five bars in section 11 hold |
| H1 2027 | Chappi on WhatsApp | Tedum | Messages the team and acts through the Urganize API |
| H1 2027 | Expo mobile | Oyin | Tasks, notifications and approvals live on mobile |
| H2 2027 | Seed raise | Oyin | Round closed |
| H2 2027 | Take-rate revenue | Oyin | First paid placement, booking or hire through Urganize |
| H2 2027 | 12-month target | Everyone | 65 paying teams, about ₦2.13M a month |

Tauri desktop comes after these, only for workflows that need it.

## Open items

None right now. New open questions go here and get taken to the next Monday review.
