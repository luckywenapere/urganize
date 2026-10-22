# Email from the admin, and the onboarding sequence (2026-09-30, flag-off)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Two founder asks in one. First: *"i need a way for us to send email through the
urganize admin dashboard"*. Second, from meeting notes about warming up the new
sending domain before any newsletter exists: a short onboarding sequence for
new signups (a welcome with the founder's story, a yes-or-no question in the
middle to get replies, a check-in at the end, and a request to mark the first
email as important). Replies and opens are what give a young domain a good
reputation, and that is why the sequence is written to be replied to.

**Founder decisions, asked before building:** the sequence goes to new signups
only; the admin can write to everyone, a group, one person, or the waitlist; I
draft the sequence copy and the founder approves it; the copy lives in code;
five emails on days 1, 2, 3, 5 and 7; and day 1 tells the founder's own story,
in his words, lightly edited.

**Two new admin pages**, both linked from `/admin/emails` (buttons under its
heading) and from a new Emails card on the admin hub:

- `/admin/emails/new`, the composer: pick who gets it, write it, preview it,
  send yourself a test, then send, with a two-step confirm that names the count.
- `/admin/emails/sequence`, the five onboarding emails: whether the sequence is
  on, how many of each have gone out or are waiting, a preview of each, and a
  test send of each.

**Not a scope expansion.** The admin pages are internal (the `/admin/broadcast`
precedent), and lifecycle email sits inside "transactional email is fine" on the
out-of-scope list. No client flag. The sequence is behind the server-only
`EMAIL_ONBOARDING_SEQUENCE`, and only the literal word `on` switches it on.
Migration `20260930120000_email_outbox.sql` (two tables and a counts function)
**was not applied anywhere at the time of writing.**

### Twelve things worth knowing before editing this

1. **One queue, one sender.** Everything that goes out later (sequence days 2
   to 7, and every admin email) is a row in `email_outbox`, drained by
   `drainEmailOutbox` in `lib/email/outbox-server.ts`. It runs from the morning
   cron (`/api/cron/notifications`, 08:00 UTC, about 09:00 Lagos; the route now
   has `maxDuration = 60` and gives the drain 40 seconds and 80 sends) and from
   the composer's send button (`.../broadcasts/[broadcastId]/send`, 20 seconds
   and 40 sends, that email only), which the page calls in a loop until it is
   done or the day's limit stops it. The decisions are pure in
   `lib/email/outbox.ts` (29 tests); `outbox-server.test.ts` drives the real
   drain against an in-memory database.
2. **At most once, by construction.** A row is claimed (`queued` to `sending`)
   by a conditional update before it is sent, so a second sender running at the
   same moment gets nothing. Each send carries a Resend `Idempotency-Key` of
   `outbox-<row id>`, which Resend honours for 24 hours, so a retry after an
   unclear timeout cannot deliver twice. A claim left in `sending` for more than
   15 minutes (a sender that died) is marked `failed` with `interrupted` rather
   than sent again: for this mail, at most once beats at least once.
3. **THE DAILY LIMIT IS SHARED, AND EVERYDAY MAIL COMES FIRST.** The free plan's
   100 a day covers every email the app sends, invites and assignment notes
   included. The budget is `EMAIL_DAILY_LIMIT` (default 100) minus what
   `email_log` shows sent since UTC midnight, and queued mail only uses what is
   left after a reserve: the sequence keeps 10 back, an admin email keeps 25
   back. So an email to everyone can never stop a teammate's invite going out;
   what does not fit goes on the next morning's cron. An unreadable count STOPS
   the run instead of guessing zero, because going over the limit would block
   invites for the rest of the day. A Resend 429 puts the row back with no
   attempt spent and stops the run.
4. **How a failed send is sorted.** Suppressed (unsubscribed, bounced,
   complained): `skipped`, and for a sequence row that person's remaining steps
   are cancelled. Any other 4xx, or our own template failing to render:
   `failed`, because sending again cannot fix it. A 5xx, a timeout or a dropped
   connection: back in the queue an hour later, up to 3 attempts.
5. **Day 1 goes out at signup, in place of the welcome email**, from the same
   point in `/api/user/onboarding`; days 2 to 7 are queued only if day 1 was not
   suppressed. Flag off, that route sends the one welcome email exactly as
   before and queues nothing. Invited teammates never reach this route (the
   invite accept marks onboarding complete itself), which is the "new signups
   only" answer by construction.
6. **Due times are Lagos calendar days**, not 24-hour offsets
   (`onboardingDueAt`): day N is due at the start of the (N-1)th Lagos day after
   signup, so day 2 arrives the next morning whatever time someone signed up.
   Lagos is UTC+1 all year, so a fixed offset is exact. **A person gets at most
   one sequence email per run**, so a missed cron day never delivers a pile, and
   a step more than 4 days late is cancelled (`too_late`) rather than sent out of
   order ("tomorrow I'll ask you..." arriving after the question).
7. **Switching the flag off PAUSES queued sequence rows; nothing is deleted.**
   They are left out of the drain's read entirely (not merely skipped), so a long
   pause cannot fill the 300-row page and crowd admin emails out. Switching it
   back on resumes them, and the 4-day rule then drops any that are too late.
   Each step's row has the unique dedupe key `onboarding:<user>:<step>`, so
   finishing signup twice cannot queue it twice.
8. **The copy is ALL in `lib/email/onboarding-sequence.ts`**, written as
   note-text (`lib/email/note-text.ts`): a blank line starts a paragraph, a
   single line break stays one, and `[words](url)` or a bare https URL becomes a
   link. Only http(s) and mailto are ever linked, so a pasted `javascript:` link
   stays plain words. The composer takes exactly the same format.
   `FounderNote.tsx` adds "Hey <first name>," and the "Lucky / Founder,
   Urganize" sign-off, in the founder-note register: no button, no banner, a
   personal-looking email, which is also what a young sending domain needs to
   look like to a spam filter. The positioning and rollout-vocabulary guards
   both scan the new files.
9. **Audiences** (`lib/email/audience.ts`, `audience-server.ts`): everyone (every
   non-curator account with an email); a group (on a trial, paying, trial ended,
   joined in the last N days with N from 1 to 365, or no rollout yet); one
   person; or the waitlist (the marketing site's Neon `User` table, minus
   addresses that already have accounts). **The three billing groups count team
   OWNERS only, resolved by `resolveAdminTeamAccess` (`lib/admin-team-access.ts`),
   which was extracted from `/api/admin/teams` in this change** so the composer
   and the Teams page cannot disagree about who is on a trial, including the
   rule that an owner's own empty team does not count while they belong to
   someone else's. Suppressed addresses (scope `all` or `announcements`) are
   dropped and counted; 5,000 recipients at most per email.
10. **An admin email is a header row plus one outbox row per person.**
    `email_broadcasts` holds the words and the audience; each recipient row's
    dedupe key is `broadcast:<id>:<email>`; if queueing the rows fails, the
    header is deleted so nothing half-made is left. Stop cancels what has not
    gone yet. The composer shows the real count before anything is sent, a
    preview rendered by the same template in a sandboxed frame, and a test sent
    to the admin's own address with "[Test] " in front of the subject.
11. **Links in founder notes changed, and it reaches the LIVE welcome email.**
    `AccentLink` is underlined now (in these emails the link is the call to
    action, and its colour sits close to the body text), and
    `word-break: break-all` is gone: it split words inside links on phones,
    measured at 360 to 390px ("Whats" / "App"). The link now wraps at a space
    and only breaks inside a word that cannot fit on a line by itself (a long
    URL). react-email's `Link` sets `textDecorationLine: 'none'`, so the
    component overrides that key in place. A render test pins both, and it fails
    with the old style put back.
12. **Written by a person, not generated.** There is no AI anywhere in this.

**Small changes on the way:** `verifyAdmin` also returns the admin's own email
(where tests go); `EmailSendResult` carries a `reason` on a skipped send and
`sendEmail` takes `batchId` and `subjectPrefix`; the admin hub's skeleton
reserved 8 cards for 9 and now reads the real count (10 with the Emails card).

**Flagged, not fixed:** `placeholderCopy` in `lib/email/registry.ts` is declared
on every template and read by nothing, although its comment says PR 2 and 3
enforce it. The sequence's real gate is its env flag.

**Doc drift backfilled:** the react-email rebuild (#617), unsubscribe,
suppressions and the delivery webhook (#634), and the `/admin/emails` log page
(#636) shipped with no section here, and "External services" still said email
was not wired up. That line is corrected, and the `.env.example` email block now
also documents `RESEND_WEBHOOK_SECRET` and `EMAIL_UNSUBSCRIBE_SECRET`, including
the trap that while the second is unset, rotating `RESEND_API_KEY` breaks every
unsubscribe link already sent.

### Verified

Rebased onto v1.54.0, whose accessibility pass (#647) added checks this work had
to meet: `field-border-guard` flagged the composer's five fields for the old
hairline outline (now `border-stroke-control`, like every field), and the two
pages' status messages now go through one always-mounted `aria-live` region
(that pass's rule 6), with a sequence test's result shown under its own email
rather than at the top of the page. After that: vitest 282 files and 5,516
tests passed, 68 skipped. ESLint: zero new findings, checked file by file for
all 51 changed files against `main`'s copies (the one warning on
`EmailsAdminPageClient.tsx` is the one `main` already carries). `tsc --noEmit`: only the 8 documented
`confirmed-action.test.ts` errors. `next build` green by exit code, with
`/auth`, `/dashboard`, `/locked`, `/onboarding` and `/settings` still static,
the three new admin pages static and the new API routes dynamic. On the dev
server every new route loads and stops at `verifyAdmin` first (this local env
has no `ADMIN_EMAILS`, so each answers the same "not configured" 500 as the
existing `/api/admin/emails`), with no server errors. The five emails and a
sample admin email were rendered and looked at in Chrome at desktop width and
at 375px, and measured at 320, 360, 375, 390 and 414px: no sideways scrolling
and no word split inside a link.

### Not verified

Nothing has run against the real database, because the migration is not
applied: no admin email has been created or sent, no outbox row drained, and no
real signup has started the sequence. No email from this code has reached a
real inbox. The two admin pages have not rendered with a real admin session.

### Activation checklist

1. Apply `supabase/migrations/20260930120000_email_outbox.sql`.
2. The composer works as soon as the migration is in. Send yourself one first.
3. Open `/admin/emails/sequence`, read the five emails, and send yourself a test
   of each.
4. When happy with the copy, set `EMAIL_ONBOARDING_SEQUENCE=on` on the Vercel
   `Web` project (Production, not sensitive) and redeploy, since Vercel reads env
   per deployment. From then on each new signup gets day 1 straight away and the
   rest on the following mornings.
5. The free plan is the ceiling: an email to more than about 75 people takes
   more than a day to go out, by design. Upgrading Resend lifts it; set
   `EMAIL_DAILY_LIMIT` to the new plan's daily figure afterwards.
6. No changelog entry: the admin pages are internal, and the sequence is
   lifecycle email rather than something a person does in the app. If it is
   ever worth announcing, the entry lands at the flip (the EPK precedent).
