// Finding a released song's UPC and ISRC on its own (Nov 2026, #1086): the pure
// rules. No network and no database, so every decision is unit-tested directly
// (rules.test.ts).
//
// The finder looks the song up on Deezer, then Spotify, scores each result
// against what we know (title, artist, release day), and only ever offers a
// result for the person to confirm ("Is this your song?"): a wrong match would
// send fans to someone else's song, and the smart link is public. When two or
// more results look equally right, AI picks between them, but it can only pick
// one of the real results, never write a code itself.

import { lagosYmd, normalizeIsrc, normalizeUpc, releaseYmd } from '@/lib/altlink/rules';

export type CodeSource = 'deezer' | 'spotify';

/** One song or release as a streaming service lists it. */
export type CodeCandidate = {
  source: CodeSource;
  /** The service's own id for the track or album. */
  id: string;
  kind: 'track' | 'album';
  title: string;
  artist: string;
  releaseDate: string | null;
  upc: string | null;
  isrc: string | null;
  coverUrl: string | null;
  url: string | null;
};

/** What we know about the rollout. */
export type CodeTarget = {
  title: string;
  artistName: string;
  releaseDate: string | null;
  releaseType: string | null;
};

/** How long "Looking…" waits before looking again (founder, Nov 6, 2026). */
export const LOOKUP_RETRY_MS = 15 * 60 * 1000;
/** Results scored below this are never offered. */
export const MIN_SCORE = 0.6;
/** A best result this far ahead of the next one needs no AI to choose. */
export const CLEAR_LEAD = 0.15;

/** Lowercase, no accents, no "(feat. …)" or "[…]", no " - Single", letters and digits only. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*[([].*?(feat\.?|ft\.?|with|prod\.?|remaster|version|edit|mix)\b.*?[)\]]/g, ' ')
    .replace(/\s+-\s+(single|ep|album)$/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: string): Set<string> {
  return new Set(normalizeName(value).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((token) => {
    if (b.has(token)) shared += 1;
  });
  return shared / (a.size + b.size - shared);
}

/** 1 for the same title, 0.8 when one holds the other, otherwise word overlap. */
export function titleScore(ours: string, theirs: string): number {
  const a = normalizeName(ours);
  const b = normalizeName(theirs);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  return jaccard(tokens(a), tokens(b));
}

/**
 * 1 when our artist is one of theirs ("Dorian" in "Dorian, Tems" or "Dorian
 * feat. Tems"), otherwise word overlap.
 */
export function artistScore(ours: string, theirs: string): number {
  const a = normalizeName(ours);
  if (!a) return 0;
  const parts = theirs
    .split(/,|&| x | feat\.? | ft\.? | and /i)
    .map((part) => normalizeName(part))
    .filter(Boolean);
  if (parts.includes(a) || normalizeName(theirs) === a) return 1;
  return jaccard(tokens(ours), tokens(theirs));
}

/** Close to our release day scores high; an unknown date sits in the middle. */
export function dateScore(ours: string | null, theirs: string | null): number {
  const a = releaseYmd(ours);
  const b = releaseYmd(theirs);
  if (!a || !b) return 0.4;
  const days = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
  if (days <= 1) return 1;
  if (days <= 7) return 0.6;
  if (days <= 30) return 0.3;
  return 0;
}

/** A single wants a track; an EP or album wants the album. */
export function preferredKind(releaseType: string | null): 'track' | 'album' {
  return releaseType === 'ep' || releaseType === 'album' ? 'album' : 'track';
}

export function scoreCandidate(target: CodeTarget, candidate: CodeCandidate): number {
  const title = titleScore(target.title, candidate.title);
  const artist = artistScore(target.artistName, candidate.artist);
  const date = dateScore(target.releaseDate, candidate.releaseDate);
  const kind = candidate.kind === preferredKind(target.releaseType) ? 1 : 0.5;
  const raw = 0.45 * title + 0.35 * artist + 0.12 * date + 0.08 * kind;
  // A wrong artist or a wrong title is never a near miss.
  if (title < 0.5 || artist < 0.5) return Math.min(raw, MIN_SCORE - 0.01);
  return Math.round(raw * 1000) / 1000;
}

/** The key a "No, that's not it" is remembered by. */
export const candidateKey = (candidate: Pick<CodeCandidate, 'source' | 'id'>): string =>
  `${candidate.source}:${candidate.id}`;

/** Only a result that carries a valid code is any use. */
export function hasUsableCode(candidate: CodeCandidate): boolean {
  return Boolean(normalizeUpc(candidate.upc) || normalizeIsrc(candidate.isrc));
}

export type ScoredCandidate = { candidate: CodeCandidate; score: number };

export type MatchDecision =
  | { kind: 'none' }
  | { kind: 'clear'; best: ScoredCandidate }
  /** Several look right: AI chooses between `options` (best first). */
  | { kind: 'ambiguous'; options: ScoredCandidate[] };

const sameCodes = (a: CodeCandidate, b: CodeCandidate): boolean =>
  (Boolean(normalizeUpc(a.upc)) && normalizeUpc(a.upc) === normalizeUpc(b.upc)) ||
  (Boolean(normalizeIsrc(a.isrc)) && normalizeIsrc(a.isrc) === normalizeIsrc(b.isrc));

export function decideMatch(
  target: CodeTarget,
  candidates: readonly CodeCandidate[],
  rejected: readonly string[] = []
): MatchDecision {
  const skip = new Set(rejected);
  const scored = candidates
    .filter((candidate) => hasUsableCode(candidate) && !skip.has(candidateKey(candidate)))
    .map((candidate) => ({ candidate, score: scoreCandidate(target, candidate) }))
    .filter((entry) => entry.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { kind: 'none' };
  const [best, ...rest] = scored;
  // Results that carry the same code are the same song listed twice.
  const rivals = rest.filter((entry) => !sameCodes(entry.candidate, best.candidate));
  if (rivals.length === 0 || best.score - rivals[0].score >= CLEAR_LEAD) return { kind: 'clear', best };
  return { kind: 'ambiguous', options: [best, ...rivals].slice(0, 5) };
}

/** The song has come out (Lagos calendar day), so it can be on streaming. */
export function isOutOn(releaseDate: string | null | undefined, nowMs: number): boolean {
  const day = releaseYmd(releaseDate);
  return Boolean(day && day <= lagosYmd(nowMs));
}

export type LookupStatus = 'found' | 'not_found' | 'rejected' | 'confirmed';

export type LookupState = {
  status: LookupStatus;
  checkedAt: string | null;
};

/**
 * Whether to look on streaming again. A result waiting for an answer, or one
 * already confirmed, is never looked up again; nothing found yet is looked up
 * at most every 15 minutes.
 */
export function isLookupDue(state: LookupState | null, nowMs: number): boolean {
  if (!state) return true;
  if (state.status === 'found' || state.status === 'confirmed') return false;
  if (!state.checkedAt) return true;
  const at = Date.parse(state.checkedAt);
  return !Number.isFinite(at) || nowMs - at >= LOOKUP_RETRY_MS;
}

// ── AI tiebreak ─────────────────────────────────────────────────────────────

export const CODE_MATCH_SCHEMA = {
  name: 'code_match_pick',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['pick'],
    properties: {
      pick: { type: ['integer', 'null'] },
    },
  },
} as const;

export function buildMatchMessages(target: CodeTarget, options: readonly ScoredCandidate[]) {
  const lines = options.map(
    ({ candidate }, index) =>
      `${index}. "${candidate.title}" by ${candidate.artist}, ${candidate.kind}, released ${candidate.releaseDate ?? 'unknown'} (${candidate.source})`
  );
  return [
    {
      role: 'system' as const,
      content:
        'You match a music release to its listing on a streaming service. You are given the release and a numbered list of listings. ' +
        'Answer with the number of the listing that is this exact release by this artist, or null when none of them is. ' +
        'A remix, live version, sped up version, cover or a different artist with the same name is NOT a match. Answer only in JSON.',
    },
    {
      role: 'user' as const,
      content: [
        `Release: "${target.title}" by ${target.artistName}, a ${target.releaseType ?? 'single'}, out ${target.releaseDate ?? 'unknown'}.`,
        'Listings:',
        ...lines,
      ].join('\n'),
    },
  ];
}

/** The model's answer, held to the list it was given. Anything else is no pick. */
export function parseMatchPick(raw: string, optionCount: number): { pick: number | null } | null {
  try {
    const value = JSON.parse(raw) as { pick?: unknown };
    if (value.pick === null) return { pick: null };
    if (typeof value.pick === 'number' && Number.isInteger(value.pick) && value.pick >= 0 && value.pick < optionCount) {
      return { pick: value.pick };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Home: songs out now ─────────────────────────────────────────────────────

/** How long a song stays on Home after release day (Nov 6, 2026). */
export const OUT_NOW_DAYS = 7;

export type OutNowInput = {
  id: string;
  releaseDate: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Rollouts released today or in the six days before (Lagos calendar), newest
 * first. A test rollout or an archived one is never shown.
 */
export function pickOutNow<T extends OutNowInput>(releases: readonly T[], nowMs: number): T[] {
  const today = Date.parse(`${lagosYmd(nowMs)}T00:00:00Z`);
  return releases
    .filter((release) => {
      if (release.status === 'archived') return false;
      if (release.metadata && release.metadata.test_release === true) return false;
      const day = releaseYmd(release.releaseDate);
      if (!day) return false;
      const age = Math.round((today - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
      return age >= 0 && age < OUT_NOW_DAYS;
    })
    .sort((a, b) => String(releaseYmd(b.releaseDate)).localeCompare(String(releaseYmd(a.releaseDate))));
}
