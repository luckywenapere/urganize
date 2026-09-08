import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateStructuredAiOutput, generatePlainTextAiOutput } from './provider';

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
