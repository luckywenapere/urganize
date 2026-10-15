import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_CHIPS,
  activeChip,
  chipFilters,
  isVouched,
  leadRoleLabel,
  risingShelf,
  rowMeta,
  shelfName,
} from './directory-chips';

describe('directory chips (URG-304)', () => {
  it('are exactly All, Managers, A&R, PR in that order', () => {
    expect(DIRECTORY_CHIPS.map((chip) => chip.label)).toEqual(['All', 'Managers', 'A&R', 'PR']);
  });

  it('Managers filters by profile type, A&R and PR by role, All clears both', () => {
    expect(chipFilters('managers')).toEqual({ role: null, profileType: 'manager' });
    expect(chipFilters('a_and_r')).toEqual({ role: 'a_and_r', profileType: null });
    expect(chipFilters('pr')).toEqual({ role: 'pr', profileType: null });
    expect(chipFilters('all')).toEqual({ role: null, profileType: null });
  });

  it('reads each chip back from its own filters, and none for a role it does not name', () => {
    for (const chip of DIRECTORY_CHIPS) expect(activeChip(chipFilters(chip.key))).toBe(chip.key);
    expect(activeChip({ role: 'producer', profileType: null })).toBeNull();
  });
});

describe('directory rows', () => {
  const delivered = { role: 'graphic_designer' as const, delivered: 2 };
  const claimed = { role: 'pr' as const, delivered: 0 };

  it('lead with delivered work, then their own word, then the profile type', () => {
    expect(leadRoleLabel({ roles: [claimed, delivered], profileType: 'creative' })).toBe('Graphic designer');
    expect(leadRoleLabel({ roles: [claimed], profileType: null })).toBe('PR');
    expect(leadRoleLabel({ roles: [], profileType: 'manager' })).toBe('Manager');
    expect(leadRoleLabel({ roles: [], profileType: null })).toBe('');
  });

  it('read "role · city", or either half alone', () => {
    expect(rowMeta({ roles: [], profileType: 'manager', city: 'Lagos' })).toBe('Manager · Lagos');
    expect(rowMeta({ roles: [], profileType: 'manager', city: null })).toBe('Manager');
    expect(rowMeta({ roles: [], profileType: null, city: ' Abuja ' })).toBe('Abuja');
  });

  it('tick only for delivered work', () => {
    expect(isVouched({ roles: [delivered] })).toBe(true);
    expect(isVouched({ roles: [claimed] })).toBe(false);
  });

  it('shortens a tile name to first name and initial', () => {
    expect(shelfName('Tobi Adeyemi')).toBe('Tobi A.');
    expect(shelfName('Ifeoma  Kalu  Obi')).toBe('Ifeoma O.');
    expect(shelfName('Wizkid')).toBe('Wizkid');
    expect(shelfName('  ')).toBe('');
  });

  it('builds one Rising shelf, featured first, each person once', () => {
    const shelf = risingShelf([{ userId: 'a' }, { userId: 'b' }], [{ userId: 'b' }, { userId: 'c' }, { userId: '' }]);
    expect(shelf.map((person) => person.userId)).toEqual(['a', 'b', 'c']);
  });
});
