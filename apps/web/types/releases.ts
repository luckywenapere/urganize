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
  readinessScore: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
