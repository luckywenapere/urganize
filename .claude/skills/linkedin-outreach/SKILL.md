---
name: linkedin-outreach
description: Run Oyin's LinkedIn outbound for Urganize. Go through his newest connections, like an ICP person's own post, draft a first DM in his voice, get his yes, send, log. Also replies to his inbox. Use when he says "do LinkedIn outreach", "DM my connections", "reply my inbox" or similar.
---

# LinkedIn outreach

Outbound only: the first touch, not the sale. Every DM, reply and connection note is shown to Oyin and sent only after his yes. Likes need no approval.

## Before you start

1. GitHub issue first (`area:partnerships-outreach`, `chore`), reuse an open one if it exists.
2. Read the memory note on current positioning. As of 3 Nov 2026: "Urganize helps music professionals run their music businesses better, regardless of where they are in their careers." Never reuse an older product line from his past DMs ("the team app for music release" and "AI workspace for music executives" are retired).
3. Open LinkedIn in the built-in browser pane. He is signed in there. If a sign-in is blocked, use Claude in Chrome.

## Who counts (ICP)

Anywhere in the world:
- Emerging artists and managers who need structure.
- Experienced managers running established artists.
- Labels: owners, heads, A&R, label services and partnerships.
- Music business execs at those companies.

Skip: distributor or DSP staff (Spotify, Believe, TuneCore), founders and investors outside music, marketers with no artist side. Skip anyone already in his inbox.

## Outbound run

1. Open `/mynetwork/invite-connect/connections/`, sorted Recently added. Take the ICP people, newest first, until you have the batch size (default 15).
2. For each, open `/in/<slug>/recent-activity/all/`. Find a post they wrote. A post that starts "X reposted this" doesn't count. Scroll past reposts. Their own words over a quoted post count.
3. If they have a post of their own, like it. If they only have reposts or nothing, skip the like and still DM.
4. Draft the DM (rules below). Note one thing from their post or profile to open with.
5. Show Oyin all drafts at once with names. Wait for his yes. He may edit.
6. Send each and check it shows as "You: ..." in the thread.
7. Log every touch in `docs/outreach/linkedin-log.md`: name, role, profile, liked post, status.

If his connections run out of ICP people, search LinkedIn for titles (artist manager, A&R, label, independent artist) and send connection requests with a custom note (he has Premium). Same note rules as DMs, same approval step.

## DM rules (from his own inbox, 80 threads, 3 Nov 2026)

| First message | Replied |
|---|---|
| Asks who they work with, no product | 7 of 8 |
| "Hello, trust you're well?" | 13 of 19 |
| Playbook opener ("hardest part of running a release?") | 13 of 36 |
| Names Urganize or "a tool" | 2 of 5 |
| Has a link | 0 of 2 |

So the first message:
- has no product name and no link,
- opens with one real detail from their post or profile,
- asks who they work with and what's dropping soon,
- uses their first name, and "I'm Oyin" (never "Lucky"),
- has no em dashes and no hype.

## His voice

Write only in phrases he uses. From his DMs:
- "Hello good afternoon", "trust you're well?", "Very well thank you."
- "Oh nice that's exciting.", "Oh very nice", "Appreciate.", "Sounds good"
- "Who are you working with right now, if you don't mind me asking?"
- "Do you have a release coming out soon?"
- "We can hop on a quick call if you'd like. Sound good?"
- "Anytime works, you can pick here https://call.urganize.app"
- "How does the new week look? I'm flexible."
- "15 minute max break down to see how it works"
- "I'm the founder of a music tech startup and we're trying to solve problems for people such as yourself."
- "A call would be the easiest way to walk you through what we've built."

Short, loose punctuation, no polished marketing lines. When he asks what Urganize is, use the current positioning line, nothing older.

## Inbox replies

1. Open `/messaging/?filter=unread`. Opening a thread marks it read, so list every thread you open in case one gets missed.
2. Read each thread's last messages before drafting. If they asked a question, answer it. If they named a release, offer the call.
3. Show all drafts, wait for his yes, send, check each.
4. If someone says they can't sign up, that's expected: Urganize is waitlist only and Oyin lets people in himself. Note their name for him so he can let them in, and never send them a sign-up link.
5. LinkedIn only lets you edit a sent message for about an hour. After that, fix mistakes with a short follow-up, with his yes.

## Browser notes

- Message a person: read the `messaging/compose` link on their profile, open `/messaging/compose/?recipient=<id>`, check the "Remove <Name>" pill, click "Write a message", type, click Send, check the thread.
- Open an existing thread: `/messaging/?searchTerm=<name>`, then open the first result.
- When the pane isn't on screen, clicks can time out. Retry once after a short wait.
- The inbox list only draws about 10 rows while the window is hidden. Use search or the Unread filter, not scrolling.
