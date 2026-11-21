import { describe, expect, it, vi } from 'vitest';
import { uploadMusic } from './upload';

// A plain object with the three fields the code reads. A real Blob's type and
// size are read-only, and the mocked fetch never looks at the body.
const file = (over: Partial<{ name: string; type: string; size: number }> = {}) =>
  ({
    name: over.name ?? 'lagos.mp3',
    type: over.type ?? 'audio/mpeg',
    size: over.size ?? 10,
  }) as unknown as Parameters<typeof uploadMusic>[0]['file'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TRACK = { id: 't1', title: 'Lagos', status: 'draft' };

describe('uploadMusic', () => {
  it('signs, uploads and records, in that order', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      if (url.endsWith('/music/upload-url')) {
        return json({ upload_url: 'https://storage.example/put', storage_path: 'music/r1/abc-lagos.mp3' });
      }
      if (url === 'https://storage.example/put') return new Response(null, { status: 200 });
      return json({ track: TRACK }, 201);
    }) as unknown as typeof fetch;

    const result = await uploadMusic({ releaseId: 'r1', file: file(), token: 'tok', durationSeconds: 188, fetchImpl });

    expect(result).toEqual({ ok: true, track: TRACK });
    expect(calls).toEqual([
      'POST /api/releases/r1/music/upload-url',
      'PUT https://storage.example/put',
      'POST /api/releases/r1/music',
    ]);
  });

  it('stops before anything moves when the file is the wrong kind', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await uploadMusic({
      releaseId: 'r1',
      file: file({ name: 'a.flac', type: 'audio/flac' }),
      token: 'tok',
      fetchImpl,
    });
    expect(result).toMatchObject({ ok: false, step: 0, retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not retry a refused signing request', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'Not found.' }, 404)) as unknown as typeof fetch;
    const result = await uploadMusic({ releaseId: 'r1', file: file(), token: 'tok', fetchImpl });
    expect(result).toMatchObject({ ok: false, step: 1, error: 'Not found.', retryable: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('says the upload can be tried again when storage refuses the file', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/upload-url')
        ? json({ upload_url: 'https://storage.example/put', storage_path: 'music/r1/a.mp3' })
        : new Response(null, { status: 403 })
    ) as unknown as typeof fetch;
    const result = await uploadMusic({ releaseId: 'r1', file: file(), token: 'tok', fetchImpl });
    expect(result).toMatchObject({ ok: false, step: 2, retryable: true });
  });

  it('records a second time when the first record call fails', async () => {
    vi.useFakeTimers();
    let records = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/upload-url')) {
        return json({ upload_url: 'https://storage.example/put', storage_path: 'music/r1/a.mp3' });
      }
      if (url === 'https://storage.example/put') return new Response(null, { status: 200 });
      records += 1;
      return records === 1 ? json({ error: 'Busy.' }, 500) : json({ track: TRACK }, 201);
    }) as unknown as typeof fetch;

    const pending = uploadMusic({ releaseId: 'r1', file: file(), token: 'tok', fetchImpl });
    await vi.advanceTimersByTimeAsync(1100);
    const result = await pending;
    vi.useRealTimers();

    expect(result).toEqual({ ok: true, track: TRACK });
    expect(records).toBe(2);
  });

  it('gives up with the server message after the retry also fails', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/upload-url')) {
        return json({ upload_url: 'https://storage.example/put', storage_path: 'music/r1/a.mp3' });
      }
      if (url === 'https://storage.example/put') return new Response(null, { status: 200 });
      return json({ error: 'The song uploaded but we could not save it. Try again.' }, 500);
    }) as unknown as typeof fetch;

    const pending = uploadMusic({ releaseId: 'r1', file: file(), token: 'tok', fetchImpl });
    await vi.advanceTimersByTimeAsync(1100);
    const result = await pending;
    vi.useRealTimers();

    expect(result).toMatchObject({ ok: false, step: 3, retryable: false });
  });

  it('asks the record route to swap a file when given a song to replace', async () => {
    let recordBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/upload-url')) {
        return json({ upload_url: 'https://storage.example/put', storage_path: 'music/r1/a.mp3' });
      }
      if (url === 'https://storage.example/put') return new Response(null, { status: 200 });
      recordBody = JSON.parse(String(init?.body));
      return json({ track: TRACK });
    }) as unknown as typeof fetch;

    await uploadMusic({ releaseId: 'r1', file: file(), token: 'tok', replaceTrackId: 'old-track', fetchImpl });
    expect(recordBody.replace_track_id).toBe('old-track');
  });
});
