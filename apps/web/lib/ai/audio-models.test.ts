import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_LIVE_TRANSCRIBE_MODEL,
  DEFAULT_REALTIME_MODEL,
  DEFAULT_TRANSCRIBE_MODEL,
  DEFAULT_TTS_MODEL,
  realtimeModelForUpstream,
} from './audio-models';
import { AUDIO_MODEL_PRICES, MODEL_PRICES } from '@/lib/credits/model-prices';
import { getTranscriptionConfig } from '@/lib/chappi/config';

afterEach(() => vi.unstubAllEnvs());

describe('the speech models', () => {
  it('defaults dictation to gpt-transcribe (founder call, 2026-10-11)', () => {
    expect(DEFAULT_TRANSCRIBE_MODEL).toBe('openai/gpt-transcribe');
  });

  it('prices every default speech model, and keeps them out of the chat price table', () => {
    for (const model of [DEFAULT_TRANSCRIBE_MODEL, DEFAULT_LIVE_TRANSCRIBE_MODEL, DEFAULT_TTS_MODEL, DEFAULT_REALTIME_MODEL]) {
      expect(AUDIO_MODEL_PRICES[model], model).toBeDefined();
      // A speech model priced as a chat model could be charged as a chat turn.
      expect(MODEL_PRICES[model], model).toBeUndefined();
    }
  });

  it('names the realtime model the way each upstream expects it', () => {
    expect(realtimeModelForUpstream('openai/gpt-realtime-2.1-mini', true)).toBe('gpt-realtime-2.1-mini');
    expect(realtimeModelForUpstream('openai/gpt-realtime-2.1-mini', false)).toBe('openai/gpt-realtime-2.1-mini');
  });
});

describe('the transcription config', () => {
  it('uses gpt-transcribe when no model is set, so dictation works on the key alone', () => {
    vi.stubEnv('CHAPPI_API_KEY', 'test-key');
    vi.stubEnv('URGANS_TRANSCRIBE_MODEL', '');
    expect(getTranscriptionConfig()?.model).toBe('openai/gpt-transcribe');
  });

  it('still lets the env var override it', () => {
    vi.stubEnv('CHAPPI_API_KEY', 'test-key');
    vi.stubEnv('URGANS_TRANSCRIBE_MODEL', 'openai/gpt-4o-mini-transcribe');
    expect(getTranscriptionConfig()?.model).toBe('openai/gpt-4o-mini-transcribe');
  });

  it('is still off without a key', () => {
    vi.stubEnv('CHAPPI_API_KEY', '');
    expect(getTranscriptionConfig()).toBeNull();
  });
});
