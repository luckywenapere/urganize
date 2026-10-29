// Altlink pre-save / smart link (Partner API v2 pilot, Oct 2026): the pure
// rules. No crypto, no database and no network, so every decision here
// is unit-tested directly (lib/altlink/rules.test.ts).

import { DEFAULT_RELEASE_TITLE } from '@/types/releases';

/** Ships ON: only the exact string "false" switches it off (house rule). */
export const isAltlinkEnabled = (): boolean => process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false';

/**
 * Fan capture was cut on Oct 16, 2026 (lib/cut-features.json forces its own flag
 * off). The pre-save view brings it back as part of ONE Promote entry, so it is
 * available whenever either switch is on.
 */
export const isFanCaptureAvailable = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true' ||
  process.env.NEXT_PUBLIC_FEATURE_ALTLINK !== 'false';

export const ALTLINK_TIMEZONE = 'Africa/Lagos';
/** Lagos is UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** A UPC is 12 or 13 digits. Spaces and dashes typed by hand are dropped. */
export function normalizeUpc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{12,13}$/.test(digits) ? digits : null;
}

/** An ISRC is 12 letters and digits (CC-XXX-YY-NNNNN, dashes optional). */
export function normalizeIsrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(code) ? code : null;
}

/** "YYYY-MM-DD" in Lagos for an instant. */
export function lagosYmd(atMs: number): string {
  return new Date(atMs + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The calendar day of a stored release date ("2026-11-06" or a timestamp). */
export function releaseYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

/** Out on release day itself: Altlink converts the link at local midnight. */
export function isReleasedOn(releaseDate: string | null | undefined, nowMs: number): boolean {
  const day = releaseYmd(releaseDate);
  return Boolean(day && day <= lagosYmd(nowMs));
}

/** Whole days from today (Lagos) to the release day; 0 on the day itself. */
export function daysUntilRelease(releaseDate: string | null | undefined, nowMs: number): number | null {
  const day = releaseYmd(releaseDate);
  if (!day) return null;
  const today = Date.parse(`${lagosYmd(nowMs)}T00:00:00Z`);
  const target = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;
  return Math.round((target - today) / 86_400_000);
}

export type SmartLinkFacts = {
  title: string | null;
  artistName: string | null;
  releaseDate: string | null;
  /** From Metadata first, then the TRM submission. */
  upc: string | null;
  isrc: string | null;
  isTest: boolean;
  isArchived: boolean;
};

export type CreateDecision =
  | { ready: true; type: 'pre_save' | 'smart_link'; releaseDate: string | null }
  | { ready: false; reason: 'no_code' | 'no_title' | 'no_artist' | 'no_date' | 'test' | 'archived' };

/**
 * Whether a rollout should get its Altlink link now. A future release date makes
 * a pre-save; today or a past date makes a plain smart link. Both need a UPC or
 * ISRC: a code-less create was tried on Oct 29, 2026 (#850) and Altlink answered
 * 422 missing_identifier, as their team said on the Oct 28 call (#852).
 */
export function decideCreate(facts: SmartLinkFacts, nowMs: number): CreateDecision {
  if (facts.isTest) return { ready: false, reason: 'test' };
  if (facts.isArchived) return { ready: false, reason: 'archived' };
  const title = facts.title?.trim();
  if (!title || title === DEFAULT_RELEASE_TITLE) return { ready: false, reason: 'no_title' };
  if (!facts.artistName?.trim()) return { ready: false, reason: 'no_artist' };
  const day = releaseYmd(facts.releaseDate);
  if (!day) return { ready: false, reason: 'no_date' };
  if (!normalizeUpc(facts.upc) && !normalizeIsrc(facts.isrc)) return { ready: false, reason: 'no_code' };
  return isReleasedOn(day, nowMs)
    ? { ready: true, type: 'smart_link', releaseDate: null }
    : { ready: true, type: 'pre_save', releaseDate: day };
}

// ── Payloads ────────────────────────────────────────────────────────────────

export type SmartLinkPlatform = { id: string; name: string; url: string | null; isActive: boolean };

export type AltlinkEventType =
  | 'link.created'
  | 'link.platforms_updated'
  | 'link.converted'
  | 'presave.signup';

export type AltlinkEvent = {
  eventId: string;
  type: string;
  linkId: string | null;
  externalReleaseId: string | null;
  platforms: SmartLinkPlatform[] | null;
  link: AltlinkLink | null;
};

export type AltlinkLink = {
  id: string;
  slug: string | null;
  url: string | null;
  externalReleaseId: string | null;
  type: string | null;
  releaseDate: string | null;
  status: string | null;
  claimUrl: string | null;
  platforms: SmartLinkPlatform[];
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export function readPlatforms(value: unknown): SmartLinkPlatform[] {
  if (!Array.isArray(value)) return [];
  const out: SmartLinkPlatform[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = text(row.id) ?? text(row.platform);
    if (!id) continue;
    const url = text(row.url);
    out.push({
      id,
      name: text(row.name) ?? id,
      url: url && /^https:\/\//i.test(url) ? url : null,
      isActive: row.is_active === undefined ? Boolean(url) : row.is_active === true,
    });
  }
  return out;
}

export function readLink(value: unknown): AltlinkLink | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    slug: text(row.slug),
    url: text(row.url),
    externalReleaseId: text(row.external_release_id),
    type: text(row.type),
    releaseDate: text(row.release_date),
    status: text(row.status),
    claimUrl: text(row.claim_url),
    platforms: readPlatforms(row.platforms),
  };
}

/** Tolerant reader: the link can sit at data.link, data, or the top level. */
export function readAltlinkEvent(body: unknown): AltlinkEvent | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const eventId = text(root.event_id) ?? text(root.id);
  const type = text(root.type) ?? text(root.event);
  if (!eventId || !type) return null;
  const data = (root.data && typeof root.data === 'object' ? root.data : {}) as Record<string, unknown>;
  const link = readLink(data.link) ?? (type.startsWith('link.') ? readLink(data) : null);
  const linkId = text(data.link_id) ?? link?.id ?? text(root.link_id);
  return {
    eventId,
    type,
    linkId,
    externalReleaseId: text(data.external_release_id) ?? link?.externalReleaseId ?? null,
    platforms: Array.isArray(data.platforms) ? readPlatforms(data.platforms) : link?.platforms.length ? link.platforms : null,
    link,
  };
}

export type SmartLinkStats = {
  views: number;
  clicks: number;
  ctr: number | null;
  presaves: number;
  topPlatforms: { platform: string; clicks: number; percentage: number }[];
  /** Country names (never codes), share of visits. Empty when Altlink sends none. */
  topCountries: { country: string; clicks: number; percentage: number }[];
};

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** Altlink documents names ("Nigeria"); a two-letter code ("NG") is named too. */
export function countryName(value: string): string {
  if (!/^[A-Za-z]{2}$/.test(value)) return value;
  try {
    return regionNames?.of(value.toUpperCase()) ?? value;
  } catch {
    return value;
  }
}

/** Rows like { key, count } (Altlink's docs) or our cached { <name>, clicks, percentage }. */
function readTop(value: unknown, nameKey: string, total: number): { name: string; clicks: number; percentage: number }[] {
  if (!Array.isArray(value)) return [];
  const rows = value
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
    .map((p) => ({ name: text(p[nameKey]) ?? text(p.key), clicks: typeof p.clicks === 'number' ? num(p.clicks) : num(p.count), percentage: p.percentage }))
    .filter((p): p is { name: string; clicks: number; percentage: unknown } => Boolean(p.name));
  const base = total > 0 ? total : rows.reduce((sum, p) => sum + p.clicks, 0);
  return rows.slice(0, 6).map((p) => ({
    name: p.name,
    clicks: p.clicks,
    percentage: typeof p.percentage === 'number' && Number.isFinite(p.percentage) ? p.percentage : base > 0 ? (p.clicks / base) * 100 : 0,
  }));
}

/**
 * Altlink's documented stats send clicks (landing-page visits) and redirects
 * (clicks on to a store). Our cache, and the earlier shape, send views and
 * clicks. Both read the same.
 */
export function readStats(value: unknown): SmartLinkStats | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const documented = row.views === undefined && row.redirects !== undefined;
  const views = documented ? num(row.clicks) : num(row.views);
  const clicks = documented ? num(row.redirects) : num(row.clicks);
  const sentCtr = typeof row.ctr === 'number' && Number.isFinite(row.ctr) ? row.ctr : null;
  const ctr = sentCtr ?? (documented && views > 0 ? clicks / views : null);
  return {
    views,
    clicks,
    ctr,
    presaves: num(row.presaves),
    topPlatforms: readTop(row.top_platforms, 'platform', clicks).map((p) => ({ platform: p.name, clicks: p.clicks, percentage: p.percentage })),
    topCountries: readTop(row.top_countries, 'country', views).map((p) => ({ country: countryName(p.name), clicks: p.clicks, percentage: p.percentage })),
  };
}

/** Stats are fetched when the view opens and kept this long per link. */
export const STATS_CACHE_MS = 10 * 60 * 1000;

export function statsAreFresh(fetchedAt: string | null | undefined, nowMs: number): boolean {
  if (!fetchedAt) return false;
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && nowMs - at < STATS_CACHE_MS && at <= nowMs + 60_000;
}

/** CTR as a whole percent; Altlink may send 0.71 or 71. */
export function ctrPercent(ctr: number | null): number | null {
  if (ctr === null) return null;
  return Math.round(ctr <= 1 ? ctr * 100 : ctr);
}

/** Store order on screen: found first, in Altlink's order. */
export function orderPlatforms(platforms: SmartLinkPlatform[]): SmartLinkPlatform[] {
  return [...platforms.filter((p) => p.isActive && p.url), ...platforms.filter((p) => !(p.isActive && p.url))];
}

export type SmartLinkPhase = 'none' | 'creating' | 'failed' | 'presave' | 'released';

/** Which state the view draws. A converted link, or release day, reads as out. */
export function smartLinkPhase(
  row: { status: string; url: string | null } | null,
  releaseDate: string | null | undefined,
  nowMs: number
): SmartLinkPhase {
  if (!row) return 'none';
  if (row.status === 'pending') return 'creating';
  if (row.status === 'failed' || !row.url) return 'failed';
  if (row.status === 'converted' || isReleasedOn(releaseDate, nowMs)) return 'released';
  return 'presave';
}

/** Altlink's own status words onto ours. A smart link made after release is live. */
export function mapLinkStatus(status: string | null): 'scheduled' | 'live' | 'converted' {
  if (status === 'converted') return 'converted';
  if (status === 'live' || status === 'active' || status === 'published') return 'live';
  return 'scheduled';
}
