/**
 * A small per-address limit for the two public lookup routes, so they cannot
 * be used as a free proxy to Deezer and Apple. In memory, so it is per server
 * instance and best effort: it stops a loop, not a determined crowd.
 */

const WINDOW_MS = 60_000;
export const IMPORT_LOOKUPS_PER_WINDOW = 40;
const MAX_TRACKED = 5000;

const hits = new Map<string, { count: number; resetAt: number }>();

export function allowImportLookup(key: string, now: number = Date.now()): boolean {
  if (hits.size > MAX_TRACKED) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    if (hits.size > MAX_TRACKED) hits.clear();
  }
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= IMPORT_LOOKUPS_PER_WINDOW;
}

export function importLookupKey(forwardedFor: string | null): string {
  return (forwardedFor ?? '').split(',')[0].trim() || 'unknown';
}

export function resetImportLookupsForTest(): void {
  hits.clear();
}
