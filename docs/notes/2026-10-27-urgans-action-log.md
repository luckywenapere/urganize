# UrgAns action log and tool levels (2026-10-27, v1.196.0)

Founder asked for it on 27 Oct 2026: as UrgAns starts acting on its own (WhatsApp replies, check-ins, background work), every action must be traceable or teams will not trust it. The backend shipped first; the "What UrgAns did" list followed in v1.196.0 after the founder approved the mock the same day.

## What it is

- **One table, `public.urgans_action_log`** (`supabase/migrations/20261027130000_urgans_action_log.sql`, applied to production 27 Oct). One row per write: `source` (chat, voice, mcp, whatsapp, embedded, cron, memory), `trigger` (message, confirmed_card, whatsapp_reply, daily_sweep, button, apply, mcp_call), `tool`, `level`, `actor_user_id`, `workspace_id`, `release_id`, `object_type`, `object_id`, `args`, `before`, `after`, `confirmed`, `ok`, `summary`, `error`.
- **Append-only.** RLS on, no policies; `service_role` has SELECT and INSERT only (the default-privileges safety net granted everything, so the migration revokes first). Nobody can edit or delete a row through the API.
- **No foreign keys**, so a deleted release keeps its record.
- **Not** `urgans_actions` (the embedded draft/apply claim) and **not** `ai_usage_events` (cost). Both stay as they were.

## Tool levels

Every tool in the Chappi registry has `level`: `read`, `suggest`, `confirm` or `auto` (`ChappiTool.level`, required by the type). `tool-registry.test.ts` fails if a tool has none, and holds it to the real mechanisms: `read` if and only if `kind: 'read'`; `confirm` if and only if the tool has a `confirm` builder (the card gate in `runner.ts` is unchanged and still keys on the builder). `suggest` is for tools that open something and change nothing (`navigate`, `upload_cover_art`). Count on 27 Oct: 30 read, 2 suggest, 11 confirm, 33 auto, cut tools included. Only `confirm` and `auto` are logged.

## Where rows come from

| Door | How |
|---|---|
| Chat, model loop | `executeToolCall` in `lib/chappi/dispatch.ts` logs every confirm/auto tool, with a before and after snapshot |
| Confirmed card | same, `confirmed: true`, trigger `confirmed_card` (`app/api/urgans/route.ts`) |
| Voice call | same route, `x-urgans-surface: voice` sets `ctx.audit.source = 'voice'`; a spoken yes replays through the confirmed path |
| MCP | `app/api/mcp/route.ts` sets source `mcp` |
| WhatsApp reply | `lib/whatsapp/server.ts`: `whatsapp.mark_done`, `whatsapp.move_due_date` |
| Cron | the daily WhatsApp chase, `whatsapp.chase`, source `cron` |
| Embedded button | `lib/urgans-actions/server.ts`: one-shot runs (auto) and Apply (confirm). A two-step draft is not logged until it is applied |
| Memory | the memory session writes `source: 'memory'` rows through `logUrgansAction` |

Pure half: `lib/urgans-action-log.ts` (levels, sources, `resolveLogObject`, `capJson`, `buildActionLogRow`). Server half: `lib/urgans-action-log-server.ts` (`logUrgansAction`, `snapshotLogObject`). For anything new that UrgAns does outside the registry, call `logUrgansAction` once per write.

## Traps

- **Logging never breaks the action.** Every snapshot and insert is caught and reported. A missing row is a console error, not a failed tool.
- **Before and after are snapshots** of `tasks`, `releases`, `artists`, `notes` or `press_kits` by the most specific id in the args (task beats release beats artist). Other objects get only args and the result. Each snapshot is capped at 8,000 characters (bigger becomes `{ truncated, chars }`). A write costs two extra reads.
- **Uuid columns drop non-uuids**, so a made-up id from the model cannot fail the insert.
- **`workspace_id`** comes from the snapshot row when it has one, else the caller's first workspace. Treat it as a filter hint, not proof of ownership.
- **Known gap: the typed "mark X done" command** (`lib/chappi/task-status-command.ts`) runs in the browser through the normal task routes, so it is not logged. Closing it needs a header on those routes or moving the command server-side.

## What UrgAns did (the list, v1.196.0)

- **Where:** a rollout scene `urgans` (menu row "What UrgAns did", Manage group, History icon) and a section in Settings > UrgAns (`components/settings/UrgansActivitySection.tsx`, with a filter by person). One component: `components/urgans-activity/UrgansActivityList.tsx`.
- **Route:** `GET /api/urgans/activity` behind `requireUrgansAccess` (the credits guard requires it on every `/api/urgans` route). With `?releaseId=` it checks rollout read access and returns that rollout's rows. Without, it returns rows on every rollout the caller can see plus rows the caller asked for. A teammate's row with no rollout (an invite, an artist rename) is NOT shown, on purpose: the log's workspace_id is not proof of visibility. Last 30 days, 100 rows.
- **Words:** `lib/urgans-activity.ts` (`describeActivity`, `diffSnapshots`), tested. Times are Lagos time. Unknown tools fall back to the first sentence of the tool's summary.
- **No Undo.** The mock showed one on a WhatsApp row. It was left out: an undo is a write of its own and needs its own rules. Details shows the changed fields instead.
- **Settings only shows for people who see the UrgAns segment** (managers, or anyone while the team brief is on). Everyone sees the rollout scene.
- **Not seen signed in.** Checked locally only signed out (route 401, pages compile, no server errors); the log was empty in production when it shipped.

## Not done

- The typed "mark X done" command is not logged (see Traps).
- No Linear issue (free plan refuses new issues).
