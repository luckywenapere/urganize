/**
 * What the manager already has in hand when planning a release.
 *
 * Split out of release-planning.ts (2026-10-15, perf pass URG-314) so the
 * onboarding/first-session helpers that the auth store imports do not drag
 * the whole planner module into every page's first load. release-planning.ts
 * re-exports both, so existing importers are unchanged.
 */

/** What the manager already has in hand. 'none' is exclusive of the others. */
export type ReadyItem = 'master' | 'artwork' | 'visualizer' | 'distributor' | 'none';

export const READY_TODAY_OPTIONS: Array<{ value: ReadyItem; label: string }> = [
  { value: 'master', label: 'The music is mixed and mastered' },
  { value: 'artwork', label: 'Cover art is ready' },
  { value: 'visualizer', label: 'A video or visualizer is ready' },
  { value: 'distributor', label: 'The distributor is set up' },
  { value: 'none', label: 'None of it yet' },
];
