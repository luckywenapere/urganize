import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/credits/credits-server', () => ({ settleVoiceMinutes: vi.fn() }));

import { buildGreeting, getVoiceConfig, mintRealtimeSecret } from './urgans-voice-realtime-server';

describe('the voice configuration', () => {
  it('defaults to cascade on the RodiumAi gateway', () => {
    const config = getVoiceConfig({ CHAPPI_API_KEY: 'k' });
    expect(config.transport).toBe('cascade');
    expect(config.gateway).toEqual({ baseURL: 'https://api.rodiumai.io/v1', apiKey: 'k' });
    expect(config.transcribeModel).toBe('openai/gpt-transcribe');
    expect(config.ttsModel).toBe('openai/gpt-4o-mini-tts');
    expect(config.realtime).toBeNull();
  });

  it('falls back to cascade when realtime is asked for with no realtime upstream', () => {
    expect(getVoiceConfig({ CHAPPI_API_KEY: 'k', URGANS_VOICE_TRANSPORT: 'realtime' }).transport).toBe('cascade');
  });

  it('goes straight to OpenAI with OPENAI_REALTIME_API_KEY, with the bare model id', () => {
    const config = getVoiceConfig({ CHAPPI_API_KEY: 'k', URGANS_VOICE_TRANSPORT: 'realtime', OPENAI_REALTIME_API_KEY: 'sk' });
    expect(config.transport).toBe('realtime');
    expect(config.realtime).toMatchObject({ baseURL: 'https://api.openai.com/v1', apiKey: 'sk', model: 'gpt-realtime-2.1-mini', upstreamIsOpenAi: true });
  });

  it('can point realtime at another base (RodiumAi, once it serves it), keeping the vendor prefix there', () => {
    const config = getVoiceConfig({ CHAPPI_API_KEY: 'k', URGANS_VOICE_TRANSPORT: 'realtime', URGANS_VOICE_REALTIME_BASE: 'https://api.rodiumai.io/v1/' });
    expect(config.realtime).toMatchObject({ baseURL: 'https://api.rodiumai.io/v1', apiKey: 'k', model: 'openai/gpt-realtime-2.1-mini' });
  });
});

describe('the greeting', () => {
  it('opens with the rollout and the days to release', () => {
    expect(buildGreeting({ firstName: 'Oyin', release: { id: 'r', title: 'Calm Down', daysToRelease: 23 } })).toBe(
      'Hi Oyin. You\'re on "Calm Down", 23 days to release. What do you need?'
    );
    expect(buildGreeting({})).toBe('Hi. What do you need?');
  });
});

describe('minting a realtime client secret', () => {
  it('configures the session server side: one tool, captions, the voice, never the browser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: 'ek_1', expires_at: 123 }), { status: 200 }));
    const config = getVoiceConfig({ URGANS_VOICE_TRANSPORT: 'realtime', OPENAI_REALTIME_API_KEY: 'sk' });
    const secret = await mintRealtimeSecret(config, { instructions: 'be brief' }, fetchMock as unknown as typeof fetch);
    expect(secret).toEqual({ value: 'ek_1', expiresAt: 123, callsUrl: 'https://api.openai.com/v1/realtime/calls', model: 'gpt-realtime-2.1-mini' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    const body = JSON.parse(init.body);
    expect(body.session.tools.map((t: { name: string }) => t.name)).toEqual(['urgans_do']);
    expect(body.session.audio.input.transcription.model).toBe('gpt-live-transcribe');
    expect(init.headers.Authorization).toBe('Bearer sk');
  });

  it('refuses when realtime is not configured, without calling out', async () => {
    const fetchMock = vi.fn();
    await expect(mintRealtimeSecret(getVoiceConfig({ CHAPPI_API_KEY: 'k' }), { instructions: '' }, fetchMock as never)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
