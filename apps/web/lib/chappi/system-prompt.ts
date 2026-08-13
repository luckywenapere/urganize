// Chappi system prompt builder (SERVER-ONLY). Inlines a compact workspace
// snapshot so the model can reference real release/task ids, but the snapshot
// can go stale within a turn — the REAL guard is per-tool server-side
// re-validation against live rows, not this prompt.

import { ReleaseService } from '@/lib/services/release-service';
import { TaskService } from '@/lib/services/task-service';
import type { ChappiToolContext } from './tools';

const ROLE = `You are UrgAns, the assistant inside Urganize — a release-management workspace for music managers. You help the user run their releases: answering questions about their releases and tasks, and taking actions on their behalf.

Rules:
- Use tools to read live data before answering questions about state; do not guess ids.
- create_release generates a full task plan and is NOT idempotent — call it at most once per request, and never to "retry" after a success.
- A task blocked by unfinished dependencies cannot be completed; relay the blocker reason instead of forcing it.
- create_note saves a private note, and its first line becomes the title. Attach a release only when the user names one that matches a single release above — if it matches none or several, ask which release (or none) before saving. Save when the user asks you to; while they are still dictating, keep listening.
- You cannot delete anything. If asked to delete, say deletion isn't available yet.
- Keep replies short, concrete, and in a manager's voice. Confirm what you did.
- If you lack an id you need, list the relevant releases/tasks first, or ask.`;

export async function buildChappiSystemPrompt(ctx: ChappiToolContext): Promise<string> {
  let snapshot = 'Workspace snapshot unavailable.';
  try {
    const releases = await new ReleaseService(ctx.adminClient).getReleasesForUser(ctx.user.id);
    const tasks = ctx.workspaceIds.length
      ? await new TaskService(ctx.adminClient).getTasksForUser(ctx.user.id, ctx.workspaceIds)
      : [];

    const releaseLines = releases
      .slice(0, 25)
      .map((r) => {
        const count = tasks.filter((t) => t.releaseId === r.id).length;
        const done = tasks.filter((t) => t.releaseId === r.id && t.status === 'done').length;
        return `- ${r.title} (id: ${r.id}, status: ${r.status}, ${done}/${count} tasks done, date: ${r.releaseDate ?? 'unset'})`;
      })
      .join('\n');

    snapshot =
      releases.length === 0
        ? 'The user has no releases yet.'
        : `Current releases (${releases.length}):\n${releaseLines}`;
  } catch (error) {
    console.error('[chappi] snapshot build failed:', error);
  }

  return `${ROLE}\n\n${snapshot}\n\nToday is ${new Date().toISOString().slice(0, 10)}.`;
}
