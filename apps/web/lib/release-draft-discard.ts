import { readPlannerPending } from './release-planner-pending';
import { DEFAULT_RELEASE_TITLE } from '@/types/releases';

/**
 * "Is this rollout an empty shell the planner left behind?" (2026-10-09).
 *
 * Picking Single, EP or Album makes the rollout first and opens the UrgAns
 * planner on top of it. Closing the planner before it finished used to leave
 * that rollout behind: an "Untitled rollout" with no date and 0 of 0 done, one
 * per abandoned try. Closing it now asks the server to discard the shell, and
 * this is the rule the server holds it to.
 *
 * The rule only ever says yes to a rollout NOBODY HAS TOUCHED, and it fails
 * closed: anything it cannot positively confirm is a no, so the worst case is
 * the old behaviour (the shell stays), never a lost rollout. It is yes only
 * when every one of these holds:
 *
 *  - it is still waiting for its plan (planner_pending), so the planner never
 *    built anything, and its metadata carries nothing else;
 *  - it is still a draft, with the default title, no date, no description and
 *    no cover art, so the person typed nothing into it;
 *  - it was made within the last hour, so a shell somebody kept on purpose is
 *    never swept up by a later close;
 *  - it has no activities, groups, files, songs, spend or collaborators, each
 *    counted on the server. A count that could not be read is null, which is a
 *    no rather than a guess.
 *
 * Pure, so every one of those is tested.
 */

export const DRAFT_DISCARD_WINDOW_MS = 60 * 60 * 1000;

export type DraftDiscardRelease = {
  title: string | null;
  status: string | null;
  releaseDate: string | null;
  description: string | null;
  artworkAssetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
};

/** Child rows that would mean somebody worked on it. Null means "could not read". */
export type DraftDiscardCounts = {
  tasks: number | null;
  taskGroups: number | null;
  assets: number | null;
  songs: number | null;
  spend: number | null;
  collaborators: number | null;
};

export type DraftDiscardDecision =
  | { discard: true }
  | {
      discard: false;
      reason:
        | 'not_planner_pending'
        | 'not_draft'
        | 'edited'
        | 'too_old'
        | 'has_content'
        | 'unverifiable';
    };

const ALLOWED_METADATA_KEYS = new Set(['planner_pending']);

export function decideDraftDiscard(
  release: DraftDiscardRelease,
  counts: DraftDiscardCounts,
  now: Date = new Date()
): DraftDiscardDecision {
  if (!readPlannerPending(release.metadata)) return { discard: false, reason: 'not_planner_pending' };
  const metadataKeys = release.metadata ? Object.keys(release.metadata) : [];
  if (metadataKeys.some((key) => !ALLOWED_METADATA_KEYS.has(key))) {
    return { discard: false, reason: 'edited' };
  }

  if (release.status !== 'draft') return { discard: false, reason: 'not_draft' };

  const title = (release.title ?? '').trim();
  if (title !== DEFAULT_RELEASE_TITLE) return { discard: false, reason: 'edited' };
  if (release.releaseDate) return { discard: false, reason: 'edited' };
  if ((release.description ?? '').trim()) return { discard: false, reason: 'edited' };
  if (release.artworkAssetId) return { discard: false, reason: 'edited' };

  const created = release.createdAt ? new Date(release.createdAt).getTime() : Number.NaN;
  if (!Number.isFinite(created)) return { discard: false, reason: 'unverifiable' };
  const age = now.getTime() - created;
  if (age < 0 || age > DRAFT_DISCARD_WINDOW_MS) return { discard: false, reason: 'too_old' };

  const values = Object.values(counts);
  if (values.some((value) => value === null || !Number.isFinite(value))) {
    return { discard: false, reason: 'unverifiable' };
  }
  if (values.some((value) => (value as number) > 0)) return { discard: false, reason: 'has_content' };

  return { discard: true };
}
