import { describe, expect, it } from 'vitest';
import { briefSeen, presentKeyAction, presentSlides, stepSlide } from './brief-present';

describe('presentSlides', () => {
  it('always opens on the idea and keeps the five screens in order', () => {
    expect(presentSlides({ images: 2, links: 1, pieces: 3, dates: 4 })).toEqual(['idea', 'look', 'sound', 'making', 'dates']);
  });

  it('skips a screen with nothing on it', () => {
    expect(presentSlides({ images: 0, links: 0, pieces: 0, dates: 0 })).toEqual(['idea']);
    expect(presentSlides({ images: 1, links: 0, pieces: 0, dates: 2 })).toEqual(['idea', 'look', 'dates']);
  });
});

describe('presentKeyAction', () => {
  it('reads arrows and the keys a clicker sends', () => {
    for (const key of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter']) expect(presentKeyAction(key)).toBe('next');
    for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']) expect(presentKeyAction(key)).toBe('prev');
    expect(presentKeyAction('Home')).toBe('first');
    expect(presentKeyAction('End')).toBe('last');
    expect(presentKeyAction('Escape')).toBe('close');
    expect(presentKeyAction('a')).toBeNull();
  });
});

describe('stepSlide', () => {
  it('stops at the ends instead of wrapping', () => {
    expect(stepSlide(0, 5, 'prev')).toBe(0);
    expect(stepSlide(4, 5, 'next')).toBe(4);
    expect(stepSlide(1, 5, 'next')).toBe(2);
    expect(stepSlide(3, 5, 'first')).toBe(0);
    expect(stepSlide(0, 5, 'last')).toBe(4);
  });
});

describe('briefSeen', () => {
  const team = [
    { userId: 'a', name: 'Ada', initials: 'AD' },
    { userId: 'b', name: 'Bo', initials: 'BO' },
    { userId: 'c', name: 'Cy', initials: 'CY' },
  ];

  it('counts the team who have opened it, newest first', () => {
    const seen = briefSeen(team, [
      { userId: 'a', seenAt: '2026-10-30T10:00:00Z' },
      { userId: 'c', seenAt: '2026-10-31T09:00:00Z' },
      { userId: 'stranger', seenAt: '2026-10-31T09:00:00Z' },
    ]);
    expect(seen.total).toBe(3);
    expect(seen.people.map((person) => person.userId)).toEqual(['c', 'a']);
    expect(seen.line).toBe('Seen the brief: 2 of 3');
  });

  it('says when everyone has, and is quiet for a team of one', () => {
    const all = briefSeen(team, team.map((person) => ({ userId: person.userId, seenAt: '2026-10-31T09:00:00Z' })));
    expect(all.line).toBe('Everyone has seen the brief');
    expect(briefSeen([team[0]], [{ userId: 'a', seenAt: '2026-10-31T09:00:00Z' }]).line).toBe('');
  });
});
