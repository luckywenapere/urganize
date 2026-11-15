import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Apple (rules 3.1.1 and 3.1.3) will reject an iPhone app that points people
 * at a payment. Every screen that renders a link to the plan wall (/locked)
 * has to ask `usePurchasePromptsAllowed()` first, or be one of the screens that
 * IS the wall and renders a link-free body on iOS by itself.
 *
 * This reads the real source rather than asserting a fixed list, so a NEW
 * screen that links to /locked fails here until it decides what the iPhone
 * app should show.
 */
const ROOT = join(__dirname, '..');

// Screens that ARE the wall or the payment flow: they branch on isIOSApp()
// themselves and render a body with no price and no pointer to pay.
const WALL_SCREENS = new Set([
  'app/locked/LockedPageClient.tsx',
  'app/start-trial/StartTrialPageClient.tsx',
  'app/payment/callback/page.tsx',
  'components/billing/TeamWall.tsx',
  'app/checkout/CheckoutPageClient.tsx',
]);

// Not screens a person reads: redirects and the gate itself. The wall they
// redirect to is the link-free body above on iOS.
const REDIRECTS = new Set([
  'components/providers/HardPaywallGate.tsx',
  'components/app/AppShell.tsx',
  // Redirects to /locked when an account is not approved yet; no link is shown.
  'app/onboarding/OnboardingPageClient.tsx',
  'app/r/[code]/FriendLinkClient.tsx',
]);

// The plan wall (/locked) and, since Oct 2026, the self-serve /checkout page.
const LINKS_TO_WALL = /['"`]\/(?:locked|checkout)(?:[?'"`])/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === 'api') continue;
      walk(full, out);
    } else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('iOS purchase prompts', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))];

  it('every screen that links to the plan wall asks usePurchasePromptsAllowed first', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).split(sep).join('/');
      if (WALL_SCREENS.has(rel) || REDIRECTS.has(rel)) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      if (!LINKS_TO_WALL.test(code)) continue;
      if (!code.includes('usePurchasePromptsAllowed')) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('no screen tells the iPhone app to subscribe on the website', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).split(sep).join('/');
      const code = stripComments(readFileSync(file, 'utf8'));
      if (/openExternalUrl\(\s*['"`]https:\/\/(?:app|team)\.urganize\.app\/(locked|start-trial|checkout)/.test(code)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the wall screens still render a separate body on iOS', () => {
    for (const rel of WALL_SCREENS) {
      if (rel === 'app/payment/callback/page.tsx') continue;
      const code = readFileSync(join(ROOT, rel), 'utf8');
      expect(code, rel).toMatch(/isIOSApp\(\)/);
    }
  });

  it('the hook is true outside the iPhone app', async () => {
    const platform = await import('./platform');
    // No shell in the test environment, so this is the browser case.
    expect(platform.isIOSApp()).toBe(false);
  });
});
