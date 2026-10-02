import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The UrgAns loop with streaming on. Same seams as runner-routing.test.ts: the
// gateway is a scripted fetch (here answering with real server-sent-event
// bodies, a piece at a time), executeToolCall is a mock, and the runner is real.

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

import { buildChatCompletionBody, runChappiAgent } from './runner';
import type { ChappiToolContext } from './tools';
import { decisionForTier } from '@/lib/ai/model-router';

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

// ── Scripted event streams ───────────────────────────────────────────────────

const data = (payload: unknown) => `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;
const textChunk = (content: string, finish: string | null = null) => ({
  choices: [{ delta: { content }, finish_reason: finish }],
});
const usageChunk = (promptTokens: number, completionTokens: number, cached = 0) => ({
  choices: [],
  usage: {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: { cached_tokens: cached },
  },
});

/** A response whose body arrives in the given pieces, optionally failing after them. */
function streamed(pieces: string[], options: { failAfter?: Error; status?: number; contentType?: string } = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < pieces.length) {
        controller.enqueue(encoder.encode(pieces[index]));
        index += 1;
        return;
      }
      if (options.failAfter) {
        controller.error(options.failAfter);
        return;
      }
      controller.close();
    },
  });
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? (options.contentType ?? 'text/event-stream') : null) },
    body,
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response;
}

const full = (...payloads: unknown[]) => streamed(payloads.map(data));

let fetchMock: ReturnType<typeof vi.fn>;
const bodyOf = (call: number) => JSON.parse((fetchMock.mock.calls[call][1] as { body: string }).body) as Record<string, unknown>;

beforeEach(() => {
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

describe('the request body', () => {
  const base = { model: 'm', messages: [], maxOutputTokens: 100, tokenParam: 'max_tokens' as const, reasoningEffort: null };

  it('is exactly the old body when not streaming, key order and all', () => {
    expect(Object.keys(buildChatCompletionBody(base))).toEqual(['model', 'messages', 'max_tokens', 'stream']);
    expect(buildChatCompletionBody(base).stream).toBe(false);
  });

  it('asks for usage when streaming, so credits can be charged from real tokens', () => {
    const body = buildChatCompletionBody({ ...base, stream: true });
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });
});

describe('streaming a reply', () => {
  it('hands each piece of text over as it arrives and returns the whole reply', async () => {
    fetchMock.mockResolvedValue(
      full(textChunk('Hello'), textChunk(' there'), textChunk('.', 'stop'), usageChunk(100, 12, 64), '[DONE]')
    );
    const pieces: string[] = [];

    const result = await runChappiAgent({ ctx, system: 'sys', messages, onText: (d) => pieces.push(d) });

    expect(pieces).toEqual(['Hello', ' there', '.']);
    expect(result.reply).toBe('Hello there.');
    expect(bodyOf(0).stream).toBe(true);
    expect(bodyOf(0).stream_options).toEqual({ include_usage: true });
  });

  it('reports the tokens the stream said it used, cached ones included', async () => {
    fetchMock.mockResolvedValue(full(textChunk('Hi', 'stop'), usageChunk(100, 12, 64), '[DONE]'));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, onText: () => {} });

    expect(result.usageCalls).toEqual([
      { model: 'test-model', promptTokens: 100, completionTokens: 12, cachedTokens: 64 },
    ]);
  });

  it('copes with events split across pieces of the body', async () => {
    const whole = [data(textChunk('Hel')), data(textChunk('lo', 'stop')), data('[DONE]')].join('');
    fetchMock.mockResolvedValue(streamed([whole.slice(0, 17), whole.slice(17, 60), whole.slice(60)]));
    const pieces: string[] = [];

    const result = await runChappiAgent({ ctx, system: 'sys', messages, onText: (d) => pieces.push(d) });

    expect(pieces.join('')).toBe('Hello');
    expect(result.reply).toBe('Hello');
  });

  it('runs a tool whose call arrived in pieces, then streams the answer', async () => {
    fetchMock
      .mockResolvedValueOnce(
        full(
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'list_releases', arguments: '' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"lim' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'it":3}' } }] } }] },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
          '[DONE]'
        )
      )
      .mockResolvedValueOnce(full(textChunk('You have three.', 'stop'), '[DONE]'));
    const pieces: string[] = [];

    const result = await runChappiAgent({ ctx, system: 'sys', messages, onText: (d) => pieces.push(d) });

    expect(executeToolCall).toHaveBeenCalledWith(expect.anything(), 'list_releases', { limit: 3 });
    expect(pieces.join('')).toBe('You have three.');
    expect(result.reply).toBe('You have three.');
  });

  it('tells the caller a new round is starting, so it can drop the preview of the last', async () => {
    const order: string[] = [];
    fetchMock
      .mockResolvedValueOnce(
        full(
          textChunk('Let me check.'),
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'list_releases', arguments: '{}' } }] } }] },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
          '[DONE]'
        )
      )
      .mockResolvedValueOnce(full(textChunk('Found it.', 'stop'), '[DONE]'));

    const result = await runChappiAgent({
      ctx,
      system: 'sys',
      messages,
      onAttempt: () => order.push('attempt'),
      onText: (d) => order.push(`text:${d}`),
    });

    expect(order).toEqual(['attempt', 'text:Let me check.', 'attempt', 'text:Found it.']);
    // Only the last round's text is the reply, as it always was.
    expect(result.reply).toBe('Found it.');
  });
});

describe('a stream that stops early', () => {
  it('keeps the text it had and says the answer was cut short', async () => {
    fetchMock.mockResolvedValue(
      streamed([data(textChunk('The first eight are')), data(textChunk(' done and'))], { failAfter: new Error('connection reset') })
    );

    const result = await runChappiAgent({ ctx, system: 'sys', messages, onText: () => {} });

    expect(result.reply).toContain('The first eight are done and');
    expect(result.reply).toMatch(/cut short/i);
    expect(result.trace.degraded).toBe('length');
    // A cut stream sends no usage, so the call is recorded without tokens.
    expect(result.usageCalls[0]).toMatchObject({ promptTokens: null, completionTokens: null });
  });

  it('keeps the text when the stream just ends with no [DONE]', async () => {
    fetchMock.mockResolvedValue(full(textChunk('Half an answer and')));

    const result = await runChappiAgent({ ctx, system: 'sys', messages, onText: () => {} });

    expect(result.reply).toContain('Half an answer and');
    expect(result.reply).toMatch(/cut short/i);
  });

  it('throws when it stops while a tool call is half written, rather than running half a call', async () => {
    fetchMock.mockResolvedValue(
      streamed(
        [data({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'create_task', arguments: '{"tit' } }] } }] })],
        { failAfter: new Error('connection reset') }
      )
    );

    await expect(runChappiAgent({ ctx, system: 'sys', messages, onText: () => {} })).rejects.toThrow();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('throws, rather than keeping the text, when a tool call was half written beside it', async () => {
    // Text AND an unfinished call: keeping the text and dropping the call would
    // answer as if the model had finished, with the action it asked for lost.
    fetchMock.mockResolvedValue(
      streamed(
        [
          data(textChunk('Creating that now.')),
          data({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'create_task', arguments: '{"tit' } }] } }] }),
        ],
        { failAfter: new Error('connection reset') }
      )
    );

    await expect(runChappiAgent({ ctx, system: 'sys', messages, onText: () => {} })).rejects.toThrow();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it('throws when it stops before any text', async () => {
    fetchMock.mockResolvedValue(streamed([], { failAfter: new Error('connection reset') }));

    await expect(runChappiAgent({ ctx, system: 'sys', messages, onText: () => {} })).rejects.toThrow();
  });
});

describe('the gateway not streaming after all', () => {
  it('reads a plain JSON answer, and hands its text over in one piece', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: null,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'Plain.' }, finish_reason: 'stop' }] }),
    } as unknown as Response);
    const pieces: string[] = [];

    const result = await runChappiAgent({ ctx, system: 'sys', messages, onText: (d) => pieces.push(d) });

    expect(result.reply).toBe('Plain.');
    // Nothing was streamed, so there is nothing to preview; the reply arrives whole.
    expect(pieces).toEqual([]);
  });
});

describe('a refusal', () => {
  it('is thrown as an error exactly as when not streaming', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => '{"error":{"message":"slow down"}}',
    } as unknown as Response);

    await expect(runChappiAgent({ ctx, system: 'sys', messages, onText: () => {} })).rejects.toMatchObject({ status: 429 });
  });
});

describe('streaming with the router on', () => {
  it('streams and still reports which rung answered', async () => {
    fetchMock.mockResolvedValue(full(textChunk('Done.', 'stop'), usageChunk(50, 5), '[DONE]'));

    const result = await runChappiAgent({
      ctx,
      system: 'sys',
      messages,
      routing: { decision: decisionForTier({ surface: 'chat', tier: 'pro', ceiling: 'max', env: {} }) },
      onText: () => {},
    });

    expect(result.reply).toBe('Done.');
    expect(result.trace.endTier).toBe('pro');
    expect(bodyOf(0).stream).toBe(true);
  });
});
