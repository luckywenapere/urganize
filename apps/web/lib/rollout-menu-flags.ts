import type { RolloutMenuFlags } from './rollout-menu';

/**
 * Which features are switched on, for the rollout menu. Read once at module
 * scope, and in ONE place, because two consumers need the identical answer: the
 * hook that draws the menu (components/workspace/useRolloutMenuActions.ts) and
 * the loading skeleton that reserves the menu's height before the real one
 * arrives (components/loading/RolloutMenuSkeleton.tsx) — which counts the rows
 * with the real builder and these flags, so the placeholder and the menu cannot
 * disagree about how many rows there are.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so each has to be spelled
 * out as a literal `process.env.NEXT_PUBLIC_…` read (a computed lookup would not
 * be replaced). They are handed to the pure builder as an argument, which is
 * what lets that builder be tested in both states of every one of them.
 */
export const ROLLOUT_MENU_FLAGS: RolloutMenuFlags = {
  timeline: process.env.NEXT_PUBLIC_FEATURE_TIMELINE === 'true',
  releaseChat: process.env.NEXT_PUBLIC_FEATURE_RELEASE_CHAT === 'true',
  contentCalendar: process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true',
  pitching: process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true',
  metadata: process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true',
  notes: process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true',
  coverArt: process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true',
  songUpload: process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true',
  files: process.env.NEXT_PUBLIC_FEATURE_FILES === 'true',
  capture: process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true',
};
