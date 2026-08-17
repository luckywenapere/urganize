import { describe, expect, it, vi } from 'vitest';
import { ASSET_MIME_ALLOWLIST, ASSET_SIZE_LIMITS } from './asset-constants';
import {
  COVER_ART_CATEGORY,
  COVER_ART_FILE_ACCEPT,
  COVER_ART_MAX_BYTES,
  COVER_ART_MIME_TYPES,
  uploadCoverArt,
  validateCoverArtFile,
} from './cover-art-upload';

const MIB = 1024 * 1024;

describe('cover art constants', () => {
  /** The cover art surface must never grow its own idea of what fits — both
   * numbers come from the shared asset rules, which is also what the SERVER
   * validates against. */
  it('derives its limits from the shared asset rules', () => {
    expect(COVER_ART_CATEGORY).toBe('cover_art');
    expect(COVER_ART_MAX_BYTES).toBe(ASSET_SIZE_LIMITS.cover_art);
    expect(COVER_ART_MIME_TYPES).toEqual(ASSET_MIME_ALLOWLIST.cover_art);
  });

  it('accepts exactly the MIME types it allows', () => {
    expect(COVER_ART_FILE_ACCEPT.split(',')).toEqual([...COVER_ART_MIME_TYPES]);
  });
});

describe('validateCoverArtFile', () => {
  const png = { name: 'cover.png', type: 'image/png', size: 2 * MIB };

  it('accepts an ordinary image', () => {
    expect(validateCoverArtFile(png)).toEqual({ ok: true });
  });

  it('accepts every allowed format', () => {
    for (const type of COVER_ART_MIME_TYPES) {
      expect(validateCoverArtFile({ ...png, type }).ok, type).toBe(true);
    }
  });

  it('rejects a file that is not an image', () => {
    const result = validateCoverArtFile({ name: 'master.wav', type: 'audio/wav', size: 2 * MIB });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JPEG, PNG or WebP/);
  });

  it('rejects a file with no detected type rather than guessing', () => {
    expect(validateCoverArtFile({ ...png, type: '' }).ok).toBe(false);
  });

  it('rejects an oversized image', () => {
    const result = validateCoverArtFile({ ...png, size: COVER_ART_MAX_BYTES + 1 });
    expect(result.ok).toBe(false);
  });

  it('accepts a file exactly at the ceiling', () => {
    expect(validateCoverArtFile({ ...png, size: COVER_ART_MAX_BYTES }).ok).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(validateCoverArtFile({ ...png, size: 0 }).ok).toBe(false);
  });
});

function fakeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}): File {
  return {
    name: 'cover.png',
    type: 'image/png',
    size: 1 * MIB,
    ...overrides,
  } as File;
}

const coverArt = {
  id: 'cover-1',
  releaseId: 'rel-1',
  fileName: 'cover.png',
  fileSize: 1 * MIB,
  mimeType: 'image/png',
  storagePath: 'rel-1/cover_art/uuid-cover.png',
  uploadedAt: '2026-08-17T10:00:00Z',
  downloadUrl: 'https://storage.example/signed',
};

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe('uploadCoverArt', () => {
  it('runs the three steps in order and returns the recorded cover art', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/cover-art/upload-url')) {
        return jsonResponse({
          upload_url: 'https://storage.example/put',
          storage_path: coverArt.storagePath,
        });
      }
      if (url === 'https://storage.example/put') return jsonResponse({});
      return jsonResponse({ coverArt });
    }) as unknown as typeof fetch;

    const result = await uploadCoverArt({
      releaseId: 'rel-1',
      file: fakeFile(),
      token: 'tok',
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, coverArt });
    expect(calls).toEqual([
      '/api/releases/rel-1/cover-art/upload-url',
      'https://storage.example/put',
      '/api/releases/rel-1/cover-art',
    ]);
  });

  it('stops at step 1 and relays the server error verbatim', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'Release not found.' }, false, 404)
    ) as unknown as typeof fetch;

    const result = await uploadCoverArt({
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('marks a failed storage PUT retryable', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/cover-art/upload-url')) {
        return jsonResponse({ upload_url: 'https://storage.example/put', storage_path: 'p' });
      }
      return jsonResponse({}, false, 503);
    }) as unknown as typeof fetch;

    const result = await uploadCoverArt({
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

  it('retries the record call once before giving up', async () => {
    let recordAttempts = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/cover-art/upload-url')) {
        return jsonResponse({ upload_url: 'https://storage.example/put', storage_path: 'p' });
      }
      if (url === 'https://storage.example/put') return jsonResponse({});
      recordAttempts += 1;
      if (recordAttempts === 1) return jsonResponse({ error: 'timeout' }, false, 500);
      return jsonResponse({ coverArt });
    }) as unknown as typeof fetch;

    vi.useFakeTimers();
    const pending = uploadCoverArt({ releaseId: 'rel-1', file: fakeFile(), token: 'tok', fetchImpl });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(recordAttempts).toBe(2);
    expect(result).toEqual({ ok: true, coverArt });
  });

  it('gives up after the second record failure and is not retryable', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/cover-art/upload-url')) {
        return jsonResponse({ upload_url: 'https://storage.example/put', storage_path: 'p' });
      }
      if (url === 'https://storage.example/put') return jsonResponse({});
      return jsonResponse({ error: 'Could not save the cover art.' }, false, 500);
    }) as unknown as typeof fetch;

    vi.useFakeTimers();
    const pending = uploadCoverArt({ releaseId: 'rel-1', file: fakeFile(), token: 'tok', fetchImpl });
    await vi.runAllTimersAsync();
    const result = await pending;
    vi.useRealTimers();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe(3);
      expect(result.retryable).toBe(false);
    }
  });
});
