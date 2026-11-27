/**
 * "Who is this team for?" and its three answers.
 *
 * Its own small file (27 Nov 2026, #1424) because the trial sheet asks it now,
 * and the trial sheet is mounted in the app shell on every page. Importing the
 * answers from lib/onboarding-flow.ts would pull the whole onboarding rule book
 * (and the planner's date rules behind it) into every page. That file re-exports
 * these, so nothing that imported them from there had to change.
 */

import type { OnboardingPersona } from './onboarding';

export type TeamWhoFor = 'artist' | 'manager' | 'label';

export const TEAM_WHO_FOR_QUESTION = 'Who is this team for?';

export const TEAM_WHO_FOR_OPTIONS: ReadonlyArray<{ value: TeamWhoFor; label: string }> = [
  { value: 'artist', label: "Just me, I'm the artist" },
  { value: 'manager', label: 'Artists I manage' },
  { value: 'label', label: 'A label' },
];

export const isTeamWhoFor = (value: unknown): value is TeamWhoFor =>
  value === 'artist' || value === 'manager' || value === 'label';

/** Stored as the onboarding persona, so profiles.role and the plan on the trial sheet follow. */
export function personaForWhoFor(whoFor: TeamWhoFor): OnboardingPersona {
  if (whoFor === 'artist') return 'independent_artist';
  if (whoFor === 'label') return 'label_ar';
  return 'music_manager';
}

export function whoForFromPersona(persona: string | null | undefined): TeamWhoFor | null {
  if (persona === 'independent_artist') return 'artist';
  if (persona === 'label_ar') return 'label';
  if (persona === 'music_manager' || persona === 'artist_team') return 'manager';
  return null;
}
