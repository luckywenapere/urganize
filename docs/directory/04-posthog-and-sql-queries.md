# Test 4: Live directory data

Question: are people already using what is live?

Pass bar (from the spec): **messages get a reply 40% of the time.** Owner: Chidera.

The spec says "pull PostHog" for searches, profile views, messages sent and replies, per week. One thing to know first, checked in the code on Oct 10:

| Number | Where it really lives |
|---|---|
| Directory searches | PostHog, event `directory_searched` |
| Profile views | PostHog, event `directory_profile_opened` |
| Profiles listed | PostHog, event `directory_profile_listed` (fires once, when someone first opts in) |
| Role gaps shown and clicked | PostHog, events `role_gaps_shown`, `role_gaps_role_clicked`, `role_gaps_dismissed` |
| Messages sent | Supabase table `work_requests` (no PostHog event exists) |
| Replies | Supabase table `work_requests`, column `status` and `answered_at` (no PostHog event exists) |
| Roles managers wanted and nobody had | Supabase table `billing_events`, type `directory_role_wanted` |

So the first four are PostHog queries. Messages and replies are SQL. That is on purpose: the app writes them to the database where they cannot be lost to a content blocker. If you want them in PostHog as well, that is a small code change for another day. It does not change the test.

The reply rate in this guide is built to match the number on **`/admin/directory`** (the admin page for the directory). If a number here and a number there disagree, one of them has a bug. Tell the team.

## The reply rate, in plain words

Use exactly the app's rule so every report agrees:

- **Sent:** every request created in the week.
- **Answered:** the person said "interested" or "pass". A "pass" counts as a reply. They replied.
- **Closed with no answer:** the request is marked expired, or it is still "new" more than 7 days after it was sent (the app closes these after 7 days).
- **Still waiting:** "new" and sent in the last 7 days. These are **left out** of the rate. They have not had their chance yet.
- **Reply rate = answered divided by (answered plus closed with no answer).**
- If nothing has a known outcome yet, say "not enough yet". Do not write 0%.
- Weeks start on **Monday, UTC**.

## Who to leave out

Leave out your own team and test accounts. Do this the same way every week.

- In PostHog: filter out people whose email is on the team list. If your project has an internal-user filter, turn it on. Otherwise add a filter "Email does not contain" for each team address.
- In SQL: exclude requests where the sender or recipient is on the team list (replace the list in the queries below).

Write down in the tracker which list you used. If the list changes between weeks, the trend is not fair.

## PostHog queries

Run each as a **Trends** insight, grouped by week, last 8 weeks. Add the internal-user filter.

1. **Directory searches per week**
   - Event: `directory_searched`
   - Total count, weekly.
   - Second line: unique users, weekly.
   - Break down by property `role` to see which jobs are searched. The search text is never recorded, on purpose.
2. **Searches that found nothing**
   - Event: `directory_searched`
   - Filter: property `results` equals `0`.
   - Weekly total. A rising number here means managers or artists want things nobody has listed.
3. **Searches that found something**
   - Event: `directory_searched`
   - Filter: property `results` is not `0`. (The values are `0`, `1-4`, `5-19`, `20+`.)
4. **Profile views per week**
   - Event: `directory_profile_opened`
   - Total count and unique users, weekly.
   - Break down by property `role`.
5. **Searches to views**
   - Formula in a Trends insight: B / A, where A is `directory_searched` (unique users) and B is `directory_profile_opened` (unique users). If most searches never open a profile, the cards are not convincing.
6. **Profiles listed**
   - Event: `directory_profile_listed`
   - Total count, weekly. Break down by `visibility`.
7. **Role gaps panel pushing people to the directory**
   - Events: `role_gaps_shown`, `role_gaps_role_clicked`, `role_gaps_dismissed`.
   - Compare clicked to shown. Say it in a sentence: "The panel was seen X times and clicked Y times."

If you prefer a table, the same thing in HogQL:

```sql
SELECT
  toStartOfWeek(timestamp, 1) AS week,
  event,
  count() AS events,
  count(DISTINCT person_id) AS people
FROM events
WHERE event IN ('directory_searched', 'directory_profile_opened', 'directory_profile_listed')
  AND timestamp >= now() - INTERVAL 8 WEEK
GROUP BY week, event
ORDER BY week DESC, event
```

(`toStartOfWeek(x, 1)` starts the week on Monday. Check the internal-user filter is on in the project settings, because HogQL does not apply it for you.)

## SQL queries (Supabase, read only)

Run these in the Supabase SQL editor. They only read. Nothing here changes data.

**Messages sent, answered, closed and the reply rate, per week**

```sql
with team as (
  select id from auth.users
  where email in (
    -- put your team and test emails here, lower case
    'example@urganize.app'
  )
),
rows as (
  select
    date_trunc('week', created_at at time zone 'UTC')::date as week,
    status,
    created_at
  from public.work_requests
  where created_at >= now() - interval '8 weeks'
    and sender_user_id not in (select id from team)
    and recipient_user_id not in (select id from team)
)
select
  week,
  count(*) as sent,
  count(*) filter (where status in ('interested', 'passed')) as answered,
  count(*) filter (
    where status = 'expired'
       or (status = 'new' and created_at < now() - interval '7 days')
  ) as closed_no_answer,
  count(*) filter (
    where status = 'new' and created_at >= now() - interval '7 days'
  ) as still_waiting,
  round(
    100.0 * count(*) filter (where status in ('interested', 'passed'))
    / nullif(
        count(*) filter (where status in ('interested', 'passed'))
        + count(*) filter (
            where status = 'expired'
               or (status = 'new' and created_at < now() - interval '7 days')
          ),
        0
      ),
    1
  ) as reply_rate_percent
from rows
group by week
order by week desc;
```

`date_trunc('week', ...)` in Postgres starts on Monday. `reply_rate_percent` is empty (null) when nothing has a known outcome, which is the right answer. It is not zero.

**All-time reply rate (the number the bar is read against)**

```sql
with team as (
  select id from auth.users where email in ('example@urganize.app')
)
select
  count(*) as sent,
  count(*) filter (where status in ('interested', 'passed')) as answered,
  count(*) filter (
    where status = 'expired'
       or (status = 'new' and created_at < now() - interval '7 days')
  ) as closed_no_answer,
  round(
    100.0 * count(*) filter (where status in ('interested', 'passed'))
    / nullif(
        count(*) filter (where status in ('interested', 'passed'))
        + count(*) filter (
            where status = 'expired'
               or (status = 'new' and created_at < now() - interval '7 days')
          ),
        0
      ),
    1
  ) as reply_rate_percent
from public.work_requests
where sender_user_id not in (select id from team)
  and recipient_user_id not in (select id from team);
```

**How fast people reply (to see if 7 days is the right window)**

```sql
select
  role,
  count(*) as answered,
  round(avg(extract(epoch from (answered_at - created_at)) / 3600)::numeric, 1) as avg_hours_to_answer,
  percentile_cont(0.5) within group (
    order by extract(epoch from (answered_at - created_at)) / 3600
  ) as median_hours_to_answer
from public.work_requests
where answered_at is not null
group by role
order by answered desc;
```

**Jobs people asked for and nobody had listed (the recruiting list)**

```sql
select
  metadata->>'role' as role,
  count(*) as times_wanted_with_no_match
from public.billing_events
where type = 'directory_role_wanted'
  and created_at >= now() - interval '8 weeks'
group by 1
order by 2 desc;
```

(That event is written one per team per role per day, only when someone filtered by a role. It is a demand signal, not a count of people.)

## The weekly tracker

Same columns as `trackers/04-directory-weekly.csv`. Fill one row each Monday for the week before.

| Week starting (Monday, UTC) | Searches | People who searched | Searches with 0 results | Profile views | Profiles listed | Messages sent | Answered | Closed no answer | Still waiting | Reply rate (answered / (answered + closed)) | Our team excluded? (list used) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | |

## How to read it

- **Reply rate at or above 40%:** pass for test 4.
- **Under 40%:** fail for test 4. Read the "still waiting" number next to it. If most requests are still waiting, wait one more week before reading it. Do not average in your own team.
- **Under 10 requests total:** do not read the rate. Write "not enough yet" and say how many requests there were. A rate from 6 requests is a story, not a number. The honest read is that there is not enough use to test the 40%.
- **Many searches, few profile views, almost no messages:** people look but are not moved. That is useful and the bar does not catch it. Say it at the review.

## Handing this to chat 6

The reply rate here is the same rule that `summarizeWorkRequests` in the app uses (answered over answered plus closed, waiting left out, Monday UTC weeks, "not enough yet" when empty). If chat 6 changes the rule, they must say so in their PR, and this file should be updated to match.
