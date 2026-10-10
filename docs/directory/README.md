# Validate demand first: the kit

From "Urganize Profiles and Directory Spec" (Oct 9, 2026), section 3, "Validate demand first". Four cheap tests, three weeks, before anything beyond what is live gets built. This folder is the kit to run them. It is documents only. No app code changed.

Written in Wena's voice. The spec's owner table says "Lucky" because it was written before the name change. Wena is the same person and owns tests 1 and 3 (with KB on 3).

## The four tests and their bars

| # | Test | Pass bar | Owner | File |
|---|---|---|---|---|
| 1 | Manager supply calls | 10 of 20 say yes with a filter they would use | Wena | `01-manager-supply-calls.md` |
| 2 | Artist demand post | 50 artist requests in 14 days | KB | `02-artist-demand-post.md` |
| 3 | Concierge matches | 3 of 10 start a shared release in Urganize within 30 days | Wena, KB | `03-concierge-matches.md` |
| 4 | Live directory data | Messages get a reply 40% of the time | Chidera | `04-posthog-and-sql-queries.md` |

## The rest of the kit

- `05-interview-questions.md`: two questions for every ROI and Famously Notorious interview.
- `06-decision-tree.md`: one page for reading the four results, word for word as the spec states.
- `07-monday-review-memo.md`: the open questions, with the default used for each.
- `trackers/`: three CSV files you can open in Sheets. They have the same columns as the tables in the guides.

## Order of work

1. Week 1: start the calls (test 1) and post the artist post (test 2) on the same day. Start the 14-day clock on the post day. Chidera pulls the first test 4 numbers.
2. Week 2: finish the 20 calls. The 14-day post window closes. Chidera pulls test 4 again.
3. Week 3: if test 2 got enough requests and test 1 found managers who said yes, hand-match 10 artists (test 3). The 30-day clock starts at each introduction, so test 3's answer lands about a month after week 3. Read tests 1, 2 and 4 at the Monday review of week 3. Read test 3 at the review after its 30 days.

Honest note on timing: the spec says "three weeks", but test 3 needs 30 days after the matches. The first three results are readable in three weeks. Test 3 is not. The decision tree says what to do while waiting.

## House rules used in the scripts

- The word is "rollout" for the thing inside Urganize. The outward posts and WhatsApp scripts say "release" and "your next release" because artists and managers outside the app do not know our word (the same call the public pages already make).
- No em dashes. Short words. No product jargon.
- Nobody is named in public. Nothing is promised that is not built. As of today the live directory has profiles, search, role gaps and 7-day requests with a "Not taking work" setting. Featuring, bios and matching are not built. The scripts never say they are.
- Every script asks permission before it saves a name or a number, and says what will be done with it.
