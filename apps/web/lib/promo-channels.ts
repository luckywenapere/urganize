// Promo channels: the places a team can push a release without a media budget
// (GitHub #833, from the 2026-10-11 demo with a Nigerian artist manager: X music
// communities, SoundCloud networks, online and FM radio, blogs).
//
// Pure: no React, no I/O. The rules about what a channel is, how a list is
// filtered, which channels fit a rollout, what a suggestion must carry and what
// the activity a channel becomes says, all live here so tests can hold them.
// The database side is lib/promo-channels-server.ts; the table is
// supabase/migrations/20261011190000_promo_channels.sql.

export const PROMO_CHANNEL_KINDS = [
  'x_community',
  'x_spaces',
  'soundcloud',
  'online_radio',
  'radio',
  'blog',
] as const;

export type PromoChannelKind = (typeof PROMO_CHANNEL_KINDS)[number];

export const PROMO_CHANNEL_KIND_LABELS: Record<PromoChannelKind, string> = {
  x_community: 'X community',
  x_spaces: 'X Spaces',
  soundcloud: 'SoundCloud',
  online_radio: 'Online radio',
  radio: 'Radio',
  blog: 'Blogs',
};

export type PromoChannelCost = 'free' | 'paid';

/** Countries the filter offers, in the order shown. Nigeria first (the
 *  strategy doc), the UK for diaspora artists. A channel with no country is
 *  "Online": anyone anywhere can use it. */
export const PROMO_COUNTRIES = [
  { code: 'NG', label: 'Nigeria' },
  { code: 'GB', label: 'UK' },
] as const;

export const ONLINE_COUNTRY = 'online';

/** Where a rollout's promo is assumed to start when nothing says otherwise:
 *  Nigeria, the strategy doc's first market. The Promo scene opens on it and
 *  the plan banner ranks by it. */
export const DEFAULT_PROMO_COUNTRY = 'NG';

export type PromoChannel = {
  id: string;
  name: string;
  kind: PromoChannelKind;
  /** ISO 3166-1 alpha-2, or null for a channel that is online and anywhere. */
  country: string | null;
  city: string | null;
  genres: string[];
  howToSubmit: string | null;
  contact: string | null;
  url: string | null;
  /** As the channel states it ("7 working days"), or null when it does not say. */
  leadTime: string | null;
  /** Days before release to submit, when known. Dates the activity. */
  leadTimeDays: number | null;
  cost: PromoChannelCost | null;
};

export type PromoChannelRow = {
  id: string;
  name: string;
  kind: string;
  country: string | null;
  city: string | null;
  genres: string[] | null;
  how_to_submit: string | null;
  contact: string | null;
  url: string | null;
  lead_time: string | null;
  lead_time_days: number | null;
  cost: string | null;
};

export const PROMO_CHANNEL_COLUMNS =
  'id,name,kind,country,city,genres,how_to_submit,contact,url,lead_time,lead_time_days,cost';

export const isPromoChannelKind = (value: unknown): value is PromoChannelKind =>
  typeof value === 'string' && (PROMO_CHANNEL_KINDS as readonly string[]).includes(value);

/** Map a row, dropping one whose kind the app does not know (never crash on it). */
export function toPromoChannel(row: PromoChannelRow): PromoChannel | null {
  if (!isPromoChannelKind(row.kind)) return null;
  return {
    id: String(row.id),
    name: row.name,
    kind: row.kind,
    country: row.country || null,
    city: row.city || null,
    genres: Array.isArray(row.genres) ? row.genres.filter((g) => typeof g === 'string' && g.trim()) : [],
    howToSubmit: row.how_to_submit || null,
    contact: row.contact || null,
    url: row.url || null,
    leadTime: row.lead_time || null,
    leadTimeDays:
      typeof row.lead_time_days === 'number' && Number.isFinite(row.lead_time_days) ? row.lead_time_days : null,
    cost: row.cost === 'free' || row.cost === 'paid' ? row.cost : null,
  };
}

export type PromoFilter = {
  kind: PromoChannelKind | '';
  /** A country code, ONLINE_COUNTRY, or '' for every country. */
  country: string;
};

/** Filter by kind and country. A country filter keeps online channels too:
 *  they reach that country as well, and hiding them would hide the free ones. */
export function filterPromoChannels(channels: PromoChannel[], filter: PromoFilter): PromoChannel[] {
  return channels.filter((channel) => {
    if (filter.kind && channel.kind !== filter.kind) return false;
    if (!filter.country) return true;
    if (filter.country === ONLINE_COUNTRY) return channel.country === null;
    return channel.country === filter.country || channel.country === null;
  });
}

const normalizeGenre = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Does a channel take this genre? A channel that lists no genres takes all of
 *  them. Matching is loose ("Afro-pop" fits "afropop", "Afrobeats" fits
 *  "Afrobeats / Afropop") because genre words are not a fixed list. */
export function channelFitsGenre(channel: PromoChannel, genre: string | null | undefined): boolean {
  if (channel.genres.length === 0) return true;
  const wanted = normalizeGenre(genre || '');
  if (!wanted) return false;
  return channel.genres.some((entry) => {
    const have = normalizeGenre(entry);
    return Boolean(have) && (have === wanted || have.includes(wanted) || wanted.includes(have));
  });
}

export type PromoFitContext = {
  /** The rollout's genre (release metadata), if filled in. */
  genre: string | null;
  /** The country the team is promoting in. */
  country: string | null;
};

/**
 * The channels that fit a rollout, best first, at most `limit`.
 *
 * Deterministic on purpose: the same rollout always gets the same list, it
 * costs no credits, and it works with no model. A fit is a channel in the
 * rollout's country (or online) whose genres take the rollout's genre. Without a
 * genre, only the channels that take every genre count. Ranked: in-country
 * before online, then free, unknown cost, paid, then by name.
 */
export function suggestPromoChannels(
  channels: PromoChannel[],
  context: PromoFitContext,
  limit = 4
): PromoChannel[] {
  const country = context.country || null;
  const fits = channels.filter((channel) => {
    if (country && channel.country !== null && channel.country !== country) return false;
    return channelFitsGenre(channel, context.genre);
  });
  const score = (channel: PromoChannel) =>
    (country && channel.country === country ? 0 : 3) +
    (channel.cost === 'free' ? 0 : channel.cost === 'paid' ? 2 : 1);
  return [...fits]
    .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}

/** Days before release to submit when a channel does not say. Three weeks is
 *  the usual radio and blog planning window; it is a default, not a rule. */
export const DEFAULT_PROMO_LEAD_DAYS = 21;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function ymdToUtc(value: string | null | undefined): number | null {
  const match = YMD.exec((value || '').slice(0, 10));
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const check = new Date(ms);
  if (check.getUTCMonth() !== Number(match[2]) - 1) return null;
  return ms;
}

const utcToYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The date the activity for a channel is due: the release day minus the
 * channel's lead time (or the default), never before today. No release day
 * means a week from today, so the activity still lands somewhere visible.
 */
export function promoTaskDueDate(
  channel: Pick<PromoChannel, 'leadTimeDays'>,
  releaseDate: string | null | undefined,
  todayYmd: string
): string {
  const today = ymdToUtc(todayYmd) ?? Date.now();
  const release = ymdToUtc(releaseDate);
  const dayMs = 24 * 60 * 60 * 1000;
  if (release === null) return utcToYmd(today + 7 * dayMs);
  const lead = channel.leadTimeDays ?? DEFAULT_PROMO_LEAD_DAYS;
  return utcToYmd(Math.max(today, release - lead * dayMs));
}

export const MAX_PROMO_TASK_TITLE = 120;

/** "Submit to Cool FM Lagos": the activity title. */
export function promoTaskTitle(channel: Pick<PromoChannel, 'name' | 'kind'>): string {
  const verb = channel.kind === 'soundcloud' ? 'Post on' : channel.kind === 'x_spaces' ? 'Get on' : 'Submit to';
  return `${verb} ${channel.name}`.slice(0, MAX_PROMO_TASK_TITLE);
}

/** The activity description: how to submit, where, and what it costs. */
export function promoTaskDescription(channel: PromoChannel): string {
  const lines = [
    channel.howToSubmit,
    channel.contact ? `Contact: ${channel.contact}` : null,
    channel.url ? `Link: ${channel.url}` : null,
    channel.leadTime ? `Lead time: ${channel.leadTime}` : null,
    channel.cost ? (channel.cost === 'free' ? 'Free' : 'Paid') : null,
  ].filter((line): line is string => Boolean(line && line.trim()));
  return lines.join('\n');
}

export function promoCountryLabel(country: string | null): string {
  if (!country) return 'Online';
  return PROMO_COUNTRIES.find((entry) => entry.code === country)?.label ?? country;
}

// ── Suggestions ─────────────────────────────────────────────────────────────

export const PROMO_SUGGESTION_LIMITS = {
  name: 120,
  link: 300,
  howToSubmit: 400,
  note: 500,
} as const;

export type PromoSuggestionInput = {
  name: string;
  kind: PromoChannelKind;
  country: string | null;
  url: string;
  howToSubmit: string | null;
  note: string | null;
};

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max + 1) : '';

/** Validate a suggestion from the body of a request. Every message is a full
 *  sentence a person can act on. */
export function parsePromoSuggestion(
  body: unknown
): { ok: true; value: PromoSuggestionInput } | { ok: false; message: string } {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const name = clean(input.name, PROMO_SUGGESTION_LIMITS.name);
  if (name.length < 2) return { ok: false, message: 'Add the channel’s name.' };
  if (name.length > PROMO_SUGGESTION_LIMITS.name) return { ok: false, message: 'Keep the name under 120 characters.' };
  if (!isPromoChannelKind(input.kind)) return { ok: false, message: 'Pick a type.' };
  const url = clean(input.url, PROMO_SUGGESTION_LIMITS.link);
  if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url) || url.length > PROMO_SUGGESTION_LIMITS.link) {
    return { ok: false, message: 'Add a link that starts with https://.' };
  }
  const countryRaw = typeof input.country === 'string' ? input.country.trim().toUpperCase() : '';
  const country = countryRaw && /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : null;
  const howToSubmit = clean(input.howToSubmit, PROMO_SUGGESTION_LIMITS.howToSubmit);
  if (howToSubmit.length > PROMO_SUGGESTION_LIMITS.howToSubmit) {
    return { ok: false, message: 'Keep how to submit under 400 characters.' };
  }
  const note = clean(input.note, PROMO_SUGGESTION_LIMITS.note);
  if (note.length > PROMO_SUGGESTION_LIMITS.note) return { ok: false, message: 'Keep the note under 500 characters.' };
  return {
    ok: true,
    value: { name, kind: input.kind, country, url, howToSubmit: howToSubmit || null, note: note || null },
  };
}

/** Postgres and PostgREST codes for "that table does not exist". The directory
 *  degrades to an empty, quiet state when the migration is not applied yet,
 *  rather than a crash; this is NOT the deprecated schema-missing fallback (no
 *  SQL is returned to anyone). */
export function isMissingTableError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the table/i.test(error.message || '');
}
