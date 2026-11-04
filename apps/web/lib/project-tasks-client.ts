import { getAccessToken } from '@/components/settings/getAccessToken';
import type { Task } from '@/types/tasks';

// Browser calls for a project's tasks (4 Nov 2026). They are ordinary tasks,
// so they go through the ordinary task routes with a recordId.

async function call(path: string, method: string, body?: unknown): Promise<Response> {
  const token = await getAccessToken();
  return fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A project's tasks, or null when they could not be read. */
export async function fetchProjectTasks(recordId: string): Promise<Task[] | null> {
  try {
    const response = await call(`/api/tasks?recordId=${encodeURIComponent(recordId)}`, 'GET');
    if (!response.ok) return null;
    const payload = (await response.json()) as { tasks?: Task[] };
    return payload.tasks ?? [];
  } catch {
    return null;
  }
}

export type ProjectTaskCall = { ok: true; task: Task | null } | { ok: false; error: string };

async function taskCall(path: string, method: string, body: unknown): Promise<ProjectTaskCall> {
  try {
    const response = await call(path, method, body);
    const payload = (await response.json().catch(() => ({}))) as { task?: Task; error?: string };
    if (!response.ok) return { ok: false, error: payload.error || 'Something went wrong. Try again.' };
    return { ok: true, task: payload.task ?? null };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection.' };
  }
}

export function addProjectTask(
  recordId: string,
  input: { title: string; description?: string; source: 'suggestion' | 'manual' | 'ai' }
): Promise<ProjectTaskCall> {
  return taskCall('/api/tasks', 'POST', {
    recordId,
    title: input.title,
    description: input.description ?? null,
    source: input.source,
    // Nobody yet: a suggestion is the team's job, not the clicker's by default.
    assignedToUserId: null,
  });
}

export function setProjectTaskDone(taskId: string, done: boolean): Promise<ProjectTaskCall> {
  return taskCall(`/api/tasks/${encodeURIComponent(taskId)}`, 'PATCH', { status: done ? 'done' : 'todo' });
}
