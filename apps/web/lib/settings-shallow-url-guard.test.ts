import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Settings taps on a phone (2026-10-18, founder report: "Setting buttons are not
// working on mobile, multiple clicks"). The pop-up is opened, re-pointed and
// closed by its `?settings=` param. Writing that param with router.push /
// router.replace made Next fetch the route's server payload for every new value
// before the URL (and so the pop-up) changed, so on phone data each tap (the
// More sheet's Settings row, a segment row, Back to all settings, the X) waited
// a round trip and looked dead, and the link watchdog swallowed the re-taps on
// the Settings row as duplicates. The param is written with the native History
// API instead, which Next syncs into useSearchParams locally.

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('settings pop-up writes its URL without a navigation', () => {
  const hook = stripComments(read('components/settings/useOpenSettings.ts'));
  const modal = stripComments(read('components/settings/SettingsModal.tsx'));

  it('opens, re-points and closes through the History API', () => {
    expect(hook).toMatch(/window\.history\.pushState\(null,/);
    expect(hook).toMatch(/window\.history\.replaceState\(null,/);
    expect(hook).toMatch(/writeSettingsUrl\(url, wasOpen \? 'replace' : 'push'\)/);
    expect(hook).toMatch(/writeSettingsUrl\(closeSettingsUrl\(/);
  });

  it('never routes for a param change on a page that hosts the pop-up', () => {
    expect(hook).not.toMatch(/router\.replace\(/);
    // The one router.push left is the fallback to the dashboard, behind the
    // canHostSettings check.
    const pushes = hook.match(/router\.push\(/g) ?? [];
    expect(pushes).toHaveLength(1);
    expect(hook).toMatch(/if \(!canHostSettings\(pathname\)\) \{\s*router\.push\(url/);
    expect(modal).not.toMatch(/router\.replace\(closeSettingsUrl/);
  });

  it('passes a null state, so Next syncs useSearchParams', () => {
    // A state carrying Next's __NA marker is written straight through with no
    // sync: the address would change and the pop-up would not.
    expect(hook).not.toMatch(/(pushState|replaceState)\(window\.history\.state/);
  });

  it('keeps the link watchdog from swallowing or hard-loading Settings link taps', () => {
    expect(hook).toMatch(/markNavigationBlocked\(event\.nativeEvent\)/);
  });
});
