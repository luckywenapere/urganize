import { ROLE_WORK } from './directory-hire';
import type { DirectoryRole } from './directory-roles';

/**
 * "Work on Urganize" on a person's page (#1221): the pieces of work they
 * delivered, from delivery records. Pure.
 *
 * A ROLLOUT IS NAMED ONLY ONCE IT IS PUBLIC. Nothing in the schema marks a
 * rollout public or private, so "public" here means it has come out: its
 * release date is today or earlier. Before that the title, the artist and the
 * date may be a secret, so a private piece still counts but shows none of
 * them. Test rollouts never show.
 */

export type WorkRecord = {
  releaseId: string;
  role: DirectoryRole;
  releaseTitle: string;
  artistName: string;
  releaseDate: string | null;
  isTest: boolean;
};

export type WorkPiece = {
  key: string;
  /** "Cover art". */
  work: string;
  /** Null for a rollout that is not out yet. */
  title: string | null;
  artistName: string | null;
  /** YYYY-MM-DD, null when private. */
  outOn: string | null;
};

/** Out on or before `today` (both YYYY-MM-DD). */
export function isRolloutPublic(releaseDate: string | null | undefined, today: string): boolean {
  const date = (releaseDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date <= today;
}

export function workPieces(records: readonly WorkRecord[], today: string): WorkPiece[] {
  const seen = new Set<string>();
  const pieces: (WorkPiece & { sort: string })[] = [];
  for (const record of records) {
    if (record.isTest || !record.releaseId) continue;
    const key = `${record.releaseId}:${record.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const open = isRolloutPublic(record.releaseDate, today);
    const title = open ? record.releaseTitle.trim() || null : null;
    const artistName = open ? record.artistName.trim() || null : null;
    const outOn = open ? (record.releaseDate || '').slice(0, 10) : null;
    pieces.push({ key, work: ROLE_WORK[record.role] ?? 'Work', title, artistName, outOn, sort: outOn ?? '' });
  }
  return pieces
    .sort((a, b) => {
      if (a.outOn && !b.outOn) return -1;
      if (!a.outOn && b.outOn) return 1;
      return b.sort.localeCompare(a.sort);
    })
    .map(({ sort: _sort, ...piece }) => piece);
}

/** Managed artists first, then artists from public work, each name once. */
export function worksWith(managed: readonly string[], pieces: readonly WorkPiece[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...managed, ...pieces.map((piece) => piece.artistName ?? '')]) {
    const clean = name.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}
