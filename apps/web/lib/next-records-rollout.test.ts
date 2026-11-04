import { describe, expect, it } from 'vitest';
import {
  RECORD_TASK_PREFIX,
  carryOverLine,
  carryOverTaskUpdates,
  creditRolesFor,
  finishTaskTitle,
  fromRecordLine,
  madeFromLine,
  planHint,
  recordCredits,
  recordLeadTasks,
  recordMusicStage,
  recordReleaseType,
  recordStatusLine,
  recordUseNote,
  withoutRecordTasks,
} from './next-records-rollout';
import {
  RECORD_COVER_COLORS,
  artistCoverColor,
  parseCoverColor,
  recordCoverColor,
  type RecordSession,
  type RecordSong,
} from './next-records';
import type { PlanV2, PlanV2Task } from './planner-v2/plan';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

let n = 0;
function song(title: string, stage: RecordSong['stage']): RecordSong {
  n += 1;
  return { id: `song-${n}`, title, stage, position: n };
}

function session(over: Partial<RecordSession> = {}): RecordSession {
  return { id: `s-${(n += 1)}`, date: null, dateHint: 'soon', status: 'planned', note: '', people: [], songIds: [], ...over };
}

function task(over: Partial<PlanV2Task> = {}): PlanV2Task {
  return {
    key: 't1',
    library_id: null,
    title: 'Upload to your distributor',
    why: '',
    done_when: '',
    phase: 'pre_release',
    offset_days: -28,
    duration_days: 3,
    owner_role: 'manager',
    channel: 'distribution',
    cost_naira: 0,
    depends_on: [],
    first_up: true,
    now: true,
    ...over,
  };
}

describe('cover colour', () => {
  it('comes from the artist, the same every time', () => {
    expect(artistCoverColor(A)).toBe(artistCoverColor(A));
    expect(RECORD_COVER_COLORS).toContain(artistCoverColor(A));
  });
  it('a picked colour wins over the artist colour', () => {
    expect(recordCoverColor({ artistId: A, coverColor: '#3b2a52' })).toBe('#3b2a52');
    expect(recordCoverColor({ artistId: A, coverColor: null })).toBe(artistCoverColor(A));
  });
  it('accepts only colours from the palette, or null for the artist colour', () => {
    expect(parseCoverColor('#3B2A52')).toEqual({ value: '#3b2a52' });
    expect(parseCoverColor(null)).toEqual({ value: null });
    expect(parseCoverColor('#123456')).toHaveProperty('error');
    expect(parseCoverColor('red')).toHaveProperty('error');
  });
  it('different artists can get different colours', () => {
    const colours = new Set(Array.from({ length: 40 }, (_, i) => artistCoverColor(`${i}-${B}`)));
    expect(colours.size).toBeGreaterThan(3);
  });
});

describe('the hint under Plan the rollout', () => {
  it('no songs: plan now or add them first', () => {
    expect(planHint([])).toBe('Plan now, or add the songs first');
  });
  it('one song not done names it and its stage', () => {
    expect(planHint([song('Sunday Light', 'done'), song('Pressure', 'mixing')])).toBe(
      'You can plan while Pressure is still mixing'
    );
    expect(planHint([song('Untitled 4', 'recording')])).toBe('You can plan while Untitled 4 is still recording');
    expect(planHint([song('Wahala', 'idea')])).toBe('You can plan while Wahala is still an idea');
  });
  it('several not done counts them', () => {
    expect(planHint([song('A', 'idea'), song('B', 'mixing'), song('C', 'done')])).toBe(
      'You can plan while 2 songs are still being made'
    );
  });
  it('all done says so', () => {
    expect(planHint([song('A', 'done'), song('B', 'done')])).toBe('Every song is done');
  });
});

describe('the line under the cover', () => {
  const today = '2026-10-27';
  it('no songs yet', () => {
    expect(recordStatusLine({ songs: [], sessions: [] }, today)).toEqual({ main: 'No songs yet', next: null });
  });
  it('counts done songs and names the next session with its first person', () => {
    const line = recordStatusLine(
      {
        songs: [song('A', 'done'), song('B', 'done'), song('C', 'done'), song('D', 'idea')],
        sessions: [session({ date: '2026-10-31', people: [{ personId: null, name: 'Tolu', role: 'producer' }] })],
      },
      today
    );
    expect(line).toEqual({ main: '3 of 4 songs done', next: 'next session Sat 31 Oct with Tolu' });
  });
  it('words stay words', () => {
    const line = recordStatusLine({ songs: [song('A', 'idea')], sessions: [session({ dateHint: 'next week' })] }, today);
    expect(line.next).toBe('next session next week');
  });
});

describe('what the rollout is made from', () => {
  it('kind: the record says, else the number of songs', () => {
    expect(recordReleaseType({ kind: 'album', songs: [] })).toBe('album');
    expect(recordReleaseType({ kind: null, songs: [] })).toBe('single');
    expect(recordReleaseType({ kind: null, songs: [song('A', 'idea'), song('B', 'idea')] })).toBe('single');
    expect(recordReleaseType({ kind: null, songs: Array.from({ length: 4 }, () => song('x', 'idea')) })).toBe('ep');
    expect(recordReleaseType({ kind: null, songs: Array.from({ length: 8 }, () => song('x', 'idea')) })).toBe('album');
  });
  it('where the music is: finished only when every song is done', () => {
    expect(recordMusicStage({ songs: [song('A', 'done')] })).toBe('finished');
    expect(recordMusicStage({ songs: [song('A', 'done'), song('B', 'mixing')] })).toBe('making');
    expect(recordMusicStage({ songs: [] })).toBe('making');
  });
  it('credits: everyone from sessions that did not fall through, once each', () => {
    const credits = recordCredits({
      sessions: [
        session({ people: [{ personId: A, name: 'Tolu', role: 'producer' }] }),
        session({ people: [{ personId: A, name: 'Tolu', role: 'producer' }, { personId: null, name: 'Dami', role: 'engineer' }] }),
        session({ status: 'cancelled', people: [{ personId: null, name: 'Gone', role: 'writer' }] }),
        session({ people: [{ personId: null, name: 'dami', role: 'Engineer' }] }),
      ],
    });
    expect(credits).toEqual([
      { personId: A, name: 'Tolu', role: 'producer' },
      { personId: null, name: 'Dami', role: 'engineer' },
    ]);
  });
  it('maps typed roles to credit roles, and keeps unknown ones as other', () => {
    expect(creditRolesFor('Producer')).toEqual(['producer']);
    expect(creditRolesFor('mix engineer')).toEqual(['mixing_engineer']);
    expect(creditRolesFor('mastering')).toEqual(['mastering_engineer']);
    expect(creditRolesFor('engineer')).toEqual(['engineer']);
    expect(creditRolesFor('songwriter')).toEqual(['songwriter']);
    expect(creditRolesFor('writer')).toEqual(['songwriter']);
    expect(creditRolesFor('featured')).toEqual(['featured_artist']);
    expect(creditRolesFor('guitar')).toEqual(['other']);
    expect(creditRolesFor('')).toEqual(['other']);
  });
  it('the planner and the rollout lines', () => {
    const record = {
      kind: 'ep' as const,
      songs: Array.from({ length: 4 }, () => song('x', 'done')),
      sessions: [
        session({ people: [{ personId: null, name: 'Tolu', role: 'producer' }] }),
        session({ people: [{ personId: null, name: 'Dami', role: 'engineer' }] }),
      ],
    };
    expect(fromRecordLine(record)).toBe('EP · 4 songs · 2 credits');
    expect(madeFromLine(record)).toBe('4 songs · 2 sessions · 2 credits');
    expect(fromRecordLine({ kind: null, songs: [song('x', 'idea')], sessions: [] })).toBe('Single · 1 song');
  });
});

describe('a song not done becomes a task, never a blocker', () => {
  it('names the work left by stage', () => {
    expect(finishTaskTitle({ title: 'Pressure', stage: 'mixing' })).toBe('Finish the Pressure mix');
    expect(finishTaskTitle({ title: 'Untitled 4', stage: 'recording' })).toBe('Finish recording Untitled 4');
    expect(finishTaskTitle({ title: 'Wahala', stage: 'idea' })).toBe('Finish writing Wahala');
  });
  it('the sheet says what it will add', () => {
    expect(recordUseNote([song('A', 'done')])).toBeNull();
    expect(recordUseNote([song('Pressure', 'mixing')])).toBe(
      'Pressure is still mixing. I\'ll add "Finish the Pressure mix" as the first task.'
    );
    expect(recordUseNote([song('A', 'idea'), song('B', 'mixing')])).toBe(
      "2 songs aren't done yet. I'll add a task to finish each one, first."
    );
  });
  it('lead tasks come first, now, free, and at the plan\'s earliest day', () => {
    const plan = { tasks: [task({ offset_days: -28 }), task({ key: 't2', offset_days: -40 })] } as PlanV2;
    const tasks = recordLeadTasks([song('Pressure', 'mixing'), song('Done one', 'done')], plan);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: 'Finish the Pressure mix',
      phase: 'pre_release',
      offset_days: -40,
      cost_naira: 0,
      now: true,
      first_up: true,
      channel: 'none',
      owner_role: 'artist',
      depends_on: [],
    });
    expect(tasks[0].key.startsWith(RECORD_TASK_PREFIX)).toBe(true);
    expect(tasks[0].key.length).toBeLessThanOrEqual(12);
  });
  it('an empty plan still gets a sensible day', () => {
    expect(recordLeadTasks([song('A', 'idea')], { tasks: [] } as unknown as PlanV2)[0].offset_days).toBe(-56);
  });
  it('the browser can never send its own record tasks back', () => {
    const plan = { tasks: [task({ key: `${RECORD_TASK_PREFIX}1` }), task({ key: 't2' })] } as PlanV2;
    expect(withoutRecordTasks(plan).tasks.map((t) => t.key)).toEqual(['t2']);
  });
});

describe('the planner from a record', () => {
  it('skips "where is the music": four questions', async () => {
    const { visibleV2Steps } = await import('./planner-v2/steps');
    expect(visibleV2Steps({ stage: 'making', prefilledDate: null, todayYmd: '2026-10-27', stageKnown: true })).toEqual([
      'win',
      'budget',
      'channels',
      'team',
    ]);
    expect(visibleV2Steps({ stage: 'making', prefilledDate: null, todayYmd: '2026-10-27' })[0]).toBe('music');
  });
});

describe("a project's open tasks move into the rollout (2026-11-04, #1074)", () => {
  it('the sheet says how many move', () => {
    expect(carryOverLine(0)).toBeNull();
    expect(carryOverLine(1)).toBe('Your open task moves into Pre-production, with its owner and day.');
    expect(carryOverLine(3)).toBe('Your 3 open tasks move into Pre-production, with their owners and days.');
  });
  it('only open tasks move, into Pre-production, keeping what else they carry', () => {
    const updates = carryOverTaskUpdates([
      { id: 'a', status: 'todo', metadata: { note: 1 } },
      { id: 'b', status: 'done', metadata: {} },
      { id: 'c', status: 'cancelled', metadata: null },
      { id: 'd', status: 'in_progress', metadata: null },
    ]);
    expect(updates).toEqual([
      { id: 'a', metadata: { note: 1, phase: 'pre_production' } },
      { id: 'd', metadata: { phase: 'pre_production' } },
    ]);
  });
  it('a song already has its finish job on the project, so the plan does not add it twice', () => {
    const plan = { tasks: [task({ offset_days: -28 })] } as PlanV2;
    const tasks = recordLeadTasks([song('Pressure', 'mixing'), song('Wahala', 'recording')], plan, [' finish the PRESSURE mix ']);
    expect(tasks.map((t) => t.title)).toEqual(['Finish recording Wahala']);
  });
});
