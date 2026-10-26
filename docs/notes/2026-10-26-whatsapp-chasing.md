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
