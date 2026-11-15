import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A capture-phase handler that refuses an in-app link must tell the stall
// watchdog, or the watchdog loads the refused page itself 7s later
// (2026-10-14: locked links for new users "refreshed" onto the locked page).
describe('links refused on purpose are marked for the stall watchdog', () => {
  // (The first-rollout lock's case lived here until 2026-10-24, when the
  // lock and its link catching were removed; see lib/rollout-offer.ts.)

  // 2026-10-26: the Home and UrgAns pills are plain links between two views
  // (Home, and the sessions layout at /dashboard/urgans). Since #1254 one click
  // IS refused on purpose: pressing Home while Customise Home is open saves the
  // layout instead of following the link. That refusal must be marked.
  it('the top bar refuses a click only when it also marks it for the watchdog', () => {
    const src = readFileSync(join(__dirname, '../components/shell/TopNav.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const refusals = src.match(/preventDefault\(\)/g) ?? [];
    const marks = src.match(/markNavigationBlocked\(event\.nativeEvent\)/g) ?? [];
    expect(refusals.length).toBe(1);
    expect(marks.length).toBe(refusals.length);
    expect(src).toMatch(/event\.preventDefault\(\);\s*markNavigationBlocked\(event\.nativeEvent\);/);
  });

  it('the watchdog waits for the click to finish dispatching before it watches', () => {
    const src = readFileSync(join(__dirname, 'nav-stall-watch.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(src).toMatch(/if \(blockedClicks\.has\(event\)\) return;/);
  });
});
