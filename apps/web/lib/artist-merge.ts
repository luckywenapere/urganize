import { normalizeReleaseSlug } from '@/lib/release-ops';

// Finding and joining duplicate artists (2026-10-29, #865, founder approved
// the mock "artist-fuse"). Pure: no IO, shared by the server (which pairs to
// offer) and the import dialog (which roster artist to ask about).

/** Lowercase words with accents, symbols and extra spaces gone. */
function words(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const MIN_MATCH_LETTERS = 3;

/**
 * True when two names are probably one artist: the same once case, spaces and
 * symbols are ignored, or one name's words sit inside the other's as whole
 * words ("Dorian" in "Babyboy Dorian"). Never on part of a word, and never on
 * a name shorter than three letters, so "DJ" does not pull in every DJ.
 */
export function namesLookAlike(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short.join('').length < MIN_MATCH_LETTERS) return false;
  if (wa.join('') === wb.join('')) return true;
  for (let start = 0; start + short.length <= long.length; start += 1) {
    if (short.every((word, index) => long[start + index] === word)) return true;
  }
  return false;
}

/** One side of a pair the Artists page asks about, as the API sends it. */
export type MergeSide = {
  id: string;
  name: string;
  photoUrl: string | null;
  rollouts: number;
  pastReleases: number;
};

export type DuplicatePair = { keep: MergeSide; drop: MergeSide };

export type MergeCandidate = {
  id: string;
  name: string;
  createdVia: 'manual' | 'import';
  hasPhoto: boolean;
  rollouts: number;
  createdAt: string;
};

/**
 * Which of two look-alike artists stays. The one the team made beats one the
 * import made; then the one with a photo; then more rollouts; then the older.
 */
export function chooseSurvivor<T extends MergeCandidate>(a: T, b: T): { keep: T; drop: T } {
  const score = (artist: T) => [
    artist.createdVia === 'manual' ? 1 : 0,
    artist.hasPhoto ? 1 : 0,
    artist.rollouts,
    -Date.parse(artist.createdAt || '') || 0,
  ];
  const sa = score(a);
  const sb = score(b);
  for (let index = 0; index < sa.length; index += 1) {
    if (sa[index] !== sb[index]) return sa[index] > sb[index] ? { keep: a, drop: b } : { keep: b, drop: a };
  }
  return { keep: a, drop: b };
}

/** One key per pair, whatever the order. Matches artist_merge_dismissals (a < b). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * The pairs to ask about, oldest roster entry first. Each artist appears in at
 * most one pair per pass: after a join the roster changes and the next visit
 * asks about what is left.
 */
export function findDuplicatePairs<T extends MergeCandidate>(
  artists: readonly T[],
  dismissed: ReadonlySet<string>
): Array<{ keep: T; drop: T }> {
  const used = new Set<string>();
  const pairs: Array<{ keep: T; drop: T }> = [];
  for (let i = 0; i < artists.length; i += 1) {
    for (let j = i + 1; j < artists.length; j += 1) {
      const a = artists[i];
      const b = artists[j];
      if (used.has(a.id) || used.has(b.id)) continue;
      if (dismissed.has(pairKey(a.id, b.id))) continue;
      if (!namesLookAlike(a.name, b.name)) continue;
      used.add(a.id);
      used.add(b.id);
      pairs.push(chooseSurvivor(a, b));
    }
  }
  return pairs;
}

/**
 * May this person add imported releases onto this artist on their team? The
 * owner always; a teammate unless they are a guest or limited to a different
 * artist. Read-only and no membership both say no.
 */
export function canImportOnto(input: {
  isOwner: boolean;
  role: string | undefined;
  scopeArtistId: string | null;
  artistId: string;
}): boolean {
  if (input.isOwner) return true;
  if (!input.role || input.role === 'guest') return false;
  return !input.scopeArtistId || input.scopeArtistId === input.artistId;
}

/**
 * Roster artists a picked import looks like. An exact name is left out: the
 * import already adds the releases to that artist without asking.
 */
export function findRosterMatches<T extends { id: string; name: string }>(name: string, roster: readonly T[]): T[] {
  const slug = normalizeReleaseSlug(name);
  return roster.filter((artist) => normalizeReleaseSlug(artist.name) !== slug && namesLookAlike(name, artist.name));
}
