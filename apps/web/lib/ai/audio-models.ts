/**
 * The speech models: which model transcribes, which one speaks, and which one
 * holds a live voice call. The one place outside the ladder that names them
 * (lib/ai/model-router-guard.test.ts lists it), for the same reason the ladder
 * exists: a model id typed into a route never moves when the default does.
 *
 * Chosen 2026-10-11 from RodiumAi's live catalogue (GET /v1/models), with the
 * founder. Each one is a DEFAULT, overridable per deployment by its env var,
 * read where the feature is configured (lib/chappi/config.ts), never here, so
 * this module stays pure and client-safe.
 *
 *   transcribe       dictation (record, then type)  URGANS_TRANSCRIBE_MODEL
 *   live transcribe  captions inside a realtime call URGANS_VOICE_TRANSCRIBE_MODEL
 *   speech           the cascade voice transport     URGANS_VOICE_TTS_MODEL
 *   realtime         the realtime voice transport    URGANS_VOICE_REALTIME_MODEL
 *
 * Prices live in lib/credits/model-prices.ts (AUDIO_MODEL_PRICES), which is
 * where every model's cost is kept; none of these is ever charged per token.
 */

/** Dictation's speech-to-text. Measured 2026-10-11: answers on RodiumAi with `usage: { type: 'duration', seconds }`. */
export const DEFAULT_TRANSCRIBE_MODEL = 'openai/gpt-transcribe';

/** Live captions for a realtime call (input audio transcription). */
export const DEFAULT_LIVE_TRANSCRIBE_MODEL = 'openai/gpt-live-transcribe';

/** Text to speech for the cascade voice transport (POST /v1/audio/speech). Verified live 2026-10-11. */
export const DEFAULT_TTS_MODEL = 'openai/gpt-4o-mini-tts';

/** The realtime voice model (speech in, speech out, one delegate tool). */
export const DEFAULT_REALTIME_MODEL = 'openai/gpt-realtime-2.1-mini';

/**
 * The realtime model id as the upstream that serves it expects it. RodiumAi
 * takes vendor-prefixed ids; api.openai.com takes the bare name.
 */
export function realtimeModelForUpstream(model: string, upstreamIsOpenAi: boolean): string {
  const id = model.trim();
  return upstreamIsOpenAi ? id.replace(/^openai\//i, '') : id;
}
