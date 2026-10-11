export type AiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** Token counts for one gateway call, when the upstream reported them. Each
 *  field is independently nullable rather than the whole type being nullable:
 *  a gateway can report one half and omit the other. See extractAiUsage. */
export type AiUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  /** The part of the prompt the provider served from its cache. Present only on
   *  what requestAiGateway reports, and null when the gateway did not say. */
  cachedTokens?: number | null;
  /** The model that answered this call, as sent. Same provenance as above. */
  model?: string | null;
};

/**
 * Pull token usage out of a gateway response, in whichever of the two shapes
 * this provider actually sees:
 *
 *   - OpenAI protocol (OpenRouter, RodiumAi): `usage.prompt_tokens` /
 *     `usage.completion_tokens`.
 *   - Ollama protocol (the Zuplo gateway's /api/chat): top-level
 *     `prompt_eval_count` / `eval_count`, no `usage` object at all.
 *
 * Returns null when neither shape is present, rather than a zeroed-out usage
 * object — a caller storing this must be able to tell "not reported" from "a
 * free run", and `urgans_actions.tokens_in`/`tokens_out` are nullable for
 * exactly this reason.
 */
export function extractAiUsage(payload: Record<string, unknown>): AiUsage | null {
  const usage =
    payload.usage && typeof payload.usage === 'object'
      ? (payload.usage as Record<string, unknown>)
      : null;
  if (usage) {
    const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    const completionTokens =
      typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null;
    if (promptTokens !== null || completionTokens !== null) {
      return { promptTokens, completionTokens };
    }
  }

  const promptEvalCount =
    typeof payload.prompt_eval_count === 'number' ? payload.prompt_eval_count : null;
  const evalCount = typeof payload.eval_count === 'number' ? payload.eval_count : null;
  if (promptEvalCount !== null || evalCount !== null) {
    return { promptTokens: promptEvalCount, completionTokens: evalCount };
  }

  return null;
}

/**
 * The part of a call's prompt the provider served from its cache, which it
 * bills at a fraction of the input price (`usage.prompt_tokens_details.
 * cached_tokens` in the OpenAI shape). Null when it is not reported, which is
 * not the same as zero: a caller pricing the call treats null as nothing cached,
 * the dearer way. Kept apart from extractAiUsage so that type, and everything
 * that stores it, stays as it was.
 */
export function extractCachedTokens(payload: Record<string, unknown>): number | null {
  const usage = payload.usage && typeof payload.usage === 'object' ? (payload.usage as Record<string, unknown>) : null;
  const details =
    usage?.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
      ? (usage.prompt_tokens_details as Record<string, unknown>)
      : null;
  const cached = details?.cached_tokens;
  return typeof cached === 'number' && Number.isFinite(cached) && cached >= 0 ? cached : null;
}

/**
 * How hard a reasoning model thinks before it answers. Only the GPT-5, GPT-6 and
 * o-series families accept the parameter (see supportsReasoningEffort); it is
 * never sent to anything else, so a caller can pass it unconditionally.
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high'];

/**
 * A JSON schema the gateway should hold the model to (OpenAI "structured
 * outputs"). Sent as `response_format: { type: 'json_schema', strict: true }`
 * on the OpenAI-protocol gateways. Strict mode has its own rules — every
 * property listed in `required`, `additionalProperties: false` on every
 * object, nullable fields as type unions, no length keywords — and the
 * provider does not check them; the schema's own test does.
 */
export type AiJsonSchema = { name: string; schema: Record<string, unknown> };

type GenerateStructuredAiOutputOptions<T> = {
  messages: AiMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Upstream model id. Defaults per gateway: 'openrouter/free' on openrouter.ai,
   * openai/gpt-4o-mini on rodiumai.io, otherwise the Zuplo gateway's qwen2.5:3b.
   * Lets a caller route a specific request to a different model (e.g., the
   * rollout planner via AI_PLANNER_MODEL) provided the gateway serves that
   * model id.
   */
  model?: string;
  parse: (raw: string) => T | null;
  invalidFormatMessage?: string;
  /** Called once per attempt that got a parseable response back, whether or
   *  not `parse` accepted it — the model spent tokens either way. Additive:
   *  every existing caller passes nothing and is byte-for-byte unaffected. */
  onUsage?: (usage: AiUsage) => void;
  /**
   * Hold the model to this schema instead of plain JSON mode. If the gateway
   * answers 400 naming the schema parameter, the request is resent ONCE in
   * plain JSON mode, and that resend does not count against maxRetries: the
   * gateway's support for the parameter is a fact about the gateway, not
   * about this attempt. Ignored on the Ollama-protocol gateway.
   */
  jsonSchema?: AiJsonSchema;
  /**
   * Sent as `reasoning_effort` only when the resolved model accepts it. Same
   * one-shot fallback as jsonSchema: a 400 naming the parameter drops it and
   * resends once.
   */
  reasoningEffort?: ReasoningEffort;
  /**
   * An absolute time (ms since epoch) by which the call must have returned.
   * Each attempt's timeout is cut to what the deadline leaves minus a small
   * guard, and no retry starts with under MIN_RETRY_BUDGET_MS remaining: a
   * retry that cannot finish only burns the caller's own ceiling. Callers
   * running inside a route with a fixed maxDuration set this from the moment
   * the route started.
   */
  deadlineMs?: number;
};

const DEFAULT_AI_API_BASE = 'https://urganize-main-34fd8f6.d2.zuplo.dev';
const AI_MODEL = 'qwen2.5:3b';
const OPENROUTER_DEFAULT_MODEL = 'openrouter/free';
// RodiumAi's free-tier meta/llama-* models were tried first (cheapest option)
// but are geo-blocked at the AWS Bedrock license level ("Access to Meta Llama
// models is not allowed from unsupported countries" — confirmed 2026-08-13
// against the live API from this account's region). openai/gpt-4o-mini is the
// verified-working fallback: cheap, and OpenAI's function-calling support is
// solid rather than an open question. Overridable per feature via
// AI_PLANNER_MODEL / AI_STATUS_MODEL / AI_OUTCOME_MODEL.
const RODIUM_DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Headroom kept between an attempt's timeout and the caller's deadline, so
 *  the abort fires (and the caller can answer) before the route's own
 *  ceiling kills the request with nothing to say. */
const DEADLINE_GUARD_MS = 1_000;
/** The least time worth starting another attempt in. Under this, a retry
 *  spends the backoff sleep and a truncated attempt to learn nothing. */
const MIN_RETRY_BUDGET_MS = 8_000;
/** Below this window a first attempt is not made at all: a 50ms timeout is a
 *  guaranteed abort dressed up as a request. */
const MIN_ATTEMPT_WINDOW_MS = 250;

/** A 400 whose message names the structured-output parameter. */
const SCHEMA_REJECTION = /response_format|json_schema|\bschema\b/i;
/** A 400 whose message names the reasoning parameter. Checked before the
 *  schema pattern, since it is the more specific of the two. */
const EFFORT_REJECTION = /reasoning/i;

/**
 * Whether a model id accepts `reasoning_effort`: the GPT-5 and GPT-6 families
 * and the o-series, with or without the `openai/` vendor prefix RodiumAi's catalogue
 * uses. Anything else (gpt-4o, llama, qwen, an unset model) rejects the
 * parameter outright, so it is never sent there.
 */
export function supportsReasoningEffort(model?: string | null): boolean {
  return /^(openai\/)?(gpt-5|gpt-6|o\d)/i.test(String(model ?? '').trim());
}

/**
 * The effort to send on a request that carries function tools. The GPT-5.6
 * family (luna, terra, sol) answers 400 "Function tools with reasoning_effort
 * are not supported" to any effort but 'none' on /chat/completions; measured
 * against RodiumAi 2026-09-30 (model-eval probes). 'none' and omitting it are
 * both accepted, and 'none' is sent so the request says what it means. Every
 * other model, and every request without tools, keeps the effort asked for.
 */
export function effortForTools(model: string | null | undefined, effort: ReasoningEffort | null): ReasoningEffort | null {
  if (!effort || effort === 'none') return effort;
  const id = String(model ?? '').trim();
  if (/^(openai\/)?gpt-5\.6/i.test(id)) return 'none';
  // GPT-6 (added 2026-10-11) takes the safe path: no effort at all on a request
  // with tools, so the provider's own default applies. It could not be measured
  // the day it went on the ladder (every GPT-6 model answered
  // provider_unavailable), its catalogue entry lists low to max but not 'none',
  // so the 5.6 answer ('none') could be the one value it rejects, and omitting
  // the parameter is accepted by every model. Requests WITHOUT tools (the
  // planner's structured output) still send the effort asked for. Re-measure
  // with model-eval.integration.test.ts and relax this when it passes.
  if (/^(openai\/)?gpt-6/i.test(id)) return null;
  return effort;
}

class AiProviderError extends Error {
  status?: number;
  code?: string;
  retryable: boolean;

  constructor(message: string, options?: { status?: number; code?: string; retryable?: boolean }) {
    super(message);
    this.name = 'AiProviderError';
    this.status = options?.status;
    this.code = options?.code;
    this.retryable = Boolean(options?.retryable);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Which gateway AI_API_BASE points at. Independent of the key on purpose:
 * "which gateway is this" is a question about the base URL alone, and a
 * default-model decision (see lib/ai/planner-model.ts) has to be answerable
 * before anyone knows whether a key is set.
 */
const resolveGateway = () => {
  const apiBase = String(process.env.AI_API_BASE || DEFAULT_AI_API_BASE).trim().replace(/\/+$/, '');
  const hostname = safeHostname(apiBase);
  const isOpenRouter = /(^|\.)openrouter\.ai$/i.test(hostname);
  const isRodium = /(^|\.)rodiumai\.io$/i.test(hostname);
  return { apiBase, isOpenRouter, isRodium };
};

/** True when AI_API_BASE points at RodiumAi, key or no key. */
export const isRodiumGateway = (): boolean => resolveGateway().isRodium;

const getAiGatewayConfig = () => {
  const apiKey = String(process.env.AI_API_KEY || '').trim();

  if (!apiKey) return null;

  const { apiBase, isOpenRouter, isRodium } = resolveGateway();

  return {
    apiKey,
    apiBase,
    isOpenRouter,
    // OpenRouter and RodiumAi both speak OpenAI chat-completions; the Zuplo
    // gateway speaks Ollama's /api/chat.
    usesOpenAiProtocol: isOpenRouter || isRodium,
    defaultModel: isOpenRouter ? OPENROUTER_DEFAULT_MODEL : isRodium ? RODIUM_DEFAULT_MODEL : AI_MODEL,
  };
};

/**
 * OpenAI-protocol gateways disagree on where the version prefix lives:
 * OpenRouter serves /api/v1, RodiumAi serves /v1. Respect a base that already
 * carries its own prefix so AI_API_BASE can be set either way without doubling it.
 */
const buildOpenAiBase = (apiBase: string, isOpenRouter: boolean): string => {
  if (/\/v1$/.test(apiBase)) return apiBase;
  return isOpenRouter ? `${apiBase}/api/v1` : `${apiBase}/v1`;
};

const safeHostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const extractMessageContent = (payload: Record<string, unknown>): string => {
  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text.trim();
  }

  if (typeof payload.response === 'string' && payload.response.trim()) {
    return payload.response.trim();
  }

  const message =
    payload.message && typeof payload.message === 'object' ? (payload.message as Record<string, unknown>) : null;
  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content.trim();
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = (choices[0] && typeof choices[0] === 'object' ? choices[0] : null) as
    | Record<string, unknown>
    | null;
  const choiceMessage = (firstChoice?.message && typeof firstChoice.message === 'object'
    ? firstChoice.message
    : null) as Record<string, unknown> | null;

  if (typeof choiceMessage?.content === 'string' && choiceMessage.content.trim()) {
    return choiceMessage.content.trim();
  }

  return '';
};

const parseJsonObject = (raw: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const parseAiGatewayResponse = (rawText: string): Record<string, unknown> | null => {
  const segments = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (segments.length === 1) {
    return parseJsonObject(segments[0]);
  }

  let combinedText = '';

  for (const segment of segments) {
    const payload = parseJsonObject(segment);
    if (!payload) {
      continue;
    }

    const content = extractMessageContent(payload);
    if (content) {
      combinedText += content;
    }
  }

  return combinedText ? { text: combinedText.trim() } : null;
};

const parseProviderError = (status: number, payload: Record<string, unknown> | null, rawText: string): AiProviderError => {
  const errorObject = payload && typeof payload.error === 'object' ? (payload.error as Record<string, unknown>) : null;
  const rawMessage = String(errorObject?.message || payload?.error || rawText || '').trim();
  const code = String(errorObject?.code || '').trim() || undefined;
  const isRateLimited = status === 429 || code === '429' || /rate[- ]limit/i.test(rawMessage);
  const retryable = RETRYABLE_STATUS_CODES.has(status) || isRateLimited;

  if (isRateLimited) {
    return new AiProviderError('The current AI model is temporarily rate-limited. Please try again shortly.', {
      status,
      code,
      retryable: true,
    });
  }

  return new AiProviderError(rawMessage || `AI gateway request failed (${status})`, {
    status,
    code,
    retryable,
  });
};

/**
 * The request body for an OpenAI-protocol gateway. Exported so the model
 * evaluation (model-eval.integration.test.ts) probes the shape production really
 * sends, not a copy of it. Note what is NOT in it: an output cap. These features
 * have never sent one, and adding one would change every model's behaviour, which
 * is not something the model router should do on the side.
 */
export function buildOpenAiRequestBody(params: {
  model: string;
  messages: AiMessage[];
  format: 'json' | 'text';
  jsonSchema?: AiJsonSchema;
  reasoningEffort?: ReasoningEffort;
}): Record<string, unknown> {
  const effort =
    params.reasoningEffort && supportsReasoningEffort(params.model) ? params.reasoningEffort : undefined;
  const responseFormat =
    params.format !== 'json'
      ? null
      : params.jsonSchema
        ? {
            type: 'json_schema',
            json_schema: { name: params.jsonSchema.name, strict: true, schema: params.jsonSchema.schema },
          }
        : { type: 'json_object' };
  return {
    model: params.model,
    messages: params.messages,
    stream: false,
    ...(responseFormat ? { response_format: responseFormat } : {}),
    ...(effort ? { reasoning_effort: effort } : {}),
  };
}

const requestAiGateway = async ({
  messages,
  timeoutMs,
  model,
  format = 'json',
  onUsage,
  jsonSchema,
  reasoningEffort,
}: {
  messages: AiMessage[];
  timeoutMs: number;
  model?: string;
  /**
   * 'json' constrains the model to JSON output (Ollama-style format param).
   * 'text' omits the constraint so the model returns free-form prose — used by
   * the status update generator, which wants a natural paragraph, not JSON.
   */
  format?: 'json' | 'text';
  onUsage?: (usage: AiUsage) => void;
  /** Narrows 'json' to a strict schema on the OpenAI-protocol gateways. */
  jsonSchema?: AiJsonSchema;
  /** Sent only when the resolved model accepts it; see supportsReasoningEffort. */
  reasoningEffort?: ReasoningEffort;
}): Promise<string> => {
  const config = getAiGatewayConfig();
  if (!config) {
    throw new Error('AI model environment is not configured');
  }

  const resolvedModel = model || config.defaultModel;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // OpenRouter and RodiumAi speak the OpenAI chat-completions protocol; the
  // Zuplo gateway speaks Ollama's /api/chat. Same response parsing handles both.
  const endpoint = config.usesOpenAiProtocol
    ? `${buildOpenAiBase(config.apiBase, config.isOpenRouter)}/chat/completions`
    : `${config.apiBase}/api/chat`;
  const headers: Record<string, string> = config.usesOpenAiProtocol
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      }
    : {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      };
  const body = config.usesOpenAiProtocol
    ? buildOpenAiRequestBody({ model: resolvedModel, messages, format, jsonSchema, reasoningEffort })
    : {
        model: resolvedModel,
        messages,
        stream: false,
        ...(format === 'json' ? { format: 'json' } : {}),
      };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      let payload: Record<string, unknown> | null = null;
      try {
        payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      } catch {
        payload = null;
      }
      throw parseProviderError(response.status, payload, rawText);
    }

    const rawText = await response.text().catch(() => '');
    const payload = parseAiGatewayResponse(rawText) ?? {};
    // Reported before the empty-content check below: the model spent tokens
    // producing whatever it returned, even when that turns out to be nothing
    // usable.
    const usage = extractAiUsage(payload);
    if (usage && onUsage) onUsage({ ...usage, cachedTokens: extractCachedTokens(payload), model: resolvedModel });
    const content = extractMessageContent(payload);
    if (!content) {
      throw new Error('Model returned empty content');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
};

export const isAiConfigured = (): boolean => Boolean(getAiGatewayConfig());

/**
 * How long the next attempt may run: the caller's timeout, cut to what the
 * deadline leaves after the guard. Null when the window is too small to be a
 * real attempt (see MIN_ATTEMPT_WINDOW_MS), which the caller treats as the
 * deadline having passed.
 */
const attemptTimeoutFor = (timeoutMs: number, deadlineMs: number | undefined, now: number): number | null => {
  if (deadlineMs === undefined) return timeoutMs;
  const window = deadlineMs - now - DEADLINE_GUARD_MS;
  if (window < MIN_ATTEMPT_WINDOW_MS) return null;
  return Math.min(timeoutMs, window);
};

/** Whether another attempt can still finish before the deadline. */
const hasRetryBudget = (deadlineMs: number | undefined, now: number): boolean =>
  deadlineMs === undefined || deadlineMs - now >= MIN_RETRY_BUDGET_MS;

export async function generateStructuredAiOutput<T>({
  messages,
  temperature = 0.25,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  model,
  parse,
  invalidFormatMessage = 'Model returned invalid JSON format',
  onUsage,
  jsonSchema,
  reasoningEffort,
  deadlineMs,
}: GenerateStructuredAiOutputOptions<T>): Promise<T> {
  const config = getAiGatewayConfig();
  if (!config) {
    throw new Error('AI model environment is not configured');
  }

  // With no model override on OpenRouter, each attempt is served by a
  // different randomly-selected free model (openrouter/free) — a failure on
  // one attempt says nothing about the next, so every failure is worth
  // retrying. For a pinned model, keep the narrower classification: retrying
  // the identical model after a parse/empty-content failure rarely helps.
  const isFreeAutoRouter = !model && config.isOpenRouter;

  let lastError: unknown = null;

  void temperature;

  // The two one-shot fallbacks. Each flips at most once, on a 400 whose
  // message names its parameter, and the resend it triggers is not counted
  // as a retry: whether the gateway accepts the parameter is a property of the
  // gateway, learned once, not a transient failure of this attempt.
  let useSchema = Boolean(jsonSchema);
  let useEffort = Boolean(reasoningEffort);

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt += 1;

    const attemptTimeout = attemptTimeoutFor(timeoutMs, deadlineMs, Date.now());
    if (attemptTimeout === null) {
      if (!lastError) {
        lastError = new AiProviderError('AI request deadline passed before the model was asked', {
          code: 'deadline',
          retryable: false,
        });
      }
      break;
    }

    try {
      const raw = await requestAiGateway({
        messages,
        timeoutMs: attemptTimeout,
        model,
        onUsage,
        jsonSchema: useSchema ? jsonSchema : undefined,
        reasoningEffort: useEffort ? reasoningEffort : undefined,
      });
      const parsed = parse(raw);
      if (!parsed) {
        throw new AiProviderError(invalidFormatMessage, { retryable: isFreeAutoRouter });
      }
      return parsed;
    } catch (error) {
      lastError = error;

      if (error instanceof AiProviderError && error.status === 400) {
        if (useEffort && EFFORT_REJECTION.test(error.message)) {
          useEffort = false;
          attempt -= 1;
          continue;
        }
        if (useSchema && SCHEMA_REJECTION.test(error.message)) {
          useSchema = false;
          attempt -= 1;
          continue;
        }
      }
      // A client-side abort (our own timeout firing) never went through
      // parseProviderError, so it reaches here as a bare DOMException/Error
      // rather than an AiProviderError — and would otherwise fall back to
      // `retryable: isFreeAutoRouter`, silently dropping to ONE attempt for
      // every pinned model (which is every model this app actually uses:
      // RodiumAi is not the free auto-router). Callers that budget a timeout
      // × maxRetries duration (see PLANNER_TIMEOUT_MS's comment) are relying
      // on a timeout actually being retried, not just accepted as fatal on
      // attempt one. A slow response says nothing about the next attempt, so
      // treat it the same as a 429/5xx: worth one more try.
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const typedError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError(
              String((error as { message?: string } | null)?.message || 'Unknown AI generation error'),
              { retryable: isFreeAutoRouter || isAbort }
            );

      const shouldRetry =
        (isFreeAutoRouter || isAbort || typedError.retryable) &&
        attempt < maxRetries &&
        hasRetryBudget(deadlineMs, Date.now());
      if (shouldRetry) {
        await sleep(Math.min(1500 * attempt, 4000));
        continue;
      }

      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown AI generation error');
}

type GeneratePlainTextAiOutputOptions = {
  messages: AiMessage[];
  timeoutMs?: number;
  maxRetries?: number;
  model?: string;
  /** See GenerateStructuredAiOutputOptions.onUsage — same contract. */
  onUsage?: (usage: AiUsage) => void;
  /** See GenerateStructuredAiOutputOptions.reasoningEffort — same contract,
   *  including the one-shot resend without it on a 400 that names it. */
  reasoningEffort?: ReasoningEffort;
  /** See GenerateStructuredAiOutputOptions.deadlineMs — same contract. Needed
   *  once a request can be handed to a second model: each model's own retry
   *  loop has to leave the next one time to finish. */
  deadlineMs?: number;
};

/**
 * Plain-text sibling of generateStructuredAiOutput. Runs the same retry +
 * timeout + error-mapping loop but requests free-form prose (no JSON format
 * constraint) and returns the trimmed string. Used by the status update
 * generator. Throws AiProviderError on exhausted retries; empty output throws
 * a non-retryable error so the caller can map it to a clear message — unless
 * we're on the free auto-router, where a retry samples a different model.
 */
export async function generatePlainTextAiOutput({
  messages,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  model,
  onUsage,
  reasoningEffort,
  deadlineMs,
}: GeneratePlainTextAiOutputOptions): Promise<string> {
  const config = getAiGatewayConfig();
  if (!config) {
    throw new Error('AI model environment is not configured');
  }

  const isFreeAutoRouter = !model && config.isOpenRouter;

  let lastError: unknown = null;
  // Flips at most once, like the structured generator's: whether the gateway
  // accepts the parameter is a fact about the gateway, not about this attempt.
  let useEffort = Boolean(reasoningEffort);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const attemptTimeout = attemptTimeoutFor(timeoutMs, deadlineMs, Date.now());
    if (attemptTimeout === null) {
      if (!lastError) {
        lastError = new AiProviderError('AI request deadline passed before the model was asked', {
          code: 'deadline',
          retryable: false,
        });
      }
      break;
    }

    try {
      const raw = await requestAiGateway({
        messages,
        timeoutMs: attemptTimeout,
        model,
        format: 'text',
        onUsage,
        reasoningEffort: useEffort ? reasoningEffort : undefined,
      });
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new AiProviderError('Model returned empty content', { retryable: isFreeAutoRouter });
      }
      return trimmed;
    } catch (error) {
      lastError = error;
      if (
        useEffort &&
        error instanceof AiProviderError &&
        error.status === 400 &&
        EFFORT_REJECTION.test(error.message)
      ) {
        useEffort = false;
        attempt -= 1;
        continue;
      }
      // Same reasoning as generateStructuredAiOutput's identical block: a
      // client-side abort must count as retryable on its own, not only under
      // the free auto-router, or a pinned model never gets its second attempt.
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const typedError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError(
              String((error as { message?: string } | null)?.message || 'Unknown AI generation error'),
              { retryable: isFreeAutoRouter || isAbort }
            );

      const shouldRetry =
        (isFreeAutoRouter || isAbort || typedError.retryable) &&
        attempt < maxRetries &&
        hasRetryBudget(deadlineMs, Date.now());
      if (shouldRetry) {
        await sleep(Math.min(1500 * attempt, 4000));
        continue;
      }

      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown AI generation error');
}
