import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guards for the profile growth loop (2026-10-11). They read the
// real sources, so a later change that breaks one of these rules fails here
// rather than in production.

const ROOT = join(__dirname, '..');

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}
const raw = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const read = (path: string) => strip(raw(path));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe('the call to action on /p/{slug}', () => {
  it('is server-rendered: the footer is not a client component and uses plain links', () => {
    const footer = raw('components/people/ProfileGrowthFooter.tsx');
    expect(footer).not.toMatch(/^['"]use client['"]/m);
    expect(read('components/people/ProfileGrowthFooter.tsx')).toMatch(/<a\s[\s\S]*?href=\{row\.href\}/);
    expect(read('components/people/ProfileGrowthFooter.tsx')).not.toMatch(/onClick|useEffect|useState/);
    expect(read('components/people/ProfileGrowthFooter.tsx')).toContain("profileCtaHref(slug, 'collaborator')");
    expect(read('components/people/ProfileGrowthFooter.tsx')).toContain("profileCtaHref(slug, 'manager')");
  });

  it('sits on both the claimed and the unclaimed page, and the old plain line is gone', () => {
    const page = read('app/p/[slug]/page.tsx');
    expect(page).toContain('<ProfileGrowthFooter');
    expect(page).not.toContain('Delivered with Urganize');
    expect(read('components/people/UnclaimedProfileView.tsx')).toContain('<ProfileGrowthFooter');
  });

  it('the counting route needs no session and redirects to sign-up whatever it gets', () => {
    const route = read('app/api/public-profile/cta/route.ts');
    expect(route).not.toMatch(/getAuthenticatedUser|requireActive|authorization|cookies\(/i);
    expect(route).toContain('isLikelyBot(');
    expect(route).toContain('isPrefetchRequest(');
    expect(route).toContain('profileSignupPath(');
    expect(route.match(/NextResponse\.redirect\(/g)?.length).toBe(1);
    expect(route).not.toMatch(/NextResponse\.json\(/);
  });
});

describe('analytics stay honest', () => {
  it('pages a chat app previews count opens in the browser, not on the server', () => {
    for (const file of ['app/claim/[token]/page.tsx', 'app/credits/[token]/page.tsx']) {
      const source = read(file);
      expect(source, file).not.toMatch(/captureProfileGrowthEvent|recordProfileGrowthRow|captureServerAnalyticsEvent/);
    }
    expect(read('app/credits/[token]/page.tsx')).toContain('<CreditLinkBeacon');
    expect(read('components/credits/CreditLinkBeacon.tsx')).toContain("'credit_link_opened'");
    expect(read('components/people/ClaimWizard.tsx')).toContain("'claim_page_viewed'");
  });

  it('the server-side profile view skips previews and prefetches', () => {
    const page = read('app/p/[slug]/page.tsx');
    expect(page).toContain('isLikelyBot(');
    expect(page).toContain('isPrefetchRequest(');
    expect(read('lib/profile-growth-server.ts')).toMatch(/if \(input\.isBotOrPrefetch\) return;/);
  });

  it('every server capture in the loop goes through afterResponse and never blocks the reply', () => {
    const server = read('lib/profile-growth-server.ts');
    expect(server).toContain("from './after-response'");
    for (const fn of ['captureProfileGrowthEvent', 'recordProfileGrowthRow', 'recordProfileCtaTap']) {
      const body = server.slice(server.indexOf(`export function ${fn}`));
      expect(body.slice(0, 400), fn).toContain('afterResponse(');
    }
  });

  it('the server events are fired from the routes that know the fact', () => {
    expect(read('app/api/claim/[token]/route.ts')).toContain("'claim_completed'");
    expect(read('app/api/claim-profile/route.ts')).toContain("'profile_published'");
    expect(read('app/api/claim-profile/route.ts')).toContain('isPublishTransition(');
    expect(read('app/api/credits/[token]/route.ts').match(/reportSubmitted\(/g)?.length).toBe(3);
    expect(read('app/api/signup-source/route.ts')).toContain("'signup_from_profile'");
  });

  it('only the loop server writes profile_growth_events', () => {
    const writers = walk(join(ROOT, 'lib'))
      .concat(walk(join(ROOT, 'app', 'api')))
      .filter((file) => /PROFILE_GROWTH_EVENTS_TABLE\)\s*\.(insert|update|upsert|delete)\(|from\(['"]profile_growth_events['"]\)\s*\.(insert|update|upsert|delete)\(/.test(strip(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect(writers).toEqual(['lib/profile-growth-server.ts']);
  }, 60_000);

  it('the admin funnel route only reads', () => {
    const route = read('app/api/admin/profile-funnel/route.ts');
    expect(route).toContain('verifyAdmin(');
    expect(route).toContain('internalAccountEmails()');
    expect(route).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});

describe('sign-up attribution', () => {
  it('is an open route, like every other first-minute call', () => {
    const route = read('app/api/signup-source/route.ts');
    expect(route).toContain('getAuthenticatedUser');
    expect(route).not.toContain('requireActiveAuthenticatedUser');
    expect(route).toContain('isNewAccount(');
  });

  it('onboarding remembers it on arrival and reports it at the end', () => {
    const onboarding = read('app/onboarding/OnboardingPageClient.tsx');
    expect(onboarding).toContain('captureSignupSourceFromSearch(window.location.search)');
    expect(onboarding).toContain('reportSignupSource(token)');
  });

  it('the claim page marks a claim sign-up', () => {
    expect(read('components/people/ClaimWizard.tsx')).toContain("markSignupSource({ source: 'claim'");
  });

  it('nothing in the loop uses ?ref=, which is a partner referral code', () => {
    for (const file of [
      'lib/profile-growth.ts',
      'components/people/ProfileGrowthFooter.tsx',
      'app/api/public-profile/cta/route.ts',
    ]) {
      expect(read(file), file).not.toMatch(/[?&]ref=/);
    }
  });
});

describe('sharing your own page', () => {
  it('the claim success step offers it', () => {
    const wizard = read('components/people/ClaimWizard.tsx');
    // URG-305: the last step is "You're verified" with Share to Story (the 9:16 card).
    const done = wizard.slice(wizard.indexOf("if (step === 'done')"), wizard.indexOf("if (step === 'yours')"));
    expect(done).toContain('<ShareStoryButton');
    expect(done).toContain('surface="claim_done"');
  });

  it('the public page offers it only to its owner, found by their own session', () => {
    const island = read('components/people/OwnProfileShare.tsx');
    expect(island).toContain("'/api/claim-profile'");
    expect(island).toContain('mine.slug !== slug');
    expect(read('app/p/[slug]/page.tsx')).toContain('<OwnProfileShare');
    expect(read('app/p/[slug]/page.tsx')).not.toMatch(/userId=\{|user_id/);
  });

  it('a share is reported with how and where only', () => {
    expect(read('components/people/ShareProfileLink.tsx')).toContain("'profile_link_shared'");
  });
});
