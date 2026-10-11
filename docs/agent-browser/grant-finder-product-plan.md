# Grant finder: from spike to an in-app feed

Status: **decisions approved by Oyin 2026-10-11 (all section 8 defaults, paid plans only); ship still gated on the labelled run passing section 5.** Written 2026-10-11 after the live evaluation
(20 cases, 111 results, about $0.92). Nothing here gets built until the results are
labelled, scored, and written up in `grant-finder-results.md`, and the founder picks
"plan a product version" at the step 6 decision gate in `grant-finder-plan.md`.
This replaces section 10 of that plan, which assumed a chat tool. The founder asked
for a feed that updates by itself.

## 1. What the user sees

- On the Opportunities page, a **"Suggested grants"** strip above the list. Each card
  shows the title, funder, deadline, amount (only if the page states one), why it
  matched ("Afrobeats, Nigeria, first release"), the source link, and the day it was
  read.
- Two buttons: **Add** and **Dismiss**. Add makes the normal Opportunity create call
  (`kind: 'grant'`, `status: 'idea'`) with the draft the pipeline already builds.
  Dismiss hides the card for good. Nothing becomes an Opportunity without a tap.
- Once a week, when there's something new, a notification: "3 new grants for Dorian".
  It uses the existing notifications table and cron, not a new channel.
- Cards drop off by themselves once their deadline passes. A round that's closed but
  recurs shows under "Watch for the next round", with no deadline set (same rule as
  the spike: a past date is never saved).

## 2. What already exists (built and tested in the spike)

| Piece | File | Ready? |
|---|---|---|
| Allowlisted facts to queries | `query.ts` | yes |
| Exa client, caps, redaction | `exa-client.ts` | yes (Gate 0 checked) |
| Hostile-page filter | `hostile.ts` | yes |
| Tool-less extraction + verifier | `extraction.ts`, `extractor.ts`, `verify.ts` | yes |
| Dedupe incl. reposts and existing Opportunities | `dedupe.ts` | yes |
| Opportunity drafts via `parseOpportunityCreate` | `mapper.ts`, `pipeline.ts` | yes |
| Spend meter with a hard cap | `spend.ts` | yes |

So the product work is plumbing and UI. The search logic stays as it is.

## 3. What's new

### 3.1 Storage (migration, founder decision)
A `grant_suggestions` table, one row per grant shown to a team:

- `team_id`, `artist_id` (nullable), `fingerprint` (normalized link + funder/title
  key), unique on `(team_id, fingerprint)` so a grant is never suggested twice;
- the verified fields: `title`, `funder`, `source_url`, `read_on`, `status`
  (open/unknown/closed), `deadline_on`, `last_closed_on`, `amount`, `currency`,
  `eligibility` (up to 5 quoted lines), `why`;
- `state`: `new` | `added` | `dismissed`, plus `opportunity_id` once added;
- RLS: team members read their own team's rows; only the server writes.

Also the two columns the spike plan already named for `opportunities`: `source_url`,
`source_read_on`. A dismissed row stays as a tombstone so the same grant doesn't
come back next week.

### 3.2 The weekly run
- **Cron:** both Hobby cron slots are taken, so the run rides the existing daily
  `/api/cron/notifications`. Each day it picks the teams whose weekday slot is today
  (team id hashed to 0 to 6), which spreads the load across the week.
- **Time:** the cron has `maxDuration = 60`. One case took about 20 seconds live, so
  the run handles a few teams per call and carries the rest over to the next day.
  If that's too slow, it's the trigger to move to a worker, which is a separate
  decision.
- **Per team:** 2 queries per artist from the team's allowlisted facts (genre,
  country, stage, need, year). No names, emails or free text, because zero data
  retention needs Exa Enterprise.
- **Caps:** a per-team weekly cap (about $0.10) and a global daily cap. The spend
  meter already stops the run cleanly at a cap.

### 3.3 Model call
The extraction moves off the test-only direct call to a proper router surface,
`grant_extract`, on RodiumAi `openai/gpt-4o-mini` (the model the live run used).
That means the guard and structural tests get updated so the surface is named
and has no tools.

### 3.4 UI
The strip and cards on the Opportunities page, behind a feature flag. Add reuses
the existing create route, so validation stays in one place.

## 4. Cost

Measured: about $0.046 per case (2 searches plus about 8 page reads). At one case
per artist per week:

| Teams (1 artist each) | Per month |
|---|---|
| 10 | about $2 |
| 100 | about $20 |
| 1,000 | about $200 |

Exa's free tier ($10 a month) covers the first ~50 teams' searches. Exa also offers
startup credits of up to $1,000. Whether this sits on paid plans only is a founder
call.

## 5. Quality gates before it ships

1. The labelled 20-case run meets the plan's bars: at least 3 good results in the
   top 5, at least 14 of 20 queries passing, **zero wrong fields**, and known funders
   found.
2. Two field errors are already known from the run and must be fixed first:
   - an amount that is the fund's **total pot** (£3,000,000), not a per-artist award;
   - a **fee** read as an award ($500 on an academy brochure).
   **Done (2026-10-11):** the verifier now blanks a figure whose own sentence calls it
   a fee or the whole fund (fee/tuition/deposit, total/budget, "... Debt Fund"),
   unless award words ("up to", "grants of", "between", "apply for") sit beside it.
   This also catches the iDICE "$45 million Debt Fund" figure.
3. **Funder aliases:** MOBO UnSung came back twice (credited once to PRS Foundation,
   once to MOBO). **Done (2026-10-11)** without a hand-kept list: two funders count as
   one programme when one title names the other funder, the deadlines match, and the
   shorter title sits whole inside the longer.
4. **Nigeria coverage is thin.** The UK and EU queries found strong, dated calls;
   the Nigerian ones mostly found reposts and closed rounds. Recommendation: seed
   the feed with the hand-curated Nigerian/African funder list (plan section 8),
   with Exa adding new finds on top. Not Exa alone.

## 6. Legal and privacy (before launch)

- Add Exa to the subprocessors page and the privacy policy, and record the NDPA 2023
  basis.
- Exa's standard DPA is in its Trust Center. Zero data retention is Enterprise only,
  so queries carry only the allowlisted facts.

## 7. Build order

1. ~~Fix the two field errors and add funder aliases (section 5), tests first.~~ Done.
2. Migration: `grant_suggestions`, plus `source_url`/`source_read_on` on
   opportunities.
3. Router surface `grant_extract` and the guard updates.
4. The weekly job inside the notifications cron, with caps and carry-over.
5. The Suggested grants strip with Add and Dismiss, behind a flag.
6. The weekly notification.
7. Turn it on for our own team first and read every card for two weeks, then roll
   it out.

## 8. Decisions for Oyin

| Question | Decided 2026-10-11 |
|---|---|
| Approve the migration? | Yes, it's needed to remember what was dismissed. |
| Ride the daily cron or add a worker? | Ride the cron, and move to a worker only if carry-over lags. |
| Paid plans only? | Yes. Cost is about $0.20 per team per month. |
| Curated list plus Exa, or Exa alone? | Curated plus Exa, for Nigerian coverage. |
| How often? | Weekly per team. |
| Notification channel? | In-app now. Email digest later, if it gets read. |
