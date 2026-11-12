import { describe, expect, it } from 'vitest';
import {
  NOTHING_PICKED_LINE,
  PICK_PROMISE,
  creditsAmount,
  curatorsPicked,
  pitchSummary,
  sendToCurators,
  shortLine,
  sentDayLabel,
} from './pitch-summary';

const pick = (id: string, creditPrice: unknown, curatorName = `Curator ${id}`) => ({ id, curatorName, creditPrice });

describe('the running total', () => {
  it('lists each picked curator with its price, in the order picked', () => {
    const summary = pitchSummary([pick('a', 25, 'Nadia'), pick('b', 12, 'Samuel')], 120);
    expect(summary.lines).toEqual([
      { id: 'a', name: 'Nadia', credits: 25 },
      { id: 'b', name: 'Samuel', credits: 12 },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.total).toBe(37);
  });

  it('counts free curators as 0 and bad prices as free', () => {
    const summary = pitchSummary([pick('a', 0), pick('b', 'x'), pick('c', -5), pick('d', 100.9)], 500);
    expect(summary.lines.map((line) => line.credits)).toEqual([0, 0, 0, 100]);
    expect(summary.total).toBe(100);
  });

  it('is empty with nothing picked', () => {
    const summary = pitchSummary([], 50);
    expect(summary).toMatchObject({ count: 0, total: 0, lines: [], short: 0, enough: true, canSend: false });
  });
});

describe('the enough-credits rule', () => {
  it('is enough when the total is at or under what the team has', () => {
    expect(pitchSummary([pick('a', 100)], 100)).toMatchObject({ enough: true, short: 0, canSend: true });
    expect(pitchSummary([pick('a', 100)], 101)).toMatchObject({ enough: true, short: 0 });
  });

  it('says how many credits short when the total is more', () => {
    expect(pitchSummary([pick('a', 100), pick('b', 250)], 120)).toMatchObject({
      total: 350,
      enough: false,
      short: 230,
      canSend: true,
    });
  });

  it('free picks are always enough, even with no credits', () => {
    expect(pitchSummary([pick('a', 0)], 0)).toMatchObject({ enough: true, short: 0 });
  });

  it('an unknown balance is not called short: the server decides', () => {
    expect(pitchSummary([pick('a', 100)], null)).toMatchObject({ enough: null, short: 0, balance: null, canSend: true });
    expect(pitchSummary([pick('a', 0)], null)).toMatchObject({ enough: true });
  });

  it('never reads a negative or broken balance as credits', () => {
    expect(pitchSummary([pick('a', 10)], -40)).toMatchObject({ balance: 0, short: 10, enough: false });
    expect(pitchSummary([pick('a', 10)], Number.NaN)).toMatchObject({ balance: null, enough: null });
  });
});

describe('copy', () => {
  it('counts curators', () => {
    expect(curatorsPicked(0)).toBe('No curators picked');
    expect(curatorsPicked(1)).toBe('1 curator picked');
    expect(curatorsPicked(2)).toBe('2 curators picked');
  });

  it('names the send button', () => {
    expect(sendToCurators(0)).toBe('Send to curators');
    expect(sendToCurators(1)).toBe('Send to 1 curator');
    expect(sendToCurators(12)).toBe('Send to 12 curators');
  });

  it('writes amounts', () => {
    expect(creditsAmount(0)).toBe('Free');
    expect(creditsAmount(1)).toBe('1 credit');
    expect(creditsAmount(1250)).toBe('1,250 credits');
    expect(shortLine(1)).toBe('You need 1 more credit.');
    expect(shortLine(230)).toBe('You need 230 more credits.');
  });

  it('keeps the promise plain and has no em dashes', () => {
    for (const line of [PICK_PROMISE, NOTHING_PICKED_LINE]) {
      expect(line).not.toMatch(/—/);
    }
    expect(PICK_PROMISE).toBe('No reply in 7 days and the credits come back to you.');
  });

  it('dates a sent pitch', () => {
    expect(sentDayLabel('2026-11-03T10:00:00Z')).toBe('Sent 3 Nov');
    expect(sentDayLabel('not a date')).toBe('');
  });
});
