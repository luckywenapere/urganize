# WhatsApp chasing (2026-10-26)

UrgAns messages the owner of a task on WhatsApp when it is due tomorrow, due today or late, and acts on the reply (Done, Need more time plus a date, Not mine). Mocks approved by the founder the same day. Built, not yet connected: nothing sends until the Twilio env below is set and a team switches it on.

## What it is

- **Opt-in first.** A person gets one welcome message and is chased only after replying YES. STOP ends it. A changed number goes back to pending.
- **One chase per person per day**, for their most urgent task. The unique index `whatsapp_messages_chase_once` (task, kind, Lagos day) is claimed before the send, so a re-run cannot double-send.
- **The sweep rides the daily cron** (`/api/cron/due-date-notifications`, 07:00 UTC = 08:00 Lagos), like every other sweep, because the Hobby plan has one run a day. The mock said 09:00; it is 08:00. Quiet hours 21:00 to 08:00 Lagos are enforced in code. Late tasks stop being chased after 14 days.
- **Replies** arrive at `POST /api/webhooks/whatsapp` (Twilio signature checked; 404 when `TWILIO_AUTH_TOKEN` is unset). Done, a date, and Not mine are read by `lib/whatsapp/reply-intent.ts` with no model. Anything else goes to an AI that can only reply with text; it cannot change tasks. Duplicates are dropped by Twilio's message id.
- **Bring your own AI.** Settings > UrgAns. Provider (OpenAI, Anthropic, OpenRouter, or any OpenAI-compatible https address), model, key. All go through the chat-completions shape in `lib/whatsapp/byo-ai.ts`. The key is AES-256-GCM encrypted (`lib/whatsapp/secret.ts`, key from `WHATSAPP_KEY_SECRET`), write-only, and used only for that team's WhatsApp replies. If it fails, the reply falls back to Urganize AI, then to "I passed that on".

## Files

- `supabase/migrations/20261026140000_whatsapp_chasing.sql`: `whatsapp_settings`, `whatsapp_contacts`, `whatsapp_messages`. RLS on, no policies, service role only.
- `apps/web/lib/whatsapp/`: `phone`, `chase-rules`, `reply-intent`, `secret`, `byo-ai`, `transport` (Twilio), `server` (settings, contacts, sweep, replies). Tests in `whatsapp.test.ts`.
- `app/api/workspace/whatsapp/` (settings), `.../contacts` (number + welcome), `.../test-key`; `app/api/webhooks/whatsapp`.
- `components/settings/WhatsappChasingSection.tsx`, shown in the UrgAns segment. The segment now shows for managers even with the team brief flag off (`lib/settings-nav.ts`); the brief itself still waits on its flag.

## Env to set (Vercel, product app)

| Name | What |
|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | the Twilio account |
| `WHATSAPP_FROM` | `whatsapp:+14155238886` for the sandbox, the approved number later |
| `WHATSAPP_KEY_SECRET` | 16+ random characters; without it "bring your own key" refuses to save |
| `WHATSAPP_WEBHOOK_URL` | `https://app.urganize.app/api/webhooks/whatsapp`, so the signature check uses the URL Twilio signed |
| `WHATSAPP_OPTIN_CONTENT_SID`, `WHATSAPP_CHASE_CONTENT_SID` | approved templates (see below); optional in the sandbox |

In Twilio, point the WhatsApp sender's "when a message comes in" URL at the webhook.

## Traps

- **24-hour window.** Free text only reaches a person within 24 hours of their last message. A morning chase is almost always outside it, so production needs the two approved templates. Without them the send fails and is logged as `failed` on the message row (and the day's slot is spent). The sandbox has the same window and a "join" step per phone.
  - Chase template, 3 variables: `Hi {{1}}. "{{2}}" is due {{3}}. Is it done? Reply Done, Need more time, or Not mine.` Ideally with quick-reply buttons Done / Need more time / Not mine (the button text arrives as `ButtonText`).
  - Opt-in template, 2 variables: `Hi {{1}}, {{2}} added you to a team on Urganize. I'll message you here about tasks that are yours. Reply YES to allow it, or STOP any time.`
- **Meta's cost (third-party figure, not checked with Meta):** from 1 Oct 2026 messages inside the window are billed too, first 1,000 service messages per number per month free. Check Meta's own price page before launch.
- **Meta's AI policy.** General-purpose AI assistants are restricted on the API. A task reminder for a business should be fine; re-read the terms before going live.
- **One number per person, one team per number.** `whatsapp_contacts` is unique on user and on phone. A person on two teams is chased under the team that added them first.
- **Credits are not charged.** The mock said Urganize AI "uses your credits"; v1 does not meter these replies. Add metering before turning it on for many teams.
- **Marking done** updates `tasks.status` and `completed_at` directly, like the task route does, and logs activity. It does not fire the status notification the app's own route fires.
- **Not verified live.** No Twilio account was connected, so nothing here has sent a real message. The pure logic (phone, dates, chase rules, reply reading, encryption, signature) is tested; the sweep, webhook and settings UI have been type-checked and linted only.

## Not done

Migration not applied. No changelog entry or version bump (it is not true for users until Twilio is connected). No Linear issue opened. Meta Cloud API transport is a later swap inside `transport.ts`.

## Meta Cloud API, Twilio as fallback (2026-11-07, #1119)

Messages now go through the Meta WhatsApp Cloud API directly when it is set up (`lib/whatsapp/meta.ts`), because Twilio adds about $0.005 on every message, in and out. Twilio stays as the fallback: it is used when Meta's env is missing, or when `WHATSAPP_PROVIDER=twilio` forces it. `whatsappProvider()` in `transport.ts` picks. Callers pass `template: { key, variables }`; on Meta the key names the template, on Twilio it picks the content SID.

- **Replies and delivery updates** arrive at `/api/webhooks/whatsapp/meta` (GET is Meta's one-time verify, POST is signed with the app secret, `X-Hub-Signature-256`). Delivered, read and failed are written onto the message row (`recordWhatsappStatus`), only ever moving forward, so the test can tell "not read" from "read and ignored".
- **Env (Vercel, product app):** `WHATSAPP_META_TOKEN` (permanent system-user token), `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_APP_SECRET`, `WHATSAPP_META_VERIFY_TOKEN`. Optional: `WHATSAPP_META_TEMPLATE_LANG` (default `en`), `WHATSAPP_META_TEMPLATE_OPT_IN` / `_CHASE` / `_POST_DAY` to rename a template.
- **Templates** (Utility, English), submitted under these names:
  - `urganize_opt_in`: `Hi {{1}}, {{2}} added you to their team on Urganize. I'll message you here when a task of yours is due. Reply YES to allow it, or STOP any time.` Quick replies: YES, STOP.
  - `urganize_task_chase`: `Hi {{1}}. "{{2}}" is due {{3}}. Is it done?` Quick replies: Done, Need more time, Not mine.
  - `urganize_post_day`: `Morning {{1}}. Post "{{2}}" for {{3}} today?` Quick replies: Done, Skip.
- **Trap: consent.** Meta wants opt-in before a business messages someone first. The opt-in template is itself a first message, sent because a manager typed the number. Safer: the teammate taps a wa.me link and sends YES first, which is both consent and an open 24-hour window. Not built.
- **Not verified live.** No Meta number was connected when this was written; the payloads, signature and webhook parsing are unit tested.

## Chase by number (2026-11-08, #1119, founder approved mock `docs/mocks/chase-by-number`)

A manager gives an activity to someone with just a name and a WhatsApp number; that person never signs up. Built because production had no team where a teammate with an account owned dated tasks (measured 7 Nov), so the 5-team test had nobody to chase.

- **Data:** the person is a My People profile made by `seedRelationship` (unclaimed, private); the task gets `assigned_person_id` and loses `assigned_to_user_id`; their number is a `whatsapp_contacts` row with `person_id` and `name` set and `user_id` null (check: exactly one of the two). `whatsapp_messages.person_id` files their messages. Migration `20261108100000_whatsapp_chase_by_number.sql`, applied 8 Nov (backups `whatsapp_contacts_backup_20261108`, `whatsapp_messages_backup_20261108`, both 0 rows).
- **Chasing:** the sweep treats them like a teammate, but only on tasks where `assigned_person_id` is theirs AND no teammate owns it (`ownedBy` in `server.ts`), so a task is never chased twice. No posting-plan nudges for them (posts are owned by users).
- **Who sees it:** "Someone not on Urganize" shows at the bottom of the assignee menu only when WhatsApp is set up on the server, the team switched chasing on, and the plan allows reminders (`canChaseByNumber`). That switch is how each test team is let in, one at a time, after the founder's yes. Owners and admins only.
- **Route:** `GET/POST/DELETE /api/tasks/[id]/whatsapp`. Picking a teammate or Unassigned takes the activity back from the person (DELETE); their contact and YES stay.
- **Trail:** under the assignee row, the number (masked), YES status and the last six messages with delivered/read.
- **Gaps:** the task list rows still show "Unassigned" for these activities (only the open activity shows the name). One number is one person on one team. Not clicked through in a browser: Docker would not start, so the local test app could not run.
