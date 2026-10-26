// Bring your own AI, for WhatsApp replies. Server only.
//
// One code path for every provider: the OpenAI chat-completions shape. OpenAI,
// OpenRouter and Anthropic's compatibility endpoint all speak it, and "custom"
// covers anything else that does. The team's key never reaches the browser and
// is only used for this team's WhatsApp replies.

export type ByoProvider = 'openai' | 'anthropic' | 'openrouter' | 'custom';

export const BYO_PROVIDERS: readonly ByoProvider[] = ['openai', 'anthropic', 'openrouter', 'custom'];

const BASE_URLS: Record<Exclude<ByoProvider, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export function isByoProvider(value: unknown): value is ByoProvider {
  return typeof value === 'string' && (BYO_PROVIDERS as readonly string[]).includes(value);
}

/**
 * A custom endpoint is called from our server with the team's key, so it has to
 * be a public https address. Refuses localhost, private ranges and IP literals
 * so a team cannot point the server at our own network.
 */
export function isSafeBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return false;
  return true;
}

export function resolveBaseUrl(provider: ByoProvider, customBaseUrl: string | null): string | null {
  if (provider !== 'custom') return BASE_URLS[provider];
  const trimmed = (customBaseUrl ?? '').trim().replace(/\/+$/, '');
  return trimmed && isSafeBaseUrl(trimmed) ? trimmed : null;
}

export type ByoConfig = {
  provider: ByoProvider;
  baseUrl: string | null;
  model: string;
  apiKey: string;
};

export type ByoMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function callOwnModel(
  config: ByoConfig,
  messages: ByoMessage[],
  options: { timeoutMs?: number; maxTokens?: number } = {}
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const base = resolveBaseUrl(config.provider, config.baseUrl);
  if (!base) return { ok: false, error: 'The AI address is not valid. It must be a public https address.' };
  if (!config.model.trim()) return { ok: false, error: 'Add a model name.' };
  if (!config.apiKey.trim()) return { ok: false, error: 'Add an API key.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model.trim(),
        messages,
        max_tokens: options.maxTokens ?? 300,
        temperature: 0.4,
      }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'That key was refused. Check it and try again.' };
    if (res.status === 404) return { ok: false, error: 'That model was not found for this key.' };
    if (!res.ok) return { ok: false, error: `The AI company answered with an error (${res.status}).` };
    const payload = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The model sent back nothing.' };
    return { ok: true, text: text.trim() };
  } catch {
    return { ok: false, error: 'Could not reach the AI company. Try again.' };
  } finally {
    clearTimeout(timer);
  }
}
