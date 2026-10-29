import { describe, expect, it } from 'vitest';
import { SETTINGS_SEGMENTS, type SettingsSegment } from './settings-nav';
import { SETTINGS_SEARCH_ENTRIES, SETTINGS_SEARCH_LIMIT, searchSettings } from './settings-search';

const ALL: readonly SettingsSegment[] = SETTINGS_SEGMENTS;

describe('searchSettings', () => {
  it('returns nothing for an empty or blank query, so the nav shows its normal list', () => {
    expect(searchSettings('', ALL)).toEqual([]);
    expect(searchSettings('   ', ALL)).toEqual([]);
  });

  it('finds a section by the word a person would type, not the word we use', () => {
    expect(searchSettings('password', ALL)[0]).toMatchObject({ segment: 'security', section: 'password' });
    expect(searchSettings('invoice', ALL)[0]).toMatchObject({ segment: 'billing' });
    expect(searchSettings('invite', ALL)[0]).toMatchObject({ segment: 'team', section: 'teammates' });
    expect(searchSettings('theme', ALL)[0]).toMatchObject({ segment: 'general' });
    // Connections was retired (#860): its apps entry is gone, and the export
    // lives in Security & account.
    expect(searchSettings('claude', ALL)).toEqual([]);
    expect(searchSettings('csv', ALL)[0]).toMatchObject({ segment: 'security', section: 'export' });
    // Press kits left Settings Oct 17, 2026; the bio lives in Pitch this!.
    expect(searchSettings('epk', ALL).some((hit) => hit.section === 'press-kits')).toBe(false);
  });

  it('finds a whole segment by its own name', () => {
    expect(searchSettings('billing', ALL)[0]).toMatchObject({ segment: 'billing', section: null });
    expect(searchSettings('notifications', ALL)[0]).toMatchObject({ segment: 'notifications' });
  });

  it('puts a label that starts with the query ahead of one that only mentions it', () => {
    const results = searchSettings('team', ALL);
    expect(results[0].label.toLowerCase().startsWith('team')).toBe(true);
  });

  it('matches every term in any order', () => {
    expect(searchSettings('colors brand', ALL)[0]).toMatchObject({ section: 'brand-colors' });
  });

  it('is case-insensitive', () => {
    expect(searchSettings('PASSWORD', ALL)[0]).toMatchObject({ section: 'password' });
  });

  it('never returns a result from a segment this person cannot see', () => {
    const viewer: SettingsSegment[] = ['general', 'notifications', 'security'];
    expect(searchSettings('invoice', viewer)).toEqual([]);
    expect(searchSettings('invite', viewer)).toEqual([]);
    for (const result of searchSettings('delete', viewer)) {
      expect(viewer).toContain(result.segment);
    }
  });

  it('finds both delete actions for "delete"', () => {
    const labels = searchSettings('delete', ALL).map((result) => result.section);
    expect(labels).toEqual(expect.arrayContaining(['delete-rollouts', 'delete-account']));
  });

  it('carries the segment name so the row can say where it lives', () => {
    expect(searchSettings('password', ALL)[0].segmentLabel).toBe('Security & account');
  });

  it('caps the list', () => {
    expect(searchSettings('a', ALL).length).toBeLessThanOrEqual(SETTINGS_SEARCH_LIMIT);
  });

  it('returns nothing for a query nothing matches', () => {
    expect(searchSettings('zzzqqq', ALL)).toEqual([]);
  });
});

describe('the search index', () => {
  it('has a whole-segment entry for every segment, so each one is findable by name', () => {
    for (const segment of SETTINGS_SEGMENTS) {
      // Retired (#860): nothing in the index should lead to it.
      if (segment === 'connections') continue;
      expect(SETTINGS_SEARCH_ENTRIES.some((entry) => entry.segment === segment && !entry.section)).toBe(true);
    }
  });

  it('never points at a segment that does not exist', () => {
    for (const entry of SETTINGS_SEARCH_ENTRIES) {
      expect(SETTINGS_SEGMENTS).toContain(entry.segment);
    }
  });

  it('gives every section entry a unique id within its segment', () => {
    const seen = new Set<string>();
    for (const entry of SETTINGS_SEARCH_ENTRIES) {
      if (!entry.section) continue;
      const key = `${entry.segment}/${entry.section}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
