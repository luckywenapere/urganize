# Task attachments flagged off + Beta tags removed (2026-07-31, URG-203)

> Moved out of CLAUDE.md on 2026-10-22 (verbatim). "This file", "above", "below" and "the X section" in here refer to the old single CLAUDE.md: find the named section in docs/notes/README.md.

Founder request. Two independent changes, same PR.

- **"Beta" tags removed** from the Status and Assignee property rows in the task detail pop-up (`TaskDetailView.tsx`) — those two fields are no longer beta. The Attachments heading's own Beta tag was left in the JSX (now dead code, since the section it labels no longer renders by default) rather than deleted, since removing the flagged-off feature's UI in the same edit as un-flagging it would obscure the diff.
- **Task attachments flagged off**, mirroring the URG-182 file-storage precedent exactly: added `NEXT_PUBLIC_FEATURE_TASK_ATTACHMENTS`, default `false`. Task attachments (`task_attachments` table, `task-attachments` bucket) had shipped always-on with no flag since their original build — distinct from release-level file storage, which already has its own flag (`NEXT_PUBLIC_FEATURE_FILES`, URG-182).
  - **Gated:** the Attachments section in the task detail pop-up (upload control + file list), and both task-attachment API routes (`POST /api/tasks/[id]/attachments`, `DELETE /api/tasks/[id]/attachments/[attachmentId]`) — 404 when off.
  - **Not touched:** the `task_attachments` table, the `task-attachments` Storage bucket, and existing rows/objects. The combined task-detail read path (`loadTaskDetail` in `tasks-server.ts`, which still bundles comments + attachments + activity in one call) is untouched too — it's a read, and comments/activity are unrelated live features; the client simply doesn't render whatever attachments come back when the flag is off.
  - Re-enabling is a one-line env change (`NEXT_PUBLIC_FEATURE_TASK_ATTACHMENTS=true`); no migration either direction.
