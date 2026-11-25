/**
 * One sign-in for music.urganize.app and team.urganize.app (#1386).
 *
 * The browser keeps the Supabase session in localStorage, and localStorage is
 * per address, so someone signed in on team was a stranger on music. This keeps
 * a copy of the session in a cookie on `.urganize.app`, which both addresses
 * can read, and treats the NEWER of the two copies as the truth.
 *
 * Rules worth not undoing:
 * - localStorage stays. Everyone already signed in keeps their session; this
 *   only adds a second copy, so nothing here can sign anyone out.
 * - The newer copy wins (`pickNewer`, by `expires_at`). Supabase rotates the
 *   refresh token on every refresh, so if each address kept refreshing its own
 *   old copy, the second one to refresh would present a token already used and
 *   Supabase would end the whole session. Reading the newer copy first, and
 *   writing both, keeps one lineage.
 * - Only the session key is shared. Every other key stays in localStorage.
 * - Only on the live urganize.app addresses. On localhost and preview
 *   deployments there is no shared domain, so this is plain localStorage.
 * - Never throws. Blocked cookies or storage fall back to whatever still works.
 *
 * Pure helpers are exported so shared-session.test.ts can hold every rule.
 */

export const SHARED_COOKIE_ROOT = 'urganize.app';
/** Characters per cookie piece. A session is a few KB; browsers allow about 4096 per cookie. */
export const COOKIE_CHUNK_SIZE = 3000;
/** More than this and the cookie is skipped: a request header must stay small. */
export const MAX_COOKIE_CHUNKS = 4;
/** Long, so closing the browser does not sign anyone out. Supabase decides when the session really ends. */
export const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** `.urganize.app` on a live address, otherwise null (no shared copy). */
export function sharedCookieDomainFor(hostname: string | null | undefined): string | null {
  const host = String(hostname || '').trim().toLowerCase();
  if (host === SHARED_COOKIE_ROOT || host.endsWith(`.${SHARED_COOKIE_ROOT}`)) return `.${SHARED_COOKIE_ROOT}`;
  return null;
}

/** URL-safe base64 of the text. JSON inflates about three times under percent-encoding, one third under this. */
export function encodeForCookie(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeFromCookie(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Cuts the encoded session into cookie-sized pieces, or null when it would take too many. */
export function splitIntoChunks(encoded: string): string[] | null {
  if (!encoded) return [];
  const pieces: string[] = [];
  for (let i = 0; i < encoded.length; i += COOKIE_CHUNK_SIZE) pieces.push(encoded.slice(i, i + COOKIE_CHUNK_SIZE));
  return pieces.length > MAX_COOKIE_CHUNKS ? null : pieces;
}

/** `a=1; b=2` into a map. A value that cannot be decoded is kept as it came. */
export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    if (!name) continue;
    out[name] = part.slice(at + 1).trim();
  }
  return out;
}

/** The session stored in pieces `key.0`, `key.1`, ... joined and decoded, or null. */
export function readChunkedSession(cookies: Record<string, string>, key: string): string | null {
  let encoded = '';
  for (let i = 0; i < MAX_COOKIE_CHUNKS; i += 1) {
    const piece = cookies[`${key}.${i}`];
    if (piece === undefined) break;
    encoded += piece;
  }
  return encoded ? decodeFromCookie(encoded) : null;
}

/** When the stored session's access token ends, in seconds. 0 when it cannot be read. */
export function sessionExpiry(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { expires_at?: unknown } | null;
    const at = parsed && typeof parsed === 'object' ? parsed.expires_at : undefined;
    return typeof at === 'number' && Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

function isReadableSession(raw: string | null): raw is string {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return !!parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

/**
 * Which copy is the truth. The one that lasts longer was refreshed more
 * recently. A copy that is missing or unreadable loses; a tie keeps this
 * address's own copy, so nothing is rewritten for nothing.
 */
export function pickNewer(
  local: string | null,
  shared: string | null
): { value: string; source: 'local' | 'shared' } | null {
  const localOk = isReadableSession(local);
  const sharedOk = isReadableSession(shared);
  if (!localOk && !sharedOk) return null;
  if (!sharedOk) return { value: local as string, source: 'local' };
  if (!localOk) return { value: shared as string, source: 'shared' };
  return sessionExpiry(shared) > sessionExpiry(local)
    ? { value: shared as string, source: 'shared' }
    : { value: local as string, source: 'local' };
}

type SessionStorageLike = {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
};

function safeLocal(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * The storage handed to the Supabase auth client. Behaves as localStorage for
 * every key but `sessionKey`, and for that one keeps the shared cookie copy in
 * step as described at the top of the file.
 */
export function createSharedSessionStorage(sessionKey: string): SessionStorageLike {
  const local = (): Storage | null => safeLocal();

  const domain = (): string | null => {
    try {
      return typeof window !== 'undefined' ? sharedCookieDomainFor(window.location.hostname) : null;
    } catch {
      return null;
    }
  };

  const secure = (): string => {
    try {
      return window.location.protocol === 'https:' ? '; Secure' : '';
    } catch {
      return '';
    }
  };

  const setCookie = (name: string, value: string, maxAge: number, cookieDomain: string) => {
    document.cookie = `${name}=${value}; Domain=${cookieDomain}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure()}`;
  };

  const clearShared = (cookieDomain: string) => {
    for (let i = 0; i < MAX_COOKIE_CHUNKS; i += 1) setCookie(`${sessionKey}.${i}`, '', 0, cookieDomain);
  };

  const readShared = (): string | null => {
    try {
      if (!domain() || typeof document === 'undefined') return null;
      return readChunkedSession(parseCookieHeader(document.cookie), sessionKey);
    } catch {
      return null;
    }
  };

  const writeShared = (value: string) => {
    try {
      const cookieDomain = domain();
      if (!cookieDomain || typeof document === 'undefined') return;
      const pieces = splitIntoChunks(encodeForCookie(value));
      if (!pieces) {
        // Too big to share: drop a stale copy so the other address does not
        // adopt an old session over this newer one.
        clearShared(cookieDomain);
        return;
      }
      pieces.forEach((piece, i) => setCookie(`${sessionKey}.${i}`, piece, COOKIE_MAX_AGE_SECONDS, cookieDomain));
      for (let i = pieces.length; i < MAX_COOKIE_CHUNKS; i += 1) setCookie(`${sessionKey}.${i}`, '', 0, cookieDomain);
    } catch {
      // Cookies blocked: this address still has its own copy.
    }
  };

  return {
    getItem(key) {
      const store = local();
      let own: string | null = null;
      try {
        own = store ? store.getItem(key) : null;
      } catch {
        own = null;
      }
      if (key !== sessionKey) return own;
      const picked = pickNewer(own, readShared());
      if (!picked) return own;
      if (picked.source === 'shared') {
        // Adopt it here too, so the next read is local and this address
        // carries on from the newest session.
        try {
          store?.setItem(key, picked.value);
        } catch {
          // Storage full or blocked: the cookie copy still serves this read.
        }
      }
      return picked.value;
    },
    setItem(key, value) {
      try {
        local()?.setItem(key, value);
      } catch {
        // Fall through: the shared copy may still hold it.
      }
      if (key === sessionKey) writeShared(value);
    },
    removeItem(key) {
      try {
        local()?.removeItem(key);
      } catch {
        // Nothing to remove from.
      }
      if (key !== sessionKey) return;
      try {
        const cookieDomain = domain();
        if (cookieDomain && typeof document !== 'undefined') clearShared(cookieDomain);
      } catch {
        // Cookies blocked.
      }
    },
  };
}
