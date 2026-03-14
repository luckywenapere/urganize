type AiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type GenerateStructuredAiOutputOptions<T> = {
  messages: AiMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  parse: (raw: string) => T | null;
  invalidFormatMessage?: string;
};

const DEFAULT_AI_API_BASE = 'https://urganize-main-34fd8f6.d2.zuplo.dev';
const AI_MODEL = 'qwen2.5:3b';
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
  const apiBase = String(process.env.AI_API_BASE || DEFAULT_AI_API_BASE).trim();

  if (!apiKey) return null;

  return {
    apiKey,
    apiBase,
  };
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
}: {
  messages: AiMessage[];
  timeoutMs: number;
}): Promise<string> => {
  const config = getAiGatewayConfig();
  if (!config) {
    throw new Error('AI model environment is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.apiBase}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
      }),
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
  parse,
  invalidFormatMessage = 'Model returned invalid JSON format',
}: GenerateStructuredAiOutputOptions<T>): Promise<T> {
  if (!getAiGatewayConfig()) {
    throw new Error('AI model environment is not configured');
  }

  let lastError: unknown = null;

  void temperature;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await requestAiGateway({ messages, timeoutMs });
      const parsed = parse(raw);
      if (!parsed) {
        throw new AiProviderError(invalidFormatMessage, { retryable: false });
      }
      return parsed;
    } catch (error) {
      lastError = error;
      const typedError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError(String((error as { message?: string } | null)?.message || 'Unknown AI generation error'));

      const shouldRetry = typedError.retryable && attempt < maxRetries;
      if (shouldRetry) {
        await sleep(Math.min(1500 * attempt, 4000));
        continue;
      }

      break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown AI generation error');
}
