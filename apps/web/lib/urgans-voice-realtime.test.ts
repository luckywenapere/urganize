import { describe, expect, it } from 'vitest';

import {
  VOICE_CREDITS_PER_MINUTE,
  VOICE_MAX_CALL_MINUTES,
  VOICE_TEAM_DAILY_MINUTES,
  creditsForMinutes,
  decideStart,
  decideTick,
  formatMeter,
  minutesAffordable,
  parseUrgansDoArgs,
  readSpokenAnswer,
  resolveVoiceTransport,
  shouldWarn,
  spokenSummary,
  startedMinutes,
  trimTranscript,
} from './urgans-voice-realtime';

const MIN = 60_000;

describe('the voice rate', () => {
  it('is 2 credits a started minute (founder call, 2026-10-11)', () => {
    expect(VOICE_CREDITS_PER_MINUTE).toBe(2);
    expect(creditsForMinutes(1)).toBe(2);
    expect(creditsForMinutes(3)).toBe(6);
    expect(creditsForMinutes(0)).toBe(0);
    expect(creditsForMinutes(-1)).toBe(0);
  });

  it('counts STARTED minutes: the first second is minute one, 60s starts minute two', () => {
    expect(startedMinutes(0)).toBe(1);
    expect(startedMinutes(59_999)).toBe(1);
    expect(startedMinutes(MIN)).toBe(2);
    expect(startedMinutes(10 * MIN + 1)).toBe(11);
    expect(startedMinutes(Number.NaN)).toBe(1);
  });

  it('says how many minutes a balance pays for', () => {
    expect(minutesAffordable(46)).toBe(23);
    expect(minutesAffordable(1)).toBe(0);
    expect(minutesAffordable(0)).toBe(0);
  });
});

describe('starting a call', () => {
  it('needs one minute of credit', () => {
    expect(decideStart({ balance: 2, teamMinutesToday: 0 })).toEqual({ ok: true });
    expect(decideStart({ balance: 1, teamMinutesToday: 0 })).toEqual({ ok: false, reason: 'out_of_credits' });
    expect(decideStart({ balance: 0, teamMinutesToday: 0 })).toEqual({ ok: false, reason: 'out_of_credits' });
  });

  it('refuses once the team has used its daily minutes', () => {
    expect(decideStart({ balance: 500, teamMinutesToday: VOICE_TEAM_DAILY_MINUTES })).toEqual({ ok: false, reason: 'daily_cap' });
  });

  it('fails open on an unreadable balance (the first tick re-checks)', () => {
    expect(decideStart({ balance: null, teamMinutesToday: 0 })).toEqual({ ok: true });
  });
});

describe('a tick', () => {
  it('bills the first minute at the start of a call', () => {
    expect(decideTick({ elapsedMs: 0, minutesBilled: 0, teamMinutesToday: 0, balance: 10 })).toEqual({
      kind: 'bill',
      minutes: 1,
      minutesBilled: 1,
      credits: 2,
    });
  });

  it('bills nothing for a repeated or early tick, so a double send charges once', () => {
    expect(decideTick({ elapsedMs: 30_000, minutesBilled: 1, teamMinutesToday: 0, balance: 10 })).toEqual({
      kind: 'nothing',
      minutesBilled: 1,
    });
  });

  it('bills the next minute from the server clock', () => {
    expect(decideTick({ elapsedMs: MIN + 500, minutesBilled: 1, teamMinutesToday: 0, balance: 10 })).toMatchObject({
      kind: 'bill',
      minutes: 1,
      minutesBilled: 2,
      credits: 2,
    });
  });

  it('catches up minutes a browser skipped by not ticking', () => {
    expect(decideTick({ elapsedMs: 5 * MIN + 1, minutesBilled: 1, teamMinutesToday: 0, balance: 100 })).toMatchObject({
      kind: 'bill',
      minutes: 5,
      minutesBilled: 6,
      credits: 10,
    });
  });

  it('REFUSES the next minute at zero credits, and does not charge the minute it refuses', () => {
    expect(decideTick({ elapsedMs: MIN + 1, minutesBilled: 1, teamMinutesToday: 0, balance: 0 })).toEqual({
      kind: 'refuse',
      reason: 'out_of_credits',
      minutes: 0,
      minutesBilled: 1,
      credits: 0,
    });
    expect(decideTick({ elapsedMs: MIN + 1, minutesBilled: 1, teamMinutesToday: 0, balance: 1 })).toMatchObject({
      kind: 'refuse',
      reason: 'out_of_credits',
    });
  });

  it('still charges minutes that were used and never billed when it refuses', () => {
    // Skipped three ticks, then ran out: minutes 2 to 4 were used, minute 5 is refused.
    expect(decideTick({ elapsedMs: 4 * MIN + 1, minutesBilled: 1, teamMinutesToday: 0, balance: 3 })).toMatchObject({
      kind: 'refuse',
      reason: 'out_of_credits',
      minutes: 3,
      minutesBilled: 4,
    });
  });

  it('ends a call at 30 minutes, charging up to the 30th and never past it', () => {
    expect(
      decideTick({ elapsedMs: VOICE_MAX_CALL_MINUTES * MIN + 1, minutesBilled: VOICE_MAX_CALL_MINUTES, teamMinutesToday: 0, balance: 999 })
    ).toMatchObject({ kind: 'refuse', reason: 'call_cap', minutes: 0, minutesBilled: 30 });
    expect(decideTick({ elapsedMs: 90 * MIN, minutesBilled: 25, teamMinutesToday: 0, balance: 999 })).toMatchObject({
      kind: 'refuse',
      reason: 'call_cap',
      minutes: 5,
      minutesBilled: 30,
      credits: 10,
    });
  });

  it("refuses the minute that would take the team past 120 minutes today", () => {
    expect(decideTick({ elapsedMs: MIN + 1, minutesBilled: 1, teamMinutesToday: 119, balance: 999 })).toMatchObject({
      kind: 'refuse',
      reason: 'daily_cap',
      minutes: 0,
    });
    expect(decideTick({ elapsedMs: MIN + 1, minutesBilled: 1, teamMinutesToday: 118, balance: 999 })).toMatchObject({ kind: 'bill' });
  });

  it('warns a minute before the call has to end', () => {
    expect(shouldWarn({ balance: 3, minutesBilled: 2, teamMinutesToday: 0 })).toBe(true);
    expect(shouldWarn({ balance: 40, minutesBilled: 29, teamMinutesToday: 0 })).toBe(true);
    expect(shouldWarn({ balance: 40, minutesBilled: 5, teamMinutesToday: 114 })).toBe(true);
    expect(shouldWarn({ balance: 40, minutesBilled: 5, teamMinutesToday: 0 })).toBe(false);
    expect(shouldWarn({ balance: null, minutesBilled: 5, teamMinutesToday: 0 })).toBe(false);
  });
});

describe('the transport', () => {
  it('defaults to cascade, the one verified end to end', () => {
    expect(resolveVoiceTransport(undefined)).toBe('cascade');
    expect(resolveVoiceTransport('')).toBe('cascade');
    expect(resolveVoiceTransport('webrtc')).toBe('cascade');
    expect(resolveVoiceTransport(' Realtime ')).toBe('realtime');
  });
});

describe('the urgans_do tool arguments', () => {
  it('reads a JSON string or an object', () => {
    expect(parseUrgansDoArgs('{"request":"make a plan"}')).toEqual({ request: 'make a plan', confirmed: false, cancel: false });
    expect(parseUrgansDoArgs({ request: 'yes', confirmed: true })).toEqual({ request: 'yes', confirmed: true, cancel: false });
  });

  it('never reads a request as both yes and no', () => {
    expect(parseUrgansDoArgs({ request: '', confirmed: true, cancel: true })).toEqual({ request: '', confirmed: true, cancel: false });
  });

  it('refuses nothing to do, and bad JSON', () => {
    expect(parseUrgansDoArgs({ request: '  ' })).toBeNull();
    expect(parseUrgansDoArgs('{not json')).toBeNull();
    expect(parseUrgansDoArgs(null)).toBeNull();
    expect(parseUrgansDoArgs(['x'])).toBeNull();
  });

  it('caps a long request', () => {
    expect(parseUrgansDoArgs({ request: 'a'.repeat(5000) })?.request.length).toBe(1000);
  });
});

describe('a spoken answer to "Should I go ahead?"', () => {
  it('hears yes and no, and treats anything else as not yes', () => {
    for (const yes of ['Yes', 'yeah do it', 'Go ahead.', 'okay', 'Sure', 'confirm']) expect(readSpokenAnswer(yes), yes).toBe('yes');
    for (const no of ['No', 'nope', 'cancel that', "don't", 'wait']) expect(readSpokenAnswer(no), no).toBe('no');
    for (const unclear of ['', 'hmm', 'what did you say', 'maybe later']) expect(readSpokenAnswer(unclear), unclear).toBe('unclear');
  });
});

describe('what AI says aloud', () => {
  it('keeps two sentences and points at the screen instead of reading a list', () => {
    const reply = 'I added 6 tasks to "Calm Down". They start next week. Here they are:\n- Artwork\n- Pitch\n- Teaser';
    expect(spokenSummary(reply)).toBe('I added 6 tasks to "Calm Down". They start next week. The details are on screen.');
  });

  it('drops markdown', () => {
    expect(spokenSummary('**Done.** See [the plan](/dashboard).')).toBe('Done. See the plan.');
  });
});

describe('the meter', () => {
  it('reads "2 credits/min · 1:42 · 46 left"', () => {
    expect(formatMeter({ elapsedMs: 102_000, balance: 46 })).toBe('2 credits/min · 1:42 · 46 left');
    expect(formatMeter({ elapsedMs: 5_000, balance: null })).toBe('2 credits/min · 0:05');
  });
});

describe('the transcript a turn carries', () => {
  it('keeps the last twelve well-formed lines', () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `line ${i}` }));
    const trimmed = trimTranscript([...lines, { role: 'system', text: 'ignore' }, { role: 'user', text: '' }, null]);
    expect(trimmed).toHaveLength(12);
    expect(trimmed[0].text).toBe('line 8');
    expect(trimmed.every((l) => l.role === 'user' || l.role === 'assistant')).toBe(true);
  });
});
