# Assignment sends an email (2026-08-29, v1.5.0)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request, immediately after the invite fix: assigning an activity should
also email the assignee, and the email must read as if a person wrote it —
"very, very sleek, modern, polished... It should not seem automated or robotic."

**What fires on assignment is now three channels through ONE choke point:**
`createTaskNotification` (`lib/tasks-server.ts`) carries the bell row, the push
mirror, and — for `task_assigned` ONLY — the email. The type gate is
deliberate: due-date sweeps, status changes and comments stay push+bell, because
assignment is the one event low-frequency and high-consequence enough to earn an
inbox row, and it is the one that can otherwise land silently (push needs the
user to have enabled notifications; the bell is desktop-only). The email rides
the same unread-dedup guard as the other two channels, and like them it can
never fail the request: `sendEmail` never throws and no-ops without
`RESEND_API_KEY`/`EMAIL_FROM`.

**Four things worth knowing before editing this:**

1. **The register is the founder-note one, not the card one, and that is the
   brief.** `buildTaskAssignedEmail` (`lib/email-templates.ts`) follows the
   welcome email's documented rule for personal-reading mail — plain paragraphs,
   system font, white ground, NO ink logo banner — written in the ASSIGNER's
   voice ("<name> just handed you this one"), with exactly one designed element:
   a spring-bordered card carrying the activity title, a
   release · due · priority meta line, and the description's first line as a
   quoted note. A test pins the banner's absence, because the banner is the
   marker that flips personal mail back into product mail.
2. **The inbox row itself reads as the person, via `fromLabel`.** `sendEmail`
   gained an optional display-name override composed by `composeFromHeader`
   (pure, exported, tested): "<assigner> via Urganize <team@send.urganize.app>".
   Only the NAME half changes — the address stays the verified `EMAIL_FROM` one,
   so deliverability and DMARC are untouched. The label is user-controlled
   (`profiles.name`), so the composer strips angle brackets, quotes and line
   breaks and caps the length; the header-injection case is unit-tested. Do not
   bypass it by string-building a From header anywhere else.
3. **Create-with-assignee notifies now too.** Until this, only the PATCH
   reassignment fired `task_assigned` — creating an activity already assigned to
   a teammate (quick-create, or UrgAns's `create_task`) told nobody at all.
   `POST /api/tasks` now fires the same notification with the same guard
   (never when the creator assigns to themself, which is also every
   template-instantiated task, so plan generation still emails no one).
4. **The pure formatters live in `lib/email-templates.ts`, not tasks-server,
   because that is where tests can reach them.** `formatDueDateForEmail`
   (UTC on purpose — a date-only string must not shift a day),
   `priorityLabelForEmail` (only urgent/high earn a word), and
   `noteExcerptForEmail` (first non-empty line, capped). Nothing imports
   tasks-server in a unit test — it is too entangled — so the one untested
   piece is the `task_assigned` type gate itself, which is a single `if` beside
   the push mirror.

There is deliberately **no per-user email opt-out** (that would be a profiles
column and a Settings row for a channel doing at most a few sends a week at
current scale — principle 6); if assignment email volume ever grows into an
annoyance, that is the follow-up, alongside widening the type gate if other
events earn the inbox.

- **Verified:** 1584 tests (23 new across the template, the three formatters and
  `composeFromHeader` including its header-injection case), `eslint .` at the
  exact 3-error/66-warning baseline, `next build` green by exit code with
  `/auth`, `/onboarding`, `/settings` still `○ Static`.
- **Not verified:** no real email has been sent — this sandbox has no Resend
  key and cannot mint a session. Worth one live pass: assign an activity to a
  teammate and check the received mail's From line, the card, and that the
  button lands on the release. `EMAIL_FROM`/`RESEND_API_KEY` are already set in
  production (confirmed by the founder for v1.4.0), so this ships live with no
  activation step.
