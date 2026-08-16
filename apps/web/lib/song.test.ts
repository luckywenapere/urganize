import { describe, expect, it, vi } from 'vitest';
import { ASSET_MIME_ALLOWLIST, ASSET_SIZE_LIMITS } from './asset-constants';
import {
  SONG_CATEGORY,
  SONG_FILE_ACCEPT,
  SONG_MAX_BYTES,
  SONG_MIME_TYPES,
  uploadSong,
  validateSongFile,
} from './song';

const MIB = 1024 * 1024;

describe('song constants', () => {
  /**
   * The point of this one: the song surface must never grow its own idea of
   * what fits or what plays. Both numbers are the shared asset rules, which is
   * also what the SERVER validates against — a local copy here would let the
   * client cheerfully accept a file the API then rejects.
   */
  it('derives its limits from the shared asset rules', () => {
    expect(SONG_CATEGORY).toBe('audio');
    expect(SONG_MAX_BYTES).toBe(ASSET_SIZE_LIMITS.audio);
    expect(SONG_MIME_TYPES).toEqual(ASSET_MIME_ALLOWLIST.audio);
  });

  /** The picker must only offer what validation will accept. */
  it('accepts exactly the MIME types it allows', () => {
    expect(SONG_FILE_ACCEPT.split(',')).toEqual([...SONG_MIME_TYPES]);
  });
});

describe('validateSongFile', () => {
  const wav = { name: 'master.wav', type: 'audio/wav', size: 8 * MIB };

  it('accepts an ordinary master', () => {
    expect(validateSongFile(wav)).toEqual({ ok: true });
  });

  it('accepts every allowed format', () => {
    for (const type of SONG_MIME_TYPES) {
      expect(validateSongFile({ ...wav, type }).ok, type).toBe(true);
    }
  });

  it('rejects a file that is not audio', () => {
    const result = validateSongFile({ name: 'artwork.png', type: 'image/png', size: 2 * MIB });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/WAV, MP3 or FLAC/);
  });

  it('rejects a file with no detected type rather than guessing', () => {
    expect(validateSongFile({ ...wav, type: '' }).ok).toBe(false);
  });

  it('rejects an oversized master and says how to fix it', () => {
    const result = validateSongFile({ ...wav, size: SONG_MAX_BYTES + 1 });
    expect(result.ok).toBe(false);
    // The ceiling is storage headroom, not a plan limit, so the advice has to
    // be "compress it" rather than "upgrade".
    if (!result.ok) expect(result.error).toMatch(/MP3/);
  });

  it('accepts a file exactly at the ceiling', () => {
    expect(validateSongFile({ ...wav, size: SONG_MAX_BYTES }).ok).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(validateSongFile({ ...wav, size: 0 }).ok).toBe(false);
  });
});

// A File stand-in: uploadSong only ever reads name/type/size and passes the
// value straight to fetch as a body, so this is enough and avoids needing a
// DOM.
function fakeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}): File {
  return {
    name: 'master.wav',
    type: 'audio/wav',
    size: 4 * MIB,
    ...overrides,
  } as File;
}

const song = {
  id: 'song-1',
  releaseId: 'rel-1',
  fileName: 'master.wav',
  fileSize: 4 * MIB,
  mimeType: 'audio/wav',
  storagePath: 'rel-1/audio/uuid-master.wav',
  uploadedAt: '2026-08-16T10:00:00Z',
  downloadUrl: 'https://storage.example/signed',
};

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe('uploadSong', () => {
  it('runs the three steps in order and returns the recorded song', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/song/upload-url')) {
        return jsonResponse({ upload_url: 'https://storage.example/put', storage_path: song.storagePath });
      }
      if (url === 'https://storage.example/put') return jsonResponse({});
      return jsonResponse({ song });
    }) as unknown as typeof fetch;

    const result = await uploadSong({
      releaseId: 'rel-1',
      file: fakeFile(),
      token: 'tok',
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, song });
    expect(calls).toEqual([
      '/api/releases/rel-1/song/upload-url',
      'https://storage.example/put',
      '/api/releases/rel-1/song',
    ]);
  });

  it('stops at step 1 and relays the server error verbatim', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'Release not found.' }, false, 404)
    ) as unknown as typeof fetch;

    const result = await uploadSong({
      releaseId: 'rel-1',
      file: fakeFile(),
      token: 'tok',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: false,
      step: 1,
      error: 'Release not found.',
      retryable: false,
    });
    // A refused upload-url must not be followed by a PUT.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  /**
   * The retry distinction this whole outcome shape exists for: the bytes did
   * not land, so re-running from step 1 with the same file is the right offer.
   */
  it('marks a failed storage PUT retryable', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/song/upload-url')) {
        return jsonResponse({ upload_url: 'https://storage.example/put', storage_path: 'p' });
      }
      return jsonResponse({}, false, 503);
    }) as unknown as typeof fetch;

    const result = await uploadSong({
      releaseId: 'rel-1',
      file: fakeFile(),
      token: 'tok',
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe(2);
      expect(result.retryable).toBe(true);
    }
  });

  /** The bytes are already up by step 3, so one flaky write must not waste them. */
  it('retries the record call once before giving up', async () => {
    let recordAttempts = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/song/upload-url')) {
        return jsonResponse({ upload_url: 'https://storage.example/put', storage_path: 'p' });
      }
      if (url === 'https://storage.example/put') return jsonResponse({});
      recordAttempts += 1;
      if (recordAttempts === 1) return jsonResponse({ error: 'timeout' }, false, 500);
      return jsonResponse({ song });
    }) as unknown as typeof fetch;

    vi.useFakeTimers();
    const pending = uploadSong({ releaseId: 'rel-1', file: fakeFile(), token: 'tok', fetchImpl });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(recordAttempts).toBe(2);
    expect(result).toEqual({ ok: true, song });
  });

  it('gives up after the second record failure and is not retryable', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/song/upload-url')) {
        return jsonResponse({ upload_url: 'https://storage.example/put', storage_path: 'p' });
      }
      if (url === 'https://storage.example/put') return jsonResponse({});
      return jsonResponse({ error: 'Could not save the song.' }, false, 500);
    }) as unknown as typeof fetch;

    vi.useFakeTimers();
    const pending = uploadSong({ releaseId: 'rel-1', file: fakeFile(), token: 'tok', fetchImpl });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe(3);
      // The server cleans up the orphaned object itself, so there is nothing
      // for a Retry button to resume — the user starts over.
      expect(result.retryable).toBe(false);
    }
  });

  it('falls back to a generic content type when the browser reports none', async () => {
    let sentMime = '';
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/song/upload-url')) {
        sentMime = JSON.parse(String(init?.body)).mime_type;
        return jsonResponse({ error: 'nope' }, false, 400);
      }
      return jsonResponse({});
    }) as unknown as typeof fetch;

    await uploadSong({
      releaseId: 'rel-1',
      file: fakeFile({ type: '' }),
      token: 'tok',
      fetchImpl,
    });

    // Never an empty string: the server requires a mime_type, and letting it
    // 400 on a blank one would report as a validation bug rather than the
    // unsupported-format it actually is.
    expect(sentMime).toBe('application/octet-stream');
  });
});
