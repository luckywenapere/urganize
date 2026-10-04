import type { Release } from '@/types/releases';

/** One rollout as the workspace holds it: the slim release plus its progress. */
export type ReleaseCardData = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'status' | 'releaseDate'>;
  tasksDone: number;
  tasksTotal: number;
  /** Signed Phase 3 cover-art URL; null/undefined surfaces the neutral
   * placeholder. */
  coverArtUrl?: string | null;
  /** True when the release carries the `test_release` metadata marker and
   * NEXT_PUBLIC_FEATURE_TEST_RELEASE is on (WorkspaceView folds the flag in
   * when it builds the cards). */
  isTest?: boolean;
};

/**
 * The one-tap test path (NEXT_PUBLIC_FEATURE_TEST_RELEASE). Passed only when
 * the flag is on — the gate lives in WorkspaceView; the catalogue stays dumb.
 * `start` creates the canned test release and navigates into it; `error`
 * renders inline under the buttons, because the empty state IS the failure
 * surface for this entry point.
 */
export type TestReleaseEntry = {
  start: () => void;
  isStarting: boolean;
  error: string;
};
