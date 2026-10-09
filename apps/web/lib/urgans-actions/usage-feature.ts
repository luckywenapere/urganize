import type { AiUsageFeature } from '@/lib/ai/usage-log';

/**
 * Which usage-log feature each embedded action's model calls belong to
 * (lib/ai/usage-log.ts). The log sums cost per release per feature, so a plan,
 * a press-kit draft and a pitch kit have to stay apart.
 *
 * Keyed by action id and held complete by usage-feature.test.ts, which walks the
 * registry: an action added without a label fails there, not silently in
 * production as a run that was never recorded.
 */
const FEATURE_BY_ACTION: Readonly<Record<string, AiUsageFeature>> = {
  'release.draft_plan': 'plan',
  'presskit.draft_section': 'press_kit',
  'epk.fill_both': 'pitch_kit',
  'release.draft_spotify_pitch': 'spotify_pitch',
};

export function usageFeatureForAction(actionId: string): AiUsageFeature | null {
  return FEATURE_BY_ACTION[actionId] ?? null;
}
