/**
 * Phase 3: when the nudge shows, and — more importantly — when it stops.
 *
 * The stop conditions are the feature: a nudge that never gives up is
 * nagging, and one that stops too early never fills a single brief. Storage
 * IO is exercised through jsdom-free stubs? No — these are the PURE half
 * (shouldShowTeamBriefNudge) plus isTeamBriefEmpty; the localStorage plumbing
 * rides lib/persisted-state, which the rest of the app already trusts.
 */

import { describe, expect, it } from 'vitest';
import { isTeamBriefEmpty, type TeamBriefEntry } from './team-brief';
import { TEAM_BRIEF_NUDGE_MAX_SHOWS, shouldShowTeamBriefNudge } from './team-brief-nudge';

const entry = (section: string, content: string): TeamBriefEntry =>
  ({ section, content, updatedAt: null, updatedByName: null }) as TeamBriefEntry;

describe('isTeamBriefEmpty', () => {
  it('treats no entries as empty', () => {
    expect(isTeamBriefEmpty([])).toBe(true);
  });

  // Whitespace-only content injects nothing into the prompt, so for the nudge
  // it does not count as "written" either — the two must agree, or the nudge
  // tells someone their brief is filled while UrgAns reads nothing from it.
  it('treats whitespace-only sections as empty', () => {
    expect(isTeamBriefEmpty([entry('roster', '   '), entry('vocabulary', '\n')])).toBe(true);
  });

  it('one written section is enough to stop the nudge', () => {
    expect(isTeamBriefEmpty([entry('roster', 'Zara'), entry('vocabulary', '')])).toBe(false);
  });
});

describe('shouldShowTeamBriefNudge', () => {
  it('shows on a fresh browser (no stored state)', () => {
    expect(shouldShowTeamBriefNudge(null)).toBe(true);
  });

  it('shows while under the cap', () => {
    expect(shouldShowTeamBriefNudge({ shows: 0, dismissed: false })).toBe(true);
    expect(shouldShowTeamBriefNudge({ shows: TEAM_BRIEF_NUDGE_MAX_SHOWS - 1, dismissed: false })).toBe(
      true
    );
  });

  // "A few times, then stop" — the cap is what keeps a hint from becoming a
  // nag for someone who has decided not to act on it.
  it('stops at the cap on its own, with nobody clicking anything', () => {
    expect(shouldShowTeamBriefNudge({ shows: TEAM_BRIEF_NUDGE_MAX_SHOWS, dismissed: false })).toBe(
      false
    );
    expect(
      shouldShowTeamBriefNudge({ shows: TEAM_BRIEF_NUDGE_MAX_SHOWS + 5, dismissed: false })
    ).toBe(false);
  });

  // Dismissal outranks the counter in both directions: dismissed at zero shows
  // stays gone, and a dismissal can never be undone by the count being low.
  it('a dismissal is permanent regardless of the count', () => {
    expect(shouldShowTeamBriefNudge({ shows: 0, dismissed: true })).toBe(false);
    expect(shouldShowTeamBriefNudge({ shows: 2, dismissed: true })).toBe(false);
  });
});
