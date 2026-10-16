import { describe, expect, it } from 'vitest';
import { RELEASE_MENU_ORDER, groupRolloutMenu } from './release-menu';

describe('the rollout menu groups (2026-10-14 declutter)', () => {
  it('puts every key in a group, in Plan, Release, Promote order, corrections last and unlabelled', () => {
    const groups = groupRolloutMenu(RELEASE_MENU_ORDER.map((key) => ({ key })));
    expect(groups.map((g) => g.label)).toEqual(['Plan', 'Release', 'Promote', null]);
    expect(groups.flatMap((g) => g.entries).length).toBe(RELEASE_MENU_ORDER.length);
    expect(groups[0].entries.map((e) => e.key)).toEqual(['timeline', 'activities', 'brief', 'chat', 'calendar', 'spend', 'note']);
    expect(groups[1].entries.map((e) => e.key)).toEqual(['metadata', 'distribute', 'coverart', 'song', 'files']);
    expect(groups[2].entries.map((e) => e.key)).toEqual(['pitch', 'pitchkit', 'promo', 'share', 'capture']);
    expect(groups[3].entries.map((e) => e.key)).toEqual(['change-artist', 'archive']);
  });

  it('drops empty groups', () => {
    expect(groupRolloutMenu([{ key: 'timeline' as const }]).map((g) => g.label)).toEqual(['Plan']);
  });
});
