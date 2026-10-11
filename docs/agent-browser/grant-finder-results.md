# Grant finder: results of the live evaluation (plan step 5)

Run: 2026-10-11, 20 cases, Exa search plus RodiumAi `openai/gpt-4o-mini`, 111
results, $0.92 total ($0.046 per case). Labels are a **pre-label**: each of the 55
unique pages was read against its source by a checker, then labels were applied by
the rule below. They still need the founder's sign-off.

## Verdict: fails the bars, clearly

| Bar | Needed | Got |
|---|---|---|
| ≥3 open and eligible in the top 5 | 14 of 20 queries | **0 of 20** (best: 1) |
| Wrong fields | 0 | **26 results** (15 unique pages) |
| Known funders found | some | yes: Afreximbank CANEX, Music In Africa, PRS Foundation |
| Cost per query | fits credits | $0.046 |

Labels across 111 results: 65 closed, 26 field_wrong, 8 not a grant, 7 ineligible,
**5 open and eligible**. Those 5 are only two programmes: Institut français AOCA
(4 times, closes 2026-10-30) and G.A.S. Project Nexus (a visual-arts residency, so
not really a music result).

## Why it fails

1. **Search finds old rounds.** 65 of 111 results were closed. Grant pages stay
   indexed long after the call ends, and reposts outlive the original. The verifier
   reads deadlines correctly, but there are rarely open calls for it to find.
2. **Nigeria-eligible calls that are open right now barely exist in the index.** The
   Nigerian cases found MTN Next Afrobeats Star, the UK–Nigeria Creative Fund, MUSON
   and Tiwa Savage/Berklee, all closed. Nigerian public creative money is mostly loans
   (iDICE, NEXIM, Lagos), which aren't grants.
3. **Wrong fields fall into three kinds:**
   - *Amounts that aren't awards* (iDICE $45m pot, Arts Council £3m budget, CBA $500
     fee, Hukwe Zawose $750 fee, Hallelujah ₦50m pot, Live 500 €500 per event,
     Next Afrobeats Star ₦225m record deal). The first four are fixed in 7465a55;
     prize pools and per-event figures are not yet.
   - *Funder credited to the reposting site* (Music In Africa, InterArts and Trybe
     Africa for Connect & Create and Obaasima; NerdzFactory for the UK–Nigeria fund).
     Not fixed.
   - *Dates* (a registration-open date read as a close date; an earlier cycle's
     deadline). Not fixed.

## Against the curated list

The hand-curated list (`grant-funders-curated.csv`, 40 funders, checked 2026-10-11)
shows 7 programmes open on the same day, several open to Nigeria (Goethe-Institut
coproduction and mobility, Connect & Create hubs, ACCES Spotlight, AOCA, Africa No
Filter Kekere). The live search found just one of them (AOCA). The curated list
wins on coverage, correctness and cost.

## Recommendation

Per plan section 8, take the **curated list with Exa as the curator's tool**, and
don't run live search for users. Feeding the in-app "Suggested grants" feed
(product plan) from the curated list keeps the approved UI, migration, cron and
notification. Only the source changes: a person, helped by a monthly Exa sweep,
keeps the list current, and the weekly job matches it to each team's facts.

## Labelling rule used

Applied in order, per result:
1. Any field the page contradicts (deadline, amount as a per-recipient award,
   funder) → `field_wrong`. A blank field the page does state isn't counted as wrong.
2. A loan, a fee-paying course, a news story or listing with no call, or a
   competition → `not_a_grant`. Paid scholarships and residencies count as grants.
3. Not open on 2026-10-11, or open status unknown → `closed`.
4. Not open to the case's applicant → `ineligible`. Nigeria and stage/need cases:
   Nigeria-based. Africa cases, ab-us, ab-europe and ab-travel: Africa-based. Ghana
   case: Ghana-based. ab-uk: a non-UK resident.
5. Otherwise → `open_eligible`.

Labelled report: `/workspace/work/g/live-20-labelled.json`. Per-page checks:
`/workspace/work/g/labels/out*.json` (sandbox only, not committed).
