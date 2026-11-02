import { describe, expect, it } from 'vitest';
import { forgetAllLastSeen, recallLast, rememberLast } from './last-seen';

describe('last seen', () => {
  it('gives back the last copy for the same screen and id', () => {
    rememberLast('brief', 'r1', { a: 1 });
    rememberLast('brief', 'r1', { a: 2 });
    expect(recallLast('brief', 'r1')).toEqual({ a: 2 });
  });

  it('keeps screens and ids apart', () => {
    rememberLast('ideas', 'r1', 'ideas');
    expect(recallLast('brief', 'r2')).toBeNull();
    expect(recallLast('ideas', 'r1')).toBe('ideas');
  });

  it('forgets everything on sign-out', () => {
    rememberLast('brief', 'r9', 1);
    forgetAllLastSeen();
    expect(recallLast('brief', 'r9')).toBeNull();
  });
});
