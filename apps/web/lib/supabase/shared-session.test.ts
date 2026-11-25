import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COOKIE_CHUNK_SIZE,
  MAX_COOKIE_CHUNKS,
  createSharedSessionStorage,
  decodeFromCookie,
  encodeForCookie,
  parseCookieHeader,
  pickNewer,
  readChunkedSession,
  sessionExpiry,
  sharedCookieDomainFor,
  splitIntoChunks,
} from './shared-session';

const KEY = 'sb-abcd-auth-token';
const session = (expires_at: number, extra = '') =>
  JSON.stringify({ access_token: `a${extra}`, refresh_token: 'r', expires_at, user: { id: 'u' } });

describe('sharedCookieDomainFor', () => {
  it('shares across the live addresses only', () => {
    expect(sharedCookieDomainFor('music.urganize.app')).toBe('.urganize.app');
    expect(sharedCookieDomainFor('team.urganize.app')).toBe('.urganize.app');
    expect(sharedCookieDomainFor('urganize.app')).toBe('.urganize.app');
    expect(sharedCookieDomainFor('localhost')).toBeNull();
    expect(sharedCookieDomainFor('urganize-git-x.vercel.app')).toBeNull();
    expect(sharedCookieDomainFor('evilurganize.app')).toBeNull();
    expect(sharedCookieDomainFor('urganize.app.evil.com')).toBeNull();
  });
});

describe('encoding and chunks', () => {
  it('round-trips text, including non-ASCII', () => {
    const text = JSON.stringify({ name: 'Adé Ọlá 🎵', n: 1 });
    expect(decodeFromCookie(encodeForCookie(text))).toBe(text);
  });
  it('is safe in a cookie value', () => {
    expect(encodeForCookie('{"a":"???>>>"}')).toMatch(/^[A-Za-z0-9_-]*$/);
  });
  it('returns null for junk', () => {
    expect(decodeFromCookie('***')).toBeNull();
  });
  it('splits at the chunk size and refuses what is too big', () => {
    expect(splitIntoChunks('')).toEqual([]);
    expect(splitIntoChunks('x'.repeat(COOKIE_CHUNK_SIZE))).toHaveLength(1);
    expect(splitIntoChunks('x'.repeat(COOKIE_CHUNK_SIZE + 1))).toHaveLength(2);
    expect(splitIntoChunks('x'.repeat(COOKIE_CHUNK_SIZE * MAX_COOKIE_CHUNKS))).toHaveLength(MAX_COOKIE_CHUNKS);
    expect(splitIntoChunks('x'.repeat(COOKIE_CHUNK_SIZE * MAX_COOKIE_CHUNKS + 1))).toBeNull();
  });
  it('reads pieces back in order and stops at a gap', () => {
    const enc = encodeForCookie(session(5, 'x'.repeat(4000)));
    const pieces = splitIntoChunks(enc) as string[];
    const cookies = parseCookieHeader(pieces.map((p, i) => `${KEY}.${i}=${p}`).join('; ') + '; other=1');
    expect(readChunkedSession(cookies, KEY)).toBe(session(5, 'x'.repeat(4000)));
    expect(readChunkedSession({ [`${KEY}.1`]: pieces[1] }, KEY)).toBeNull();
  });
});

describe('pickNewer', () => {
  it('prefers the copy that lasts longer', () => {
    expect(pickNewer(session(100), session(200))).toEqual({ value: session(200), source: 'shared' });
    expect(pickNewer(session(300), session(200))).toEqual({ value: session(300), source: 'local' });
  });
  it('keeps this address on a tie', () => {
    expect(pickNewer(session(100), session(100))?.source).toBe('local');
  });
  it('falls back when one copy is missing or unreadable', () => {
    expect(pickNewer(null, session(1))?.source).toBe('shared');
    expect(pickNewer(session(1), null)?.source).toBe('local');
    expect(pickNewer('{nope', session(1))?.source).toBe('shared');
    expect(pickNewer(session(1), '{nope')?.source).toBe('local');
    expect(pickNewer(null, null)).toBeNull();
    expect(pickNewer('{nope', '{nope')).toBeNull();
  });
  it('reads expiry safely', () => {
    expect(sessionExpiry(session(42))).toBe(42);
    expect(sessionExpiry('{}')).toBe(0);
    expect(sessionExpiry(null)).toBe(0);
  });
});

/** A fake browser where several "addresses" share one cookie jar. */
function browser(host: string, jar: Map<string, string>, local: Map<string, string>) {
  const doc = {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(line: string) {
      const [pair, ...attrs] = line.split(';').map((s) => s.trim());
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (attrs.includes('Max-Age=0')) jar.delete(name);
      else jar.set(name, value);
    },
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', {
    location: { hostname: host, protocol: 'https:' },
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
      removeItem: (k: string) => void local.delete(k),
    },
  });
}

describe('createSharedSessionStorage', () => {
  let jar: Map<string, string>;
  const musicLocal = new Map<string, string>();
  const teamLocal = new Map<string, string>();
  beforeEach(() => {
    jar = new Map();
    musicLocal.clear();
    teamLocal.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs in once and the other address picks it up', async () => {
    browser('team.urganize.app', jar, teamLocal);
    await createSharedSessionStorage(KEY).setItem(KEY, session(500));
    browser('music.urganize.app', jar, musicLocal);
    const music = createSharedSessionStorage(KEY);
    expect(await music.getItem(KEY)).toBe(session(500));
    expect(musicLocal.get(KEY)).toBe(session(500));
  });

  it('keeps one lineage: the address that refreshed last wins on the other', async () => {
    browser('team.urganize.app', jar, teamLocal);
    const team = createSharedSessionStorage(KEY);
    await team.setItem(KEY, session(500));
    browser('music.urganize.app', jar, musicLocal);
    const music = createSharedSessionStorage(KEY);
    await music.getItem(KEY);
    await music.setItem(KEY, session(900));
    browser('team.urganize.app', jar, teamLocal);
    expect(await team.getItem(KEY)).toBe(session(900));
  });

  it('does not sign anyone out: an existing local session is kept when there is no cookie', async () => {
    browser('music.urganize.app', jar, musicLocal);
    musicLocal.set(KEY, session(700));
    expect(await createSharedSessionStorage(KEY).getItem(KEY)).toBe(session(700));
  });

  it('sign-out clears both copies', async () => {
    browser('team.urganize.app', jar, teamLocal);
    const team = createSharedSessionStorage(KEY);
    await team.setItem(KEY, session(500));
    await team.removeItem(KEY);
    expect(await team.getItem(KEY)).toBeNull();
    expect(jar.size).toBe(0);
  });

  it('shrinking the session removes the leftover pieces', async () => {
    browser('team.urganize.app', jar, teamLocal);
    const team = createSharedSessionStorage(KEY);
    await team.setItem(KEY, session(500, 'x'.repeat(4000)));
    expect(jar.size).toBe(2);
    await team.setItem(KEY, session(501));
    expect(jar.size).toBe(1);
  });

  it('too big to share: keeps local, drops a stale shared copy', async () => {
    browser('team.urganize.app', jar, teamLocal);
    const team = createSharedSessionStorage(KEY);
    await team.setItem(KEY, session(500));
    await team.setItem(KEY, session(600, 'x'.repeat(20000)));
    expect(jar.size).toBe(0);
    expect(await team.getItem(KEY)).toBe(session(600, 'x'.repeat(20000)));
  });

  it('other keys are plain localStorage', async () => {
    browser('team.urganize.app', jar, teamLocal);
    const team = createSharedSessionStorage(KEY);
    await team.setItem(`${KEY}-code-verifier`, 'v');
    expect(jar.size).toBe(0);
    expect(await team.getItem(`${KEY}-code-verifier`)).toBe('v');
  });

  it('is plain localStorage off the live addresses', async () => {
    browser('localhost', jar, teamLocal);
    await createSharedSessionStorage(KEY).setItem(KEY, session(500));
    expect(jar.size).toBe(0);
    expect(teamLocal.get(KEY)).toBe(session(500));
  });

  it('never throws when storage and cookies are blocked', async () => {
    vi.stubGlobal('window', {
      location: { hostname: 'team.urganize.app', protocol: 'https:' },
      get localStorage(): never {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal('document', {
      get cookie(): string {
        throw new Error('blocked');
      },
      set cookie(_value: string) {
        throw new Error('blocked');
      },
    });
    const s = createSharedSessionStorage(KEY);
    expect(await s.getItem(KEY)).toBeNull();
    await expect(Promise.resolve(s.setItem(KEY, session(1)))).resolves.toBeUndefined();
    await expect(Promise.resolve(s.removeItem(KEY))).resolves.toBeUndefined();
  });
});
