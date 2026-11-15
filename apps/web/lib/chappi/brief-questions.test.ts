import { describe, expect, it } from 'vitest';
import {
  BRIEF_NONE,
  BRIEF_SKIP,
  applyBriefAnswer,
  briefAnswerLines,
  briefBecauseLine,
  briefSectionOrder,
  buildBriefQuestion,
  clearBriefAnswer,
  focusArtist,
  pickBriefQuestion,
  sanitizeBriefPrefs,
  sanitizeBriefQuestion,
  type BriefPrefs,
  type PickContext,
} from './brief-questions';

const ARTISTS = [
  { id: 'a1', name: 'Ayo Banks' },
  { id: 'a2', name: 'Dami' },
];
const TEAM = [{ id: 'u2', name: 'Tobi Ade' }];

function ctx(over: Partial<PickContext> = {}): PickContext {
  return { today: '2026-11-17', hadEarlierBrief: true, artists: ARTISTS, teammates: TEAM, ...over };
}

describe('pickBriefQuestion', () => {
  it('asks nothing on the first brief', () => {
    expect(pickBriefQuestion({}, ctx({ hadEarlierBrief: false })).question).toBeNull();
  });

  it('asks the top question first on day 2 and records it', () => {
    const { question, prefs } = pickBriefQuestion({}, ctx());
    expect(question?.id).toBe('top');
    expect(question?.choices.map((c) => c.id)).toEqual(['late', 'releases', 'team']);
    expect(prefs.asked).toEqual({ id: 'top', date: '2026-11-17' });
  });

  it('moves on to the next open question once one is answered', () => {
    const stored: BriefPrefs = { top: { value: 'late', at: '2026-11-17' }, asked: { id: 'top', date: '2026-11-17', outcome: 'answered' } };
    const { question } = pickBriefQuestion(stored, ctx({ today: '2026-11-18' }));
    expect(question?.id).toBe('artist');
    expect(question?.choices.map((c) => c.id)).toEqual(['a1', 'a2', BRIEF_NONE]);
    expect(question?.choices[2].label).toBe('Both the same');
  });

  it('skips the artist question for one artist and the watch question with no team', () => {
    const stored: BriefPrefs = {
      top: { value: 'late', at: '2026-11-17' },
      horizon: { value: 'week', at: '2026-11-18' },
      asked: { id: 'horizon', date: '2026-11-18', outcome: 'answered' },
    };
    const { question } = pickBriefQuestion(stored, ctx({ today: '2026-11-19', artists: [ARTISTS[0]], teammates: [] }));
    expect(question).toBeNull();
  });

  it('asks the artist question again in a new month', () => {
    const stored: BriefPrefs = {
      top: { value: 'late', at: '2026-11-17' },
      artist: { value: 'a1', name: 'Ayo Banks', month: '2026-11', at: '2026-11-18' },
      horizon: { value: 'week', at: '2026-11-19' },
      watch: { value: BRIEF_NONE, name: 'No one', at: '2026-11-20' },
      asked: { id: 'watch', date: '2026-11-20', outcome: 'answered' },
    };
    expect(pickBriefQuestion(stored, ctx({ today: '2026-11-30' })).question).toBeNull();
    expect(pickBriefQuestion(stored, ctx({ today: '2026-12-01' })).question?.id).toBe('artist');
  });

  it('keeps quiet the day after a question got no answer, and counts it as a skip', () => {
    const stored: BriefPrefs = { asked: { id: 'top', date: '2026-11-17' } };
    const { question, prefs } = pickBriefQuestion(stored, ctx({ today: '2026-11-18' }));
    expect(question).toBeNull();
    expect(prefs.skips).toBe(1);
    expect(prefs.asked?.outcome).toBe('skipped');
    // The day after the quiet day, it asks again.
    expect(pickBriefQuestion(prefs, ctx({ today: '2026-11-19' })).question?.id).toBe('top');
  });

  it('pauses for a week after two skips in a row', () => {
    const stored: BriefPrefs = { skips: 1, asked: { id: 'top', date: '2026-11-19' } };
    const { question, prefs } = pickBriefQuestion(stored, ctx({ today: '2026-11-20' }));
    expect(question).toBeNull();
    expect(prefs.pausedUntil).toBe('2026-11-27');
    expect(prefs.skips).toBeUndefined();
    expect(pickBriefQuestion(prefs, ctx({ today: '2026-11-26' })).question).toBeNull();
    const back = pickBriefQuestion(prefs, ctx({ today: '2026-11-27' }));
    expect(back.question?.id).toBe('top');
    expect(back.prefs.pausedUntil).toBeUndefined();
  });

  it('asks nothing when the Settings switch is off', () => {
    expect(pickBriefQuestion({ questionsOff: true }, ctx()).question).toBeNull();
  });

  it('never asks a second question on one day, but offers the same one again after a failed run', () => {
    const stored: BriefPrefs = { top: { value: 'late', at: '2026-11-16' }, asked: { id: 'artist', date: '2026-11-17' } };
    const again = pickBriefQuestion(stored, ctx());
    expect(again.question?.id).toBe('artist');
    expect(again.prefs).toBe(stored);
    const answered: BriefPrefs = { ...stored, asked: { id: 'artist', date: '2026-11-17', outcome: 'answered' } };
    expect(pickBriefQuestion(answered, ctx()).question).toBeNull();
  });

  it('offers at most three people plus the none choice', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `Artist ${id}` }));
    const question = buildBriefQuestion('artist', { artists: many, teammates: [] });
    expect(question?.choices).toHaveLength(4);
    expect(question?.choices[3]).toEqual({ id: BRIEF_NONE, label: 'All the same' });
  });
});

describe('applyBriefAnswer', () => {
  const top = buildBriefQuestion('top', { artists: [], teammates: [] })!;
  const asked: BriefPrefs = { asked: { id: 'top', date: '2026-11-17' }, skips: 1 };

  it('saves a valid answer, clears the skip count and says what changes', () => {
    const result = applyBriefAnswer(asked, top, 'late', '2026-11-17');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prefs.top).toEqual({ value: 'late', at: '2026-11-17' });
    expect(result.prefs.asked?.outcome).toBe('answered');
    expect(result.prefs.skips).toBeUndefined();
    expect(result.label).toBe("What's late");
    expect(result.ack).toContain('late work goes at the top');
    expect(result.ack).toContain('Settings');
  });

  it('refuses a choice the stored question did not offer', () => {
    expect(applyBriefAnswer(asked, top, 'a1', '2026-11-17').ok).toBe(false);
  });

  it('refuses yesterday\'s question and a second answer', () => {
    expect(applyBriefAnswer(asked, top, 'late', '2026-11-18').ok).toBe(false);
    const answered: BriefPrefs = { asked: { id: 'top', date: '2026-11-17', outcome: 'answered' } };
    expect(applyBriefAnswer(answered, top, 'team', '2026-11-17').ok).toBe(false);
  });

  it('tells a second tab what was already chosen, and changes nothing', () => {
    const first = applyBriefAnswer(asked, top, 'team', '2026-11-17');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.prefs.asked?.choice).toBe('team');
    const second = applyBriefAnswer(first.prefs, top, 'late', '2026-11-17');
    expect(second.ok && second.already).toBe(true);
    expect(second.ok && second.label).toBe('What the team did');
    expect(second.ok && second.prefs).toBe(first.prefs);
  });

  it('says a question is closed when it is not today\'s', () => {
    const result = applyBriefAnswer(asked, top, 'late', '2026-11-18');
    expect(!result.ok && result.closed).toBe(true);
  });

  it('counts Not now as a skip', () => {
    const result = applyBriefAnswer(asked, top, BRIEF_SKIP, '2026-11-17');
    expect(result.ok && result.prefs.pausedUntil).toBe('2026-11-24');
    expect(result.ok && result.label).toBe('Not now');
  });

  it('keeps the artist for this month', () => {
    const question = buildBriefQuestion('artist', { artists: ARTISTS, teammates: [] })!;
    const result = applyBriefAnswer({ asked: { id: 'artist', date: '2026-11-18' } }, question, 'a1', '2026-11-18');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(focusArtist(result.prefs, '2026-11-30')).toEqual({ id: 'a1', name: 'Ayo Banks' });
    expect(focusArtist(result.prefs, '2026-12-01')).toBeNull();
  });
});

describe('what the brief does with the answers', () => {
  it('orders the parts by the top answer', () => {
    expect(briefSectionOrder({})).toEqual(['needs', 'waiting', 'changed', 'upcoming']);
    expect(briefSectionOrder({ top: { value: 'releases', at: '2026-11-17' } })[0]).toBe('upcoming');
    expect(briefSectionOrder({ top: { value: 'team', at: '2026-11-17' } })[0]).toBe('changed');
  });

  it('says why the brief looks the way it does', () => {
    expect(briefBecauseLine({}, '2026-11-18')).toBeNull();
    expect(briefBecauseLine({ top: { value: 'late', at: '2026-11-17' } }, '2026-11-18')).toBe('Late work first, like you asked');
    expect(
      briefBecauseLine(
        {
          top: { value: 'late', at: '2026-11-17' },
          artist: { value: 'a1', name: 'Ayo Banks', month: '2026-11', at: '2026-11-18' },
        },
        '2026-11-19'
      )
    ).toBe('Late work first · Ayo Banks first');
  });

  it('lists answers for Settings and clears them', () => {
    const prefs: BriefPrefs = {
      top: { value: 'late', at: '2026-11-17' },
      watch: { value: 'u2', name: 'Tobi Ade', at: '2026-11-19' },
    };
    expect(briefAnswerLines(prefs, '2026-11-20').map((line) => line.value)).toEqual(["What's late", 'Tobi Ade']);
    expect(clearBriefAnswer(prefs, 'top').top).toBeUndefined();
    expect(briefAnswerLines(clearBriefAnswer(prefs, 'all'), '2026-11-20')).toEqual([]);
  });
});

describe('reading stored data back', () => {
  it('drops anything that is not a valid answer', () => {
    expect(
      sanitizeBriefPrefs({
        top: { value: 'everything', at: '2026-11-17' },
        horizon: { value: 'today', at: '2026-11-17' },
        watch: { value: 'bad id!', name: 'x', at: '2026-11-17' },
        questionsOff: 'yes',
        skips: -3,
      })
    ).toEqual({ horizon: { value: 'today', at: '2026-11-17' } });
    expect(sanitizeBriefPrefs(null)).toEqual({});
    expect(sanitizeBriefPrefs({ rev: 4, asked: { id: 'top', date: '2026-11-17', outcome: 'answered', choice: 'late' } })).toEqual({
      rev: 4,
      asked: { id: 'top', date: '2026-11-17', outcome: 'answered', choice: 'late' },
    });
    expect(sanitizeBriefPrefs({ rev: 'x' })).toEqual({});
    expect(sanitizeBriefPrefs([1, 2])).toEqual({});
  });

  it('reads a stored question and never lets skip be a choice', () => {
    expect(sanitizeBriefQuestion({ id: 'top', text: 'Q', choices: [{ id: 'late', label: 'L' }, { id: BRIEF_SKIP, label: 'S' }] })).toBeNull();
    expect(sanitizeBriefQuestion({ id: 'nope', text: 'Q', choices: [] })).toBeNull();
    expect(sanitizeBriefQuestion(buildBriefQuestion('horizon', { artists: [], teammates: [] }))?.choices).toHaveLength(2);
  });
});
