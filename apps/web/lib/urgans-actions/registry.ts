// The one place every embedded UrgAns action is registered. server.ts and the
// admin summary both look actions up ONLY through here — never by importing
// an action file directly — so a route/actionType string is always resolved
// against the same set.

import { directoryDraftBioAction } from './actions/directory-draft-bio';
import { epkFillBothAction } from './actions/epk-fill-both';
import { pressKitDraftSectionAction } from './actions/press-kit-draft-section';
import { releaseBriefFromIdeasAction } from './actions/release-brief-from-ideas';
import { releaseDraftBriefAction } from './actions/release-draft-brief';
import { releaseDraftPlanAction } from './actions/release-draft-plan';
import { releaseDraftSpotifyPitchAction } from './actions/release-draft-spotify-pitch';
import type { UrgansActionDefinition } from './types';

/**
 * Stored as UrgansActionDefinition<unknown, unknown, unknown>: this registry
 * is genuinely heterogeneous (a future second action will have its own
 * Input/Output/Result), and the method-shorthand note on UrgansActionDefinition
 * itself is what makes a concretely-typed action (like releaseDraftPlanAction
 * below) assignable into this erased shape without a cast.
 */
export const URGANS_ACTIONS: Record<string, UrgansActionDefinition<unknown, unknown, unknown>> = {
  [releaseDraftPlanAction.id]: releaseDraftPlanAction,
  [pressKitDraftSectionAction.id]: pressKitDraftSectionAction,
  [epkFillBothAction.id]: epkFillBothAction,
  [releaseDraftSpotifyPitchAction.id]: releaseDraftSpotifyPitchAction,
  [directoryDraftBioAction.id]: directoryDraftBioAction,
  [releaseDraftBriefAction.id]: releaseDraftBriefAction,
  [releaseBriefFromIdeasAction.id]: releaseBriefFromIdeasAction,
};

export function getUrgansAction(
  actionType: string
): UrgansActionDefinition<unknown, unknown, unknown> | undefined {
  return URGANS_ACTIONS[actionType];
}

export function listUrgansActionIds(): string[] {
  return Object.keys(URGANS_ACTIONS);
}
