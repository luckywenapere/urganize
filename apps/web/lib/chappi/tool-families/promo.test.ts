/**
 * UrgAns pitching on credits (#1236). The pitch tool used to post to the free
 * route, which refuses every paid playlist, and then reported each refusal as
 * "already pitched". These drive the real tools with only fetch mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMO_TOOLS } from './promo';
import type { ChappiTool, ChappiToolContext } from './shared';

const ctx = {
  origin: 'https://app.test',
  authToken: 'token',
  user: { id: 'user-1', email: 'manager@example.com' },
} as unknown as ChappiToolContext;

const tool = (name: string): ChappiTool => {
  const found = PROMO_TOOLS.find((entry) => entry.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
};

const args = {
  releaseId: 'rel-1',
  playlistId: 'pl-1',
  songTitle: 'Lagos Nights',
  songUrl: 'https://open.spotify.com/track/abc',
  note: 'Fits your Friday list.',
};

const playlists = [
  { id: 'pl-1', name: 'Afro Fridays', curatorName: 'Tolu', platform: 'spotify', genres: ['afrobeats'], followerCount: 5000, creditPrice: 100 },
  { id: 'pl-2', name: 'Chill Lagos', curatorName: 'Ada', platform: 'spotify', genres: [], followerCount: null, creditPrice: 0 },
];

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];

function answer(routes: Record<string, { status: number; body: Record<string, unknown> }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { method: string; body?: string }) => {
      const path = url.replace(ctx.origin, '');
      calls.push({ url: path, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      const key = `${init.method} ${path.split('?')[0]}`;
      const hit = routes[key] ?? { status: 404, body: { error: 'Not found.' } };
      return new Response(JSON.stringify(hit.body), { status: hit.status });
    })
  );
}

beforeEach(() => {
  calls = [];
  vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCHING', 'true');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_URGANS_CREDITS', 'true');
  vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCH_CREDITS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('pitch_song with pitch credits on', () => {
  it('sends through the credits route with a request id, and says what it cost', async () => {
    answer({ 'POST /api/pitching/send': { status: 201, body: { pitches: [{}], charged: 100, balance: 350 } } });

    const result = await tool('pitch_song').execute(ctx, args);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/pitching/send');
    expect(calls[0].body).toMatchObject({
      releaseId: 'rel-1',
      playlistIds: ['pl-1'],
      songTitle: 'Lagos Nights',
      songUrl: 'https://open.spotify.com/track/abc',
      note: 'Fits your Friday list.',
    });
    expect(String(calls[0].body?.requestId)).toMatch(/^[A-Za-z0-9-]{8,80}$/);
    expect(result).toEqual({ ok: true, summary: 'Pitched "Lagos Nights". 100 credits used, 350 left.' });
  });

  it('gives each send its own request id, so a second pitch is a new charge', async () => {
    answer({ 'POST /api/pitching/send': { status: 201, body: { pitches: [{}], charged: 0, balance: null } } });

    await tool('pitch_song').execute(ctx, args);
    await tool('pitch_song').execute(ctx, args);

    expect(calls[0].body?.requestId).not.toBe(calls[1].body?.requestId);
  });

  it('says a free pitch was free', async () => {
    answer({ 'POST /api/pitching/send': { status: 201, body: { pitches: [{}], charged: 0, balance: 450 } } });

    const result = await tool('pitch_song').execute(ctx, args);

    expect(result.summary).toBe('Pitched "Lagos Nights".');
  });

  it('names the shortfall when credits run out', async () => {
    answer({
      'POST /api/pitching/send': {
        status: 402,
        body: { error: 'You need more credits for these pitches.', code: 'insufficient', needed: 250, balance: 40, short: 210 },
      },
    });

    const result = await tool('pitch_song').execute(ctx, args);

    expect(result.ok).toBe(false);
    expect(result.summary).toBe(
      'This pitch costs 250 credits and you have 40. Buy more credits, then ask me again. Nothing was charged.'
    );
  });

  it('passes on the real reason for a refusal instead of "already pitched"', async () => {
    answer({
      'POST /api/pitching/send': {
        status: 409,
        body: { error: 'This curator isn’t taking pitches right now.', code: 'curator_paused' },
      },
    });

    const result = await tool('pitch_song').execute(ctx, args);

    expect(result).toEqual({ ok: false, summary: 'This curator isn’t taking pitches right now.' });
  });

  it('says a duplicate is for this one playlist', async () => {
    answer({
      'POST /api/pitching/send': {
        status: 409,
        body: { error: 'One of these curators already has a pitch waiting for this rollout.', code: 'duplicate' },
      },
    });

    const result = await tool('pitch_song').execute(ctx, args);

    expect(result.summary).toBe('This playlist already has a pitch from this rollout waiting for a reply.');
  });

  it('puts the cost on the confirm card', async () => {
    answer({ 'GET /api/pitching/playlists': { status: 200, body: { playlists } } });

    const card = await tool('pitch_song').confirm!(ctx, args);

    expect(card).toMatchObject({ ok: true, title: 'Pitch "Lagos Nights" to Afro Fridays?' });
    expect((card as { detail: string }).detail).toContain('This uses 100 credits.');
  });

  it('says a free playlist costs nothing on the confirm card', async () => {
    answer({ 'GET /api/pitching/playlists': { status: 200, body: { playlists } } });

    const card = await tool('pitch_song').confirm!(ctx, { ...args, playlistId: 'pl-2' });

    expect((card as { detail: string }).detail).toContain('This pitch is free.');
  });
});

describe('pitch_song with pitch credits off', () => {
  it('keeps using the free route, and still passes on its real reason', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PITCH_CREDITS', 'false');
    answer({
      'POST /api/pitching/pitches': {
        status: 409,
        body: { error: 'This rollout already has 10 pitches waiting. Wait for replies before sending more.' },
      },
    });

    const result = await tool('pitch_song').execute(ctx, args);

    expect(calls[0].url).toBe('/api/pitching/pitches');
    expect(result.summary).toBe('This rollout already has 10 pitches waiting. Wait for replies before sending more.');
  });
});

describe('list_pitch_playlists', () => {
  it('shows what each playlist costs in credits', async () => {
    answer({ 'GET /api/pitching/playlists': { status: 200, body: { playlists } } });

    const result = await tool('list_pitch_playlists').execute(ctx, {});

    expect(result.data).toEqual([
      expect.objectContaining({ id: 'pl-1', credits: 100 }),
      expect.objectContaining({ id: 'pl-2', credits: 0 }),
    ]);
  });
});
