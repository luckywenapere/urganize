import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { connectionRows } from './connection-rows';

describe('connectionRows', () => {
  it('lists only the rows that are switched on', () => {
    expect(connectionRows({ mcpConnect: false, dataExport: true }).map((r) => r.name)).toEqual(['Your data']);
    expect(connectionRows({ mcpConnect: true, dataExport: true }).map((r) => r.name)).toEqual(['Connected apps', 'Your data']);
    expect(connectionRows({ mcpConnect: false, dataExport: false })).toEqual([]);
  });

  it('the sheet carries no placeholder rows', () => {
    const src = readFileSync('components/shell/swipe/ConnectionsSheet.tsx', 'utf8');
    expect(src).not.toMatch(/Soon|Add link|GlyphGoogle|Instagram|TikTok|Boomplay/);
    expect(src).toContain('connectionRows(');
  });
});
