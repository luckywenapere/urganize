// Freezing the artist's press kit onto a release once it has been delivered.
//
// The artist keeps ONE standing kit and every release reads it live, so an edit
// to the bio reaches every release that has not happened yet. That is wanted
// for an upcoming release and wrong for a finished one: a delivered release is
// a record of what was sent, and rewriting last year's pitch because the bio
// changed would falsify it. So the first time a release counts as delivered,
// the three things its pitch shows from the kit are copied onto the release
// row, and from then on the release reads the copy.
//
// "Delivered" is the product's one existing definition (lib/recap-eligibility,
// also what the directory's delivery records use), decided by the caller. This
// module only plans what to write. Pure, so the rules are unit tested.

export const MAX_SNAPSHOT_TEXT = 4000;

/** What a release's pitch shows from the artist kit. The same fields the live
 *  read produces, so the two are interchangeable at the point of use. */
export type KitSnapshot = {
  id: string;
  artistId: string;
  slug: string;
  state: string;
  publishedAt: string | null;
  descriptor: string;
  shortBio: string;
  contactCount: number;
  /** The first contact's email (2026-10-17, edited inline in Pitch this!).
   *  Snapshots frozen before that day have none and read ''. */
  contactEmail?: string;
};

const clamp = (value: unknown): string =>
  (typeof value === 'string' ? value : '').slice(0, MAX_SNAPSHOT_TEXT);

/** Validate a stored snapshot. Anything that is not one answers null, which the
 *  caller reads as "no snapshot, use the live kit" rather than an error. */
export function readKitSnapshot(raw: unknown): KitSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.slug !== 'string') return null;
  const count = typeof row.contactCount === 'number' && Number.isFinite(row.contactCount)
    ? Math.max(0, Math.floor(row.contactCount))
    : 0;
  return {
    id: row.id,
    artistId: typeof row.artistId === 'string' ? row.artistId : '',
    slug: row.slug,
    state: typeof row.state === 'string' ? row.state : '',
    publishedAt: typeof row.publishedAt === 'string' ? row.publishedAt : null,
    descriptor: clamp(row.descriptor),
    shortBio: clamp(row.shortBio),
    contactCount: count,
    ...(typeof row.contactEmail === 'string' ? { contactEmail: clamp(row.contactEmail) } : {}),
  };
}

export type SnapshotCandidate = {
  id: string;
  ownerUserId: string;
  artistId: string;
};

export type PlannedSnapshot = {
  releaseId: string;
  ownerUserId: string;
  snapshot: KitSnapshot;
};

/**
 * Which delivered releases get a copy of their artist's kit now.
 *
 * A release that already has one is never touched: that is the whole promise,
 * so it is checked here and not left to the writer. A release whose artist has
 * no kit gets nothing, because there is nothing to freeze; it reads the live
 * kit if one is made later, which is harmless for a record that never held one.
 */
export function planKitSnapshots(input: {
  delivered: SnapshotCandidate[];
  alreadySnapshotted: Set<string>;
  kitsByArtist: Map<string, KitSnapshot>;
}): PlannedSnapshot[] {
  const plan: PlannedSnapshot[] = [];
  for (const release of input.delivered) {
    if (input.alreadySnapshotted.has(release.id)) continue;
    if (!release.artistId) continue;
    const kit = input.kitsByArtist.get(release.artistId);
    if (!kit) continue;
    plan.push({
      releaseId: release.id,
      ownerUserId: release.ownerUserId,
      snapshot: {
        ...kit,
        descriptor: clamp(kit.descriptor),
        shortBio: clamp(kit.shortBio),
      },
    });
  }
  return plan;
}
