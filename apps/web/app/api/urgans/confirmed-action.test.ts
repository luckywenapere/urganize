import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The approve leg of the permission gate. This is the ONLY path that executes a
// confirmation-gated tool, so the property under test is that it stays narrow:
// it must run exactly the tool the user approved, and it must refuse to become
// a second, unguarded way to invoke anything else by name.

const executeToolCall = vi.fn();
const runChappiAgent = vi.fn();
const closeConfirmedAction = vi.fn();

vi.mock('@/app/api/_shared/auth', () => ({
  requireAuthenticatedAdmin: async () => ({
    user: { id: 'user-1', email: 'manager@example.com' },
    supabaseUrl: 'https://supabase.test',
    adminClient: {},
  }),
}));

vi.mock('@/lib/chappi/config', () => ({
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
}));

vi.mock('@/lib/chappi/dispatch', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  resolveChappiContext: async () => ({
    user: { id: 'user-1' },
    adminClient: {},
    workspaceIds: ['ws-1'],
    origin: 'https://app.test',
    authToken: 'jwt',
  }),
}));

vi.mock('@/lib/chappi/runner', () => ({
  runChappiAgent: (...args: unknown[]) => runChappiAgent(...args),
  closeConfirmedAction: (...args: unknown[]) => closeConfirmedAction(...args),
}));

vi.mock('@/lib/chappi/system-prompt', () => ({
  buildChappiSystemPrompt: async () => 'system prompt',
}));

import { POST } from './route';

function post(body: Record<string, unknown>) {
  return new NextRequest('https://app.test/api/urgans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  });
}

const messages = [{ id: 'm1', role: 'user', content: 'delete it' }];

beforeEach(() => {
  executeToolCall.mockReset();
  runChappiAgent.mockReset();
  closeConfirmedAction.mockReset();
  runChappiAgent.mockResolvedValue({ reply: 'ok', clientActions: [], pendingConfirmation: null });
});

describe('POST /api/urgans — confirmed actions', () => {
  it('runs the approved gated tool and never enters the model tool loop', async () => {
    executeToolCall.mockResolvedValue({
      ok: true,
      summary: 'Deleted the release.',
      clientAction: { type: 'navigate', href: '/dashboard' },
    });
    closeConfirmedAction.mockResolvedValue('Done — that release is gone.');

    const response = await POST(
      post({
        messages,
        confirmedAction: { toolName: 'delete_release', args: { releaseId: 'r1' } },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executeToolCall.mock.calls[0][1]).toBe('delete_release');
    expect(executeToolCall.mock.calls[0][2]).toEqual({ releaseId: 'r1' });
    // The agent loop must not run on this path — the user already decided.
    expect(runChappiAgent).not.toHaveBeenCalled();
    expect(body.reply).toBe('Done — that release is gone.');
    expect(body.clientActions).toEqual([{ type: 'navigate', href: '/dashboard' }]);
    expect(body.pendingConfirmation).toBeNull();
  });

  it('refuses to execute a tool that is not confirmation-gated', async () => {
    // Without this the approve path would be a generic executor: anything able
    // to POST could invoke any tool by name, skipping the model entirely.
    const response = await POST(
      post({
        messages,
        confirmedAction: { toolName: 'list_releases', args: {} },
      })
    );

    expect(response.status).toBe(400);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('refuses an unknown tool name', async () => {
    const response = await POST(
      post({ messages, confirmedAction: { toolName: 'drop_all_tables', args: {} } })
    );

    expect(response.status).toBe(400);
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('falls back to the tool summary when the model cannot write a closing line', async () => {
    // The action already ran. A model hiccup must never leave the user
    // believing nothing happened.
    executeToolCall.mockResolvedValue({ ok: true, summary: 'Deleted the release.' });
    closeConfirmedAction.mockResolvedValue('');

    const response = await POST(
      post({
        messages,
        confirmedAction: { toolName: 'delete_release', args: { releaseId: 'r1' } },
      })
    );
    const body = await response.json();

    expect(body.reply).toBe('Deleted the release.');
    // No clientAction from the tool, so the route queues a refresh itself.
    expect(body.clientActions).toEqual([{ type: 'refresh' }]);
  });

  it('queues no client action when the approved tool failed', async () => {
    executeToolCall.mockResolvedValue({ ok: false, summary: 'That release was not found.' });
    closeConfirmedAction.mockResolvedValue('');

    const response = await POST(
      post({
        messages,
        confirmedAction: { toolName: 'delete_release', args: { releaseId: 'gone' } },
      })
    );
    const body = await response.json();

    expect(body.reply).toBe('That release was not found.');
    expect(body.clientActions).toEqual([]);
  });

  it('forwards a pending confirmation from a normal turn', async () => {
    const pending = {
      toolName: 'delete_release',
      args: { releaseId: 'r1' },
      title: 'Delete "Midnight EP"?',
      confirmLabel: 'Delete release',
    };
    runChappiAgent.mockResolvedValue({
      reply: 'Ready when you are.',
      clientActions: [],
      pendingConfirmation: pending,
    });

    const response = await POST(post({ messages }));
    const body = await response.json();

    expect(runChappiAgent).toHaveBeenCalledTimes(1);
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(body.pendingConfirmation).toEqual(pending);
  });

  it('ignores a malformed confirmedAction rather than trusting it', async () => {
    // args as an array, not an object — parse returns null, so this is just a
    // normal turn.
    const response = await POST(
      post({ messages, confirmedAction: { toolName: 'delete_release', args: ['r1'] } })
    );

    expect(response.status).toBe(200);
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(runChappiAgent).toHaveBeenCalledTimes(1);
  });
});
