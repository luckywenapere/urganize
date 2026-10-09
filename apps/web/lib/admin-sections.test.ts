import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, ADMIN_SECTION_GROUPS, sectionsInGroup } from './admin-sections';

// The hub's grouped links must list every section in the side menu exactly
// once (the Overview is the page they sit on). Read from the menu's source so
// a section added to AdminNav.tsx and forgotten here fails this test.
const navSource = readFileSync(path.join(__dirname, '..', 'components', 'admin', 'AdminNav.tsx'), 'utf8');
const menuItems = [...navSource.matchAll(/key: '([^']+)'[^}]*?href: '([^']+)'/g)].map((match) => ({
  key: match[1],
  href: match[2],
}));

describe('admin hub sections', () => {
  it('reads the side menu (sanity check on the pattern)', () => {
    expect(menuItems.length).toBeGreaterThanOrEqual(10);
    expect(menuItems[0]).toEqual({ key: 'overview', href: '/admin' });
  });

  it('lists every side-menu section except the Overview, once, with the same key and href', () => {
    const expected = menuItems.filter((item) => item.href !== '/admin');
    const listed = ADMIN_SECTIONS.map((section) => ({ key: section.key, href: section.href }));
    expect([...listed].sort((a, b) => a.key.localeCompare(b.key))).toEqual(
      [...expected].sort((a, b) => a.key.localeCompare(b.key))
    );
    expect(new Set(ADMIN_SECTIONS.map((section) => section.href)).size).toBe(ADMIN_SECTIONS.length);
  });

  it('puts every section in exactly one of Numbers, Operations, Content, none empty', () => {
    expect(ADMIN_SECTION_GROUPS.map((group) => group.label)).toEqual(['Numbers', 'Operations', 'Content']);
    const total = ADMIN_SECTION_GROUPS.reduce((sum, group) => sum + sectionsInGroup(group.key).length, 0);
    expect(total).toBe(ADMIN_SECTIONS.length);
    for (const group of ADMIN_SECTION_GROUPS) expect(sectionsInGroup(group.key).length).toBeGreaterThan(0);
  });

  it('keeps the Scoreboard first, and every card line short', () => {
    expect(ADMIN_SECTIONS[0].key).toBe('scoreboard');
    for (const section of ADMIN_SECTIONS) {
      expect(section.description.length).toBeLessThanOrEqual(60);
      expect(section.description).not.toMatch(/—/);
    }
  });
});
