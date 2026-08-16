// Recovery from version skew after a deploy (2026-08-16).
//
// THE FAILURE, because it does not look like a crash and is easy to
// misdiagnose: a tab opened before a deploy holds that build's chunk URLs
// (/_next/static/<buildId>/...). Once a new deployment takes the production
// alias, those files 404. The App Router fetches a route's chunk lazily, so
// the next client-side navigation — and browser BACK is one — asks for a file
// that is gone.
//
// Nothing throws inside React. The router transition dies, the previous
// screen stays painted, no handlers attach for the route that never mounted.
// The page still SCROLLS, because scrolling is the browser's, not React's —
// which is why this reads as "the buttons stopped working" rather than as an
// error. app/error.tsx cannot help; its own comment says so ("a JS chunk that
// never downloads. Nothing throws in that case — React simply never runs").
//
// The real fix is Vercel Skew Protection, which keeps a deployment's assets
// resolvable for old clients. This module is the belt to that's braces: it
// notices the failure and reloads once, which is the only client-side cure
// (a reload re-fetches the HTML, which names the current chunks).
//
// Pure and dependency-free so the decisions are unit-testable — the component
// that wires it to window is components/providers/ChunkRecoveryBridge.tsx.

/** sessionStorage key holding the last auto-reload attempt. Session-scoped on
 * purpose: a new tab deserves a fresh budget, and the counter must not
 * outlive the browsing session that hit the bad deploy. */
export const CHUNK_RELOAD_STORAGE_KEY = 'urganize.chunk-reload';

/** Don't retry inside this window — if a reload didn't fix it, reloading
 * again immediately is a loop, not a remedy. */
export const CHUNK_RELOAD_COOLDOWN_MS = 20_000;

/** Hard ceiling per session. Two is enough for the real case (one reload
 * fixes skew); beyond that something else is wrong and spinning the page
 * forever would be worse than leaving it broken and visible. */
export const CHUNK_RELOAD_MAX_ATTEMPTS = 2;

/**
 * Is this a chunk/module that failed to load, rather than an ordinary error?
 *
 * Matched by message as well as name because bundlers and browsers disagree:
 * webpack throws a named ChunkLoadError, native ESM import failures surface as
 * a plain TypeError whose wording differs per engine (Chrome, Firefox and
 * Safari each phrase it differently). Deliberately narrow — a false positive
 * here reloads the page out from under someone, so a generic "Failed to fetch"
 * (any dead API call would produce one) must NOT match.
 */
export function isChunkLoadError(value: unknown): boolean {
  if (!value) return false;

  const name = typeof value === 'object' && value !== null && 'name' in value
    ? String((value as { name?: unknown }).name ?? '')
    : '';
  if (name === 'ChunkLoadError') return true;

  const message =
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && 'message' in value
        ? String((value as { message?: unknown }).message ?? '')
        : '';
  if (!message) return false;

  return (
    // webpack
    /loading chunk \S+ failed/i.test(message) ||
    /loading css chunk \S+ failed/i.test(message) ||
    // Chromium / Firefox native ESM
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    // Safari
    /importing a module script failed/i.test(message)
  );
}

export type ChunkReloadRecord = { at: number; attempts: number };

/** Parse the stored record, tolerating absent or corrupt values. */
export function parseReloadRecord(raw: string | null): ChunkReloadRecord {
  if (!raw) return { at: 0, attempts: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<ChunkReloadRecord>;
    const at = typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : 0;
    const attempts =
      typeof parsed.attempts === 'number' && Number.isFinite(parsed.attempts)
        ? Math.max(0, Math.floor(parsed.attempts))
        : 0;
    return { at, attempts };
  } catch {
    return { at: 0, attempts: 0 };
  }
}

/**
 * Should we reload right now? False inside the cooldown and false once the
 * per-session ceiling is spent, so a chunk that is genuinely unfetchable
 * (offline, a broken CDN) can never put the tab in a reload loop.
 */
export function shouldReload(record: ChunkReloadRecord, now: number): boolean {
  if (record.attempts >= CHUNK_RELOAD_MAX_ATTEMPTS) return false;
  if (record.at && now - record.at < CHUNK_RELOAD_COOLDOWN_MS) return false;
  return true;
}

/** The record to persist after deciding to reload. */
export function nextReloadRecord(record: ChunkReloadRecord, now: number): ChunkReloadRecord {
  return { at: now, attempts: record.attempts + 1 };
}
