// The Phase 3 nudge: "UrgAns doesn't know your team yet."
//
// Shown in the conversation when UrgAns answers in a team whose brief is
// empty, linking to the editor. A few times, then it stops — a nudge that
// never gives up is nagging, and a manager who has seen it three times and
// not acted has answered it.
//
// Pure state logic here so the stop conditions are unit-testable; the
// component owns the fetch and the render. Storage rides lib/persisted-state
// like every other urganize.* key.

import { readPersistedState, writePersistedState } from './persisted-state';

/** Sessions the nudge appears in before it stops on its own. "A few times"
 *  per the spec — counted per SESSION, not per answer, or three replies in
 *  one conversation would burn the whole budget in a minute. */
export const TEAM_BRIEF_NUDGE_MAX_SHOWS = 3;

const STORAGE_KEY = 'urganize.chappi.brief-nudge';
const STORAGE_VERSION = 1;
/** sessionStorage marker so one browser session counts as ONE show no matter
 *  how many times the surface remounts (the dock and rail remount freely). */
const SESSION_MARKER = 'urganize.chappi.brief-nudge-counted';

export type TeamBriefNudgeState = {
  shows: number;
  dismissed: boolean;
};

const isNudgeState = (value: unknown): value is TeamBriefNudgeState =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as TeamBriefNudgeState).shows === 'number' &&
  typeof (value as TeamBriefNudgeState).dismissed === 'boolean';

/**
 * The whole decision, pure. Dismissal is immediate and permanent; the show
 * cap catches everyone who never clicks anything. Unreadable state counts as
 * fresh — a cleared localStorage restarts the count, which is the harmless
 * direction to be wrong in.
 */
export function shouldShowTeamBriefNudge(state: TeamBriefNudgeState | null): boolean {
  if (!state) return true;
  if (state.dismissed) return false;
  return state.shows < TEAM_BRIEF_NUDGE_MAX_SHOWS;
}

export function readNudgeState(): TeamBriefNudgeState | null {
  return readPersistedState(STORAGE_KEY, STORAGE_VERSION, isNudgeState);
}

/** Count this session's show — once, however many times the surface mounts. */
export function recordNudgeShown(): void {
  try {
    if (window.sessionStorage.getItem(SESSION_MARKER)) return;
    window.sessionStorage.setItem(SESSION_MARKER, '1');
  } catch {
    // Blocked sessionStorage degrades to counting per mount — the nudge stops
    // sooner than intended, never later.
  }
  const state = readNudgeState();
  writePersistedState(STORAGE_KEY, STORAGE_VERSION, {
    shows: (state?.shows ?? 0) + 1,
    dismissed: state?.dismissed ?? false,
  });
}

export function dismissNudge(): void {
  const state = readNudgeState();
  writePersistedState(STORAGE_KEY, STORAGE_VERSION, {
    shows: state?.shows ?? 0,
    dismissed: true,
  });
}
