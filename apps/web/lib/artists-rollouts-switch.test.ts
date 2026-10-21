import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARTISTS_ROLLOUTS_SEGMENTS } from './artists-rollouts-switch';

const read = (p: string) => readFileSync(p, 'utf8');

describe('Artists / Rollouts switch', () => {
  it('links the two lists and nothing else', () => {
    expect(ARTISTS_ROLLOUTS_SEGMENTS.map((s) => [s.key, s.href])).toEqual([
      ['artists', '/dashboard/artists'],
      ['rollouts', '/dashboard'],
    ]);
  });

  it('is on both lists, titled Rollouts, and shown on the Rollouts page only in the swipe shell', () => {
    const workspace = read('components/workspace/WorkspaceView.tsx');
    expect(workspace).toContain('<h1 className="sr-only">Rollouts</h1>');
    expect(workspace).not.toContain('Your rollouts</h1>');
    expect(workspace).toContain('<ArtistsRolloutsSwitch current="rollouts" swipeOnly />');
    expect(read('app/dashboard/artists/ArtistsPageClient.tsx')).toContain('<ArtistsRolloutsSwitch current="artists" />');
    const css = read('app/globals.css');
    expect(css).toMatch(/\.swipe-switch\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/:root\[data-swipe-nav\] \.swipe-switch\s*\{\s*display:\s*flex;/);
  });

  it('uses 44px targets and tokens only, with a current marker', () => {
    const src = read('components/shell/swipe/ArtistsRolloutsSwitch.tsx');
    expect(src).toContain('h-11');
    expect(src).toContain("aria-current={active ? 'page' : undefined}");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(/);
  });
});
