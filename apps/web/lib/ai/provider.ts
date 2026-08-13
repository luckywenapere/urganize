type AiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type GenerateStructuredAiOutputOptions<T> = {
  messages: AiMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Upstream model id. Defaults per gateway: 'openrouter/free' on openrouter.ai,
   * Claude Haiku on rodiumai.io, otherwise the Zuplo gateway's qwen2.5:3b. Lets a
   * caller route a specific request to a different model (e.g., the rollout
   * planner via AI_PLANNER_MODEL) provided the gateway serves that model id.
   */
  model?: string;
  parse: (raw: string) => T | null;
  invalidFormatMessage?: string;
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

const getAiGatewayConfig = () => {
  const apiKey = String(process.env.AI_API_KEY || '').trim();
  const apiBase = String(process.env.AI_API_BASE || DEFAULT_AI_API_BASE).trim().replace(/\/+$/, '');

  if (!apiKey) return null;

  const hostname = safeHostname(apiBase);
  const isOpenRouter = /(^|\.)openrouter\.ai$/i.test(hostname);
  const isRodium = /(^|\.)rodiumai\.io$/i.test(hostname);

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

const requestAiGateway = async ({
  messages,
  timeoutMs,
  model,
  format = 'json',
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
    ? {
        model: resolvedModel,
        messages,
        stream: false,
        ...(format === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }
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

export async function generateStructuredAiOutput<T>({
  messages,
  temperature = 0.25,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  model,
  parse,
  invalidFormatMessage = 'Model returned invalid JSON format',
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

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await requestAiGateway({ messages, timeoutMs, model });
      const parsed = parse(raw);
      if (!parsed) {
        throw new AiProviderError(invalidFormatMessage, { retryable: isFreeAutoRouter });
      }
      return parsed;
    } catch (error) {
      lastError = error;
      const typedError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError(
              String((error as { message?: string } | null)?.message || 'Unknown AI generation error'),
              { retryable: isFreeAutoRouter }
            );

      const shouldRetry = (isFreeAutoRouter || typedError.retryable) && attempt < maxRetries;
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
}: GeneratePlainTextAiOutputOptions): Promise<string> {
  const config = getAiGatewayConfig();
  if (!config) {
    throw new Error('AI model environment is not configured');
  }

  const isFreeAutoRouter = !model && config.isOpenRouter;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await requestAiGateway({ messages, timeoutMs, model, format: 'text' });
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new AiProviderError('Model returned empty content', { retryable: isFreeAutoRouter });
      }
      return trimmed;
    } catch (error) {
      lastError = error;
      const typedError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError(
              String((error as { message?: string } | null)?.message || 'Unknown AI generation error'),
              { retryable: isFreeAutoRouter }
            );

      const shouldRetry = (isFreeAutoRouter || typedError.retryable) && attempt < maxRetries;
      if (shouldRetry) {
        await sleep(Math.min(1500 * attempt, 4000));
        continue;
      }

      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown AI generation error');
}
