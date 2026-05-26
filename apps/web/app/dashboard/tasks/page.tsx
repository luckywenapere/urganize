'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionCard } from '@/components/shared/SectionCard';
import { Toast } from '@/components/shared/Toast';
import { TaskRow } from '@/components/tasks/TaskRow';
import { TASKS_CHANGED_EVENT, useTaskUI } from '@/components/tasks/TaskUIProvider';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { type ReleaseOption } from '@/lib/release-helpers';
import {
  createEmptyMyTasksSections,
  getRelativeDueLabel,
  getTaskPriorityLabel,
  getTaskSectionDescription,
  getTaskSectionLabel,
  getTaskStatusLabel,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  type Task,
  type TaskPriority,
  type TaskSectionKey,
  type TaskStatus,
} from '@/lib/tasks';
import { supabase } from '@/lib/supabase/client';

type MyTasksPayload = {
  sections?: Record<TaskSectionKey, Task[]>;
  createdTaskCount?: number;
  error?: string;
};

type ReleaseSelectorPayload = {
  releases?: ReleaseOption[];
};

type ToastState = {
  message: string;
  tone: 'success' | 'error' | 'warning';
};

const sectionOrder: TaskSectionKey[] = ['overdue', 'today', 'week', 'upcoming', 'no_due_date'];

const taskSectionEmptyCopy: Record<TaskSectionKey, string> = {
  overdue: "You're caught up.",
  today: 'Nothing due today.',
  week: 'Nothing due this week.',
  upcoming: 'Nothing queued yet.',
  no_due_date: 'No unscheduled tasks.',
};

function TaskSectionLoadingState() {
  return (
    <div className="space-y-3 px-5 py-5">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-[72px] items-center gap-4 rounded-[22px] border border-stroke-subtle bg-bg-surface px-4 py-3"
        >
          <div className="h-10 w-10 rounded-full skeleton-shimmer" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded-full skeleton-shimmer" />
            <div className="h-3 w-1/3 rounded-full skeleton-shimmer" />
          </div>
          <div className="h-8 w-20 rounded-full skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

function buildSectionDueDate(section: TaskSectionKey): string | null {
  const now = new Date();
  const date = new Date(now);

  if (section === 'no_due_date') {
    return null;
  }

  if (section === 'overdue') {
    date.setDate(date.getDate() - 1);
  } else if (section === 'today') {
    // keep today
  } else if (section === 'week') {
    date.setDate(date.getDate() + 3);
  } else if (section === 'upcoming') {
    date.setDate(date.getDate() + 14);
  }

  date.setHours(18, 0, 0, 0);
  return date.toISOString();
}

export default function MyTasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openTask, openQuickCreate } = useTaskUI();
  const [sections, setSections] = useState(createEmptyMyTasksSections());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [inlineSection, setInlineSection] = useState<TaskSectionKey | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');
  const [createdTaskCount, setCreatedTaskCount] = useState(0);

  const releaseFilter = searchParams.get('release') || '';
  const priorityFilter = (searchParams.get('priority') || '') as TaskPriority | '';
  const statusFilter = (searchParams.get('status') || '') as TaskStatus | '';
  const mineOnly = searchParams.get('mine') === '1';

  const syncFilter = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.replace(`/dashboard/tasks${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const loadTasks = async () => {
    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/tasks${searchParams.toString() ? `?${searchParams.toString()}` : ''}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as MyTasksPayload;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load your tasks.');
      }

      setSections(payload.sections || createEmptyMyTasksSections());
      setCreatedTaskCount(typeof payload.createdTaskCount === 'number' ? payload.createdTaskCount : 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your tasks.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    const loadReleases = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return;
        }

        const response = await fetch('/api/releases?view=selector', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as ReleaseSelectorPayload;
        if (response.ok && Array.isArray(payload.releases)) {
          setReleases(payload.releases);
        }
      } catch {
        // Release filter should never block the page.
      }
    };

    void loadReleases();
  }, []);

  useEffect(() => {
    const handleTasksChanged = () => {
      void loadTasks();
    };

    window.addEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setInlineSection('today');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    // Warnings (blocker messages) hold longer so the user has time to read
    // the dependency reason before it disappears.
    const dismissAfterMs = toast.tone === 'warning' ? 6000 : 2600;
    const timeout = window.setTimeout(() => setToast(null), dismissAfterMs);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const totalTasks = useMemo(
    () => sectionOrder.reduce((sum, section) => sum + sections[section].length, 0),
    [sections]
  );

  const createInlineTask = async () => {
    if (!inlineSection || !inlineTitle.trim()) {
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: inlineTitle.trim(),
          dueDate: buildSectionDueDate(inlineSection),
          source: 'inline',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create task.');
      }

      setToast({ tone: 'success', message: 'Task created.' });
      setInlineTitle('');
      setInlineSection(null);
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (createError) {
      setToast({
        tone: 'error',
        message: createError instanceof Error ? createError.message : 'Could not create task.',
      });
    }
  };

  const handleOpenTask = (task: Task) => {
    const due = getRelativeDueLabel(task);
    if (due.isOverdue && task.dueDate) {
      const dueTimestamp = new Date(task.dueDate).getTime();
      const nowTimestamp = Date.now();
      const daysOverdue = Math.max(1, Math.round((nowTimestamp - dueTimestamp) / 86400000));

      captureAnalyticsEvent({
        name: 'task_overdue_viewed',
        properties: {
          task_id: task.id,
          days_overdue: daysOverdue,
        },
      });
    }

    openTask(task.id);
  };

  return (
    <main className="min-h-screen bg-bg-base text-content-primary" data-ph-capture-attribute-section="tasks">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-16 sm:px-6 sm:py-10">
        {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
        {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}

        <SectionCard className="sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">My tasks</p>
              <h1 className="mt-2 text-[clamp(2rem,4vw,3rem)] tracking-tight text-content-primary">
                Next tasks
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-content-secondary">
                See what&apos;s overdue, due today, and next.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => syncFilter({ mine: mineOnly ? '' : '1' })}
                aria-pressed={mineOnly}
                className={`min-h-11 rounded-[18px] border px-5 py-3 text-sm font-semibold transition-colors ${
                  mineOnly
                    ? 'border-brand bg-brand/15 text-content-primary'
                    : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                }`}
              >
                Mine only
              </button>
              <button
                type="button"
                onClick={() => openQuickCreate({ source: 'quick_create' })}
                className="min-h-11 rounded-[18px] bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
              >
                New task
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Release
              </span>
              <select
                value={releaseFilter}
                onChange={(event) => syncFilter({ release: event.target.value })}
                className="input h-12 rounded-[18px]"
              >
                <option value="">All releases</option>
                {releases.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Priority
              </span>
              <select
                value={priorityFilter}
                onChange={(event) => syncFilter({ priority: event.target.value })}
                className="input h-12 rounded-[18px]"
              >
                <option value="">All priorities</option>
                {TASK_PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {getTaskPriorityLabel(priority)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Status
              </span>
              <select
                value={statusFilter}
                onChange={(event) => syncFilter({ status: event.target.value })}
                className="input h-12 rounded-[18px]"
              >
                <option value="">All statuses</option>
                {TASK_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {getTaskStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </SectionCard>

        <div className="mt-6 space-y-5">
          {sectionOrder.map((section) => {
            const tasks = sections[section];

            return (
              <SectionCard key={section} className="overflow-hidden px-0 py-0">
                <div className="flex items-start justify-between gap-3 border-b border-stroke-subtle px-5 py-5">
                  <div>
                    <p className={`text-lg font-semibold ${section === 'overdue' ? 'text-status-error' : 'text-content-primary'}`}>
                      {getTaskSectionLabel(section)}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm text-content-secondary">
                      {getTaskSectionDescription(section)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInlineSection(section)}
                    className="inline-flex min-h-10 items-center rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  >
                    Add
                  </button>
                </div>

                {inlineSection === section ? (
                  <div className="border-b border-stroke-subtle bg-bg-elevated/35 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        value={inlineTitle}
                        onChange={(event) => setInlineTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void createInlineTask();
                          }

                          if (event.key === 'Escape') {
                            setInlineSection(null);
                            setInlineTitle('');
                          }
                        }}
                        className="input h-12 flex-1 rounded-[18px]"
                        placeholder={`Task for ${getTaskSectionLabel(section).toLowerCase()}`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void createInlineTask()}
                        className="min-h-12 rounded-[18px] bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}

                {isLoading ? (
                  <TaskSectionLoadingState />
                ) : tasks.length === 0 ? (
                  <div className="px-5 py-5">
                    <EmptyState
                      title={`No ${getTaskSectionLabel(section).toLowerCase()} tasks`}
                      description={taskSectionEmptyCopy[section]}
                    />
                  </div>
                ) : (
                  <div>
                    {tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onClick={handleOpenTask}
                        onBlocker={(message) => setToast({ tone: 'warning', message })}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>

        {!isLoading && totalTasks === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={createdTaskCount === 0 ? 'No tasks yet' : 'Inbox clear'}
              description={
                createdTaskCount === 0 ? (
                  <>
                    Create a task or press <kbd className="kbd">C</kbd>.
                  </>
                ) : (
                  'New assignments and upcoming deadlines show up here.'
                )
              }
              action={
                <button
                  type="button"
                  onClick={() => openQuickCreate({ source: 'quick_create' })}
                  className="min-h-11 rounded-[18px] bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  New task
                </button>
              }
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
