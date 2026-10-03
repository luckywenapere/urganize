import { describe, expect, it } from 'vitest';

import { AI_USAGE_FEATURES } from '@/lib/ai/usage-log';

import { URGANS_ACTIONS } from './registry';
import { usageFeatureForAction } from './usage-feature';

// Every embedded action makes model calls the usage log has to label. A new
// action with no label would be logged as nothing at all, which is the failure
// the log exists to prevent, so the registry and this map are held together by
// the registry itself rather than by a fixed list.
describe('usageFeatureForAction', () => {
  it('labels every registered action with a feature the log accepts', () => {
    for (const id of Object.keys(URGANS_ACTIONS)) {
      const feature = usageFeatureForAction(id);
      expect(feature, `action ${id} has no usage feature`).not.toBeNull();
      expect(AI_USAGE_FEATURES).toContain(feature);
    }
  });

  it('keeps the three actions apart, so a plan, a press kit draft and a pitch kit are not summed together', () => {
    expect(usageFeatureForAction('release.draft_plan')).toBe('plan');
    expect(usageFeatureForAction('presskit.draft_section')).toBe('press_kit');
    expect(usageFeatureForAction('epk.fill_both')).toBe('pitch_kit');
  });

  it('answers null for an action it does not know', () => {
    expect(usageFeatureForAction('nope.nope')).toBeNull();
  });
});
