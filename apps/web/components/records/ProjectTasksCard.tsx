'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ListChecks, Plus } from '@/components/icons';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { formatSessionDay, isCalendarDate, lagosToday } from '@/lib/next-records';
import { addProjectTask, addSongChecklist, fetchProjectTasks, setProjectTaskDone } from '@/lib/project-tasks-client';
import { isTaskLate, taskCountsLine } from '@/lib/record-page-data';
import { groupProjectTasks, hasSongChecklist } from '@/lib/song-checklist';
import type { Task } from '@/types/tasks';

// The song checklist on a project (2026-11-11, #1143, mocks
// docs/mocks/song-to-review screens 1.2 and 2.5). The whole job of making a
// song is on screen from the start, in four groups with no dates. Only the
// next unfinished group is open; the others fold to one line (a finished one
// with a tick), so the card shows what to do now. The
// rows are real tasks: a tap opens the ordinary task pop-up, where the team
// gives it to someone. Tasks the team adds themselves sit under "Other".
// A task given a day shows it at the end of its row, red once it has passed
// (#1190). On a computer the card is the page's right column.

function closed(task: Task): boolean {
  return task.status === 'done' || task.status === 'cancelled';
}

export function ProjectTasksCard({ recordId }: { recordId: string }) {
  const { openTask, isTaskOpen } = useTaskUI();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  // Groups the person opened or closed by hand; the rest follow "done folds".
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const today = useMemo(() => lagosToday(), []);

  const apply = useCallback((next: Task[] | null) => {
    if (next) setTasks(next);
    else setError('Could not load the tasks. Try again.');
  }, []);

  const load = useCallback(() => fetchProjectTasks(recordId).then(apply), [recordId, apply]);

  useEffect(() => {
    let live = true;
    void fetchProjectTasks(recordId).then((next) => {
      if (live) apply(next);
    });
    return () => {
      live = false;
    };
  }, [recordId, apply]);

  // The pop-up edits the task in place (owner, notes); read the list again
  // when it closes so the row shows what was changed there.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isTaskOpen) void load();
    wasOpen.current = isTaskOpen;
  }, [isTaskOpen, load]);

  const grouped = useMemo(() => groupProjectTasks(tasks ?? []), [tasks]);
  const missingChecklist = tasks !== null && !hasSongChecklist(tasks);

  const add = async (title: string) => {
    setBusyKey('manual');
    setError('');
    const result = await addProjectTask(recordId, { title, source: 'manual' });
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    captureAnalyticsEvent({ name: 'project_task_added', properties: { source: 'manual' } });
    if (result.task) setTasks((current) => [...(current ?? []), result.task as Task]);
    else void load();
    return true;
  };

  const addChecklist = async () => {
    setBusyKey('checklist');
    setError('');
    const result = await addSongChecklist(recordId);
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    captureAnalyticsEvent({ name: 'project_task_added', properties: { source: 'checklist' } });
    void load();
  };

  const toggle = async (task: Task) => {
    const nextDone = task.status !== 'done';
    setBusyKey(task.id);
    setError('');
    setTasks((current) =>
      (current ?? []).map((row) => (row.id === task.id ? { ...row, status: nextDone ? 'done' : 'todo' } : row))
    );
    const result = await setProjectTaskDone(task.id, nextDone);
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error);
      void load();
    }
  };

  const row = (task: Task) => {
    const isDone = closed(task);
    const owner = task.assignee?.name?.trim();
    const day = (task.dueDate || '').slice(0, 10);
    const hasDay = !isDone && isCalendarDate(day);
    const late = hasDay && isTaskLate(task.dueDate, today, false);
    return (
      <li key={task.id} className="flex items-center gap-1 border-t border-stroke-default first:border-t-0">
        <button
          type="button"
          onClick={() => void toggle(task)}
          disabled={busyKey === task.id}
          aria-label={isDone ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          aria-pressed={isDone}
          className="motion-focus -ml-3 grid size-11 shrink-0 place-items-center rounded-full"
        >
          <span
            className={`grid size-[18px] place-items-center rounded-[5px] border ${
              isDone ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-control'
            }`}
          >
            {isDone ? <Check aria-hidden className="size-3.5" /> : null}
          </span>
        </button>
        <button type="button" onClick={() => openTask(task.id)} className="motion-focus min-h-11 min-w-0 flex-1 py-1.5 text-left">
          <span
            className={`block truncate text-[15px] ${
              isDone ? 'text-content-secondary line-through decoration-content-tertiary' : 'text-content-primary lg:font-semibold'
            }`}
          >
            {task.title}
          </span>
          {!isDone && (owner || task.description) ? (
            <span className="block truncate text-xs text-content-secondary">{owner || task.description}</span>
          ) : null}
        </button>
        {hasDay ? (
          <span className={`shrink-0 whitespace-nowrap text-[13px] ${late ? 'font-semibold text-status-error' : 'text-content-secondary'}`}>
            {formatSessionDay(day)}
            {late ? <span className="sr-only">, late</span> : null}
          </span>
        ) : null}
      </li>
    );
  };

  // Only the next unfinished checklist group opens by itself (mock 1.2): the
  // rest fold to one line, so the card shows what to do now. The team's own
  // tasks open whenever any is still open.
  const nextGroup = grouped.groups.find((group) => group.done < group.total)?.key ?? null;

  const groupBlock = (key: string, label: string, rows: Task[], done: number, total: number) => {
    const complete = total > 0 && done === total;
    const open = toggled[key] ?? (key === 'other' ? !complete : key === nextGroup);
    const panelId = `project-${recordId}-group-${key}`;
    return (
      <div key={key} className="border-t border-stroke-default first:border-t-0">
        <button
          type="button"
          onClick={() => setToggled((current) => ({ ...current, [key]: !open }))}
          aria-expanded={open}
          aria-controls={panelId}
          className="motion-focus flex min-h-11 w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-content-primary">
            {complete ? <CheckCircle2 aria-hidden className="size-4 text-brand" /> : null}
            {label}
          </span>
          <span className="flex items-center gap-2 text-[13px] tabular-nums text-content-secondary">
            {done}/{total}
            <ChevronDown aria-hidden className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {open ? (
          <ul id={panelId} className="pb-1.5">
            {rows.map(row)}
          </ul>
        ) : null}
      </div>
    );
  };

  const percent = grouped.total ? Math.round((grouped.done / grouped.total) * 100) : 0;

  return (
    <section className="rounded-xl border border-stroke-default bg-bg-surface shadow-sm lg:rounded-2xl" aria-busy={tasks === null}>
      <div className="px-4 pt-3.5 lg:px-5 lg:pt-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-sans text-[15px] font-semibold text-content-primary lg:text-lg lg:leading-6">
            Making the song
            {tasks !== null ? (
              <span className="hidden text-[13px] font-medium text-content-secondary lg:inline">
                {' '}
                · {taskCountsLine(grouped.total - grouped.done, grouped.done)}
              </span>
            ) : null}
          </h2>
          {tasks !== null && grouped.total ? (
            <span className="text-[13px] tabular-nums text-content-secondary lg:hidden">
              {grouped.done} of {grouped.total}
            </span>
          ) : null}
          {/* On a computer, Add sits beside the title (#1190); the phone's is under the list. */}
          {adding ? null : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="motion-focus hidden shrink-0 items-center gap-1 rounded text-[13px] font-semibold text-brand underline underline-offset-[3px] hover:no-underline lg:inline-flex"
            >
              <Plus aria-hidden className="size-3.5" />
              Add<span className="sr-only"> a task</span>
            </button>
          )}
        </div>
        {tasks !== null && grouped.total ? (
          <div
            role="progressbar"
            aria-label="Tasks done"
            aria-valuemin={0}
            aria-valuemax={grouped.total}
            aria-valuenow={grouped.done}
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-brand/15"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-2 pt-1 lg:px-5">
        {tasks === null && !error ? (
          <div className="space-y-2 py-2" aria-hidden>
            <div className="h-4 w-2/3 rounded bg-bg-hover" />
            <div className="h-4 w-1/2 rounded bg-bg-hover" />
            <div className="h-4 w-3/5 rounded bg-bg-hover" />
          </div>
        ) : null}

        {missingChecklist ? (
          <div className="my-2 flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/[.07] px-3.5 py-3">
            <ListChecks aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-content-primary">Add the song checklist</p>
              <p className="text-[13px] text-content-secondary">
                Every step of making a song, in order: idea, recording, finishing, paperwork.
              </p>
              <button
                type="button"
                onClick={() => void addChecklist()}
                disabled={busyKey !== null}
                className="motion-focus mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-content-inverse disabled:opacity-50"
              >
                <Plus aria-hidden className="size-4" />
                {busyKey === 'checklist' ? 'Adding...' : 'Add the checklist'}
              </button>
            </div>
          </div>
        ) : null}

        {grouped.groups.map((group) => groupBlock(group.key, group.label, group.tasks, group.done, group.total))}
        {grouped.other.length
          ? groupBlock(
              'other',
              'Other tasks',
              grouped.other,
              grouped.other.filter(closed).length,
              grouped.other.length
            )
          : null}

        {adding ? (
          <form
            className="flex gap-2 border-t border-stroke-default py-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const title = newTitle.trim();
              if (!title) return;
              if (await add(title)) {
                setNewTitle('');
                setAdding(false);
              }
            }}
          >
            <label className="sr-only" htmlFor={`project-task-${recordId}`}>
              New task
            </label>
            <input
              id={`project-task-${recordId}`}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              maxLength={200}
              autoFocus
              placeholder="What needs doing?"
              className="min-h-11 flex-1 rounded-md border border-stroke-control bg-bg-base px-3 text-base text-content-primary placeholder:text-content-tertiary hover:border-content-secondary md:text-sm"
            />
            <button
              type="submit"
              disabled={busyKey !== null || !newTitle.trim()}
              className="motion-focus min-h-11 rounded-md border border-stroke-control px-3 text-sm font-medium text-content-primary disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`motion-focus inline-flex min-h-11 w-full items-center gap-1.5 text-[13px] font-medium text-content-secondary hover:text-content-primary lg:hidden ${
              grouped.total ? 'border-t border-stroke-default' : ''
            }`}
          >
            <Plus aria-hidden className="size-3.5" />
            Add a task
          </button>
        )}

        <p role="status" aria-live="polite" className="text-sm text-status-error">
          {error}
        </p>
      </div>
    </section>
  );
}
