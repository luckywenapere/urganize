export const RELEASE_PIPELINE_STATES = [
  'idea',
  'planning',
  'asset_prep',
  'distribution',
  'campaign',
  'post_release',
] as const;

export type ReleasePipelineState = (typeof RELEASE_PIPELINE_STATES)[number];

export const RELEASE_STATUS_OPTIONS = [
  'draft',
  'planning',
  'in_progress',
  'ready',
  'released',
  'archived',
] as const;

export type ReleaseStatus = (typeof RELEASE_STATUS_OPTIONS)[number];

/**
 * Applied server-side when a release is created without a title (URG-230 —
 * the title became optional). This exact string was already the read-time
 * fallback in lib/services/release-service.ts for rows with an empty title,
 * so naming it here centralizes one value rather than introducing a second.
 *
 * The UI compares against it to decide whether to offer a rename in
 * SetReleaseDateCard: a release still carrying the default has never been
 * named, and there is no other rename affordance anywhere in the app.
 */
export const DEFAULT_RELEASE_TITLE = 'Untitled release';

export interface Release {
  id: string;
  ownerUserId: string;
  title: string;
  /** FK to public.artists.id. Canonical link, added Phase 1 of the
   * workspace-scoped artists initiative. `artistName` is now a write-through
   * cache derived from artists.name on create/rename — never read it as the
   * source of truth when you need to mutate. UI surfaces keep reading
   * artistName because it's cheap and indexed at the release row. */
  artistId: string;
  /** Write-through cache of `artists.name` at last release create or
   * artist rename. Display path uses this; mutation path must go through
   * artistId. */
  artistName: string;
  status: ReleaseStatus;
  state: ReleasePipelineState;
  releaseDate: string | null;
  description: string | null;
  /** True when this release was created with the Rollout plan but no release
   * date, so its activities have not been generated yet (URG-230). Template
   * offsets are relative to release day, so the plan waits for a date rather
   * than materializing undated. Cleared the moment a date is set via
   * POST /api/releases/[releaseId]/schedule. */
  templatePending: boolean;
  readinessScore: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
