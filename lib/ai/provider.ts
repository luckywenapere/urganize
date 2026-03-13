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

const getOpenRouterConfig = () => {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  const model = String(process.env.OPENROUTER_MODEL || '').trim();
  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim();
  const appName = String(process.env.NEXT_PUBLIC_APP_NAME || 'Urganize').trim();

  if (!apiKey || !model) return null;

  return {
    apiKey,
    model,
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

const requestOpenRouter = async ({
  messages,
  temperature,
  timeoutMs,
}: {
  messages: AiMessage[];
  temperature: number;
  timeoutMs: number;
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
        model: config.model,
        temperature,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `OpenRouter request failed (${response.status})`);
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
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await requestOpenRouter({ messages, temperature, timeoutMs });
      const parsed = parse(raw);
      if (!parsed) {
        throw new Error(invalidFormatMessage);
      }
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown AI generation error');
}
