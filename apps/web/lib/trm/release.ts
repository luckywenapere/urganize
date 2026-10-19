// Send to TRM (URG-392): what TRM needs, what is missing, and the package we
// send. Pure (no I/O, clock passed in), so it is unit-tested directly.
//
// READINESS = TRM'S CONTRACT. TRM refuses (422) a release that lacks any of the
// required fields in openapi 1.2.0. Everything with a safe industry default is
// pre-filled (label, copyright, stores, rights and policies) and shown as one
// "Rights & policies · Defaults" row; only facts we cannot guess block: the
// release date (14+ days out), cover art, genre, language, explicit, writers,
// producers and royalty splits that add up.
//
// v1 IS SINGLES ONLY (founder, Oct 19, 2026). A rollout holds one song, which
// is track 1. An EP or album says "Singles first" rather than sending half.

import { DSP_MIME_TYPES, DSP_MIN_EDGE } from '../cover-art-dsp';
import type { DistributionFieldPath } from '../distribution-rules';
import { isDefaultReleaseTitle } from '@/types/releases';
import type { TrmPolicy, TrmReleaseInput } from './client';
import type { TrmStatus } from './webhook';

export const TRM_MIN_LEAD_DAYS = 14;
export const TRM_AUDIO_MAX_BYTES = 157_286_400; // 150 MB
export const TRM_ARTWORK_MAX_BYTES = 20 * 1024 * 1024;
export const TRM_SIGNUP_URL = 'https://therealmusicdistro.com/urganize/';
export const TRM_TERMS_URL = 'https://therealmusicdistro.com/terms-conditions/';
export const TRM_PARTNER = 'trm';

export const TRM_POLICIES: readonly TrmPolicy[] = ['Monetize', 'Track', 'Block', 'None'];
export const SOUNDEXCHANGE_POLICIES = ['Claim from Inception', 'Claim from Today', 'Do not claim'] as const;

export type TrmSettings = {
  label: string | null;
  countryOfRecording: string;
  youtubePolicy: TrmPolicy;
  facebookPolicy: TrmPolicy;
  soundexchangePolicy: string;
  stores: string[];
};

export const DEFAULT_TRM_SETTINGS: TrmSettings = {
  label: null,
  countryOfRecording: 'Nigeria',
  youtubePolicy: 'Monetize',
  facebookPolicy: 'Monetize',
  soundexchangePolicy: 'Claim from Inception',
  stores: ['all'],
};

const isPolicy = (v: unknown): v is TrmPolicy => typeof v === 'string' && (TRM_POLICIES as readonly string[]).includes(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Stored settings, read defensively over the defaults. */
export function readTrmSettings(stored: unknown): TrmSettings {
  const s = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const stores = Array.isArray(s.stores) ? s.stores.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  return {
    label: text(s.label),
    countryOfRecording: text(s.countryOfRecording) ?? DEFAULT_TRM_SETTINGS.countryOfRecording,
    youtubePolicy: isPolicy(s.youtubePolicy) ? s.youtubePolicy : DEFAULT_TRM_SETTINGS.youtubePolicy,
    facebookPolicy: isPolicy(s.facebookPolicy) ? s.facebookPolicy : DEFAULT_TRM_SETTINGS.facebookPolicy,
    soundexchangePolicy: text(s.soundexchangePolicy) ?? DEFAULT_TRM_SETTINGS.soundexchangePolicy,
    stores: stores.length ? stores : DEFAULT_TRM_SETTINGS.stores,
  };
}

export type TrmCredit = {
  name: string;
  roles: readonly string[];
  songwriterSplit: number | null;
  masterSplit: number | null;
};

export type TrmFacts = {
  releaseId: string;
  title: string;
  primaryArtist: string;
  releaseType: 'single' | 'ep' | 'album' | null;
  releaseDate: string | null;
  genre: string | null;
  language: string | null;
  explicit: boolean | null;
  isrc: string | null;
  upc: string | null;
  labelName: string | null;
  featuredArtists: string | null;
  lyrics: string | null;
  artwork: { mimeType: string | null; width: number | null; height: number | null; sizeBytes: number | null } | null;
  credits: TrmCredit[];
};

const WRITER_ROLES = ['songwriter', 'composer', 'lyricist'];
const ROLE_LABEL: Record<string, string> = {
  songwriter: 'Songwriter',
  composer: 'Composer',
  lyricist: 'Lyricist',
  producer: 'Producer',
  vocalist: 'Vocalist',
  musician: 'Musician',
  engineer: 'Engineer',
  mixing_engineer: 'Mixing Engineer',
  mastering_engineer: 'Mastering Engineer',
  other: 'Other',
};

export const writersOf = (credits: readonly TrmCredit[]) =>
  credits.filter((c) => c.name.trim() && c.roles.some((r) => WRITER_ROLES.includes(r)));
export const producersOf = (credits: readonly TrmCredit[]) =>
  credits.filter((c) => c.name.trim() && c.roles.includes('producer'));

/** Master splits when the team filled them; otherwise 100% to the artist. */
export function royaltySplits(facts: TrmFacts): { splits: Array<{ name: string; percentage: number }>; total: number; fromCredits: boolean } {
  const answered = facts.credits.filter((c) => c.name.trim() && typeof c.masterSplit === 'number' && c.masterSplit > 0);
  if (answered.length === 0) {
    return { splits: [{ name: facts.primaryArtist.trim(), percentage: 100 }], total: 100, fromCredits: false };
  }
  const splits = answered.map((c) => ({ name: c.name.trim(), percentage: Math.round((c.masterSplit as number) * 100) / 100 }));
  const total = Math.round(splits.reduce((sum, s) => sum + s.percentage, 0) * 100) / 100;
  return { splits, total, fromCredits: true };
}

// ---------------------------------------------------------------------------
// Calendar days (UTC, like lib/distribution.ts)
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const ymdMs = (ymd: string | null): number | null => {
  if (!ymd) return null;
  const ms = Date.parse(`${ymd.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
};
const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** The earliest release date TRM would take if sent today. */
export function earliestTrmDate(today: Date): string {
  return new Date(startOfDay(today) + TRM_MIN_LEAD_DAYS * DAY).toISOString().slice(0, 10);
}

export function daysOut(releaseDate: string | null, today: Date): number | null {
  const ms = ymdMs(releaseDate);
  return ms === null ? null : Math.round((ms - startOfDay(today)) / DAY);
}

export function formatShortDay(ymd: string | null): string {
  const ms = ymdMs(ymd);
  if (ms === null) return '';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(ms));
}

const formatBytes = (bytes: number | null): string | null => {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

// ---------------------------------------------------------------------------
// The checklist the Distribute step shows
// ---------------------------------------------------------------------------

/** Which handoff item owns the row (for the owner avatar). */
export type TrmRowOwnerItem = 'cover_art' | 'metadata';
export type TrmRowAction = 'move' | 'upload' | 'ask' | 'fix';

export type TrmRow = {
  key: string;
  title: string;
  detail: string;
  ok: boolean;
  fix: DistributionFieldPath | null;
  action: TrmRowAction | null;
  ownerItem: TrmRowOwnerItem;
};

export type TrmChecklist = {
  blocking: TrmRow[];
  ready: TrmRow[];
  earliestDate: string;
  singlesOnly: boolean;
};

export function trmChecklist(facts: TrmFacts, settings: TrmSettings, today: Date): TrmChecklist {
  const blocking: TrmRow[] = [];
  const ready: TrmRow[] = [];
  const earliest = earliestTrmDate(today);
  const block = (row: Omit<TrmRow, 'ok'>) => blocking.push({ ...row, ok: false });

  if (isDefaultReleaseTitle(facts.title)) {
    block({ key: 'title', title: 'Title', detail: 'Not set', fix: 'title', action: 'fix', ownerItem: 'metadata' });
  }
  if (!facts.primaryArtist.trim()) {
    block({ key: 'artist', title: 'Artist', detail: 'Not set', fix: 'artist', action: 'fix', ownerItem: 'metadata' });
  }

  // Release date: TRM needs 14 days from submission.
  const out = daysOut(facts.releaseDate, today);
  if (out === null) {
    block({ key: 'release_date', title: 'Release date', detail: `Not set · TRM needs ${TRM_MIN_LEAD_DAYS} days`, fix: 'release_date', action: 'move', ownerItem: 'metadata' });
  } else if (out < TRM_MIN_LEAD_DAYS) {
    const when = out < 0 ? 'Date has passed' : out === 0 ? 'Out today' : `${out} ${out === 1 ? 'day' : 'days'} out`;
    block({
      key: 'release_date',
      title: 'Release date',
      detail: `${when} · TRM needs ${TRM_MIN_LEAD_DAYS}`,
      fix: 'release_date',
      action: 'move',
      ownerItem: 'metadata',
    });
  }

  // Cover art: the DSP check, plus TRM's 20 MB cap.
  const art = facts.artwork;
  const known = art && typeof art.width === 'number' && typeof art.height === 'number' && art.width > 0 && art.height > 0;
  const fmt = art?.mimeType?.toLowerCase().includes('png') ? 'PNG' : art?.mimeType?.toLowerCase().includes('jp') ? 'JPG' : null;
  const size = known ? `${Math.round(art.width as number)} × ${Math.round(art.height as number)}` : null;
  let artProblem: string | null = null;
  if (!art) artProblem = 'Not added';
  else if (!DSP_MIME_TYPES.includes((art.mimeType ?? '').toLowerCase())) artProblem = 'Has to be JPG or PNG';
  else if (!known) artProblem = `Size unknown · needs ${DSP_MIN_EDGE} × ${DSP_MIN_EDGE}`;
  else if (Math.round(art.width as number) !== Math.round(art.height as number)) artProblem = `${size} · has to be square`;
  else if (Math.min(art.width as number, art.height as number) < DSP_MIN_EDGE) artProblem = `${size} · needs ${DSP_MIN_EDGE} × ${DSP_MIN_EDGE}`;
  else if (art.sizeBytes && art.sizeBytes > TRM_ARTWORK_MAX_BYTES) artProblem = `${formatBytes(art.sizeBytes)} · TRM takes up to 20 MB`;
  if (artProblem) {
    block({ key: 'cover_art', title: 'Cover art', detail: artProblem, fix: 'artwork', action: 'upload', ownerItem: 'cover_art' });
  } else {
    ready.push({
      key: 'cover_art',
      title: 'Cover art',
      detail: [size, fmt, formatBytes(art?.sizeBytes ?? null)].filter(Boolean).join(' · '),
      ok: true,
      fix: 'artwork',
      action: null,
      ownerItem: 'cover_art',
    });
  }

  // Credits & splits.
  const writers = writersOf(facts.credits);
  const producers = producersOf(facts.credits);
  const splits = royaltySplits(facts);
  let creditProblem: string | null = null;
  if (writers.length === 0 && producers.length === 0) creditProblem = 'No writers or producers yet';
  else if (writers.length === 0) creditProblem = 'No writers yet';
  else if (producers.length === 0) creditProblem = 'No producer yet';
  else if (splits.fromCredits && Math.abs(splits.total - 100) > 0.01) creditProblem = `Splits add up to ${splits.total}% · need 100%`;
  if (creditProblem) {
    block({
      key: 'credits',
      title: 'Credits & splits',
      detail: creditProblem,
      fix: creditProblem.startsWith('Splits') ? 'credits.splits' : 'credits',
      action: 'ask',
      ownerItem: 'metadata',
    });
  } else {
    ready.push({
      key: 'credits',
      title: 'Credits & splits',
      detail: [
        `${writers.length} ${writers.length === 1 ? 'writer' : 'writers'}`,
        `${producers.length} ${producers.length === 1 ? 'producer' : 'producers'}`,
        splits.fromCredits ? 'splits 100%' : `100% to ${facts.primaryArtist.trim() || 'the artist'}`,
      ].join(' · '),
      ok: true,
      fix: 'credits',
      action: null,
      ownerItem: 'metadata',
    });
  }

  // Details: one blocking row per missing fact, one ready row for the rest.
  const shown: string[] = [];
  if (facts.genre?.trim()) shown.push(facts.genre.trim());
  else block({ key: 'genre', title: 'Genre', detail: 'Not set', fix: 'metadata.genre', action: 'fix', ownerItem: 'metadata' });
  if (facts.language?.trim()) shown.push(facts.language.trim());
  else block({ key: 'language', title: 'Language', detail: 'Not set', fix: 'metadata.language', action: 'fix', ownerItem: 'metadata' });
  if (facts.explicit === true || facts.explicit === false) shown.push(facts.explicit ? 'Explicit' : 'Clean');
  else block({ key: 'explicit', title: 'Explicit', detail: 'Not answered', fix: 'metadata.explicit', action: 'fix', ownerItem: 'metadata' });
  shown.push(settings.label ?? facts.labelName?.trim() ?? 'Independent');
  ready.push({ key: 'details', title: 'Details', detail: shown.join(' · '), ok: true, fix: 'metadata.genre', action: null, ownerItem: 'metadata' });

  ready.push({
    key: 'rights',
    title: 'Rights & policies',
    detail: isDefaultSettings(settings) ? 'Defaults · Worldwide' : 'Edited · Worldwide',
    ok: true,
    fix: null,
    action: null,
    ownerItem: 'metadata',
  });

  const ORDER = ['cover_art', 'details', 'credits', 'rights'];
  ready.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return { blocking, ready, earliestDate: earliest, singlesOnly: facts.releaseType !== null && facts.releaseType !== 'single' };
}

export function isDefaultSettings(s: TrmSettings): boolean {
  return (
    !s.label &&
    s.countryOfRecording === DEFAULT_TRM_SETTINGS.countryOfRecording &&
    s.youtubePolicy === DEFAULT_TRM_SETTINGS.youtubePolicy &&
    s.facebookPolicy === DEFAULT_TRM_SETTINGS.facebookPolicy &&
    s.soundexchangePolicy === DEFAULT_TRM_SETTINGS.soundexchangePolicy &&
    s.stores.length === 1 &&
    s.stores[0] === 'all'
  );
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

const RELEASE_TYPE: Record<'single' | 'ep' | 'album', TrmReleaseInput['release_type']> = {
  single: 'Single',
  ep: 'EP',
  album: 'Album',
};

const splitNames = (value: string | null): string[] =>
  (value ?? '')
    .split(/[,;&]|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

/** The ReleaseInput TRM gets. Call only on a release with no blocking rows. */
export function buildTrmReleaseInput(facts: TrmFacts, settings: TrmSettings, artistEmail: string): TrmReleaseInput {
  const year = Number((facts.releaseDate ?? '').slice(0, 4)) || new Date().getUTCFullYear();
  const featured = splitNames(facts.featuredArtists);
  const writers = writersOf(facts.credits).map((c) => ({
    name: c.name.trim(),
    role: ROLE_LABEL[c.roles.find((r) => WRITER_ROLES.includes(r)) ?? 'songwriter'],
  }));
  const producers = producersOf(facts.credits).map((c) => ({ name: c.name.trim(), role: 'Producer' }));
  const other = facts.credits
    .filter((c) => c.name.trim())
    .flatMap((c) =>
      c.roles
        .filter((r) => !WRITER_ROLES.includes(r) && r !== 'producer' && r !== 'featured_artist' && ROLE_LABEL[r])
        .map((r) => ({ name: c.name.trim(), role: ROLE_LABEL[r] }))
    );
  const upc = facts.upc && /^\d{12,14}$/.test(facts.upc.trim()) ? facts.upc.trim() : null;
  const label = settings.label ?? facts.labelName?.trim() ?? 'Independent';
  return {
    external_release_id: facts.releaseId,
    artist_email: artistEmail.trim().toLowerCase(),
    schema_version: '1.0',
    title: facts.title.trim(),
    primary_artist: facts.primaryArtist.trim(),
    featured_artist: featured.length ? featured.join(', ') : null,
    release_type: RELEASE_TYPE[facts.releaseType ?? 'single'],
    genre: (facts.genre ?? '').trim(),
    release_date: (facts.releaseDate ?? '').slice(0, 10),
    upc,
    label,
    copyright_name: facts.primaryArtist.trim(),
    copyright_year: year,
    language: (facts.language ?? '').trim(),
    explicit: facts.explicit === true,
    stores: settings.stores,
    metadata: { source: 'urganize' },
    tracks: [
      {
        sequence: 1,
        title: facts.title.trim(),
        primary_artist: facts.primaryArtist.trim(),
        featured_artists: featured,
        isrc: facts.isrc?.trim() || null,
        genre: (facts.genre ?? '').trim(),
        language: (facts.language ?? '').trim(),
        explicit: facts.explicit === true,
        writers,
        producers,
        other_credits: other,
        royalty_splits: royaltySplits(facts).splits,
        country_of_recording: settings.countryOfRecording,
        lyrics: facts.lyrics?.trim() || null,
        owns_sound_recording: true,
        sound_recording_territories: ['Worldwide'],
        collect_publishing_royalties: true,
        composition_territories: ['Worldwide'],
        youtube_policy: settings.youtubePolicy,
        facebook_policy: settings.facebookPolicy,
        soundexchange_policy: settings.soundexchangePolicy,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Status: what the chip and the progress line say
// ---------------------------------------------------------------------------

/** Where a submission stands on our side. TRM's statuses plus our own. */
export type SubmissionStatus = TrmStatus | 'preparing' | 'needs_account' | 'waitlisted';

export type TrmHistoryEntry = { status: string; at: string; event?: string | null };

export const PROGRESS_STEPS: ReadonlyArray<{ status: TrmStatus; label: string }> = [
  { status: 'submitted', label: 'Sent' },
  { status: 'validating', label: 'Checking' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'processing', label: 'Delivering' },
  { status: 'published', label: 'In stores' },
];

export const IN_FLIGHT: readonly SubmissionStatus[] = ['submitted', 'validating', 'accepted', 'processing'];

export function chipFor(status: SubmissionStatus | null): { label: string; tone: 'live' | 'error' | 'done' | 'quiet' } | null {
  switch (status) {
    case 'submitted':
      return { label: 'Sent', tone: 'live' };
    case 'validating':
      return { label: 'Checking', tone: 'live' };
    case 'accepted':
      return { label: 'Accepted', tone: 'live' };
    case 'processing':
      return { label: 'Delivering', tone: 'live' };
    case 'published':
      return { label: 'Delivered', tone: 'done' };
    case 'rejected':
      return { label: 'Sent back', tone: 'error' };
    case 'takedown_requested':
      return { label: 'Takedown requested', tone: 'quiet' };
    case 'taken_down':
      return { label: 'Taken down', tone: 'quiet' };
    default:
      return null;
  }
}

export function heroForInFlight(status: SubmissionStatus): string {
  switch (status) {
    case 'submitted':
      return 'Sent to TRM.';
    case 'validating':
      return 'Sent. TRM is checking it.';
    case 'accepted':
      return 'Accepted by TRM.';
    case 'processing':
      return 'Delivering to stores.';
    default:
      return 'Sent to TRM.';
  }
}

/** Progress steps with the time each was reached (from history), for the line. */
export function progressFor(
  status: SubmissionStatus | null,
  history: readonly TrmHistoryEntry[],
  releaseDate: string | null
): Array<{ label: string; done: boolean; current: boolean; at: string | null }> {
  const reachedIndex = PROGRESS_STEPS.findIndex((s) => s.status === status);
  return PROGRESS_STEPS.map((step, index) => {
    const hit = [...history].reverse().find((h) => h.status === step.status);
    const done = reachedIndex >= 0 && index <= reachedIndex;
    return {
      label: step.label,
      done,
      current: index === reachedIndex,
      at: hit?.at ?? (step.status === 'published' && !done ? releaseDate : null),
    };
  });
}

/** Whether a status may move to the next. TRM can go back (rejected after
 *  validating, submitted again after a fix), so only the event time orders. */
export function shouldApply(lastEventAt: string | null, eventAt: string | null): boolean {
  if (!lastEventAt || !eventAt) return true;
  const a = Date.parse(lastEventAt);
  const b = Date.parse(eventAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return b >= a;
}

/**
 * Who may send. OPEN TO EVERYONE (founder, Oct 19, 2026, 03:10 WAT: "ship
 * everything and open it up"; a send bills the artist's own TRM plan, not
 * Urganize). TRM_SEND_ALLOWED_EMAILS, when set, narrows it to that list: a
 * kill switch that needs no deploy of code, only an env change + redeploy.
 */
export function canSendToTrmEmail(email: string | null | undefined, allowlistEnv: string | undefined): boolean {
  if (!email) return false;
  if (!allowlistEnv?.trim()) return true;
  const list = allowlistEnv.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** A plain title for one TRM rejection reason (the fix row's bold line). */
export function rejectionTitle(code: string | null, text: string): string {
  const t = `${code ?? ''} ${text}`.toLowerCase();
  if (/artwork|cover/.test(t)) return 'Cover art';
  if (/producer/.test(t)) return 'Producer credit';
  if (/writer|composer|lyricist/.test(t)) return 'Writer credit';
  if (/split|royalt/.test(t)) return 'Splits';
  if (/audio|master|wav|track file/.test(t)) return 'Master';
  if (/release.?date|date/.test(t)) return 'Release date';
  if (/title/.test(t)) return 'Title';
  if (/genre/.test(t)) return 'Genre';
  if (/isrc|upc/.test(t)) return 'Codes';
  if (/lyric/.test(t)) return 'Lyrics';
  return 'Fix from TRM';
}

/** Where a rejection's Fix goes. */
export function rejectionFix(code: string | null, text: string): DistributionFieldPath | null {
  const t = `${code ?? ''} ${text}`.toLowerCase();
  if (/artwork|cover/.test(t)) return 'artwork';
  if (/split|royalt/.test(t)) return 'credits.splits';
  if (/producer|writer|composer|lyricist|credit/.test(t)) return 'credits';
  if (/release.?date|date/.test(t)) return 'release_date';
  if (/genre/.test(t)) return 'metadata.genre';
  if (/language/.test(t)) return 'metadata.language';
  if (/explicit/.test(t)) return 'metadata.explicit';
  if (/title/.test(t)) return 'title';
  return null;
}
