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
  artistName: string;
  status: ReleaseStatus;
  state: ReleasePipelineState;
  releaseDate: string | null;
  description: string | null;
  readinessScore: number;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionRelease extends Release {
  // Add any execution-specific fields if they differ from core Release
}
