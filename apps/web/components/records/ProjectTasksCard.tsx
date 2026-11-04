'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus } from '@/components/icons';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { formatSessionDay, isCalendarDate, type RecordStatus, type SongStage } from '@/lib/next-records';
import { suggestProjectTasks } from '@/lib/project-suggestions';
import { addProjectTask, fetchProjectTasks, setProjectTaskDone } from '@/lib/project-tasks-client';
import { isTaskClosed, type Task } from '@/types/tasks';

// A project's tasks (4 Nov 2026, mock screens 2 and 3). Real task rows, so a
// tap opens the ordinary task pop-up and chasing, assignment emails and the
// AI all work. Under the tracklist, because the songs are why the tasks exist.
// Suggestions come from lib/project-suggestions.ts: picked from a list, never
// invented, and a job already added is not offered again.

function dueLabel(task: Task): string {
  const day = (task.dueDate || '').slice(0, 10);
  return isCalendarDate(day) ? formatSessionDay(day) : 'no day';
}

function ownerLabel(task: Task): string {
  return task.assignee?.name?.trim() || 'Nobody yet';
}

export function ProjectTasksCard({
  recordId,
  status,
  songs,
}: {
  recordId: string;
  status: RecordStatus;
  songs: ReadonlyArray<{ title: string; stage: SongStage }>;
}) {
  const { openTask, isTaskOpen } = useTaskUI();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showDone, setShowDone] = useState(false);

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

  // The pop-up edits the task in place (owner, day, notes); read the list
  // again when it closes so the row shows what was changed there.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isTaskOpen) void load();
    wasOpen.current = isTaskOpen;
  }, [isTaskOpen, load]);

  const open = useMemo(() => (tasks ?? []).filter((task) => !isTaskClosed(task.status)), [tasks]);
  const done = useMemo(() => (tasks ?? []).filter((task) => isTaskClosed(task.status)), [tasks]);
  const suggestions = useMemo(
    () =>
      tasks === null
        ? []
        : suggestProjectTasks({ status, songs, existingTitles: tasks.map((task) => task.title), limit: 3 }),
    [tasks, status, songs]
  );

  const add = async (title: string, description: string | undefined, source: 'suggestion' | 'manual', key: string) => {
    setBusyKey(key);
    setError('');
    const result = await addProjectTask(recordId, { title, description, source });
    setBusyKey(null);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    captureAnalyticsEvent({ name: 'project_task_added', properties: { source } });
    if (result.task) setTasks((current) => [...(current ?? []), result.task as Task]);
    else void load();
    return true;
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
    const isDone = task.status === 'done';
    return (
      <li key={task.id} className="flex items-center gap-2 border-t border-stroke-default py-1 first:border-t-0">
        <button
          type="button"
          onClick={() => void toggle(task)}
          disabled={busyKey === task.id}
          aria-label={isDone ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
          aria-pressed={isDone}
          className="motion-focus grid size-11 shrink-0 place-items-center rounded-full"
        >
          <span
            className={`grid size-5 place-items-center rounded-full border ${
              isDone ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-control'
            }`}
          >
            {isDone ? <Check aria-hidden className="size-3.5" /> : null}
          </span>
        </button>
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className="motion-focus min-h-11 flex-1 text-left"
        >
          <span className={`block text-sm ${isDone ? 'text-content-secondary line-through' : 'text-content-primary'}`}>
            {task.title}
          </span>
          <span className="block text-xs text-content-secondary">
            {ownerLabel(task)} · {dueLabel(task)}
          </span>
        </button>
      </li>
    );
  };

  const summary =
    tasks === null ? null : `${open.length} open${done.length ? ` · ${done.length} done` : ''}`;

  return (
    <section className="rounded-[14px] border border-stroke-default bg-bg-surface px-3.5 py-3" aria-busy={tasks === null}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base text-content-primary">Tasks</h2>
        {summary ? <span className="text-[13px] text-content-secondary">{summary}</span> : null}
      </div>

      {tasks === null && !error ? (
        <div className="space-y-2 py-1" aria-hidden>
          <div className="h-4 w-2/3 rounded bg-bg-hover" />
          <div className="h-4 w-1/2 rounded bg-bg-hover" />
        </div>
      ) : null}

      {open.length ? <ul>{open.map(row)}</ul> : null}
      {tasks !== null && !open.length && !suggestions.length ? (
        <p className="py-1 text-sm text-content-secondary">Nothing open. Add the next job below.</p>
      ) : null}

      {suggestions.length ? (
        <div className={open.length ? 'mt-1 border-t border-stroke-default pt-1' : ''}>
          <p className="py-1 text-xs font-semibold text-content-secondary">Suggested next</p>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.key} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0">
                  <span className="block text-sm text-content-primary">{suggestion.title}</span>
                  <span className="block text-xs text-content-secondary">{suggestion.description}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void add(suggestion.title, suggestion.description, 'suggestion', suggestion.key)}
                  disabled={busyKey !== null}
                  className="motion-focus inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-[13px] font-semibold text-content-primary hover:underline"
                >
                  <Plus aria-hidden className="size-3.5" />
                  Add
                  <span className="sr-only"> {suggestion.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {adding ? (
        <form
          className="mt-1 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const title = newTitle.trim();
            if (!title) return;
            if (await add(title, undefined, 'manual', 'manual')) {
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
            placeholder="What needs doing?"
            className="min-h-11 flex-1 rounded-lg border border-stroke-control bg-bg-base px-3 text-sm text-content-primary placeholder:text-content-tertiary hover:border-content-secondary"
          />
          <button
            type="submit"
            disabled={busyKey !== null || !newTitle.trim()}
            className="motion-focus min-h-11 rounded-lg border border-stroke-control px-3 text-sm font-semibold text-content-primary disabled:opacity-50"
          >
            Add
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="motion-focus mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-content-primary hover:underline"
        >
          <Plus aria-hidden className="size-3.5" />
          Add a task
        </button>
      )}

      {done.length ? (
        <div className="border-t border-stroke-default pt-1">
          <button
            type="button"
            onClick={() => setShowDone((value) => !value)}
            aria-expanded={showDone}
            className="motion-focus inline-flex min-h-11 items-center text-[13px] text-content-secondary hover:text-content-primary"
          >
            {showDone ? 'Hide done' : `Show ${done.length} done`}
          </button>
          {showDone ? <ul>{done.map(row)}</ul> : null}
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="text-sm text-status-error">
        {error}
      </p>
    </section>
  );
}
