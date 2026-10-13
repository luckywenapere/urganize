import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATE_OPTIONS_LIMIT_NOTE,
  PITCH_READY_DAYS,
  SAME_WEEK_DAYS,
  buildReleaseDateOptions,
  datedOtherRollouts,
  describeClash,
  rolloutsSameWeek,
  type DateOptionRollout,
} from './release-date-options';
import { suggestReleaseDate } from './release-planning';

// A Tuesday, so the first Friday is never today.
const TODAY = '2026-10-13';

const rollout = (over: Partial<DateOptionRollout> & { id: string }): DateOptionRollout => ({
  title: 'Free',
  artistName: 'Dorian',
  releaseDate: '2026-12-11',
  status: 'draft',
  isTest: false,
  ...over,
});

const isFriday = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`).getUTCDay() === 5;

describe('buildReleaseDateOptions', () => {
  it('offers three Fridays a week apart, starting at the earliest with enough runway', () => {
    const options = buildReleaseDateOptions({ todayYmd: TODAY, ready: [], leadTimeDays: 56, others: [] });
    expect(options.map((option) => option.date)).toEqual(['2026-12-11', '2026-12-18', '2026-12-25']);
    expect(options[0].date).toBe(suggestReleaseDate(TODAY, [], 56));
    expect(options.every((option) => isFriday(option.date))).toBe(true);
    expect(options[0].daysOut).toBe(59);
  });

  it('says how many weeks each one leaves', () => {
    const [first] = buildReleaseDateOptions({ todayYmd: TODAY, ready: [], leadTimeDays: 56, others: [] });
    expect(first.checks.find((check) => check.key === 'runway')).toEqual({
      key: 'runway',
      ok: true,
      label: '8 weeks to get ready',
    });
  });

  it('marks the first option that passes everything as the best fit, and only that one', () => {
    const options = buildReleaseDateOptions({ todayYmd: TODAY, ready: [], leadTimeDays: 56, others: [] });
    expect(options.map((option) => option.best)).toEqual([true, false, false]);
  });

  it('flags a date too close to pitch Spotify editorial, and moves the best fit past it', () => {
    // Everything ready: 28 days of runway, so the first Friday is 31 days out.
    const options = buildReleaseDateOptions({
      todayYmd: TODAY,
      ready: ['master', 'artwork', 'distributor'],
      leadTimeDays: 56,
      others: [],
    });
    expect(options[0].daysOut).toBeLessThan(PITCH_READY_DAYS);
    expect(options[0].checks.find((check) => check.key === 'pitch')?.ok).toBe(false);
    expect(options[1].daysOut).toBeGreaterThanOrEqual(PITCH_READY_DAYS);
    expect(options.map((option) => option.best)).toEqual([false, true, false]);
  });

  it('flags a week another of your rollouts lands in, and moves the best fit past it', () => {
    const options = buildReleaseDateOptions({
      todayYmd: TODAY,
      ready: [],
      leadTimeDays: 56,
      others: [rollout({ id: 'r-free', releaseDate: '2026-12-11' })],
    });
    const clash = options[0].checks.find((check) => check.key === 'clash');
    expect(clash).toEqual({ key: 'clash', ok: false, label: 'Same week as Free (Dorian)' });
    expect(options[1].checks.find((check) => check.key === 'clash')?.ok).toBe(true);
    expect(options.map((option) => option.best)).toEqual([false, true, false]);
  });

  it('has no best fit when nothing passes', () => {
    const options = buildReleaseDateOptions({
      todayYmd: TODAY,
      ready: [],
      leadTimeDays: 56,
      others: ['2026-12-11', '2026-12-18', '2026-12-25'].map((releaseDate, index) =>
        rollout({ id: `r-${index}`, releaseDate })
      ),
    });
    expect(options.some((option) => option.best)).toBe(false);
  });

  it('offers nothing when today cannot be read', () => {
    expect(buildReleaseDateOptions({ todayYmd: 'soon', ready: [], leadTimeDays: 56, others: [] })).toEqual([]);
  });
});

describe('the team’s other rollouts', () => {
  it('counts only real, dated rollouts other than the one being planned', () => {
    const kept = datedOtherRollouts(
      [
        rollout({ id: 'this-one' }),
        rollout({ id: 'archived', status: 'archived' }),
        rollout({ id: 'test', isTest: true }),
        rollout({ id: 'undated', releaseDate: null }),
        rollout({ id: 'junk-date', releaseDate: 'next friday' }),
        rollout({ id: 'real' }),
      ],
      'this-one'
    );
    expect(kept.map((entry) => entry.id)).toEqual(['real']);
  });

  it('treats up to six days apart as the same week, and a week apart as not', () => {
    const others = [rollout({ id: 'a', releaseDate: '2026-12-11' })];
    expect(SAME_WEEK_DAYS).toBe(6);
    expect(rolloutsSameWeek('2026-12-17', others)).toHaveLength(1);
    expect(rolloutsSameWeek('2026-12-05', others)).toHaveLength(1);
    expect(rolloutsSameWeek('2026-12-18', others)).toHaveLength(0);
    expect(rolloutsSameWeek('2026-12-04', others)).toHaveLength(0);
  });

  it('names the first clash and counts the rest', () => {
    expect(describeClash([rollout({ id: 'a' })])).toBe('Same week as Free (Dorian)');
    expect(
      describeClash([rollout({ id: 'a' }), rollout({ id: 'b', title: 'Lagos', artistName: 'Tems' })])
    ).toBe('Same week as Free (Dorian) and 1 more');
    expect(describeClash([rollout({ id: 'a', title: ' ', artistName: '' })])).toBe(
      'Same week as another rollout'
    );
    expect(describeClash([])).toBe('');
  });
});

describe('copy', () => {
  it('follows the house rules', () => {
    const options = buildReleaseDateOptions({
      todayYmd: TODAY,
      ready: ['master', 'artwork', 'distributor'],
      leadTimeDays: 56,
      others: [rollout({ id: 'r', releaseDate: '2026-11-13' })],
    });
    const words = [DATE_OPTIONS_LIMIT_NOTE, ...options.flatMap((option) => option.checks.map((c) => c.label))];
    for (const text of words) {
      expect(text).not.toMatch(/[—–]/);
      expect(text.toLowerCase()).not.toContain('workspace');
    }
  });
});

describe('the date question uses it', () => {
  it('builds the options from the team’s other rollouts and shows a clash for a typed date', () => {
    const steps = readFileSync(join(__dirname, '..', 'components', 'planner', 'intake-steps.tsx'), 'utf8');
    expect(steps).toContain('buildReleaseDateOptions(');
    expect(steps).toContain('rolloutsSameWeek(draft.releaseDate, otherRollouts)');
    expect(steps).toContain('DATE_OPTIONS_LIMIT_NOTE');
    const modal = readFileSync(join(__dirname, '..', 'components', 'planner', 'PlannerIntakeModal.tsx'), 'utf8');
    expect(modal).toContain('datedOtherRollouts(');
  });
});
