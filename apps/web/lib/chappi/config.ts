// Server-side Chappi config. Kept separate from lib/ai/provider.ts because the
// Chappi agent uses its OWN transport (OpenAI-protocol tool calling against the
// RodiumAi gateway; rewritten 2026-08-13 off the Anthropic SDK) and its OWN
// credentials, independent of the gateway that serves the single-shot AI
// features. Capability is gated on CHAPPI_MODEL being set to a real model —
// so the agent stays dark until a capable tool-calling model is wired.

// RodiumAi's OpenAI-compatible surface. CHAPPI_MODEL must be a tool-capable
// catalogue id — e.g. openai/gpt-4o-mini (verified 2026-08-13 against the live
// API: proper tool_calls, correct arguments). NOT a meta/llama-* free-tier
// model: those are geo-blocked at the AWS Bedrock license level for this
// account's region ("Access to Meta Llama models is not allowed from
// unsupported countries") — confirmed live, not a code bug.
const DEFAULT_CHAPPI_API_BASE = 'https://api.rodiumai.io/v1';

export type ChappiModelConfig = {
  apiKey: string;
  model: string;
  /** Gateway base URL (…/v1). Defaults to RodiumAi; override via CHAPPI_API_BASE. */
  baseURL: string;
};

/** The client-facing flag: is the Chappi UI mounted at all. */
export function isChappiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
}

/** Voice input for UrgAns (NEXT_PUBLIC_FEATURE_URGANS_VOICE). Only meaningful
 * alongside NEXT_PUBLIC_FEATURE_CHAPPI, since the mic lives in the composer.
 * When off, the mic is hidden and /api/urgans/transcribe 404s. */
export function isUrgansVoiceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_URGANS_VOICE === 'true';
}

/** Resolve the transcription transport, or null when not fully configured.
 * Reuses the RodiumAi key and base UrgAns already uses (one vendor, founder
 * call). The model is a separate env var because the transcription model id
 * differs from the chat model id. */
export function getTranscriptionConfig(): { apiKey: string; model: string; baseURL: string } | null {
  const apiKey = String(process.env.CHAPPI_API_KEY || '').trim();
  const model = String(process.env.URGANS_TRANSCRIBE_MODEL || '').trim();
  if (!apiKey || !model) return null;

  const baseURL =
    String(process.env.CHAPPI_API_BASE || '').trim().replace(/\/+$/, '') || DEFAULT_CHAPPI_API_BASE;
  return { apiKey, model, baseURL };
}

/** Resolve the model transport config, or null when not fully configured. */
export function getChappiModelConfig(): ChappiModelConfig | null {
  const apiKey = String(process.env.CHAPPI_API_KEY || '').trim();
  const model = String(process.env.CHAPPI_MODEL || '').trim();
  if (!apiKey || !model) return null;

  const baseURL =
    String(process.env.CHAPPI_API_BASE || '').trim().replace(/\/+$/, '') || DEFAULT_CHAPPI_API_BASE;
  return { apiKey, model, baseURL };
}

/** True once a capable model + key are configured. When false, the route
 * returns `{ mode: 'deterministic' }` and the client falls back to the
 * keyword intent-router — the degraded mode that keeps the front door useful. */
export function isChappiModelConfigured(): boolean {
  return Boolean(getChappiModelConfig());
}
