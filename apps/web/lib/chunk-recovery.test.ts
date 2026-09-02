import { describe, expect, it } from 'vitest';
import {
  CHUNK_INTENT_TTL_MS,
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_MAX_ATTEMPTS,
  isChunkLoadError,
  isInAppNavigationClick,
  nextReloadRecord,
  parseReloadRecord,
  resolveRecoveryTarget,
  shouldReload,
  type LinkClick,
} from './chunk-recovery';

describe('isChunkLoadError', () => {
  it('matches webpack ChunkLoadError by name', () => {
    const error = new Error('whatever');
    error.name = 'ChunkLoadError';
    expect(isChunkLoadError(error)).toBe(true);
  });

  it('matches the per-engine wordings for a failed dynamic import', () => {
    const messages = [
      'Loading chunk 4821 failed.',
      'Loading CSS chunk app/layout failed.',
      // Chromium
      'Failed to fetch dynamically imported module: https://app.urganize.app/_next/static/chunks/x.js',
      // Firefox
      'error loading dynamically imported module',
      // Safari
      'Importing a module script failed.',
    ];
    for (const message of messages) {
      expect(isChunkLoadError(new Error(message)), message).toBe(true);
      expect(isChunkLoadError(message), `bare string: ${message}`).toBe(true);
    }
  });

  // The important half. This predicate triggers a page reload, so anything it
  // matches by accident yanks the page out from under someone mid-task.
  it('does NOT match ordinary errors, especially a plain failed fetch', () => {
    const benign = [
      new Error('Failed to fetch'), // any dead API call
      new Error('NetworkError when attempting to fetch resource.'),
      new Error('Could not load team logins.'),
      new TypeError('undefined is not a function'),
      new Error('Loading...'),
      new Error('chunk'),
      new Error(''),
    ];
    for (const error of benign) {
      expect(isChunkLoadError(error), error.message).toBe(false);
    }
  });

  it('is safe on null, undefined and odd shapes', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(0)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
    expect(isChunkLoadError({ message: null })).toBe(false);
    expect(isChunkLoadError({ name: 42 })).toBe(false);
  });
});

describe('parseReloadRecord', () => {
  it('returns a zero record for absent or corrupt storage', () => {
    expect(parseReloadRecord(null)).toEqual({ at: 0, attempts: 0 });
    expect(parseReloadRecord('')).toEqual({ at: 0, attempts: 0 });
    expect(parseReloadRecord('not json')).toEqual({ at: 0, attempts: 0 });
    expect(parseReloadRecord('{"at":"x","attempts":[]}')).toEqual({ at: 0, attempts: 0 });
  });

  it('round-trips a real record', () => {
    expect(parseReloadRecord(JSON.stringify({ at: 1234, attempts: 1 }))).toEqual({
      at: 1234,
      attempts: 1,
    });
  });
});

describe('shouldReload', () => {
  const now = 1_000_000;

  it('allows the first recovery', () => {
    expect(shouldReload({ at: 0, attempts: 0 }, now)).toBe(true);
  });

  it('refuses inside the cooldown, so one bad chunk cannot spin the tab', () => {
    expect(shouldReload({ at: now - 1_000, attempts: 1 }, now)).toBe(false);
  });

  it('allows again once the cooldown has passed and budget remains', () => {
    expect(shouldReload({ at: now - CHUNK_RELOAD_COOLDOWN_MS - 1, attempts: 1 }, now)).toBe(true);
  });

  // The loop backstop: a chunk that is genuinely unfetchable (offline, dead
  // CDN) must eventually stop reloading and leave the page visible.
  it('refuses once the per-session ceiling is spent, cooldown or not', () => {
    const spent = { at: now - 10 * CHUNK_RELOAD_COOLDOWN_MS, attempts: CHUNK_RELOAD_MAX_ATTEMPTS };
    expect(shouldReload(spent, now)).toBe(false);
  });

  it('converges: repeated failures stop after exactly the ceiling', () => {
    let record = { at: 0, attempts: 0 };
    let clock = now;
    let reloads = 0;
    for (let i = 0; i < 20; i += 1) {
      if (shouldReload(record, clock)) {
        record = nextReloadRecord(record, clock);
        reloads += 1;
      }
      clock += CHUNK_RELOAD_COOLDOWN_MS * 2;
    }
    expect(reloads).toBe(CHUNK_RELOAD_MAX_ATTEMPTS);
  });
});

const APP = 'https://app.urganize.app';
const CURRENT = `${APP}/dashboard?release=r1`;

const linkClick = (overrides: Partial<LinkClick> = {}): LinkClick => ({
  href: `${APP}/settings`,
  target: null,
  hasDownload: false,
  modified: false,
  ...overrides,
});

describe('isInAppNavigationClick', () => {
  it('accepts an ordinary in-app link', () => {
    expect(isInAppNavigationClick(linkClick(), CURRENT)).toBe(true);
  });

  // The recorded href is somewhere the browser may later be sent, so the
  // refusals are the half that matters.
  it('refuses anything that is not a navigation of THIS document', () => {
    const refused: Array<[string, LinkClick]> = [
      ['no href', linkClick({ href: '' })],
      ['modifier or middle click', linkClick({ modified: true })],
      ['download attribute', linkClick({ hasDownload: true })],
      ['opens a new tab', linkClick({ target: '_blank' })],
      ['named frame', linkClick({ target: 'preview' })],
      ['another origin', linkClick({ href: 'https://urganize.app/pricing' })],
      ['mailto', linkClick({ href: 'mailto:contact@urganize.app' })],
      ['tel', linkClick({ href: 'tel:+2347067367057' })],
      ['capacitor deep link', linkClick({ href: 'com.urganize.app://auth/callback' })],
      ['javascript url', linkClick({ href: 'javascript:void(0)' })],
      ['unparseable', linkClick({ href: 'http://[' })],
    ];
    for (const [label, click] of refused) {
      expect(isInAppNavigationClick(click, CURRENT), label).toBe(false);
    }
  });

  it('accepts target="_self", which is just the default spelled out', () => {
    expect(isInAppNavigationClick(linkClick({ target: '_self' }), CURRENT)).toBe(true);
  });

  it('resolves a relative href against the current page', () => {
    expect(isInAppNavigationClick(linkClick({ href: '/dashboard/notes' }), CURRENT)).toBe(true);
  });
});

describe('resolveRecoveryTarget', () => {
  const now = 1_000_000;
  const fresh = (href: string) => ({ href, at: now - 500 });

  // The bug this exists for: the router had not committed the new URL, so a
  // plain reload lands the user back where they started and their click is
  // gone. Here it resumes instead.
  it('resumes the navigation when the URL had not changed yet', () => {
    expect(resolveRecoveryTarget(CURRENT, fresh(`${APP}/settings`), now)).toBe(`${APP}/settings`);
  });

  // The other half, and the reason this is safe to ship without being able to
  // observe which case Next actually produces: when the router DID commit the
  // URL first, a reload already lands on the destination, so this must decline
  // and leave the old behaviour alone.
  it('declines when the destination is already the current page', () => {
    expect(resolveRecoveryTarget(CURRENT, fresh(CURRENT), now)).toBeNull();
  });

  it('declines on a hash-only difference, which loads no chunks', () => {
    expect(resolveRecoveryTarget(CURRENT, fresh(`${CURRENT}#teammates`), now)).toBeNull();
  });

  it('treats a different query string as a real navigation', () => {
    const target = `${APP}/dashboard?release=r2`;
    expect(resolveRecoveryTarget(CURRENT, fresh(target), now)).toBe(target);
  });

  it('declines with no intent recorded', () => {
    expect(resolveRecoveryTarget(CURRENT, null, now)).toBeNull();
  });

  it('declines a stale intent, so an old click cannot hijack a later failure', () => {
    const stale = { href: `${APP}/settings`, at: now - CHUNK_INTENT_TTL_MS - 1 };
    expect(resolveRecoveryTarget(CURRENT, stale, now)).toBeNull();
  });

  it('accepts an intent right at the freshness boundary', () => {
    const edge = { href: `${APP}/settings`, at: now - CHUNK_INTENT_TTL_MS };
    expect(resolveRecoveryTarget(CURRENT, edge, now)).toBe(`${APP}/settings`);
  });

  it('declines a clock that moved backwards rather than reading it as fresh', () => {
    expect(resolveRecoveryTarget(CURRENT, { href: `${APP}/settings`, at: now + 5_000 }, now))
      .toBeNull();
  });

  it('declines a cross-origin target', () => {
    const off = fresh('https://evil.example/steal');
    expect(resolveRecoveryTarget(CURRENT, off, now)).toBeNull();
  });

  it('declines unparseable input on either side', () => {
    expect(resolveRecoveryTarget('http://[', fresh(`${APP}/settings`), now)).toBeNull();
    expect(resolveRecoveryTarget(CURRENT, fresh('http://['), now)).toBeNull();
    expect(resolveRecoveryTarget(CURRENT, { href: '', at: now }, now)).toBeNull();
  });

  it('never returns a target for a NaN timestamp', () => {
    expect(resolveRecoveryTarget(CURRENT, { href: `${APP}/settings`, at: NaN }, now)).toBeNull();
  });
});
