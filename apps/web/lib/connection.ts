// Should we spend the user's data on speculative background work?
//
// This exists because the product's users are largely on Nigerian mobile
// networks, where data is metered and expensive. Prefetching is a straight
// trade: bytes now for latency later. That trade is good on a normal
// connection and bad on a capped or crawling one, and the browser already
// knows which the user is on.
//
// Deliberately fails OPEN (prefetch allowed) when the API is missing — Safari
// and Firefox don't implement navigator.connection, and treating "unknown" as
// "constrained" would disable prefetching for those users permanently.

export type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
};

/** Connection classes too slow for speculative traffic to be worth it — the
 * prefetch would still be in flight when the user taps, and would have been
 * competing with the request they actually waited on. */
const CONSTRAINED_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

/** Reads the Network Information API, which is non-standard enough that it
 * isn't on the TS Navigator type. Returns null when unavailable. */
export function readConnection(): ConnectionLike | null {
  if (typeof navigator === 'undefined') return null;
  const candidate = (navigator as Navigator & { connection?: ConnectionLike }).connection;
  return candidate && typeof candidate === 'object' ? candidate : null;
}

/**
 * True when background prefetching is appropriate. Pass a connection for
 * tests; omit it to read the live one.
 */
export function shouldBackgroundPrefetch(
  connection: ConnectionLike | null = readConnection()
): boolean {
  if (!connection) return true;
  // Data Saver is an explicit user request to stop spending their bytes on
  // things they didn't ask for. Honor it before anything else.
  if (connection.saveData === true) return false;
  if (
    typeof connection.effectiveType === 'string' &&
    CONSTRAINED_EFFECTIVE_TYPES.has(connection.effectiveType)
  ) {
    return false;
  }
  return true;
}

/** Run `task` when the browser is idle, falling back to a short timer where
 * requestIdleCallback doesn't exist (Safari). Returns a cancel function. */
export function runWhenIdle(task: () => void, timeoutMs = 2_000): () => void {
  if (typeof window === 'undefined') return () => {};

  const idle = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  });

  if (typeof idle.requestIdleCallback === 'function') {
    const handle = idle.requestIdleCallback(task, { timeout: timeoutMs });
    return () => idle.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(task, 400);
  return () => window.clearTimeout(handle);
}
