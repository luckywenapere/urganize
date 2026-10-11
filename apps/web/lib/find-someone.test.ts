import { describe, expect, it } from 'vitest';
import { describeFindSomeone, findSomeoneHref } from './find-someone';

describe('findSomeoneHref', () => {
  it('filters to the role and to people taking work, and carries the rollout and activity', () => {
    const url = new URL(
      findSomeoneHref({ role: 'graphic_designer', releaseId: 'r 1', taskId: 't1' }),
      'https://x.test'
    );
    expect(url.pathname).toBe('/dashboard/directory');
    expect(url.searchParams.get('role')).toBe('graphic_designer');
    expect(url.searchParams.get('availability')).toBe('open');
    expect(url.searchParams.get('from')).toBe('task');
    expect(url.searchParams.get('release')).toBe('r 1');
    expect(url.searchParams.get('task')).toBe('t1');
  });
});

describe('describeFindSomeone', () => {
  it('offers the search when nobody has been asked', () => {
    expect(describeFindSomeone('graphic_designer', [])).toEqual({
      kind: 'find',
      label: 'Find graphic designer',
    });
  });
  it('says who is being waited on', () => {
    expect(describeFindSomeone('pr', [{ status: 'new', recipient_name: 'Tunde' }])).toEqual({
      kind: 'waiting',
      text: 'Asked Tunde, waiting',
    });
  });
  it('lets a yes beat a waiting ask, and says when they are linked to the activity', () => {
    const asks = [
      { status: 'new' as const, recipient_name: 'A' },
      { status: 'interested' as const, recipient_name: 'Tunde', assigned_at: '2026-10-10' },
    ];
    expect(describeFindSomeone('pr', asks)).toEqual({ kind: 'on_it', text: 'Tunde is on this' });
    expect(describeFindSomeone('pr', [{ status: 'interested', recipient_name: 'Tunde' }])).toEqual({
      kind: 'on_it',
      text: 'Tunde said yes',
    });
  });
  it('goes back to the search after a pass or a closed ask', () => {
    for (const status of ['passed', 'expired'] as const) {
      expect(describeFindSomeone('pr', [{ status, recipient_name: 'X' }]).kind).toBe('find');
    }
  });
});
