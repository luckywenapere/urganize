import { describe, expect, it } from 'vitest';
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_MAX_ATTEMPTS,
  isChunkLoadError,
  nextReloadRecord,
  parseReloadRecord,
  shouldReload,
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
