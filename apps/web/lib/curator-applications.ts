// Curator applications (2026-10-24, founder approved mocks v2-apply / v2-sent /
// v2-admin). A playlist owner without an invite fills in /curator/apply; an
// admin reads it in /admin/curator-applications and either approves it, which
// mints the existing single-use curator invite (lib/curator-invites.ts), or
// declines it.
//
// PURE: no IO, no React, no node built-ins, so the public form, the admin page,
// the routes and the tests all read the same rules.

export const CURATOR_APPLICATION_STATUSES = ['new', 'approved', 'declined'] as const;
export type CuratorApplicationStatus = (typeof CURATOR_APPLICATION_STATUSES)[number];

export const isCuratorApplicationStatus = (value: unknown): value is CuratorApplicationStatus =>
  typeof value === 'string' && (CURATOR_APPLICATION_STATUSES as readonly string[]).includes(value);

/** The genre chips on the form, in the order they show. Stored as the key. */
export const CURATOR_APPLICATION_GENRES = ['afrobeats', 'amapiano', 'alte', 'hip_hop', 'other'] as const;
export type CuratorApplicationGenre = (typeof CURATOR_APPLICATION_GENRES)[number];

export const CURATOR_APPLICATION_GENRE_LABELS: Record<CuratorApplicationGenre, string> = {
  afrobeats: 'Afrobeats',
  amapiano: 'Amapiano',
  alte: 'Alté',
  hip_hop: 'Hip-hop',
  other: 'Other',
};

export const isCuratorApplicationGenre = (value: unknown): value is CuratorApplicationGenre =>
  typeof value === 'string' && (CURATOR_APPLICATION_GENRES as readonly string[]).includes(value);

/** The platforms a playlist link may point at (the helper line on the form). */
export type CuratorApplicationPlatform = 'spotify' | 'apple_music' | 'audiomack' | 'boomplay';

export const CURATOR_APPLICATION_PLATFORM_LABELS: Record<CuratorApplicationPlatform, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  audiomack: 'Audiomack',
  boomplay: 'Boomplay',
};

// Matched as host suffixes so subdomains work (open.spotify.com, music.apple.com).
const PLATFORM_HOSTS: Array<{ suffix: string; platform: CuratorApplicationPlatform }> = [
  { suffix: 'spotify.com', platform: 'spotify' },
  { suffix: 'spotify.link', platform: 'spotify' },
  { suffix: 'music.apple.com', platform: 'apple_music' },
  { suffix: 'apple.co', platform: 'apple_music' },
  { suffix: 'audiomack.com', platform: 'audiomack' },
  { suffix: 'boomplay.com', platform: 'boomplay' },
  { suffix: 'boomplaymusic.com', platform: 'boomplay' },
];

export const MAX_PLAYLIST_URL_LENGTH = 500;
export const MAX_FOLLOWERS = 100_000_000;
export const MAX_COUNTRY_LENGTH = 60;
export const MAX_CONTACT_LENGTH = 120;
export const MAX_NOTE_LENGTH = 500;
export const MAX_PLAYLIST_NAME_LENGTH = 120;

/** Spam guard: a form sent faster than this after it opened is a bot. */
export const MIN_FILL_MS = 2500;
/** Spam guard: applications one network may send per hour. */
export const MAX_APPLICATIONS_PER_IP_PER_HOUR = 5;
/** Spam guard: applications one contact may send per day. */
export const MAX_APPLICATIONS_PER_CONTACT_PER_DAY = 3;

/** The hidden field a person never sees and a bot fills in. */
export const HONEYPOT_FIELD = 'website';

/** The platform a link is on, or null when it is not one we take. */
export function detectApplicationPlatform(value: unknown): CuratorApplicationPlatform | null {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  for (const entry of PLATFORM_HOSTS) {
    if (host === entry.suffix || host.endsWith(`.${entry.suffix}`)) return entry.platform;
  }
  return null;
}

function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  let trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PLAYLIST_URL_LENGTH) return null;
  // People paste "open.spotify.com/playlist/…" without the scheme.
  if (!/^https?:\/\//i.test(trimmed)) trimmed = `https://${trimmed}`;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The link as stored: https, no hash, trimmed. Null when it is not a link. */
export function normalizePlaylistUrl(value: unknown): string | null {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  parsed.hash = '';
  if (parsed.protocol === 'http:') parsed.protocol = 'https:';
  return parsed.toString();
}

/**
 * What to call a playlist when we could not read its name: the host and path,
 * e.g. "open.spotify.com/playlist/37i9…".
 */
export function playlistLinkLabel(url: string): string {
  const parsed = parseHttpUrl(url);
  if (!parsed) return url;
  const host = parsed.hostname.replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  const label = `${host}${path}`;
  return label.length > 48 ? `${label.slice(0, 47)}…` : label;
}

export function playlistDisplayName(input: { playlistName?: string | null; playlistUrl: string }): string {
  const name = (input.playlistName || '').trim();
  return name || playlistLinkLabel(input.playlistUrl);
}

export type ContactKind = 'email' | 'whatsapp';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Email when it looks like one, WhatsApp when it is a phone number, else null. */
export function detectContactKind(value: unknown): ContactKind | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CONTACT_LENGTH) return null;
  if (EMAIL_PATTERN.test(trimmed)) return 'email';
  if (/^\+?[\d\s().-]+$/.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) return 'whatsapp';
  }
  return null;
}

/** "2,500" or "2500" to 2500; null for anything that is not a whole number. */
export function parseFollowers(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= MAX_FOLLOWERS ? value : null;
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[,\s_]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const count = Number(cleaned);
  return Number.isSafeInteger(count) && count <= MAX_FOLLOWERS ? count : null;
}

export type CuratorApplicationInput = {
  playlistUrl: string;
  platform: CuratorApplicationPlatform;
  followers: number;
  genre: CuratorApplicationGenre;
  country: string;
  contact: string;
  contactKind: ContactKind;
  note: string | null;
};

export type CuratorApplicationField = 'playlistUrl' | 'followers' | 'genre' | 'country' | 'contact' | 'note';

export type ParsedCuratorApplication =
  | { ok: true; application: CuratorApplicationInput }
  | { ok: false; field: CuratorApplicationField; error: string };

/** Checks the form, one field at a time, in the order they show. */
export function parseCuratorApplication(raw: unknown): ParsedCuratorApplication {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const playlistUrl = normalizePlaylistUrl(body.playlistUrl);
  if (!playlistUrl) {
    return { ok: false, field: 'playlistUrl', error: 'Paste the link to your playlist.' };
  }
  const platform = detectApplicationPlatform(playlistUrl);
  if (!platform) {
    return { ok: false, field: 'playlistUrl', error: 'Use a Spotify, Apple Music, Audiomack or Boomplay link.' };
  }

  const followers = parseFollowers(body.followers);
  if (followers === null) {
    return { ok: false, field: 'followers', error: 'Add how many followers it has, as a number.' };
  }

  if (!isCuratorApplicationGenre(body.genre)) {
    return { ok: false, field: 'genre', error: 'Pick the main genre.' };
  }

  const country = typeof body.country === 'string' ? body.country.trim().replace(/\s+/g, ' ') : '';
  if (!country || country.length > MAX_COUNTRY_LENGTH) {
    return { ok: false, field: 'country', error: 'Add your country.' };
  }

  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const contactKind = detectContactKind(contact);
  if (!contactKind) {
    return { ok: false, field: 'contact', error: 'Add an email or a WhatsApp number we can reply to.' };
  }

  const noteRaw = typeof body.note === 'string' ? body.note.trim() : '';
  if (noteRaw.length > MAX_NOTE_LENGTH) {
    return { ok: false, field: 'note', error: `Keep it under ${MAX_NOTE_LENGTH} characters.` };
  }

  return {
    ok: true,
    application: {
      playlistUrl,
      platform,
      followers,
      genre: body.genre,
      country,
      contact: contactKind === 'email' ? contact.toLowerCase() : contact,
      contactKind,
      note: noteRaw || null,
    },
  };
}

/** True when the request looks like a bot: the hidden field is filled, or it came back too fast. */
export function looksLikeBot(raw: unknown, now: number = Date.now()): boolean {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const trap = body[HONEYPOT_FIELD];
  if (typeof trap === 'string' && trap.trim()) return true;
  const startedAt = Number(body.startedAt);
  if (Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < MIN_FILL_MS) return true;
  return false;
}

/** What the sent screen and the admin list show under the name. */
export function applicationSummaryLine(input: {
  genre: string;
  followers: number | null;
  country: string;
}): string {
  const genre = isCuratorApplicationGenre(input.genre) ? CURATOR_APPLICATION_GENRE_LABELS[input.genre] : input.genre;
  const parts = [genre];
  if (typeof input.followers === 'number') parts.push(`${input.followers.toLocaleString('en')} followers`);
  if (input.country) parts.push(input.country);
  return parts.filter(Boolean).join(' · ');
}

/** "2h", "1d", "3w": how long ago, for the admin list. */
export function shortAgo(iso: string, now: Date = new Date()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.floor((now.getTime() - at) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/** The row the admin page reads. */
export type CuratorApplication = {
  id: string;
  playlistUrl: string;
  playlistName: string | null;
  platform: CuratorApplicationPlatform | null;
  followers: number;
  genre: string;
  country: string;
  contact: string;
  contactKind: ContactKind;
  note: string | null;
  status: CuratorApplicationStatus;
  inviteId: string | null;
  /** The join link, for an approved application whose invite still exists. */
  inviteUrl: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type CuratorApplicationCounts = Record<CuratorApplicationStatus, number>;

/** What the sent screen shows back to the applicant. */
export type CuratorApplicationReceipt = {
  playlistName: string;
  genre: string;
  followers: number;
  country: string;
};
