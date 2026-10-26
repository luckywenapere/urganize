/**
 * The artists a person picked on the import step, held until the account
 * exists. Only the source id and the name are kept: the server pulls the
 * releases again when it saves, so nothing here is trusted as content.
 *
 * localStorage, not the onboarding draft: the draft also travels in the
 * email-confirmation metadata, and a list of artists does not belong there.
 * It survives the Google round trip and a reload; it does not follow a
 * confirmation link opened on another device (that person adds the artist
 * from the artist page instead).
 */

import { isImportProvider, isSafeSourceId, type ImportProvider } from './providers';

export type PendingArtistImport = {
  provider: ImportProvider;
  id: string;
  name: string;
  /** How many releases were found, for the recap. */
  count: number;
};

const KEY = 'urganize.onboarding.artist-imports';
export const MAX_PENDING_IMPORTS = 10;

export function parsePendingImports(raw: string | null): PendingArtistImport[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: PendingArtistImport[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : '';
      if (!isImportProvider(row.provider) || !isSafeSourceId(row.id) || !name) continue;
      const count = typeof row.count === 'number' && Number.isFinite(row.count) ? Math.max(0, Math.floor(row.count)) : 0;
      out.push({ provider: row.provider, id: row.id, name, count });
      if (out.length >= MAX_PENDING_IMPORTS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Adds an artist, or replaces the same artist already in the list. */
export function addPendingImport(
  list: readonly PendingArtistImport[],
  next: PendingArtistImport
): PendingArtistImport[] {
  const without = list.filter((item) => !(item.provider === next.provider && item.id === next.id));
  return [...without, next].slice(-MAX_PENDING_IMPORTS);
}

export function readPendingImports(): PendingArtistImport[] {
  try {
    return parsePendingImports(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function writePendingImports(list: readonly PendingArtistImport[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Blocked storage: the artist is simply not carried over; they can add it later.
  }
}

export function clearPendingImports(): void {
  writePendingImports([]);
}
