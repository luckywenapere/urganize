import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// What the UrgAns loop reports for credits: every gateway call it made, with the
// model that answered and the tokens it reported, cached tokens included. A
// charge is worked out from this, so what matters is that it is complete (every
// round, the round-cap summary, a hop to another model) and that it is the same
// whether or not the model router is on.

const executeToolCall = vi.fn();

vi.mock('./dispatch', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  resolveChappiContext: vi.fn(),
}));

vi.mock('./config', () => ({
  getChappiModelConfig: () => ({ apiKey: 'test-key', model: 'openai/gpt-4o-mini', baseURL: 'https://gateway.test/v1' }),
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
}));

import { runChappiAgent } from './runner';
import type { ChappiToolContext } from './tools';
import { decisionForTier } from '@/lib/ai/model-router';
import { turnCharge } from '@/lib/credits/pricing';

const ctx = {
  user: { id: 'user-1', email: 'manager@example.com' },
  adminClient: {} as never,
  workspaceIds: ['ws-1'],
  releaseOwnerIds: ['user-1'],
  artistScopeByOwnerId: {},
  artistScopeByWorkspaceId: {},
  origin: 'https://app.test',
  authToken: 'jwt',
} satisfies ChappiToolContext;

const messages = [{ id: 'm1', role: 'user' as const, content: 'hello' }];

type Usage = { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens: number } };

const reply = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as unknown as Response;

const say = (content: string, usage?: Usage) => reply({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) });

const callTool = (name: string, usage?: Usage) =>
  reply({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [{ id: 'call-0', type: 'function', function: { name, arguments: '{}' } }],
        },
      },
    ],
    ...(usage ? { usage } : {}),
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  executeToolCall.mockReset();
  executeToolCall.mockResolvedValue({ ok: true, summary: 'done' });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('usageCalls', () => {
  it('reports the model, the tokens and the cached tokens of a single call', async () => {
    fetchMock.mockResolvedValue(
      say('Hi.', { prompt_tokens: 10_800, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 10_624 } })
    );

    const result = await runChappiAgent({ ctx, system: 'sys', messages });

    expect(result.usageCalls).toEqual([
      { model: 'openai/gpt-4o-mini', promptTokens: 10_800, completionTokens: 40, cachedTokens: 10_624 },
    ]);
  });

  it('reports one entry per round, in order, so a tool turn is charged for every call it made', async () => {
    fetchMock
      .mockResolvedValueOnce(callTool('list_releases', { prompt_tokens: 10_800, completion_tokens: 80 }))
      .mockResolvedValueOnce(
        say('Here they are.', { prompt_tokens: 11_400, completion_tokens: 350, prompt_tokens_details: { cached_tokens: 10_800 } })
      );

    const result = await runChappiAgent({ ctx, system: 'sys', messages });

    expect(result.usageCalls).toHaveLength(2);
    expect(result.usageCalls.map((call) => call.promptTokens)).toEqual([10_800, 11_400]);
    expect(result.usageCalls.map((call) => call.cachedTokens)).toEqual([null, 10_800]);
  });

  it('reports a call whose usage the gateway left out as unreported, never as zero', async () => {
    fetchMock.mockResolvedValue(say('Hi.'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages });

    expect(result.usageCalls).toEqual([
      { model: 'openai/gpt-4o-mini', promptTokens: null, completionTokens: null, cachedTokens: null },
    ]);
    // Which the pricing then charges as the nominal call, not as a free one.
    expect(turnCharge(result.usageCalls).credits).toBeGreaterThanOrEqual(1);
    expect(turnCharge(result.usageCalls).assumed).toBe(true);
  });

  it('names the model that actually answered when the router moved the turn to another', async () => {
    const decision = decisionForTier({ surface: 'chat', tier: 'pro', ceiling: 'max', env: {} });
    fetchMock.mockResolvedValue(say('Considered.', { prompt_tokens: 10_800, completion_tokens: 60 }));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision, now: () => 10_000_000 } });

    expect(result.usageCalls).toHaveLength(1);
    expect(result.usageCalls[0].model).toBe(decision.model);
  });

  it('throws rather than returning calls to charge when the gateway fails, so a failed turn is never billed', async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: 'bad key' } }, 401));

    await expect(runChappiAgent({ ctx, system: 'sys', messages })).rejects.toBeDefined();
  });
});
