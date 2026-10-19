import { describe, expect, it } from 'vitest';
import { cleanQuestion, draftQuestion, isRepeatQuestion, mergeOpenItems, normaliseQuestion, MAX_DESK_ITEMS_PER_QUESTION } from './text';
import { proposeRuleFromAnswer, parseDeskTerms, addLearnedRule, hasDeskFacts, isDeskLive } from './terms';
import { isFrontDeskEnabledFor } from './flag';
import { questionsDue } from './digest-server';
import { SAMPLE_TERMS } from './sample';

const item = (text: string) => ({ text, norm: normaliseQuestion(text) });

describe('question cleaning', () => {
  it('strips control and zero-width characters and caps length', () => {
    expect(cleanQuestion('  When\u200B does\u0000 it start?  ')).toBe('When does it start?');
    expect(cleanQuestion('x'.repeat(500)).length).toBe(300);
    expect(cleanQuestion(42)).toBe('');
  });
  it('drafts a clean question', () => {
    expect(draftQuestion('can it move to the 6th...')).toBe('Can it move to the 6th?');
  });
});

describe('dedupe (one clean message for the curator)', () => {
  it('an exact or near repeat is dropped', () => {
    const open = [item('Can the placement move to Fri 6 Nov?')];
    expect(mergeOpenItems(open, item('can the placement move to fri 6 nov')).repeatOf).toBe(0);
    expect(mergeOpenItems(open, item('Can my placement move to Fri 6 Nov please?')).repeatOf).toBe(0);
  });
  it('a different question is appended as the next item', () => {
    const open = [item('Can the placement move to Fri 6 Nov?')];
    const merged = mergeOpenItems(open, item('What time does the drop-day story go up?'));
    expect(merged.repeatOf).toBeNull();
    expect(merged.items).toHaveLength(2);
  });
  it('caps the open question', () => {
    const open = Array.from({ length: MAX_DESK_ITEMS_PER_QUESTION }, (_, i) => item(`Question number ${i} about topic ${i * 7}`));
    expect(mergeOpenItems(open, item('Completely new thing about artwork sizes')).full).toBe(true);
  });
  it('short unrelated questions are not merged', () => {
    expect(isRepeatQuestion(normaliseQuestion('Is the story included?'), normaliseQuestion('Is the interview included?'))).toBe(false);
  });
});

describe('terms', () => {
  it('drops unknown fields, caps lengths, never stores a bad shape', () => {
    const parsed = parseDeskTerms({
      services: [{ name: 'A'.repeat(200), rateNaira: '₦25,000', includes: ['x', 'x', 'y'], evil: true }, { name: '' }],
      timing: { repliesWithinDays: -3, startsOn: 'Fridays' },
      rules: ['No stream guarantees', { text: 'no stream guarantees' }],
      extra: 'nope',
    });
    expect(parsed.services).toHaveLength(1);
    expect(parsed.services[0].name).toHaveLength(60);
    expect(parsed.services[0].rateNaira).toBe(25000);
    expect(parsed.services[0].includes).toEqual(['x', 'y']);
    expect(parsed.timing.repliesWithinDays).toBeNull();
    expect(parsed.rules).toHaveLength(1);
    expect(Object.keys(parsed)).toEqual(['services', 'timing', 'send', 'genres', 'rules']);
  });
  it('the toggle only answers with a service (empty state)', () => {
    expect(hasDeskFacts(parseDeskTerms({}))).toBe(false);
    expect(isDeskLive(true, parseDeskTerms({}))).toBe(false);
    expect(isDeskLive(true, SAMPLE_TERMS)).toBe(true);
    expect(isDeskLive(false, SAMPLE_TERMS)).toBe(false);
  });
  it('a proposed rule is the curator’s own words, tidied, never paraphrased', () => {
    expect(proposeRuleFromAnswer('No. NMF slots lock 2 weeks ahead, so the 30th stays')).toBe('NMF slots lock 2 weeks ahead, so the 30th stays.');
  });
  it('one tap adds a learned rule once', () => {
    const once = addLearnedRule(SAMPLE_TERMS, 'Start dates lock 2 weeks ahead.', '2026-10-18T20:00:00Z');
    const twice = addLearnedRule(once, 'start dates lock 2 weeks ahead.', '2026-10-18T21:00:00Z');
    expect(once.rules).toHaveLength(SAMPLE_TERMS.rules.length + 1);
    expect(once.rules[once.rules.length - 1]).toMatchObject({ learned: true });
    expect(twice.rules).toHaveLength(once.rules.length);
  });
});

describe('flag isolation', () => {
  it('on for every curator by default', () => {
    expect(isFrontDeskEnabledFor('luckydio10+flowtest1011@gmail.com', {})).toBe(true);
    expect(isFrontDeskEnabledFor('x@y.co', {})).toBe(true);
    expect(isFrontDeskEnabledFor('x@y.co', { FRONT_DESK_ALL: 'true' })).toBe(true);
  });
  it('FRONT_DESK_ALL=false falls back to the Flow Test account plus FRONT_DESK_EMAILS', () => {
    const off = { FRONT_DESK_ALL: 'false' };
    expect(isFrontDeskEnabledFor('luckydio10+flowtest1011@gmail.com', off)).toBe(true);
    expect(isFrontDeskEnabledFor('LuckyDio10+FlowTest1011@gmail.com', off)).toBe(true);
    expect(isFrontDeskEnabledFor('luckydio10@gmail.com', off)).toBe(false);
    expect(isFrontDeskEnabledFor('luckydio10+flowtest1011c@gmail.com', off)).toBe(false);
    expect(isFrontDeskEnabledFor(null, off)).toBe(false);
    expect(isFrontDeskEnabledFor('a@b.co', { ...off, FRONT_DESK_EMAILS: ' A@b.co , c@d.co' })).toBe(true);
  });
});

describe('digest dedupe', () => {
  it('a question rides the digest once, and again only when an item was added', () => {
    const rows = [
      { id: 'never', lastItemAt: '2026-10-18T10:00:00+00:00', digestSentAt: null },
      { id: 'sent', lastItemAt: '2026-10-18T10:00:00+00:00', digestSentAt: '2026-10-18T10:00:00+00:00' },
      { id: 'grew', lastItemAt: '2026-10-19T09:00:00+00:00', digestSentAt: '2026-10-18T10:00:00+00:00' },
    ];
    expect(questionsDue(rows).map((row) => row.id)).toEqual(['never', 'grew']);
  });
});
