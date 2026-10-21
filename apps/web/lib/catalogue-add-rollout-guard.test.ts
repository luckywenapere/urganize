import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// F-01: on a phone the swipe shell draws no page bar and no tab row, so the
// only Add rollout button was portalled into a lg-only slot and a phone had
// none. The first view of the Rollouts list carries its own, below lg.
const source = readFileSync(join(__dirname, '..', 'components', 'workspace', 'CatalogueView.tsx'), 'utf8');

describe('Rollouts list on a phone', () => {
  it('draws an Add rollout button in the list itself, hidden from lg', () => {
    const block = source.match(/<div data-mobile-add-rollout className="([^"]*)">\s*\{addButton\}\s*<\/div>/);
    expect(block).not.toBeNull();
    expect(block![1]).toContain('lg:hidden');
  });

  it('keeps the page-bar portal for a computer', () => {
    expect(source).toContain('hidden lg:block">{addButton}');
  });
});
