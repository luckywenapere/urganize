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

// ---------------------------------------------------------------------------
// Where the recovery should LAND (2026-08-31).
//
// The reload above cures the dead page, but on its own it reloads whatever URL
// the tab is currently showing — and the failure it is recovering from is a
// NAVIGATION. So when the router had not yet committed the new URL, the user's
// click is simply lost: they tapped a link, the page refreshed, and they are
// still where they started. That is the reported symptom ("come back and want
// to navigate the app, it refreshes the whole page") rather than a theory.
//
// So the bridge records the last in-app link the user clicked and the recovery
// resumes it. Deliberately a no-op in the case where today's behaviour is
// already right: if the router DID commit the URL first, the destination and
// the current location are the same page and this returns null, i.e. a plain
// reload. There is no case where it lands somewhere the user did not ask for.

/**
 * How long a recorded navigation intent stays usable.
 *
 * A chunk error much later than the click that caused it is not that click's
 * failure — it is more likely a lazy component on the page the user has been
 * sitting on. Past this window the intent is ignored and the page just
 * reloads, which is the safe outcome.
 */
export const CHUNK_INTENT_TTL_MS = 15_000;

/** The last in-app link click, as recorded by ChunkRecoveryBridge. */
export type NavigationIntent = { href: string; at: number };

/**
 * A link click, reduced to the fields the decision needs, so the decision
 * stays pure and testable and the component stays a thin adapter.
 *
 * `defaultPrevented` is deliberately ABSENT. The bridge listens in the capture
 * phase (Next's Link calls preventDefault() to route client-side, so by the
 * bubble phase every real in-app click looks cancelled — exactly the set we
 * need). That early, the flag is always false and would encode a guarantee it
 * cannot make, so it is not consulted at all.
 */
export type LinkClick = {
  /** The anchor's resolved absolute href. */
  href: string;
  /** The anchor's `target` attribute, or null when it has none. */
  target: string | null;
  /** Whether the anchor carries a `download` attribute. */
  hasDownload: boolean;
  /**
   * A modifier key was held or a non-primary button used, so the browser
   * opens this somewhere else. It is not a navigation of THIS document and
   * must not be recorded as one.
   */
  modified: boolean;
};

/**
 * Is this click a navigation of the current document that we should remember?
 *
 * Narrow on purpose: the recorded href is somewhere we may later send the
 * browser, so anything that is not plainly an in-app route change is refused.
 * Non-http protocols (mailto:, tel:, the Capacitor deep-link scheme) are
 * rejected by the protocol check before the origin check can see them.
 */
export function isInAppNavigationClick(click: LinkClick, currentHref: string): boolean {
  if (!click.href) return false;
  if (click.modified) return false;
  if (click.hasDownload) return false;
  if (click.target && click.target !== '_self') return false;

  let current: URL;
  let target: URL;
  try {
    current = new URL(currentHref);
    target = new URL(click.href, currentHref);
  } catch {
    return false;
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
  return target.origin === current.origin;
}

/**
 * Where should a recovery reload land — the absolute href to navigate to, or
 * null meaning "reload the URL we are on".
 *
 * Returns null (a plain reload) for every uncertainty: no intent recorded, a
 * stale or clock-skewed one, an unparseable URL, a cross-origin target, or a
 * destination that is already the current page. Only a fresh, same-origin,
 * genuinely-different route earns a navigation.
 */
export function resolveRecoveryTarget(
  currentHref: string,
  intent: NavigationIntent | null,
  now: number
): string | null {
  if (!intent || !intent.href) return null;

  // Negative age means a clock that moved backwards; treat it as unusable
  // rather than as infinitely fresh.
  const age = now - intent.at;
  if (!Number.isFinite(age) || age < 0 || age > CHUNK_INTENT_TTL_MS) return null;

  let current: URL;
  let target: URL;
  try {
    current = new URL(currentHref);
    target = new URL(intent.href, currentHref);
  } catch {
    return null;
  }

  if (target.origin !== current.origin) return null;

  // The router may or may not have committed the URL before the chunk failed.
  // If it did, the current location already IS the destination, so a reload
  // lands there and navigating would only add a duplicate history entry. The
  // hash is excluded from the comparison: a fragment loads no chunks, so a
  // hash-only difference is not the navigation that failed.
  if (target.pathname === current.pathname && target.search === current.search) return null;

  return target.href;
}
