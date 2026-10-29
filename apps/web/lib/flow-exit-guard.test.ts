import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) =>
  readFileSync(join(__dirname, '..', p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// One-way flows must not leave a finished step in history: the exit REPLACES
// the page, so Back from where the person lands never returns to it.
const EXITS: Array<[string, RegExp[]]> = [
  ['app/auth/AuthPageClient.tsx', [/router\.replace\(nextPath\)/]],
  ['app/payment/callback/page.tsx', [/router\.replace\(HOME_PATH\)/, /router\.replace\(settingsDeepLink/]],
  ['app/welcome/[token]/WelcomeClaimClient.tsx', [/router\.replace\('\/dashboard\?settings=directory'\)/]],
  ['components/people/ClaimWizard.tsx', [/router\.replace\('\/dashboard'\)/]],
  // Lands on HOME_PATH, or on the rollout a chime-in link names (2026-10-26).
  ['app/invite/accept/InviteAcceptPageClient.tsx', [/router\.replace\(afterJoinPath\)/, /safeInviteNextPath\(nextPath\) \?\? HOME_PATH/]],
  ['app/redeem/RedeemPageClient.tsx', [/router\.replace\(HOME_PATH\)/]],
  ['app/start-trial/StartTrialPageClient.tsx', [/router\.replace\(HOME_PATH\)/]],
];

describe('one-way flow exits replace the page', () => {
  for (const [file, patterns] of EXITS) {
    it(file, () => {
      const src = read(file);
      for (const pattern of patterns) expect(src).toMatch(pattern);
    });
  }
  it('login never pushes the next page behind /auth', () => {
    expect(read('app/auth/AuthPageClient.tsx')).not.toMatch(/router\.push\(nextPath\)/);
  });
  it('the payment return never pushes Home or Billing behind the callback', () => {
    const src = read('app/payment/callback/page.tsx');
    expect(src).not.toMatch(/router\.push\(HOME_PATH\)/);
    expect(src).not.toMatch(/router\.push\(settingsDeepLink/);
  });
  it('onboarding maps device Back to the team screen and never walks back into account creation (#854)', () => {
    const src = read('app/onboarding/OnboardingPageClient.tsx');
    expect(src).toMatch(/addEventListener\('popstate'/);
    expect(src).toMatch(/setScreen\('setup'\)/);
    expect(src).toMatch(/window\.history\.pushState\(\{ urganizeOnboarding/);
  });
});
