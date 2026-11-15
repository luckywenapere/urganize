# One question a day in the morning brief (2026-11-15, v1.288.0, #1314, no flag)

Founder ask: something like an assistant that, on day 2, asks one short question about how you work, so people come back each day. Not a streak. Mock approved 15 Nov 2026: `docs/mocks/brief-daily-question/mock.html` (built by `build.js` next to it).

## How it works

- From the second brief on, the morning brief (#1207) may end with one question with tap answers. The answer goes into `profiles.brief_prefs` and the next brief follows it, with a line saying why ("Late work first, like you asked") and a Change button that opens Settings, Notifications.
- **The questions, in order** (`lib/chappi/brief-questions.ts`, pure, tested):
  1. `top`: what goes at the top (late work, release days, what the team did). Sets the order of the brief's parts.
  2. `artist`: which artist matters most this month (only with 2+ artists; up to 3 plus "all the same"). That artist's work goes first in each part. Asked again each new month.
  3. `horizon`: work due this week too, or only today. Only today drops anything due later than today from Needs you.
  4. `watch`: which teammate to keep an eye on (only with teammates seen on tasks; up to 3 plus "No one"). Adds a "Waiting on <name>" part with that person's late work.
- **Rules:** no question on the first brief; at most one a day; no answer or "Not now" means no question the next day; two skips in a row pause the questions for 7 days (`pausedUntil`); Settings has a switch (`questionsOff`) and lists every answer with Clear.
- **Code, not AI, writes the questions.** The AI wording call is unchanged (it rewrites only the opening line and the first step).

## Pieces

- Picking: `pickBriefQuestion` in the 8am job (`lib/chappi/morning-brief-server.ts`). Artists come from the Home load's releases, teammates from task assignees. The question is saved to the prefs BEFORE the brief goes into the chat, so a tap always finds it; a run that fails after saving offers the same question again on the next run, never a second one.
- **Every save goes through `updateBriefPrefs`** (`lib/chappi/brief-answers-server.ts`): `brief_prefs.rev` is bumped on each save, and a save only lands on the `rev` it read (`.eq('brief_prefs->>rev', ...)`, zero rows means read again, up to 4 tries). So the 8am job, a tap and Settings never undo each other.
- In Needs, urgency comes first (late, today, this week); the focus artist goes first only within the same urgency, so it never pushes late work out.
- The brief payload gains optional `question`, `order`, `because`, `waiting`, `waitingOn`. `MORNING_BRIEF_VERSION` stays 1 (all additive; `sanitizeMorningBrief` reads them).
- Answering: `POST /api/morning-brief/answer` `{ date, choiceId }`. The question is read from the stored brief (`morning_briefs.payload`), never from the browser; only today's question; one answer (the server's date decides, never the phone's clock; a closed question answers `closed: true` and the card hides it). A second tab that taps after the first gets the saved answer back (`already: true`) and shows it. Only the newest brief in the chat can be answered. The chat then adds the tap as the person's turn (`brief-answer-<date>`) and a fixed reply (`brief-ack-<date>`); the card finds its answer by that id.
- Settings: `GET/PATCH /api/morning-brief/prefs`, `components/settings/BriefQuestionsSection.tsx` under the Morning brief row.
- Both routes are open (`getAuthenticatedUser`): they touch only the caller's own profile, like the brief's own off switch. They live outside `/api/urgans/` because every route there must sit behind the AI gate (`credits-guard.test.ts`), and these are not AI.
- Migration `20261115120000_morning_brief_question.sql`: `profiles.brief_prefs jsonb not null default '{}'`.

## Differences from the mock

- No Undo button on the reply. After answering, the card says "Saved. Change it in Settings", and Settings clears any answer.
- Settings has Clear per answer, not edit. A cleared answer may be asked again.
- The focus artist sorts first; it does not hide other artists' dates.
- The mock's "after that" questions (for example how a release is doing, the day after it comes out) are not built: there is nothing to put in the brief for them yet.

## Not measured yet

Whether it brings people back. Nothing counts brief opens or answers yet.
