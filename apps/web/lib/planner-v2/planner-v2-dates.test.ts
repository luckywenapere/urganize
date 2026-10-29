import { describe, expect, it } from 'vitest';

import { GatewayError } from '../ai/gateway-error';
import { getTemplate } from '../release-templates/loader';
import { interpretScheduleResponse } from '../schedule-release-outcome';
import { EMPTY_V2_ANSWERS, parsePlannerV2Answers, type PlannerV2Answers } from './answers';
import { cleanDateAdds, dueDateFor, fallbackDateAdds, parseDateAdds, writeDateAdds, type DateAddsInput } from './dates';
import { buildFallbackPlanV2 } from './fallback';
import type { PlanV2Task } from './plan';
import { V2_STEPS, visibleV2Steps } from './steps';
import { planWindow, validatePlanV2 } from './validate';
import { readUndatedTaskMeta, relativeWhenLabel } from './when';

const answers = (over: Partial<PlannerV2Answers> = {}): PlannerV2Answers => ({
  ...EMPTY_V2_ANSWERS,
  artist_name: 'Test Artist',
  wins: ['playlists'],
  budget: '100k_500k',
  ...over,
});

const task = (over: Partial<PlanV2Task> & { key: string }): PlanV2Task => ({
  library_id: null,
  title: `Task ${over.key}`,
  why: 'Because.',
  done_when: '',
  phase: 'pre_release',
  offset_days: -14,
  duration_days: 1,
  owner_role: 'manager',
  channel: 'none',
  cost_naira: 0,
  depends_on: [],
  first_up: false,
  now: false,
  ...over,
});

describe('the intake never asks for a release date (Oyin, 26 Oct 2026)', () => {
  it('is four answers plus the team for music not out, with no date question', () => {
    for (const stage of ['making', 'finished'] as const) {
      const steps = visibleV2Steps({ stage, prefilledDate: null, todayYmd: '2026-10-26' });
      expect(steps).not.toContain('date');
      expect(steps).toEqual(V2_STEPS.filter((step) => step !== 'date'));
    }
  });

  it('still asks when it came out, unless the rollout already has a past date', () => {
    expect(visibleV2Steps({ stage: 'out', prefilledDate: null, todayYmd: '2026-10-26' })).toContain('date');
    expect(visibleV2Steps({ stage: 'out', prefilledDate: '2026-10-01', todayYmd: '2026-10-26' })).not.toContain('date');
  });

  it('accepts answers with no date', () => {
    const parsed = parsePlannerV2Answers({ ...answers(), release_date: null });
    expect(parsed.ok).toBe(true);
  });
});

describe('an undated plan', () => {
  const ctx = { answers: answers(), releaseDate: null, todayYmd: '2026-10-26' };

  it('runs relative to release day, 8 weeks before to 6 after', () => {
    expect(planWindow(ctx)).toEqual({ min: -56, max: 42 });
  });

  it('needs the distributor and smart link tasks but not a release-day task, and keeps the pace', () => {
    const tasks = [
      task({ key: 't1', channel: 'distribution', offset_days: -42, now: true, title: 'Upload to your distributor' }),
      ...Array.from({ length: 6 }, (_, i) =>
        task({ key: `t${i + 2}`, offset_days: -35 + i * 7, title: i === 4 ? 'Set up and share your smart link' : `Make content ${i}` })
      ),
    ];
    const plan = {
      built_for: { summary: 'Playlist adds, ₦0, run by you.', win: 'x', target: null, constraints: [], start_point: 'finished' as const },
      budget: { total_naira: 0, lines: [] },
      tasks,
      warnings: [],
      assumptions: [],
    };
    expect(validatePlanV2(plan, ctx)).toEqual([]);
    const crowded = { ...plan, tasks: [...tasks, task({ key: 't9', offset_days: -42 }), task({ key: 't10', offset_days: -41 }), task({ key: 't11', offset_days: -40 })] };
    expect(validatePlanV2(crowded, ctx).map((issue) => issue.code)).toContain('pace');
  });

  it('the quick plan holds without a date', () => {
    const plan = buildFallbackPlanV2(getTemplate('single'), ctx);
    expect(validatePlanV2(plan, ctx)).toEqual([]);
  });

  it('reads as Now, weeks before, release week, after release', () => {
    expect(relativeWhenLabel(-30, true)).toBe('Now');
    expect(relativeWhenLabel(-28, false)).toBe('4 weeks before');
    expect(relativeWhenLabel(-7, false)).toBe('1 week before');
    expect(relativeWhenLabel(-3, false)).toBe('Release week');
    expect(relativeWhenLabel(0, false)).toBe('Release day');
    expect(relativeWhenLabel(10, false)).toBe('After release');
    expect(readUndatedTaskMeta({ planner_v2: { offset_days: -28, now: false } })).toEqual({ offset_days: -28, now: false });
    expect(readUndatedTaskMeta({ template: {} })).toBeNull();
  });

  it('turns an offset into a due date from the picked day', () => {
    expect(dueDateFor('2026-12-04', -28).slice(0, 10)).toBe('2026-11-06');
  });
});

describe('when the date is set: the date-dependent tasks', () => {
  const input = (over: Partial<DateAddsInput> = {}): DateAddsInput => ({
    ctx: { answers: answers({ channels: ['spotify', 'audiomack', 'radio'] }), releaseDate: '2026-12-04', todayYmd: '2026-10-26' },
    existing: [
      { title: 'Upload to your distributor', offset_days: -39 },
      { title: 'Pitch Spotify editorial', offset_days: -28 },
    ],
    spent: 400_000,
    ...over,
  });

  it('drops repeats, unpicked channels, the past and spend over what is left', () => {
    const kept = cleanDateAdds(
      [
        task({ key: 'a', title: 'Pitch Spotify editorial', channel: 'spotify', offset_days: -28 }),
        task({ key: 'b', title: 'Pitch Boomplay editorial', channel: 'boomplay', offset_days: -28 }),
        task({ key: 'c', title: 'Pitch OAPs in Abuja', channel: 'radio', offset_days: -60 }),
        task({ key: 'd', title: 'Book blog posts', channel: 'blogs', offset_days: -5, cost_naira: 200_000 }),
        task({ key: 'e', title: 'Pitch Audiomack editorial', channel: 'audiomack', offset_days: -28 }),
        task({ key: 'f', title: 'Release day: share it everywhere', offset_days: 0, phase: 'release' }),
      ],
      input()
    );
    expect(kept.map((t) => t.title)).toEqual(['Pitch Audiomack editorial', 'Release day: share it everywhere']);
    expect(kept.every((t) => !t.now && t.depends_on.length === 0)).toBe(true);
  });

  it('the code-built adds are free, picked-channel only, and include release day', () => {
    const adds = fallbackDateAdds(input());
    expect(adds.length).toBeGreaterThan(2);
    expect(adds.every((t) => t.cost_naira === 0)).toBe(true);
    expect(adds.some((t) => t.offset_days === 0)).toBe(true);
    expect(adds.some((t) => t.channel === 'boomplay' || t.channel === 'apple')).toBe(false);
    expect(adds.some((t) => /spotify editorial/i.test(t.title))).toBe(false);
  });

  it('falls back when the gateway fails, and says when the wallet is empty', async () => {
    const down = await writeDateAdds(input(), { configured: true, call: async () => { throw new Error('down'); } });
    expect(down.source).toBe('fallback');
    expect(down.tasks.length).toBeGreaterThan(0);
    const empty = await writeDateAdds(input(), {
      configured: true,
      call: async () => {
        throw new GatewayError('insufficient_balance', { status: 402 });
      },
    });
    expect(empty.source).toBe('fallback');
    expect(empty.walletEmpty).toBe(true);
  });

  it("uses UrgAns's adds when they pass", async () => {
    const result = await writeDateAdds(input(), {
      configured: true,
      call: async () => [task({ key: 'x', title: 'Send DJ pack to 10 Abuja DJs', channel: 'djs', offset_days: -7 })],
    });
    expect(result.source).toBe('ai');
    expect(result.tasks[0].title).toBe('Send DJ pack to 10 Abuja DJs');
  });

  it('parses the model answer', () => {
    expect(parseDateAdds(JSON.stringify({ tasks: [task({ key: 'd1' })] }))?.[0].key).toBe('d1');
    expect(parseDateAdds('nope')).toBeNull();
  });

  it('says so in one short toast', () => {
    expect(interpretScheduleResponse(200, { plannerV2Dated: 12, plannerV2Added: 4 })).toEqual({ kind: 'saved', message: 'Dates added. 4 new tasks.' });
    expect(interpretScheduleResponse(200, { plannerV2Dated: 12, plannerV2Added: 0 }).message).toBe('Dates added.');
  });
});
