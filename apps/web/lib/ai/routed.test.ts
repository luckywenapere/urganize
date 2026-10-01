import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateRoutedPlainText, generateRoutedStructuredOutput } from './routed';
import type { RoutingTrace } from './model-router';

// The single-shot AI features (status update, task outcome, press-kit drafting,
// the rollout planner) call these instead of the provider directly. The two
// promises worth the most are proved first: with the router off a call is
// exactly the call the feature made before, and in shadow the router decides
// nothing.

const ok = (content: unknown, usage = { prompt_tokens: 100, completion_tokens: 20 }) => ({
  ok: true,
  text: async () =>
    JSON.stringify({
      choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
      usage,
    }),
});
const fail = (status: number, body: unknown = {}) => ({
  ok: false,
  status,
  text: async () => JSON.stringify(body),
});
const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
  JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body) as Record<string, unknown>;
const modelsCalled = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map((_, i) => bodyOf(fetchMock, i).model);

const parseObject = (raw: string): { ok: boolean } | null => {
  try {
    return JSON.parse(raw) as { ok: boolean };
  } catch {
    return null;
  }
};
const messages = [{ role: 'user' as const, content: 'hi' }];

beforeEach(() => {
  vi.stubEnv('AI_API_KEY', 'test-key');
  vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
  vi.stubEnv('AI_ROUTER', '');
  vi.stubEnv('AI_STATUS_MODEL', '');
  vi.stubEnv('AI_OUTCOME_MODEL', '');
  vi.stubEnv('AI_PRESSKIT_MODEL', '');
  vi.stubEnv('AI_PLANNER_MODEL', '');
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('with the router off', () => {
  it('makes the same call the feature made before: its own env model, one request', async () => {
    vi.stubEnv('AI_STATUS_MODEL', 'openai/pinned-x');
    const fetchMock = vi.fn().mockResolvedValue(ok('A status paragraph.'));
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 });

    expect(text).toBe('A status paragraph.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0).model).toBe('openai/pinned-x');
  });

  it("leaves the model to the gateway's own default when nothing is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('Fine.'));
    vi.stubGlobal('fetch', fetchMock);

    await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 });

    expect(bodyOf(fetchMock, 0).model).toBe('openai/gpt-4o-mini');
  });

  it('gives the planner the model it always had, and only the effort it asked for', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await generateRoutedStructuredOutput({
      surface: 'planner',
      messages,
      maxRetries: 1,
      parse: parseObject,
      reasoningEffort: 'low',
    });

    expect(bodyOf(fetchMock, 0).model).toBe('openai/gpt-5.4');
    expect(bodyOf(fetchMock, 0).reasoning_effort).toBe('low');
  });

  it('never hops: a rate limit is a plain failure, exactly as before', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateRoutedStructuredOutput({ surface: 'planner', messages, maxRetries: 1, parse: parseObject })
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not report a trace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('x')));
    const onTrace = vi.fn();
    await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1, onTrace });
    expect(onTrace).not.toHaveBeenCalled();
  });

  it('is off on a gateway that is not RodiumAi, even with the switch on', async () => {
    vi.stubEnv('AI_ROUTER', 'on');
    vi.stubEnv('AI_API_BASE', 'https://openrouter.ai/api/v1');
    const fetchMock = vi.fn().mockResolvedValue(fail(429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 })).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0).model).toBe('openrouter/free');
  });
});

describe('in shadow', () => {
  beforeEach(() => vi.stubEnv('AI_ROUTER', 'shadow'));

  it('keeps using the old model but records what the router would have used', async () => {
    // The default pro rung and the planner's old model are both gpt-5.4 now, so pin
    // the rung to Terra for the router to have something different to record.
    vi.stubEnv('AI_LADDER_PRO', 'openai/gpt-5.6-terra');
    const fetchMock = vi.fn().mockResolvedValue(ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const traces: RoutingTrace[] = [];

    await generateRoutedStructuredOutput({
      surface: 'planner',
      messages,
      maxRetries: 1,
      parse: parseObject,
      onTrace: (t) => traces.push(t),
    });

    // The planner used gpt-5.4; the router would choose Terra.
    expect(modelsCalled(fetchMock)).toEqual(['openai/gpt-5.4']);
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ mode: 'shadow', wouldUseModel: 'openai/gpt-5.6-terra', legacyModel: 'openai/gpt-5.4' });
    expect(traces[0].models).toEqual(['openai/gpt-5.4']);
  });

  it('never hops, even when the router would have', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 })
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logs one line per request so the decisions can be read from the server logs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('x')));
    await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 });
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(String((console.info as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('[ai-router]');
  });
});

describe('with the router on', () => {
  beforeEach(() => vi.stubEnv('AI_ROUTER', 'on'));

  it('uses the surface\'s rung: status on quick, planner on pro, press-kit on standard', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('text'));
    vi.stubGlobal('fetch', fetchMock);

    await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 });
    await generateRoutedPlainText({ surface: 'press_kit', messages, maxRetries: 1 });
    await generateRoutedPlainText({ surface: 'planner', messages, maxRetries: 1 });

    expect(modelsCalled(fetchMock)).toEqual([
      'openai/gpt-4o-mini',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4',
    ]);
  });

  it('sends the rung\'s reasoning effort only to models that take it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('text'));
    vi.stubGlobal('fetch', fetchMock);

    await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 });
    await generateRoutedPlainText({ surface: 'press_kit', messages, maxRetries: 1 });

    expect(bodyOf(fetchMock, 0)).not.toHaveProperty('reasoning_effort');
    expect(bodyOf(fetchMock, 1).reasoning_effort).toBe('low');
  });

  it('lets an explicit effort beat the rung\'s (AI_PLANNER_REASONING_EFFORT)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await generateRoutedStructuredOutput({
      surface: 'planner',
      messages,
      maxRetries: 1,
      parse: parseObject,
      reasoningEffort: 'medium',
    });

    expect(bodyOf(fetchMock, 0).reasoning_effort).toBe('medium');
  });

  it('moves to the same-tier sibling when the model is rate limited', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('Recovered.'));
    vi.stubGlobal('fetch', fetchMock);
    const traces: RoutingTrace[] = [];

    const text = await generateRoutedPlainText({
      surface: 'status',
      messages,
      maxRetries: 1,
      onTrace: (t) => traces.push(t),
    });

    expect(text).toBe('Recovered.');
    expect(modelsCalled(fetchMock)).toEqual(['openai/gpt-4o-mini', 'openai/gpt-5.6-luna']);
    expect(traces[0].hops).toEqual([{ from: 'openai/gpt-4o-mini', to: 'openai/gpt-5.6-luna', kind: 'rate_limited' }]);
    expect(traces[0].models).toEqual(['openai/gpt-4o-mini', 'openai/gpt-5.6-luna']);
  });

  it('carries the planner from Terra to the higher-limit sibling on a rate limit, keeping its schema and effort', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };

    const value = await generateRoutedStructuredOutput({
      surface: 'planner',
      messages,
      maxRetries: 1,
      parse: parseObject,
      jsonSchema: { name: 'planner_delta', schema },
      reasoningEffort: 'low',
    });

    expect(value).toEqual({ ok: true });
    expect(modelsCalled(fetchMock)).toEqual(['openai/gpt-5.4', 'openai/gpt-5.6-terra']);
    for (const call of [0, 1]) {
      expect(bodyOf(fetchMock, call).response_format).toMatchObject({ type: 'json_schema' });
      expect(bodyOf(fetchMock, call).reasoning_effort).toBe('low');
    }
  });

  it('escalates one rung when the answer cannot be parsed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('this is not json')).mockResolvedValueOnce(ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const value = await generateRoutedStructuredOutput({
      surface: 'press_kit',
      messages,
      maxRetries: 1,
      parse: parseObject,
    });

    expect(value).toEqual({ ok: true });
    // Press-kit drafting starts on standard and, with no team information to
    // say otherwise, may climb as far as pro.
    expect(modelsCalled(fetchMock)).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.4']);
  });

  it('treats an unparseable answer as bad output whatever wording the caller gave its error', async () => {
    // The provider throws the caller's own invalidFormatMessage. If the router
    // had to recognise the failure from that text, every caller with its own
    // wording would silently lose escalation.
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('this is not json')).mockResolvedValueOnce(ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const value = await generateRoutedStructuredOutput({
      surface: 'press_kit',
      messages,
      maxRetries: 1,
      parse: parseObject,
      invalidFormatMessage: 'Something else entirely.',
    });

    expect(value).toEqual({ ok: true });
    expect(modelsCalled(fetchMock)).toEqual(['openai/gpt-5.4-mini', 'openai/gpt-5.4']);
  });

  it('stops escalating at the ceiling and lets the failure through', async () => {
    vi.stubEnv('AI_ROUTER_CEILING_TRIAL', 'standard');
    const fetchMock = vi.fn().mockResolvedValue(ok('never json'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateRoutedStructuredOutput({ surface: 'press_kit', messages, maxRetries: 1, parse: parseObject })
    ).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not hop when the deadline cannot fit another attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateRoutedStructuredOutput({
        surface: 'planner',
        messages,
        maxRetries: 1,
        parse: parseObject,
        deadlineMs: Date.now() + 3_000,
      })
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('holds a plain-text request to the deadline too, instead of letting a slow model run past it', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    await expect(
      generateRoutedPlainText({
        surface: 'status',
        messages,
        maxRetries: 3,
        timeoutMs: 20_000,
        deadlineMs: started + 1_400,
      })
    ).rejects.toBeDefined();

    // Cut to what the deadline left, no retry into a spent budget, and no hop to
    // a sibling that could not finish either: one request, and a quick end.
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not hop a pinned model', async () => {
    vi.stubEnv('AI_PLANNER_MODEL', 'openai/gpt-5.4-mini');
    const fetchMock = vi.fn().mockResolvedValue(fail(429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateRoutedStructuredOutput({ surface: 'planner', messages, maxRetries: 1, parse: parseObject })
    ).rejects.toBeDefined();
    expect(modelsCalled(fetchMock)).toEqual(['openai/gpt-5.4-mini']);
  });

  it('does not hop for a failure no other model would fix', async () => {
    for (const status of [402, 401]) {
      const fetchMock = vi.fn().mockResolvedValue(fail(status));
      vi.stubGlobal('fetch', fetchMock);
      await expect(generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1 })).rejects.toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('never hops the outcome surface', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateRoutedPlainText({ surface: 'outcome', messages, maxRetries: 1 })).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops after the second hop and throws the last error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateRoutedPlainText({ surface: 'press_kit', messages, maxRetries: 1 })).rejects.toMatchObject({
      status: 500,
    });
    // The original attempt plus at most two hops.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('forwards token usage and totals it on the trace', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('done', { prompt_tokens: 300, completion_tokens: 40 }));
    vi.stubGlobal('fetch', fetchMock);
    const onUsage = vi.fn();
    const traces: RoutingTrace[] = [];

    await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1, onUsage, onTrace: (t) => traces.push(t) });

    expect(onUsage).toHaveBeenCalledTimes(1);
    // The provider layer also reports which model answered and how much of the prompt
    // was cached (null: this response did not say), which is what the credits charge
    // is worked out from.
    expect(onUsage).toHaveBeenCalledWith({
      promptTokens: 300,
      completionTokens: 40,
      cachedTokens: null,
      model: expect.stringMatching(/^openai\//),
    });
    expect(traces[0]).toMatchObject({ tokensIn: 300, tokensOut: 40 });
  });

  it('reports a trace exactly once, on success and on failure', async () => {
    const onTrace = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('x')));
    await generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1, onTrace });
    expect(onTrace).toHaveBeenCalledTimes(1);

    const onFailTrace = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(401)));
    await expect(generateRoutedPlainText({ surface: 'status', messages, maxRetries: 1, onTrace: onFailTrace })).rejects.toBeDefined();
    expect(onFailTrace).toHaveBeenCalledTimes(1);
  });

  it('records the tier it started and ended on', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok('nope')).mockResolvedValueOnce(ok({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const traces: RoutingTrace[] = [];

    await generateRoutedStructuredOutput({
      surface: 'press_kit',
      messages,
      maxRetries: 1,
      parse: parseObject,
      onTrace: (t) => traces.push(t),
    });

    expect(traces[0]).toMatchObject({ mode: 'on', surface: 'press_kit', startTier: 'standard', endTier: 'pro' });
  });
});
