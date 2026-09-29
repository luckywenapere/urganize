import { describe, expect, it } from 'vitest';
import { buildHomeHeader, firstNameFrom, formatHeaderDate, greetingForHour } from './header';

describe('greetingForHour', () => {
  it.each([
    [0, 'Good evening'],
    [4, 'Good evening'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [23, 'Good evening'],
  ])('hour %i reads "%s"', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});

describe('firstNameFrom', () => {
  it('takes the first word of a full name', () => {
    expect(firstNameFrom('Ada Obi')).toBe('Ada');
  });

  it('falls back to "there" for null, empty or whitespace-only names', () => {
    expect(firstNameFrom(null)).toBe('there');
    expect(firstNameFrom(undefined)).toBe('there');
    expect(firstNameFrom('   ')).toBe('there');
  });

  it('handles a single-word name', () => {
    expect(firstNameFrom('Chidera')).toBe('Chidera');
  });
});

describe('formatHeaderDate', () => {
  it('formats as weekday, day, month with no year', () => {
    const label = formatHeaderDate(new Date('2026-09-29T12:00:00.000Z'));
    expect(label).not.toMatch(/2026/);
    expect(label.length).toBeGreaterThan(0);
  });
});

describe('buildHomeHeader', () => {
  it('assembles the full header from a name, team and clock', () => {
    const header = buildHomeHeader({
      name: 'Ada Obi',
      teamName: 'Northline Music',
      now: new Date('2026-09-29T09:00:00.000Z'),
    });
    expect(header.firstName).toBe('Ada');
    expect(header.teamName).toBe('Northline Music');
    expect(header.dateLabel.length).toBeGreaterThan(0);
    expect(['Good morning', 'Good afternoon', 'Good evening']).toContain(header.greeting);
  });

  it('handles a null name and null team gracefully', () => {
    const header = buildHomeHeader({ name: null, teamName: null });
    expect(header.firstName).toBe('there');
    expect(header.teamName).toBeNull();
  });
});
