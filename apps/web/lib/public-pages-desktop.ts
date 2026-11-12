/**
 * Pure rules for the public pages on a computer (#1232, part of #1175; approved
 * mock docs/mocks/public-pages-desktop). The shared brief board, the press
 * kit's bio switch, the credits form's role chips and the curator page's
 * header and playlists all read these. Phones keep their own layouts and do
 * not use them, except where noted.
 */

// ── Shared brief board ──────────────────────────────────────────────────────

/**
 * How big the cover title is drawn. Sized by the longest word so a word never
 * breaks in the middle on a narrow cover card. Only a word too long to fit at
 * the smallest size may break (`breakable`), because otherwise it would spill
 * past the card.
 */
export type CoverTitleSize = { size: 'xl' | 'lg' | 'md' | 'sm'; breakable: boolean };

export function coverTitleSize(title: string): CoverTitleSize {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const longest = words.reduce((max, word) => Math.max(max, Array.from(word).length), 0);
  const total = Array.from(title.trim()).length;
  if (longest <= 7 && total <= 18) return { size: 'xl', breakable: false };
  if (longest <= 10 && total <= 32) return { size: 'lg', breakable: false };
  if (longest <= 14) return { size: 'md', breakable: false };
  if (longest <= 18) return { size: 'sm', breakable: false };
  return { size: 'sm', breakable: true };
}

/** Only real colours reach a style attribute: #rgb, #rrggbb or with alpha. */
export function safeSwatches(palette: readonly string[]): string[] {
  return palette.map((hex) => hex.trim()).filter((hex) => /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex));
}

export type BoardCardKey = 'idea' | 'feels' | 'colours' | 'dates' | 'sound' | 'look';

/** What the public board has to draw. */
export type BoardContent = {
  headline: string;
  idea: string;
  feelsLike: readonly string[];
  notThis: readonly string[];
  palette: readonly string[];
  dates: number;
  links: number;
  images: number;
};

export type BoardCard = { key: BoardCardKey; span: 1 | 2 | 3 | 4 };

export type BoardPlan = {
  /** Rows the cover spans: the rows beside it, at least one. */
  coverRows: number;
  /** Cards beside the cover (three columns wide), in order. */
  beside: BoardCard[];
  /** Cards under it (four columns wide), in order. */
  below: BoardCard[];
};

/** Spans that fill one row of `width` columns with `count` cards. */
function fillRow(count: number, width: 3 | 4): BoardCard['span'][] {
  if (count <= 0) return [];
  if (width === 3) return count === 1 ? [3] : count === 2 ? [1, 2] : [1, 1, 1];
  return count === 1 ? [4] : count === 2 ? [2, 2] : count === 3 ? [1, 1, 2] : [1, 1, 1, 1];
}

/**
 * The board the team sees, read only, with every empty card left out. The
 * cover sits on the left; the idea and then the small cards (it feels,
 * colours, dates) fill the three columns beside it; sounds and the look run
 * full width underneath.
 */
export function planPublicBoard(content: BoardContent): BoardPlan {
  const beside: BoardCard[] = [];
  if (content.headline.trim() || content.idea.trim()) beside.push({ key: 'idea', span: 3 });

  const small: BoardCardKey[] = [];
  if (content.feelsLike.length || content.notThis.length) small.push('feels');
  if (safeSwatches(content.palette).length) small.push('colours');
  if (content.dates > 0) small.push('dates');
  const smallSpans = fillRow(small.length, 3);
  small.forEach((key, index) => beside.push({ key, span: smallSpans[index] }));

  const bottom: BoardCardKey[] = [];
  if (content.links > 0) bottom.push('sound');
  if (content.images > 0) bottom.push('look');
  const bottomSpans = fillRow(bottom.length, 4);
  const below = bottom.map((key, index) => ({ key, span: bottomSpans[index] }));

  const rows = (beside.some((card) => card.key === 'idea') ? 1 : 0) + (small.length ? 1 : 0);
  return { coverRows: Math.max(1, rows), beside, below };
}

/** "Shared by" names the rollout owner by first name, as the guest invite page does. */
export function sharedByName(ownerName: string | null | undefined): string {
  return (ownerName || '').trim().split(/\s+/)[0] || '';
}

// ── Press kit ───────────────────────────────────────────────────────────────

export type BioLength = 'short' | 'medium' | 'long';

const BIO_LENGTHS: { key: BioLength; label: string }[] = [
  { key: 'short', label: 'Short' },
  { key: 'medium', label: 'Medium' },
  { key: 'long', label: 'Long' },
];

/** The bios the team wrote, shortest first. */
export function availableBios(content: Record<string, unknown>): { key: BioLength; label: string; text: string }[] {
  return BIO_LENGTHS.flatMap((entry) => {
    const value = content[entry.key];
    const text = typeof value === 'string' ? value.trim() : '';
    return text ? [{ ...entry, text }] : [];
  });
}

/** Which bio the switch opens on: medium, else the shortest there is. */
export function defaultBioLength(available: readonly { key: BioLength }[]): BioLength | null {
  if (available.some((entry) => entry.key === 'medium')) return 'medium';
  return available[0]?.key ?? null;
}

// ── Credits form ────────────────────────────────────────────────────────────

/** Roles a phone shows before "More". The rest are rarer on a credit form. */
export const FIRST_CREDIT_ROLES = ['songwriter', 'producer', 'vocalist', 'featured_artist', 'engineer'] as const;

/**
 * Where a role chip shows. A computer shows every role and has no "More"; a
 * phone shows the first few, any it has picked, and the rest after "More".
 */
export function creditRoleChipShows(role: string, input: { showAll: boolean; picked: boolean }): 'always' | 'computer' {
  if (input.showAll || input.picked) return 'always';
  return (FIRST_CREDIT_ROLES as readonly string[]).includes(role) ? 'always' : 'computer';
}

// ── Curator page ────────────────────────────────────────────────────────────

/** Up to two initials for a flat tile, never an empty one. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() || '')
    .join('');
  return letters || '?';
}

/** "3 playlists · 2,820 followers", or the count alone when nobody counted. */
export function curatorStatsLine(playlists: number, followers: number): string {
  if (playlists <= 0) return '';
  const count = playlists === 1 ? '1 playlist' : `${playlists.toLocaleString('en')} playlists`;
  return followers > 0 ? `${count} · ${followers.toLocaleString('en')} followers` : count;
}

/** "Wants: Afrobeats, Amapiano", from the genres the curator set. */
export function playlistWants(genres: readonly string[]): string | null {
  const named = genres.map((genre) => genre.trim()).filter(Boolean);
  return named.length ? `Wants: ${named.join(', ')}` : null;
}

/**
 * How pitching works, in three steps. A paid pitch with no reply in 7 days
 * gets its credits back (lib/pitch-credits.ts), so a reply is not promised
 * here: the second step says where the song goes, not that it gets an answer.
 */
export function pitchingSteps(displayName: string): { title: string; body: string }[] {
  const first = displayName.trim().split(/\s+/)[0] || 'The curator';
  return [
    { title: 'Pick a playlist', body: 'Send a song that fits what it wants.' },
    { title: `${first} listens`, body: `Your pitch goes straight to ${first}.` },
    { title: 'You hear back in Urganize', body: 'Replies come to you there.' },
  ];
}
