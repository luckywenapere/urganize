import { describe, expect, it } from 'vitest';
import { dateAppearsIn, detectClosedSignal, detectRollingSignal, isCalendarDate, isPastDay, readDates } from './dates';

const iso = (text: string) => readDates(text).map((d) => d.iso);

describe('reading dates', () => {
  it('reads the common written forms', () => {
    expect(iso('Apply by 30 November 2026')).toEqual(['2026-11-30']);
    expect(iso('Deadline: 30th Nov 2026')).toEqual(['2026-11-30']);
    expect(iso('Closes November 30, 2026.')).toEqual(['2026-11-30']);
    expect(iso('closes nov 30 2026')).toEqual(['2026-11-30']);
    expect(iso('Open until 2026-11-30 at noon')).toEqual(['2026-11-30']);
    expect(iso('1 Sept 2026')).toEqual(['2026-09-01']);
    expect(iso('15 jan 2027')).toEqual(['2027-01-15']);
    expect(iso('the 3rd of March 2027')).toEqual(['2027-03-03']);
  });

  it('reads a numeric date only when it cannot be read two ways', () => {
    expect(iso('30/11/2026')).toEqual(['2026-11-30']);
    expect(iso('30.11.2026')).toEqual(['2026-11-30']);
    expect(iso('11/30/2026')).toEqual(['2026-11-30']);
    expect(iso('03/11/2026')).toEqual([]);
    expect(iso('05.06.2026')).toEqual([]);
  });

  it('skips dates that are not on the calendar', () => {
    expect(iso('31 February 2026')).toEqual([]);
    expect(iso('2026-02-30')).toEqual([]);
    expect(iso('31 November 2026')).toEqual([]);
    expect(iso('0 May 2026')).toEqual([]);
  });

  it('needs a year, because a deadline without one cannot be checked', () => {
    expect(iso('Apply by 30 November')).toEqual([]);
    expect(iso('November 30')).toEqual([]);
  });

  it('returns every date in order with where it was found', () => {
    const found = readDates('Opens 1 March 2026 and closes 30 November 2026.');
    expect(found.map((d) => d.iso)).toEqual(['2026-03-01', '2026-11-30']);
    expect(found[0].index).toBeLessThan(found[1].index);
    expect(found[1].raw).toContain('30 November 2026');
  });

  it('does not read a number that is part of something else', () => {
    expect(iso('Call 2026-11-300 or ref 12345-11-30')).toEqual([]);
  });
});

describe('isCalendarDate', () => {
  it('accepts real dates only', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('26-01-01')).toBe(false);
    expect(isCalendarDate('')).toBe(false);
  });
});

describe('isPastDay', () => {
  it('counts only days before today as past', () => {
    expect(isPastDay('2026-10-10', '2026-10-11')).toBe(true);
    expect(isPastDay('2026-10-11', '2026-10-11')).toBe(false);
    expect(isPastDay('2026-12-01', '2026-10-11')).toBe(false);
  });
});

describe('a page that says the round is closed', () => {
  it('notices the usual ways of saying so', () => {
    for (const text of [
      'Applications are closed.',
      'Applications closed on 12 March 2025',
      'This call is now closed',
      'The programme has closed to new applicants',
      'We are no longer accepting applications',
      'The deadline has passed',
      'Applications have closed for this round',
      'Closed for applications',
    ]) {
      expect(detectClosedSignal(text), text).toBe(true);
    }
  });

  it('does not mistake an upcoming close for a closed round', () => {
    for (const text of [
      'Applications close on 30 November 2026',
      'Deadline: 30 November 2026',
      'Applications are open until 30 November 2026',
      'Closes soon: apply now',
      'We close the office at 5pm',
    ]) {
      expect(detectClosedSignal(text), text).toBe(false);
    }
  });
});

describe('a page that says it takes applications all the time', () => {
  it('notices rolling applications', () => {
    for (const text of [
      'Applications are reviewed on a rolling basis',
      'We accept rolling applications',
      'Open year-round',
      'Applications are accepted all year round',
    ]) {
      expect(detectRollingSignal(text), text).toBe(true);
    }
    expect(detectRollingSignal('Rolling Stone ran a story on this')).toBe(false);
  });
});

describe('dateAppearsIn', () => {
  it('is true only when the page itself holds that date', () => {
    expect(dateAppearsIn('2026-11-30', 'Apply by 30 November 2026')).toBe(true);
    expect(dateAppearsIn('2026-11-29', 'Apply by 30 November 2026')).toBe(false);
    expect(dateAppearsIn('2026-11-30', 'Apply soon')).toBe(false);
    expect(dateAppearsIn('2026-02-30', '30 February 2026')).toBe(false);
  });
});
