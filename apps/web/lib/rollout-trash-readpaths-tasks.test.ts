import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Read paths of the task side must hide the rows of a rollout in Trash
// (releases.deleted_at not null) and keep the live ones. A small fake admin
// client filters on in / is / not and records every call.

type Row = Record<string, unknown>;
type Call = { table: string; op: string; args: unknown[] };

function makeAdmin(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const writes: Call[] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let write: Call | null = null;
    const rec = (op: string, args: unknown[]) => calls.push({ table, op, args });
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = (...a: unknown[]) => (rec('select', a), self());
    builder.update = (...a: unknown[]) => ((write = { table, op: 'update', args: a }), writes.push(write), rec('update', a), self());
    builder.insert = (...a: unknown[]) => ((write = { table, op: 'insert', args: a }), writes.push(write), rec('insert', a), self());
    builder.in = (col: string, list: unknown[]) => (rec('in', [col, list]), (rows = rows.filter((r) => list.includes(r[col]))), self());
    builder.eq = (col: string, v: unknown) => (rec('eq', [col, v]), (rows = rows.filter((r) => r[col] === v)), self());
    builder.is = (col: string, v: unknown) => (rec('is', [col, v]), (rows = rows.filter((r) => (r[col] ?? null) === v)), self());
    builder.not = (col: string, _op: string, v: unknown) =>
      (rec('not', [col, v]), (rows = rows.filter((r) => (r[col] ?? null) !== v)), self());
    for (const name of ['lt', 'lte', 'gte', 'order', 'limit', 'range', 'like']) {
      builder[name] = (...a: unknown[]) => (rec(name, a), self());
    }
    builder.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: write ? null : rows, error: null, count: rows.length });
    return builder;
  };
  return { admin: { from } as unknown as SupabaseClient, calls, writes };
}

const LIVE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEAD = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const releases = [
  { id: LIVE, deleted_at: null },
  { id: DEAD, deleted_at: '2026-10-20T00:00:00Z' },
];

vi.mock('@/lib/notification-presets-server', () => ({
  getNotificationPresets: async () => ({
    deadlineReminders: {
      enabled: true,
      copy: {
        task_due_soon: { title: 't', body: 'b' },
        task_due_3d: { title: 't', body: 'b' },
        task_due_7d: { title: 't', body: 'b' },
      },
    },
  }),
}));
vi.mock('@/lib/push-server', () => ({
  sendPushToUsers: vi.fn(async () => ({ sent: 1 })),
}));

beforeEach(() => vi.clearAllMocks());

describe('createDueDateNotificationsForAllUsers', () => {
  it('sends no reminder for a task of a deleted rollout, still sends for a live one', async () => {
    const { createDueDateNotificationsForAllUsers } = await import('./tasks-server');
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const { admin, writes } = makeAdmin({
      tasks: [
        { id: 't-live', release_id: LIVE, assigned_to_user_id: 'u1', due_date: past, status: 'todo', metadata: {} },
        { id: 't-dead', release_id: DEAD, assigned_to_user_id: 'u1', due_date: past, status: 'todo', metadata: {} },
      ],
      releases,
      notifications: [],
    });
    await createDueDateNotificationsForAllUsers(admin);
    const inserts = writes.filter((w) => w.table === 'notifications' && w.op === 'insert');
    const taskIds = inserts.map((w) => (w.args[0] as { task_id: string }).task_id);
    expect(taskIds).toEqual(['t-live']);
  });
});

describe('TaskService list reads', () => {
  it('getTasksForUser and getWorkspaceTasks drop tasks of a deleted rollout', async () => {
    vi.doMock('@/lib/tasks-server', async () => {
      const actual = await vi.importActual<Record<string, unknown>>('@/lib/tasks-server');
      return { ...actual, loadTasks: async (_c: unknown, rows: Row[]) => rows };
    });
    vi.resetModules();
    const { TaskService } = await import('./services/task-service');
    const { admin } = makeAdmin({
      tasks: [
        { id: 't-live', release_id: LIVE, workspace_id: 'w1' },
        { id: 't-dead', release_id: DEAD, workspace_id: 'w1' },
      ],
      releases,
    });
    const service = new TaskService(admin);
    const mine = (await service.getTasksForUser('u1', { workspaceIds: ['w1'], artistScopeByWorkspaceId: {}, releaseScopeByWorkspaceId: {} })) as unknown as Row[];
    expect(mine.map((t) => t.id)).toEqual(['t-live']);
    const ws = (await service.getWorkspaceTasks('w1', 'u1', { workspaceIds: ['w1'], artistScopeByWorkspaceId: {}, releaseScopeByWorkspaceId: {} })) as unknown as Row[];
    expect(ws.map((t) => t.id)).toEqual(['t-live']);
    vi.doUnmock('@/lib/tasks-server');
  });
});

describe('flushDueNotifications', () => {
  it('cancels, not sends, a reminder for a deleted rollout', async () => {
    vi.resetModules();
    const { flushDueNotifications } = await import('./engagement-server');
    const { sendPushToUsers } = await import('@/lib/push-server');
    const { admin, writes } = makeAdmin({
      scheduled_notifications: [
        { id: 'n-live', user_id: 'u1', kind: 'release_reminder_a', title: 't', body: 'b', url: `/dashboard?release=${LIVE}`, sent_at: null, canceled_at: null },
        { id: 'n-dead', user_id: 'u1', kind: 'release_reminder_a', title: 't', body: 'b', url: `/dashboard?release=${DEAD}`, sent_at: null, canceled_at: null },
      ],
      releases,
    });
    await flushDueNotifications(admin);
    const pushed = (sendPushToUsers as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(pushed).toHaveLength(1);
    expect((pushed[0][2] as { url: string }).url).toBe(`/dashboard?release=${LIVE}`);
    const cancel = writes.find((w) => (w.args[0] as { canceled_at?: string })?.canceled_at);
    expect(cancel).toBeTruthy();
  });
});
