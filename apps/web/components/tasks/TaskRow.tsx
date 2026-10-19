'use client';

import { shouldActivateRow } from '@/lib/row-activation';
import { CalendarDays, Lock } from '@/components/icons';
import {
  formatMilestoneDate,
  getRelativeDueLabel,
  getTaskStatusLabel,
  getTaskStatusTone,
  isEventMilestone,
  type Task,
  type WorkspaceMember,
} from '@/lib/tasks';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';

function AssigneeAvatar({ member, size = 'sm' }: { member: WorkspaceMember; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-[18px] w-[18px] text-[9px]' : 'h-6 w-6 text-[11px]';
  const displayName = member.name || member.email || 'Member';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand/15 font-semibold uppercase tracking-[0.04em] text-brand ring-1 ring-inset ring-brand/30 ${dim}`}
      title={displayName}
      aria-label={`Assigned to ${displayName}`}
    >
      {member.initials || 'U'}
    </span>
  );
}

function GroupTagPill({
  name,
  color,
  size = 'sm',
}: {
  name: string;
  color: string;
  size?: 'sm' | 'md';
}) {
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px] max-w-[88px]' : 'px-2.5 py-1 text-[11px] max-w-[160px]';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-elevated font-medium text-content-secondary ${padding}`}
      title={name}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

type TaskRowProps = {
  task: Task;
  onClick?: (task: Task) => void;
  /** Receives the blocker text when the user clicks the completion checkbox
   * on a task that can't be marked done yet. Parent should surface via toast. */
  onBlocker?: (message: string) => void;
  /** Layout density. `comfortable` (default) is the wide release-detail layout:
   * single row, status badge on the right, release pill inline with the title,
   * assignee in the meta line. `compact` is the narrow workspace-panel layout:
   * a single line (checkbox, title, meta pinned right), no status badge / no
   * release pill — the surrounding workspace already shows scope context. */
  density?: 'compact' | 'comfortable';
  /** The first open task of a smaller plan (URG-318): accent edge and a
   *  "Start here" label. */
  startHere?: boolean;
};

function getAssigneeLabel(task: Task): string {
  if (task.assignee?.name) {
    return task.assignee.name;
  }

  return task.assignee?.email || 'Unassigned';
}

export function TaskRow({ task, onClick, onBlocker, density = 'comfortable', startHere = false }: TaskRowProps) {
  const due = getRelativeDueLabel(task);
  const isLocked = task.status === 'locked';
  const isMilestone = isEventMilestone(task);
  // Left-border accent: locked (muted gray, "not ready"), event milestones
  // (info blue, "dated point"), neutral otherwise. Priority coloring was
  // removed 2026-07-23 — the priority feature is gone from the UI entirely.
  // "Start here" (URG-318): a smaller plan's first open task takes the accent.
  const borderClass = startHere
    ? 'border-l-brand'
    : isLocked
    ? 'border-l-stroke-default'
    : isMilestone
      ? 'border-l-status-info'
      : 'border-l-stroke-subtle';

  const isCompact = density === 'compact';
  const titleClass = `truncate text-sm font-semibold ${
    isLocked ? 'text-content-secondary' : 'text-content-primary'
  } ${task.status === 'done' ? 'line-through' : ''} ${task.status === 'cancelled' ? 'line-through opacity-55' : ''}`;

  const interactionHandlers = {
    onClick: () => onClick?.(task),
    role: onClick ? ('button' as const) : undefined,
    tabIndex: onClick ? 0 : undefined,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (onClick && shouldActivateRow(event)) {
        event.preventDefault();
        onClick(task);
      }
    },
  };

  if (isCompact) {
    // One-line layout: [checkbox] [title — flex-1 + truncate] [meta — shrink-0
    // pinned right]. The title is the only flexible track; the meta cluster
    // (due label + lock icon) is shrink-0 so the date never
    // wraps and never gets clipped. At the narrow workspace-panel widths
    // (~280–340px on mobile), long titles like
    // "Identify 3 priority playlists/curators to pitch" truncate with ellipsis
    // while "32 days overdue" stays fully visible on the right.
    //
    // Color semantics unchanged: overdue stays red (status-error), catch-up
    // stays neutral (the existing isOverdue=false on compressed-runway tasks
    // suppresses the red), milestone date stays info-blue, completion stays
    // strikethrough. Only the POSITION moves vs. the previous two-line stack.
    return (
      <div
        className={`group flex items-center gap-3 border-l-4 border-t border-stroke-subtle bg-bg-surface px-4 py-2.5 transition first:border-t-0 motion-focus ${borderClass} ${
          onClick ? 'hover:bg-bg-hover' : ''
        } ${isLocked ? 'bg-bg-surface/60' : ''}`}
        {...interactionHandlers}
        data-ph-capture-attribute-section="tasks"
      >
        <TaskCompletionCheckbox
          taskId={task.id}
          status={task.status}
          onBlocker={onBlocker}
          taskTitle={task.title}
          disabled={task.pendingSync}
        />
        <p
          className={`min-w-0 flex-1 ${titleClass}`}
          title={task.title}
        >
          {task.title}
        </p>
        <div className="flex shrink-0 items-center gap-2 text-xs text-content-secondary">
          {startHere ? (
            <span className="whitespace-nowrap font-mono text-[11px] text-brand">Start here</span>
          ) : null}
          {task.assignee ? <AssigneeAvatar member={task.assignee} size="sm" /> : null}
          {task.groupName ? (
            <GroupTagPill
              name={task.groupName}
              color={task.groupColor || '#64748B'}
              size="sm"
            />
          ) : null}
          {isMilestone ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-status-info">
              <CalendarDays className="h-3 w-3" aria-label="Event milestone" />
              {formatMilestoneDate(task.dueDate)}
            </span>
          ) : (
            due.label ? (
              <span
                className={`whitespace-nowrap font-mono ${due.isOverdue ? 'font-semibold text-status-error' : ''}`}
              >
                {due.label}
              </span>
            ) : task.status === 'cancelled' ? (
              // Closed work carries no due copy (URG-389); a cancelled row says
              // what happened instead, quietly, so search results read clearly.
              <span className="whitespace-nowrap font-mono uppercase tracking-wide text-content-tertiary">Cancelled</span>
            ) : null
          )}
          {isLocked ? (
            <Lock
              className="h-3 w-3 text-content-tertiary"
              aria-label="Locked. Waiting on an earlier activity."
            />
          ) : null}
        </div>
      </div>
    );
  }

  // Comfortable (default) — release-detail page layout.
  return (
    <div
      className={`group flex min-h-[76px] items-center gap-4 border-l-4 border-t border-stroke-subtle bg-bg-surface px-4 py-3.5 transition first:border-t-0 motion-focus ${borderClass} ${
        onClick ? 'hover:bg-bg-hover' : ''
      } ${isLocked ? 'bg-bg-surface/60' : ''}`}
      {...interactionHandlers}
      data-ph-capture-attribute-section="tasks"
    >
      <TaskCompletionCheckbox
        taskId={task.id}
        status={task.status}
        onBlocker={onBlocker}
        taskTitle={task.title}
        disabled={task.pendingSync}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-content-tertiary"
              aria-label="Locked. Waiting on an earlier activity."
            />
          ) : isMilestone ? (
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-status-info"
              aria-label="Event milestone"
            />
          ) : null}
          <p className={titleClass} title={task.title}>
            {task.title}
          </p>
          {task.pendingSync ? (
            <span className="shrink-0 rounded-full border border-stroke-default bg-bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-content-tertiary">
              Waiting to sync
            </span>
          ) : null}
          {task.groupName ? (
            <GroupTagPill
              name={task.groupName}
              color={task.groupColor || '#64748B'}
              size="md"
            />
          ) : null}
          {task.release ? (
            <span className="hidden rounded-full border border-stroke-default bg-bg-elevated px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-content-secondary sm:inline-flex">
              {task.release.title}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
          {task.assignee ? <AssigneeAvatar member={task.assignee} size="sm" /> : null}
          <span>{getAssigneeLabel(task)}</span>
          {isMilestone ? (
            <>
              <span className="text-content-tertiary">•</span>
              <span className="font-mono text-status-info">{formatMilestoneDate(task.dueDate)}</span>
            </>
          ) : due.label ? (
            <>
              <span className="text-content-tertiary">•</span>
              <span className={`font-mono ${due.isOverdue ? 'font-semibold text-status-error' : ''}`}>{due.label}</span>
            </>
          ) : null}
        </div>
      </div>

      <StatusBadge label={getTaskStatusLabel(task.status)} tone={getTaskStatusTone(task.status)} size="sm" />
    </div>
  );
}
