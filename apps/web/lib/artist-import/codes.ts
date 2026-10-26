/**
 * Catalogue codes and the daily link cap (2026-10-26). Pure: no network, no
 * database, so vitest holds the rules.
 */

import { normalizeIsrc, normalizeUpc } from '@/lib/altlink/rules';

/** Until Altlink tells us the real limits (asked 2026-10-26, no answer yet). */
export const DEFAULT_LINKS_PER_DAY = 10;
export const LINKS_PER_DAY_SETTING_KEY = 'catalogue_links_per_day';
/** Altlink's own day is Lagos, UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** The setting is {"limit": N}; anything else falls back to the default. */
export function readLinksPerDay(value: unknown): number {
  const raw =
    value && typeof value === 'object' ? (value as Record<string, unknown>).limit : typeof value === 'number' ? value : null;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 1000 ? raw : DEFAULT_LINKS_PER_DAY;
}

/** The instant today (Lagos) began, as an ISO string, for counting today's links. */
export function lagosDayStartIso(nowMs: number = Date.now()): string {
  const lagosNow = nowMs + LAGOS_OFFSET_MS;
  const dayStartLagos = lagosNow - (((lagosNow % 86_400_000) + 86_400_000) % 86_400_000);
  return new Date(dayStartLagos - LAGOS_OFFSET_MS).toISOString();
}

export type LinkCapVerdict = { allowed: boolean; limit: number; used: number; remaining: number };

export function decideLinkCap(input: { used: number; limit: number }): LinkCapVerdict {
  const used = Math.max(0, input.used);
  const remaining = Math.max(0, input.limit - used);
  return { allowed: remaining > 0, limit: input.limit, used, remaining };
}

/** A code typed by hand: a UPC (12 or 13 digits) or an ISRC. Null when it is neither. */
export function parseTypedCode(value: unknown): { upc: string | null; isrc: string | null } | null {
  if (typeof value !== 'string') return null;
  const upc = normalizeUpc(value);
  if (upc) return { upc, isrc: null };
  const isrc = normalizeIsrc(value);
  if (isrc) return { upc: null, isrc };
  return null;
}

/** Deezer album body -> the UPC and the first track id (for a single's ISRC). */
export function readDeezerAlbumCodes(json: unknown): { upc: string | null; firstTrackId: string | null } {
  const body = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const tracks = (body.tracks && typeof body.tracks === 'object' ? (body.tracks as Record<string, unknown>).data : null) as unknown;
  const first = Array.isArray(tracks) && tracks[0] && typeof tracks[0] === 'object' ? (tracks[0] as Record<string, unknown>) : null;
  const trackId = first && (typeof first.id === 'number' || typeof first.id === 'string') ? String(first.id) : null;
  return { upc: normalizeUpc(body.upc), firstTrackId: trackId && /^[0-9]{1,18}$/.test(trackId) ? trackId : null };
}

export function readDeezerTrackIsrc(json: unknown): string | null {
  return json && typeof json === 'object' ? normalizeIsrc((json as Record<string, unknown>).isrc) : null;
}
