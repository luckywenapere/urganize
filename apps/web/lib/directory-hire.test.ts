import { describe, expect, it } from 'vitest';
import { DIRECTORY_ROLES } from './directory-roles';
import { applyDirectoryFilters, type DirectoryEntry } from './directory-search';
import {
  HIRE_CHIPS,
  activeHireChip,
  deliveredLine,
  demandRole,
  hireChipFilters,
  neededLabel,
  rolloutNeeds,
} from './directory-hire';

function person(over: Partial<DirectoryEntry> & { userId: string }): DirectoryEntry {
  return {
    displayName: over.userId,
    city: null,
    availability: 'open',
    roles: [],
    profileType: null,
    ...over,
  };
}

describe('hire chips (#1221)', () => {
  it('are the roles people hire, in the approved order', () => {
    expect(HIRE_CHIPS.map((chip) => chip.label)).toEqual([
      'Everyone',
      'Designers',
      'Engineers',
      'Producers',
      'Videographers',
      'PR',
      'Marketers',
      'Managers',
      'A&R',
    ]);
  });

  it('only name roles that exist', () => {
    for (const chip of HIRE_CHIPS) {
      for (const role of chip.roles) expect(DIRECTORY_ROLES).toContain(role);
    }
  });

  it('a one-role chip sets role, a many-role chip sets roles, Managers sets the type', () => {
    expect(hireChipFilters('designers')).toEqual({ role: 'graphic_designer', roles: null, profileType: null });
    expect(hireChipFilters('engineers')).toEqual({
      role: null,
      roles: ['mix_engineer', 'master_engineer'],
      profileType: null,
    });
    expect(hireChipFilters('managers')).toEqual({ role: null, roles: null, profileType: 'manager' });
    expect(hireChipFilters('everyone')).toEqual({ role: null, roles: null, profileType: null });
  });

  it('reads every chip back from its own filters', () => {
    for (const chip of HIRE_CHIPS) expect(activeHireChip(hireChipFilters(chip.key))).toBe(chip.key);
  });

  it('a link that brings in a role a chip covers lights that chip, one no chip covers lights none', () => {
    expect(activeHireChip({ role: 'graphic_designer', roles: null, profileType: null })).toBe('designers');
    expect(activeHireChip({ role: 'master_engineer', roles: null, profileType: null })).toBeNull();
    expect(activeHireChip({ role: 'songwriter', roles: null, profileType: null })).toBeNull();
  });

  it('reports demand only for a single role', () => {
    expect(demandRole(hireChipFilters('designers'))).toBe('graphic_designer');
    expect(demandRole(hireChipFilters('engineers'))).toBeNull();
    expect(demandRole(hireChipFilters('everyone'))).toBeNull();
  });
});

describe('filtering by a set of roles', () => {
  const people = [
    person({ userId: 'mix', roles: [{ role: 'mix_engineer', delivered: 0 }] }),
    person({ userId: 'master', roles: [{ role: 'master_engineer', delivered: 3 }] }),
    person({ userId: 'designer', roles: [{ role: 'graphic_designer', delivered: 1 }] }),
  ];
  const base = { query: '', role: null, city: null, availability: null };

  it('keeps anyone holding any of the roles', () => {
    const ids = applyDirectoryFilters(people, { ...base, roles: ['mix_engineer', 'master_engineer'] }).map(
      (entry) => entry.userId
    );
    expect(ids).toEqual(['mix', 'master']);
  });

  it('an empty or missing set filters nothing', () => {
    expect(applyDirectoryFilters(people, { ...base, roles: [] })).toHaveLength(3);
    expect(applyDirectoryFilters(people, { ...base, roles: null })).toHaveLength(3);
    expect(applyDirectoryFilters(people, base)).toHaveLength(3);
  });
});

describe('what a row says they delivered', () => {
  it('names the work of the role with the most rollouts', () => {
    expect(
      deliveredLine([
        { role: 'pr', delivered: 1 },
        { role: 'graphic_designer', delivered: 2 },
      ])
    ).toBe('Cover art on 2 rollouts');
  });

  it('says one rollout in the singular', () => {
    expect(deliveredLine([{ role: 'pr', delivered: 1 }])).toBe('Press on 1 rollout');
    expect(deliveredLine([{ role: 'master_engineer', delivered: 3 }])).toBe('Masters on 3 rollouts');
  });

  it('is New here when nothing was delivered, whatever they claim', () => {
    expect(deliveredLine([{ role: 'producer', delivered: 0 }])).toBe('New here');
    expect(deliveredLine([])).toBe('New here');
  });
});

describe('what your rollouts need', () => {
  const owner = 'me';
  const releases = [
    { id: 'r1', title: 'Ohema', ownerUserId: owner },
    { id: 'r2', title: 'Midnight EP', ownerUserId: owner },
    { id: 'r3', title: 'Not mine', ownerUserId: 'someone-else' },
  ];
  const task = (over: Record<string, unknown>) => ({
    id: String(over.id),
    releaseId: 'r1',
    templateTaskId: null,
    assignedToUserId: owner,
    status: 'todo',
    dueDate: null,
    title: 'Step',
    ...over,
  });

  it('lists the open jobs on your own rollouts, soonest first', () => {
    const needs = rolloutNeeds(
      releases,
      [
        task({ id: 't1', releaseId: 'r2', templateTaskId: 'w8_lock_master', dueDate: '2026-12-02', title: 'Lock master' }),
        task({ id: 't2', releaseId: 'r1', templateTaskId: 'w7_brief_designer', dueDate: '2026-11-14', title: 'Brief designer' }),
        task({ id: 't3', releaseId: 'r3', templateTaskId: 'w7_brief_designer', dueDate: '2026-11-01' }),
      ],
      owner
    );
    expect(needs.map((need) => [need.releaseTitle, need.role])).toEqual([
      ['Ohema', 'graphic_designer'],
      ['Midnight EP', 'master_engineer'],
    ]);
    expect(needs[0]).toMatchObject({ releaseId: 'r1', taskId: 't2', dueDate: '2026-11-14' });
  });

  it('skips work that is done or already on somebody else', () => {
    const needs = rolloutNeeds(
      releases,
      [
        task({ id: 't1', templateTaskId: 'w7_brief_designer', status: 'done' }),
        task({ id: 't2', releaseId: 'r2', templateTaskId: 'w8_lock_master', assignedToUserId: 'engineer' }),
      ],
      owner
    );
    expect(needs).toEqual([]);
  });

  it('says the job in plain words', () => {
    expect(neededLabel('graphic_designer')).toBe('A graphic designer');
    expect(neededLabel('a_and_r')).toBe('An A&R');
    expect(neededLabel('pr')).toBe('Someone for PR');
  });
});
