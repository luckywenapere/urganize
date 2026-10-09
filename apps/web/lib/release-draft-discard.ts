import { readPlannerPending } from './release-planner-pending';
import { DEFAULT_RELEASE_TITLE } from '@/types/releases';
import type { PlanReleaseType } from './release-planning';
import type { PlannerIntakePayload } from '@/stores/usePlannerStore';

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
 *  - it is still a draft, with no date, no description and no cover art, and
 *    its title is either the default or EXACTLY the one it was created with
 *    (the create step takes an optional title since 2026-10-09, v1.91.3), so
 *    nothing was typed into it after the planner opened. The created title is
 *    supplied by the caller that made the rollout a moment ago; a title that
 *    differs from it (a rename) is a no;
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

/** The releases.title column's cap, mirrored from the create route. */
const MAX_TITLE_LENGTH = 140;

/**
 * The title the rollout was created with, as the caller reported it, or null
 * when it is missing, blank, the default, or too long to be a real title. Only
 * a usable value ever widens the rule, so a bad one falls back to the
 * default-title-only check (the v1.91.1 behaviour).
 */
export function normalizeCreatedTitle(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TITLE_LENGTH) return null;
  if (trimmed === DEFAULT_RELEASE_TITLE) return null;
  return trimmed;
}

/** True when the title is the default or exactly the one it was created with. */
export function isTitleUntouched(title: string | null, createdTitle?: string | null): boolean {
  const current = (title ?? '').trim();
  if (current === DEFAULT_RELEASE_TITLE) return true;
  const created = normalizeCreatedTitle(createdTitle);
  return created !== null && current === created;
}

/**
 * The DELETE the planner sends when it is closed early. The created title
 * rides along only when it is a real one, so an untitled shell sends exactly
 * the v1.91.1 request.
 */
export function buildDraftDiscardPath(releaseId: string, createdTitle?: string | null): string {
  const params = new URLSearchParams({ onlyIfUntouchedDraft: '1' });
  const created = normalizeCreatedTitle(createdTitle);
  if (created) params.set('createdTitle', created);
  return `/api/releases/${encodeURIComponent(releaseId)}?${params.toString()}`;
}

/**
 * The planner intake for a rollout a create step made a moment ago only so the
 * planner had something to plan (v1.92.1). Every create path builds it here,
 * so closing the planner early discards the empty shell the same way wherever
 * the rollout was made: Home, the UrgAns page, the workspace, and the
 * AppShell's global "+ New rollout" modal (which used to omit it and leave an
 * "Untitled rollout" behind). The discard itself is still only ever what the
 * server allows under decideDraftDiscard below, so anything touched is kept.
 */
export function buildCreatedRolloutIntake(input: {
  releaseId: string;
  /** The title the server saved (CreateReleaseModal's result.savedTitle). */
  savedTitle?: string | null;
  /** The type picked in the create modal, or null when it was never asked. */
  releaseType?: PlanReleaseType | null;
}): PlannerIntakePayload {
  return {
    source: 'empty_state',
    releaseId: input.releaseId,
    discardIfAbandoned: true,
    createdTitle: input.savedTitle ?? null,
    ...(input.releaseType ? { prefill: { releaseType: input.releaseType } } : {}),
  };
}

export function decideDraftDiscard(
  release: DraftDiscardRelease,
  counts: DraftDiscardCounts,
  now: Date = new Date(),
  /** The title the caller created this rollout with, if it gave one. */
  createdTitle: string | null = null
): DraftDiscardDecision {
  if (!readPlannerPending(release.metadata)) return { discard: false, reason: 'not_planner_pending' };
  const metadataKeys = release.metadata ? Object.keys(release.metadata) : [];
  if (metadataKeys.some((key) => !ALLOWED_METADATA_KEYS.has(key))) {
    return { discard: false, reason: 'edited' };
  }

  if (release.status !== 'draft') return { discard: false, reason: 'not_draft' };

  if (!isTitleUntouched(release.title, createdTitle)) return { discard: false, reason: 'edited' };
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
