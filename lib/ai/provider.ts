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

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
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

const getOpenRouterConfig = () => {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  const models = String(process.env.OPENROUTER_MODEL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
  const appName = String(process.env.NEXT_PUBLIC_APP_NAME || 'Urganize').trim();

  if (!apiKey || models.length === 0) return null;

  return {
    apiKey,
    models,
    appUrl,
    appName,
  };
};

const extractMessageContent = (payload: Record<string, unknown>): string => {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = (choices[0] && typeof choices[0] === 'object' ? choices[0] : null) as
    | Record<string, unknown>
    | null;
  const message = (firstChoice?.message && typeof firstChoice.message === 'object'
    ? firstChoice.message
    : null) as Record<string, unknown> | null;

  if (typeof message?.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message?.content)) {
    const text = message.content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const typedPart = part as Record<string, unknown>;
        return typeof typedPart.text === 'string' ? typedPart.text : '';
      })
      .join('')
      .trim();
    if (text) return text;
  }

  return '';
};

const parseProviderError = (status: number, payload: Record<string, unknown> | null, rawText: string): AiProviderError => {
  const errorObject = payload && typeof payload.error === 'object' ? (payload.error as Record<string, unknown>) : null;
  const rawMessage = String(errorObject?.message || rawText || '').trim();
  const code = String(errorObject?.code || '').trim() || undefined;
  const providerName = String((errorObject?.metadata as Record<string, unknown> | undefined)?.provider_name || '').trim();
  const isRateLimited = status === 429 || code === '429' || /rate[- ]limit/i.test(rawMessage);
  const retryable = RETRYABLE_STATUS_CODES.has(status) || isRateLimited;

  if (isRateLimited) {
    return new AiProviderError(
      providerName
        ? `${providerName} is temporarily rate-limited for the current model. Try again shortly or switch to another OpenRouter model.`
        : 'The current AI model is temporarily rate-limited. Try again shortly or switch to another OpenRouter model.',
      { status, code, retryable: true }
    );
  }

  return new AiProviderError(rawMessage || `OpenRouter request failed (${status})`, {
    status,
    code,
    retryable,
  });
};

const requestOpenRouter = async ({
  messages,
  temperature,
  timeoutMs,
  model,
}: {
  messages: AiMessage[];
  temperature: number;
  timeoutMs: number;
  model: string;
}): Promise<string> => {
  const config = getOpenRouterConfig();
  if (!config) {
    throw new Error('AI model environment is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': config.appUrl,
        'X-Title': config.appName,
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: 'json_object' },
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

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const content = extractMessageContent(payload);
    if (!content) {
      throw new Error('Model returned empty content');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
};

export const isAiConfigured = (): boolean => Boolean(getOpenRouterConfig());

export async function generateStructuredAiOutput<T>({
  messages,
  temperature = 0.25,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  parse,
  invalidFormatMessage = 'Model returned invalid JSON format',
}: GenerateStructuredAiOutputOptions<T>): Promise<T> {
  const config = getOpenRouterConfig();
  if (!config) {
    throw new Error('AI model environment is not configured');
  }

  let lastError: unknown = null;

  for (const model of config.models) {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const raw = await requestOpenRouter({ messages, temperature, timeoutMs, model });
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

        const hasMoreAttemptsForModel = attempt < maxRetries;
        const shouldRetryCurrentModel = typedError.retryable && hasMoreAttemptsForModel;

        if (shouldRetryCurrentModel) {
          await sleep(Math.min(1500 * attempt, 4000));
          continue;
        }

        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown AI generation error');
}
