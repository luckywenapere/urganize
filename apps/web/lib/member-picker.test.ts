import { describe, expect, it } from 'vitest';
import { filterMembersForPicker } from './tasks';
import type { WorkspaceMember } from '@/types/auth';

/**
 * The assignee picker's filter rule (2026-08-29).
 *
 * Reported bug: a manager opened an activity that was already assigned to
 * himself, tapped Assignee to hand it to a teammate, and the teammate was not
 * in the list. Cause: the picker's input is BOTH the display of the current
 * assignee and the search box, so it arrives holding the current assignee's
 * name and the list filters down to that one person. Every
 * template-generated activity is assigned to the release owner, which is why
 * it showed up on the very first activity.
 *
 * These pin the guard. They live here rather than beside the component
 * because vitest runs `environment: 'node'` and collects only `lib/**` and
 * `app/**` — components stay on manual testing per CLAUDE.md's v1 posture,
 * the same reason `lib/task-sections.test.ts` exists.
 */

function member(overrides: Partial<WorkspaceMember> & { name: string }): WorkspaceMember {
  return {
    id: `id-${overrides.name}`,
    workspaceId: 'ws-1',
    userId: `user-${overrides.name}`,
    email: `${overrides.name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    role: 'member',
    status: 'active',
    invitedAt: '2026-08-01T00:00:00Z',
    joinedAt: '2026-08-02T00:00:00Z',
    isCurrentUser: false,
    initials: 'XX',
    avatarUrl: null,
    ...overrides,
  } as WorkspaceMember;
}

const lucky = member({ name: 'Lucky Wenapere' });
const tobi = member({ name: 'Tobi Adeyemi' });
const ada = member({ name: 'Ada Okoye' });
const team = [lucky, tobi, ada];

describe('filterMembersForPicker', () => {
  it('lists the WHOLE team when the query is just the current assignee (the reported bug)', () => {
    expect(filterMembersForPicker(team, 'Lucky Wenapere', lucky)).toEqual(team);
  });

  it('lists everyone when nothing has been typed', () => {
    expect(filterMembersForPicker(team, '', null)).toEqual(team);
    expect(filterMembersForPicker(team, '   ', null)).toEqual(team);
  });

  it('lists everyone when the box is cleared while someone is assigned', () => {
    expect(filterMembersForPicker(team, '', lucky)).toEqual(team);
  });

  it('filters as soon as the text differs from the seeded selection', () => {
    // The manager starts typing over the current assignee's name.
    expect(filterMembersForPicker(team, 'Tobi', lucky)).toEqual([tobi]);
  });

  it('still filters normally with no selection at all', () => {
    // Guard must not swallow filtering for a fresh, unassigned picker.
    expect(filterMembersForPicker(team, 'ada', null)).toEqual([ada]);
  });

  it('matches on email as well as name', () => {
    expect(filterMembersForPicker(team, 'tobi.adeyemi@example.com', null)).toEqual([tobi]);
  });

  it('ignores case and surrounding whitespace when comparing to the selection', () => {
    expect(filterMembersForPicker(team, '  lucky wenapere  ', lucky)).toEqual(team);
  });

  it('does not treat a query equal to some OTHER member as the selection', () => {
    // Only the SELECTED member's name gets the pass-through. Typing a
    // different teammate's name in full must still narrow to them.
    expect(filterMembersForPicker(team, 'Tobi Adeyemi', lucky)).toEqual([tobi]);
  });

  it('returns nothing when the text matches nobody', () => {
    expect(filterMembersForPicker(team, 'zzz', lucky)).toEqual([]);
  });

  it('is case-insensitive when filtering', () => {
    expect(filterMembersForPicker(team, 'ADA', null)).toEqual([ada]);
  });

  it('handles an empty team without throwing', () => {
    expect(filterMembersForPicker([], 'anything', null)).toEqual([]);
  });

  it('does not mutate the list it is given', () => {
    const original = [...team];
    filterMembersForPicker(team, 'Tobi', null);
    expect(team).toEqual(original);
  });
});
