import { describe, expect, it } from 'vitest';
import {
  CHAT_CARD_COPY,
  aboutOptions,
  buildChatSuggestions,
  chatCardGreeting,
  defaultAboutId,
  PHONE_TRY_CARDS,
  TRY_CARDS_HIDE_AFTER,
  showTryCards,
  type SuggestionRow,
} from './chat-card';

const at = (iso: string) => new Date(iso);

describe('chatCardGreeting', () => {
  it('says the day and the part of the day, then greets by first name', () => {
    // 15 Nov 2026 is a Sunday.
    expect(chatCardGreeting({ name: 'Oyin Wenapere', now: at('2026-11-15T19:30:00') })).toEqual({
      line: 'Sunday evening',
      greeting: 'Good evening, Oyin.',
    });
  });

  it('follows the same hours as the phone Home', () => {
    expect(chatCardGreeting({ name: 'Ada', now: at('2026-11-16T05:00:00') }).line).toBe('Monday morning');
    expect(chatCardGreeting({ name: 'Ada', now: at('2026-11-16T11:59:00') }).greeting).toBe('Good morning, Ada.');
    expect(chatCardGreeting({ name: 'Ada', now: at('2026-11-16T12:00:00') }).line).toBe('Monday afternoon');
    expect(chatCardGreeting({ name: 'Ada', now: at('2026-11-16T17:00:00') }).greeting).toBe('Good evening, Ada.');
    // Past midnight is still the evening of a late night, on the new day.
    expect(chatCardGreeting({ name: 'Ada', now: at('2026-11-17T02:00:00') }).line).toBe('Tuesday evening');
  });

  it('drops the name when there is none, never "there"', () => {
    expect(chatCardGreeting({ name: '  ', now: at('2026-11-16T09:00:00') }).greeting).toBe('Good morning.');
    expect(chatCardGreeting({ name: null, now: at('2026-11-16T09:00:00') }).greeting).toBe('Good morning.');
  });
});

type R = { id: string; title: string; artistName: string; releaseDate: string | null };
const r = (id: string, releaseDate: string | null, title = id, artistName = 'Ayo'): R => ({
  id,
  title,
  artistName,
  releaseDate,
});

describe('aboutOptions', () => {
  const today = '2026-11-10';

  it('lists rollouts nearest drop first, then no date yet, then ones already out, newest first', () => {
    const options = aboutOptions(
      [
        r('old', '2026-10-01'),
        r('undated', null),
        r('far', '2026-12-30'),
        r('near', '2026-11-18'),
        r('recent', '2026-11-05'),
        r('today', '2026-11-10'),
      ],
      today
    );
    expect(options.map((option) => option.id)).toEqual(['today', 'near', 'far', 'undated', 'recent', 'old']);
  });

  it('says who and when under each one', () => {
    const [today0, near, undated, out] = aboutOptions(
      [r('a', '2026-11-10'), r('b', '2026-11-18', 'Blue Season', 'Zainab'), r('c', null), r('d', '2026-11-09')],
      today
    );
    expect(today0.detail).toBe('Ayo · drops today');
    expect(near).toMatchObject({ title: 'Blue Season', detail: 'Zainab · in 8 days' });
    expect(undated.detail).toBe('Ayo · no date yet');
    expect(out.detail).toBe('Ayo · out');
  });

  it('says tomorrow for one day, and leaves out a missing artist', () => {
    const [only] = aboutOptions([{ ...r('a', '2026-11-11'), artistName: '' }], today);
    expect(only.detail).toBe('tomorrow');
  });

  it('keeps the given order when two drop the same day', () => {
    expect(aboutOptions([r('x', '2026-11-20'), r('y', '2026-11-20')], today).map((option) => option.id)).toEqual([
      'x',
      'y',
    ]);
  });
});

describe('defaultAboutId', () => {
  it('starts on Everything', () => {
    expect(defaultAboutId([{ id: 'a' }, { id: 'b' }])).toBeNull();
    expect(defaultAboutId([])).toBeNull();
  });

  it('starts on the only rollout when there is just one', () => {
    expect(defaultAboutId([{ id: 'a' }])).toBe('a');
  });
});

const row = (over: Partial<SuggestionRow> & { artistName: string }): SuggestionRow => ({
  status: 'rolling_out',
  releaseId: 'r1',
  title: 'Blue Season',
  daysToGo: 8,
  late: 0,
  ...over,
});

describe('buildChatSuggestions', () => {
  it('writes four from your own data, in a fixed order', () => {
    const chips = buildChatSuggestions([
      row({ artistName: 'Zainab Oyelaran', releaseId: 'blue', title: 'Blue Season', daysToGo: 8, late: 34 }),
      row({ artistName: 'Victory', releaseId: 'mid', title: 'Midnight Drive', daysToGo: 21, late: 2 }),
      row({ artistName: 'Ayo Kanmi', status: 'quiet', releaseId: null, title: null, daysToGo: null }),
    ]);
    expect(chips).toEqual([
      { kind: 'late', text: 'What is late on Blue Season?', releaseId: 'blue' },
      { kind: 'today', text: 'What should I do today?', releaseId: null },
      { kind: 'plan', text: 'Plan the next record for Ayo Kanmi', releaseId: null },
      { kind: 'write', text: 'Write a status update for Zainab', releaseId: 'blue' },
    ]);
  });

  it('asks about the rollout with the most late tasks', () => {
    const [late] = buildChatSuggestions([
      row({ artistName: 'A', releaseId: 'a', title: 'First', daysToGo: 3, late: 1 }),
      row({ artistName: 'B', releaseId: 'b', title: 'Second', daysToGo: 9, late: 6 }),
    ]);
    expect(late).toMatchObject({ kind: 'late', releaseId: 'b', text: 'What is late on Second?' });
  });

  it('writes the update for the nearest dated rollout, not an undated one', () => {
    const chips = buildChatSuggestions([
      row({ artistName: 'Undated Person', releaseId: 'u', title: 'Someday', daysToGo: null }),
      row({ artistName: 'Far Away', releaseId: 'f', title: 'Far', daysToGo: 40 }),
      row({ artistName: 'Near Soon', releaseId: 'n', title: 'Near', daysToGo: 4 }),
    ]);
    expect(chips.find((chip) => chip.kind === 'write')).toEqual({
      kind: 'write',
      text: 'Write a status update for Near',
      releaseId: 'n',
    });
  });

  it('hides each chip whose data is missing', () => {
    // Nothing late, nobody quiet: no late chip and no plan chip.
    expect(buildChatSuggestions([row({ artistName: 'Zainab', late: 0 })]).map((chip) => chip.kind)).toEqual([
      'today',
      'write',
    ]);
    // Nothing in flight at all: only the plan chip.
    expect(
      buildChatSuggestions([row({ artistName: 'Ayo', status: 'out_now', releaseId: 'x', title: 'Old', daysToGo: -3 })]).map(
        (chip) => chip.kind
      )
    ).toEqual(['plan']);
    expect(buildChatSuggestions([])).toEqual([]);
  });

  it('prefers a quiet artist over one whose song is just out', () => {
    const plan = buildChatSuggestions([
      row({ artistName: 'Just Out', status: 'out_now', releaseId: 'x', title: 'Old', daysToGo: -2 }),
      row({ artistName: 'Quiet One', status: 'quiet', releaseId: null, title: null, daysToGo: null }),
    ]).find((chip) => chip.kind === 'plan');
    expect(plan?.text).toBe('Plan the next record for Quiet One');
  });

  it('asks in plain words and never names the product', () => {
    expect(CHAT_CARD_COPY.ask).toBe('What is on your mind?');
    expect(CHAT_CARD_COPY.placeholder).toBe('What is slipping? Who is waiting on you? What comes next? Just ask.');
    const all = [CHAT_CARD_COPY.placeholder, CHAT_CARD_COPY.ask, CHAT_CARD_COPY.everythingDetail].join(' ');
    expect(all).not.toMatch(/urgans|chappi|assistant/i);
    expect(all).not.toContain('—');
  });
});

describe('phone Try one cards (#1339)', () => {
  it('offers the three cards from the mock, in order', () => {
    expect(PHONE_TRY_CARDS.map((card) => card.kind)).toEqual(['plan', 'upload', 'artist']);
    expect(PHONE_TRY_CARDS.map((card) => card.title)).toEqual(['Plan a rollout', 'Upload a song', 'Add an artist']);
  });

  it('carries a title only, no second line (#1342)', () => {
    for (const card of PHONE_TRY_CARDS) {
      expect(Object.keys(card).sort()).toEqual(card.ask ? ['ask', 'kind', 'title'] : ['kind', 'title']);
    }
  });

  it('every card opens a step; none asks the AI (#1364)', () => {
    for (const card of PHONE_TRY_CARDS) expect(card.ask).toBeUndefined();
  });

  it('shows the cards until a few messages have been sent from Home', () => {
    expect(showTryCards(0)).toBe(true);
    expect(showTryCards(TRY_CARDS_HIDE_AFTER - 1)).toBe(true);
    expect(showTryCards(TRY_CARDS_HIDE_AFTER)).toBe(false);
    expect(showTryCards(TRY_CARDS_HIDE_AFTER + 5)).toBe(false);
  });

  it('shows the cards when the count cannot be read', () => {
    expect(showTryCards(Number.NaN)).toBe(true);
    expect(showTryCards(-1)).toBe(true);
  });
});
