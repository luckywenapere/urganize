// Server-side Chappi config. Kept separate from lib/ai/provider.ts because the
// Chappi agent uses its OWN transport (the Anthropic SDK) and its OWN
// credentials, independent of the Zuplo gateway that serves the two single-shot
// AI features. Capability is gated on CHAPPI_MODEL being set to a real model —
// NOT on the qwen2.5:3b placeholder — so the agent stays dark until a capable
// tool-calling model is wired (Phase 4).

export type ChappiModelConfig = {
  apiKey: string;
  model: string;
  /** Optional SDK baseURL override for routing through a future proxy/gateway. */
  baseURL?: string;
};

/** The client-facing flag: is the Chappi UI mounted at all. */
export function isChappiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
}

/** Resolve the model transport config, or null when not fully configured. */
export function getChappiModelConfig(): ChappiModelConfig | null {
  const apiKey = String(process.env.CHAPPI_API_KEY || '').trim();
  const model = String(process.env.CHAPPI_MODEL || '').trim();
  if (!apiKey || !model) return null;

  const baseURL = String(process.env.CHAPPI_API_BASE || '').trim() || undefined;
  return { apiKey, model, baseURL };
}

/** True once a capable model + key are configured. When false, the route
 * returns `{ mode: 'deterministic' }` and the client falls back to the
 * keyword intent-router — the degraded mode that keeps the front door useful. */
export function isChappiModelConfigured(): boolean {
  return Boolean(getChappiModelConfig());
}
