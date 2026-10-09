/* eslint-disable @typescript-eslint/no-explicit-any -- The in-memory database stands in for Supabase rows, whose shape is whatever each test needs. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const generate = vi.fn();
let aiConfigured = true;

vi.mock('@/lib/ai/routed', () => ({
  generateRoutedStructuredOutput: (...args: unknown[]) => generate(...args),
}));
vi.mock('@/lib/ai/provider', () => ({ isAiConfigured: () => aiConfigured }));
vi.mock('@/lib/release-epk-server', () => ({
  loadPitchKit: vi.fn(async () => ({
    pitchKit: {
      release: {
        id: 'rel-1',
        ownerUserId: 'owner-1',
        title: 'Lagos Nights',
        artistId: 'artist-1',
        artistName: 'Dorian',
        releaseDate: '2026-12-31',
      },
      kit: { descriptor: 'Afrobeats singer', shortBio: 'From Lagos.' },
      fields: { story: 'A night drive.', storySource: 'user', credits: null },
      credits: [{ name: 'Tunde', role: 'producer' }],
    },
  })),
}));

import { releaseDraftSpotifyPitchAction } from './release-draft-spotify-pitch';

type Row = Record<string, any>;

/** A tiny stand-in: select / eq / maybeSingle and update, per table. */
function makeAdmin(db: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Row | null = null;
      const matching = () => (db[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const chain: Record<string, any> = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return chain;
        },
        update: (next: Row) => {
          patch = next;
          return chain;
        },
        maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          const rows = matching();
          if (patch) for (const row of rows) Object.assign(row, patch);
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const pitchTask = (fields: Record<string, string> = {}, over: Row = {}): Row => ({
  id: 'task-1',
  release_id: 'rel-1',
  metadata: {
    template: { template_id: 'single_v0.3', task_id: 'editorial_pitch' },
    editorial_pitch: { fields },
  },
  ...over,
});

function makeDb(task: Row = pitchTask()) {
  return {
    tasks: [task],
    release_metadata: [{ release_id: 'rel-1', genre: 'Afrobeats', subgenre: '', language: 'English' }],
    releases: [{ id: 'rel-1', release_type: 'single', description: 'A warm one.' }],
  };
}

const run = (admin: SupabaseClient, input: unknown = { taskId: 'task-1' }) =>
  releaseDraftSpotifyPitchAction.execute({
    admin,
    objectId: 'rel-1',
    actor: { id: 'user-1' },
    ownerUserId: 'owner-1',
    workspaceId: 'ws-1',
    tier: 'manager',
    input: input as { taskId?: string },
  });

beforeEach(() => {
  generate.mockReset();
  aiConfigured = true;
});

describe('release.draft_spotify_pitch', () => {
  it('is a one-shot team action', () => {
    expect(releaseDraftSpotifyPitchAction.oneShot).toBe(true);
    expect(releaseDraftSpotifyPitchAction.access).toBe('team_write');
    expect(releaseDraftSpotifyPitchAction.objectTypes).toEqual(['release']);
    expect(releaseDraftSpotifyPitchAction.apply).toBeUndefined();
  });

  it('says so when no model is configured, and calls nothing', async () => {
    aiConfigured = false;
    const result = await run(makeAdmin(makeDb()));
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(generate).not.toHaveBeenCalled();
  });

  it('refuses without a task id', async () => {
    expect(await run(makeAdmin(makeDb()), {})).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a task from another rollout the same way as one that does not exist', async () => {
    const other = makeDb(pitchTask({}, { release_id: 'rel-2' }));
    expect(await run(makeAdmin(other))).toMatchObject({ ok: false, status: 404 });
    expect(await run(makeAdmin(makeDb()), { taskId: 'nope' })).toMatchObject({ ok: false, status: 404 });
  });

  it('refuses a task that is not the Spotify pitch', async () => {
    const task = pitchTask();
    task.metadata = { template: { template_id: 'single_v0.3', task_id: 'w6_announce' } };
    expect(await run(makeAdmin(makeDb(task)))).toMatchObject({ ok: false, status: 404 });
  });

  it('says there is nothing to do when every field is already filled', async () => {
    const full = pitchTask({ genre: 'a', moods: 'b', instruments: 'c', description: 'd' });
    expect(await run(makeAdmin(makeDb(full)))).toMatchObject({ ok: false, status: 400 });
    expect(generate).not.toHaveBeenCalled();
  });

  it('asks for only the empty fields and fills only those', async () => {
    const data = makeDb(pitchTask({ genre: 'Afrobeats' }));
    generate.mockImplementation(async (params: { parse: (raw: string) => unknown; messages: any[] }) => {
      expect(params.messages[1].content).not.toContain('"genre"');
      return params.parse(
        JSON.stringify({ genre: 'Pop', moods: 'warm', instruments: 'drums', description: 'A song.' })
      );
    });
    const result = await run(makeAdmin(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Genre was typed, so the model's "Pop" never replaces it.
    expect((result.output as any).fields).toEqual({
      genre: 'Afrobeats',
      moods: 'warm',
      instruments: 'drums',
      description: 'A song.',
    });
    expect((result.output as any).filled).toEqual(['moods', 'instruments', 'description']);
    expect(data.tasks[0].metadata.editorial_pitch.fields.genre).toBe('Afrobeats');
    expect(data.tasks[0].metadata.editorial_pitch.fields.moods).toBe('warm');
  });

  it('keeps what a person typed while the model was working', async () => {
    const data = makeDb(pitchTask({}));
    generate.mockImplementation(async (params: { parse: (raw: string) => unknown }) => {
      // The manager types a description while the call is in flight.
      data.tasks[0].metadata.editorial_pitch.fields = { description: 'My own words.' };
      return params.parse(
        JSON.stringify({ genre: 'Afrobeats', moods: 'warm', instruments: '', description: 'The model words.' })
      );
    });
    const result = await run(makeAdmin(data));
    expect(result.ok).toBe(true);
    const saved = data.tasks[0].metadata.editorial_pitch.fields;
    expect(saved.description).toBe('My own words.');
    expect(saved.genre).toBe('Afrobeats');
  });

  it('reports a failed model call and writes nothing', async () => {
    const data = makeDb(pitchTask({}));
    generate.mockRejectedValue(new Error('upstream'));
    const result = await run(makeAdmin(data));
    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(data.tasks[0].metadata.editorial_pitch.fields).toEqual({});
  });
});
