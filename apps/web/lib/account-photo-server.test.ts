import { describe, expect, it, vi } from 'vitest';
import { fetchGooglePhoto, signFreshAccountPhotos } from './account-photo-server';
import { MAX_PROFILE_PHOTO_BYTES } from './profile-photo';

const URL_OK = 'https://lh3.googleusercontent.com/a/x=s512-c';

function respond(body: Uint8Array | null, init: { status?: number; type?: string; length?: number } = {}) {
  const headers = new Headers();
  if (init.type) headers.set('content-type', init.type);
  if (init.length !== undefined) headers.set('content-length', String(init.length));
  return new Response(body as BodyInit | null, { status: init.status ?? 200, headers });
}

describe('fetchGooglePhoto', () => {
  it('never fetches a url outside the allowlist', async () => {
    const fetchImpl = vi.fn();
    expect(await fetchGooglePhoto('https://169.254.169.254/latest', fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not follow redirects', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(null, { status: 302 }));
    expect(await fetchGooglePhoto(URL_OK, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a type that is not a photo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(new Uint8Array([1, 2]), { type: 'text/html' }));
    expect(await fetchGooglePhoto(URL_OK, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('refuses a body over the cap, declared or streamed', async () => {
    const declared = vi.fn().mockResolvedValue(
      respond(new Uint8Array([1]), { type: 'image/jpeg', length: MAX_PROFILE_PHOTO_BYTES + 1 })
    );
    expect(await fetchGooglePhoto(URL_OK, declared as unknown as typeof fetch)).toBeNull();
    const streamed = vi.fn().mockResolvedValue(
      respond(new Uint8Array(MAX_PROFILE_PHOTO_BYTES + 10), { type: 'image/jpeg' })
    );
    expect(await fetchGooglePhoto(URL_OK, streamed as unknown as typeof fetch)).toBeNull();
  });

  it('returns the bytes and type of a good photo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond(new Uint8Array([9, 8, 7]), { type: 'image/jpeg; q=1' }));
    const result = await fetchGooglePhoto(URL_OK, fetchImpl as unknown as typeof fetch);
    expect(result?.contentType).toBe('image/jpeg');
    expect(Array.from(result?.bytes ?? [])).toEqual([9, 8, 7]);
  });

  it('answers null when the request throws (timeout, network)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('aborted'));
    expect(await fetchGooglePhoto(URL_OK, fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});

describe('signFreshAccountPhotos', () => {
  const U1 = '11111111-1111-4111-8111-111111111111';
  const U2 = '22222222-2222-4222-8222-222222222222';
  const p1 = `account/${U1}/photo/a.jpg`;
  const p2 = `account/${U2}/photo/b.jpg`;

  function fakeAdmin(existing: Set<string>) {
    const calls: string[][] = [];
    const admin = {
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => {
            calls.push(paths);
            return {
              data: paths.map((path) =>
                existing.has(path)
                  ? { path, signedUrl: `https://signed/${path}`, error: null }
                  : { path, signedUrl: '', error: 'Object not found' }
              ),
              error: null,
            };
          },
        }),
      },
    };
    return { admin: admin as unknown as Parameters<typeof signFreshAccountPhotos>[0], calls };
  }

  it('signs every teammate in one uncached call, thumb first, full photo when there is no thumb', async () => {
    const { admin, calls } = fakeAdmin(new Set([`${p1}.thumb`, p1, p2]));
    const urls = await signFreshAccountPhotos(admin, [
      { key: U1, path: p1 },
      { key: U2, path: p2 },
    ]);
    expect(calls).toHaveLength(1);
    expect(urls.get(U1)).toBe(`https://signed/${p1}.thumb`);
    expect(urls.get(U2)).toBe(`https://signed/${p2}`);
  });

  it('leaves out a photo that cannot be signed, and makes no call for nobody', async () => {
    const { admin, calls } = fakeAdmin(new Set());
    expect((await signFreshAccountPhotos(admin, [{ key: U1, path: p1 }])).size).toBe(0);
    const empty = fakeAdmin(new Set());
    expect((await signFreshAccountPhotos(empty.admin, [])).size).toBe(0);
    expect(empty.calls).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });
});
