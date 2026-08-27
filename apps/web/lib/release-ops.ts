export const ARTISTS_TABLE = 'artists';
export const COLLABORATORS_TABLE = 'collaborators';
export const RELEASE_COLLABORATORS_TABLE = 'release_collaborators';
export const RELEASE_METADATA_TABLE = 'release_metadata';
export const RELEASE_EVENTS_TABLE = 'release_events';

export type ReleaseStatus = 'draft' | 'in_progress' | 'ready';
export type ReleaseEventType =
  | 'release_created'
  | 'collaborator_added'
  | 'metadata_updated'
  | 'metadata_viewed'
  | 'playbook_state_saved'
  | 'playbook_steps_initialized';

export type ReadinessChecklistStatus = 'complete' | 'in_progress' | 'pending' | 'locked';
export type ReadinessChecklistItem = {
  id: 'review_metadata' | 'ready_for_distribution';
  label: string;
  status: ReadinessChecklistStatus;
  detail: string;
};

export type ReadinessNextAction = {
  type: 'view_metadata' | 'none';
  label: string;
};

export type ReleaseSummary = {
  id: string;
  ownerUserId: string;
  artistId: string;
  artistName: string;
  title: string;
  slug: string;
  status: ReleaseStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type ReleaseCollaborator = {
  id: string;
  releaseId: string;
  collaboratorId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  collaboratorName: string;
  stageName: string;
  email: string;
  phone: string;
};

export type ReleaseMetadataSnapshot = {
  id: string;
  releaseId: string;
  isrc: string;
  upc: string;
  /**
   * ISWC for the composition ("T-123456789-1"), issued by a collection
   * society. Release-level and owner-entered, deliberately NOT asked of a
   * collaborator on the public credits form: ISRC identifies the recording,
   * UPC the release, and ISWC the song itself, so all three belong here.
   * Added 2026-08-27.
   */
  iswc: string;
  primaryArtistName: string;
  releaseTitle: string;
  genre: string;
  subgenre: string;
  labelName: string;
  language: string;
  explicit: boolean | null;
  /** Copyright line, e.g. "© 2026 Some Label". Added for URG-108 (metadata hub). */
  cLine: string;
  /** Phonogram (sound-recording) line, e.g. "℗ 2026 Some Label". Added for URG-108. */
  pLine: string;
  /**
   * @deprecated Legacy cover-art URL. As of Phase 3, `releases.artwork_asset_id`
   * (resolved to a signed URL) is the source of truth for cover art; UI cover
   * reads go through `release.coverArtUrl`. This field is still read only as a
   * fallback for pre-Phase-3 releases and remains in the schema. v2 backfills
   * these into the assets table and drops the fallback.
   */
  artworkUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadinessState = {
  basicsComplete: boolean;
  collaboratorsAdded: boolean;
  metadataComplete: boolean;
  metadataSnapshotBuilt: boolean;
  metadataReviewed: boolean;
  readyForDistribution: boolean;
  completionPercent: number;
  pendingCollaborators: number;
  submittedCollaborators: number;
  nextStep: string;
  checklist: ReadinessChecklistItem[];
  nextAction: ReadinessNextAction;
};

const trimString = (value: unknown): string => String(value || '').trim();
export const normalizeReleaseSlug = (value: string): string =>
  trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export const calculateReleaseReadiness = (input: {
  title: string;
  artistName: string;
  collaboratorCount: number;
  submittedCount: number;
  metadata: ReleaseMetadataSnapshot | null;
  metadataViewed: boolean;
}): ReadinessState => {
  const basicsComplete = Boolean(trimString(input.title) && trimString(input.artistName));
  const collaboratorsAdded = input.collaboratorCount > 0;
  const metadataSnapshotBuilt = Boolean(input.metadata);
  const metadataReviewed = metadataSnapshotBuilt && input.metadataViewed;
  const metadataComplete = metadataSnapshotBuilt && metadataReviewed;
  const readyForDistribution = collaboratorsAdded && metadataComplete;
  const pendingCollaborators = Math.max(input.collaboratorCount - input.submittedCount, 0);

  const reviewMetadataStatus: ReadinessChecklistStatus = !metadataSnapshotBuilt
    ? 'locked'
    : metadataReviewed
      ? 'complete'
      : 'pending';
  const readyForDistributionStatus: ReadinessChecklistStatus = readyForDistribution ? 'complete' : 'pending';

  const checklist: ReadinessChecklistItem[] = [
    {
      id: 'review_metadata',
      label: 'Review metadata',
      status: reviewMetadataStatus,
      detail: !metadataSnapshotBuilt
        ? 'No metadata available yet'
        : metadataReviewed
          ? 'Metadata reviewed in the full metadata view'
          : 'Open the metadata page to review',
    },
    {
      id: 'ready_for_distribution',
      label: 'Ready for distribution',
      status: readyForDistributionStatus,
      detail: readyForDistribution
        ? 'This release is ready for distribution'
        : 'Waiting for metadata review',
    },
  ];

  const statusWeight: Record<ReadinessChecklistStatus, number> = {
    complete: 1,
    in_progress: 0.5,
    pending: 0,
    locked: 0,
  };
  const completionPercent = Math.round(
    (checklist.reduce((sum, item) => sum + statusWeight[item.status], 0) / checklist.length) * 100
  );

  let nextStep = 'Your release is ready for distribution';
  let nextAction: ReadinessNextAction = {
    type: 'none',
    label: '',
  };
  if (!collaboratorsAdded) {
    nextStep = 'Add collaborators to your release';
  } else if (!metadataComplete) {
    nextStep = 'Review your metadata before distribution';
    nextAction = { type: 'view_metadata', label: 'View Metadata' };
  }

  return {
    basicsComplete,
    collaboratorsAdded,
    metadataComplete,
    metadataSnapshotBuilt,
    metadataReviewed,
    readyForDistribution,
    completionPercent,
    pendingCollaborators,
    submittedCollaborators: input.submittedCount,
    nextStep,
    checklist,
    nextAction,
  };
};
