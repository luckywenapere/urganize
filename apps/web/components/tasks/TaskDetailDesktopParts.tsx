'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, MoreHorizontal, Trash2 } from '@/components/icons';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { daysUntilDue, isClosedStatus } from '@/lib/tasks';
import { formatDayInWords } from '@/lib/task-detail-desktop';
import type { DependencyTaskSummary } from '@/components/tasks/TaskDependenciesSection';

// Pieces of the task pop-up's two-column layout on a computer (#1251). The
// phone keeps the single column in TaskDetailView.

/** A small labelled block in the right column: "Status", "Who", "Due". */
export function DesktopField({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="border-t border-stroke-subtle py-2.5 first:border-t-0 first:pt-0">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-content-tertiary">
          {label}
        </label>
      ) : (
        <p className="mb-1.5 text-xs font-semibold text-content-tertiary">{label}</p>
      )}
      {children}
      {hint ? <p className="mt-1 text-xs text-content-tertiary">{hint}</p> : null}
    </div>
  );
}

/** The boxed control in the right column: always visible, so it reads as a field. */
export const DESKTOP_CONTROL_CLASS =
  'motion-focus h-9 w-full appearance-none rounded-[10px] border border-stroke-default bg-bg-surface px-2.5 text-sm text-content-primary transition-colors [@media(hover:hover)]:hover:border-stroke-strong focus:border-brand';

/** "What to do about this now": the late or the blocked banner. */
export function DesktopBanner({
  tone,
  title,
  body,
  children,
}: {
  tone: 'late' | 'waiting';
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={`mt-4 flex items-center gap-3 rounded-xl px-3.5 py-3 ${
        tone === 'late' ? 'bg-status-error/[0.08]' : 'bg-bg-hover'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${tone === 'late' ? 'text-status-error' : 'text-content-primary'}`}>
          {title}
        </p>
        <p className="mt-0.5 text-[13px] text-content-secondary">{body}</p>
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

export const DESKTOP_GHOST_BUTTON_CLASS =
  'motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-stroke-strong px-3 text-[13px] font-medium text-content-primary transition-colors [@media(hover:hover)]:hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60';
export const DESKTOP_DARK_BUTTON_CLASS =
  'motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-content-primary px-3 text-[13px] font-semibold text-content-inverse transition-opacity [@media(hover:hover)]:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';

function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** What a linked task's date says: "Done 9 Sep", "7 days late", "Due 30 Sep". */
function linkedTaskDate(task: DependencyTaskSummary, now: Date): { text: string; late: boolean } {
  if (task.status === TASK_DONE_STATUS) {
    const day = formatDayInWords(task.completedAt ?? null, now);
    return { text: day ? `Done ${day.replace(/^\w+ /, '')}` : 'Done', late: false };
  }
  if (task.status === 'cancelled') return { text: 'Cancelled', late: false };
  const days = daysUntilDue(task.dueDate, now);
  if (days === null) return { text: '', late: false };
  if (days < 0) return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, late: true };
  if (days === 0) return { text: 'Due today', late: false };
  return { text: `Due ${formatDayInWords(task.dueDate, now).replace(/^\w+ /, '')}`, late: false };
}

/** "Needs first" and "Waiting on this": one row per linked task, opens it on click. */
export function DesktopLinkedTasks({
  heading,
  hint,
  ids,
  tasks,
  onOpen,
}: {
  heading: string;
  hint?: string;
  /** Declared order; a task we hold no data for reads "Not available". */
  ids: readonly string[];
  tasks: readonly DependencyTaskSummary[];
  onOpen: (taskId: string) => void;
}) {
  if (ids.length === 0) return null;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const now = new Date();
  return (
    <section className="mt-6">
      <h3 className="text-[13px] font-semibold text-content-secondary">{heading}</h3>
      {hint ? <p className="mt-0.5 text-xs text-content-tertiary">{hint}</p> : null}
      <ul className="mt-1.5">
        {ids.map((id) => {
          const task = byId.get(id);
          if (!task) {
            return (
              <li key={id} className="border-t border-stroke-subtle py-2.5 text-sm text-content-tertiary first:border-t-0">
                Activity not available
              </li>
            );
          }
          const closed = isClosedStatus(task.status);
          const ticked = task.status === TASK_DONE_STATUS;
          const date = linkedTaskDate(task, now);
          const initials = initialsOf(task.assigneeName);
          return (
            <li key={id} className="border-t border-stroke-subtle first:border-t-0">
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className="motion-focus -mx-2 grid w-[calc(100%+1rem)] grid-cols-[22px_minmax(0,1fr)_auto_24px] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-bg-hover"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-[18px] w-[18px] place-items-center rounded-full border-[1.5px] ${
                    ticked ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-strong'
                  }`}
                >
                  {ticked ? <Check className="h-3 w-3" /> : null}
                </span>
                <span
                  className={`truncate text-sm font-medium ${
                    closed ? 'text-content-secondary line-through' : 'text-content-primary'
                  }`}
                >
                  {task.title}
                </span>
                <span className={`text-[13px] ${date.late ? 'text-status-error' : 'text-content-secondary'}`}>
                  {date.text}
                </span>
                {initials ? (
                  <span
                    title={task.assigneeName ?? undefined}
                    className="grid h-6 w-6 place-items-center rounded-full bg-bg-active text-[10px] font-semibold text-content-primary"
                  >
                    {initials}
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The ⋯ menu in the top bar. Holds Delete, so it is not one click from Close. */
export function DesktopMoreMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        // Escape shuts the menu first, not the whole pop-up.
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        title="More"
        className="motion-focus motion-press grid h-8 w-8 place-items-center rounded-lg text-content-secondary transition-colors [@media(hover:hover)]:hover:bg-bg-hover [@media(hover:hover)]:hover:text-content-primary"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-xl border border-stroke-default bg-bg-elevated p-1 shadow-[0_12px_32px_-12px_rgb(var(--shadow-ink)/0.35)]"
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="motion-focus flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-status-error transition-colors [@media(hover:hover)]:hover:bg-status-error/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete activity
          </button>
        </div>
      ) : null}
    </div>
  );
}
