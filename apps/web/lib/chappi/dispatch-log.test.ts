import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChappiToolContext } from './tools';

/**
 * Every write a tool makes lands in the action log, whichever door it came
 * through (chat, voice, MCP, a confirmed card). Reads and suggestions do not.
 * The log must never change what the tool returns, even when it fails.
 */

const log = vi.fn();
const snapshot = vi.fn();
vi.mock('@/lib/urgans-action-log-server', () => ({
  logUrgansAction: (...args: unknown[]) => log(...args),
  snapshotLogObject: (...args: unknown[]) => snapshot(...args),
}));

const tools = new Map<string, Record<string, unknown>>();
vi.mock('./tools', () => ({
  getChappiTool: (name: string) => tools.get(name),
}));
vi.mock('@/lib/tasks-server', () => ({ loadWorkspaceAccessContext: vi.fn() }));

const TASK = '44444444-4444-4444-8444-444444444444';

function ctx(over: Partial<ChappiToolContext> = {}): ChappiToolContext {
  return {
    user: { id: 'user-1' },
    adminClient: {} as ChappiToolContext['adminClient'],
    workspaceIds: ['ws-1'],
    releaseOwnerIds: ['user-1'],
    artistScopeByOwnerId: {},
    artistScopeByWorkspaceId: {},
    origin: 'http://x',
    authToken: 't',
    ...over,
  };
}

beforeEach(() => {
  log.mockReset();
  snapshot.mockReset();
  tools.clear();
  tools.set('list_tasks', { name: 'list_tasks', kind: 'read', level: 'read', execute: async () => ({ ok: true, summary: 'list' }) });
  tools.set('navigate', { name: 'navigate', kind: 'mutate', level: 'suggest', execute: async () => ({ ok: true, summary: 'go' }) });
  tools.set('complete_task', {
    name: 'complete_task',
    kind: 'mutate',
    level: 'auto',
    execute: async () => ({ ok: true, summary: 'Task marked done.' }),
  });
  tools.set('delete_task', {
    name: 'delete_task',
    kind: 'mutate',
    level: 'confirm',
    confirm: async () => ({ ok: true }),
    execute: async () => ({ ok: false, summary: 'Not found.' }),
  });
});

async function load() {
  return import('./dispatch');
}

describe('executeToolCall logging', () => {
  it('does not log a read or a suggestion', async () => {
    const { executeToolCall } = await load();
    await executeToolCall(ctx(), 'list_tasks', {});
    await executeToolCall(ctx(), 'navigate', { target: 'dashboard' });
    expect(log).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('logs a write with before and after, defaulting to chat', async () => {
    snapshot
      .mockResolvedValueOnce({ id: TASK, status: 'todo', release_id: 'rel-1', workspace_id: 'ws-9' })
      .mockResolvedValueOnce({ id: TASK, status: 'done', release_id: 'rel-1', workspace_id: 'ws-9' });
    const { executeToolCall } = await load();
    const result = await executeToolCall(ctx(), 'complete_task', { taskId: TASK });
    expect(result).toEqual({ ok: true, summary: 'Task marked done.' });
    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0][1];
    expect(entry).toMatchObject({
      source: 'chat',
      trigger: 'message',
      tool: 'complete_task',
      level: 'auto',
      actorUserId: 'user-1',
      workspaceId: 'ws-9',
      releaseId: 'rel-1',
      objectType: 'task',
      objectId: TASK,
      before: { status: 'todo' },
      after: { status: 'done' },
      confirmed: false,
      ok: true,
      summary: 'Task marked done.',
    });
  });

  it('marks a confirmed card and keeps the source the context gives', async () => {
    snapshot.mockResolvedValue(null);
    const { executeToolCall } = await load();
    await executeToolCall(ctx({ audit: { source: 'voice' } }), 'delete_task', { taskId: TASK }, { confirmed: true });
    const entry = log.mock.calls[0][1];
    expect(entry).toMatchObject({ source: 'voice', trigger: 'confirmed_card', level: 'confirm', confirmed: true, ok: false, error: 'Not found.' });
  });

  it('logs a tool that throws, and still returns the normal failure', async () => {
    tools.set('complete_task', { name: 'complete_task', kind: 'mutate', level: 'auto', execute: async () => { throw new Error('db down'); } });
    snapshot.mockResolvedValue(null);
    const { executeToolCall } = await load();
    const result = await executeToolCall(ctx(), 'complete_task', { taskId: TASK });
    expect(result.ok).toBe(false);
    expect(log.mock.calls[0][1]).toMatchObject({ ok: false, error: 'db down' });
  });

  it('never lets a broken snapshot or log break the tool', async () => {
    snapshot.mockRejectedValue(new Error('nope'));
    log.mockRejectedValue(new Error('nope'));
    const { executeToolCall } = await load();
    const result = await executeToolCall(ctx(), 'complete_task', { taskId: TASK });
    expect(result).toEqual({ ok: true, summary: 'Task marked done.' });
  });
});
