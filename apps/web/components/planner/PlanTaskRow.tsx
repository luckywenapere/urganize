'use client';

import { useState } from 'react';
import { CalendarClock, RotateCcw, Trash2, Undo2 } from 'lucide-react';

import { TaskMemberCombobox } from '@/components/tasks/TaskMemberCombobox';
import type { WorkspaceMember } from '@/lib/tasks';
import {
  computeTaskYmd,
  offsetFromTaskYmd,
  type DraftTask,
} from '@/lib/release-planning';

/**
 * One editable row of the draft plan.
 *
 * Dates are shown absolute and stored as an offset from release day. That is
 * what lets the whole plan re-flow for free when a release date moves, and it
 * is why editing the date field converts back to an offset here rather than
 * storing what the input said.
 */

type PlanTaskRowProps = {
  task: DraftTask;
  releaseDate: string | null;
  members: WorkspaceMember[];
  disabled?: boolean;
  onChange: (changes: Partial<DraftTask>) => void;
  onRemove: () => void;
  onRestore: () => void;
};

const ghostInputClass =
  'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[16px] font-medium text-content-primary outline-none transition-colors placeholder:text-content-tertiary hover:border-stroke-default focus:border-brand sm:text-sm';

const ghostWhyClass =
  'w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-xs leading-5 text-content-secondary outline-none transition-colors placeholder:text-content-tertiary hover:border-stroke-default focus:border-brand';

function offsetLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Release day';
  if (offsetDays < 0) return `D-${Math.abs(offsetDays)}`;
  return `D+${offsetDays}`;
}

export function PlanTaskRow({
  task,
  releaseDate,
  members,
  disabled,
  onChange,
  onRemove,
  onRestore,
}: PlanTaskRowProps) {
  const dateYmd = releaseDate ? computeTaskYmd(releaseDate, task.offset_days) : null;
  const selectedMember =
    members.find((member) => member.userId && member.userId === task.assignee_user_id) || null;

  // Seeded from the assignee this row actually has, not left blank. An
  // unseeded input rendered the "Nobody yet" placeholder over an assigned
  // activity, and — until the blur fix in TaskMemberCombobox — tabbing
  // through the row committed that emptiness as a real unassign.
  // `undefined` means "not edited yet", so a later edit still wins.
  const [memberQueryDraft, setMemberQueryDraft] = useState<string | undefined>(undefined);
  const memberQuery = memberQueryDraft ?? selectedMember?.name ?? '';

  if (task.removed) {
    return (
      <div className="flex items-center gap-3 border-b border-stroke-subtle px-2 py-2.5 last:border-b-0">
        <p className="min-w-0 flex-1 truncate text-sm text-content-tertiary line-through">
          {task.title || 'Untitled task'}
        </p>
        {task.removed_by === 'ai' ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
            Dropped
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRestore}
          disabled={disabled}
          className="motion-focus grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:text-content-primary disabled:opacity-60"
          aria-label={`Put back: ${task.title || 'Untitled task'}`}
          title="Put this back"
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-stroke-subtle py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={task.title}
            onChange={(event) => onChange({ title: event.target.value })}
            disabled={disabled}
            className={ghostInputClass}
            placeholder="What needs to happen?"
            maxLength={140}
            aria-label="Task title"
          />
          <textarea
            value={task.why}
            onChange={(event) => onChange({ why: event.target.value })}
            disabled={disabled}
            rows={2}
            className={ghostWhyClass}
            placeholder="Why this matters"
            maxLength={600}
            aria-label="Why this matters"
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="motion-focus grid h-11 w-11 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:text-status-error disabled:opacity-60"
          aria-label={`Remove task: ${task.title || 'Untitled task'}`}
          title="Remove this task"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 px-2">
        <label className="flex items-center gap-2">
          <span className="sr-only">Due date</span>
          <CalendarClock className="h-3.5 w-3.5 text-content-tertiary" aria-hidden="true" />
          {dateYmd ? (
            <input
              type="date"
              value={dateYmd}
              onChange={(event) => {
                if (!releaseDate || !event.target.value) return;
                const nextOffset = offsetFromTaskYmd(releaseDate, event.target.value);
                if (nextOffset === null) return;
                onChange({ offset_days: nextOffset });
              }}
              disabled={disabled}
              className="rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] text-content-secondary outline-none transition-colors hover:border-stroke-default focus:border-brand"
            />
          ) : (
            <span className="font-mono text-[11px] text-content-tertiary">
              {offsetLabel(task.offset_days)}
            </span>
          )}
          {dateYmd ? (
            <span className="font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
              {offsetLabel(task.offset_days)}
            </span>
          ) : null}
        </label>

        <div className="min-w-[10rem] flex-1">
          <TaskMemberCombobox
            members={members}
            selectedMember={selectedMember}
            query={memberQuery}
            onQueryChange={setMemberQueryDraft}
            onSelectMember={(member) => onChange({ assignee_user_id: member?.userId || null })}
            label="Assign someone"
            placeholder="Nobody yet"
            density="compact"
          />
        </div>

        {task.task_type === 'event_milestone' ? (
          <span className="rounded-full border border-status-info/30 bg-status-info/10 px-2 py-px font-mono text-[10px] uppercase tracking-wide text-status-info">
            Event
          </span>
        ) : null}

        {task.origin === 'user' ? (
          <span className="font-mono text-[10px] uppercase tracking-wide text-content-tertiary">
            Yours
          </span>
        ) : task.edited ? (
          <span
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-content-tertiary"
            title="Redrafting this phase leaves your edit alone"
          >
            <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
            Edited
          </span>
        ) : null}
      </div>
    </div>
  );
}
