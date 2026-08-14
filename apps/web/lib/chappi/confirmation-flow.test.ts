import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Integration test for the permission gate, exercising the REAL runner, the
// REAL tool registry, and a real tool's confirm builder. Only two seams are
// mocked: the model gateway (so we can make the model "decide" to call a gated
// tool) and dispatch.executeToolCall (so we can prove it is never reached).
//
// runner-gate.test.ts pins the pure decision in isolation; this one proves the
// decision is actually wired into the loop — that a model asking to delete
// something produces a card and nothing else.

const executeToolCall = vi.fn();

vi.mock('./dispatch', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  resolveChappiContext: vi.fn(),
}));

vi.mock('./config', () => ({
  getChappiModelConfig: () => ({
    apiKey: 'test-key',
    model: 'test-model',
    baseURL: 'https://gateway.test/v1',
  }),
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
}));

import { runChappiAgent } from './runner';
import type { ChappiToolContext } from './tools';

const ctx = {
  user: { id: 'user-1', email: 'manager@example.com' },
  adminClient: {} as never,
  workspaceIds: ['ws-1'],
  origin: 'https://app.test',
  authToken: 'jwt',
} satisfies ChappiToolContext;

/** One assistant turn that calls `name` with `args`, then (on later rounds) a
 * plain text turn so the loop terminates. */
function modelCalls(name: string, args: Record<string, unknown>) {
  let called = false;
  return () => {
    if (called) {
      return {
        choices: [{ message: { content: 'Have a look at the confirmation card.' } }],
      };
    }
    called = true;
    return {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    };
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  executeToolCall.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('confirmation gate, end to end through the runner', () => {
  it('proposes a card and executes nothing when the model calls a gated tool', async () => {
    const nextModelTurn = modelCalls('delete_note', { noteId: 'note-1' });

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat/completions')) return jsonResponse(nextModelTurn());
      // delete_note's confirm builder reads the notebook to name the card.
      if (String(url).includes('/api/notes')) {
        return jsonResponse({
          notes: [{ id: 'note-1', body: 'Call Ade about the masters\nsecond line' }],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runChappiAgent({
      ctx,
      system: 'system',
      messages: [{ id: 'm1', role: 'user', content: 'delete that note' }],
    });

    // The whole point: the deletion did not happen.
    expect(executeToolCall).not.toHaveBeenCalled();

    expect(result.pendingConfirmation).not.toBeNull();
    expect(result.pendingConfirmation?.toolName).toBe('delete_note');
    expect(result.pendingConfirmation?.args).toEqual({ noteId: 'note-1' });
    // The card names the note by its first line, not its id.
    expect(result.pendingConfirmation?.title).toContain('Call Ade about the masters');
    expect(result.pendingConfirmation?.confirmLabel).toBe('Delete note');

    // And no client action was queued — nothing changed, so nothing to refresh.
    expect(result.clientActions).toEqual([]);
  });

  it('tells the model it only proposed, so it cannot claim the deletion happened', async () => {
    const nextModelTurn = modelCalls('delete_note', { noteId: 'note-1' });
    const gatewayBodies: string[] = [];

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/chat/completions')) {
        gatewayBodies.push(String(init?.body ?? ''));
        return jsonResponse(nextModelTurn());
      }
      if (String(url).includes('/api/notes')) {
        return jsonResponse({ notes: [{ id: 'note-1', body: 'A note' }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await runChappiAgent({
      ctx,
      system: 'system',
      messages: [{ id: 'm1', role: 'user', content: 'delete that note' }],
    });

    // The second gateway call carries the tool result the model sees.
    const followUp = gatewayBodies[1] ?? '';
    expect(followUp).toContain('PROPOSED, NOT EXECUTED');
    expect(followUp).toContain('Do not call this tool again');
  });

  it('still executes ungated tools normally', async () => {
    const nextModelTurn = modelCalls('list_releases', {});
    executeToolCall.mockResolvedValue({ ok: true, summary: 'Found 2 release(s).' });

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat/completions')) return jsonResponse(nextModelTurn());
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runChappiAgent({
      ctx,
      system: 'system',
      messages: [{ id: 'm1', role: 'user', content: 'what have I got on?' }],
    });

    expect(executeToolCall).toHaveBeenCalledWith(ctx, 'list_releases', {});
    expect(result.pendingConfirmation).toBeNull();
  });

  it('relays a failed proposal as an ordinary error the model can recover from', async () => {
    // A note id that does not resolve: the confirm builder returns ok:false, so
    // the model is told what went wrong rather than getting a card.
    const nextModelTurn = modelCalls('delete_note', { noteId: 'ghost' });

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat/completions')) return jsonResponse(nextModelTurn());
      if (String(url).includes('/api/notes')) return jsonResponse({ notes: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runChappiAgent({
      ctx,
      system: 'system',
      messages: [{ id: 'm1', role: 'user', content: 'delete the ghost note' }],
    });

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(result.pendingConfirmation).toBeNull();
  });

  it('survives a confirm builder that throws, without taking down the turn', async () => {
    const nextModelTurn = modelCalls('delete_note', { noteId: 'note-1' });

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat/completions')) return jsonResponse(nextModelTurn());
      if (String(url).includes('/api/notes')) throw new Error('network down');
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runChappiAgent({
      ctx,
      system: 'system',
      messages: [{ id: 'm1', role: 'user', content: 'delete that note' }],
    });

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(result.pendingConfirmation).toBeNull();
    expect(result.reply).toBeTruthy();
  });

  it('refuses a second proposal while one is already pending', async () => {
    // Two gated calls in ONE assistant turn — only the first may become a card.
    let served = false;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/chat/completions')) {
        if (served) {
          return jsonResponse({ choices: [{ message: { content: 'Approve the card first.' } }] });
        }
        served = true;
        return jsonResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'c1',
                    type: 'function',
                    function: {
                      name: 'delete_note',
                      arguments: JSON.stringify({ noteId: 'note-1' }),
                    },
                  },
                  {
                    id: 'c2',
                    type: 'function',
                    function: {
                      name: 'delete_note',
                      arguments: JSON.stringify({ noteId: 'note-2' }),
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      if (String(url).includes('/api/notes')) {
        return jsonResponse({
          notes: [
            { id: 'note-1', body: 'First note' },
            { id: 'note-2', body: 'Second note' },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runChappiAgent({
      ctx,
      system: 'system',
      messages: [{ id: 'm1', role: 'user', content: 'delete both notes' }],
    });

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(result.pendingConfirmation?.args).toEqual({ noteId: 'note-1' });
  });
});
