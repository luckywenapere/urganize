---
name: linkedin-outreach
description: Run Oyin's LinkedIn outbound for Urganize. Go through his newest connections, like an ICP person's own post, draft a first DM in his voice, get his yes, send, log. Also replies to his inbox. Use when he says "do LinkedIn outreach", "DM my connections", "reply my inbox" or similar.
---

# LinkedIn outreach

Outbound only: the first touch, not the sale. Every DM, reply and connection note is shown to Oyin and sent only after his yes. Likes need no approval.

**The goal is a person who creates their own account (since 6 Nov 2026, #1100).** We no longer push a call. Once someone is interested, send them the sign-up link and tell them Oyin will let them in. Sign-up is still closed, so a new account lands on "You're on the list" until Oyin lets them in from `/admin` and messages them with the WhatsApp template there. Offer a call only when they ask for one.

## Before you start

1. GitHub issue first (`area:partnerships-outreach`, `chore`), reuse an open one if it exists.
2. Read the memory note on current positioning. When someone asks what Urganize is or does, say it in Oyin's words (5 Nov 2026): "Urganize is where music teams work, from the idea to everything that comes after. Think of it like project management for the music industry: you add a release, you get the plan, and your team knows what to do and when." The broader line "Urganize helps music professionals run their music businesses better" (3 Nov) is fine as a one-liner but too vague on its own. Never reuse an older product line from his past DMs ("the team app for music release" and "AI workspace for music executives" are retired).
3. **WhatsApp follow-ups first.** Open `C:\Users\penta\Documents\Urganize Business\Operations\WhatsApp follow-ups.md`. List every row where "Messaged?" is No (name, number, what to say) and ask Oyin if he has messaged them. Only his own "done" moves a row to Done with the date. Ask again at the end of the run if any are still No.
4. Open LinkedIn in the built-in browser pane. He is signed in there. If a sign-in is blocked, use Claude in Chrome.

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
- "I'm the founder of a music tech startup and we're trying to solve problems for people such as yourself."
- Only when they ask for a call: "Anytime works, you can pick here https://call.urganize.app"

Short, loose punctuation, no polished marketing lines. Write like him from the first draft: he rejected polished drafts as "robotic". Reuse his phrases but never a product description from his old DMs. When anyone asks what Urganize is, use the description in step 2 of "Before you start", nothing older ("the team app for music release" went out once on 3 Nov and needed a correction).

Second replies stay short. If they say they'll check their calendar, "Sounds good. I'm flexible." is enough.

## Getting them to sign up

The link: https://team.urganize.app/auth?mode=signup (opens on "Create your account"). It only goes in a reply, never in the first DM: first DMs with a link got 0 of 2 replies.

When to send it: they say what they're working on, ask what Urganize is, or sound interested. Say what it is in one line (step 2 of "Before you start"), then the link, then that Oyin will let them in. Example, in his voice:

> Oh nice that's exciting. Urganize is where music teams work, from the idea to everything that comes after. Think of it like project management for the music industry. You can create your account here https://team.urganize.app/auth?mode=signup and I'll let you in once you're on. Let me know when you've signed up

After sending: add them to the log's "Waiting for Oyin to let them in" table and name them in your summary, so he lets them in and sends the WhatsApp message from `/admin`. If they say they've signed up, flag it to him straight away.

## Names

- Use the first name from the profile. If it's unclear, say so when you show the draft. Examples: "Wilson Mary Oluwayemisi" (used Mary), "Tayebwa David" (Ugandan names often put the surname first, so used David), "rodricci ." (no real name, so no name).
- Never guess a name from a handle.

## Inbox replies

1. Open `/messaging/?filter=unread`. Opening a thread marks it read, so list every thread you open in case one gets missed. Threads you opened earlier in the session won't show as unread any more, so add them by hand.
2. Read each thread's last messages before drafting. If they asked a question, answer it. If they named a release or sound interested, send the sign-up link (see "Getting them to sign up"). Offer a call only if they ask for one; calls already booked stay booked.
3. Skip chats that have ended ("Alright thank you", "Thanks"). Don't reply just to have the last word.
4. Never guess a fact about Oyin or the company. If they ask something you can't find in the thread or memory (e.g. "Does Tangent end with a demo day?"), leave a gap in the draft and ask him.
5. Old threads: say what you can't tell. E.g. a call agreed months ago with no follow-up: did it happen? Flag it when you show the draft.
6. Lay out drafts as: name, what they said (one line, their words), then the draft. Then wait for his yes.
7. Right before sending, re-read the last message in the thread. People reply while you work, and the draft may no longer fit.
8. Send, check each shows as "You: ..." in the thread, then check the Unread filter again: new replies usually come in during the run.
9. If someone says they can't get in after signing up, that's expected: sign-up is closed and Oyin lets people in himself. Tell them he'll let them in shortly, and add them to the log's "Waiting for Oyin to let them in" table.
10. When someone sends a phone number, add them to the WhatsApp follow-ups file straight away (name, number, who they are, date, what to say, Messaged? No). Never put numbers in the repo or the outreach log; the log only says "sent his number, Oyin to message". In your summary, tell Oyin to message them. When you ask someone for their number, add them under "Number asked".
11. LinkedIn only lets you edit a sent message for about an hour. After that, fix mistakes with a short follow-up, with his yes.

## Browser notes

- Message a person: read the `messaging/compose` link on their profile, open `/messaging/compose/?recipient=<id>`, check the "Remove <Name>" pill, click "Write a message", type, click Send, check the thread.
- Open an existing thread: `/messaging/?searchTerm=<name>`, then open the first result.
- When the pane isn't on screen, clicks can time out. Retry once after a short wait.
- The inbox list only draws about 10 rows while the window is hidden. Use search or the Unread filter, not scrolling.
- The safety check sometimes blocks a send once ("Real-World Transactions"). After Oyin's yes, retry once. If it blocks again, stop and tell him.
- After a send, the thread can take a few seconds to show the new message. Re-open the thread to check before you call it failed or send again.
