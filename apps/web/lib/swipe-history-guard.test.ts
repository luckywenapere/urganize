import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('swipe and history wiring', () => {
  it('tabs never push history', () => {
    const src = read('components/shell/swipe/SwipePager.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/history\.pushState/);
    expect(src).toMatch(/history\.replaceState\(null/);
  });
  it('the pager ignores edge starts', () => {
    expect(read('components/shell/swipe/SwipePager.tsx')).toMatch(/isEdgeStart\(touch\.clientX\)/);
  });
  it('closing settings pops the entry it pushed', () => {
    const hook = read('components/settings/useOpenSettings.ts');
    expect(hook).toMatch(/shouldPopSettingsEntry/);
    expect(hook).toMatch(/window\.history\.back\(\)/);
  });
  it('the iOS shell has no back-forward gestures', () => {
    expect(readFileSync(join(__dirname, '../../mobile/App.tsx'), 'utf8')).toMatch(
      /allowsBackForwardNavigationGestures=\{false\}/
    );
  });
});
