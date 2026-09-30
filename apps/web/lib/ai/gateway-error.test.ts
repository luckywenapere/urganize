import { describe, expect, it } from 'vitest';

import { GatewayError, classifyAiFailure, gatewayErrorFromResponse, parseRetryAfterMs } from './gateway-error';

const abortError = () => {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
};

describe('classifyAiFailure', () => {
  it('reads a 429 as rate limited', () => {
    expect(classifyAiFailure(new GatewayError('busy', { status: 429 })).kind).toBe('rate_limited');
  });

  it('reads rate_limit_exceeded as rate limited even with no status attached', () => {
    // The regression that motivated typed errors: app/api/urgans/route.ts matched
    // /rate[- ]limit/, which does not match an underscore, so this body fell
    // through to the generic "unavailable" answer.
    const error = new Error(
      'Chappi gateway request failed (429): {"error":{"code":"rate_limit_exceeded","message":"Slow down"}}'
    );
    expect(classifyAiFailure(error).kind).toBe('rate_limited');
  });

  it('reads the provider layer\'s own rate-limit wording as rate limited', () => {
    const error = Object.assign(new Error('The current AI model is temporarily rate-limited. Please try again shortly.'), {
      status: 429,
    });
    expect(classifyAiFailure(error).kind).toBe('rate_limited');
  });

  it('reads 402 as insufficient balance and 401 as auth', () => {
    expect(classifyAiFailure(new GatewayError('no funds', { status: 402 })).kind).toBe('insufficient_balance');
    expect(classifyAiFailure(new GatewayError('bad key', { status: 401 })).kind).toBe('auth');
  });

  it('reads an unknown model as unavailable, by status or by code', () => {
    expect(classifyAiFailure(new GatewayError('x', { status: 404 })).kind).toBe('model_unavailable');
    expect(classifyAiFailure(new GatewayError('x', { status: 400, code: 'model_not_found' })).kind).toBe(
      'model_unavailable'
    );
  });

  it('reads a permission refusal on a model as unavailable, so it falls to the sibling', () => {
    const error = new GatewayError('This key is not allowed to use that model', { status: 403 });
    expect(classifyAiFailure(error).kind).toBe('model_unavailable');
  });

  it('reads the region block seen on the free Llama models as unavailable', () => {
    const error = new GatewayError(
      'Access to Meta Llama models is not allowed from unsupported countries, regions, or territories.',
      { status: 400, code: 'ValidationException' }
    );
    expect(classifyAiFailure(error).kind).toBe('model_unavailable');
  });

  it('reads 5xx as server, but 504 and 408 as timeouts (the model was too slow)', () => {
    expect(classifyAiFailure(new GatewayError('x', { status: 500 })).kind).toBe('server');
    expect(classifyAiFailure(new GatewayError('x', { status: 503 })).kind).toBe('server');
    expect(classifyAiFailure(new GatewayError('x', { status: 504 })).kind).toBe('timeout');
    expect(classifyAiFailure(new GatewayError('x', { status: 408 })).kind).toBe('timeout');
  });

  it('reads our own abort as a timeout', () => {
    expect(classifyAiFailure(abortError()).kind).toBe('timeout');
    expect(classifyAiFailure(new Error('AI request deadline passed before the model was asked')).kind).toBe(
      'timeout'
    );
  });

  it('reads a failed fetch as a network failure', () => {
    const error = new TypeError('fetch failed');
    expect(classifyAiFailure(error).kind).toBe('network');
  });

  it('reads an unusable model answer as bad output', () => {
    expect(classifyAiFailure(new Error('Model returned empty content')).kind).toBe('bad_output');
    expect(classifyAiFailure(new Error('The response was not the expected JSON.')).kind).toBe('bad_output');
    expect(classifyAiFailure(new Error('Chappi gateway returned no choices')).kind).toBe('bad_output');
  });

  it('reads any other 400 as a bad request, which no other model would fix', () => {
    expect(classifyAiFailure(new GatewayError('Unsupported parameter', { status: 400 })).kind).toBe('bad_request');
  });

  it('falls through to unknown rather than guessing', () => {
    expect(classifyAiFailure(new Error('something odd')).kind).toBe('unknown');
    expect(classifyAiFailure('a string').kind).toBe('unknown');
    expect(classifyAiFailure(null).kind).toBe('unknown');
  });

  it('carries status, code and retryAfterMs through', () => {
    const failure = classifyAiFailure(
      new GatewayError('busy', { status: 429, code: 'rate_limit_exceeded', retryAfterMs: 4000 })
    );
    expect(failure).toMatchObject({ kind: 'rate_limited', status: 429, code: 'rate_limit_exceeded', retryAfterMs: 4000 });
  });
});

describe('parseRetryAfterMs', () => {
  it('reads seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('0.5')).toBe(500);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-09-29T12:00:00Z');
    expect(parseRetryAfterMs('Tue, 29 Sep 2026 12:00:03 GMT', now)).toBe(3000);
  });

  it('never returns a negative wait', () => {
    const now = Date.parse('2026-09-29T12:00:00Z');
    expect(parseRetryAfterMs('Tue, 29 Sep 2026 11:59:00 GMT', now)).toBe(0);
  });

  it('caps a long wait at a minute, because nothing here should sleep longer', () => {
    expect(parseRetryAfterMs('3600')).toBe(60_000);
  });

  it('returns undefined for anything unreadable', () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('')).toBeUndefined();
    expect(parseRetryAfterMs('soon')).toBeUndefined();
    expect(parseRetryAfterMs('-3')).toBeUndefined();
  });
});

describe('gatewayErrorFromResponse', () => {
  it('keeps the message shape the runner has always thrown', () => {
    const error = gatewayErrorFromResponse({ status: 500, rawText: 'boom' });
    expect(error).toBeInstanceOf(GatewayError);
    expect(error.message).toBe('Chappi gateway request failed (500): boom');
    expect(error.status).toBe(500);
  });

  it('truncates a long body, as before', () => {
    const error = gatewayErrorFromResponse({ status: 500, rawText: 'x'.repeat(1000) });
    expect(error.message.length).toBeLessThan(400);
  });

  it('pulls the error code out of a JSON body', () => {
    const error = gatewayErrorFromResponse({
      status: 429,
      rawText: JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'Slow down' } }),
    });
    expect(error.code).toBe('rate_limit_exceeded');
    expect(classifyAiFailure(error).kind).toBe('rate_limited');
  });

  it('reads Retry-After from the header, or from retry_after in the body', () => {
    expect(gatewayErrorFromResponse({ status: 429, rawText: '', retryAfter: '3' }).retryAfterMs).toBe(3000);
    const fromBody = gatewayErrorFromResponse({
      status: 429,
      rawText: JSON.stringify({ error: { code: 'rate_limit_exceeded', retry_after: 2 } }),
    });
    expect(fromBody.retryAfterMs).toBe(2000);
  });

  it('survives a body that is not JSON', () => {
    const error = gatewayErrorFromResponse({ status: 502, rawText: '<html>Bad gateway</html>' });
    expect(error.code).toBeUndefined();
    expect(classifyAiFailure(error).kind).toBe('server');
  });
});
