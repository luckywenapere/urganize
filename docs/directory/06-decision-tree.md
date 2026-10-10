# How to read the four results

One page. The first part is the spec's own rules, word for word in meaning. The second part is what the spec does not say, with the default used so nobody invents one on the day. Fight the defaults at the Monday review. Do not fight the bars after you have seen the numbers.

## The bars

| Test | Bar |
|---|---|
| 1 Manager supply calls | 10 of 20 say yes with a filter they would use |
| 2 Artist demand post | 50 artist requests in 14 days |
| 3 Concierge matches | 3 of 10 start a shared release in Urganize within 30 days |
| 4 Live directory data | Messages get a reply 40% of the time |

## Part 1: what the spec says

**Rule A. Tests 1 and 3 pass.**
Build featuring and the artist request flow (spec sections 6 and 7).

**Rule B. Test 2 passes and test 1 fails.**
Artists want managers but managers do not want them. Flip it: managers browse artists and reach out instead.

**Rule C. Test 3 fails.**
Matches do not become releases. Keep the directory for manager-to-crew hiring and drop the artist-finds-manager angle for now.

That is all the spec decides. Test 4 has a bar but no rule attached to it.

## Part 2: the picture

```
                          Did test 3 pass?
                     (3 of 10 shared rollouts in 30 days)
                       /                       \
                    yes                          no
                     |                            |
             Did test 1 pass?               RULE C
           (10 of 20 yes + filter)     Keep the directory for
              /            \            manager-to-crew hiring.
           yes              no          Drop artist-finds-manager
            |                |          for now.
        RULE A          Did test 2 pass?
   Build featuring     (50 in 14 days)
   and the artist        /         \
   request flow       yes           no
                       |             |
                    RULE B       See Part 3,
              Managers browse     row "1 and 2 fail"
              artists and reach
              out instead.
```

Read it from the top. Test 3 is the last to finish, so it is the last to be read. Until it finishes, see "While test 3 is still running" below.

## Part 3: what the spec does not cover, and the default used

| What happened | Default |
|---|---|
| **Test 1 passes, test 2 fails** (managers want artists, artists do not ask) | Do not build the artist request flow. Say it plainly: the demand side is missing. Look at where the post went and whether to try once more in a different place (one more attempt, decided at the review, not automatic). Meanwhile run test 3 only if you already have 10 artists from another source. |
| **Tests 1 and 2 both fail** | Stop the artist-finds-manager angle. Keep the directory as it is (manager-to-crew hiring) and do not build featuring. The interviews (see `05-interview-questions.md`) become the main way to learn why. |
| **Test 1 and 2 pass, test 3 is not finished yet** | Do not build featuring or the request flow yet. Both are waiting on test 3. Spend the wait on things Rule C would not undo: manager-to-crew hiring and the interview work. |
| **Test 3 passes but test 1 had a weak pass** (for example exactly 10 of 20, all with the same filter) | Treat it as Rule A, and say that the filter list is thin. Build the request flow with the one filter they named, nothing more. |
| **Test 3 passes with 3 of 10, but all 3 are from the same manager** | Count it as a pass on paper, and say it plainly. One manager is a friend, not a market. Run 5 more matches with other managers before building featuring. |
| **Fewer than 10 artists ticked the share box in test 2** | Test 3 cannot be run fairly. Do not shrink the matches to 5 and call it a pass. Either wait for more requests or run test 3 as "n of fewer than 10" and say it is not the spec's test. |
| **Test 4 is above 40%** | It is a good sign for the manager-to-crew side, which is live. It does not decide Rules A, B or C. Write it down. |
| **Test 4 is below 40%** | Read the "still waiting" count first. If most are still waiting, read it again next week. If it is truly low, it is a warning for every rule that depends on messages being answered (A and B both do). Say it at the review. It does not undo a pass on tests 1 and 3, because those are tests of a different group (managers who took the call), but it should lower how fast you build. |
| **Test 4 has fewer than 10 requests** | Not enough to read. Write "not enough yet", and do not use it in a decision. |
| **A bar is missed by a little** (for example 9 of 20, or 47 requests) | It is a fail. The spec says the bars are "proposed starting bars, set to be argued with at the Monday review". So argue the bar at the review before the numbers come in, not after. If you want to move a bar, move it in the memo and write down why. |

## While test 3 is still running

Test 3 needs 30 days after the matches. Tests 1, 2 and 4 are readable in about three weeks. For the gap:

- Read tests 1, 2 and 4 at the Monday review.
- Write down which rule each one points to if test 3 passes, and which if it fails. For example: "If test 3 passes we are at Rule A. If it fails we are at Rule C."
- Do not build featuring, bios or the request flow until test 3 is read. The spec's point is "demand gets tested before anything beyond what's live gets built".

## What to do on the day

1. Fill in the four numbers from the trackers. Show the raw counts, not only percentages.
2. Say which rule applies, out loud, with the counts.
3. If none applies, find the row in Part 3. If none fits, write the case in the memo as a new open question. Do not invent a rule in the meeting.
4. Write the decision, and the one thing you would need to see to change it.
