import { describe, expect, it } from 'vitest';
import { findArtistFromLink, openShortLink } from './artist-link-server';

type Reply = { status?: number; location?: string; body?: unknown; text?: string } | 'down';

/** A stand-in for fetch: each address answers with its reply; every call is recorded. */
function fakeFetch(replies: Record<string, Reply>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const reply = replies[url];
    if (reply === undefined || reply === 'down') throw new Error('network down');
    const headers = new Headers();
    if (reply.location) headers.set('location', reply.location);
    const body = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return new Response(body, { status: reply.status ?? 200, headers });
  }) as typeof fetch;
  return { impl, calls };
}

const SHORT = 'https://link.deezer.com/s/30ZbS1Ld8c';

describe('openShortLink', () => {
  it('follows Deezer redirects to the page they open', async () => {
    const { impl } = fakeFetch({
      [SHORT]: { status: 302, location: 'https://www.deezer.com/en/artist/27?host=0&deferredFl=1' },
    });
    expect(await openShortLink(SHORT, impl)).toEqual({ kind: 'artist', provider: 'deezer', id: '27', country: null });
  });

  it('follows a relative redirect and a second Deezer hop', async () => {
    const { impl } = fakeFetch({
      [SHORT]: { status: 301, location: '/s/next' },
      'https://link.deezer.com/s/next': { status: 302, location: 'https://www.deezer.com/track/3135556' },
    });
    expect(await openShortLink(SHORT, impl)).toEqual({ kind: 'not-artist', what: 'song' });
  });

  it('never follows a redirect off Deezer', async () => {
    const { impl, calls } = fakeFetch({
      [SHORT]: { status: 302, location: 'https://evil.example/artist/27' },
    });
    expect(await openShortLink(SHORT, impl)).toEqual({ kind: 'broken' });
    expect(calls).toEqual([SHORT]);
  });

  it('reads the page address when the share link answers with a page', async () => {
    const { impl } = fakeFetch({
      [SHORT]: { text: '<html><head><meta property="og:url" content="https://www.deezer.com/artist/27"></head></html>' },
    });
    expect(await openShortLink(SHORT, impl)).toMatchObject({ kind: 'artist', id: '27' });
  });

  it('gives up after a few hops', async () => {
    const { impl } = fakeFetch({
      [SHORT]: { status: 302, location: 'https://link.deezer.com/s/a' },
      'https://link.deezer.com/s/a': { status: 302, location: 'https://link.deezer.com/s/b' },
      'https://link.deezer.com/s/b': { status: 302, location: 'https://link.deezer.com/s/c' },
      'https://link.deezer.com/s/c': { status: 302, location: 'https://link.deezer.com/s/d' },
      'https://link.deezer.com/s/d': { status: 302, location: 'https://www.deezer.com/artist/27' },
    });
    expect(await openShortLink(SHORT, impl)).toEqual({ kind: 'broken' });
  });

  it('says so when Deezer cannot be reached', async () => {
    const { impl } = fakeFetch({ [SHORT]: 'down' });
    expect(await openShortLink(SHORT, impl)).toBeNull();
  });
});

describe('findArtistFromLink', () => {
  it('reads a Deezer artist by id', async () => {
    const { impl } = fakeFetch({
      'https://api.deezer.com/artist/27': {
        body: { id: 27, name: 'Dorian', picture_medium: 'https://e-cdns-images.dzcdn.net/images/artist/abc/250x250.jpg', nb_fan: 12400 },
      },
    });
    expect(await findArtistFromLink('https://www.deezer.com/en/artist/27', impl)).toEqual({
      ok: true,
      candidate: {
        provider: 'deezer',
        id: '27',
        name: 'Dorian',
        imageUrl: 'https://e-cdns-images.dzcdn.net/images/artist/abc/250x250.jpg',
        followers: 12400,
        genre: null,
      },
    });
  });

  it('opens a Deezer share link, then reads the artist', async () => {
    const { impl } = fakeFetch({
      [SHORT]: { status: 302, location: 'https://www.deezer.com/artist/27' },
      'https://api.deezer.com/artist/27': { body: { id: 27, name: 'Dorian', nb_fan: 5 } },
    });
    expect(await findArtistFromLink(`Dorian on Deezer ${SHORT}`, impl)).toMatchObject({ ok: true, candidate: { id: '27', name: 'Dorian' } });
  });

  it('says the link opened nothing when Deezer has no such artist', async () => {
    const { impl } = fakeFetch({
      'https://api.deezer.com/artist/999': { body: { error: { type: 'DataException', message: 'no data', code: 800 } } },
    });
    expect(await findArtistFromLink('https://www.deezer.com/artist/999', impl)).toEqual({
      ok: false,
      status: 422,
      message: "That link didn't open an artist. Check it and try again.",
    });
  });

  it('says to try again when Deezer answers with an error that is not "no data"', async () => {
    const { impl } = fakeFetch({
      'https://api.deezer.com/artist/27': { body: { error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } } },
    });
    expect(await findArtistFromLink('https://www.deezer.com/artist/27', impl)).toEqual({
      ok: false,
      status: 502,
      message: 'Could not reach the music service. Try again.',
    });
  });

  it('says the service is down when it does not answer', async () => {
    const { impl } = fakeFetch({ 'https://api.deezer.com/artist/27': 'down' });
    expect(await findArtistFromLink('https://www.deezer.com/artist/27', impl)).toEqual({
      ok: false,
      status: 502,
      message: 'Could not reach the music service. Try again.',
    });
  });

  it('reads an Apple Music artist', async () => {
    const { impl } = fakeFetch({
      'https://itunes.apple.com/lookup?id=1029395036': {
        body: {
          resultCount: 1,
          results: [{ wrapperType: 'artist', artistName: 'Burna Boy', artistId: 1029395036, primaryGenreName: 'Afrobeats' }],
        },
      },
    });
    expect(await findArtistFromLink('https://music.apple.com/ng/artist/burna-boy/1029395036', impl)).toEqual({
      ok: true,
      candidate: { provider: 'itunes', id: '1029395036', name: 'Burna Boy', imageUrl: null, followers: null, genre: 'Afrobeats' },
    });
  });

  it("tries the link's own store when Apple's default store has nothing", async () => {
    const { impl, calls } = fakeFetch({
      'https://itunes.apple.com/lookup?id=1544': { body: { resultCount: 0, results: [] } },
      'https://itunes.apple.com/lookup?id=1544&country=ng': {
        body: { resultCount: 1, results: [{ wrapperType: 'artist', artistName: 'Dorian', artistId: 1544 }] },
      },
    });
    expect(await findArtistFromLink('https://music.apple.com/ng/artist/dorian/1544', impl)).toMatchObject({ ok: true, candidate: { name: 'Dorian' } });
    expect(calls).toHaveLength(2);
  });

  it('does not take an album or song id as the artist', async () => {
    const { impl } = fakeFetch({
      'https://itunes.apple.com/lookup?id=1621934003': {
        body: { resultCount: 1, results: [{ wrapperType: 'collection', artistName: 'Burna Boy', artistId: 1029395036 }] },
      },
    });
    expect(await findArtistFromLink('https://music.apple.com/us/artist/x/1621934003', impl)).toMatchObject({ ok: false, status: 422 });
  });

  it('answers a link it cannot read without calling anyone', async () => {
    const { impl, calls } = fakeFetch({});
    expect(await findArtistFromLink('https://open.spotify.com/artist/3wcj11K77LjEY1PkEazffa', impl)).toEqual({
      ok: false,
      status: 422,
      message: "We can't read Spotify links. Paste their Apple Music or Deezer link.",
    });
    expect(await findArtistFromLink('https://www.deezer.com/track/1', impl)).toMatchObject({ ok: false, status: 422 });
    expect(calls).toEqual([]);
  });
});
