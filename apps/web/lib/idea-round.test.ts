import { describe, expect, it } from 'vitest';
import {
  askedInCount,
  briefToPlanNotes,
  canRunIdeaRound,
  effectiveRoundState,
  everyoneAskedIsIn,
  formatClipLength,
  ideaRoundState,
  ideaSourceLabel,
  isOwnIdeaAudioPath,
  parseBriefFromIdeas,
  parseToSettle,
  planGate,
  settledDecisionBody,
  visibleIdeaNotes,
  PLAN_NOTES_MAX,
} from './idea-round';

const note = (userId: string, id = userId) => ({ id, userId });

describe('ideaRoundState', () => {
  it('is open, then closed, then approved', () => {
    expect(ideaRoundState({ ideasClosedAt: null, approvedAt: null })).toBe('open');
    expect(ideaRoundState({ ideasClosedAt: '2026-10-27T10:00:00Z', approvedAt: null })).toBe('closed');
    expect(ideaRoundState({ ideasClosedAt: '2026-10-27T10:00:00Z', approvedAt: '2026-10-27T11:00:00Z' })).toBe('approved');
  });
});

describe('effectiveRoundState', () => {
  it('treats a rollout planned before the round as closed', () => {
    expect(effectiveRoundState('open', true)).toBe('closed');
    expect(effectiveRoundState('open', false)).toBe('open');
    expect(effectiveRoundState('approved', true)).toBe('approved');
  });
});

describe('canRunIdeaRound', () => {
  it('lets the rollout owner or a team admin run it, nobody else', () => {
    expect(canRunIdeaRound({ viewerId: 'o', releaseOwnerId: 'o', isTeamAdmin: false })).toBe(true);
    expect(canRunIdeaRound({ viewerId: 'm', releaseOwnerId: 'o', isTeamAdmin: true })).toBe(true);
    expect(canRunIdeaRound({ viewerId: 'k', releaseOwnerId: 'o', isTeamAdmin: false })).toBe(false);
    expect(canRunIdeaRound({ viewerId: '', releaseOwnerId: '', isTeamAdmin: false })).toBe(false);
  });
});

describe('visibleIdeaNotes', () => {
  const notes = [note('o'), note('k'), note('a')];
  it('shows a teammate only their own ideas while the round is open', () => {
    expect(visibleIdeaNotes(notes, { state: 'open', viewerId: 'k', seeAll: false })).toEqual([note('k')]);
  });
  it('shows the owner every idea while open', () => {
    expect(visibleIdeaNotes(notes, { state: 'open', viewerId: 'o', seeAll: true })).toHaveLength(3);
  });
  it('shows everyone every idea once the round closes', () => {
    expect(visibleIdeaNotes(notes, { state: 'closed', viewerId: 'k', seeAll: false })).toHaveLength(3);
    expect(visibleIdeaNotes(notes, { state: 'approved', viewerId: 'k', seeAll: false })).toHaveLength(3);
  });
});

describe('everyoneAskedIsIn / askedInCount', () => {
  it('is false when nobody was asked', () => {
    expect(everyoneAskedIsIn([], [note('k')])).toBe(false);
  });
  it('is true only when every person asked has an idea', () => {
    expect(everyoneAskedIsIn(['k', 'a'], [note('k')])).toBe(false);
    expect(everyoneAskedIsIn(['k', 'a', 'a'], [note('k'), note('a'), note('o')])).toBe(true);
    expect(askedInCount(['k', 'a'], [note('k'), note('o')])).toBe(1);
  });
});

describe('parseToSettle', () => {
  it('keeps questions with at least two options and drops the rest', () => {
    const items = parseToSettle([
      { id: 's1', question: 'Radio or no radio?', options: [{ text: 'Radio', by: ['Oyin'] }, { text: 'Skip radio', by: ['Kemi'] }] },
      { question: 'One side only', options: [{ text: 'Only', by: [] }] },
      'junk',
      { question: '', options: [{ text: 'a' }, { text: 'b' }] },
    ]);
    expect(items).toEqual([
      { id: 's1', question: 'Radio or no radio?', options: [{ text: 'Radio', by: ['Oyin'] }, { text: 'Skip radio', by: ['Kemi'] }] },
    ]);
  });
  it('is empty for anything that is not a list', () => {
    expect(parseToSettle(null)).toEqual([]);
    expect(parseToSettle({})).toEqual([]);
  });
  it('turns a picked option into the decision text', () => {
    const [item] = parseToSettle([{ id: 's1', question: 'Q?', options: [{ text: 'A' }, { text: 'B' }] }]);
    expect(settledDecisionBody(item, 1)).toBe('B');
    expect(settledDecisionBody(item, 5)).toBeNull();
  });
});

describe('briefToPlanNotes', () => {
  it('carries the idea, the decisions and what is still open', () => {
    const text = briefToPlanNotes({
      idea: 'Make it big in Lagos.',
      decisions: [{ body: 'No radio.' }, { body: 'Under ₦300,000.' }],
      toSettle: [{ id: 's1', question: 'Which video leads?', options: [{ text: 'Dance clip', by: [] }, { text: 'Live session', by: [] }] }],
    });
    expect(text).toBe(
      'Brief: Make it big in Lagos.\nDecided: No radio.; Under ₦300,000.\nStill open: Which video leads? (Dance clip or Live session)'
    );
  });
  it('fits the planner notes box', () => {
    const text = briefToPlanNotes({ idea: 'x'.repeat(5000), decisions: [], toSettle: [] });
    expect(text.length).toBe(PLAN_NOTES_MAX);
  });
});

describe('planGate', () => {
  it('leaves a rollout with no ideas on the old planner', () => {
    expect(planGate({ hasIdeas: false, state: 'open' })).toBe('free');
  });
  it('needs an approved brief once there are ideas', () => {
    expect(planGate({ hasIdeas: true, state: 'open' })).toBe('needs_approval');
    expect(planGate({ hasIdeas: true, state: 'closed' })).toBe('needs_approval');
    expect(planGate({ hasIdeas: true, state: 'approved' })).toBe('from_brief');
  });
});

describe('parseBriefFromIdeas', () => {
  it('reads the model JSON and credits only real authors', () => {
    const raw =
      'Here: {"idea":"Make it Ada\'s biggest single.","decisions":[{"body":"Release on a Friday.","from":"Kemi"},{"body":"Under 300k.","from":"Somebody"}],"to_settle":[{"question":"Radio?","options":[{"text":"Radio","by":["Oyin"]},{"text":"Skip","by":["Kemi"]}]}]}';
    const brief = parseBriefFromIdeas(raw, ['Kemi', 'Oyin']);
    expect(brief).toEqual({
      idea: "Make it Ada's biggest single.",
      decisions: [
        { body: 'Release on a Friday.', source: 'Kemi' },
        { body: 'Under 300k.', source: null },
      ],
      toSettle: [{ id: 's1', question: 'Radio?', options: [{ text: 'Radio', by: ['Oyin'] }, { text: 'Skip', by: ['Kemi'] }] }],
      feel: { headline: '', feelsLike: [], notThis: [] },
    });
  });
  it('reads the first board: the one-line idea and the mood words', () => {
    const raw = '{"idea":"A warm record.","headline":"Tell the truth, then dance.","feels_like":["Sunlit","Close"],"not_this":["Glossy"]}';
    expect(parseBriefFromIdeas(raw)?.feel).toEqual({ headline: 'Tell the truth, then dance.', feelsLike: ['Sunlit', 'Close'], notThis: ['Glossy'] });
  });
  it('still writes the brief when the mood words come back broken', () => {
    const raw = '{"idea":"A warm record.","headline":7,"feels_like":"warm, handmade","not_this":{}}';
    const brief = parseBriefFromIdeas(raw);
    expect(brief?.idea).toBe('A warm record.');
    expect(brief?.feel).toEqual({ headline: '', feelsLike: ['warm', 'handmade'], notThis: [] });
  });
  it('is null without an idea or valid JSON', () => {
    expect(parseBriefFromIdeas('no json here')).toBeNull();
    expect(parseBriefFromIdeas('{"idea":""}')).toBeNull();
    expect(parseBriefFromIdeas('{bad json}')).toBeNull();
  });
});

describe('small helpers', () => {
  it('labels a source by first name', () => {
    expect(ideaSourceLabel('Kemi Okafor')).toBe("Kemi's idea");
  });
  it('accepts only the uploader\'s own clip for this rollout', () => {
    expect(isOwnIdeaAudioPath('ideas/r1/u1/ab-12.webm', 'r1', 'u1')).toBe(true);
    expect(isOwnIdeaAudioPath('ideas/r1/u2/ab-12.webm', 'r1', 'u1')).toBe(false);
    expect(isOwnIdeaAudioPath('ideas/r1/u1/../x.webm', 'r1', 'u1')).toBe(false);
    expect(isOwnIdeaAudioPath(42, 'r1', 'u1')).toBe(false);
  });
  it('formats a clip length', () => {
    expect(formatClipLength(48)).toBe('0:48');
    expect(formatClipLength(61.4)).toBe('1:01');
    expect(formatClipLength(null)).toBe('');
  });
});
