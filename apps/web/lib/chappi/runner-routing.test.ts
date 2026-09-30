import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The UrgAns loop with the model router. Same seams as confirmation-flow.test.ts
// and nothing more: the model gateway is a scripted fetch, executeToolCall is a
// mock so no real tool runs. The real runner, the real router and the real tool
// registry are used, because the point is how they behave together.

const executeToolCall = vi.fn();
// The model CHAPPI_MODEL names. Hoisted so the config mock below (which vitest
// lifts above the imports) can read it; changed per test where it matters.
const configured = vi.hoisted(() => ({ model: 'test-model' }));

vi.mock('./dispatch', () => ({
  executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  resolveChappiContext: vi.fn(),
}));

vi.mock('./config', () => ({
  getChappiModelConfig: () => ({
    apiKey: 'test-key',
    model: configured.model,
    baseURL: 'https://gateway.test/v1',
  }),
  isChappiEnabled: () => true,
  isChappiModelConfigured: () => true,
}));

import {
  buildChatCompletionBody,
  closeConfirmedAction,
  defaultTokenParam,
  parseToolArguments,
  runChappiAgent,
  tokenParamAfterRejection,
} from './runner';
import type { ChappiToolContext } from './tools';
import { decisionForTier, type RouteDecision } from '@/lib/ai/model-router';
import { GatewayError } from '@/lib/ai/gateway-error';

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
const T0 = 10_000_000;

const at = (tier: 'quick' | 'standard' | 'pro' | 'max', surface: 'chat' | 'chat_closeout' = 'chat'): RouteDecision =>
  decisionForTier({ surface, tier, ceiling: 'max', env: {} });

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

const say = (content: string, usage?: { prompt_tokens: number; completion_tokens: number }) =>
  reply({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) });

const callTools = (calls: Array<{ name: string; args?: string }>) =>
  reply({
    choices: [
      {
        message: {
          content: null,
          tool_calls: calls.map((c, i) => ({
            id: `call-${i}`,
            type: 'function',
            function: { name: c.name, arguments: c.args ?? '{}' },
          })),
        },
      },
    ],
  });

let fetchMock: ReturnType<typeof vi.fn>;
const bodyOf = (call: number) => JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body) as Record<string, unknown>;
const modelsCalled = () => fetchMock.mock.calls.map((_, i) => bodyOf(i).model);

beforeEach(() => {
  configured.model = 'test-model';
  executeToolCall.mockReset();
  executeToolCall.mockResolvedValue({ ok: true, summary: 'done' });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('without routing (the router off)', () => {
  it('calls the configured model exactly as before', async () => {
    fetchMock.mockResolvedValue(say('Hi there.'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages });

    expect(result.reply).toBe('Hi there.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodyOf(0);
    expect(body.model).toBe('test-model');
    expect(body.max_tokens).toBe(1024);
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body.stream).toBe(false);
  });

  it('never hops: a rate limit is thrown, typed, after one request', async () => {
    fetchMock.mockResolvedValue(
      reply({ error: { code: 'rate_limit_exceeded', message: 'Slow down' } }, 429, { 'retry-after': '2' })
    );

    const error = await runChappiAgent({ ctx, system: 'sys', messages }).catch((e) => e);

    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({ status: 429, code: 'rate_limit_exceeded', retryAfterMs: 2000 });
    expect(error.message).toContain('Chappi gateway request failed (429)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still returns a trace, marked off, with the model and token totals', async () => {
    fetchMock.mockResolvedValue(say('Hi.', { prompt_tokens: 500, completion_tokens: 30 }));

    const { trace } = await runChappiAgent({ ctx, system: 'sys', messages });

    expect(trace).toMatchObject({
      mode: 'off',
      surface: 'chat',
      models: ['test-model'],
      rounds: 1,
      tokensIn: 500,
      tokensOut: 30,
    });
    expect(trace.hops).toEqual([]);
  });

  it('keeps token counts null when the gateway reports none', async () => {
    fetchMock.mockResolvedValue(say('Hi.'));
    const { trace } = await runChappiAgent({ ctx, system: 'sys', messages });
    expect(trace.tokensIn).toBeNull();
    expect(trace.tokensOut).toBeNull();
  });

  it('sends max_completion_tokens instead of max_tokens to a GPT-5 family model', async () => {
    fetchMock.mockResolvedValue(say('Hi.'));
    // The one difference from before the router existed, and only for a model
    // that needs it: this family rejects max_tokens.
    configured.model = 'openai/gpt-5.4-mini';

    await runChappiAgent({ ctx, system: 'sys', messages });

    const body = bodyOf(0);
    expect(body.max_completion_tokens).toBe(1024);
    expect(body).not.toHaveProperty('max_tokens');
    // No routing decision means no effort is requested.
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('sends exactly the same request body as before for the model in production', async () => {
    fetchMock.mockResolvedValue(say('Hi.'));
    configured.model = 'openai/gpt-4o-mini';

    await runChappiAgent({ ctx, system: 'sys', messages });

    const init = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['model', 'messages', 'max_tokens', 'stream', 'tools']);
    expect(body.max_tokens).toBe(1024);
  });
});

describe('with routing on', () => {
  it('uses the decision\'s model, a token cap for that rung and its reasoning effort', async () => {
    fetchMock.mockResolvedValue(say('Considered answer.'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } });

    expect(result.reply).toBe('Considered answer.');
    const body = bodyOf(0);
    expect(body.model).toBe('openai/gpt-5.6-terra');
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.reasoning_effort).toBe('low');
    expect(body).not.toHaveProperty('max_tokens');
    expect(result.trace).toMatchObject({ mode: 'on', startTier: 'pro', endTier: 'pro', models: ['openai/gpt-5.6-terra'] });
  });

  it('keeps the classic parameters for a non-reasoning model on the quick rung', async () => {
    fetchMock.mockResolvedValue(say('Quick answer.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('quick'), now: () => T0 } });

    const body = bodyOf(0);
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.max_tokens).toBe(1024);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('moves to the same-tier sibling on a rate limit and finishes the same round', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ error: { code: 'rate_limit_exceeded' } }, 429))
      .mockResolvedValueOnce(say('Answered by the sibling.'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } });

    expect(result.reply).toBe('Answered by the sibling.');
    expect(modelsCalled()).toEqual(['openai/gpt-5.6-terra', 'openai/gpt-5.4']);
    expect(result.trace.hops).toEqual([{ from: 'openai/gpt-5.6-terra', to: 'openai/gpt-5.4', kind: 'rate_limited' }]);
    expect(result.trace.models).toEqual(['openai/gpt-5.6-terra', 'openai/gpt-5.4']);
    // A sibling is the same rung, so the tier does not move.
    expect(result.trace).toMatchObject({ startTier: 'pro', endTier: 'pro' });
  });

  it('gives up with the typed error once there is nowhere left to go', async () => {
    fetchMock.mockResolvedValue(reply({ error: { code: 'invalid_api_key' } }, 401));

    const error = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } }).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(GatewayError);
    expect(error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resends once without reasoning_effort when the gateway rejects it', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ error: { message: 'Unsupported parameter: reasoning_effort' } }, 400))
      .mockResolvedValueOnce(say('Fine.'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } });

    expect(result.reply).toBe('Fine.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).reasoning_effort).toBe('low');
    expect(bodyOf(1)).not.toHaveProperty('reasoning_effort');
    // Same model: a rejected parameter is not a reason to change model.
    expect(modelsCalled()).toEqual(['openai/gpt-5.6-terra', 'openai/gpt-5.6-terra']);
  });

  it('swaps the token-cap parameter once when the gateway rejects the one it sent', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ error: { message: "Unsupported parameter: 'max_completion_tokens' is not supported with this model." } }, 400)
      )
      .mockResolvedValueOnce(say('Fine.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } });

    expect(bodyOf(0)).toHaveProperty('max_completion_tokens');
    expect(bodyOf(1)).toHaveProperty('max_tokens');
    expect(bodyOf(1)).not.toHaveProperty('max_completion_tokens');
  });

  it('totals token usage across rounds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({
          choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_releases', arguments: '{}' } }] } }],
          usage: { prompt_tokens: 1000, completion_tokens: 20 },
        })
      )
      .mockResolvedValueOnce(say('Here you go.', { prompt_tokens: 1200, completion_tokens: 60 }));

    const { trace } = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('quick'), now: () => T0 } });

    expect(trace).toMatchObject({ rounds: 2, tokensIn: 2200, tokensOut: 80 });
  });

  it('escalates for the rest of the turn after the tools fail twice', async () => {
    executeToolCall.mockResolvedValue({ ok: false, summary: 'That id does not exist.' });
    fetchMock
      .mockResolvedValueOnce(callTools([{ name: 'update_task' }, { name: 'update_task' }]))
      .mockResolvedValueOnce(say('Sorted it out.'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.6-terra']);
    expect(result.trace.hops).toEqual([{ from: 'openai/gpt-5.4-mini', to: 'openai/gpt-5.6-terra', kind: 'tool_errors' }]);
    // The trace says where the turn started and where it ended up.
    expect(result.trace).toMatchObject({ startTier: 'standard', endTier: 'pro' });
    expect(result.reply).toBe('Sorted it out.');
  });

  it('counts a tool call whose arguments are not JSON as a tool failure', async () => {
    fetchMock
      .mockResolvedValueOnce(callTools([{ name: 'list_releases', args: '{not json' }, { name: 'list_releases', args: '<<<' }]))
      .mockResolvedValueOnce(say('Recovered.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.6-terra']);
  });

  it('does not count an empty arguments string as a failure: some models send that for a tool with no parameters', async () => {
    fetchMock
      .mockResolvedValueOnce(callTools([{ name: 'list_releases', args: '' }, { name: 'list_releases', args: '   ' }]))
      .mockResolvedValueOnce(say('Here they are.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.4-mini']);
  });

  it('still runs a tool whose arguments did not parse, with empty arguments, as it always has', async () => {
    fetchMock.mockResolvedValueOnce(callTools([{ name: 'list_releases', args: '{not json' }])).mockResolvedValueOnce(say('Ok.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    expect(executeToolCall).toHaveBeenCalledWith(ctx, 'list_releases', {});
  });

  it('does not escalate after a single tool failure', async () => {
    executeToolCall.mockResolvedValueOnce({ ok: false, summary: 'Nope.' }).mockResolvedValue({ ok: true, summary: 'ok' });
    fetchMock.mockResolvedValueOnce(callTools([{ name: 'update_task' }, { name: 'list_releases' }])).mockResolvedValueOnce(say('Done.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.4-mini']);
  });

  it('never escalates past the plan ceiling', async () => {
    executeToolCall.mockResolvedValue({ ok: false, summary: 'Nope.' });
    fetchMock
      .mockResolvedValueOnce(callTools([{ name: 'update_task' }, { name: 'update_task' }]))
      .mockResolvedValueOnce(say('Could not.'));

    await runChappiAgent({
      ctx,
      system: 'sys',
      messages,
      routing: { decision: { ...at('standard'), ceiling: 'standard' }, now: () => T0 },
    });

    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.4-mini']);
  });

  it('escalates when a reasoning model spends its whole cap thinking and returns nothing', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }))
      .mockResolvedValueOnce(say('A real answer.'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    expect(result.reply).toBe('A real answer.');
    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.6-terra']);
  });

  it('does not treat an empty last round as a failure when an earlier round already said something', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({
          choices: [
            {
              message: {
                content: 'Checking that now.',
                tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_releases', arguments: '{}' } }],
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(reply({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.4-mini']);
    expect(result.reply).toBe('Checking that now.');
  });

  it('does not change model for a 400 that is about the request itself', async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: 'messages must be an array' } }, 400));

    const error = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } }).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(GatewayError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('remembers a swapped token parameter for the rest of the turn instead of asking again', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ error: { message: "Unsupported parameter: 'max_completion_tokens' is not supported." } }, 400))
      .mockResolvedValueOnce(callTools([{ name: 'list_releases' }]))
      .mockResolvedValueOnce(say('Done.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(1)).toHaveProperty('max_tokens');
    expect(bodyOf(2)).toHaveProperty('max_tokens');
    expect(bodyOf(2)).not.toHaveProperty('max_completion_tokens');
  });

  it('remembers that a model rejected reasoning effort for the rest of the turn', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ error: { message: 'reasoning_effort is not supported with tools' } }, 400))
      .mockResolvedValueOnce(callTools([{ name: 'list_releases' }]))
      .mockResolvedValueOnce(say('Done.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(0)).toHaveProperty('reasoning_effort');
    expect(bodyOf(1)).not.toHaveProperty('reasoning_effort');
    expect(bodyOf(2)).not.toHaveProperty('reasoning_effort');
  });

  it('does not loop on a gateway that keeps rejecting parameters: three requests at most, then the error', async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: 'Unsupported parameter: reasoning_effort; Unsupported parameter: max_completion_tokens' } }, 400));

    const error = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } }).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(GatewayError);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('counts tool failures afresh after moving up, so one more does not push it up again', async () => {
    executeToolCall.mockResolvedValue({ ok: false, summary: 'Nope.' });
    fetchMock
      .mockResolvedValueOnce(callTools([{ name: 'update_task' }, { name: 'update_task' }]))
      .mockResolvedValueOnce(callTools([{ name: 'update_task' }]))
      .mockResolvedValueOnce(say('Could not.'));

    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('standard'), now: () => T0 } });

    // standard -> pro after two failures; one more failure is not two.
    expect(modelsCalled()).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-terra']);
  });

  it('leaves an empty answer alone when the router is off, as before', async () => {
    fetchMock.mockResolvedValue(reply({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }));

    const result = await runChappiAgent({ ctx, system: 'sys', messages });

    expect(result.reply).toBe('Done.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('the closing summary when the round cap is hit', () => {
    const alwaysCallsTools = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown };
      return body.tools ? callTools([{ name: 'list_releases' }]) : null;
    };

    it('keeps what the model said when the closing call fails, once tools have run', async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const asTools = await alwaysCallsTools(url, init);
        return asTools ?? reply({ error: { message: 'down' } }, 500);
      });

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        routing: { decision: at('quick'), closeoutDecision: at('quick', 'chat_closeout'), now: () => T0 },
      });

      // The tools already ran; a failed summary must not turn the turn into an error.
      expect(result.reply).toBe('Done.');
      expect(executeToolCall).toHaveBeenCalledTimes(5);
    });

    it('moves the closing call to the sibling model when it is rate limited', async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const asTools = await alwaysCallsTools(url, init);
        if (asTools) return asTools;
        const model = (JSON.parse(String(init?.body)) as { model: string }).model;
        return model === 'openai/gpt-4o-mini' ? reply({ error: { code: 'rate_limit_exceeded' } }, 429) : say('Summed up.');
      });

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        routing: { decision: at('quick'), closeoutDecision: at('quick', 'chat_closeout'), now: () => T0 },
      });

      expect(result.reply).toBe('Summed up.');
      expect(modelsCalled().slice(-2)).toEqual(['openai/gpt-4o-mini', 'openai/gpt-5.6-luna']);
    });

    it('skips the closing summary, without calling it a failure, when there is no time left for it', async () => {
      let clock = T0;
      let calls = 0;
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        calls += 1;
        // The fifth tool round is the slow one: it leaves 2s of a 50s turn.
        if (calls === 5) clock = T0 + 48_000;
        const body = JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown };
        return body.tools ? callTools([{ name: 'list_releases' }]) : say('Summed up.');
      });

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        routing: {
          decision: at('quick'),
          closeoutDecision: at('quick', 'chat_closeout'),
          deadlineMs: T0 + 50_000,
          now: () => clock,
        },
      });

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(result.reply).toBe('Done.');
      // The work is done; nothing was cut short, so no apology is added.
      expect(result.trace.degraded).toBeUndefined();
    });

    it('is left to fail exactly as before when the router is off', async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        const asTools = await alwaysCallsTools(url, init);
        return asTools ?? reply({ error: { message: 'down' } }, 500);
      });

      await expect(runChappiAgent({ ctx, system: 'sys', messages })).rejects.toBeInstanceOf(GatewayError);
    });

    it('runs on the closing decision (quick) with no tools', async () => {
      // The model asks for a tool every round, so the loop hits its cap.
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown };
        return body.tools ? callTools([{ name: 'list_releases' }]) : say('Here is the summary.');
      });

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        routing: { decision: at('pro'), closeoutDecision: at('quick', 'chat_closeout'), now: () => T0 },
      });

      expect(result.reply).toBe('Here is the summary.');
      const last = fetchMock.mock.calls.length - 1;
      expect(bodyOf(last).model).toBe('openai/gpt-4o-mini');
      expect(bodyOf(last)).not.toHaveProperty('tools');
      // The five tool rounds all ran on the turn's own rung.
      for (let i = 0; i < last; i += 1) expect(bodyOf(i).model).toBe('openai/gpt-5.6-terra');
    });
  });

  describe('against the turn deadline', () => {
    it('starts on a faster rung when there is not time for the one it wanted', async () => {
      fetchMock.mockResolvedValue(say('In time.'));

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        // Max needs ~26.5s; only 20s remain, so it drops to pro.
        routing: { decision: at('max'), deadlineMs: T0 + 20_000, now: () => T0 },
      });

      expect(bodyOf(0).model).toBe('openai/gpt-5.6-terra');
      expect(result.trace.reasons.join(' ')).toMatch(/time: max -> pro/);
    });

    it('steps down a rung between rounds when the time left cannot fit the current one, without calling it a hop', async () => {
      let clock = T0;
      fetchMock
        .mockImplementationOnce(async () => {
          clock = T0 + 30_000; // 10s of the 40s remain: enough for standard, not for pro
          return callTools([{ name: 'list_releases' }]);
        })
        .mockResolvedValueOnce(say('Finished in time.'));

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        routing: { decision: at('pro'), deadlineMs: T0 + 40_000, now: () => clock },
      });

      expect(modelsCalled()).toEqual(['openai/gpt-5.6-terra', 'openai/gpt-5.4-mini']);
      expect(result.reply).toBe('Finished in time.');
      expect(result.trace.hops).toEqual([]);
      expect(result.trace.reasons.join(' ')).toMatch(/time: pro -> standard/);
      expect(result.trace.endTier).toBe('standard');
      expect(result.trace.degraded).toBeUndefined();
    });

    it('stops looping, and says so, when the time runs out between rounds', async () => {
      let clock = T0;
      fetchMock.mockImplementation(async () => {
        clock = T0 + 30_000; // the first model call takes 30s
        return callTools([{ name: 'list_releases' }]);
      });

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        routing: { decision: at('quick'), deadlineMs: T0 + 32_000, now: () => clock },
      });

      // One round ran and its tool executed; there was no time for a second.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(executeToolCall).toHaveBeenCalledTimes(1);
      expect(result.reply).toMatch(/longer than I had time for/i);
      expect(result.trace.degraded).toBe('deadline');
    });

    it('keeps the last thing the model said, and says it ran out of time', async () => {
      let clock = T0;
      fetchMock.mockImplementation(async () => {
        clock = T0 + 30_000;
        return reply({
          choices: [
            {
              message: {
                content: 'I have started on that.',
                tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_releases', arguments: '{}' } }],
              },
            },
          ],
        });
      });

      const result = await runChappiAgent({
        ctx,
        system: 'sys',
        messages,
        routing: { decision: at('quick'), deadlineMs: T0 + 32_000, now: () => clock },
      });

      expect(result.reply).toContain('I have started on that.');
      expect(result.reply).toMatch(/ran out of time/i);
      expect(result.trace.degraded).toBe('deadline');
    });

    it('cuts the per-request timeout to what the deadline leaves', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(abort));
          })
      );

      const started = Date.now();
      await expect(
        runChappiAgent({
          ctx,
          system: 'sys',
          messages,
          // The real clock, and only 2s left: the request must be given up on
          // long before the 45s default would have let it hang.
          routing: { decision: at('quick'), deadlineMs: started + 2_000 },
        })
      ).rejects.toBeDefined();

      expect(Date.now() - started).toBeLessThan(5_000);
      // It was the abort that ended it, and nothing else was tried in the time left.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }, 15_000);
  });

  it('leaves the confirmation gate exactly where it was, whatever model is asked', async () => {
    fetchMock.mockResolvedValueOnce(callTools([{ name: 'delete_note', args: '{"noteId":"n1"}' }])).mockImplementation(async (url: string) => {
      if (String(url).includes('/api/notes')) return reply({ notes: [{ id: 'n1', body: 'A note' }] });
      return say('Please approve the card.');
    });

    const result = await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('max'), now: () => T0 } });

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(result.pendingConfirmation?.toolName).toBe('delete_note');
  });
});

describe('what a turn leaves in the log', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  const logged = () => (console.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(String(c[1])));

  it('says nothing for a routed turn that went to its first model and worked', async () => {
    fetchMock.mockResolvedValue(say('Hi.'));
    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('quick'), now: () => T0 } });
    expect(console.info).not.toHaveBeenCalled();
  });

  it('logs one line for a routed turn that changed model', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { code: 'rate_limit_exceeded' } }, 429)).mockResolvedValueOnce(say('Hi.'));
    await runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } });

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(logged()[0]).toMatchObject({ surface: 'chat', hop_count: 1, end_tier: 'pro' });
  });

  it('logs a routed turn that failed, and still throws it', async () => {
    fetchMock.mockResolvedValue(reply({ error: { code: 'invalid_api_key' } }, 401));
    await expect(
      runChappiAgent({ ctx, system: 'sys', messages, routing: { decision: at('pro'), now: () => T0 } })
    ).rejects.toBeInstanceOf(GatewayError);

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(logged()[0]).toMatchObject({ mode: 'on', models: ['openai/gpt-5.6-terra'] });
  });

  it('never logs a turn the router did not route, even one that failed', async () => {
    fetchMock.mockResolvedValue(reply({ error: { code: 'invalid_api_key' } }, 401));
    await runChappiAgent({ ctx, system: 'sys', messages }).catch(() => {});
    expect(console.info).not.toHaveBeenCalled();
  });
});

describe('closeConfirmedAction', () => {
  const args = {
    system: 'sys',
    messages,
    toolName: 'delete_note',
    result: { ok: true, summary: 'Deleted "A note".' },
  };

  it('uses the configured model when there is no routing', async () => {
    fetchMock.mockResolvedValue(say('Deleted it.'));
    expect(await closeConfirmedAction(args)).toBe('Deleted it.');
    expect(bodyOf(0).model).toBe('test-model');
    expect(bodyOf(0)).not.toHaveProperty('tools');
  });

  it('uses the routed decision when there is one', async () => {
    fetchMock.mockResolvedValue(say('Deleted it.'));
    await closeConfirmedAction({ ...args, routing: { decision: at('quick', 'chat_closeout'), now: () => T0 } });
    expect(bodyOf(0).model).toBe('openai/gpt-4o-mini');
  });

  it('returns an empty string rather than throwing when the model fails', async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: 'down' } }, 500));
    expect(await closeConfirmedAction(args)).toBe('');
  });
});

describe('parseToolArguments', () => {
  it('reads an object', () => {
    expect(parseToolArguments('{"a":1}')).toEqual({ args: { a: 1 }, valid: true });
  });

  it('treats an empty or blank string as valid empty arguments', () => {
    expect(parseToolArguments('')).toEqual({ args: {}, valid: true });
    expect(parseToolArguments('  \t ')).toEqual({ args: {}, valid: true });
  });

  it('marks text that is not JSON, and JSON that is not an object, invalid, with empty arguments', () => {
    for (const raw of ['{not json', '<<<', 'null', '"a string"', '42']) {
      expect(parseToolArguments(raw)).toEqual({ args: {}, valid: false });
    }
  });
});

describe('tokenParamAfterRejection', () => {
  it('swaps max_tokens for max_completion_tokens on the wording OpenAI itself uses, which names both', () => {
    const message =
      "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.";
    expect(tokenParamAfterRejection('max_tokens', message)).toBe('max_completion_tokens');
  });

  it('does not swap when the message rejects the OTHER parameter than the one sent', () => {
    // We sent max_completion_tokens; the gateway complaining about max_tokens
    // means it translated ours, so swapping back would not help.
    const message =
      "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.";
    expect(tokenParamAfterRejection('max_completion_tokens', message)).toBeNull();
  });

  it('swaps max_completion_tokens for max_tokens when that is what the gateway does not accept', () => {
    expect(tokenParamAfterRejection('max_completion_tokens', "Unrecognized request argument supplied: max_completion_tokens")).toBe(
      'max_tokens'
    );
  });

  it('ignores a 400 that is about something else, or a value rather than a name', () => {
    expect(tokenParamAfterRejection('max_tokens', 'messages must be an array')).toBeNull();
    expect(tokenParamAfterRejection('max_completion_tokens', 'max_completion_tokens must be at least 16')).toBeNull();
  });
});

describe('defaultTokenParam', () => {
  it('sends max_completion_tokens to the GPT-5 family and max_tokens to everything else', () => {
    for (const model of ['openai/gpt-5.4', 'openai/gpt-5.6-sol', 'openai/gpt-5.4-mini', 'openai/o3-mini']) {
      expect(defaultTokenParam(model)).toBe('max_completion_tokens');
    }
    for (const model of ['openai/gpt-4o-mini', 'openai/gpt-4o', 'meta/llama-3.1-8b', 'test-model']) {
      expect(defaultTokenParam(model)).toBe('max_tokens');
    }
  });
});

describe('buildChatCompletionBody', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }];

  it('keeps the body a turn has always sent, key for key, when nothing about it is routed', () => {
    const body = buildChatCompletionBody({
      model: 'openai/gpt-4o-mini',
      messages,
      tools: [{ type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object' } } }] as never,
      maxOutputTokens: 1024,
      tokenParam: 'max_tokens',
      reasoningEffort: null,
    });
    expect(Object.keys(body)).toEqual(['model', 'messages', 'max_tokens', 'stream', 'tools']);
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(1024);
  });

  it('puts the cap under whichever parameter it is told to, and never both', () => {
    const body = buildChatCompletionBody({
      model: 'openai/gpt-5.4',
      messages,
      maxOutputTokens: 4096,
      tokenParam: 'max_completion_tokens',
      reasoningEffort: 'low',
    });
    expect(body.max_completion_tokens).toBe(4096);
    expect('max_tokens' in body).toBe(false);
  });

  it('adds reasoning_effort only when there is one, between the cap and stream', () => {
    const withEffort = buildChatCompletionBody({
      model: 'openai/gpt-5.4',
      messages,
      maxOutputTokens: 100,
      tokenParam: 'max_completion_tokens',
      reasoningEffort: 'low',
    });
    expect(Object.keys(withEffort)).toEqual(['model', 'messages', 'max_completion_tokens', 'reasoning_effort', 'stream']);
    const without = buildChatCompletionBody({
      model: 'openai/gpt-5.4',
      messages,
      maxOutputTokens: 100,
      tokenParam: 'max_completion_tokens',
      reasoningEffort: null,
    });
    expect('reasoning_effort' in without).toBe(false);
  });

  it('leaves tools out when there are none, including an empty list', () => {
    for (const tools of [undefined, []]) {
      const body = buildChatCompletionBody({
        model: 'openai/gpt-4o-mini',
        messages,
        tools: tools as never,
        maxOutputTokens: 100,
        tokenParam: 'max_tokens',
        reasoningEffort: null,
      });
      expect('tools' in body).toBe(false);
    }
  });
});
