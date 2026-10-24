import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ONBOARDING_STEP,
  ONBOARDING_STEP_TITLES,
  firstStepAfterAccount,
  lastQuestionStep,
  nextOnboardingStep,
  onboardingStepKicker,
  onboardingStepSequence,
  previousOnboardingStep,
  type OnboardingStepOptions,
} from './onboarding-steps';
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
import { buildOnboardingPlanPreview } from './onboarding-plan-preview';
import { isWelcomeSeenValue } from './onboarding-welcome';
import { describeNextBlocker } from './onboarding-next-hint';
import { getAuthoredTemplate } from './release-templates/loader';
import { TEAM_TRIAL_DAYS } from './team-billing';

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

const baseOptions: OnboardingStepOptions = {
  workspaceEnabled: true,
  authedSetup: false,
  startFromScratch: false,
  paywallEnabled: true,
  welcomeEnabled: true,
  previewEnabled: true,
  optInEnabled: true,
};

describe('the step list', () => {
  it('runs persona → questions → first move → preview → opt-in → account → paywall → welcome → team', () => {
    expect(onboardingStepSequence(baseOptions)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ONBOARDING_STEP_TITLES[ONBOARDING_STEP.optIn]).toBe('Stay on top of your next move');
    expect(ONBOARDING_STEP_TITLES[ONBOARDING_STEP.account]).toBe('Create your account');
    expect(ONBOARDING_STEP_TITLES[ONBOARDING_STEP.invite]).toBe('Bring your team in');
  });

  it('shows the plan preview only to people who did not start from scratch', () => {
    const scratch = onboardingStepSequence({ ...baseOptions, startFromScratch: true });
    expect(scratch).not.toContain(ONBOARDING_STEP.preview);
    expect(nextOnboardingStep(scratch, ONBOARDING_STEP.firstMove)).toBe(ONBOARDING_STEP.optIn);
    expect(previousOnboardingStep(scratch, ONBOARDING_STEP.optIn)).toBe(ONBOARDING_STEP.firstMove);
    const template = onboardingStepSequence(baseOptions);
    expect(nextOnboardingStep(template, ONBOARDING_STEP.firstMove)).toBe(ONBOARDING_STEP.preview);
  });

  it('"Nothing planned yet" skips the rollout steps and keeps the rest (2026-10-24)', () => {
    const steps = onboardingStepSequence({ ...baseOptions, nothingPlanned: true });
    expect(steps).toEqual([0, 1, 6, 7, 8, 9, 10]);
    expect(nextOnboardingStep(steps, ONBOARDING_STEP.fallsApart)).toBe(ONBOARDING_STEP.optIn);
    expect(firstStepAfterAccount(steps)).toBe(ONBOARDING_STEP.paywall);
    const authed = onboardingStepSequence({ ...baseOptions, nothingPlanned: true, authedSetup: true, optInEnabled: false });
    expect(lastQuestionStep(authed)).toBe(ONBOARDING_STEP.fallsApart);
  });

  it('puts the opt-in right before the account, and the paywall right after it', () => {
    const steps = onboardingStepSequence(baseOptions);
    expect(nextOnboardingStep(steps, ONBOARDING_STEP.optIn)).toBe(ONBOARDING_STEP.account);
    expect(firstStepAfterAccount(steps)).toBe(ONBOARDING_STEP.paywall);
    expect(nextOnboardingStep(steps, ONBOARDING_STEP.paywall)).toBe(ONBOARDING_STEP.welcome);
    expect(nextOnboardingStep(steps, ONBOARDING_STEP.welcome)).toBe(ONBOARDING_STEP.invite);
  });

  it('skips the account step in authed setup, which finishes on the opt-in', () => {
    const steps = onboardingStepSequence({ ...baseOptions, authedSetup: true, paywallEnabled: false });
    expect(steps).not.toContain(ONBOARDING_STEP.account);
    expect(steps).toContain(ONBOARDING_STEP.optIn);
    expect(lastQuestionStep(steps)).toBe(ONBOARDING_STEP.optIn);
  });

  it('drops the welcome once seen, and finishes when nothing follows the account', () => {
    const steps = onboardingStepSequence({
      ...baseOptions,
      welcomeEnabled: false,
      paywallEnabled: false,
      workspaceEnabled: false,
    });
    expect(firstStepAfterAccount(steps)).toBeNull();
  });

  it('counts "Step N of M" from the list, persona first', () => {
    const scratch = onboardingStepSequence({ ...baseOptions, startFromScratch: true });
    expect(onboardingStepKicker(scratch, 'persona')).toEqual({ number: 1, total: scratch.length + 1 });
    expect(onboardingStepKicker(scratch, ONBOARDING_STEP.optIn).number).toBe(7);
  });

  it('falls back to the old flow with v2 off', () => {
    const old = onboardingStepSequence({
      ...baseOptions,
      paywallEnabled: false,
      welcomeEnabled: false,
      previewEnabled: false,
      optInEnabled: false,
    });
    expect(old).toEqual([0, 1, 2, 3, 4, 7, 10]);
  });
});

describe('skippable invites (URG-274)', () => {
  it('the team step never blocks the button, so Skip always reaches the rollout', () => {
    expect(
      describeNextBlocker({
        step: ONBOARDING_STEP.invite,
        releaseTypeAvailable: true,
        whereStuckCount: 1,
        hasStage: true,
        hasTitle: true,
        dateValid: true,
        hasReleaseArtist: true,
        hasName: false,
        hasEmail: false,
        passwordLongEnough: false,
        needsArtistName: false,
        hasArtistName: false,
      })
    ).toBeNull();
  });

  it('the wizard marks the gate skipped from both team-step exits that send nothing', () => {
    const page = code('app/onboarding/OnboardingPageClient.tsx');
    expect(page.match(/markOnboardingInviteSkipped\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(page).toContain('{inviteLabels.skip}');
  });

  it('the in-app gate honours the first session and the onboarding skip', () => {
    const gate = code('components/app/InviteGate.tsx');
    expect(gate).toContain('isInviteGateHeldBack(');
    expect(gate).toContain('inFirstSession: isInFirstSession()');
    expect(gate).toContain('INVITE_GATE_ONBOARDING_SKIP_KEY');
  });
});

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

  it('asks for push permission only on the toggle tap, never on step load', () => {
    const step = code('components/onboarding/OnboardingOptInStep.tsx');
    const beforeTap = step.slice(0, step.indexOf('const togglePush'));
    expect(beforeTap).not.toContain('requestPermission');
    expect(beforeTap).not.toContain("'push.request'");
    expect(beforeTap).not.toContain('enablePush(');
    expect(step).toContain('markPushAskedInOnboarding()');
  });

  it('the wizard attaches the choices only after the account exists', () => {
    const page = code('app/onboarding/OnboardingPageClient.tsx');
    const handoff = page.slice(page.indexOf('const runPostSignupHandoff'));
    expect(handoff.indexOf("fetch('/api/releases'")).toBeGreaterThan(-1);
    expect(handoff.indexOf('await attachOnboardingOptIn(accessToken)')).toBeGreaterThan(
      handoff.indexOf("fetch('/api/releases'")
    );
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
    expect(page).toContain('setReferralInput((current) => current || remembered)');
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
    const gate = page.slice(page.indexOf('const canAdvance'), page.indexOf('const nextHint'));
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
    expect(PAYWALL_HEADLINE).toBe('Run your next release like a pro.');
    expect(PAYWALL_LOGOS_LINE).toBe('Shaped with managers from');
    const ui = code('components/onboarding/OnboardingPaywall.tsx') + code('lib/onboarding-paywall.ts');
    expect(ui).not.toMatch(/trusted by/i);
    expect(ui).not.toMatch(/save 55/i);
  });

  it('pre-selects the plan from the persona', () => {
    expect(paywallTierForPersona('independent_artist')).toBe('solo');
    expect(paywallTierForPersona('music_manager')).toBe('manager');
    expect(paywallTierForPersona('artist_team')).toBe('manager');
    expect(paywallTierForPersona('other')).toBe('manager');
    expect(paywallTierForPersona('label_ar')).toBe('label');
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
    expect(paywallTrialLine(TEAM_TRIAL_DAYS)).toBe('Start your 3-day free trial, cancel anytime.');
    const ui = code('components/onboarding/OnboardingPaywall.tsx');
    expect(ui).toContain('<TierPlanPicker');
    expect(ui).not.toMatch(/₦\s?\d/);
    expect(ui).toContain('isIOSApp()');
    expect(ui).toContain('SALES_WHATSAPP_URL');
    // No skip, no close: the only button forward is the trial.
    expect(ui).not.toMatch(/>\s*(Skip|Not now|Close)\b/);
    expect(ui).not.toContain('/start-trial');
  });

  it('remembers the plan they picked for the billing wall', () => {
    const now = 1_800_000_000_000;
    expect(parsePaywallPlanChoice(JSON.stringify({ tier: 'label', interval: 'annual', at: now }), now)).toEqual({
      tier: 'label',
      interval: 'annual',
    });
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

describe('plan preview', () => {
  const now = Date.parse('2026-10-14T09:00:00Z');

  it('lays a single out week by week from the release date, release week marked', () => {
    const preview = buildOnboardingPlanPreview({ releaseType: 'single', releaseDate: '2027-01-15', now })!;
    expect(preview.templateId).toBe('single_v0.3');
    expect(preview.weeks[0].isCatchUp).toBe(false);
    expect(preview.weeks[0].label).toMatch(/^Week of /);
    expect(preview.weeks.filter((week) => week.isReleaseWeek)).toHaveLength(1);
    for (const week of preview.weeks) expect(week.tasks.length).toBeLessThanOrEqual(2);
    // Weeks run in date order.
    const starts = preview.weeks.map((week) => week.startsOn!);
    expect([...starts].sort()).toEqual(starts);
  });

  it('folds weeks already behind today into one catch-up group', () => {
    const preview = buildOnboardingPlanPreview({ releaseType: 'single', releaseDate: '2026-11-01', now })!;
    expect(preview.weeks[0].isCatchUp).toBe(true);
    expect(preview.weeks.filter((week) => week.isCatchUp)).toHaveLength(1);
  });

  it('returns null without a usable date', () => {
    expect(buildOnboardingPlanPreview({ releaseType: 'single', releaseDate: '', now })).toBeNull();
  });
});

describe('welcome screen (URG-251 Part 5)', () => {
  it('counts only a stored value as seen', () => {
    expect(isWelcomeSeenValue(null)).toBe(false);
    expect(isWelcomeSeenValue('')).toBe(false);
    expect(isWelcomeSeenValue('1800000000000')).toBe(true);
  });

  it('opens none of the offers the first session keeps quiet', () => {
    const welcome = code('components/onboarding/OnboardingWelcome.tsx');
    for (const forbidden of ['useShareStore', 'startTour', 'InstallAppPrompt', 'startFirstSession', 'useTourStore']) {
      expect(welcome).not.toContain(forbidden);
    }
    expect(welcome).toContain('Sparkles');
    expect(welcome).toContain('ContactIcon');
  });
});
