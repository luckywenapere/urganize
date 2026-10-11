import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { effortForTools, generateStructuredAiOutput, generatePlainTextAiOutput } from './provider';

// Regression coverage for the bug reported 2026-09-08: the release planner's
// timeout budget (PLANNER_TIMEOUT_MS x PLANNER_MAX_RETRIES, see
// app/api/releases/[releaseId]/plan/generate/route.ts) assumes a timed-out
// attempt gets retried. It never did for a pinned (non-openrouter) model,
// because a client-side abort reached the catch block as a bare Error and
// fell back to `retryable: isFreeAutoRouter`, which is false for every real
// deployment (RodiumAi is not the free auto-router). One slow response was
// therefore fatal on attempt one, no matter how high maxRetries was set.

const makeAbortError = () => {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
};

describe('generateStructuredAiOutput', () => {
  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('retries a client-side timeout on a pinned model instead of failing on attempt one', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(makeAbortError())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateStructuredAiOutput<{ ok: boolean }>({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-4o-mini',
      maxRetries: 2,
      timeoutMs: 1000,
      parse: (raw) => JSON.parse(raw) as { ok: boolean },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up once maxRetries is exhausted', async () => {
    const fetchMock = vi.fn().mockRejectedValue(makeAbortError());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateStructuredAiOutput<{ ok: boolean }>({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'openai/gpt-4o-mini',
        maxRetries: 2,
        timeoutMs: 1000,
        parse: (raw) => JSON.parse(raw) as { ok: boolean },
      })
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('generatePlainTextAiOutput', () => {
  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('retries a client-side timeout on a pinned model', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(makeAbortError())
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: 'A real status update.' } }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generatePlainTextAiOutput({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-4o-mini',
      maxRetries: 2,
      timeoutMs: 1000,
    });

    expect(result).toBe('A real status update.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// The planner runs on a stronger OpenAI-family model now (see
// lib/ai/planner-model.ts), which changes three things about the request:
// it can be handed a strict JSON schema instead of merely asked for JSON, it
// accepts a reasoning_effort while every other model this app has used
// rejects the parameter, and it is slow enough that the route's 60s ceiling
// has to be respected by the retry loop rather than assumed.
describe('generateStructuredAiOutput: structured outputs, reasoning effort and the deadline', () => {
  const okResponse = (content: unknown) => ({
    ok: true,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  });
  const badRequest = (message: string) => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ error: { message } }),
  });
  const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };
  const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
    JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body) as Record<string, unknown>;

  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends a strict json_schema response format when given a schema', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await generateStructuredAiOutput<{ ok: boolean }>({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-5.4',
      maxRetries: 1,
      parse: (raw) => JSON.parse(raw) as { ok: boolean },
      jsonSchema: { name: 'planner_delta', schema },
    });

    expect(bodyOf(fetchMock, 0).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'planner_delta', strict: true, schema },
    });
  });

  it('falls back to plain JSON mode, once, when the gateway rejects the schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(badRequest('Invalid parameter: response_format.json_schema is not supported'))
      .mockResolvedValueOnce(okResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateStructuredAiOutput<{ ok: boolean }>({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-5.4',
      maxRetries: 1,
      parse: (raw) => JSON.parse(raw) as { ok: boolean },
      jsonSchema: { name: 'planner_delta', schema },
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1).response_format).toEqual({ type: 'json_object' });
  });

  it('sends reasoning_effort only to a model that accepts it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const run = (model: string) =>
      generateStructuredAiOutput<{ ok: boolean }>({
        messages: [{ role: 'user', content: 'hi' }],
        model,
        maxRetries: 1,
        parse: (raw) => JSON.parse(raw) as { ok: boolean },
        reasoningEffort: 'low',
      });

    await run('openai/gpt-5.4');
    expect(bodyOf(fetchMock, 0).reasoning_effort).toBe('low');

    await run('openai/gpt-4o-mini');
    expect(bodyOf(fetchMock, 1)).not.toHaveProperty('reasoning_effort');
  });

  it('retries once without reasoning_effort when the gateway names it in a 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(badRequest('Unrecognized request argument supplied: reasoning_effort'))
      .mockResolvedValueOnce(okResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateStructuredAiOutput<{ ok: boolean }>({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-5.4',
      maxRetries: 1,
      parse: (raw) => JSON.parse(raw) as { ok: boolean },
      reasoningEffort: 'low',
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1)).not.toHaveProperty('reasoning_effort');
  });

  it('shortens an attempt to what the deadline leaves, and does not retry into a spent budget', async () => {
    // A fetch that never answers on its own: it only ever rejects when the
    // request's own signal aborts, so the observed duration IS the timeout.
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(makeAbortError()));
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    await expect(
      generateStructuredAiOutput<{ ok: boolean }>({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'openai/gpt-5.4',
        maxRetries: 3,
        timeoutMs: 20_000,
        deadlineMs: started + 1_400,
        parse: (raw) => JSON.parse(raw) as { ok: boolean },
      })
    ).rejects.toThrow();

    // 1.4s deadline minus the 1s guard: the attempt was cut to ~400ms rather
    // than the 20s timeout, and with under 8s left there was no second one.
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// The model router can send a plain-text request to a GPT-5 family model (a
// fallback, or the press-kit drafting rung), and those models default to a
// slow, expensive amount of thinking unless told otherwise.
describe('generatePlainTextAiOutput: reasoning effort', () => {
  const okText = (content: string) => ({
    ok: true,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  });
  const badRequest = (message: string) => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ error: { message } }),
  });
  const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
    JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body) as Record<string, unknown>;

  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends reasoning_effort only to a model that accepts it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okText('A paragraph.'));
    vi.stubGlobal('fetch', fetchMock);

    const run = (model: string) =>
      generatePlainTextAiOutput({
        messages: [{ role: 'user', content: 'hi' }],
        model,
        maxRetries: 1,
        reasoningEffort: 'low',
      });

    await run('openai/gpt-5.4-mini');
    expect(bodyOf(fetchMock, 0).reasoning_effort).toBe('low');

    await run('openai/gpt-4o-mini');
    expect(bodyOf(fetchMock, 1)).not.toHaveProperty('reasoning_effort');
  });

  it('sends nothing extra when no effort is asked for, as before', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okText('A paragraph.'));
    vi.stubGlobal('fetch', fetchMock);

    await generatePlainTextAiOutput({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-5.4-mini',
      maxRetries: 1,
    });

    expect(bodyOf(fetchMock, 0)).not.toHaveProperty('reasoning_effort');
  });

  it('retries once without reasoning_effort when the gateway names it in a 400', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(badRequest('Unrecognized request argument supplied: reasoning_effort'))
      .mockResolvedValueOnce(okText('A paragraph.'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generatePlainTextAiOutput({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-5.4-mini',
      maxRetries: 1,
      reasoningEffort: 'low',
    });

    expect(result).toBe('A paragraph.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock, 1)).not.toHaveProperty('reasoning_effort');
  });

  it('does not loop forever if the gateway keeps rejecting it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(badRequest('Unrecognized request argument supplied: reasoning_effort'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generatePlainTextAiOutput({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'openai/gpt-5.4-mini',
        maxRetries: 1,
        reasoningEffort: 'low',
      })
    ).rejects.toThrow();

    // One try with the parameter, one without, and then it gives up.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// A routed request can be handed to a second model, and the second model has to
// fit in the same route ceiling as the first. That only works if each model's own
// retry loop respects the deadline, the way the structured generator's does.
describe('generatePlainTextAiOutput: the deadline', () => {
  beforeEach(() => {
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // A fetch that never answers on its own: it only ever rejects when the
  // request's own signal aborts, so the observed duration IS the timeout.
  const hangUntilAborted = () =>
    vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(makeAbortError()));
        })
    );

  it('shortens an attempt to what the deadline leaves, and does not retry into a spent budget', async () => {
    const fetchMock = hangUntilAborted();
    vi.stubGlobal('fetch', fetchMock);

    const started = Date.now();
    await expect(
      generatePlainTextAiOutput({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'openai/gpt-4o-mini',
        maxRetries: 3,
        timeoutMs: 20_000,
        deadlineMs: started + 1_400,
      })
    ).rejects.toThrow();

    // 1.4s deadline minus the 1s guard: the attempt was cut to ~400ms rather
    // than the 20s timeout, and with under 8s left there was no second one.
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not ask the model at all once the deadline has passed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generatePlainTextAiOutput({
        messages: [{ role: 'user', content: 'hi' }],
        model: 'openai/gpt-4o-mini',
        maxRetries: 2,
        deadlineMs: Date.now() - 1,
      })
    ).rejects.toThrow(/deadline/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still retries a timeout when there is plenty of time', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(makeAbortError())
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'In time.' } }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generatePlainTextAiOutput({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai/gpt-4o-mini',
      maxRetries: 2,
      timeoutMs: 1_000,
      deadlineMs: Date.now() + 60_000,
    });

    expect(result).toBe('In time.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('supportsReasoningEffort', () => {
  it.each([
    ['openai/gpt-5.4', true],
    ['openai/gpt-5.4-mini', true],
    ['openai/o3', true],
    ['gpt-5.4', true],
    ['openai/gpt-6.1-sol', true],
    ['gpt-6-luna', true],
    ['openai/gpt-4o-mini', false],
    ['meta/llama-3.3-70b', false],
    ['qwen2.5:3b', false],
    [undefined, false],
  ])('%s -> %s', async (model, expected) => {
    const { supportsReasoningEffort } = await import('./provider');
    expect(supportsReasoningEffort(model)).toBe(expected);
  });
});

describe('isRodiumGateway', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads the gateway from AI_API_BASE alone, key or no key', async () => {
    const { isRodiumGateway } = await import('./provider');
    vi.stubEnv('AI_API_BASE', 'https://api.rodiumai.io');
    vi.stubEnv('AI_API_KEY', '');
    expect(isRodiumGateway()).toBe(true);
    vi.stubEnv('AI_API_BASE', 'https://openrouter.ai/api/v1');
    expect(isRodiumGateway()).toBe(false);
  });
});

describe('buildOpenAiRequestBody', () => {
  const messages = [{ role: 'user' as const, content: 'hi' }];
  const schema = { name: 'probe', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } };

  it('keeps the body single-shot features have always sent: no output cap, key for key', async () => {
    const { buildOpenAiRequestBody } = await import('./provider');
    const body = buildOpenAiRequestBody({ model: 'openai/gpt-4o-mini', messages, format: 'json' });
    expect(Object.keys(body)).toEqual(['model', 'messages', 'stream', 'response_format']);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect('max_tokens' in body).toBe(false);
    expect('max_completion_tokens' in body).toBe(false);
  });

  it('sends a strict json_schema when it is given one', async () => {
    const { buildOpenAiRequestBody } = await import('./provider');
    const body = buildOpenAiRequestBody({ model: 'openai/gpt-5.4', messages, format: 'json', jsonSchema: schema });
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'probe', strict: true, schema: schema.schema },
    });
  });

  it('sends no response_format for plain text', async () => {
    const { buildOpenAiRequestBody } = await import('./provider');
    const body = buildOpenAiRequestBody({ model: 'openai/gpt-4o-mini', messages, format: 'text' });
    expect('response_format' in body).toBe(false);
    expect(Object.keys(body)).toEqual(['model', 'messages', 'stream']);
  });

  it('sends reasoning_effort only to a model that accepts it, and after response_format', async () => {
    const { buildOpenAiRequestBody } = await import('./provider');
    const yes = buildOpenAiRequestBody({ model: 'openai/gpt-5.6-terra', messages, format: 'json', reasoningEffort: 'low' });
    expect(yes.reasoning_effort).toBe('low');
    expect(Object.keys(yes)).toEqual(['model', 'messages', 'stream', 'response_format', 'reasoning_effort']);
    const no = buildOpenAiRequestBody({ model: 'openai/gpt-4o-mini', messages, format: 'json', reasoningEffort: 'low' });
    expect('reasoning_effort' in no).toBe(false);
  });
});

describe('effortForTools', () => {
  it("turns any effort into 'none' on the 5.6 family, with or without the vendor prefix", () => {
    for (const model of ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol', 'gpt-5.6-sol', 'OpenAI/GPT-5.6-Sol']) {
      for (const effort of ['minimal', 'low', 'medium', 'high'] as const) {
        expect(effortForTools(model, effort), `${model} ${effort}`).toBe('none');
      }
    }
  });

  it('sends GPT-6 no effort at all on a request with tools, until that is measured live (2026-10-11)', () => {
    for (const model of ['openai/gpt-6.1-sol', 'openai/gpt-6-sol', 'openai/gpt-6-luna', 'gpt-6-sol']) {
      for (const effort of ['minimal', 'low', 'medium', 'high'] as const) {
        expect(effortForTools(model, effort), `${model} ${effort}`).toBeNull();
      }
    }
  });

  it('still sends GPT-6 its effort on a request WITHOUT tools (the planner)', async () => {
    const { buildOpenAiRequestBody } = await import('./provider');
    const messages = [{ role: 'user' as const, content: 'hi' }];
    const body = buildOpenAiRequestBody({ model: 'openai/gpt-6.1-sol', messages, format: 'json', reasoningEffort: 'low' });
    expect(body.reasoning_effort).toBe('low');
  });

  it('leaves every other model, and no effort at all, as it was asked', () => {
    for (const model of ['openai/gpt-5.4', 'openai/gpt-5.4-mini', 'openai/gpt-5.5', 'openai/gpt-4o-mini', 'openai/o3', '', null, undefined]) {
      expect(effortForTools(model, 'low'), String(model)).toBe('low');
    }
    expect(effortForTools('openai/gpt-5.6-sol', null)).toBeNull();
    expect(effortForTools('openai/gpt-5.6-sol', 'none')).toBe('none');
  });
});
