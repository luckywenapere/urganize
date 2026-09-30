/**
 * Typed AI gateway failures.
 *
 * Two transports talk to the model gateway (lib/ai/provider.ts for the
 * single-shot features, lib/chappi/runner.ts for UrgAns) and until now they
 * described failures differently: the provider layer threw an AiProviderError
 * with a status, the runner threw a bare Error whose only structure was its
 * message, and callers recovered the kind of failure by regex. That regex was
 * wrong. app/api/urgans/route.ts matched /rate[- ]limit/, which does not match
 * `rate_limit_exceeded` (the gateway's own code, with an underscore), so a real
 * 429 was reported as "unavailable".
 *
 * The router needs to tell a rate limit from an outage from a bad answer,
 * because each is handled differently (sideways to a sibling model, down a
 * rung, up a rung). So the classification lives here, once, and reads the
 * status and code first and the message only as a last resort.
 */

export type AiFailureKind =
  /** 429, or a rate-limit code/message. Another model has its own limit. */
  | 'rate_limited'
  /** The model is not served to this key or account, or does not exist. */
  | 'model_unavailable'
  /** 402: the provider balance is exhausted. No other model helps. */
  | 'insufficient_balance'
  /** 401: the key is wrong. No other model helps. */
  | 'auth'
  /** 5xx and friends: the gateway or the upstream had a problem. */
  | 'server'
  /** Our own abort, or a 504/408: the model was too slow for the time left. */
  | 'timeout'
  /** The request never reached the gateway. */
  | 'network'
  /** The model answered but the answer was unusable (empty, not the JSON asked for). */
  | 'bad_output'
  /** A 400/422 that is not about the model: the request itself is wrong. */
  | 'bad_request'
  | 'unknown';

export type AiFailure = {
  kind: AiFailureKind;
  status?: number;
  code?: string;
  retryAfterMs?: number;
  message: string;
};

export class GatewayError extends Error {
  status?: number;
  code?: string;
  retryAfterMs?: number;

  constructor(message: string, options?: { status?: number; code?: string; retryAfterMs?: number }) {
    super(message);
    this.name = 'GatewayError';
    this.status = options?.status;
    this.code = options?.code;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/** The longest wait a Retry-After can ask for. Nothing on a request path should sleep longer. */
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * A Retry-After header is either a number of seconds or an HTTP date. Returns
 * milliseconds, never negative, capped at a minute, or undefined when it cannot
 * be read.
 */
export function parseRetryAfterMs(value: string | null | undefined, now: number = Date.now()): number | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.min(Math.round(Number(raw) * 1000), MAX_RETRY_AFTER_MS);
  }

  if (/^-/.test(raw)) return undefined;

  const dateMs = Date.parse(raw);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.min(Math.max(0, dateMs - now), MAX_RETRY_AFTER_MS);
}

/**
 * Build the error for a non-2xx gateway response. The message keeps the exact
 * shape the runner has always thrown (`Chappi gateway request failed (500): …`)
 * so anything that logs or matches on it is unchanged; the status, code and
 * Retry-After are the structure that was missing.
 */
export function gatewayErrorFromResponse(input: {
  status: number;
  rawText: string;
  /** The Retry-After header, when the response carried one. */
  retryAfter?: string | null;
  label?: string;
}): GatewayError {
  const label = input.label ?? 'Chappi gateway';
  let code: string | undefined;
  let retryFromBody: number | undefined;

  try {
    const payload = input.rawText ? (JSON.parse(input.rawText) as Record<string, unknown>) : null;
    const errorObject =
      payload && typeof payload.error === 'object' && payload.error !== null
        ? (payload.error as Record<string, unknown>)
        : null;
    const rawCode = errorObject?.code ?? payload?.code ?? errorObject?.type;
    if (rawCode !== undefined && rawCode !== null && String(rawCode).trim()) code = String(rawCode).trim();

    const rawRetry = errorObject?.retry_after ?? payload?.retry_after;
    if (typeof rawRetry === 'number' && rawRetry >= 0) {
      retryFromBody = Math.min(Math.round(rawRetry * 1000), MAX_RETRY_AFTER_MS);
    }
  } catch {
    // Not JSON (an HTML error page from a proxy, say). The status is still
    // enough to classify it.
  }

  return new GatewayError(`${label} request failed (${input.status}): ${input.rawText.slice(0, 300)}`, {
    status: input.status,
    code,
    retryAfterMs: parseRetryAfterMs(input.retryAfter) ?? retryFromBody,
  });
}

const RATE_LIMIT_HINT = /rate[_\- ]?limit|too many requests/i;
const INSUFFICIENT_HINT = /insufficient[_ ](balance|funds|rodi|credit)|insufficient_balance/i;
const AUTH_HINT = /invalid_api_key|unauthori[sz]ed/i;
const MODEL_UNAVAILABLE_HINT =
  /model_not_found|model_not_available|no such model|unknown model|invalid model|model .*(does not exist|not (found|supported|available))|unsupported model/i;
// What a region-blocked model looked like on the free Llama tier (2026-08-13):
// the upstream refuses the model for this account, which is exactly what a
// same-tier sibling is for.
const REGION_BLOCK_HINT = /(not allowed|unsupported).*(countr|region|territor)/i;
const TIMEOUT_HINT = /\b(abort(ed)?|timed? ?out|timeout|deadline)\b/i;
const NETWORK_HINT = /fetch failed|network|econnreset|econnrefused|enotfound|socket hang up|etimedout/i;
const BAD_OUTPUT_HINT =
  /empty content|no choices|invalid json|not the expected json|invalid (json )?format|could not parse|parse error/i;

/** Classify anything a gateway call can throw. Never throws. */
export function classifyAiFailure(error: unknown): AiFailure {
  const e = (error && typeof error === 'object' ? error : null) as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
    message?: unknown;
    retryAfterMs?: unknown;
  } | null;

  const status = typeof e?.status === 'number' ? e.status : undefined;
  const code = e?.code !== undefined && e?.code !== null && String(e.code).trim() ? String(e.code).trim() : undefined;
  const message = error instanceof Error ? error.message : String(e?.message ?? error ?? '');
  const name = typeof e?.name === 'string' ? e.name : '';
  const retryAfterMs = typeof e?.retryAfterMs === 'number' ? e.retryAfterMs : undefined;

  const done = (kind: AiFailureKind): AiFailure => ({ kind, status, code, retryAfterMs, message });
  const hay = `${code ?? ''} ${message}`;

  // Decisive statuses first: a 429, 402 or 401 means the same thing whatever
  // the body says.
  if (status === 429) return done('rate_limited');
  if (status === 402) return done('insufficient_balance');
  if (status === 401) return done('auth');

  // Our own abort never had a status. 504 and 408 are the gateway saying the
  // same thing about the model.
  if (status === undefined && (name === 'AbortError' || name === 'TimeoutError' || TIMEOUT_HINT.test(message))) {
    return done('timeout');
  }
  if (status === 504 || status === 408) return done('timeout');

  if (status === 404 || MODEL_UNAVAILABLE_HINT.test(hay) || REGION_BLOCK_HINT.test(hay)) {
    return done('model_unavailable');
  }
  if (status === 403 && /model|permission|not allowed|access/i.test(hay)) return done('model_unavailable');

  if (RATE_LIMIT_HINT.test(hay)) return done('rate_limited');
  if (INSUFFICIENT_HINT.test(hay)) return done('insufficient_balance');
  if (AUTH_HINT.test(hay)) return done('auth');

  if (status !== undefined && (status >= 500 || status === 409 || status === 425)) return done('server');

  if (status === undefined && NETWORK_HINT.test(message)) return done('network');

  if (status === undefined && BAD_OUTPUT_HINT.test(message)) return done('bad_output');
  if (status === 400 || status === 422) return done('bad_request');

  return done('unknown');
}
