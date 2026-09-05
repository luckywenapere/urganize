/**
 * The activity pop-up's one-line read-only summary, rendered under the title:
 *
 *     Cover art final approved            <- the title
 *     To do · Midnight EP · Due in 11 days  <- this
 *
 * Before 2026-09-05 these facts were pills and text stacked ABOVE the title, so
 * the first thing the pop-up said was its metadata rather than its name. The
 * founder asked for Google Calendar's shape instead: title first, then one
 * quiet line, then bare icon+value rows.
 *
 * It lives here rather than inside TaskDetailView because vitest collects
 * `lib/**\/*.test.ts` and this repo has no component tests (node environment,
 * no jsdom) — the same reason task-search, release-menu, app-pages and
 * release-search are all lib modules.
 *
 * Pure: no React, no I/O, no env reads. The caller supplies already-formatted
 * strings (`getTaskStatusLabel`, `getRelativeDueLabel`) so the wording rules
 * stay in `lib/tasks.ts` and this module only decides what appears and in what
 * order.
 */

export type TaskSubtitleTone = 'default' | 'overdue';

export type TaskSubtitleSegment = {
  text: string;
  tone: TaskSubtitleTone;
};

export type TaskSubtitleInput = {
  /** From `getTaskStatusLabel` — "To do", "In progress", "Done"… */
  statusLabel: string;
  /** `task.taskType === 'event_milestone'`, via `isEventMilestone`. */
  isEventMilestone: boolean;
  /** `task.release.title`, or the release store's answer for `releaseId`. */
  releaseTitle: string | null;
  /** From `getRelativeDueLabel` — "Due in 11 days", "Due today"… */
  dueLabel: string;
  isOverdue: boolean;
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Build the subtitle's segments, in order, skipping anything absent.
 *
 * The component joins these with a "·", so a segment that is present but empty
 * would render as an orphaned separator — hence every value is trimmed and
 * dropped when blank rather than passed through.
 *
 * Only the due segment can carry the overdue tone: it is the only one that
 * describes time, and colouring the release or the status red would say
 * something the data does not.
 */
export function buildTaskDetailSubtitle(input: TaskSubtitleInput): TaskSubtitleSegment[] {
  const segments: TaskSubtitleSegment[] = [];

  const statusLabel = clean(input.statusLabel);
  if (statusLabel) {
    segments.push({ text: statusLabel, tone: 'default' });
  }

  // Kept from the old header's "Event" pill: a dated milestone reads
  // differently from work, and that was the only thing saying so.
  if (input.isEventMilestone) {
    segments.push({ text: 'Event', tone: 'default' });
  }

  const releaseTitle = clean(input.releaseTitle);
  if (releaseTitle) {
    segments.push({ text: releaseTitle, tone: 'default' });
  }

  const dueLabel = clean(input.dueLabel);
  if (dueLabel) {
    segments.push({ text: dueLabel, tone: input.isOverdue ? 'overdue' : 'default' });
  }

  return segments;
}
