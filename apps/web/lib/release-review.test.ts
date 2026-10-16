import { describe, expect, it } from 'vitest';
import {
  THIN_TRACKING_PROMPT,
  buildReleaseReviewView,
  isReviewDue,
  parseReviewAnswers,
  pickBetweenReleases,
  reviewNumbers,
  type ReviewTask,
} from './release-review';
import { buildPreProductionTaskRows, onlyPreProductionWork, PRE_PRODUCTION_TASKS } from './pre-production';
import { summarizeRolloutPhases } from './rollout-phases';

const NOW = new Date('2026-10-16T09:00:00Z');

const task = (over: Partial<ReviewTask> & { id: string }): ReviewTask => ({
  title: over.id,
  status: 'todo',
  dueDate: null,
  completedAt: null,
  ...over,
});

describe('isReviewDue', () => {
  it('opens 28 days after release day, not before', () => {
    expect(isReviewDue({ releaseDate: '2026-09-18' }, [task({ id: 'a' })], NOW)).toBe(true);
    expect(isReviewDue({ releaseDate: '2026-09-19' }, [task({ id: 'a' })], NOW)).toBe(false);
  });
  it('opens as soon as every activity is done, dated or not', () => {
    expect(isReviewDue({ releaseDate: null }, [task({ id: 'a', status: 'done' })], NOW)).toBe(true);
    expect(isReviewDue({ releaseDate: null }, [task({ id: 'a' })], NOW)).toBe(false);
    expect(isReviewDue({ releaseDate: null }, [], NOW)).toBe(false);
  });
});

describe('reviewNumbers', () => {
  it('counts done, on time and late (late includes open work past due)', () => {
    const numbers = reviewNumbers(
      [
        task({ id: 'a', status: 'done', dueDate: '2026-09-01', completedAt: '2026-09-01' }),
        task({ id: 'b', status: 'done', dueDate: '2026-09-01', completedAt: '2026-09-05' }),
        task({ id: 'c', status: 'todo', dueDate: '2026-09-10' }),
        task({ id: 'd', status: 'cancelled', dueDate: '2026-09-10' }),
      ],
      NOW
    );
    expect(numbers).toEqual({ total: 3, done: 2, onTime: 1, late: 2 });
  });
});

describe('buildReleaseReviewView', () => {
  const release = { id: 'r', title: 'Gbese', artistName: 'Victory', releaseDate: '2026-09-18', metadata: {} };

  it('asks first, with no numbers, when under 20% is tracked', () => {
    const tasks = Array.from({ length: 10 }, (_, index) => task({ id: `t${index}`, dueDate: '2026-09-01' }));
    const view = buildReleaseReviewView({ release, tasks, outcomes: [], now: NOW });
    expect(view.thin).toBe(true);
    expect(view.worked).toEqual([]);
    expect(view.verdict).toBe(THIN_TRACKING_PROMPT);
    expect(view.questions).toEqual(['offPlan', 'missed', 'change']);
  });

  it('lists what worked and slipped from outcomes first', () => {
    const tasks = [
      task({ id: 'a', title: 'Release day posts', status: 'done', dueDate: '2026-09-18', completedAt: '2026-09-18' }),
      task({ id: 'b', title: 'Upload to distributor', status: 'done', dueDate: '2026-08-20', completedAt: '2026-08-24' }),
      task({ id: 'c', title: 'Editorial pitch', status: 'done', dueDate: '2026-08-25', completedAt: '2026-08-25' }),
    ];
    const view = buildReleaseReviewView({
      release,
      tasks,
      outcomes: [
        { taskId: 'a', outcome: 'went_well' },
        { taskId: 'c', outcome: 'not_to_plan' },
      ],
      now: NOW,
    });
    expect(view.thin).toBe(false);
    expect(view.worked[0]).toMatchObject({ title: 'Release day posts', note: 'Went well' });
    expect(view.slipped.map((item) => item.note)).toEqual(["Didn't go to plan", '4 days late']);
    expect(view.questions).toEqual(['offPlan', 'change']);
  });

  it('uses the stored verdict and answers', () => {
    const view = buildReleaseReviewView({
      release: { ...release, metadata: { review: { verdict: 'Lock the master earlier.', answers: { change: 'Earlier master' } } } },
      tasks: [task({ id: 'a', status: 'done' })],
      outcomes: [],
      now: NOW,
    });
    expect(view.verdict).toBe('Lock the master earlier.');
    expect(view.answers.change).toBe('Earlier master');
  });
});

describe('parseReviewAnswers', () => {
  it('keeps known keys, drops empties, refuses non-text', () => {
    expect(parseReviewAnswers({ answers: { change: ' Earlier master ', missed: '', other: 'x' } })).toEqual({
      answers: { change: 'Earlier master' },
    });
    expect(parseReviewAnswers({ answers: { change: 3 } })).toEqual({ error: 'Answers must be text.' });
  });
});

describe('pre-production', () => {
  it('seeds eight undated, unassigned, non-generated Pre-production activities', () => {
    const rows = buildPreProductionTaskRows({ releaseId: 'r', workspaceId: 'w', createdBy: 'u' });
    expect(rows).toHaveLength(PRE_PRODUCTION_TASKS.length);
    expect(rows.every((row) => row.due_date === null && row.auto_generated === false)).toBe(true);
    expect(rows.every((row) => (row.metadata as { phase?: string }).phase === 'pre_production')).toBe(true);
    expect(rows[rows.length - 1].title).toBe('Final video (MP4) delivered');
  });

  it('shows the Pre-production header only when it has work', () => {
    const plain = summarizeRolloutPhases([{ dueDate: '2026-09-01', status: 'todo' }], '2026-10-01', NOW);
    expect(plain.map((summary) => summary.phase)).toEqual(['pre_release', 'release', 'post_release']);
    const withPre = summarizeRolloutPhases(
      [{ dueDate: null, status: 'todo', phase: 'pre_production' }],
      null,
      NOW
    );
    expect(withPre[0]).toMatchObject({ phase: 'pre_production', state: 'current', total: 1 });
  });

  it('knows when only pre-production work exists', () => {
    expect(onlyPreProductionWork([{ phase: 'pre_production' }])).toBe(true);
    expect(onlyPreProductionWork([{ phase: 'pre_production' }, { phase: null }])).toBe(false);
    expect(onlyPreProductionWork([])).toBe(true);
  });
});

describe('pickBetweenReleases', () => {
  it('picks the newest open review and the rollout in pre-production', () => {
    const state = pickBetweenReleases(
      [
        { id: 'old', title: 'Old', artistName: 'V', releaseDate: '2026-06-01', metadata: {} },
        { id: 'new', title: 'New', artistName: 'V', releaseDate: '2026-09-01', metadata: {} },
        { id: 'hidden', title: 'Hidden', artistName: 'V', releaseDate: '2026-09-10', metadata: { review: { dismissedAt: '2026-10-01' } } },
        { id: 'pp', title: 'Next', artistName: 'V', releaseDate: null, metadata: {} },
      ],
      [
        { ...task({ id: 'a', status: 'done' }), releaseId: 'old' },
        { ...task({ id: 'b', status: 'done' }), releaseId: 'new' },
        { ...task({ id: 'c', phase: 'pre_production' }), releaseId: 'pp' },
      ],
      NOW
    );
    expect(state.reviewDue?.releaseId).toBe('new');
    expect(state.inPreProduction).toMatchObject({ releaseId: 'pp', done: 0, total: 1 });
    expect(state.between).toBe(false);
  });

  it('is between releases when nothing has open work ahead of release', () => {
    const state = pickBetweenReleases(
      [{ id: 'r', title: 'R', artistName: 'V', releaseDate: '2026-08-01', metadata: {} }],
      [{ ...task({ id: 'a' }), releaseId: 'r' }],
      NOW
    );
    expect(state.between).toBe(true);
  });
});
