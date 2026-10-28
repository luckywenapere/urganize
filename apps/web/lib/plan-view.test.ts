import { describe, expect, it } from 'vitest';
import { isPlanView, pickPlanView, recallPlanView, rememberPlanView } from './plan-view';

describe('pickPlanView', () => {
  it('uses the last pick over the default', () => {
    expect(pickPlanView({ last: 'activities', fallback: 'timeline', narrowPortrait: false })).toBe('activities');
  });
  it('falls back to the default when nothing was picked', () => {
    expect(pickPlanView({ last: null, fallback: 'timeline', narrowPortrait: false })).toBe('timeline');
  });
  it('never opens the timeline by itself on an upright phone', () => {
    expect(pickPlanView({ last: null, fallback: 'timeline', narrowPortrait: true })).toBe('activities');
    expect(pickPlanView({ last: 'timeline', fallback: 'timeline', narrowPortrait: true })).toBe('activities');
  });
});

describe('plan view memory', () => {
  it('remembers per rollout', () => {
    rememberPlanView('a', 'timeline');
    rememberPlanView('b', 'activities');
    expect(recallPlanView('a')).toBe('timeline');
    expect(recallPlanView('b')).toBe('activities');
    expect(recallPlanView('c')).toBeNull();
  });
  it('knows the two views', () => {
    expect(isPlanView('timeline')).toBe(true);
    expect(isPlanView('brief')).toBe(false);
  });
});
