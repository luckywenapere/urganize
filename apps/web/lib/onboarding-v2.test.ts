import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_OPT_IN_CHOICES,
  OPT_IN_WINDOW_MS,
  attachOptInChoices,
  parseOptInChoices,
  readOptInChoices,
  saveOptInChoices,
} from './onboarding-optin';
import {
  MAX_PAYWALL_CARDS,
  PAYWALL_HEADLINE,
  PAYWALL_LOGOS_LINE,
  PAYWALL_TESTIMONIALS,
  buildPaywallCards,
  parsePaywallPlanChoice,
  paywallTierForPersona,
  paywallTrialLine,
} from './onboarding-paywall';
import {
  CONFIRM_RELEASE_DATE_TITLE,
  ONBOARDING_CONFIRM_DATE_TASK_ID,
  blankSeedDueDate,
  findPinnedConfirmDateTask,
  isConfirmReleaseDateTask,
} from './pinned-confirm-date';
import { getAuthoredTemplate } from './release-templates/loader';

// URG-251 (Parts 1, 2, 3, 5) + URG-274, 2026-10-14. Pure rules for the new
// onboarding flow, plus a few structural checks on the wiring (this repo has no
// component tests; lib/first-user-flow-guard.test.ts set the pattern).

const APP_ROOT = join(__dirname, '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');
const code = (path: string) =>
  readFileSync(join(APP_ROOT, path), 'utf8')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '');

// A tiny in-memory localStorage behind a fake window, for the storage helpers.
function installFakeWindow() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  vi.stubGlobal('window', { localStorage, sessionStorage: localStorage });
  return store;
}

describe('opt-in choices (URG-251 Part 2)', () => {
  beforeEach(() => {
    installFakeWindow();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults both toggles off', () => {
    expect(DEFAULT_OPT_IN_CHOICES).toEqual({ push: false, email: false });
    expect(readOptInChoices()).toBeNull();
  });

  it('never infers consent from anything but a literal true', () => {
    const now = 1_800_000_000_000;
    expect(parseOptInChoices(JSON.stringify({ push: 'yes', email: 1, at: now }), now)).toEqual({
      push: false,
      email: false,
    });
    expect(parseOptInChoices('not json', now)).toBeNull();
    expect(parseOptInChoices(JSON.stringify({ push: true, email: true }), now)).toBeNull();
  });

  it('survives the Google OAuth round trip (localStorage, read back after the page reloads)', () => {
    const now = 1_800_000_000_000;
    saveOptInChoices({ push: true, email: true }, now);
    // The browser leaves for Google and comes back: only storage is left.
    const raw = (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage.getItem(
      'urganize.onboarding.opt-in'
    );
    expect(parseOptInChoices(raw, now + 60_000)).toEqual({ push: true, email: true });
    expect(readOptInChoices(now + 60_000)).toEqual({ push: true, email: true });
  });

  it('forgets a choice from a sign-up that never happened', () => {
    const now = 1_800_000_000_000;
    saveOptInChoices({ push: true, email: true }, now);
    expect(readOptInChoices(now + OPT_IN_WINDOW_MS + 1)).toBeNull();
  });

  it('attaches after signup: push only when the tap already got permission, email either way', async () => {
    const enablePush = vi.fn(async () => 'enabled');
    const saveEmailConsent = vi.fn(async () => true);

    const granted = await attachOptInChoices(
      { push: true, email: false },
      { getPermission: async () => 'granted', enablePush, saveEmailConsent }
    );
    expect(granted).toEqual({ push: 'enabled', email: 'saved' });
    expect(enablePush).toHaveBeenCalledTimes(1);
    expect(saveEmailConsent).toHaveBeenLastCalledWith(false);

    enablePush.mockClear();
    const notGranted = await attachOptInChoices(
      { push: true, email: true },
      { getPermission: async () => 'default', enablePush, saveEmailConsent }
    );
    // Never opens a permission prompt by itself.
    expect(enablePush).not.toHaveBeenCalled();
    expect(notGranted.push).toBe('not_granted');
    expect(saveEmailConsent).toHaveBeenLastCalledWith(true);
  });

  it('does nothing when the step was never shown', async () => {
    const enablePush = vi.fn();
    const saveEmailConsent = vi.fn(async () => true);
    const result = await attachOptInChoices(null, {
      getPermission: async () => 'granted',
      enablePush,
      saveEmailConsent,
    });
    expect(result).toEqual({ push: 'skipped', email: 'skipped' });
    expect(enablePush).not.toHaveBeenCalled();
    expect(saveEmailConsent).not.toHaveBeenCalled();
  });

  it('the migration adds consent and a timestamp, default off', () => {
    const sql = readFileSync(
      join(REPO_ROOT, 'supabase/migrations/20261014160000_profiles_marketing_email_consent.sql'),
      'utf8'
    );
    expect(sql).toMatch(/marketing_email_consent boolean not null default false/);
    expect(sql).toMatch(/marketing_email_consent_at timestamptz null/);
  });
});

describe('referral code field (URG-251 Part 1)', () => {
  beforeEach(() => {
    installFakeWindow();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_REFERRALS', 'true');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('a typed code is normalised and attached through the same store as a link', async () => {
    const { rememberTypedReferralCode, readReferralCode } = await import('./referral-intent');
    expect(rememberTypedReferralCode('  soundwave-10 ')).toEqual({ kind: 'valid', code: 'SOUNDWAVE-10' });
    expect(readReferralCode()).toBe('SOUNDWAVE-10');
  });

  it('a ?ref= link prefills the field', async () => {
    const { captureReferralFromSearch, readReferralCode } = await import('./referral-intent');
    captureReferralFromSearch('?ref=partner1');
    expect(readReferralCode()).toBe('PARTNER1');
    const page = code('app/onboarding/OnboardingPageClient.tsx');
    expect(page).toContain('const remembered = readReferralCode();');
  });

  it('an invalid code is reported, never stored, and never blocks sign-up', async () => {
    const { rememberTypedReferralCode, readReferralCode, captureReferralFromSearch } = await import(
      './referral-intent'
    );
    captureReferralFromSearch('?ref=GOOD1');
    expect(rememberTypedReferralCode('no spaces allowed!')).toEqual({ kind: 'invalid' });
    // The remembered code is untouched.
    expect(readReferralCode()).toBe('GOOD1');
    const page = code('app/onboarding/OnboardingPageClient.tsx');
    // The account button's gate does not read the referral field at all.
    const gate = page.slice(page.indexOf('const accountBlocker'), page.indexOf('const createAccount'));
    expect(gate).not.toContain('referral');
  });

  it('an emptied field forgets the remembered code', async () => {
    const { rememberTypedReferralCode, readReferralCode, captureReferralFromSearch } = await import(
      './referral-intent'
    );
    captureReferralFromSearch('?ref=GOOD1');
    expect(rememberTypedReferralCode('   ')).toEqual({ kind: 'empty' });
    expect(readReferralCode()).toBeNull();
  });

  it('stores nothing when referrals are switched off', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_REFERRALS', 'false');
    const { rememberTypedReferralCode, readReferralCode } = await import('./referral-intent');
    expect(rememberTypedReferralCode('PARTNER1').kind).toBe('valid');
    expect(readReferralCode()).toBeNull();
  });
});

describe('paywall (URG-251 Part 3)', () => {
  it('uses the headline Oyin picked, and the landing page wording for the logos', () => {
    expect(PAYWALL_HEADLINE).toBe('Run your music like a pro.');
    expect(PAYWALL_LOGOS_LINE).toBe('Shaped with managers from');
    const ui = code('lib/onboarding-paywall.ts');
    expect(ui).not.toMatch(/trusted by/i);
    expect(ui).not.toMatch(/save 55/i);
  });

  it('pre-selects the plan from the persona', () => {
    expect(paywallTierForPersona('independent_artist')).toBe('solo');
    expect(paywallTierForPersona('music_manager')).toBe('manager');
    expect(paywallTierForPersona('artist_team')).toBe('manager');
    expect(paywallTierForPersona('other')).toBe('manager');
    // Label is contact-us since 2026-10-26, so a label lands on Manager.
    expect(paywallTierForPersona('label_ar')).toBe('manager');
    expect(paywallTierForPersona(null)).toBe('manager');
  });

  it('leads with their "where does it fall apart" answer, then the rest, at most five', () => {
    const cards = buildPaywallCards({ whereStuck: ['distribution', 'collecting_credits'], startFromScratch: false });
    expect(cards.map((card) => card.id)).toEqual([
      'distribution',
      'collecting_credits',
      'keeping_team_aligned',
      'tracking_progress',
      'managing_multiple_releases',
    ]);
    expect(cards).toHaveLength(MAX_PAYWALL_CARDS);
  });

  it('for a scratch user, leads with team alignment and leaves out the week-by-week card', () => {
    const cards = buildPaywallCards({ whereStuck: ['tracking_progress', 'marketing_promo'], startFromScratch: true });
    expect(cards[0].id).toBe('keeping_team_aligned');
    expect(cards[1].id).toBe('marketing_promo');
    expect(cards.map((card) => card.id)).not.toContain('tracking_progress');
    expect(cards.length).toBeLessThanOrEqual(MAX_PAYWALL_CARDS);
  });

  it('maps each card to the testimonial in URG-251', () => {
    const byId = Object.fromEntries(
      buildPaywallCards({ whereStuck: [], startFromScratch: false }).map((card) => [card.id, card])
    );
    expect(byId.keeping_team_aligned.testimonial?.name).toBe('Tamuno-Tekena Ayafa');
    expect(byId.tracking_progress.testimonial?.name).toBe('Antoine');
    expect(byId.managing_multiple_releases.testimonial?.name).toBe('Adenaiye Miracle');
    expect(byId.collecting_credits.testimonial?.name).toBe('@zaddyfunds_');
  });

  it('quotes every testimonial verbatim from the signed-off source', () => {
    const source = readFileSync(join(REPO_ROOT, 'apps/homepage/content/testimonials.ts'), 'utf8').replace(
      /\s+/g,
      ' '
    );
    for (const testimonial of Object.values(PAYWALL_TESTIMONIALS)) {
      expect(source).toContain(testimonial.quote);
      expect(source).toContain(testimonial.name);
    }
  });

  it('states the real trial length, and takes prices from @urganize/pricing', () => {
    expect(paywallTrialLine(3)).toBe('Start your 3-day free trial, cancel anytime.');
    // The paywall screen moved to the trial sheet after the first music (#854):
    // no price typed in, and none at all in the iPhone app.
    const ui = code('components/onboarding/OnboardingTrialSheet.tsx');
    expect(ui).not.toMatch(/₦\s?\d/);
    expect(ui).toContain('isIOSApp()');
  });

  it('remembers the plan they picked for the billing wall', () => {
    const now = 1_800_000_000_000;
    expect(parsePaywallPlanChoice(JSON.stringify({ tier: 'manager', interval: 'annual', at: now }), now)).toEqual({
      tier: 'manager',
      interval: 'annual',
    });
    // Label is no longer offered there, so an old saved choice is dropped.
    expect(parsePaywallPlanChoice(JSON.stringify({ tier: 'label', interval: 'annual', at: now }), now)).toBeNull();
    expect(parsePaywallPlanChoice(JSON.stringify({ tier: 'enterprise', interval: 'annual', at: now }), now)).toBeNull();
    expect(parsePaywallPlanChoice('nope', now)).toBeNull();
  });
});

describe('"Confirm your release date" pinned on top', () => {
  it('exists in every playbook at the agreed place', () => {
    const single = getAuthoredTemplate('single')!;
    const ep = getAuthoredTemplate('ep')!;
    const album = getAuthoredTemplate('album')!;
    expect(isConfirmReleaseDateTask({ title: single.tasks[1].title, templateTaskId: single.tasks[1].id })).toBe(true);
    expect(isConfirmReleaseDateTask({ title: ep.tasks[3].title, templateTaskId: ep.tasks[3].id })).toBe(true);
    expect(isConfirmReleaseDateTask({ title: album.tasks[4].title, templateTaskId: album.tasks[4].id })).toBe(true);
  });

  it('matches by playbook id, never the later "locked at the distributor" check', () => {
    for (const template of [getAuthoredTemplate('single')!, getAuthoredTemplate('ep')!, getAuthoredTemplate('album')!]) {
      const matches = template.tasks.filter((task) =>
        isConfirmReleaseDateTask({ title: task.title, templateTaskId: task.id })
      );
      expect(matches).toHaveLength(1);
    }
    expect(isConfirmReleaseDateTask({ title: 'Confirm release date locked at distributor', templateTaskId: null })).toBe(
      false
    );
    expect(isConfirmReleaseDateTask({ title: 'Confirm your release date', templateTaskId: null })).toBe(true);
  });

  it('pins for a new user until the task is done', () => {
    const tasks = [
      { id: 'a', title: 'Lock the master file', status: 'todo', templateTaskId: 'w8_lock_master' },
      { id: 'b', title: 'Confirm release date and lock it', status: 'todo', templateTaskId: 'w8_confirm_release_date' },
    ];
    expect(findPinnedConfirmDateTask({ tasks, isNewUserRollout: true })?.id).toBe('b');
    expect(findPinnedConfirmDateTask({ tasks, isNewUserRollout: false })).toBeNull();
    expect(
      findPinnedConfirmDateTask({ tasks: tasks.map((t) => ({ ...t, status: 'done' })), isNewUserRollout: true })
    ).toBeNull();
  });

  it('seeds a start-from-scratch onboarding rollout with exactly that one task', () => {
    expect(CONFIRM_RELEASE_DATE_TITLE).toBe('Confirm your release date');
    const route = code('app/api/releases/route.ts');
    expect(route).toContain("releasePlan === 'blank' && releaseSource === 'onboarding'");
    expect(route.match(/title: CONFIRM_RELEASE_DATE_TITLE/g)).toHaveLength(1);
    expect(route).toContain('task_id: ONBOARDING_CONFIRM_DATE_TASK_ID');
    expect(isConfirmReleaseDateTask({ title: 'x', templateTaskId: ONBOARDING_CONFIRM_DATE_TASK_ID })).toBe(true);
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(blankSeedDueDate({ now, releaseDate: '2026-12-01' })).toBe('2026-10-15T12:00:00.000Z');
    expect(blankSeedDueDate({ now, releaseDate: '2026-10-14' })).toBe('2026-10-14T00:00:00.000Z');
  });

  it('the planner shows it above the plan, on the timeline', () => {
    const view = code('components/workspace/WorkspaceView.tsx');
    expect(view).toContain('findPinnedConfirmDateTask(');
    expect(view).toContain('activitiesBanner={activitiesBannerNode}');
    expect(view).toContain('panelActivitiesBanner={activitiesBannerNode}');
  });
});
