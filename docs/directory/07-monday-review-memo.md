# Monday review memo: validate demand first

From: Wena. For: the Monday review. About: the four demand tests from "Urganize Profiles and Directory Spec" (Oct 9, 2026), section 3.

## The short version

We run four cheap tests over about three weeks before we build anything new for the directory.

| # | Test | Owner | Bar |
|---|---|---|---|
| 1 | 20 manager calls | Wena | 10 of 20 say yes with a filter they would use |
| 2 | Artist post | KB | 50 requests in 14 days |
| 3 | 10 hand-made matches | Wena, KB | 3 of 10 start a shared release in Urganize within 30 days |
| 4 | Live directory data | Chidera | Messages get a reply 40% of the time |

The kit for all of it is in `docs/directory/`. Nothing in the app changed.

## What I need from this meeting

1. A yes or no to start the tests this week.
2. Argue the four bars now, before we see numbers. The spec says they are starting bars. If we want a different one, we change it today and write it down. We do not move a bar after the result.
3. A name for each open question below, or a yes to the default.

## Three things to know before we start

- **Test 3 takes longer than three weeks.** It needs 30 days after the matches. We can read tests 1, 2 and 4 after about three weeks. Test 3 lands about a month after that. The decision tree says what to build and what to hold in the meantime.
- **Test 4 is not all in PostHog.** Searches and profile views are. Messages and replies are in the database, so the queries for them are SQL. The reply rate in the kit uses the same rule as the admin page for the directory so the numbers agree.
- **What is live today** is profiles, search by role, the role gaps panel, and 7-day requests with a "Not taking work" setting. Featuring, bios and matching are not built. The scripts never say they are.

## Open questions and the default used

These are the six from the spec, plus three that came up while writing the kit. For each: the question, the default I used so work is not blocked, and who can change it.

### From the spec

**1. Lane B against the Oct 1 rule.**
The strategy doc says seeded profiles show only credits from public credit links. Inviting top managers to build a profile before they have any credits needs that loosened to "or created with the owner's consent". What was the thinking behind keeping it that tight?
- Default used: no change to the rule. The kit does not create any profile. Test 1 calls only ask questions. Nobody is shown anywhere.
- When to decide: after test 1. If managers say they would use it, loosen the rule with consent only, never without.

**2. Can artists see managers who are not taking artists?**
- Default used: yes, but the message button shows only when they are marked "Taking new artists", as the spec proposes. The app today already blocks a request to someone marked "Not taking work".
- Who can change it: Wena.

**3. The filter on inbound.**
If managers want a filter (test 1), what is it: a release already planned, streaming numbers, a short pitch?
- Default used: do not decide until the calls are done. Count the filters named. If three or more managers name the same one, that is the filter. If they all differ, let each manager pick their own.
- Test 1 collects this on every call.

**4. Who owns claims while Victoria is paused?**
The strategy doc gives her the "profiles claimed" number.
- Default used: Wena owns the number for now and Chidera reports it each Monday. Nothing in these four tests needs it.
- Who can change it: Wena.

**5. Take rate on manager signings.**
A hire for a video is a clean fee. A manager signing an artist usually is not. Is there a take on that, or is the money the Manager plan they move onto?
- Default used: no take on signings. The money is the plan the manager moves onto. Test 3 does not charge anyone.
- Why it matters now: the three scripts in test 3 never mention a fee. If we want one, we say so before the first intro.

**6. Featured on the landing page.**
Should the Featured shelf also show publicly, outside the app, as social proof?
- Default used: no. Not before tests 1 and 3 pass, and never without each person's yes.

### From writing the kit

**7. Where does the artist form live, and who can see the answers?**
It holds phone numbers and emails.
- Default used: a simple form tool (Tally or Google Forms), answers in one sheet owned by KB and shared with Wena. The form asks permission to share the answer with one manager. Answers are deleted within 3 days if asked.
- Who can change it: KB.

**8. Are our own friends and team counted?**
- Default used: no. They are listed in a "not counted" column and left out of every bar. Same for test 4: team and test accounts are excluded and the list is written down.

**9. Do we count test 3 if one manager gets all three of the shared releases?**
- Default used: it counts on paper, and we say plainly that one manager is a friend, not a market. We run 5 more matches with other managers before building featuring. This is in the decision tree.

## Two things that are not decided and not defaults

- Whether to post once more if test 2 is under 50. The tree treats under 50 as a fail. I would allow one push on day 7 if we are under 20, and say we did.
- Whether to loosen the 7-day closing window on requests. The data on how fast people reply is in the kit (`04-posthog-and-sql-queries.md`). Look at it after two weeks.

## The two interview questions

Add these to every ROI and Famously Notorious interview from now on (details in `05-interview-questions.md`):

1. How did you find your current manager (or your last producer, director, or designer)?
2. What did it cost you to find them, in time or money?

## Not covered here

- No code, no new screens and no PostHog events were added for these tests. If we decide we want messages and replies in PostHog too, that is a small change for another day.
- The `expired` status for requests comes from a database change that the founder applies by hand. If it is not applied yet, the queries in the kit still work. They also treat any request still "new" after 7 days as closed with no answer.
